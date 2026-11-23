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
