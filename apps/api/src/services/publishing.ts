import { prisma } from "../db.js";
import { publishInstagramPost } from "./instagram.js";
import { publishFacebookPagePost } from "./facebook.js";

type PublishResult = { platformPostId: string; publishedAt: Date; publishedUrl?: string | null };

type Publisher = {
  publish(input: { jobId: string; platform: string; caption: string }): Promise<PublishResult>;
};

const maxAttempts = 3;
const publishHeartbeatIntervalMs = 5_000;

export function makeDemoPublishResult(jobId: string, publishedAt = new Date()): PublishResult {
  return { platformPostId: `demo_${jobId}`, publishedAt };
}

export function publishRetryDelayMs(attempt: number) {
  return Math.min(60_000 * (2 ** attempt), 30 * 60_000);
}

async function notifyWorkspace(workspaceId: string, kind: string, title: string, body: string) {
  try {
    const members = await prisma.membership.findMany({ where: { workspaceId }, select: { userId: true } });
    if (!members.length) return;
    await prisma.notification.createMany({
      data: members.map(({ userId }) => ({ workspaceId, userId, kind, title, body })),
    });
  } catch (error) {
    console.error(`Could not create ${kind} notifications for workspace ${workspaceId}.`, error);
  }
}

function customerPublishError(error: unknown) {
  const detail = error instanceof Error ? error.message : "";
  if (/expired|reconnect/i.test(detail)) return "The connected account needs attention. Reconnect it in Social Accounts, then retry.";
  if (/unsupported|not supported/i.test(detail)) return "Live publishing is not available for this platform yet.";
  if (/media|video|image|carousel/i.test(detail)) return "The platform could not accept this media. Check the file format and platform requirements, then retry.";
  return "The platform could not publish this post. Check the connected account and try again.";
}

const demoPublisher: Publisher = {
  async publish({ jobId }) {
    return makeDemoPublishResult(jobId);
  },
};

async function updatePostStatus(postId: string) {
  const targets = await prisma.postTarget.findMany({
    where: { postId },
    select: { status: true },
  });
  const statuses = targets.map((target) => target.status);
  const status = statuses.every((targetStatus) => targetStatus === "PUBLISHED")
    ? "PUBLISHED"
    : statuses.some((targetStatus) => targetStatus === "FAILED")
      ? statuses.some((targetStatus) => targetStatus === "PUBLISHED") ? "NEEDS_ATTENTION" : "FAILED"
      : "PUBLISHING";
  await prisma.post.update({ where: { id: postId }, data: { status } });
}

export async function publishDueJobs(postId?: string) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 30_000);
  const staleJobs = await prisma.publishJob.findMany({
    where: { status: "PROCESSING", lockedAt: { lt: staleBefore } },
    select: { id: true, postId: true, targetId: true, workspaceId: true, attempts: true },
  });
  for (const staleJob of staleJobs) {
    const terminal = staleJob.attempts >= maxAttempts;
    const recovered = await prisma.publishJob.updateMany({
      where: { id: staleJob.id, status: "PROCESSING", lockedAt: { lt: staleBefore } },
      data: {
        status: terminal ? "FAILED" : "QUEUED",
        runAt: terminal ? now : new Date(Date.now() + publishRetryDelayMs(staleJob.attempts)),
        lockedAt: null,
        lastError: terminal
          ? "Publishing could not finish after several attempts. Retry the post or contact support."
          : "The publishing worker stopped responding. The post is queued for another attempt.",
      },
    });
    if (recovered.count !== 1 || !terminal) continue;
    if (staleJob.targetId) {
      await prisma.postTarget.updateMany({
        where: { id: staleJob.targetId, workspaceId: staleJob.workspaceId, status: "PUBLISHING" },
        data: { status: "FAILED", error: "Publishing could not finish after several attempts. Retry the post or contact support." },
      });
    }
    await updatePostStatus(staleJob.postId);
  }
  const jobs = await prisma.publishJob.findMany({
    where: { status: "QUEUED", runAt: { lte: now }, lockedAt: null, ...(postId ? { postId } : {}) },
    orderBy: [{ runAt: "asc" }, { createdAt: "asc" }],
    take: 20,
    select: { id: true, postId: true, targetId: true, attempts: true, workspaceId: true },
  });

  for (const job of jobs) {
    const locked = await prisma.publishJob.updateMany({
      where: { id: job.id, status: "QUEUED", lockedAt: null, runAt: { lte: now } },
      data: { status: "PROCESSING", lockedAt: now, attempts: { increment: 1 } },
    });
    if (locked.count === 0) continue;

    let heartbeatInFlight = false;
    const heartbeat = setInterval(() => {
      if (heartbeatInFlight) return;
      heartbeatInFlight = true;
      void prisma.publishJob.updateMany({
        where: { id: job.id, status: "PROCESSING" },
        data: { lockedAt: new Date() },
      }).catch((error: unknown) => {
        console.error(`Could not update heartbeat for publish job ${job.id}.`, error);
      }).finally(() => {
        heartbeatInFlight = false;
      });
    }, publishHeartbeatIntervalMs);

    try {
      if (!job.targetId) throw new Error("Publish job has no target.");
      const target = await prisma.postTarget.findFirst({
        where: { id: job.targetId, workspaceId: job.workspaceId },
        select: { id: true, platform: true, captionOverride: true, socialAccountId: true, media: true },
      });
      if (!target) throw new Error("Publish target was not found in the job workspace.");
      let result: PublishResult;
      if (target.socialAccountId) {
        if (target.platform === "Instagram") {
          const account = await prisma.socialAccount.findFirst({
            where: { id: target.socialAccountId, workspaceId: job.workspaceId, provider: "instagram", status: "CONNECTED" },
            select: { id: true, providerAccountId: true, encryptedTokens: true, tokenExpiresAt: true },
          });
          if (!account) throw new Error("The connected Instagram account is no longer available. Reconnect it and retry.");
          result = await publishInstagramPost({
            targetId: target.id,
            socialAccountId: account.id,
            providerAccountId: account.providerAccountId,
            encryptedTokens: account.encryptedTokens,
            tokenExpiresAt: account.tokenExpiresAt,
            caption: target.captionOverride ?? "",
            media: target.media,
          });
        } else if (target.platform === "Facebook") {
          const account = await prisma.socialAccount.findFirst({
            where: { id: target.socialAccountId, workspaceId: job.workspaceId, provider: "facebook", status: "CONNECTED" },
            select: { providerAccountId: true, encryptedTokens: true },
          });
          if (!account) throw new Error("The connected Facebook Page is no longer available. Reconnect it and retry.");
          result = await publishFacebookPagePost({
            pageId: account.providerAccountId,
            encryptedPageToken: account.encryptedTokens,
            targetId: target.id,
            caption: target.captionOverride ?? "",
            media: target.media,
          });
        } else {
          throw new Error(`Live publishing is not supported for ${target.platform} yet.`);
        }
      } else {
        result = await demoPublisher.publish({
          jobId: job.id,
          platform: target.platform,
          caption: target.captionOverride ?? "",
        });
      }
      await prisma.$transaction(async (tx) => {
        await tx.postTarget.update({
          where: { id: target.id },
          data: {
            status: "PUBLISHED",
            platformPostId: result.platformPostId,
            publishedUrl: result.publishedUrl ?? null,
            publishedAt: result.publishedAt,
            error: null,
          },
        });
        await tx.publishJob.update({
          where: { id: job.id },
          data: { status: "SUCCEEDED", lockedAt: null, lastError: null },
        });
      });
      await updatePostStatus(job.postId);
      await notifyWorkspace(job.workspaceId, "publish_success", "Post published", `Your ${target.platform} post was published successfully.`);
    } catch (error) {
      const attempts = job.attempts + 1;
      const terminal = attempts >= maxAttempts;
      const message = customerPublishError(error);
      await prisma.$transaction(async (tx) => {
        await tx.publishJob.update({
          where: { id: job.id },
          data: {
            status: terminal ? "FAILED" : "QUEUED",
            runAt: new Date(Date.now() + publishRetryDelayMs(attempts)),
            lockedAt: null,
            lastError: message,
          },
        });
        if (terminal && job.targetId) {
          await tx.postTarget.update({
            where: { id: job.targetId },
            data: { status: "FAILED", error: message },
          });
        }
      });
      if (terminal) {
        await updatePostStatus(job.postId);
        await notifyWorkspace(job.workspaceId, "publish_failed", "Publishing failed", `${message} Open Posts to review the failed ${job.targetId ? "post" : "publishing job"}.`);
      }
      console.error(`Publish job ${job.id} failed on attempt ${attempts}.`, error);
    } finally {
      clearInterval(heartbeat);
    }
  }
}
