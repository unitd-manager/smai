import { env } from "../env.js";
import { decryptSocialToken, encryptSocialToken } from "./social-token-crypto.js";
import { assertInstagramMediaHostingAvailable, makeInstagramMediaUrl } from "./instagram.js";

type FacebookPage = {
  id: string;
  name: string;
  encryptedTokens: string;
};
type FacebookUser = {
  id: string;
  name: string;
  encryptedTokens: string;
  tokenExpiresAt: Date | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getFacebookConfig() {
  const { FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_REDIRECT_URI } = env;
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET || !FACEBOOK_REDIRECT_URI || !env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
    return null;
  }
  return {
    appId: FACEBOOK_APP_ID,
    appSecret: FACEBOOK_APP_SECRET,
    redirectUri: FACEBOOK_REDIRECT_URI,
  };
}

export function isFacebookConfigured() {
  return getFacebookConfig() !== null;
}

export function makeFacebookAuthorizationUrl(state: string) {
  const config = getFacebookConfig();
  if (!config) throw new Error("Facebook Page connection is not configured on this server.");
  const url = new URL(`https://www.facebook.com/${env.FACEBOOK_GRAPH_API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_manage_insights,pages_messaging,pages_manage_metadata");
  url.searchParams.set("state", state);
  return url.toString();
}

async function responseJson(response: Response) {
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    throw new Error(error && typeof error.message === "string"
      ? error.message
      : `Facebook API request failed (${response.status}).`);
  }
  return body;
}

function accessToken(value: unknown) {
  if (!isRecord(value) || typeof value.access_token !== "string" || !value.access_token) {
    throw new Error("Facebook returned an invalid access token response.");
  }
  return value.access_token;
}

function accessTokenExpiry(value: unknown) {
  if (!isRecord(value) || typeof value.expires_in !== "number" || !Number.isFinite(value.expires_in) || value.expires_in <= 0) {
    return null;
  }
  return new Date(Date.now() + value.expires_in * 1000);
}

export async function exchangeFacebookCode(code: string): Promise<{ pages: FacebookPage[]; user: FacebookUser }> {
  const config = getFacebookConfig();
  if (!config) throw new Error("Facebook Page connection is not configured on this server.");

  const tokenUrl = new URL(`https://graph.facebook.com/${env.FACEBOOK_GRAPH_API_VERSION}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", config.appId);
  tokenUrl.searchParams.set("client_secret", config.appSecret);
  tokenUrl.searchParams.set("redirect_uri", config.redirectUri);
  tokenUrl.searchParams.set("code", code);
  const shortLivedToken = accessToken(await responseJson(await fetch(tokenUrl, {
    signal: AbortSignal.timeout(15_000),
  })));

  const longLivedUrl = new URL(`https://graph.facebook.com/${env.FACEBOOK_GRAPH_API_VERSION}/oauth/access_token`);
  longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
  longLivedUrl.searchParams.set("client_id", config.appId);
  longLivedUrl.searchParams.set("client_secret", config.appSecret);
  longLivedUrl.searchParams.set("fb_exchange_token", shortLivedToken);
  const userTokenResponse = await responseJson(await fetch(longLivedUrl, {
    signal: AbortSignal.timeout(15_000),
  }));
  const userToken = accessToken(userTokenResponse);
  const userTokenExpiresAt = accessTokenExpiry(userTokenResponse);
  const userUrl = new URL(`https://graph.facebook.com/${env.FACEBOOK_GRAPH_API_VERSION}/me`);
  userUrl.searchParams.set("fields", "id,name");
  const userResponse = await responseJson(await fetch(userUrl, {
    headers: { Authorization: "Bearer " + userToken },
    signal: AbortSignal.timeout(15_000),
  }));
  if (!isRecord(userResponse) || typeof userResponse.id !== "string" || typeof userResponse.name !== "string") {
    throw new Error("Facebook returned invalid user details.");
  }

  const pages: FacebookPage[] = [];
  let pageUrl: URL | null = new URL(`https://graph.facebook.com/${env.FACEBOOK_GRAPH_API_VERSION}/me/accounts`);
  pageUrl.searchParams.set("fields", "id,name,access_token");
  pageUrl.searchParams.set("limit", "100");

  for (let requestCount = 0; pageUrl && requestCount < 50; requestCount += 1) {
    const response = await responseJson(await fetch(pageUrl, {
      headers: { Authorization: "Bearer " + userToken },
      signal: AbortSignal.timeout(15_000),
    }));
    if (!isRecord(response) || !Array.isArray(response.data)) {
      throw new Error("Facebook returned an invalid Page list.");
    }
    for (const page of response.data) {
      if (!isRecord(page) || typeof page.id !== "string" ||
        typeof page.name !== "string" || typeof page.access_token !== "string") {
        throw new Error("Facebook returned a Page without its name or access token.");
      }
      pages.push({
        id: page.id,
        name: page.name,
        encryptedTokens: encryptSocialToken(page.access_token),
      });
    }

    const paging = isRecord(response.paging) ? response.paging : null;
    const next = paging && typeof paging.next === "string" ? new URL(paging.next) : null;
    if (next && (next.protocol !== "https:" || next.hostname !== "graph.facebook.com" ||
      next.pathname !== `/${env.FACEBOOK_GRAPH_API_VERSION}/me/accounts`)) {
      throw new Error("Facebook returned an unexpected Page-list cursor.");
    }
    next?.searchParams.delete("access_token");
    pageUrl = next;
  }

  if (pageUrl) throw new Error("Facebook returned too many Pages to connect in one authorization.");
  if (pages.length === 0) {
    throw new Error("No Facebook Pages were returned. Make sure your account manages a Page and grant pages_show_list access.");
  }
  return {
    pages: [...new Map(pages.map((page) => [page.id, page])).values()],
    user: {
      id: userResponse.id,
      name: userResponse.name,
      encryptedTokens: encryptSocialToken(userToken),
      tokenExpiresAt: userTokenExpiresAt,
    },
  };
}

export async function publishFacebookPagePost(input: {
  pageId: string;
  encryptedPageToken: string;
  caption: string;
  targetId: string;
  media: unknown;
}) {
  const token = decryptSocialToken(input.encryptedPageToken);
  const media = Array.isArray(input.media) ? input.media : [];
  if (media.some((item) => isRecord(item) && item.type === "video")) {
    throw new Error("Facebook Page video publishing is not implemented yet. Save this post as a draft or choose another supported format.");
  }
  const mediaCount = media.length > 0 && media.every((item) =>
    (typeof item === "string" && item.startsWith("data:image/svg+xml;charset=utf-8,")) ||
    (isRecord(item) && item.type === "image" && typeof item.mediaAssetId === "string"),
  ) ? media.length : 0;
  if (media.length > 0 && (mediaCount === 0 || mediaCount > 10)) {
    throw new Error("Facebook Page posts support text or up to 10 generated or imported images. This media cannot be published through the current adapter.");
  }
  if (mediaCount > 0) await assertInstagramMediaHostingAvailable();

  const apiUrl = `https://graph.facebook.com/${env.FACEBOOK_GRAPH_API_VERSION}`;
  const attachedMedia: Array<{ media_fbid: string }> = [];
  for (let index = 0; index < mediaCount; index += 1) {
    const body = new URLSearchParams({
      url: makeInstagramMediaUrl(input.targetId, index),
      published: "false",
      access_token: token,
    });
    const upload = await responseJson(await fetch(`${apiUrl}/${encodeURIComponent(input.pageId)}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(30_000),
    }));
    if (!isRecord(upload) || typeof upload.id !== "string") throw new Error("Facebook did not return an uploaded photo ID.");
    attachedMedia.push({ media_fbid: upload.id });
  }

  const postBody = new URLSearchParams({ message: input.caption, access_token: token });
  attachedMedia.forEach((attachment, index) => postBody.set(`attached_media[${index}]`, JSON.stringify(attachment)));
  const created = await responseJson(await fetch(`${apiUrl}/${encodeURIComponent(input.pageId)}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: postBody,
    signal: AbortSignal.timeout(30_000),
  }));
  if (!isRecord(created) || typeof created.id !== "string") throw new Error("Facebook did not return a Page post ID.");

  let publishedUrl: string | undefined;
  try {
    const permalinkUrl = new URL(`${apiUrl}/${encodeURIComponent(created.id)}`);
    permalinkUrl.searchParams.set("fields", "permalink_url");
    permalinkUrl.searchParams.set("access_token", token);
    const permalink = await responseJson(await fetch(permalinkUrl, { signal: AbortSignal.timeout(10_000) }));
    if (isRecord(permalink) && typeof permalink.permalink_url === "string") publishedUrl = permalink.permalink_url;
  } catch {
    // The publish succeeded; permalink lookup is optional and must not retry the post.
  }
  return { platformPostId: created.id, publishedAt: new Date(), ...(publishedUrl ? { publishedUrl } : {}) };
}
