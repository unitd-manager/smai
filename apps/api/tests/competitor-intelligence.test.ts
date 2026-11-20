import assert from "node:assert/strict";
import test from "node:test";
import { parseCompetitorAnalysis, type CompetitorAnalysis } from "../src/services/competitor-intelligence.js";
import { normalizeCompetitorWebsiteResults, searchCompetitorWebsites } from "../src/services/competitor-web-search.js";
import { extractPublicWebsite, isPublicAddress, researchPublicWebsite } from "../src/services/public-website-research.js";

const validAnalysis: CompetitorAnalysis = {
  summary: "The recorded profile emphasizes local service and practical advice.",
  positioning: {
    position: "Evidence-limited position hypothesis.",
    valueProposition: "A value proposition written in the supplied profile.",
    voiceAndMessaging: "A cautious description of the recorded messaging.",
    differentiation: "A distinct positioning idea for the user's brand.",
    evidence: ["Source: official profile, observation 1."],
  },
  content: {
    pillars: [],
    formats: [],
    patterns: [],
    repetitionAndGaps: [],
    reverseEngineering: [],
  },
  audience: {
    questions: [],
    concerns: [],
    discussionTriggers: [],
    sentiment: "Unavailable; no comments were recorded.",
    unmetNeeds: [],
    responsePatterns: [],
    privacyNote: "Only aggregated, business-level themes are analyzed.",
  },
  creative: { identitySignals: [], distinctiveApproaches: [], differentiationIdeas: [] },
  websiteAndCampaigns: { websiteFindings: [], seoFindings: [], conversionFindings: [], visibleCampaigns: [], evidenceLimits: [] },
  swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
  opportunities: [],
  actionPlan: { start: [], stop: [], doDifferently: [], formatsToPrioritize: [], topicsToOwn: [], audienceNeeds: [], engagement: [], positioning: [], conversion: [] },
  contentIdeas: [],
  dataLimits: ["Follower and engagement metrics were not supplied."],
};

test("competitor intelligence accepts a bounded, evidence-limited report", () => {
  const parsed = parseCompetitorAnalysis(JSON.stringify(validAnalysis));
  assert.equal(parsed.summary, validAnalysis.summary);
  assert.equal(parsed.positioning.evidence[0], validAnalysis.positioning.evidence[0]);
  assert.equal(parsed.dataLimits[0], validAnalysis.dataLimits[0]);
});

test("competitor intelligence rejects unsupported opportunity scores and extra fields", () => {
  const invalidScore = structuredClone(validAnalysis);
  invalidScore.opportunities = [{
    title: "Test opportunity",
    explanation: "Evidence-bound explanation.",
    action: "Record a useful observation.",
    evidence: "Hypothesis only.",
    impact: 6,
    ease: 3,
    advantage: 3,
    audienceRelevance: 3,
    conversionPotential: 3,
  }];
  assert.throws(() => parseCompetitorAnalysis(JSON.stringify(invalidScore)));

  assert.throws(() => parseCompetitorAnalysis(JSON.stringify({ ...validAnalysis, inventedMetric: 123 })));
});

test("public website research extracts homepage text and official social links only", () => {
  const report = extractPublicWebsite(
    `<html><head><title>Example Studio</title><meta name="description" content="Marketing services"></head>
      <body><h1>Grow your business</h1><p>Our services and approach.</p>
      <a href="https://www.instagram.com/example/">Instagram</a>
      <a href="http://facebook.com/example">Ignore insecure link</a>
      <script>Ignore hidden content</script></body></html>`,
    "https://example.com/",
  );
  assert.equal(report.title, "Example Studio");
  assert.equal(report.description, "Marketing services");
  assert.match(report.excerpt, /Grow your business/);
  assert.doesNotMatch(report.excerpt, /Ignore hidden content/);
  assert.equal(report.socialProfiles.Instagram, "https://www.instagram.com/example/");
  assert.equal(report.socialProfiles.Facebook, undefined);
});

test("public website research rejects private destinations and non-HTTPS URLs", async () => {
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("127.0.0.1"), false);
  assert.equal(isPublicAddress("10.0.0.8"), false);
  assert.equal(isPublicAddress("192.168.1.1"), false);
  assert.equal(isPublicAddress("::ffff:127.0.0.1"), false);
  assert.equal(isPublicAddress("2001:4860:4860::8888"), true);
  assert.equal(isPublicAddress("2001:db8::1"), false);
  await assert.rejects(researchPublicWebsite("http://example.com"), /public HTTPS URL/);
  await assert.rejects(researchPublicWebsite("https://127.0.0.1"), /public domain names/);
});

test("in-dashboard search returns deduplicated HTTPS website links without result snippets", () => {
  const results = normalizeCompetitorWebsiteResults({
    results: [
      { title: "Example Company", url: "https://www.example.com/?tracking=1", content: "Search snippet should not be returned." },
      { title: "Example Company careers", url: "https://example.com/careers" },
      { title: "Insecure result", url: "http://insecure.example" },
      { title: "Another Company", url: "https://another.example/" },
    ],
  });
  assert.deepEqual(results, [
    { title: "Example Company", url: "https://www.example.com/", domain: "example.com" },
    { title: "Another Company", url: "https://another.example/", domain: "another.example" },
  ]);
  assert.equal("content" in results[0]!, false);
});

test("in-dashboard search calls Tavily without requesting answer or page content", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({
      results: [{ title: "Example Company", url: "https://example.com/", content: "Private search snippet" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const results = await searchCompetitorWebsites("marketing software", "test-api-key");
    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
    assert.equal(requestUrl, "https://api.tavily.com/search");
    assert.equal(requestInit?.method, "POST");
    assert.equal(body.api_key, "test-api-key");
    assert.equal(body.query, "marketing software");
    assert.equal(body.include_answer, false);
    assert.equal(body.include_raw_content, false);
    assert.deepEqual(results, [{ title: "Example Company", url: "https://example.com/", domain: "example.com" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
