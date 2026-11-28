import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { analyzeCompetitor, buildEvidenceOnlyAnalysis } from "./competitor-intelligence.js";
import { searchCompetitorSocialProfiles, searchCompetitorWebsites } from "./competitor-web-search.js";
import { researchPublicWebsite } from "./public-website-research.js";
import { collectWithApify } from "./competitor-apify.js";
import { researchCompetitorSocial } from "./competitor-social-research.js";

type ResearchBrand = Prisma.BrandGetPayload<{ include: { profile: true; kit: true } }>;
type DiscoveryBrand = Prisma.BrandGetPayload<{ include: { profile: true } }>;
type ResearchCompetitor = Prisma.CompetitorGetPayload<{ include: { snapshots: { take: 1; orderBy: { observedAt: "desc" } } } }>;

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function wellFormedText(value: string) {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += value.slice(index, index + 2);
        index += 1;
      } else result += "�";
    } else if (code >= 0xdc00 && code <= 0xdfff) result += "�";
    else result += value.slice(index, index + 1);
  }
  return result;
}
function sanitizeJson(value: unknown): unknown {
  if (typeof value === "string") return wellFormedText(value);
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [wellFormedText(key), sanitizeJson(item)]));
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value === "bigint" || typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") return null;
  return value;
}
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 40); }
function profileKey(profile: Record<string, unknown>) {
  return hash([profile.industry, profile.segment, profile.products, profile.offers, profile.description, profile.audience, profile.city, profile.country, profile.companyWebsite]);
}

export async function enqueueCompetitorResearch(workspaceId: string, brandId: string, dedupeKey?: string) {
  const brand = await prisma.brand.findFirst({ where: { id: brandId, workspaceId }, include: { profile: true } });
  if (!brand?.profile) return null;
  const profile = brand.profile;
  if (![profile.industry, profile.segment, profile.products, profile.description].some((value) => Boolean(value?.trim()))) return null;
  const key = dedupeKey ?? `profile-${profileKey(profile as unknown as Record<string, unknown>)}`;
  try {
    return await prisma.competitorResearchJob.create({ data: { workspaceId, brandId, dedupeKey: key } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.competitorResearchJob.findUnique({ where: { workspaceId_brandId_dedupeKey: { workspaceId, brandId, dedupeKey: key } } });
    }
    throw error;
  }
}

function currentWeekKey(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${year}-${String(week).padStart(2, "0")}`;
}

export async function enqueueDueCompetitorRefreshes(now = new Date()) {
  const brands = await prisma.brand.findMany({ where: { profile: { is: { OR: [
    { industry: { not: null } }, { products: { not: null } }, { description: { not: null } },
  ] } } }, select: { id: true, workspaceId: true, competitorResearchJobs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, completedAt: true } } } });
  const weekKey = currentWeekKey(now);
  for (const brand of brands) {
    const latest = brand.competitorResearchJobs[0];
    if (latest && ["QUEUED", "RUNNING"].includes(latest.status)) continue;
    if (latest?.completedAt && now.getTime() - latest.completedAt.getTime() < 7 * 86400_000) continue;
    await enqueueCompetitorResearch(brand.workspaceId, brand.id, `refresh-${weekKey}`).catch((error: unknown) => {
      console.error("Could not enqueue scheduled competitor refresh.", { brandId: brand.id, error });
    });
  }
}

function mergePosts(...lists: unknown[][]) {
  const posts = new Map<string, Record<string, unknown>>();
  for (const item of lists.flat()) {
    const post = object(item);
    if (typeof post.url !== "string") continue;
    const prior = posts.get(post.url);
    posts.set(post.url, prior ? { ...prior, ...post, metrics: { ...object(prior.metrics), ...object(post.metrics) } } : post);
  }
  return [...posts.values()].sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? ""))).slice(0, 45);
}

async function verifiedDiscover(workspaceId: string, brand: DiscoveryBrand) {
  if (!env.TAVILY_API_KEY) throw new Error("Competitor research is waiting for TAVILY_API_KEY in the API environment.");
  const p = brand.profile;
  const location = [p?.city, p?.country].filter(Boolean).join(", ");
  const industry = p?.industry?.trim() || p?.segment?.trim() || "";
  const subject = industry || p?.products?.trim() || p?.description?.trim() || brand.name;
  const products = [p?.products, p?.offers].filter(Boolean).join(" ").slice(0, 180);
  const queries = [...new Set([
    `official website ${subject} ${products} ${location}`,
    `${subject} companies ${location} ${products}`,
    `${subject} local businesses ${location} official website`,
  ].map((q) => q.replace(/\s+/g, " ").trim()).filter((q) => q.length > 10))];
  const outcomes = await Promise.allSettled(queries.map((query) => searchCompetitorWebsites(query, env.TAVILY_API_KEY!)));
  const warnings = outcomes.flatMap((item) => item.status === "rejected" ? [item.reason instanceof Error ? item.reason.message : "One Tavily search failed."] : []);
  const results = outcomes.flatMap((item) => item.status === "fulfilled" ? item.value : []);
  if (!results.length && warnings.length) throw new Error(warnings.join(" "));
  const tracked = await prisma.competitor.findMany({ where: { workspaceId, brandId: brand.id }, select: { websiteUrl: true } });
  const known = new Set(tracked.flatMap((item) => { try { return [new URL(item.websiteUrl ?? "").hostname.toLowerCase().replace(/^www\./, "")]; } catch { return []; } }));
  if (p?.companyWebsite) { try { known.add(new URL(p.companyWebsite).hostname.toLowerCase().replace(/^www\./, "")); } catch { /* invalid saved website */ } }
  const unique = [...new Map(results.map((item) => [item.domain, item])).values()].filter((item) => !known.has(item.domain));
  const openSlots = Math.max(0, 3 - tracked.length);
  const candidates = unique.slice(0, 12);
  const checks = await Promise.allSettled(candidates.map(async (candidate) => ({ candidate, report: await researchPublicWebsite(candidate.url) })));
  const discovered: Array<{ id: string; name: string; websiteUrl: string | null }> = [];
  const badTitles = /\b(?:list of|market trends?|industry report|sector report|market map|startups? in|top \d+|best \d+|directory|business listings?|reviews? and ratings?|menu and prices?|search results?)\b/i;
  for (const outcome of checks) {
    if (discovered.length >= openSlots || outcome.status !== "fulfilled") continue;
    const { candidate, report } = outcome.value;
    const name = (report.title || "").replace(/\s*[|–—-]\s*(?:official (?:website|site)|home(?:page)?)\s*$/i, "").trim();
    if (name.length < 3 || badTitles.test(`${name} ${report.description ?? ""}`) || !(report.logoUrl || report.logoText)) continue;
    const social = { ...report.socialProfiles };
    let discoveredSocial: Awaited<ReturnType<typeof searchCompetitorSocialProfiles>> = [];
    if (env.TAVILY_API_KEY) {
      discoveredSocial = await searchCompetitorSocialProfiles({ name, websiteUrl: candidate.url, location, apiKey: env.TAVILY_API_KEY }).catch((error: unknown) => {
        warnings.push(`${name}: social profile search failed (${error instanceof Error ? error.message : "search error"}).`);
        return [];
      });
      for (const item of discoveredSocial) if (!social[item.platform]) social[item.platform] = item.url;
    }
    const competitor = await prisma.competitor.create({ data: {
      workspaceId, brandId: brand.id, name: name.slice(0, 191), category: "direct", industry: industry || null,
      websiteUrl: candidate.url, location: location || null, overview: report.description || candidate.description || null,
      products: products || null, socialProfiles: social as Prisma.InputJsonValue, keywords: industry ? [industry] : [],
      notes: "Discovered from Tavily public search and verified against the business homepage. Social URLs are public indexed candidates unless linked by the official site.",
      snapshots: { create: { workspaceId, brandId: brand.id, observedAt: new Date(), sources: [
        { label: "Verified business homepage", url: report.finalUrl },
        ...discoveredSocial.map((item) => ({ label: `${item.platform} indexed profile candidate`, url: item.url })),
      ], observations: {
        platformMetrics: [], posts: [], websiteFindings: [], seoFindings: [], audienceThemes: [], responsePatterns: [], visibleCampaigns: [], creativeNotes: [],
        notes: "Homepage identity and available public social links saved. Search-indexed social profiles are candidates and may need manual identity confirmation.",
        websiteResearch: { competitorWebsite: { ...report, discoveredSocialProfiles: social }, warnings: [] },
      } } },
    } });
    discovered.push({ id: competitor.id, name: competitor.name, websiteUrl: competitor.websiteUrl });
    known.add(candidate.domain);
  }
  return { warnings, discovered };
}

async function collectAndAnalyzeCompetitor(
  workspaceId: string,
  brand: ResearchBrand,
  competitor: ResearchCompetitor,
) {
  const warnings: string[] = [];
  const [brandWebsite, competitorWebsite] = await Promise.all([
    brand.profile?.companyWebsite ? researchPublicWebsite(brand.profile.companyWebsite).catch((error: unknown) => { warnings.push(`Brand website: ${error instanceof Error ? error.message : "research failed"}`); return null; }) : Promise.resolve(null),
    competitor.websiteUrl ? researchPublicWebsite(competitor.websiteUrl).catch((error: unknown) => { warnings.push(`Competitor website: ${error instanceof Error ? error.message : "research failed"}`); return null; }) : Promise.resolve(null),
  ]);
  const mergedProfiles: Record<string, unknown> = { ...object(competitor.socialProfiles), ...(competitorWebsite?.socialProfiles ?? {}) };
  for (const [platform, url] of Object.entries(mergedProfiles)) if (typeof url !== "string" || !/^https:\/\//.test(url)) delete mergedProfiles[platform];
  if (env.TAVILY_API_KEY) {
    const indexed = await searchCompetitorSocialProfiles({ name: competitor.name, websiteUrl: competitor.websiteUrl, location: competitor.location, apiKey: env.TAVILY_API_KEY }).catch(() => []);
    for (const item of indexed) if (!mergedProfiles[item.platform]) mergedProfiles[item.platform] = item.url;
  }
  const socialProfileUrls = Object.fromEntries(Object.entries(mergedProfiles).filter(([key]) => ["Instagram", "Facebook", "TikTok", "YouTube", "X"].includes(key)));
  const [facebookUserAccount, facebookPages] = await Promise.all([
    prisma.socialAccount.findFirst({ where: { workspaceId, provider: "facebook-user", status: "CONNECTED" }, select: { id: true, encryptedTokens: true, tokenExpiresAt: true } }),
    prisma.socialAccount.findMany({ where: { workspaceId, provider: "facebook", status: "CONNECTED" }, select: { providerAccountId: true, encryptedTokens: true } }),
  ]);
  const officialApi = await researchCompetitorSocial({ socialProfiles: mergedProfiles,
    facebookUserAccount: facebookUserAccount ? { ...facebookUserAccount } : null,
    facebookPages: facebookPages.map((page) => ({ ...page })),
  });
  const apify = await collectWithApify(socialProfileUrls, {
    collectInstagramProfileMetrics: !officialApi.platformMetrics.some((metric) => metric.platform === "Instagram" && metric.metrics.followers !== undefined),
  });
  warnings.push(...officialApi.warnings, ...apify.warnings);
  const priorSnapshot = competitor.snapshots[0] ?? null;
  const priorObservations = object(priorSnapshot?.observations);
  const posts = mergePosts(Array.isArray(priorObservations.posts) ? priorObservations.posts : [], officialApi.posts, apify.posts);
  const metricByPlatform = new Map<string, Record<string, unknown>>();
  for (const item of [...(Array.isArray(priorObservations.platformMetrics) ? priorObservations.platformMetrics : []), ...officialApi.platformMetrics, ...apify.platformMetrics]) {
    const metric = object(item); if (typeof metric.platform !== "string") continue;
    metricByPlatform.set(metric.platform, { ...metricByPlatform.get(metric.platform), ...metric, metrics: { ...object(metricByPlatform.get(metric.platform)?.metrics), ...object(metric.metrics) } });
  }
  const sources = [
    ...(brandWebsite ? [{ label: "Brand Kit website", url: brandWebsite.finalUrl }] : []),
    ...(competitorWebsite ? [{ label: "Competitor homepage", url: competitorWebsite.finalUrl }] : []),
    ...Object.entries(mergedProfiles).flatMap(([platform, url]) => typeof url === "string" ? [{ label: `${platform} public profile`, url }] : []),
    ...apify.sources,
  ];
  const websiteFindings = [
    ...(brandWebsite ? [`Brand website title: ${brandWebsite.title ?? "not provided"}. Description: ${brandWebsite.description ?? "not provided"}.`] : []),
    ...(competitorWebsite ? [`Competitor website title: ${competitorWebsite.title ?? "not provided"}. Description: ${competitorWebsite.description ?? "not provided"}.`, ...(competitorWebsite.excerpt ? [`Visible homepage text: ${competitorWebsite.excerpt}`] : [])] : []),
  ];
  const warningsUnique = [...new Set(warnings)];
  const observations = {
    ...priorObservations,
    platformMetrics: [...metricByPlatform.values()].slice(0, 12), posts,
    websiteFindings: [...websiteFindings, ...(Array.isArray(priorObservations.websiteFindings) ? priorObservations.websiteFindings : [])].slice(0, 30),
    websiteResearch: { brandWebsite, competitorWebsite, warnings: warningsUnique },
    notes: typeof priorObservations.notes === "string" ? priorObservations.notes : "",
  };
  await prisma.competitor.update({ where: { id: competitor.id }, data: { socialProfiles: sanitizeJson(mergedProfiles) as Prisma.InputJsonValue } });
  const snapshot = await prisma.competitorSnapshot.create({ data: {
    workspaceId, brandId: brand.id, competitorId: competitor.id, observedAt: new Date(),
    sources: sanitizeJson(sources.slice(0, 30)) as Prisma.InputJsonValue,
    observations: sanitizeJson(observations) as Prisma.InputJsonValue,
  } });
  const analysisRequest = {
    business: {
      name: brand.name, industry: brand.profile?.industry ?? null, description: brand.profile?.description ?? null,
      products: brand.profile?.products ?? null, audience: brand.profile?.audience ?? null,
      location: [brand.profile?.city, brand.profile?.country].filter(Boolean).join(", ") || null,
      tone: brand.profile?.tone ?? null, website: brand.profile?.companyWebsite ?? null,
      brandKit: { colors: strings(brand.kit?.colors).slice(0, 12), fonts: strings(brand.kit?.fonts).slice(0, 12) },
    },
    competitor: {
      name: competitor.name, category: competitor.category, industry: competitor.industry, websiteUrl: competitor.websiteUrl,
      location: competitor.location, overview: competitor.overview, products: competitor.products, audience: competitor.audience,
      uniqueValue: competitor.uniqueValue, brandVoice: competitor.brandVoice, socialProfiles: mergedProfiles,
      keywords: competitor.keywords, notes: competitor.notes,
    },
    observations, sources,
  };
  let analysis: Awaited<ReturnType<typeof analyzeCompetitor>>;
  try {
    analysis = await analyzeCompetitor(analysisRequest);
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 320) : "AI analysis provider unavailable.";
    warningsUnique.push(`AI interpretation unavailable; saved public evidence is shown without AI strategy. ${reason}`);
    analysis = { analysis: buildEvidenceOnlyAnalysis(analysisRequest), provider: "evidence-only" };
  }
  await prisma.competitorSnapshot.update({ where: { id: snapshot.id }, data: { analysisJson: sanitizeJson(analysis.analysis) as Prisma.InputJsonValue, analysisProvider: analysis.provider } });
  return { warnings: warningsUnique, postCount: posts.length };
}

async function processCompetitorResearchJob() {
  const stale = new Date(Date.now() - 12 * 60_000);
  await prisma.competitorResearchJob.updateMany({ where: { status: "RUNNING", updatedAt: { lt: stale }, attempts: { lt: 3 } }, data: { status: "QUEUED", stage: "Retrying interrupted research", runAt: new Date(), error: "Previous worker stopped before completing this job." } });
  await prisma.competitorResearchJob.updateMany({ where: { status: "RUNNING", updatedAt: { lt: stale }, attempts: { gte: 3 } }, data: { status: "FAILED", stage: "Failed", completedAt: new Date(), error: "Research worker stopped repeatedly before completing this job." } });
  const queued = await prisma.competitorResearchJob.findFirst({ where: { status: "QUEUED", runAt: { lte: new Date() } }, orderBy: [{ createdAt: "asc" }] });
  if (!queued) return;
  const claimed = await prisma.competitorResearchJob.updateMany({ where: { id: queued.id, status: "QUEUED" }, data: { status: "RUNNING", stage: "Discovering competitors", progress: 5, attempts: { increment: 1 }, startedAt: new Date(), error: null } });
  if (!claimed.count) return;
  const warnings: string[] = [];
  const heartbeat = setInterval(() => {
    void prisma.competitorResearchJob.updateMany({ where: { id: queued.id, status: "RUNNING" }, data: { updatedAt: new Date() } })
      .catch((error: unknown) => console.error("Could not update competitor research heartbeat.", { jobId: queued.id, error }));
  }, 60_000);
  heartbeat.unref();
  try {
    const brand = await prisma.brand.findFirst({ where: { id: queued.brandId, workspaceId: queued.workspaceId }, include: { profile: true, kit: true } });
    if (!brand?.profile) throw new Error("Save a complete Brand Kit profile before competitor research can run.");
    const discovery = env.TAVILY_API_KEY
      ? await verifiedDiscover(queued.workspaceId, brand)
      : { warnings: ["Tavily is not configured. Existing saved competitor profiles will be refreshed, but new competitors cannot be discovered."], discovered: [] };
    warnings.push(...discovery.warnings);
    await prisma.competitorResearchJob.update({ where: { id: queued.id }, data: { stage: "Finding public social profiles", progress: 35, warnings: warnings as Prisma.InputJsonValue } });
    const competitors = await prisma.competitor.findMany({
      where: { workspaceId: queued.workspaceId, brandId: queued.brandId },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }], take: 25,
      include: { snapshots: { orderBy: { observedAt: "desc" }, take: 1 } },
    });
    let completed = 0;
    let failedProfiles = 0;
    for (const competitor of competitors) {
      const progress = 40 + Math.round((completed / Math.max(competitors.length, 1)) * 55);
      await prisma.competitorResearchJob.update({ where: { id: queued.id }, data: { stage: `Collecting and analyzing ${competitor.name}`, progress } });
      try {
        const result = await collectAndAnalyzeCompetitor(queued.workspaceId, brand, competitor);
        warnings.push(...result.warnings.map((warning) => `${competitor.name}: ${warning}`));
      } catch (error) {
        failedProfiles += 1;
        warnings.push(`${competitor.name}: ${error instanceof Error ? error.message : "Analysis failed."}`);
      }
      completed += 1;
    }
    const state = failedProfiles > 0 ? "PARTIAL" : "COMPLETED";
    await prisma.competitorResearchJob.update({ where: { id: queued.id }, data: {
      status: state, stage: state === "PARTIAL" ? "Partially completed" : "Completed", progress: 100,
      warnings: warnings.slice(0, 50) as Prisma.InputJsonValue, completedAt: new Date(), error: null,
    } });
  } catch (error) {
    const attempts = queued.attempts + 1;
    const message = error instanceof Error ? error.message.slice(0, 2000) : "Competitor research failed.";
    await prisma.competitorResearchJob.update({ where: { id: queued.id }, data: attempts < 3 ? {
      status: "QUEUED", stage: "Retry scheduled", error: message, runAt: new Date(Date.now() + attempts * 60_000),
    } : { status: "FAILED", stage: "Failed", error: message, completedAt: new Date() } });
    console.error("Competitor research job failed.", { jobId: queued.id, attempt: attempts, error });
  } finally {
    clearInterval(heartbeat);
  }
}

let workerBusy = false;
export async function runCompetitorResearchJobs() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    await processCompetitorResearchJob();
  } catch (error) {
    console.error("Competitor research worker tick failed.", error);
  } finally {
    workerBusy = false;
  }
}
