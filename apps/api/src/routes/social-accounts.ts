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

type SocialPlatform = "instagram" | "facebook";
type OAuthContext = { returnOrigin: string; redirectUri: string };

function socialAccountsPage(platform: SocialPlatform, status: "connected" | "cancelled" | "failed", returnOrigin = env.WEB_ORIGIN) {
  const url = new URL("/dashboard/social-accounts", returnOrigin);
  url.searchParams.set(platform, status);
  return url.toString();
}

function isLoopbackOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function getRequestWebOrigin(originHeader: string | undefined, refererHeader: string | undefined) {
  const source = originHeader?.trim() || refererHeader?.trim();
  if (!source) return undefined;
  try {
    return new URL(source).origin;
  } catch {
    return undefined;
  }
}

function isLocalWebOrigin(origin: string | undefined) {
  return Boolean(origin && (
    origin === env.WEB_ORIGIN_LOCAL ||
    (env.NODE_ENV !== "production" && isLoopbackOrigin(origin))
  ));
}

function getOAuthContext(originHeader: string | undefined, platform: SocialPlatform): OAuthContext {
  const productionRedirect = platform === "instagram" ? env.INSTAGRAM_REDIRECT_URI : env.FACEBOOK_REDIRECT_URI;
  const localRedirect = platform === "instagram" ? env.INSTAGRAM_REDIRECT_URI_LOCAL : env.FACEBOOK_REDIRECT_URI_LOCAL;
  const requestedOrigin = originHeader?.trim();
  const isLocal = isLocalWebOrigin(requestedOrigin);
  if (requestedOrigin && !isLocal && requestedOrigin !== env.WEB_ORIGIN) {
    throw new Error("The requesting website is not an allowed OAuth origin.");
  }
  if (isLocal) {
    if (!localRedirect) {
      throw new Error(`Local ${platform} sign-in needs an HTTPS tunnel callback. Set ${platform === "instagram" ? "INSTAGRAM" : "FACEBOOK"}_REDIRECT_URI_LOCAL and add that exact callback URL to the Meta app settings.`);
    }
    return { returnOrigin: requestedOrigin!, redirectUri: localRedirect };
  }
  if (!productionRedirect) throw new Error(`${platform} OAuth callback URL is not configured.`);
  return { returnOrigin: env.WEB_ORIGIN, redirectUri: productionRedirect };
}

function getCallbackContext(state: string, platform: SocialPlatform) {
  const issuer = platform === "instagram" ? "united-technologies-instagram" : "united-technologies-facebook";
  const payload = jwt.verify(state, env.JWT_ACCESS_SECRET, { issuer }) as JwtPayload;
  const returnOrigin = typeof payload.returnOrigin === "string" ? payload.returnOrigin : env.WEB_ORIGIN;
  const redirectUri = typeof payload.redirectUri === "string"
    ? payload.redirectUri
    : platform === "instagram" ? env.INSTAGRAM_REDIRECT_URI : env.FACEBOOK_REDIRECT_URI;
  const allowedOrigins = [env.WEB_ORIGIN, env.WEB_ORIGIN_LOCAL].filter((value): value is string => Boolean(value));
  const allowedRedirects = platform === "instagram"
    ? [env.INSTAGRAM_REDIRECT_URI, env.INSTAGRAM_REDIRECT_URI_LOCAL]
    : [env.FACEBOOK_REDIRECT_URI, env.FACEBOOK_REDIRECT_URI_LOCAL];
  const localOriginAllowed = env.NODE_ENV !== "production" && isLoopbackOrigin(returnOrigin);
  if ((!allowedOrigins.includes(returnOrigin) && !localOriginAllowed) ||
    typeof redirectUri !== "string" || !allowedRedirects.includes(redirectUri)) {
    throw new Error("The OAuth callback does not match a configured application origin.");
  }
  return { payload, returnOrigin, redirectUri };
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
  const state = req.query.state;
  let returnOrigin = env.WEB_ORIGIN;
  let redirectUri = env.INSTAGRAM_REDIRECT_URI;
  let oauthPayload: JwtPayload;
  try {
    if (typeof state !== "string") throw new Error("Instagram OAuth state is missing.");
    const context = getCallbackContext(state, "instagram");
    returnOrigin = context.returnOrigin;
    redirectUri = context.redirectUri;
    oauthPayload = context.payload;
  } catch {
    res.redirect(socialAccountsPage("instagram", "failed", returnOrigin));
    return;
  }
  const error = req.query.error;
  if (typeof error === "string" && error) {
    res.redirect(socialAccountsPage("instagram", "cancelled", returnOrigin));
    return;
  }
  const code = req.query.code;
  if (typeof code !== "string" || typeof state !== "string") {
    res.redirect(socialAccountsPage("instagram", "failed", returnOrigin));
    return;
  }

  try {
    const payload = oauthPayload;
    const workspaceId = payload.workspaceId;
    if (typeof payload.sub !== "string" || typeof workspaceId !== "string" || payload.purpose !== "instagram-connect") {
      res.redirect(socialAccountsPage("instagram", "failed", returnOrigin));
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
      res.redirect(socialAccountsPage("instagram", "failed", returnOrigin));
      return;
    }
    const account = await exchangeInstagramCode(code, redirectUri);
    const existing = await prisma.socialAccount.findUnique({
      where: { provider_providerAccountId: { provider: "instagram", providerAccountId: account.providerAccountId } },
      select: { id: true, workspaceId: true },
    });
    if (existing && existing.workspaceId !== membership.workspace.id) {
      console.error("Instagram account is already connected to a different workspace.");
      res.redirect(socialAccountsPage("instagram", "failed", returnOrigin));
      return;
    }
    await prisma.socialAccount.upsert({
      where: { provider_providerAccountId: { provider: "instagram", providerAccountId: account.providerAccountId } },
      create: {
        ...account,
        provider: "instagram",
        providerUserId: account.providerAccountId,
        workspaceId: membership.workspace.id,
        resellerId: membership.workspace.resellerId,
        displayName: account.displayName,
      },
      update: {
        encryptedTokens: account.encryptedTokens,
        tokenExpiresAt: account.tokenExpiresAt,
        displayName: account.displayName,
        providerUserId: account.providerAccountId,
        status: "CONNECTED",
      },
    });
    res.redirect(socialAccountsPage("instagram", "connected", returnOrigin));
  } catch (callbackError) {
    console.error("Instagram account connection failed.", callbackError);
    res.redirect(socialAccountsPage("instagram", "failed", returnOrigin));
  }
});

router.get("/facebook/callback", async (req, res) => {
  const state = req.query.state;
  let returnOrigin = env.WEB_ORIGIN;
  let redirectUri = env.FACEBOOK_REDIRECT_URI;
  let oauthPayload: JwtPayload;
  try {
    if (typeof state !== "string") throw new Error("Facebook OAuth state is missing.");
    const context = getCallbackContext(state, "facebook");
    returnOrigin = context.returnOrigin;
    redirectUri = context.redirectUri;
    oauthPayload = context.payload;
  } catch {
    res.redirect(socialAccountsPage("facebook", "failed"));
    return;
  }
  const error = req.query.error;
  if (typeof error === "string" && error) {
    res.redirect(socialAccountsPage("facebook", "cancelled", returnOrigin));
    return;
  }
  const code = req.query.code;
  if (typeof code !== "string" || typeof state !== "string") {
    res.redirect(socialAccountsPage("facebook", "failed", returnOrigin));
    return;
  }

  try {
    const payload = oauthPayload;
    const workspaceId = payload.workspaceId;
    if (typeof payload.sub !== "string" || typeof workspaceId !== "string" || payload.purpose !== "facebook-connect") {
      res.redirect(socialAccountsPage("facebook", "failed", returnOrigin));
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
      res.redirect(socialAccountsPage("facebook", "failed", returnOrigin));
      return;
    }

    const connection = await exchangeFacebookCode(code, redirectUri);
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
      res.redirect(socialAccountsPage("facebook", "failed", returnOrigin));
      return;
    }

    await prisma.$transaction([
      ...pages.map((page) => prisma.socialAccount.upsert({
        where: { provider_providerAccountId: { provider: "facebook", providerAccountId: page.id } },
        create: {
          provider: "facebook",
          providerAccountId: page.id,
          providerUserId: connection.user.id,
          displayName: page.name,
          encryptedTokens: page.encryptedTokens,
          workspaceId: membership.workspace.id,
          resellerId: membership.workspace.resellerId,
        },
        update: {
          displayName: page.name,
          encryptedTokens: page.encryptedTokens,
          tokenExpiresAt: null,
          providerUserId: connection.user.id,
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
          providerUserId: connection.user.id,
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
          providerUserId: connection.user.id,
          status: "CONNECTED",
        },
      }),
    ]);
    res.redirect(socialAccountsPage("facebook", "connected", returnOrigin));
  } catch (callbackError) {
    console.error("Facebook Page connection failed.", callbackError instanceof Error ? callbackError.message : "Unknown error.");
    res.redirect(socialAccountsPage("facebook", "failed", returnOrigin));
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
    const requestOrigin = getRequestWebOrigin(req.get("origin"), req.get("referer"));
    const localRequest = isLocalWebOrigin(requestOrigin);
    res.json({
      accounts,
      instagramConfigured: isInstagramConfigured(),
      facebookConfigured: isFacebookConfigured(),
      instagramRedirectUri: (localRequest ? env.INSTAGRAM_REDIRECT_URI_LOCAL : env.INSTAGRAM_REDIRECT_URI) ?? null,
      facebookRedirectUri: (localRequest ? env.FACEBOOK_REDIRECT_URI_LOCAL : env.FACEBOOK_REDIRECT_URI) ?? null,
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
    let oauthContext: OAuthContext;
    try {
      oauthContext = getOAuthContext(getRequestWebOrigin(req.get("origin"), req.get("referer")), "instagram");
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : "Instagram OAuth callback is not configured." });
      return;
    }
    const state = jwt.sign(
      {
        workspaceId: req.workspace!.id,
        purpose: "instagram-connect",
        returnOrigin: oauthContext.returnOrigin,
        redirectUri: oauthContext.redirectUri,
      },
      env.JWT_ACCESS_SECRET,
      { subject: req.auth!.userId, issuer: "united-technologies-instagram", expiresIn: "10m" },
    );
    res.json({ authorizationUrl: makeInstagramAuthorizationUrl(state, oauthContext.redirectUri) });
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
    let oauthContext: OAuthContext;
    try {
      oauthContext = getOAuthContext(getRequestWebOrigin(req.get("origin"), req.get("referer")), "facebook");
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : "Facebook OAuth callback is not configured." });
      return;
    }
    const state = jwt.sign(
      {
        workspaceId: req.workspace!.id,
        purpose: "facebook-connect",
        returnOrigin: oauthContext.returnOrigin,
        redirectUri: oauthContext.redirectUri,
      },
      env.JWT_ACCESS_SECRET,
      { subject: req.auth!.userId, issuer: "united-technologies-facebook", expiresIn: "10m" },
    );
    res.json({ authorizationUrl: makeFacebookAuthorizationUrl(state, oauthContext.redirectUri) });
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
