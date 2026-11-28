import { z } from "zod";

const tavilyResponseSchema = z.object({
  results: z.array(z.object({
    title: z.string().max(1000).optional(),
    url: z.string().url().max(2048),
    content: z.string().max(12_000).optional(),
  }).passthrough()).optional(),
}).passthrough();

export type CompetitorWebsiteResult = {
  title: string;
  url: string;
  domain: string;
  description: string;
};

export class CompetitorWebSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompetitorWebSearchError";
  }
}

export function normalizeCompetitorWebsiteResults(input: unknown): CompetitorWebsiteResult[] {
  const parsed = tavilyResponseSchema.parse(input);
  const results: CompetitorWebsiteResult[] = [];
  const seenDomains = new Set<string>();
  const excludedHosts = new Set([
    "youtube.com", "instagram.com", "facebook.com", "linkedin.com", "tiktok.com", "x.com", "twitter.com", "pinterest.com",
    "wanderlog.com", "tripadvisor.com", "magicpin.in", "zomato.com", "swiggy.com", "justdial.com", "indiamart.com", "tracxn.com",
    "yelp.com", "google.com", "maps.google.com", "booking.com", "makemytrip.com", "easemytrip.com", "agoda.com", "expedia.com",
    "restaurant-guru.com", "dinefine.in", "venueLook.com", "venuelook.com", "bharatibiz.com", "yappe.in", "rocketreach.co",
    "thecompanycheck.com", "zaubacorp.com", "crunchbase.com", "glassdoor.com", "indeed.com", "medium.com", "wikipedia.org",
    "foursquare.com", "nearbuy.com", "eazydiner.com", "restaurantji.com",
    "sulekha.com", "justdial.com", "indianyellowpages.com", "tradeindia.com", "apollo.io", "zoominfo.com", "owler.com",
  ]);
  const nonBusinessTitle = /\b(?:list of|market trends?|industry report|sector report|market map|startups? in|top \d+|best \d+|directory|business listings?|reviews? and ratings?|menu and prices?)\b/i;
  for (const result of parsed.results ?? []) {
    let url: URL;
    try {
      url = new URL(result.url);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.username || url.password) continue;
    const domain = url.hostname.toLowerCase().replace(/^www\./, "");
    const segments = url.pathname.split("/").filter(Boolean);
    if (excludedHosts.has(domain) || [...excludedHosts].some((host) => domain.endsWith(`.${host}`))) continue;
    if (nonBusinessTitle.test(result.title ?? "") || nonBusinessTitle.test(result.content ?? "")) continue;
    // A search result that points to a restaurant/listing page is evidence about a
    // listing, not a verified company homepage. Avoid presenting it as a competitor.
    if (segments.length > 1) continue;
    if (!domain || seenDomains.has(domain)) continue;
    seenDomains.add(domain);
    url.search = "";
    url.hash = "";
    results.push({
      title: result.title?.trim().slice(0, 180) || domain,
      url: url.toString(),
      domain,
      description: result.content?.trim().slice(0, 2000) ?? "",
    });
    if (results.length === 20) break;
  }
  return results;
}

export async function searchCompetitorWebsites(query: string, apiKey: string): Promise<CompetitorWebsiteResult[]> {
  let response: Response;
  try {
    response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        topic: "general",
        search_depth: "basic",
        max_results: 20,
        exclude_domains: [
          "youtube.com", "instagram.com", "facebook.com", "linkedin.com", "tiktok.com", "x.com", "twitter.com", "pinterest.com",
          "wanderlog.com", "tripadvisor.com", "magicpin.in", "zomato.com", "swiggy.com", "justdial.com", "indiamart.com", "tracxn.com",
          "yelp.com", "booking.com", "makemytrip.com", "agoda.com", "expedia.com", "restaurant-guru.com", "venuelook.com",
          "bharatibiz.com", "yappe.in", "rocketreach.co", "crunchbase.com", "glassdoor.com", "indeed.com", "wikipedia.org",
        "foursquare.com", "nearbuy.com", "eazydiner.com", "restaurantji.com", "sulekha.com", "tradeindia.com", "zoominfo.com", "owler.com",
        ],
        include_answer: false,
        include_raw_content: false,
        include_images: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new CompetitorWebSearchError("Tavily Search timed out. Retry discovery in a moment.");
    }
    if (error instanceof TypeError) {
      throw new CompetitorWebSearchError("Could not connect to Tavily Search. Check the API server's internet connection.");
    }
    throw error;
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new CompetitorWebSearchError("Tavily rejected the API key. Verify TAVILY_API_KEY in apps/api/.env and restart the API.");
    }
    if (response.status === 429) {
      throw new CompetitorWebSearchError("Tavily Search rate limit or usage quota was reached. Check the Tavily account usage and retry later.");
    }
    throw new CompetitorWebSearchError(`Tavily Search is temporarily unavailable (HTTP ${response.status}). Retry discovery in a moment.`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CompetitorWebSearchError("Tavily Search returned an unreadable response. Retry discovery in a moment.");
  }
  try {
    return normalizeCompetitorWebsiteResults(body);
  } catch {
    throw new CompetitorWebSearchError("Tavily Search returned an unexpected response. Retry discovery in a moment.");
  }
}

const socialHosts = {
  Instagram: ["instagram.com"], Facebook: ["facebook.com"], TikTok: ["tiktok.com"],
  YouTube: ["youtube.com"], X: ["x.com", "twitter.com"],
} as const;

function isProfilePath(platform: keyof typeof socialHosts, url: URL) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (platform === "Instagram") return parts.length === 1 && /^[a-z\d._]{1,30}$/i.test(parts[0]!);
  if (platform === "Facebook") return parts.length === 1 || (parts.length === 1 && parts[0] === "profile.php");
  if (platform === "TikTok") return parts.length === 1 && /^@[\w.-]{2,24}$/.test(parts[0]!);
  if (platform === "YouTube") return parts.length === 1 && (parts[0]!.startsWith("@") || ["channel", "c", "user"].includes(parts[0]!));
  return parts.length === 1 && /^[\w]{1,15}$/i.test(parts[0]!);
}

/** Tavily's indexed results are treated as candidates. Caller verifies against official-site links and identity text. */
export async function searchCompetitorSocialProfiles(input: {
  name: string; websiteUrl?: string | null; location?: string | null; apiKey: string;
}): Promise<Array<{ platform: keyof typeof socialHosts; url: string; evidence: string }>> {
  const host = (() => { try { return new URL(input.websiteUrl ?? "").hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const platforms = Object.keys(socialHosts) as Array<keyof typeof socialHosts>;
  const results = await Promise.all(platforms.map(async (platform) => {
    const query = `"${input.name}" ${host} ${input.location ?? ""} official ${platform} profile`;
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: input.apiKey, query, topic: "general", search_depth: "basic", max_results: 6,
        include_domains: [...socialHosts[platform]], include_answer: false, include_raw_content: false }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return [];
    let body: unknown;
    try { body = await response.json(); } catch { return []; }
    const parsed = tavilyResponseSchema.safeParse(body);
    if (!parsed.success) return [];
    const nameTokens = input.name.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
    return (parsed.data.results ?? []).flatMap((result) => {
      let url: URL;
      try { url = new URL(result.url); } catch { return []; }
      const resultHost = url.hostname.toLowerCase().replace(/^www\./, "");
      if (url.protocol !== "https:" || !socialHosts[platform].some((allowed) => resultHost === allowed || resultHost.endsWith(`.${allowed}`)) || !isProfilePath(platform, url)) return [];
      const evidence = `${result.title ?? ""} ${result.content ?? ""}`.toLowerCase();
      const nameMatched = nameTokens.filter((token) => evidence.includes(token)).length;
      if (!host || (!evidence.includes(host) && nameMatched < Math.min(2, nameTokens.length))) return [];
      url.search = ""; url.hash = "";
      return [{ platform, url: url.toString(), evidence: (result.content ?? result.title ?? "").slice(0, 500) }];
    });
  }));
  return [...new Map(results.flat().map((item) => [`${item.platform}:${item.url}`, item])).values()];
}
