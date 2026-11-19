import { createHash } from "node:crypto";
import { Router } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { env } from "../env.js";
import { prisma } from "../db.js";
import { makeInstagramMediaUrl } from "../services/instagram.js";
import { renderDesignPageSvg } from "@united-technologies/shared/design-document";

export const approvalEmailRouter = Router();
const responseSchema = z.object({ status: z.enum(["APPROVED", "CHANGES_REQUESTED"]), comment: z.string().trim().max(1000).default("") });
const batchClaimsSchema = z.object({
  workspaceId: z.string().min(1),
  approvalIds: z.array(z.string().min(1)).min(1).max(50).refine((ids) => new Set(ids).size === ids.length),
  purpose: z.literal("approval-batch"),
});
const batchIssuer = "united-technologies-approval-batch";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function containsRenderedVideo(value: Prisma.JsonValue) {
  return Array.isArray(value) && value.some((media) =>
    media !== null && typeof media === "object" && !Array.isArray(media) &&
    media.type === "video" && typeof media.storageKey === "string",
  );
}

function getBatchClaims(token: string) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: batchIssuer }) as JwtPayload;
  return batchClaimsSchema.parse(payload);
}

approvalEmailRouter.get("/batch/:token", async (req, res, next) => {
  try {
    const token = z.string().min(32).max(4096).parse(req.params.token);
    const claims = getBatchClaims(token);
    const approvals = await prisma.approval.findMany({
      where: {
        id: { in: claims.approvalIds },
        workspaceId: claims.workspaceId,
        status: "PENDING",
      },
      select: {
        id: true,
        post: {
          select: {
            title: true,
            caption: true,
            designId: true,
            scheduledAt: true,
            timezone: true,
            brand: { select: { name: true } },
            targets: { select: { id: true, platform: true, media: true } },
          },
        },
      },
    });
    if (approvals.length === 0) {
      res.status(410).json({ error: "This approval batch has expired or has already been handled." });
      return;
    }
    const designIds = approvals.flatMap(({ post }) => post.designId ? [post.designId] : []);
    const designs = designIds.length
      ? await prisma.design.findMany({
          where: { id: { in: designIds }, workspaceId: claims.workspaceId },
          select: { id: true, previewUrl: true, designJson: true },
        })
      : [];
    const previewByDesign = new Map(designs.map((design) => {
      const json = design.designJson;
      const document = json && typeof json === "object" && !Array.isArray(json) && "document" in json ? json.document : null;
      const previewPages = document && typeof document === "object" && !Array.isArray(document) && "pages" in document && Array.isArray(document.pages)
        ? document.pages.flatMap((page, index) => {
            try { return [{ index, url: renderDesignPageSvg({ ...document, pages: [page] }) }]; }
            catch { return []; }
          })
        : [];
      return [design.id, { previewUrl: design.previewUrl, previewPages }];
    }));
    res.setHeader("Cache-Control", "no-store");
    res.json({
      approvals: approvals.map(({ id, post }) => {
        const videoTarget = post.targets.find((target) => containsRenderedVideo(target.media));
        return {
          id,
          title: post.title,
          caption: post.caption,
          designId: post.designId,
          scheduledAt: post.scheduledAt,
          timezone: post.timezone,
          brand: post.brand,
          targets: post.targets.map(({ id: targetId, platform }) => ({ id: targetId, platform })),
          previewUrl: post.designId ? previewByDesign.get(post.designId)?.previewUrl ?? null : null,
          previewPages: post.designId ? previewByDesign.get(post.designId)?.previewPages ?? [] : [],
          videoPreviewUrl: videoTarget ? makeInstagramMediaUrl(videoTarget.id, 0, "video") : null,
        };
      }),
    });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError || error instanceof z.ZodError) {
      res.status(410).json({ error: "This approval batch link is invalid or has expired." });
      return;
    }
    next(error);
  }
});

approvalEmailRouter.post("/batch/:token", async (req, res, next) => {
  try {
    const token = z.string().min(32).max(4096).parse(req.params.token);
    const claims = getBatchClaims(token);
    const input = responseSchema.parse(req.body);
    const approvals = await prisma.approval.findMany({
      where: {
        id: { in: claims.approvalIds },
        workspaceId: claims.workspaceId,
        status: "PENDING",
      },
      select: {
        id: true,
        postId: true,
        post: {
          select: {
            brandId: true,
            scheduledAt: true,
            targets: { select: { id: true, workspaceId: true, resellerId: true, platform: true } },
          },
        },
      },
    });
    if (approvals.length === 0) {
      res.status(410).json({ error: "This approval batch has expired or has already been handled." });
      return;
    }
    if (input.status === "APPROVED" && approvals.some(({ post }) => !post.scheduledAt || post.targets.length === 0)) {
      res.status(409).json({ error: "Every post in this batch must have a publishing date and at least one destination." });
      return;
    }
    const accountByBrandId = new Map<string, string>();
    if (input.status === "APPROVED") {
      const instagramApprovals = approvals.filter(({ post }) => post.targets.some(({ platform }) => platform === "Instagram"));
      const brandIds = [...new Set(instagramApprovals.map(({ post }) => post.brandId))];
      const accounts = await prisma.socialAccount.findMany({
        where: { workspaceId: claims.workspaceId, provider: "instagram", status: "CONNECTED" },
        orderBy: { createdAt: "asc" },
        select: { id: true, brandId: true },
      });
      for (const brandId of brandIds) {
        const account = accounts.find((item) => item.brandId === brandId) ?? accounts.find((item) => item.brandId === null);
        if (!account) {
          res.status(409).json({ error: "Connect an Instagram Professional account for every brand in this batch before approving it for live publishing." });
          return;
        }
        accountByBrandId.set(brandId, account.id);
      }
      if (accountByBrandId.size !== brandIds.length) {
        res.status(409).json({ error: "An Instagram account could not be matched to every brand in this batch." });
        return;
      }
    }
    try {
      await prisma.$transaction(async (tx) => {
        for (const approval of approvals) {
          const updated = await tx.approval.updateMany({
            where: { id: approval.id, workspaceId: claims.workspaceId, status: "PENDING" },
            data: {
              status: input.status,
              comment: input.comment || null,
              emailTokenHash: null,
              emailTokenExpiresAt: null,
            },
          });
          if (updated.count !== 1) throw new Error("APPROVAL_BATCH_ALREADY_HANDLED");
          if (input.status === "APPROVED") {
            const instagramTargets = approval.post.targets.filter(({ platform }) => platform === "Instagram");
            const otherTargets = approval.post.targets.filter(({ platform }) => platform !== "Instagram");
            await tx.post.update({ where: { id: approval.postId }, data: { status: instagramTargets.length ? "SCHEDULED" : "DRAFT" } });
            if (instagramTargets.length) await tx.postTarget.updateMany({
              where: { postId: approval.postId, workspaceId: claims.workspaceId, platform: "Instagram" },
              data: { status: "PENDING", socialAccountId: accountByBrandId.get(approval.post.brandId)! },
            });
            if (otherTargets.length) await tx.postTarget.updateMany({
              where: { postId: approval.postId, workspaceId: claims.workspaceId, platform: { not: "Instagram" } },
              data: { status: "DEMO_ONLY", socialAccountId: null },
            });
            if (instagramTargets.length) await tx.publishJob.createMany({
              data: instagramTargets.map((target) => ({
                workspaceId: target.workspaceId,
                resellerId: target.resellerId,
                postId: approval.postId,
                targetId: target.id,
                runAt: approval.post.scheduledAt!,
              })),
              skipDuplicates: true,
            });
          } else {
            await tx.post.update({ where: { id: approval.postId }, data: { status: "DRAFT" } });
            await tx.postTarget.updateMany({
              where: { postId: approval.postId, workspaceId: claims.workspaceId, status: "PENDING" },
              data: { status: "DRAFT" },
            });
          }
          await tx.auditLog.create({
            data: {
              workspaceId: claims.workspaceId,
              action: input.status === "APPROVED" ? "post.approved_by_email" : "post.changes_requested_by_email",
              targetType: "post",
              targetId: approval.postId,
              metadata: { approvalId: approval.id, comment: input.comment, batch: true },
            },
          });
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message === "APPROVAL_BATCH_ALREADY_HANDLED") {
        res.status(409).json({ error: "At least one post in this batch has already been handled. Refresh the review link to check its status." });
        return;
      }
      throw error;
    }
    const liveCount = input.status === "APPROVED" ? approvals.filter(({ post }) => post.targets.some(({ platform }) => platform === "Instagram")).length : 0;
    res.json({ ok: true, status: input.status, count: approvals.length, queuedForInstagram: liveCount, draftOnly: input.status === "APPROVED" ? approvals.length - liveCount : 0 });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError || error instanceof z.ZodError) {
      res.status(410).json({ error: "This approval batch link is invalid or has expired." });
      return;
    }
    next(error);
  }
});

approvalEmailRouter.post("/batch/:token/item/:approvalId", async (req, res, next) => {
  try {
    const token = z.string().min(32).max(4096).parse(req.params.token);
    const approvalId = z.string().min(1).parse(req.params.approvalId);
    const claims = getBatchClaims(token);
    if (!claims.approvalIds.includes(approvalId)) {
      res.status(404).json({ error: "This post is not part of the review batch." });
      return;
    }
    const input = responseSchema.parse(req.body);
    const approval = await prisma.approval.findFirst({
      where: { id: approvalId, workspaceId: claims.workspaceId, status: "PENDING" },
      select: { id: true, postId: true, post: { select: { brandId: true, scheduledAt: true, targets: { select: { id: true, workspaceId: true, resellerId: true, platform: true } } } } },
    });
    if (!approval) {
      res.status(410).json({ error: "This post has already been reviewed." });
      return;
    }
    let accountId: string | null = null;
    if (input.status === "APPROVED") {
      if (!approval.post.scheduledAt || approval.post.targets.length === 0) {
        res.status(409).json({ error: "This item needs a publishing date and destination before it can be approved." });
        return;
      }
      if (approval.post.targets.some(({ platform }) => platform === "Instagram")) {
        const account = await prisma.socialAccount.findFirst({
          where: { workspaceId: claims.workspaceId, provider: "instagram", status: "CONNECTED", OR: [{ brandId: approval.post.brandId }, { brandId: null }] },
          orderBy: [{ brandId: "desc" }, { createdAt: "asc" }],
          select: { id: true },
        });
        if (!account) {
          res.status(409).json({ error: "Connect an Instagram Professional account before approving this post." });
          return;
        }
        accountId = account.id;
      }
    }
    await prisma.$transaction(async (tx) => {
      const updated = await tx.approval.updateMany({
        where: { id: approval.id, workspaceId: claims.workspaceId, status: "PENDING" },
        data: { status: input.status, comment: input.comment || null },
      });
      if (updated.count !== 1) throw new Error("APPROVAL_ALREADY_HANDLED");
      if (input.status === "APPROVED") {
        const instagramTargets = approval.post.targets.filter(({ platform }) => platform === "Instagram");
        const otherTargets = approval.post.targets.filter(({ platform }) => platform !== "Instagram");
        await tx.post.update({ where: { id: approval.postId }, data: { status: instagramTargets.length ? "SCHEDULED" : "DRAFT" } });
        if (instagramTargets.length) await tx.postTarget.updateMany({ where: { postId: approval.postId, workspaceId: claims.workspaceId, platform: "Instagram" }, data: { status: "PENDING", socialAccountId: accountId } });
        if (otherTargets.length) await tx.postTarget.updateMany({ where: { postId: approval.postId, workspaceId: claims.workspaceId, platform: { not: "Instagram" } }, data: { status: "DEMO_ONLY", socialAccountId: null } });
        if (instagramTargets.length) await tx.publishJob.createMany({
          data: instagramTargets.map((target) => ({ workspaceId: target.workspaceId, resellerId: target.resellerId, postId: approval.postId, targetId: target.id, runAt: approval.post.scheduledAt! })),
          skipDuplicates: true,
        });
      } else {
        await tx.post.update({ where: { id: approval.postId }, data: { status: "DRAFT" } });
        await tx.postTarget.updateMany({ where: { postId: approval.postId, workspaceId: claims.workspaceId, status: "PENDING" }, data: { status: "DRAFT" } });
      }
      await tx.auditLog.create({ data: {
        workspaceId: claims.workspaceId,
        action: input.status === "APPROVED" ? "post.approved_by_email" : "post.changes_requested_by_email",
        targetType: "post", targetId: approval.postId,
        metadata: { approvalId: approval.id, comment: input.comment, batch: true, individual: true },
      } });
    });
    const draftOnly = input.status === "APPROVED" && !approval.post.targets.some(({ platform }) => platform === "Instagram");
    res.json({ ok: true, status: input.status, approvalId, queuedForInstagram: input.status === "APPROVED" && !draftOnly ? 1 : 0, draftOnly: draftOnly ? 1 : 0 });
  } catch (error) {
    if (error instanceof Error && error.message === "APPROVAL_ALREADY_HANDLED") {
      res.status(409).json({ error: "This post has already been reviewed." });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError || error instanceof z.ZodError) {
      res.status(410).json({ error: "This approval batch link is invalid or has expired." });
      return;
    }
    next(error);
  }
});

approvalEmailRouter.get("/:token", async (req, res, next) => {
  try {
    const token = z.string().min(32).max(128).parse(req.params.token);
    const approval = await prisma.approval.findFirst({
      where: { emailTokenHash: tokenHash(token), emailTokenExpiresAt: { gt: new Date() }, status: "PENDING" },
      select: {
        id: true,
        workspaceId: true,
        post: { select: { title: true, caption: true, designId: true, scheduledAt: true, timezone: true, brand: { select: { name: true } }, targets: { select: { platform: true } } } },
      },
    });
    if (!approval) {
      res.status(410).json({ error: "This approval link has expired or has already been used." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    const design = approval.post.designId ? await prisma.design.findFirst({ where: { id: approval.post.designId, workspaceId: approval.workspaceId }, select: { previewUrl: true } }) : null;
    res.json({ approval: { id: approval.id, ...approval.post, previewUrl: design?.previewUrl ?? null } });
  } catch (error) {
    next(error);
  }
});

approvalEmailRouter.post("/:token", async (req, res, next) => {
  try {
    const token = z.string().min(32).max(128).parse(req.params.token);
    const input = responseSchema.parse(req.body);
    const hash = tokenHash(token);
    const existing = await prisma.approval.findFirst({
      where: { emailTokenHash: hash, emailTokenExpiresAt: { gt: new Date() }, status: "PENDING" },
      select: { id: true, workspaceId: true, postId: true, post: { select: { scheduledAt: true, targets: { select: { id: true, workspaceId: true, resellerId: true, platform: true } } } } },
    });
    if (!existing) {
      res.status(410).json({ error: "This approval link has expired or has already been used." });
      return;
    }
    let instagramAccountId: string | null = null;
    if (input.status === "APPROVED" && existing.post.scheduledAt) {
      if (existing.post.targets.some((target) => target.platform !== "Instagram")) {
        res.status(409).json({ error: "Live publishing is currently connected for Instagram only. Update the post channels before approving it for publishing." });
        return;
      }
      const account = await prisma.socialAccount.findFirst({
        where: { workspaceId: existing.workspaceId, provider: "instagram", status: "CONNECTED" },
        select: { id: true },
      });
      if (!account) {
        res.status(409).json({ error: "Connect an Instagram Professional account before approving this scheduled post for live publishing." });
        return;
      }
      instagramAccountId = account.id;
    }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.approval.updateMany({
        where: { id: existing.id, status: "PENDING", emailTokenHash: hash, emailTokenExpiresAt: { gt: new Date() } },
        data: { status: input.status, comment: input.comment || null, emailTokenHash: null, emailTokenExpiresAt: null },
      });
      if (result.count !== 1) return false;
      if (input.status === "APPROVED" && existing.post.scheduledAt) {
        await tx.post.update({ where: { id: existing.postId }, data: { status: "SCHEDULED" } });
        await tx.postTarget.updateMany({ where: { postId: existing.postId, workspaceId: existing.workspaceId, platform: "Instagram" }, data: { status: "PENDING", socialAccountId: instagramAccountId } });
        await tx.publishJob.createMany({
          data: existing.post.targets.map((target) => ({
            workspaceId: target.workspaceId,
            resellerId: target.resellerId,
            postId: existing.postId,
            targetId: target.id,
            runAt: existing.post.scheduledAt!,
          })),
          skipDuplicates: true,
        });
      } else if (input.status === "CHANGES_REQUESTED") {
        await tx.post.update({ where: { id: existing.postId }, data: { status: "DRAFT" } });
        await tx.postTarget.updateMany({ where: { postId: existing.postId, workspaceId: existing.workspaceId, status: "PENDING" }, data: { status: "DRAFT" } });
      }
      await tx.auditLog.create({
        data: {
          workspaceId: existing.workspaceId,
          action: input.status === "APPROVED" ? "post.approved_by_email" : "post.changes_requested_by_email",
          targetType: "post",
          targetId: existing.postId,
          metadata: { approvalId: existing.id, comment: input.comment },
        },
      });
      return true;
    });
    if (!updated) {
      res.status(409).json({ error: "This approval has already been handled." });
      return;
    }
    res.json({ ok: true, status: input.status });
  } catch (error) {
    next(error);
  }
});
