import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import sharp from "sharp";
import { env } from "../env.js";
import { prisma } from "../db.js";
import { decryptSocialToken, encryptSocialToken, getSocialTokenEncryptionKey } from "./social-token-crypto.js";

export { encryptSocialToken as encryptInstagramToken } from "./social-token-crypto.js";

type InstagramTokenResponse = { access_token: string; expires_in?: number };
type InstagramAccountCredentials = { accessToken: string; expiresAt: Date | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getInstagramConfig() {
  const { INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI } = env;
  if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET || !INSTAGRAM_REDIRECT_URI || !env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
    return null;
  }
  return {
    appId: INSTAGRAM_APP_ID,
    appSecret: INSTAGRAM_APP_SECRET,
    redirectUri: INSTAGRAM_REDIRECT_URI,
  };
}

export function isInstagramConfigured() {
  return getInstagramConfig() !== null;
}

export function makeInstagramAuthorizationUrl(state: string) {
  const config = getInstagramConfig();
  if (!config) throw new Error("Instagram connection is not configured on this server.");
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_insights,instagram_business_manage_messages");
  url.searchParams.set("state", state);
  return url.toString();
}

function tokenResult(value: unknown): InstagramTokenResponse {
  const record = isRecord(value) && Array.isArray(value.data) ? value.data[0] : value;
  if (!isRecord(record) || typeof record.access_token !== "string" ||
    (record.expires_in !== undefined && typeof record.expires_in !== "number")) {
    const message = isRecord(record) && typeof record.error_message === "string"
      ? record.error_message
      : "Instagram returned an invalid access token response.";
    throw new Error(message);
  }
  return {
    access_token: record.access_token,
    ...(typeof record.expires_in === "number" ? { expires_in: record.expires_in } : {}),
  };
}

function tokenExpirySeconds(token: InstagramTokenResponse) {
  if (typeof token.expires_in !== "number" || !Number.isFinite(token.expires_in) || token.expires_in <= 0) {
    throw new Error("Instagram did not provide a valid access token expiration.");
  }
  return token.expires_in;
}

export function convertInstagramSvgToJpeg(svg: string) {
  return sharp(Buffer.from(svg), { limitInputPixels: 2_000_000 })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

export function convertInstagramImageToJpeg(image: Buffer) {
  return sharp(image, { limitInputPixels: 40_000_000 })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

async function responseJson(response: Response) {
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    const message = error && typeof error.message === "string"
      ? error.message
      : isRecord(body) && typeof body.error_message === "string"
        ? body.error_message
        : `Instagram API request failed (${response.status}).`;
    throw new Error(message);
  }
  return body;
}

export async function exchangeInstagramCode(code: string) {
  const config = getInstagramConfig();
  if (!config) throw new Error("Instagram connection is not configured on this server.");
  const form = new FormData();
  form.set("client_id", config.appId);
  form.set("client_secret", config.appSecret);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", config.redirectUri);
  form.set("code", code);
  const shortLived = tokenResult(await responseJson(await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(15_000),
  })));
  const longLivedUrl = new URL("https://graph.instagram.com/access_token");
  longLivedUrl.searchParams.set("grant_type", "ig_exchange_token");
  longLivedUrl.searchParams.set("client_secret", config.appSecret);
  longLivedUrl.searchParams.set("access_token", shortLived.access_token);
  const longLived = tokenResult(await responseJson(await fetch(longLivedUrl, {
    signal: AbortSignal.timeout(15_000),
  })));
  const profileUrl = new URL(`https://graph.instagram.com/${env.INSTAGRAM_GRAPH_API_VERSION}/me`);
  profileUrl.searchParams.set("fields", "user_id,username");
  profileUrl.searchParams.set("access_token", longLived.access_token);
  const profile = await responseJson(await fetch(profileUrl, { signal: AbortSignal.timeout(15_000) }));
  const accountData = isRecord(profile) && Array.isArray(profile.data) ? profile.data[0] : profile;
  if (!isRecord(accountData) || typeof accountData.user_id !== "string" || typeof accountData.username !== "string") {
    throw new Error("Instagram did not return the connected professional account details.");
  }
  return {
    providerAccountId: accountData.user_id,
    displayName: `@${accountData.username}`,
    encryptedTokens: encryptSocialToken(longLived.access_token),
    tokenExpiresAt: new Date(Date.now() + tokenExpirySeconds(longLived) * 1000),
  };
}

export async function getInstagramAccessToken(account: {
  id: string;
  encryptedTokens: string;
  tokenExpiresAt: Date | null;
}): Promise<InstagramAccountCredentials> {
  let accessToken = decryptSocialToken(account.encryptedTokens);
  let expiresAt = account.tokenExpiresAt;
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw new Error("The Instagram access token has expired. Reconnect the Instagram account.");
  }
  if (expiresAt && expiresAt.getTime() < Date.now() + 10 * 24 * 60 * 60 * 1000) {
    const refreshUrl = new URL("https://graph.instagram.com/refresh_access_token");
    refreshUrl.searchParams.set("grant_type", "ig_refresh_token");
    refreshUrl.searchParams.set("access_token", accessToken);
    const refreshed = tokenResult(await responseJson(await fetch(refreshUrl, {
      signal: AbortSignal.timeout(15_000),
    })));
    accessToken = refreshed.access_token;
    expiresAt = new Date(Date.now() + tokenExpirySeconds(refreshed) * 1000);
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { encryptedTokens: encryptSocialToken(accessToken), tokenExpiresAt: expiresAt },
    });
  }
  return { accessToken, expiresAt };
}

type InstagramJson = Record<string, unknown>;

function asInstagramRecord(value: unknown): InstagramJson | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as InstagramJson
    : null;
}

async function instagramGet(path: string, accessToken: string, fields?: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.instagram.com/${env.INSTAGRAM_GRAPH_API_VERSION}/${path}`);
  if (fields) url.searchParams.set("fields", fields);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", accessToken);
  return responseJson(await fetch(url, { signal: AbortSignal.timeout(20_000) }));
}

export async function getInstagramListeningData(account: {
  id: string;
  providerAccountId: string;
  encryptedTokens: string;
  tokenExpiresAt: Date | null;
}) {
  const { accessToken } = await getInstagramAccessToken(account);
  const mediaResponse = await instagramGet(
    `${encodeURIComponent(account.providerAccountId)}/media`,
    accessToken,
    "id,caption,media_type,permalink,timestamp,like_count,comments_count",
  );
  const data = asInstagramRecord(mediaResponse);
  if (!data || !Array.isArray(data.data)) throw new Error("Instagram returned an invalid media list.");

  const media = data.data.flatMap((item) => {
    const record = asInstagramRecord(item);
    if (!record || typeof record.id !== "string") return [];
    return [{
      id: record.id,
      caption: typeof record.caption === "string" ? record.caption : "",
      mediaType: typeof record.media_type === "string" ? record.media_type : "POST",
      permalink: typeof record.permalink === "string" ? record.permalink : null,
      timestamp: typeof record.timestamp === "string" ? record.timestamp : null,
      likes: typeof record.like_count === "number" ? record.like_count : null,
      commentsCount: typeof record.comments_count === "number" ? record.comments_count : null,
    }];
  }).slice(0, 30);

  const posts = await Promise.all(media.map(async (post) => {
    const insights: Record<string, number | null> = {};
    try {
      const insightsResponse = await instagramGet(
        `${encodeURIComponent(post.id)}/insights`,
        accessToken,
        undefined,
        { metric: "views,reach,saved,shares,total_interactions" },
      );
      const insightData = asInstagramRecord(insightsResponse);
      if (Array.isArray(insightData?.data)) {
        for (const item of insightData.data) {
          const record = asInstagramRecord(item);
          const value = Array.isArray(record?.values) ? asInstagramRecord(record.values[0])?.value : record?.total_value;
          insights[String(record?.name)] = typeof value === "number" ? value : null;
        }
      }
    } catch {
      // Insights can be unavailable for a particular format or until Meta grants the permission.
    }
    try {
      const response = await instagramGet(
        `${encodeURIComponent(post.id)}/comments`,
        accessToken,
        "id,text,timestamp,username,like_count",
      );
      const commentsData = asInstagramRecord(response);
      const comments = Array.isArray(commentsData?.data)
        ? commentsData.data.flatMap((comment) => {
            const record = asInstagramRecord(comment);
            if (!record || typeof record.id !== "string") return [];
            return [{
              id: record.id,
              text: typeof record.text === "string" ? record.text : "",
              timestamp: typeof record.timestamp === "string" ? record.timestamp : null,
              username: typeof record.username === "string" ? record.username : null,
              likes: typeof record.like_count === "number" ? record.like_count : null,
            }];
          })
        : [];
      return { ...post, insights, comments, commentsAvailable: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Instagram comments are unavailable.";
      const permissionMissing = /permission|authorized|access|scope/i.test(message);
      return { ...post, insights, comments: [], commentsAvailable: false, commentError: permissionMissing
        ? "Reconnect Instagram and approve comment access to view comments."
        : "Instagram could not load comments for this post." };
    }
  }));

  return { posts, fetchedAt: new Date().toISOString() };
}

export async function listInstagramMediaIds(account: {
  id: string;
  providerAccountId: string;
  encryptedTokens: string;
  tokenExpiresAt: Date | null;
}) {
  const { accessToken } = await getInstagramAccessToken(account);
  const mediaUrl = new URL(
    `https://graph.instagram.com/${env.INSTAGRAM_GRAPH_API_VERSION}/${encodeURIComponent(account.providerAccountId)}/media`,
  );
  mediaUrl.searchParams.set("fields", "id");
  mediaUrl.searchParams.set("limit", "100");
  mediaUrl.searchParams.set("access_token", accessToken);
  const mediaIds = new Set<string>();

  for (let page = 0; page < 100; page += 1) {
    const response = await responseJson(await fetch(mediaUrl, { signal: AbortSignal.timeout(15_000) }));
    if (!isRecord(response) || !Array.isArray(response.data)) {
      throw new Error("Instagram returned an invalid media list.");
    }
    for (const media of response.data) {
      if (!isRecord(media) || typeof media.id !== "string") {
        throw new Error("Instagram returned a media item without an ID.");
      }
      mediaIds.add(media.id);
    }

    const paging = isRecord(response.paging) ? response.paging : null;
    if (!paging || typeof paging.next !== "string") return mediaIds;
    const nextUrl = new URL(paging.next);
    const cursor = nextUrl.searchParams.get("after");
    if (nextUrl.origin !== mediaUrl.origin || !cursor) {
      throw new Error("Instagram returned an invalid media-list cursor.");
    }
    mediaUrl.searchParams.set("after", cursor);
  }

  throw new Error("Instagram media history is too large to sync safely in one check.");
}

function signMediaRequest(targetId: string, mediaIndex: number, expires: string, mediaType: "image" | "video") {
  return createHmac("sha256", getSocialTokenEncryptionKey()).update(`${targetId}.${mediaIndex}.${expires}.${mediaType}`).digest("base64url");
}

export function isInstagramMediaHostingConfigured() {
  if (!env.PUBLIC_API_URL || !env.SOCIAL_TOKEN_ENCRYPTION_KEY) return false;
  return new URL(env.PUBLIC_API_URL).protocol === "https:";
}

function isPublicMediaHostAddress(address: string, family: number) {
  if (family === 4) {
    const [first, second, third] = address.split(".").map(Number);
    if (first === undefined || second === undefined || third === undefined) return false;
    return first !== 0 && first !== 10 && first !== 127 && first < 224 &&
      !(first === 100 && second! >= 64 && second! <= 127) &&
      !(first === 169 && second === 254) &&
      !(first === 172 && second! >= 16 && second! <= 31) &&
      !(first === 192 && (second === 0 || second === 168)) &&
      !(first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) &&
      !(first === 203 && second === 0 && third === 113);
  }
  const normalized = address.toLowerCase();
  return family === 6 && /^[23]/.test(normalized) && !normalized.startsWith("2001:db8:");
}

export async function assertInstagramMediaHostingAvailable() {
  if (!env.PUBLIC_API_URL || !env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
    throw new Error("Configure Instagram security and PUBLIC_API_URL before publishing videos.");
  }
  const base = new URL(env.PUBLIC_API_URL);
  if (base.protocol !== "https:" || base.hostname === "localhost" || base.hostname.endsWith(".localhost")) {
    throw new Error("PUBLIC_API_URL must use a public HTTPS address that Instagram can reach; localhost is not supported.");
  }

  const hostname = base.hostname.replace(/^\[|\]$/g, "");
  let addresses: Array<{ address: string; family: number }>;
  const ipFamily = isIP(hostname);
  if (ipFamily) {
    addresses = [{ address: hostname, family: ipFamily }];
  } else {
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch (error) {
      throw new Error("PUBLIC_API_URL does not resolve. Set it to the public HTTPS address of your deployed API or active tunnel.", { cause: error });
    }
  }
  if (addresses.length === 0 || addresses.some(({ address, family }) => !isPublicMediaHostAddress(address, family))) {
    throw new Error("PUBLIC_API_URL must resolve only to publicly reachable IP addresses; private and local addresses cannot be fetched by Instagram.");
  }

  try {
    const response = await fetch(new URL("/health", base), { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Health endpoint returned HTTP ${response.status}.`);
  } catch (error) {
    throw new Error("Instagram cannot fetch media from PUBLIC_API_URL. Confirm the public HTTPS API address and its /health endpoint are reachable.", { cause: error });
  }
}

export function makeInstagramMediaUrl(targetId: string, mediaIndex = 0, mediaType: "image" | "video" = "image") {
  if (!env.PUBLIC_API_URL) {
    throw new Error("Set PUBLIC_API_URL to a public HTTPS API address before publishing Instagram media.");
  }
  if (!Number.isSafeInteger(mediaIndex) || mediaIndex < 0 || mediaIndex > 9) {
    throw new Error("Instagram carousel media index must be between 0 and 9.");
  }
  const base = new URL(env.PUBLIC_API_URL);
  if (base.protocol !== "https:") {
    throw new Error("Instagram publishing requires PUBLIC_API_URL to use HTTPS.");
  }
  const expires = String(Math.floor(Date.now() / 1000) + (mediaType === "video" ? 60 * 60 : 10 * 60));
  const url = new URL(`/api/social-accounts/instagram-media/${encodeURIComponent(targetId)}`, base);
  url.searchParams.set("index", String(mediaIndex));
  url.searchParams.set("type", mediaType);
  url.searchParams.set("expires", expires);
  url.searchParams.set("signature", signMediaRequest(targetId, mediaIndex, expires, mediaType));
  return url.toString();
}

export function verifyInstagramMediaSignature(
  targetId: string,
  expires: string,
  signature: string,
  mediaIndex = 0,
  mediaType: "image" | "video" = "image",
) {
  const expirySeconds = Number(expires);
  const maxLifetime = mediaType === "video" ? 61 * 60 : 11 * 60;
  if (!Number.isSafeInteger(mediaIndex) || mediaIndex < 0 || mediaIndex > 9 ||
    !Number.isSafeInteger(expirySeconds) || expirySeconds < Math.floor(Date.now() / 1000) ||
    expirySeconds > Math.floor(Date.now() / 1000) + maxLifetime) {
    return false;
  }
  const expected = Buffer.from(signMediaRequest(targetId, mediaIndex, expires, mediaType));
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function instagramContainerId(value: unknown) {
  const record = isRecord(value) && Array.isArray(value.data) ? value.data[0] : value;
  if (!isRecord(record) || typeof record.id !== "string") {
    throw new Error("Instagram did not return a media container ID.");
  }
  return record.id;
}

async function waitForInstagramContainer(
  containerId: string,
  accessToken: string,
  graphUrl: string,
  { attempts = 15, intervalMs = 2_000 }: { attempts?: number; intervalMs?: number } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const statusUrl = new URL(`${graphUrl}/${encodeURIComponent(containerId)}`);
    statusUrl.searchParams.set("fields", "status_code,status");
    statusUrl.searchParams.set("access_token", accessToken);
    const statusResponse = await responseJson(await fetch(statusUrl, { signal: AbortSignal.timeout(15_000) }));
    const statusData = isRecord(statusResponse) && Array.isArray(statusResponse.data)
      ? statusResponse.data[0]
      : statusResponse;
    if (isRecord(statusData) && statusData.status_code === "FINISHED") return;
    if (isRecord(statusData) && ["ERROR", "EXPIRED"].includes(String(statusData.status_code))) {
      const reason = typeof statusData.status === "string" ? statusData.status : "";
      throw new Error(reason && reason !== String(statusData.status_code)
        ? reason
        : "Instagram could not process the uploaded video. Confirm the public MP4 URL is reachable and the video uses an Instagram-supported format, then retry.");
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Instagram is still processing the post media. Retry publishing in a moment.");
}

export async function publishInstagramPost(input: {
  targetId: string;
  socialAccountId: string;
  providerAccountId: string;
  encryptedTokens: string;
  tokenExpiresAt: Date | null;
  caption: string;
  media: unknown;
}) {
  if (input.caption.length > 2200) {
    throw new Error("Instagram captions must be 2,200 characters or fewer.");
  }
  const videoStorageKey = Array.isArray(input.media) && input.media.length === 1 &&
    isRecord(input.media[0]) && input.media[0].type === "video" &&
    typeof input.media[0].storageKey === "string" && input.media[0].storageKey.length > 0
    ? input.media[0].storageKey
    : null;
  const importedMedia = Array.isArray(input.media) && input.media.length === 1 &&
    isRecord(input.media[0]) && (input.media[0].type === "image" || input.media[0].type === "video") &&
    typeof input.media[0].mediaAssetId === "string"
    ? input.media[0]
    : null;
  const importedVideo = importedMedia?.type === "video";
  const uploadedImage = importedMedia?.type === "image";
  const imageMedia = Array.isArray(input.media) && input.media.length >= 1 && input.media.length <= 10 &&
    input.media.every((item): item is string =>
      typeof item === "string" && item.startsWith("data:image/svg+xml;charset=utf-8,"))
    ? input.media
    : null;
  if (!videoStorageKey && !importedMedia && !imageMedia) {
    throw new Error("Instagram posts need a generated image, an imported image, a carousel of 2 to 10 images, or one video.");
  }
  const { accessToken } = await getInstagramAccessToken({
    id: input.socialAccountId,
    encryptedTokens: input.encryptedTokens,
    tokenExpiresAt: input.tokenExpiresAt,
  });
  const graphUrl = `https://graph.instagram.com/${env.INSTAGRAM_GRAPH_API_VERSION}`;
  let containerId: string;
  if (videoStorageKey || importedVideo) {
    const containerForm = new URLSearchParams({
      media_type: "REELS",
      video_url: makeInstagramMediaUrl(input.targetId, 0, "video"),
      caption: input.caption,
      share_to_feed: "true",
      access_token: accessToken,
    });
    const containerResponse = await responseJson(await fetch(`${graphUrl}/${encodeURIComponent(input.providerAccountId)}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: containerForm,
      signal: AbortSignal.timeout(30_000),
    }));
    containerId = instagramContainerId(containerResponse);
  } else if (uploadedImage || imageMedia?.length === 1) {
    const containerForm = new URLSearchParams({
      image_url: makeInstagramMediaUrl(input.targetId),
      caption: input.caption,
      access_token: accessToken,
    });
    const containerResponse = await responseJson(await fetch(`${graphUrl}/${encodeURIComponent(input.providerAccountId)}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: containerForm,
      signal: AbortSignal.timeout(30_000),
    }));
    containerId = instagramContainerId(containerResponse);
  } else if (imageMedia) {
    const childIds = await Promise.all(imageMedia.map(async (_image, mediaIndex) => {
      const childForm = new URLSearchParams({
        image_url: makeInstagramMediaUrl(input.targetId, mediaIndex),
        is_carousel_item: "true",
        access_token: accessToken,
      });
      const childResponse = await responseJson(await fetch(`${graphUrl}/${encodeURIComponent(input.providerAccountId)}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: childForm,
        signal: AbortSignal.timeout(30_000),
      }));
      return instagramContainerId(childResponse);
    }));
    await Promise.all(childIds.map((childId) => waitForInstagramContainer(childId, accessToken, graphUrl)));
    const carouselForm = new URLSearchParams({
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption: input.caption,
      access_token: accessToken,
    });
    const carouselResponse = await responseJson(await fetch(`${graphUrl}/${encodeURIComponent(input.providerAccountId)}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: carouselForm,
      signal: AbortSignal.timeout(30_000),
    }));
    containerId = instagramContainerId(carouselResponse);
  } else {
    throw new Error("The Instagram post does not contain supported media.");
  }
  await waitForInstagramContainer(
    containerId,
    accessToken,
    graphUrl,
    videoStorageKey || importedVideo ? { attempts: 60, intervalMs: 5_000 } : undefined,
  );

  const publishForm = new URLSearchParams({ creation_id: containerId, access_token: accessToken });
  const publishedResponse = await responseJson(await fetch(`${graphUrl}/${encodeURIComponent(input.providerAccountId)}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: publishForm,
    signal: AbortSignal.timeout(30_000),
  }));
  const publishedData = isRecord(publishedResponse) && Array.isArray(publishedResponse.data)
    ? publishedResponse.data[0]
    : publishedResponse;
  if (!isRecord(publishedData) || typeof publishedData.id !== "string") {
    throw new Error("Instagram did not return a published post ID.");
  }
  return { platformPostId: publishedData.id, publishedAt: new Date() };
}
