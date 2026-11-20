import { z } from "zod";

const tavilyResponseSchema = z.object({
  results: z.array(z.object({
    title: z.string().max(1000).optional(),
    url: z.string().url().max(2048),
  }).passthrough()).optional(),
}).passthrough();

export type CompetitorWebsiteResult = {
  title: string;
  url: string;
  domain: string;
};

export function normalizeCompetitorWebsiteResults(input: unknown): CompetitorWebsiteResult[] {
  const parsed = tavilyResponseSchema.parse(input);
  const results: CompetitorWebsiteResult[] = [];
  const seenDomains = new Set<string>();
  for (const result of parsed.results ?? []) {
    let url: URL;
    try {
      url = new URL(result.url);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.username || url.password) continue;
    const domain = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!domain || seenDomains.has(domain)) continue;
    seenDomains.add(domain);
    url.search = "";
    url.hash = "";
    results.push({
      title: result.title?.trim().slice(0, 180) || domain,
      url: url.toString(),
      domain,
    });
    if (results.length === 8) break;
  }
  return results;
}

export async function searchCompetitorWebsites(query: string, apiKey: string): Promise<CompetitorWebsiteResult[]> {
  const response = await fetch("https://api.tavily.com/search", {
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
      max_results: 12,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Tavily Search returned HTTP ${response.status}.`);
  }
  return normalizeCompetitorWebsiteResults(await response.json());
}
