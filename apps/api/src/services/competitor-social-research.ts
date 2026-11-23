import { env } from "../env.js";
import { decryptSocialToken } from "./social-token-crypto.js";

type JsonRecord = Record<string, unknown>;
type SocialProfiles = Record<string, unknown>;
type Metrics = { followers?: number; totalPosts?: number; likes?: number; comments?: number; shares?: number; views?: number };
type SocialPost = {
  platform: string;
  url: string;
  publishedAt?: string;
  format: string;
  topic: string;
  hook: string;
  captionApproach: string;
  callToAction: string;
  metrics: Metrics;
};
type PlatformMetric = { platform: string; capturedAt: string; metrics: Metrics };
type FacebookUserAccount = {
  id: string;
  encryptedTokens: string;
  tokenExpiresAt: Date | null;
};
type FacebookPageAccount = { providerAccountId: string; encryptedTokens: string };
export type CompetitorSocialResearch = {
  posts: SocialPost[];
  platformMetrics: PlatformMetric[];
  sources: Array<{ label: string; url: string }>;
  warnings: string[];
};

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numeric(value: unknown): number | undefined {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function string(value: unknown, limit = 1200) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function dated(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

export function publicProfileUsername(profileUrl: string | undefined, platform: "Instagram" | "X") {
  if (!profileUrl) return null;
  try {
    const url = new URL(profileUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const acceptedHosts = platform === "Instagram" ? ["instagram.com"] : ["x.com", "twitter.com"];
    if (url.protocol !== "https:" || !acceptedHosts.includes(host)) return null;
    const username = url.pathname.split("/").filter(Boolean)[0];
    if (!username || ["p", "reel", "reels", "stories", "explore", "intent", "home", "search"].includes(username.toLowerCase())) return null;
    const pattern = platform === "Instagram" ? /^[a-zA-Z0-9._]{1,30}$/ : /^[a-zA-Z0-9_]{1,15}$/;
    return pattern.test(username) ? username : null;
  } catch {
    return null;
  }
}

export function youtubeChannelReference(profileUrl: string | undefined) {
  if (!profileUrl) return null;
  try {
    const url = new URL(profileUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || !["youtube.com", "m.youtube.com"].includes(host)) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    const handle = segments[0]?.startsWith("@") ? segments[0].slice(1) : null;
    const channelId = segments[0] === "channel" ? segments[1] : null;
    if (handle && /^[a-zA-Z0-9._-]{3,100}$/.test(handle)) return { handle };
    if (channelId && /^UC[a-zA-Z0-9_-]{20,}$/.test(channelId)) return { channelId };
    return null;
  } catch {
    return null;
  }
}

async function jsonResponse(response: Response, provider: string): Promise<unknown> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${provider} returned an invalid response.`);
  }
  if (!response.ok) throw new Error(`${provider} returned HTTP ${response.status}.`);
  return body;
}

async function researchInstagram(username: string, user: FacebookUserAccount, pages: FacebookPageAccount[]) {
  if (user.tokenExpiresAt && user.tokenExpiresAt.getTime() <= Date.now()) {
    throw new Error("The Facebook user access token has expired. Reconnect Facebook and grant Instagram Business Discovery permissions.");
  }
  const userToken = decryptSocialToken(user.encryptedTokens);
  let instagramUserId = "";
  let pageResearchError: unknown;
  for (const page of pages) {
    try {
      const pageUrl = new URL(`https://graph.facebook.com/${env.FACEBOOK_GRAPH_API_VERSION}/${encodeURIComponent(page.providerAccountId)}`);
      pageUrl.searchParams.set("fields", "instagram_business_account{id}");
      pageUrl.searchParams.set("access_token", decryptSocialToken(page.encryptedTokens));
      const pageResponse = await jsonResponse(await fetch(pageUrl, { signal: AbortSignal.timeout(15_000) }), "Facebook Page API");
      if (isRecord(pageResponse) && isRecord(pageResponse.instagram_business_account) &&
        typeof pageResponse.instagram_business_account.id === "string") {
        instagramUserId = pageResponse.instagram_business_account.id;
        break;
      }
    } catch (error) {
      pageResearchError = error;
    }
  }
  if (!instagramUserId) {
    const reason = pageResearchError instanceof Error ? ` ${pageResearchError.message}` : "";
    throw new Error(`No connected Facebook Page exposed an eligible Instagram professional account.${reason}`);
  }
  const url = new URL(`https://graph.facebook.com/${env.FACEBOOK_GRAPH_API_VERSION}/${encodeURIComponent(instagramUserId)}`);
  url.searchParams.set("fields", `business_discovery.username(${username}){username,followers_count,media_count,media.limit(15){id,caption,media_type,timestamp,permalink,like_count,comments_count,view_count}}`);
  url.searchParams.set("access_token", userToken);
  const body = await jsonResponse(await fetch(url, { signal: AbortSignal.timeout(15_000) }), "Instagram Business Discovery");
  if (!isRecord(body) || !isRecord(body.business_discovery)) throw new Error("Instagram did not return competitor profile data.");
  const accountData = body.business_discovery;
  const now = new Date().toISOString();
  const metrics: Metrics = {
    ...(numeric(accountData.followers_count) !== undefined ? { followers: numeric(accountData.followers_count) } : {}),
    ...(numeric(accountData.media_count) !== undefined ? { totalPosts: numeric(accountData.media_count) } : {}),
  };
  const media = isRecord(accountData.media) && Array.isArray(accountData.media.data) ? accountData.media.data : [];
  const posts = media.filter(isRecord).flatMap((item): SocialPost[] => {
    const url = string(item.permalink, 2048);
    if (!url.startsWith("https://www.instagram.com/")) return [];
    const caption = string(item.caption);
    const publishedAt = dated(item.timestamp);
    const metricData: Metrics = {
      ...(numeric(item.like_count) !== undefined ? { likes: numeric(item.like_count) } : {}),
      ...(numeric(item.comments_count) !== undefined ? { comments: numeric(item.comments_count) } : {}),
      ...(numeric(item.view_count) !== undefined ? { views: numeric(item.view_count) } : {}),
    };
    const format = item.media_type === "VIDEO" ? "Video" : item.media_type === "CAROUSEL_ALBUM" ? "Carousel" : "Image";
    return [{
      platform: "Instagram",
      url,
      ...(publishedAt ? { publishedAt } : {}),
      format,
      topic: caption.slice(0, 180) || `${format} post`,
      hook: caption.slice(0, 1000),
      captionApproach: caption,
      callToAction: "",
      metrics: metricData,
    }];
  });
  return {
    posts,
    ...(Object.keys(metrics).length ? { platformMetric: { platform: "Instagram", capturedAt: now, metrics } } : {}),
  };
}

async function researchYouTube(profileUrl: string) {
  if (!env.YOUTUBE_DATA_API_KEY) throw new Error("Set YOUTUBE_DATA_API_KEY to read public YouTube channel and video statistics.");
  const reference = youtubeChannelReference(profileUrl);
  if (!reference) throw new Error("The linked YouTube URL is not a supported channel or handle URL.");
  const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
  channelUrl.searchParams.set("part", "snippet,statistics,contentDetails");
  channelUrl.searchParams.set("key", env.YOUTUBE_DATA_API_KEY);
  if (reference.channelId) channelUrl.searchParams.set("id", reference.channelId);
  else channelUrl.searchParams.set("forHandle", `@${reference.handle}`);
  const channelResponse = await jsonResponse(await fetch(channelUrl, { signal: AbortSignal.timeout(15_000) }), "YouTube Data API");
  const channels = isRecord(channelResponse) && Array.isArray(channelResponse.items) ? channelResponse.items : [];
  const channel = channels.find(isRecord);
  if (!channel) throw new Error("YouTube did not find the linked channel.");
  const statistics = isRecord(channel.statistics) ? channel.statistics : {};
  const details = isRecord(channel.contentDetails) ? channel.contentDetails : {};
  const related = isRecord(details.relatedPlaylists) ? details.relatedPlaylists : {};
  const uploadsId = string(related.uploads, 100);
  const channelId = string(channel.id, 100);
  if (!uploadsId || !channelId) throw new Error("YouTube returned incomplete channel details.");
  const playlistUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  playlistUrl.searchParams.set("part", "snippet,contentDetails");
  playlistUrl.searchParams.set("playlistId", uploadsId);
  playlistUrl.searchParams.set("maxResults", "15");
  playlistUrl.searchParams.set("key", env.YOUTUBE_DATA_API_KEY);
  const playlistResponse = await jsonResponse(await fetch(playlistUrl, { signal: AbortSignal.timeout(15_000) }), "YouTube Data API");
  const entries = isRecord(playlistResponse) && Array.isArray(playlistResponse.items) ? playlistResponse.items : [];
  const videoIds = entries.filter(isRecord).map((entry) => {
    const content = isRecord(entry.contentDetails) ? entry.contentDetails : {};
    return string(content.videoId, 100);
  }).filter(Boolean);
  let videoItems: unknown[] = [];
  if (videoIds.length) {
    const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    videosUrl.searchParams.set("part", "snippet,statistics");
    videosUrl.searchParams.set("id", videoIds.join(","));
    videosUrl.searchParams.set("key", env.YOUTUBE_DATA_API_KEY);
    const videosResponse = await jsonResponse(await fetch(videosUrl, { signal: AbortSignal.timeout(15_000) }), "YouTube Data API");
    videoItems = isRecord(videosResponse) && Array.isArray(videosResponse.items) ? videosResponse.items : [];
  }
  const posts = videoItems.filter(isRecord).flatMap((video): SocialPost[] => {
    const videoId = string(video.id, 100);
    if (!videoId) return [];
    const snippet = isRecord(video.snippet) ? video.snippet : {};
    const videoStats = isRecord(video.statistics) ? video.statistics : {};
    const title = string(snippet.title, 500);
    const description = string(snippet.description);
    const publishedAt = dated(snippet.publishedAt);
    const metrics: Metrics = {
      ...(numeric(videoStats.viewCount) !== undefined ? { views: numeric(videoStats.viewCount) } : {}),
      ...(numeric(videoStats.likeCount) !== undefined ? { likes: numeric(videoStats.likeCount) } : {}),
      ...(numeric(videoStats.commentCount) !== undefined ? { comments: numeric(videoStats.commentCount) } : {}),
    };
    return [{
      platform: "YouTube",
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      ...(publishedAt ? { publishedAt } : {}),
      format: "Video",
      topic: title || "Untitled video",
      hook: title,
      captionApproach: description,
      callToAction: "",
      metrics,
    }];
  });
  const profileMetrics: Metrics = {
    ...(numeric(statistics.subscriberCount) !== undefined ? { followers: numeric(statistics.subscriberCount) } : {}),
    ...(numeric(statistics.videoCount) !== undefined ? { totalPosts: numeric(statistics.videoCount) } : {}),
  };
  return {
    posts,
    ...(Object.keys(profileMetrics).length ? { platformMetric: { platform: "YouTube", capturedAt: new Date().toISOString(), metrics: profileMetrics } } : {}),
  };
}

async function researchX(username: string) {
  if (!env.X_API_BEARER_TOKEN) throw new Error("Set X_API_BEARER_TOKEN to read recent public X posts and metrics.");
  const userUrl = new URL(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`);
  userUrl.searchParams.set("user.fields", "public_metrics");
  const userResponse = await jsonResponse(await fetch(userUrl, {
    headers: { Authorization: `Bearer ${env.X_API_BEARER_TOKEN}` },
    signal: AbortSignal.timeout(15_000),
  }), "X API");
  const user = isRecord(userResponse) && isRecord(userResponse.data) ? userResponse.data : null;
  if (!user || typeof user.id !== "string") throw new Error("X did not return the linked public account.");
  const timelineUrl = new URL(`https://api.x.com/2/users/${encodeURIComponent(user.id)}/tweets`);
  timelineUrl.searchParams.set("max_results", "15");
  timelineUrl.searchParams.set("exclude", "retweets,replies");
  timelineUrl.searchParams.set("tweet.fields", "created_at,public_metrics,attachments");
  const timelineResponse = await jsonResponse(await fetch(timelineUrl, {
    headers: { Authorization: `Bearer ${env.X_API_BEARER_TOKEN}` },
    signal: AbortSignal.timeout(15_000),
  }), "X API");
  const tweets = isRecord(timelineResponse) && Array.isArray(timelineResponse.data) ? timelineResponse.data : [];
  const posts = tweets.filter(isRecord).flatMap((tweet): SocialPost[] => {
    const id = string(tweet.id, 100);
    const text = string(tweet.text);
    if (!id) return [];
    const publicMetrics = isRecord(tweet.public_metrics) ? tweet.public_metrics : {};
    const media = isRecord(tweet.attachments) && Array.isArray(tweet.attachments.media_keys) && tweet.attachments.media_keys.length > 0;
    const metrics: Metrics = {
      ...(numeric(publicMetrics.like_count) !== undefined ? { likes: numeric(publicMetrics.like_count) } : {}),
      ...(numeric(publicMetrics.reply_count) !== undefined ? { comments: numeric(publicMetrics.reply_count) } : {}),
      ...(numeric(publicMetrics.retweet_count) !== undefined ? { shares: numeric(publicMetrics.retweet_count) } : {}),
    };
    const publishedAt = dated(tweet.created_at);
    return [{
      platform: "X",
      url: `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(id)}`,
      ...(publishedAt ? { publishedAt } : {}),
      format: media ? "Post with media" : "Text post",
      topic: text.slice(0, 180) || "Post",
      hook: text.slice(0, 1000),
      captionApproach: text,
      callToAction: "",
      metrics,
    }];
  });
  const userMetrics = isRecord(user.public_metrics) ? user.public_metrics : {};
  const profileMetrics: Metrics = {
    ...(numeric(userMetrics.followers_count) !== undefined ? { followers: numeric(userMetrics.followers_count) } : {}),
    ...(numeric(userMetrics.tweet_count) !== undefined ? { totalPosts: numeric(userMetrics.tweet_count) } : {}),
  };
  return {
    posts,
    ...(Object.keys(profileMetrics).length ? { platformMetric: { platform: "X", capturedAt: new Date().toISOString(), metrics: profileMetrics } } : {}),
  };
}

export async function researchCompetitorSocial(input: {
  socialProfiles: SocialProfiles;
  facebookUserAccount?: FacebookUserAccount | null;
  facebookPages?: FacebookPageAccount[];
}): Promise<CompetitorSocialResearch> {
  const output: CompetitorSocialResearch = { posts: [], platformMetrics: [], sources: [], warnings: [] };
  const jobs: Array<Promise<void>> = [];
  const addJob = (platform: string, profileUrl: string, job: () => Promise<{ posts: SocialPost[]; platformMetric?: PlatformMetric }>) => {
    output.sources.push({ label: `${platform} public profile`, url: profileUrl });
    jobs.push(job().then((result) => {
      output.posts.push(...result.posts);
      if (result.platformMetric) output.platformMetrics.push(result.platformMetric);
    }).catch((error: unknown) => {
      output.warnings.push(`${platform}: ${error instanceof Error ? error.message : "Public data could not be collected."}`);
    }));
  };

  const instagramProfileUrl = string(input.socialProfiles.Instagram, 2048);
  const instagramUsername = publicProfileUsername(instagramProfileUrl, "Instagram");
  if (instagramUsername && input.facebookUserAccount && input.facebookPages?.length) {
    const user = input.facebookUserAccount;
    const pages = input.facebookPages;
    addJob("Instagram", instagramProfileUrl, () => researchInstagram(instagramUsername, user, pages));
  } else if (instagramUsername) {
    output.warnings.push("Instagram: connect Facebook with Instagram Business Discovery permissions and an eligible linked professional account.");
  } else if (instagramProfileUrl) {
    output.warnings.push("Instagram: the listed link is not a supported public profile URL.");
  }

  const youtubeProfileUrl = string(input.socialProfiles.YouTube, 2048);
  if (youtubeProfileUrl) {
    const reference = youtubeChannelReference(youtubeProfileUrl);
    if (reference) addJob("YouTube", youtubeProfileUrl, () => researchYouTube(youtubeProfileUrl));
    else output.warnings.push("YouTube: the listed link is not a supported public channel URL.");
  }

  const xProfileUrl = string(input.socialProfiles.X, 2048);
  const xUsername = publicProfileUsername(xProfileUrl, "X");
  if (xUsername) addJob("X", xProfileUrl, () => researchX(xUsername));
  else if (xProfileUrl) output.warnings.push("X: the listed link is not a supported public profile URL.");

  for (const platform of ["Facebook", "LinkedIn", "TikTok", "Pinterest"] as const) {
    const profileUrl = string(input.socialProfiles[platform], 2048);
    if (profileUrl) {
      output.sources.push({ label: `${platform} public profile (link only; competitor metrics API unavailable)`, url: profileUrl });
      output.warnings.push(`${platform}: this app has no approved API for automatic competitor post metrics; the public profile link is saved only.`);
    }
  }

  await Promise.all(jobs);
  output.posts.sort((left, right) => (right.publishedAt ?? "").localeCompare(left.publishedAt ?? ""));
  return {
    ...output,
    posts: output.posts.slice(0, 45),
    platformMetrics: output.platformMetrics.slice(0, 12),
    sources: output.sources.slice(0, 30),
    warnings: [...new Set(output.warnings)].slice(0, 15),
  };
}
