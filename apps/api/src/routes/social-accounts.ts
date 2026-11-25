import { Router } from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { z } from "zod";
import { env } from "../env.js";
import { prisma } from "../db.js";
import { requireAuth, requireCompleteBrandProfile, requireWritableWorkspace, requireWorkspace } from "../middleware/auth.js";
import { exchangeFacebookCode, isFacebookConfigured, makeFacebookAuthorizationUrl } from "../services/facebook.js";
import {
  exchangeInstagramCode,
  convertInstagramSvgToJpeg,
  isInstagramConfigured,
  makeInstagramAuthorizationUrl,
  convertInstagramImageToJpeg,
  verifyInstagramMediaSignature,
  assertInstagramMediaHostingAvailable,
} from "../services/instagram.js";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fromObjectStorageKey, getStoredObject } from "../services/object-storage.js";

const router = Router();
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function socialAccountsPage(platform: "instagram" | "facebook", status: "connected" | "cancelled" | "failed") {
  const url = new URL("/dashboard/social-accounts", env.WEB_ORIGIN);
  url.searchParams.set(platform, status);
  return url.toString();
}

router.get("/instagram-media/:targetId", async (req, res, next) => {
  try {
    if (!env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
      res.status(503).json({ error: "Social media security is not configured." });
      return;
    }
    const targetId = req.params.targetId;
    const expires = req.query.expires;
    const signature = req.query.signature;
    const mediaType = req.query.type === undefined ? "image" : req.query.type;
    const mediaIndex = req.query.index === undefined ? 0 : z.coerce.number().int().min(0).max(9).parse(req.query.index);
    if ((mediaType !== "image" && mediaType !== "video") ||
      typeof expires !== "string" || typeof signature !== "string" ||
      !verifyInstagramMediaSignature(targetId, expires, signature, mediaIndex, mediaType)) {
      res.status(403).json({ error: "This media link is invalid or expired." });
      return;
    }
    const target = await prisma.postTarget.findUnique({
      where: { id: targetId },
      select: { media: true, workspaceId: true },
    });
    const media = Array.isArray(target?.media) ? target.media[mediaIndex] : null;
    if (!target || media === null) {
      res.status(404).json({ error: "The post image or carousel slide is no longer available." });
      return;
    }
    if (mediaType === "video") {
      if (typeof media !== "object" || Array.isArray(media) || media.type !== "video") {
        res.status(404).json({ error: "The rendered video is no longer available." });
        return;
      }
      if (typeof media.mediaAssetId === "string") {
        const asset = await prisma.mediaAsset.findFirst({
          where: {
            id: media.mediaAssetId,
            workspaceId: target.workspaceId,
            OR: [{ storageKey: "database-upload" }, { storageKey: { startsWith: "s3://" } }],
            mimeType: "video/mp4",
          },
          select: { fileData: true, storageKey: true },
        });
        if (!asset) {
          res.status(404).json({ error: "The imported video is no longer available." });
          return;
        }
        res.set({ "Cache-Control": "no-store", "Content-Type": "video/mp4", "X-Content-Type-Options": "nosniff" });
        const objectKey = fromObjectStorageKey(asset.storageKey);
        if (objectKey) {
          const object = await getStoredObject(objectKey);
          if (!object.Body) {
            res.status(404).json({ error: "The imported video is no longer available." });
            return;
          }
          if (object.ContentLength !== undefined) res.setHeader("Content-Length", object.ContentLength);
          await pipeline(Readable.from(object.Body.transformToWebStream() as AsyncIterable<Uint8Array>), res);
          return;
        }
        if (!asset.fileData) {
          res.status(404).json({ error: "The imported video is no longer available." });
          return;
        }
        res.send(Buffer.from(asset.fileData));
        return;
      }
      if (typeof media.storageKey !== "string") {
        res.status(404).json({ error: "The rendered video is no longer available." });
        return;
      }
      const root = path.resolve(apiRoot, "assets", "rendered");
      const file = path.resolve(root, media.storageKey);
      if (!file.startsWith(`${root}${path.sep}`)) {
        res.status(400).json({ error: "The saved video path is invalid." });
        return;
      }
      res.set({ "Cache-Control": "no-store", "Content-Type": "video/mp4", "X-Content-Type-Options": "nosniff" });
      res.sendFile(file, (error) => { if (error) next(error); });
      return;
    }
    if (typeof media === "object" && !Array.isArray(media) &&
      media.type === "image" && typeof media.mediaAssetId === "string") {
      const asset = await prisma.mediaAsset.findFirst({
        where: {
          id: media.mediaAssetId,
          workspaceId: target.workspaceId,
          OR: [{ storageKey: "database-upload" }, { storageKey: { startsWith: "s3://" } }],
          mimeType: { in: ["image/jpeg", "image/png", "image/webp"] },
        },
        select: { fileData: true, storageKey: true },
      });
      if (!asset) {
        res.status(404).json({ error: "The imported image is no longer available." });
        return;
      }
      const objectKey = fromObjectStorageKey(asset.storageKey);
      const imageBytes = objectKey
        ? await (await getStoredObject(objectKey)).Body?.transformToByteArray()
        : asset.fileData;
      if (!imageBytes) {
        res.status(404).json({ error: "The imported image is no longer available." });
        return;
      }
      const image = await convertInstagramImageToJpeg(Buffer.from(imageBytes));
      res.set({ "Cache-Control": "no-store", "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff" });
      res.send(image);
      return;
    }
    if (typeof media !== "string") {
      res.status(415).json({ error: "Instagram publishing needs a supported image preview." });
      return;
    }
    const match = /^data:image\/svg\+xml;charset=utf-8,(.+)$/s.exec(media);
    if (!match?.[1] || match[1].length > 2_000_000) {
      res.status(415).json({ error: "Instagram publishing needs a supported image preview." });
      return;
    }
    let svg: string;
    try {
      svg = decodeURIComponent(match[1]);
    } catch {
      res.status(415).json({ error: "The image preview could not be decoded." });
      return;
    }
    const image = await convertInstagramSvgToJpeg(svg);
    res.set({ "Cache-Control": "no-store", "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff" });
    res.send(image);
  } catch (error) {
    next(error);
  }
});

router.get("/instagram/callback", async (req, res) => {
  const error = req.query.error;
  if (typeof error === "string" && error) {
    res.redirect(socialAccountsPage("instagram", "cancelled"));
    return;
  }
  const code = req.query.code;
  const state = req.query.state;
  if (typeof code !== "string" || typeof state !== "string") {
    res.redirect(socialAccountsPage("instagram", "failed"));
    return;
  }

  try {
    const payload = jwt.verify(state, env.JWT_ACCESS_SECRET, { issuer: "united-technologies-instagram" }) as JwtPayload;
    const workspaceId = payload.workspaceId;
    if (typeof payload.sub !== "string" || typeof workspaceId !== "string" || payload.purpose !== "instagram-connect") {
      res.redirect(socialAccountsPage("instagram", "failed"));
      return;
    }
    const membership = await prisma.membership.findFirst({
      where: {
        userId: payload.sub,
        workspaceId,
        workspace: { status: "ACTIVE" },
      },
      select: { workspace: { select: { id: true, resellerId: true } } },
    });
    if (!membership) {
      res.redirect(socialAccountsPage("instagram", "failed"));
      return;
    }
    const account = await exchangeInstagramCode(code);
    const existing = await prisma.socialAccount.findUnique({
      where: { provider_providerAccountId: { provider: "instagram", providerAccountId: account.providerAccountId } },
      select: { id: true, workspaceId: true },
    });
    if (existing && existing.workspaceId !== membership.workspace.id) {
      console.error("Instagram account is already connected to a different workspace.");
      res.redirect(socialAccountsPage("instagram", "failed"));
      return;
    }
    await prisma.socialAccount.upsert({
      where: { provider_providerAccountId: { provider: "instagram", providerAccountId: account.providerAccountId } },
      create: {
        ...account,
        provider: "instagram",
        workspaceId: membership.workspace.id,
        resellerId: membership.workspace.resellerId,
        displayName: account.displayName,
      },
      update: {
        encryptedTokens: account.encryptedTokens,
        tokenExpiresAt: account.tokenExpiresAt,
        displayName: account.displayName,
        status: "CONNECTED",
      },
    });
    res.redirect(socialAccountsPage("instagram", "connected"));
  } catch (callbackError) {
    console.error("Instagram account connection failed.", callbackError);
    res.redirect(socialAccountsPage("instagram", "failed"));
  }
});

router.get("/facebook/callback", async (req, res) => {
  const error = req.query.error;
  if (typeof error === "string" && error) {
    res.redirect(socialAccountsPage("facebook", "cancelled"));
    return;
  }
  const code = req.query.code;
  const state = req.query.state;
  if (typeof code !== "string" || typeof state !== "string") {
    res.redirect(socialAccountsPage("facebook", "failed"));
    return;
  }

  try {
    const payload = jwt.verify(state, env.JWT_ACCESS_SECRET, { issuer: "united-technologies-facebook" }) as JwtPayload;
    const workspaceId = payload.workspaceId;
    if (typeof payload.sub !== "string" || typeof workspaceId !== "string" || payload.purpose !== "facebook-connect") {
      res.redirect(socialAccountsPage("facebook", "failed"));
      return;
    }
    const membership = await prisma.membership.findFirst({
      where: {
        userId: payload.sub,
        workspaceId,
        workspace: { status: "ACTIVE" },
      },
      select: { workspace: { select: { id: true, resellerId: true } } },
    });
    if (!membership) {
      res.redirect(socialAccountsPage("facebook", "failed"));
      return;
    }

    const connection = await exchangeFacebookCode(code);
    const pages = connection.pages;
    const existing = await prisma.socialAccount.findMany({
      where: {
        provider: "facebook",
        providerAccountId: { in: pages.map((page) => page.id) },
      },
      select: { providerAccountId: true, workspaceId: true },
    });
    if (existing.some((account) => account.workspaceId !== membership.workspace.id)) {
      console.error("A Facebook Page is already connected to a different workspace.");
      res.redirect(socialAccountsPage("facebook", "failed"));
      return;
    }

    await prisma.$transaction([
      ...pages.map((page) => prisma.socialAccount.upsert({
        where: { provider_providerAccountId: { provider: "facebook", providerAccountId: page.id } },
        create: {
          provider: "facebook",
          providerAccountId: page.id,
          displayName: page.name,
          encryptedTokens: page.encryptedTokens,
          workspaceId: membership.workspace.id,
          resellerId: membership.workspace.resellerId,
        },
        update: {
          displayName: page.name,
          encryptedTokens: page.encryptedTokens,
          tokenExpiresAt: null,
          status: "CONNECTED",
        },
      })),
      prisma.socialAccount.upsert({
        where: {
          provider_providerAccountId: {
            provider: "facebook-user",
            providerAccountId: membership.workspace.id,
          },
        },
        create: {
          provider: "facebook-user",
          providerAccountId: membership.workspace.id,
          displayName: `Meta API access · ${connection.user.name}`,
          encryptedTokens: connection.user.encryptedTokens,
          tokenExpiresAt: connection.user.tokenExpiresAt,
          workspaceId: membership.workspace.id,
          resellerId: membership.workspace.resellerId,
        },
        update: {
          displayName: `Meta API access · ${connection.user.name}`,
          encryptedTokens: connection.user.encryptedTokens,
          tokenExpiresAt: connection.user.tokenExpiresAt,
          status: "CONNECTED",
        },
      }),
    ]);
    res.redirect(socialAccountsPage("facebook", "connected"));
  } catch (callbackError) {
    console.error("Facebook Page connection failed.", callbackError instanceof Error ? callbackError.message : "Unknown error.");
    res.redirect(socialAccountsPage("facebook", "failed"));
  }
});

router.use(requireAuth, requireWorkspace, requireCompleteBrandProfile);

router.get("/", async (req, res, next) => {
  try {
    const accounts = await prisma.socialAccount.findMany({
      where: { workspaceId: req.workspace!.id, provider: { in: ["instagram", "facebook"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, provider: true, displayName: true, status: true, tokenExpiresAt: true },
    });
    let mediaPublishingConfigured = true;
    let mediaPublishingMessage = "Instagram image posts, carousels, and Reels are supported for connected Professional accounts.";
    try {
      await assertInstagramMediaHostingAvailable();
    } catch (error) {
      mediaPublishingConfigured = false;
      mediaPublishingMessage = error instanceof Error ? error.message : "Instagram media hosting could not be verified.";
    }
    res.json({
      accounts,
      instagramConfigured: isInstagramConfigured(),
      facebookConfigured: isFacebookConfigured(),
      instagramRedirectUri: env.INSTAGRAM_REDIRECT_URI ?? null,
      facebookRedirectUri: env.FACEBOOK_REDIRECT_URI ?? null,
      mediaPublishingConfigured,
      mediaPublishingMessage,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/instagram/connect", requireWritableWorkspace, async (req, res, next) => {
  try {
    if (!isInstagramConfigured()) {
      res.status(503).json({ error: "Instagram OAuth credentials and token encryption key are not configured." });
      return;
    }
    const state = jwt.sign(
      { workspaceId: req.workspace!.id, purpose: "instagram-connect" },
      env.JWT_ACCESS_SECRET,
      { subject: req.auth!.userId, issuer: "united-technologies-instagram", expiresIn: "10m" },
    );
    res.json({ authorizationUrl: makeInstagramAuthorizationUrl(state) });
  } catch (error) {
    next(error);
  }
});

router.post("/facebook/connect", requireWritableWorkspace, async (req, res, next) => {
  try {
    if (!isFacebookConfigured()) {
      res.status(503).json({ error: "Facebook App ID, App Secret, callback URL, and social token encryption key are not configured." });
      return;
    }
    const state = jwt.sign(
      { workspaceId: req.workspace!.id, purpose: "facebook-connect" },
      env.JWT_ACCESS_SECRET,
      { subject: req.auth!.userId, issuer: "united-technologies-facebook", expiresIn: "10m" },
    );
    res.json({ authorizationUrl: makeFacebookAuthorizationUrl(state) });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireWritableWorkspace, async (req, res, next) => {
  try {
    const accountId = z.string().parse(req.params.id);
    const account = await prisma.socialAccount.findFirst({
      where: { id: accountId, workspaceId: req.workspace!.id, provider: { in: ["instagram", "facebook"] } },
      select: { id: true, provider: true },
    });
    if (!account) {
      res.status(404).json({ error: "Connected social account not found." });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.socialAccount.update({
        where: { id: account.id },
        data: { status: "DISCONNECTED", encryptedTokens: "", tokenExpiresAt: null },
      });
      if (account.provider === "facebook") {
        const remainingPages = await tx.socialAccount.count({
          where: { workspaceId: req.workspace!.id, provider: "facebook", status: "CONNECTED" },
        });
        if (remainingPages === 0) {
          await tx.socialAccount.updateMany({
            where: { workspaceId: req.workspace!.id, provider: "facebook-user" },
            data: { status: "DISCONNECTED", encryptedTokens: "", tokenExpiresAt: null },
          });
        }
      }
    });
    res.json({ disconnected: true });
  } catch (error) {
    next(error);
  }
});

export { router as socialAccountsRouter };
