import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../env.js";
import { prisma } from "../db.js";
import { verifyMetaSignedRequest } from "../services/meta-signed-request.js";

const router = Router();
const statusLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const callbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function configuredMetaSecrets() {
  return [...new Set([env.FACEBOOK_APP_SECRET, env.INSTAGRAM_APP_SECRET].filter((secret): secret is string => Boolean(secret)))];
}

function signedRequestFromBody(body: unknown) {
  return isRecord(body) ? body.signed_request : undefined;
}

async function removeConnectedAccountData(userId: string, confirmationCode?: string) {
  const now = new Date();
  const confirmationCodeHash = confirmationCode
    ? createHash("sha256").update(confirmationCode).digest("hex")
    : null;

  await prisma.$transaction(async (tx) => {
    const accounts = await tx.socialAccount.findMany({
      where: {
        provider: { in: ["instagram", "facebook", "facebook-user"] },
        OR: [
          { providerUserId: userId },
          { provider: "instagram", providerAccountId: userId },
        ],
      },
      select: { id: true, provider: true, providerAccountId: true },
    });
    const accountIds = accounts.map(({ id }) => id);
    const accountIdentifiers = [...new Set(accounts.flatMap(({ id, provider, providerAccountId }) =>
      provider === "facebook-user" ? [id] : [id, providerAccountId],
    ))];

    if (accountIds.length) {
      const targets = await tx.postTarget.findMany({
        where: { socialAccountId: { in: accountIds } },
        select: { id: true, postId: true },
      });
      const targetIds = targets.map(({ id }) => id);
      const postIds = [...new Set(targets.map(({ postId }) => postId))];

      if (targetIds.length) {
        await tx.publishJob.updateMany({
          where: { targetId: { in: targetIds }, status: "QUEUED" },
          data: { status: "CANCELLED" },
        });
        await tx.postTarget.updateMany({
          where: { id: { in: targetIds } },
          data: {
            socialAccountId: null,
            platformPostId: null,
            publishedUrl: null,
            status: "DISCONNECTED",
            error: null,
          },
        });
      }
      if (postIds.length) {
        await tx.comment.deleteMany({ where: { postId: { in: postIds } } });
        await tx.analyticsSnapshot.deleteMany({ where: { postId: { in: postIds } } });
      }
      await tx.analyticsSnapshot.deleteMany({ where: { accountId: { in: accountIdentifiers } } });
      await tx.inboxItem.deleteMany({ where: { accountId: { in: accountIdentifiers } } });
      await tx.socialAccount.deleteMany({ where: { id: { in: accountIds } } });
    }

    if (confirmationCodeHash) {
      await tx.metaDataDeletionRequest.deleteMany({ where: { expiresAt: { lte: now } } });
      await tx.metaDataDeletionRequest.create({
        data: {
          confirmationCodeHash,
          completedAt: now,
          expiresAt: new Date(now.getTime() + statusLifetimeMs),
        },
      });
    }
  });
}

function verifiedUserId(body: unknown) {
  const secrets = configuredMetaSecrets();
  if (!secrets.length) return { error: "Meta callback verification is not configured.", status: 503 as const };
  const signedRequest = verifyMetaSignedRequest(signedRequestFromBody(body), secrets);
  if (!signedRequest) return { error: "The Meta signed request is invalid.", status: 401 as const };
  return { userId: signedRequest.userId };
}

router.post("/deauthorize", callbackLimiter, async (req, res, next) => {
  try {
    const verified = verifiedUserId(req.body);
    if ("error" in verified) {
      res.status(verified.status).json({ error: verified.error });
      return;
    }
    await removeConnectedAccountData(verified.userId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/data-deletion", callbackLimiter, async (req, res, next) => {
  try {
    const verified = verifiedUserId(req.body);
    if ("error" in verified) {
      res.status(verified.status).json({ error: verified.error });
      return;
    }
    const confirmationCode = randomBytes(32).toString("hex");
    await removeConnectedAccountData(verified.userId, confirmationCode);
    const statusUrl = new URL("/data-deletion/status", env.WEB_ORIGIN);
    statusUrl.searchParams.set("confirmation_code", confirmationCode);
    res.json({ url: statusUrl.toString(), confirmation_code: confirmationCode });
  } catch (error) {
    next(error);
  }
});

router.get("/data-deletion/status/:confirmationCode", async (req, res, next) => {
  try {
    const code = req.params.confirmationCode;
    if (!/^[a-f\d]{64}$/i.test(code)) {
      res.status(404).json({ error: "Deletion status was not found or has expired." });
      return;
    }
    const confirmationCodeHash = createHash("sha256").update(code).digest("hex");
    const request = await prisma.metaDataDeletionRequest.findFirst({
      where: { confirmationCodeHash, expiresAt: { gt: new Date() } },
      select: { status: true, completedAt: true },
    });
    if (!request) {
      res.status(404).json({ error: "Deletion status was not found or has expired." });
      return;
    }
    res.json({ status: request.status.toLowerCase(), completedAt: request.completedAt.toISOString() });
  } catch (error) {
    next(error);
  }
});

export { router as metaRouter };
