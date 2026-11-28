import { env } from "../env.js";

type Json = Record<string, unknown>;
export type ApifyPost = {
  platform: string; url: string; publishedAt?: string; format: string; topic: string;
  hook: string; captionApproach: string; callToAction: string;
  metrics: { views?: number; likes?: number; comments?: number; shares?: number };
};
export type ApifyProfileMetric = { platform: string; capturedAt: string; metrics: { followers?: number; following?: number } };
type ActorConfig = { actorId: string; inputTemplate?: unknown; fields?: Record<string, string> };

// Public-data actor presets. Inputs are deliberately bounded; deployments can
// replace any preset using APIFY_COMPETITOR_ACTORS after reviewing actor terms.
const actorPresets: Record<string, ActorConfig> = {
  Instagram: {
    actorId: "apify/instagram-scraper",
    inputTemplate: { directUrls: ["{{profileUrl}}"], resultsType: "posts", resultsLimit: 10, skipPinnedPosts: true },
    fields: { url: "url", caption: "caption", publishedAt: "timestamp", views: "videoPlayCount", likes: "likesCount", comments: "commentsCount", shares: "sharesCount", format: "type" },
  },
  Facebook: {
    actorId: "automation-lab/facebook-pages-posts-scraper",
    inputTemplate: { startUrls: [{ url: "{{profileUrl}}" }], maxItems: 10 },
    fields: { url: "postUrl", caption: "text", publishedAt: "timestamp", views: "viewsCount", likes: "likesCount", comments: "commentsCount", shares: "sharesCount", format: "isVideo" },
  },
  TikTok: {
    actorId: "socialscrapers/tiktok-profile-scraper",
    inputTemplate: { profiles: ["{{profileUrl}}"], maxVideosPerProfile: 10 },
    fields: { url: "url", caption: "text", publishedAt: "createTimeISO", views: "playCount", likes: "diggCount", comments: "commentCount", shares: "shareCount" },
  },
  YouTube: {
    actorId: "k-data-lab/youtube-scraper",
    inputTemplate: { startUrls: ["{{profileUrl}}"], maxResults: 10, channelContent: ["videos"], videoDetails: true },
    fields: { url: "url", caption: "title", publishedAt: "publishedAt", views: "viewCount", likes: "likeCount", comments: "commentCount" },
  },
  X: {
    actorId: "eiv/twitter-scraper",
    inputTemplate: { profiles: ["{{username}}"], maxTweetsPerProfile: 10, maxTotalTweets: 10, includeRetweets: false },
    fields: { url: "url", caption: "text", publishedAt: "createdAt", views: "viewCount", likes: "likeCount", comments: "replyCount", shares: "retweetCount" },
  },
};
export const apifyCompetitorPlatforms = Object.keys(actorPresets);

function record(value: unknown): Json | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}
function field(value: unknown, path?: string): unknown {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((current, key) => record(current)?.[key], value);
}
function mappedField(value: unknown, mapping: Record<string, string>, key: string, aliases: string[] = []) {
  const mapped = field(value, mapping[key]);
  if (mapped !== undefined && mapped !== null) return mapped;
  for (const alias of aliases) {
    const fallback = field(value, alias);
    if (fallback !== undefined && fallback !== null) return fallback;
  }
  return undefined;
}
function str(value: unknown, limit = 1200) { return typeof value === "string" ? value.trim().slice(0, limit) : ""; }
function number(value: unknown) {
  const parsed = typeof value === "string" && /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value) ? Number(value.replaceAll(",", "")) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
function interpolate(value: unknown, profile: { url: string; username: string }) : unknown {
  if (typeof value === "string") return value.replaceAll("{{profileUrl}}", profile.url).replaceAll("{{username}}", profile.username);
  if (Array.isArray(value)) return value.map((item) => interpolate(item, profile));
  const source = record(value);
  return source ? Object.fromEntries(Object.entries(source).map(([key, item]) => [key, interpolate(item, profile)])) : value;
}
function usernameFromUrl(url: string) {
  try { return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "").replace(/^@/, ""); }
  catch { return ""; }
}

export async function collectInstagramProfileMetricsWithApify(profileUrl: string): Promise<{
  metric?: ApifyProfileMetric;
  source?: { label: string; url: string };
  warning?: string;
}> {
  if (!env.APIFY_API_TOKEN) return { warning: "Apify collection is not configured." };
  try {
    const username = usernameFromUrl(profileUrl);
    if (!username || new URL(profileUrl).hostname.replace(/^www\./, "") !== "instagram.com") {
      return { warning: "The Instagram profile URL is invalid." };
    }
    const endpoint = "https://api.apify.com/v2/acts/apify~instagram-followers-count-scraper/run-sync-get-dataset-items?format=json&clean=true&timeout=120";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.APIFY_API_TOKEN}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ usernames: [profileUrl] }),
      signal: AbortSignal.timeout(150_000),
    });
    if (!response.ok) {
      const reason = response.status === 401 || response.status === 403
        ? "Apify rejected the API token or Actor permission."
        : response.status === 429 ? "Apify rate limit reached." : `Apify Actor returned HTTP ${response.status}.`;
      return { warning: reason };
    }
    const rows: unknown = await response.json();
    const item = Array.isArray(rows) ? record(rows[0]) : null;
    const followers = number(item?.followersCount ?? item?.followers_count ?? item?.followers);
    const following = number(item?.followsCount ?? item?.follows_count ?? item?.following);
    if (followers === undefined && following === undefined) {
      return { warning: item ? "The Apify Actor returned no follower counts for this profile." : "The Apify Actor returned no readable profile result." };
    }
    return {
      metric: { platform: "Instagram", capturedAt: new Date().toISOString(), metrics: {
        ...(followers !== undefined ? { followers } : {}),
        ...(following !== undefined ? { following } : {}),
      } },
      source: { label: "Instagram public profile metrics via Apify Actor", url: profileUrl },
    };
  } catch (error) {
    return { warning: error instanceof Error ? error.message : "Apify profile collection failed." };
  }
}

export function normalizeApifyItems(input: unknown, platform: string, profileUrl: string, mapping: Record<string, string> = {}): ApifyPost[] {
  if (!Array.isArray(input)) return [];
  const rows: ApifyPost[] = [];
  const seen = new Set<string>();
  const candidates = input.flatMap((value) => {
    const nested = field(value, mapping.posts);
    return Array.isArray(nested) ? nested : [value];
  });
  for (const value of candidates) {
    const url = str(mappedField(value, mapping, "url"), 2048);
    if (!url.startsWith("https://") || seen.has(url)) continue;
    seen.add(url);
    const caption = str(mappedField(value, mapping, "caption", ["text", "description", "title"]));
    const date = str(mappedField(value, mapping, "publishedAt", ["timestamp", "postedAt", "createTimeISO", "publishedAt", "createdAt"]), 80);
    const parsedDate = date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : undefined;
    const rawFormat = mappedField(value, mapping, "format", ["media_type", "mediaType", "productType"]);
    const formatText = str(rawFormat, 60);
    const productType = str(field(value, "productType") ?? field(value, "product_type"), 60);
    const isVideo = typeof rawFormat === "boolean" ? rawFormat : /video|reel|clip/i.test(`${formatText} ${productType}`);
    const format = typeof rawFormat === "boolean"
      ? (rawFormat ? (platform === "Instagram" ? "Reel" : "Video") : "Post")
      : /sidecar|carousel|album/i.test(formatText) ? "Carousel"
        : /reel|clip/i.test(`${formatText} ${productType}`) ? "Reel"
          : /video/i.test(formatText) ? (platform === "Instagram" ? "Reel" : "Video")
            : /image|photo/i.test(formatText) ? "Image"
              : formatText || (platform === "YouTube" || platform === "TikTok" || isVideo ? "Video" : "Post");
    const views = number(mappedField(value, mapping, "views", ["videoPlayCount", "videoViewCount", "igPlayCount", "playCount", "viewCount", "view_count", "viewsCount", "views", "play_count", "video_view_count"]));
    const likes = number(mappedField(value, mapping, "likes", ["likesCount", "likeCount", "like_count", "diggCount"]));
    const comments = number(mappedField(value, mapping, "comments", ["commentsCount", "commentCount", "comments_count", "replyCount"]));
    const shares = number(mappedField(value, mapping, "shares", ["sharesCount", "shareCount", "shares_count", "retweetCount"]));
    rows.push({
      platform, url, ...(parsedDate ? { publishedAt: parsedDate } : {}),
      format,
      topic: caption.slice(0, 180) || "Public post", hook: caption.slice(0, 1000), captionApproach: caption, callToAction: "",
      metrics: {
        ...(views !== undefined ? { views } : {}),
        ...(likes !== undefined ? { likes } : {}),
        ...(comments !== undefined ? { comments } : {}),
        ...(shares !== undefined ? { shares } : {}),
      },
    });
  }
  void profileUrl;
  return rows.slice(0, 15);
}

export async function collectWithApify(profiles: Record<string, unknown>, options: { collectInstagramProfileMetrics?: boolean } = {}) {
  const output: { posts: ApifyPost[]; platformMetrics: ApifyProfileMetric[]; sources: Array<{ label: string; url: string }>; warnings: string[] } = { posts: [], platformMetrics: [], sources: [], warnings: [] };
  if (!env.APIFY_API_TOKEN) {
    if (Object.values(profiles).some((url) => typeof url === "string" && url.startsWith("https://"))) output.warnings.push("Apify collection is not configured; public profile links remain available without post metrics.");
    return output;
  }
  for (const [platform, rawUrl] of Object.entries(profiles)) {
    if (typeof rawUrl !== "string" || !rawUrl.startsWith("https://")) continue;
    const configured = record(env.APIFY_COMPETITOR_ACTORS?.[platform]) as ActorConfig | null;
    const config = configured?.actorId ? configured : actorPresets[platform];
    if (!config) continue;
    const profile = { url: rawUrl, username: usernameFromUrl(rawUrl) };

    // Fetch account-level Instagram audience data independently from the post
    // actor. A post scraper may fail or return no posts while follower counts
    // are still available, so neither request should block the other.
    if (platform === "Instagram" && options.collectInstagramProfileMetrics !== false) {
      const result = await collectInstagramProfileMetricsWithApify(rawUrl);
      if (result.metric) output.platformMetrics.push(result.metric);
      if (result.source) output.sources.push(result.source);
      if (result.warning) output.warnings.push(`Instagram profile metrics: ${result.warning}`);
    }

    try {
      const actorPath = config.actorId.replace("/", "~");
      const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorPath)}/run-sync-get-dataset-items?format=json&clean=true&timeout=120`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.APIFY_API_TOKEN}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(interpolate(config.inputTemplate ?? { profileUrl: "{{profileUrl}}" }, profile)),
        signal: AbortSignal.timeout(150_000),
      });
      if (!response.ok) {
        const message = response.status === 401 || response.status === 403 ? "Apify rejected the API token or Actor permission." : response.status === 429 ? "Apify rate limit reached." : `Apify Actor returned HTTP ${response.status}.`;
        output.warnings.push(`${platform}: ${message}`); continue;
      }
      let items: unknown;
      try { items = await response.json(); } catch { output.warnings.push(`${platform}: Apify returned unreadable dataset items.`); continue; }
      const mapping = config.fields ?? actorPresets[platform]?.fields ?? {};
      const platformItems = Array.isArray(items) ? items : [];
      const filtered = platformItems.filter((item) => {
        const recordType = field(item, "recordType") ?? field(item, "dataType");
        if (recordType === undefined) return true;
        return ["video", "post", "image", "carousel", "reel"].includes(String(recordType).toLowerCase());
      });
      const normalized = normalizeApifyItems(filtered, platform, rawUrl, mapping);
      const posts = platform === "Instagram" && mapping.posts === "recentPosts"
        ? normalizeApifyItems(platformItems, platform, rawUrl, mapping)
        : normalized;
      output.sources.push({ label: `${platform} public posts via Apify Actor`, url: rawUrl });
      output.posts.push(...posts);
      if (!posts.length) output.warnings.push(`${platform}: the configured Actor returned no mapped public posts. Check its input template and field mapping.`);

    } catch (error) {
      output.warnings.push(`${platform}: ${error instanceof Error ? error.message : "Apify collection failed."}`);
    }
  }
  return output;
}
