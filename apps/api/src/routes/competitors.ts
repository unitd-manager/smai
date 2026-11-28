import { Router } from "express";
import { Prisma } from "@prisma/client";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireWorkspace } from "../middleware/auth.js";
import { analyzeCompetitor } from "../services/competitor-intelligence.js";
import { CompetitorWebSearchError, searchCompetitorWebsites } from "../services/competitor-web-search.js";
import { researchPublicWebsite } from "../services/public-website-research.js";
import { researchCompetitorSocial } from "../services/competitor-social-research.js";
import { env } from "../env.js";
import { enqueueCompetitorResearch } from "../services/competitor-research-worker.js";
import { apifyCompetitorPlatforms, collectInstagramProfileMetricsWithApify } from "../services/competitor-apify.js";

const router = Router();
const httpUrl = z.string().trim().url().max(2048).refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "https:" || protocol === "http:";
}, "Use a public HTTP or HTTPS URL.");
const profileSchema = z.object({
  name: z.string().trim().min(2).max(191),
  category: z.enum(["direct", "indirect", "emerging", "industry-leader"]).default("direct"),
  industry: z.string().trim().max(500).default(""),
  websiteUrl: httpUrl.nullable().optional(),
  location: z.string().trim().max(500).default(""),
  overview: z.string().trim().max(4000).default(""),
  products: z.string().trim().max(4000).default(""),
  audience: z.string().trim().max(3000).default(""),
  uniqueValue: z.string().trim().max(2000).default(""),
  brandVoice: z.string().trim().max(2000).default(""),
  socialProfiles: z.object({
    Instagram: httpUrl.optional(),
    Facebook: httpUrl.optional(),
    LinkedIn: httpUrl.optional(),
    TikTok: httpUrl.optional(),
    YouTube: httpUrl.optional(),
    X: httpUrl.optional(),
    Pinterest: httpUrl.optional(),
    Other: httpUrl.optional(),
  }).strict().default({}),
  keywords: z.array(z.string().trim().min(2).max(80)).max(30).default([]),
  notes: z.string().trim().max(4000).default(""),
}).strict();
const profilePatchSchema = profileSchema.partial().strict().refine((value) => Object.keys(value).length > 0);

const metricsSchema = z.object({
  followers: z.number().finite().min(0).max(1_000_000_000).optional(),
  following: z.number().finite().min(0).max(1_000_000_000).optional(),
  totalPosts: z.number().finite().min(0).max(1_000_000_000).optional(),
  likes: z.number().finite().min(0).max(1_000_000_000).optional(),
  comments: z.number().finite().min(0).max(1_000_000_000).optional(),
  shares: z.number().finite().min(0).max(1_000_000_000).optional(),
  views: z.number().finite().min(0).max(1_000_000_000).optional(),
}).strict();
const observationsSchema = z.object({
  platformMetrics: z.array(z.object({
    platform: z.string().trim().min(2).max(40),
    capturedAt: z.string().datetime().optional(),
    metrics: metricsSchema,
  }).strict()).max(12),
  posts: z.array(z.object({
    platform: z.string().trim().min(2).max(40),
    url: httpUrl,
    publishedAt: z.string().datetime().optional(),
    format: z.string().trim().min(2).max(60),
    topic: z.string().trim().max(500).default(""),
    hook: z.string().trim().max(1000).default(""),
    captionApproach: z.string().trim().max(1500).default(""),
    callToAction: z.string().trim().max(500).default(""),
    metrics: metricsSchema.default({}),
  }).strict()).max(50),
  websiteFindings: z.array(z.string().trim().min(2).max(1000)).max(30).default([]),
  seoFindings: z.array(z.string().trim().min(2).max(1000)).max(30).default([]),
  audienceThemes: z.array(z.string().trim().min(2).max(500)).max(30).default([]),
  responsePatterns: z.array(z.string().trim().min(2).max(500)).max(30).default([]),
  visibleCampaigns: z.array(z.string().trim().min(2).max(1000)).max(30).default([]),
  creativeNotes: z.array(z.string().trim().min(2).max(1000)).max(30).default([]),
  notes: z.string().trim().max(6000).default(""),
}).strict();
const sourcesSchema = z.array(z.object({
  label: z.string().trim().min(2).max(160),
  url: httpUrl.optional(),
}).strict()).min(1).max(30);
const snapshotSchema = z.object({
  observedAt: z.string().datetime().optional(),
  sources: sourcesSchema,
  observations: observationsSchema,
}).strict();
const analyzeSchema = z.object({ snapshotId: z.string().trim().min(1).optional() }).strict();
const discoverSchema = z.object({
  maxCandidates: z.number().int().min(1).max(3).default(3),
}).strict();
const analysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

router.use(requireAuth, requireWorkspace);

function jsonRecord(value: unknown): Prisma.JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : null;
}

async function selectedBrand(workspaceId: string, requestedBrandId?: string) {
  return prisma.brand.findFirst({
    where: { workspaceId, ...(requestedBrandId ? { id: requestedBrandId } : {}) },
    select: {
      id: true,
      name: true,
      profile: {
        select: {
          segment: true,
          industry: true,
          description: true,
          products: true,
          audience: true,
          offers: true,
          city: true,
          country: true,
          tone: true,
          companyWebsite: true,
        },
      },
    },
  });
}

router.get("/search", searchLimiter, async (req, res, next) => {
  try {
    if (!env.TAVILY_API_KEY) {
      res.status(503).json({ error: "In-dashboard website search is not configured. Add TAVILY_API_KEY to the API environment." });
      return;
    }
    const query = z.string().trim().min(2).max(160).parse(req.query.q);
    const results = await searchCompetitorWebsites(query, env.TAVILY_API_KEY);
    res.setHeader("Cache-Control", "no-store");
    res.json({ provider: "Tavily Search", results });
  } catch (error) {
    if (error instanceof CompetitorWebSearchError) {
      res.status(502).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const brand = await selectedBrand(req.workspace!.id, req.header("x-brand-id"));
    if (!brand) {
      res.status(404).json({ error: "No brand profile exists in this workspace." });
      return;
    }
    const competitors = await prisma.competitor.findMany({
      where: { workspaceId: req.workspace!.id, brandId: brand.id },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      take: 100,
      include: { snapshots: { orderBy: { observedAt: "desc" }, take: 8 } },
    });
    let researchJobs = await prisma.competitorResearchJob.findMany({
      where: { workspaceId: req.workspace!.id, brandId: brand.id },
      orderBy: { createdAt: "desc" }, take: 3,
      select: { id: true, status: true, stage: true, progress: true, error: true, warnings: true, createdAt: true, completedAt: true },
    });
    // Existing workspaces predate persistent research jobs. Queue a one-time
    // background collection when their page is opened so saved profiles begin
    // showing current public evidence without requiring a separate setup step.
    if (competitors.length && researchJobs.length === 0) {
      const initialJob = await enqueueCompetitorResearch(req.workspace!.id, brand.id);
      if (initialJob) researchJobs = [initialJob as typeof researchJobs[number]];
    }
    const [instagramAccount, facebookUserAccount, connectedFacebookPages] = await Promise.all([
      prisma.socialAccount.findFirst({
        where: { workspaceId: req.workspace!.id, provider: "instagram", status: "CONNECTED" },
        select: { id: true },
      }),
      prisma.socialAccount.findFirst({
        where: { workspaceId: req.workspace!.id, provider: "facebook-user", status: "CONNECTED" },
        select: { id: true },
      }),
      prisma.socialAccount.count({
        where: { workspaceId: req.workspace!.id, provider: "facebook", status: "CONNECTED" },
      }),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      brand: {
        id: brand.id,
        name: brand.name,
        industry: brand.profile?.industry ?? null,
        location: [brand.profile?.city, brand.profile?.country].filter(Boolean).join(", "),
        website: brand.profile?.companyWebsite ?? null,
        products: brand.profile?.products ?? null,
        audience: brand.profile?.audience ?? null,
        tone: brand.profile?.tone ?? null,
        description: brand.profile?.description ?? null,
      },
      competitors,
      researchJobs,
      dataCollection: {
        automaticMonitoring: true,
        weeklyRefreshAvailable: Boolean(env.TAVILY_API_KEY),
        publicPostCollectionAvailable: Boolean(env.APIFY_API_TOKEN || env.YOUTUBE_DATA_API_KEY || env.X_API_BEARER_TOKEN),
        apifyConfiguredPlatforms: env.APIFY_API_TOKEN ? apifyCompetitorPlatforms : [],
        connectedCompetitorPlatforms: [],
        websiteSearchAvailable: Boolean(env.TAVILY_API_KEY),
        websiteSearchProvider: env.TAVILY_API_KEY ? "Tavily Search" : null,
        instagramAccountConnected: Boolean(instagramAccount),
        instagramCompetitorInsightsAvailable: Boolean(facebookUserAccount && connectedFacebookPages),
        instagramCompetitorInsightsMessage: "Instagram Business Discovery requires Facebook Login with instagram_basic, instagram_manage_insights, pages_read_engagement, and an eligible linked professional account. Meta app review may be required.",
        youtubeApiAvailable: Boolean(env.YOUTUBE_DATA_API_KEY),
        xApiAvailable: Boolean(env.X_API_BEARER_TOKEN),
        message: `${env.TAVILY_API_KEY
          ? "Saving Brand Profile automatically discovers and analyzes up to three relevant providers; saved profiles refresh weekly."
          : "Background research runs on saved Brand Profile data. Configure TAVILY_API_KEY to enable automatic discovery and weekly refresh."} Public post collection requires APIFY_API_TOKEN or the corresponding official platform API credentials. Missing public fields remain unavailable rather than estimated.`,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/research", searchLimiter, async (req, res, next) => {
  try {
    const brand = await selectedBrand(req.workspace!.id, req.header("x-brand-id"));
    if (!brand) {
      res.status(404).json({ error: "No brand profile exists in this workspace." });
      return;
    }
    const existing = await prisma.competitor.count({ where: { workspaceId: req.workspace!.id, brandId: brand.id } });
    if (!existing && !env.TAVILY_API_KEY) {
      res.status(503).json({ error: "Add competitors or configure TAVILY_API_KEY for automatic discovery." });
      return;
    }
    const job = await enqueueCompetitorResearch(req.workspace!.id, brand.id, `requested-${Math.floor(Date.now() / 60_000)}`);
    if (!job) {
      res.status(400).json({ error: "Complete the industry, products, or business description in Brand Kit before research can run." });
      return;
    }
    res.status(202).json({ job: { id: job.id, status: job.status, stage: job.stage } });
  } catch (error) {
    next(error);
  }
});

router.post("/discover", searchLimiter, async (req, res, next) => {
  try {
    if (!env.TAVILY_API_KEY) {
      res.status(503).json({ error: "Automatic competitor discovery needs a Tavily API key." });
      return;
    }
    const input = discoverSchema.parse(req.body ?? {});
    const brand = await selectedBrand(req.workspace!.id, req.header("x-brand-id"));
    if (!brand) {
      res.status(404).json({ error: "No brand profile exists in this workspace." });
      return;
    }

    const profile = brand.profile;
    const location = [profile?.city, profile?.country].filter(Boolean).join(", ");
    const industry = profile?.industry?.trim() || profile?.segment?.trim() || "";
    if (!industry && !profile?.products && !profile?.description) {
      res.status(422).json({ error: "Add your industry or products to Brand Profile before automatically finding relevant competitors." });
      return;
    }

    // Industry is the primary discovery signal; products and location narrow the match.
    const discoverySubject = industry || profile?.products?.trim() || profile?.description?.trim() || brand.name;
    const productTerms = [profile?.products, profile?.offers].filter(Boolean).join(" ").slice(0, 180);
    const queries = [...new Set([
      `official website ${discoverySubject} ${productTerms} ${location}`,
      `${discoverySubject} companies ${location} ${productTerms}`,
      `${discoverySubject} local businesses ${location} official website`,
    ].map((value) => value.replace(/\s+/g, " ").trim()).filter((value) => value.length > 10))];
    const searchOutcomes = await Promise.allSettled(queries.map((searchQuery) =>
      searchCompetitorWebsites(searchQuery, env.TAVILY_API_KEY!)));
    const successfulSearches = searchOutcomes.filter((outcome) => outcome.status === "fulfilled");
    const searchWarnings = searchOutcomes.flatMap((outcome) => outcome.status === "rejected"
      ? [outcome.reason instanceof CompetitorWebSearchError
        ? outcome.reason.message
        : "One competitor search could not be completed."]
      : []);
    if (!successfulSearches.length) {
      const failedSearch = searchOutcomes.find((outcome) => outcome.status === "rejected");
      if (failedSearch?.status === "rejected") throw failedSearch.reason;
    }
    const searchResults = successfulSearches.flatMap((outcome) => outcome.status === "fulfilled" ? outcome.value : []);
    const results = [...new Map(searchResults.map((result) => [result.domain, result])).values()];
    const tracked = await prisma.competitor.findMany({
      where: { workspaceId: req.workspace!.id, brandId: brand.id },
      include: { snapshots: { orderBy: { observedAt: "desc" }, take: 1 } },
    });
    const domains = new Set(tracked.flatMap(({ websiteUrl }) => {
      if (!websiteUrl) return [];
      return [new URL(websiteUrl).hostname.toLowerCase().replace(/^www\./, "")];
    }));
    if (profile?.companyWebsite) {
      domains.add(new URL(profile.companyWebsite).hostname.toLowerCase().replace(/^www\./, ""));
    }

    const newResults = results.filter((result) => !domains.has(result.domain));
    const remainingSlots = Math.max(0, input.maxCandidates - tracked.length);
    // Search results are leads, not competitor profiles. Verify the root homepage,
    // business identity and first-party logo before adding anything to the dashboard.
    const verifiedCandidates: Array<{ candidate: typeof newResults[number]; report: Awaited<ReturnType<typeof researchPublicWebsite>>; name: string }> = [];
    const candidatesToCheck = newResults.slice(0, 12);
    const websiteChecks = await Promise.allSettled(candidatesToCheck.map(async (candidate) => ({ candidate, report: await researchPublicWebsite(candidate.url) })));
    const nonBusinessTitle = /\b(?:list of|market trends?|industry report|sector report|market map|startups? in|top \d+|best \d+|directory|business listings?|reviews? and ratings?|menu and prices?|search results?)\b/i;
    for (const outcome of websiteChecks) {
      if (outcome.status !== "fulfilled") continue;
      const { candidate, report } = outcome.value;
      const officialName = (report.title || "").replace(/\s*[|–—-]\s*(?:official (?:website|site)|home(?:page)?)\s*$/i, "").trim();
      const identityText = `${officialName} ${report.description || ""}`;
      if (!officialName || officialName.length < 3 || nonBusinessTitle.test(identityText) || !(report.logoUrl || report.logoText)) continue;
      verifiedCandidates.push({ candidate, report, name: officialName.slice(0, 191) });
      if (verifiedCandidates.length >= remainingSlots) break;
    }
    const candidates = verifiedCandidates;
    const discovered = [];
    for (const { candidate, report, name } of candidates) {
      const competitor = await prisma.competitor.create({
        data: {
          workspaceId: req.workspace!.id,
          brandId: brand.id,
          name,
          category: "direct",
          industry: industry || null,
          websiteUrl: candidate.url,
          location: location || null,
          overview: report.description || candidate.description || `Official website for ${name}.`,
          products: productTerms || "",
          socialProfiles: report.socialProfiles,
          keywords: industry ? [industry] : [],
          notes: "Discovered from an industry-led public search and verified against the business homepage. The saved logo is sourced from that homepage.",
          snapshots: {
            create: {
              workspaceId: req.workspace!.id,
              brandId: brand.id,
              observedAt: new Date(),
              sources: [{ label: "Official business website", url: report.finalUrl }],
              observations: {
                platformMetrics: [],
                posts: [],
                websiteFindings: [],
                seoFindings: [],
                audienceThemes: [],
                responsePatterns: [],
                visibleCampaigns: [],
                creativeNotes: [],
                notes: "Business identity, website description, social links and logo were read from its public homepage.",
                websiteResearch: { competitorWebsite: { ...report, discoveredSocialProfiles: report.socialProfiles }, warnings: [] },
              },
            },
          },
        },
      });
      discovered.push({ id: competitor.id, name: competitor.name, websiteUrl: competitor.websiteUrl, logoUrl: report.logoUrl, logoText: report.logoText });
      domains.add(candidate.domain);
    }
    const needsAnalysis = tracked
      .filter((competitor) => !competitor.snapshots[0]?.analysisJson)
      .map((competitor) => ({ id: competitor.id, name: competitor.name }));
    const analysisQueue = [...discovered, ...needsAnalysis].slice(0, input.maxCandidates);

    res.status(201).json({
      queries,
      discovered,
      analysisQueue,
      skippedAlreadyTracked: results.length - newResults.length,
      omittedByLimit: newResults.length - candidates.length,
      searchWarnings,
      message: discovered.length
        ? `${discovered.length} individual business profile${discovered.length === 1 ? "" : "s"} verified from your industry search. Each includes its own homepage logo and available social links.`
        : needsAnalysis.length
          ? "No new competitor websites were found; saved competitors without an analysis are queued."
          : tracked.length >= input.maxCandidates
            ? `The target of ${input.maxCandidates} tracked competitors has already been reached.`
            : "No new individual business homepages with a verifiable logo were found. Add a more specific industry or location in Brand Profile, or add a competitor website manually.",
    });
  } catch (error) {
    if (error instanceof CompetitorWebSearchError) {
      res.status(502).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = profileSchema.parse(req.body);
    const brand = await selectedBrand(req.workspace!.id, req.header("x-brand-id"));
    if (!brand) {
      res.status(404).json({ error: "No brand profile exists in this workspace." });
      return;
    }
    const competitor = await prisma.competitor.create({
      data: {
        workspaceId: req.workspace!.id,
        brandId: brand.id,
        name: input.name,
        category: input.category,
        industry: input.industry || null,
        websiteUrl: input.websiteUrl ?? null,
        location: input.location || null,
        overview: input.overview || null,
        products: input.products || null,
        audience: input.audience || null,
        uniqueValue: input.uniqueValue || null,
        brandVoice: input.brandVoice || null,
        socialProfiles: input.socialProfiles,
        keywords: input.keywords,
        notes: input.notes || null,
      },
    });
    res.status(201).json({ competitor });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const id = z.string().trim().min(1).parse(req.params.id);
    const input = profilePatchSchema.parse(req.body);
    const current = await prisma.competitor.findFirst({
      where: { id, workspaceId: req.workspace!.id, ...(req.header("x-brand-id") ? { brandId: req.header("x-brand-id")! } : {}) },
      select: { id: true },
    });
    if (!current) {
      res.status(404).json({ error: "Competitor not found in this workspace." });
      return;
    }
    const competitor = await prisma.competitor.update({
      where: { id: current.id },
      data: {
        ...input,
        ...(input.industry !== undefined ? { industry: input.industry || null } : {}),
        ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl } : {}),
        ...(input.location !== undefined ? { location: input.location || null } : {}),
        ...(input.overview !== undefined ? { overview: input.overview || null } : {}),
        ...(input.products !== undefined ? { products: input.products || null } : {}),
        ...(input.audience !== undefined ? { audience: input.audience || null } : {}),
        ...(input.uniqueValue !== undefined ? { uniqueValue: input.uniqueValue || null } : {}),
        ...(input.brandVoice !== undefined ? { brandVoice: input.brandVoice || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      },
    });
    res.json({ competitor });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = z.string().trim().min(1).parse(req.params.id);
    const current = await prisma.competitor.findFirst({
      where: { id, workspaceId: req.workspace!.id, ...(req.header("x-brand-id") ? { brandId: req.header("x-brand-id")! } : {}) },
      select: { id: true },
    });
    if (!current) {
      res.status(404).json({ error: "Competitor not found in this workspace." });
      return;
    }
    await prisma.competitor.delete({ where: { id: current.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post("/:id/snapshots", async (req, res, next) => {
  try {
    const id = z.string().trim().min(1).parse(req.params.id);
    const input = snapshotSchema.parse(req.body);
    const observedAt = input.observedAt ? new Date(input.observedAt) : new Date();
    if (observedAt > new Date(Date.now() + 60_000)) {
      res.status(400).json({ error: "Observation time cannot be in the future." });
      return;
    }
    const competitor = await prisma.competitor.findFirst({
      where: { id, workspaceId: req.workspace!.id, ...(req.header("x-brand-id") ? { brandId: req.header("x-brand-id")! } : {}) },
      select: { id: true, brandId: true },
    });
    if (!competitor) {
      res.status(404).json({ error: "Competitor not found in this workspace." });
      return;
    }
    const snapshot = await prisma.competitorSnapshot.create({
      data: {
        workspaceId: req.workspace!.id,
        brandId: competitor.brandId,
        competitorId: competitor.id,
        observedAt,
        sources: input.sources,
        observations: input.observations as Prisma.InputJsonValue,
      },
    });
    res.status(201).json({ snapshot });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/research-website", analysisLimiter, async (req, res, next) => {
  try {
    const id = z.string().trim().min(1).parse(req.params.id);
    const competitor = await prisma.competitor.findFirst({
      where: { id, workspaceId: req.workspace!.id, ...(req.header("x-brand-id") ? { brandId: req.header("x-brand-id")! } : {}) },
      include: { snapshots: { orderBy: { observedAt: "desc" }, take: 1 } },
    });
    if (!competitor) { res.status(404).json({ error: "Competitor not found in this workspace." }); return; }
    if (!competitor.websiteUrl) { res.status(422).json({ error: "Add the competitor's public website before scanning for its logo." }); return; }
    const report = await researchPublicWebsite(competitor.websiteUrl);
    const snapshot = competitor.snapshots[0] ?? await prisma.competitorSnapshot.create({
      data: {
        workspaceId: req.workspace!.id,
        brandId: competitor.brandId,
        competitorId: competitor.id,
        observedAt: new Date(),
        sources: [{ label: "Competitor homepage", url: report.finalUrl }],
        observations: { platformMetrics: [], posts: [], websiteFindings: [], seoFindings: [], audienceThemes: [], responsePatterns: [], visibleCampaigns: [], creativeNotes: [], notes: "" },
      },
    });
    const prior = jsonRecord(snapshot.observations) ?? {};
    const priorResearch = jsonRecord(prior.websiteResearch) ?? {};
    const observations = {
      ...prior,
      websiteResearch: {
        ...priorResearch,
        competitorWebsite: { ...report, discoveredSocialProfiles: report.socialProfiles },
        warnings: Array.isArray(priorResearch.warnings) ? priorResearch.warnings : [],
      },
    } as Prisma.InputJsonObject;
    await prisma.competitorSnapshot.update({ where: { id: snapshot.id }, data: { observations } });
    res.setHeader("Cache-Control", "no-store");
    res.json({ logoUrl: report.logoUrl, logoText: report.logoText, snapshotId: snapshot.id });
  } catch (error) { next(error); }
});

router.post("/:id/analyze", analysisLimiter, async (req, res, next) => {
  try {
    const id = z.string().trim().min(1).parse(req.params.id);
    const input = analyzeSchema.parse(req.body);
    const competitor = await prisma.competitor.findFirst({
      where: { id, workspaceId: req.workspace!.id, ...(req.header("x-brand-id") ? { brandId: req.header("x-brand-id")! } : {}) },
      include: { brand: { include: { profile: true, kit: true } } },
    });
    if (!competitor) {
      res.status(404).json({ error: "Competitor not found in this workspace." });
      return;
    }
    const savedSnapshot = await prisma.competitorSnapshot.findFirst({
      where: {
        workspaceId: req.workspace!.id,
        brandId: competitor.brandId,
        competitorId: competitor.id,
        ...(input.snapshotId ? { id: input.snapshotId } : {}),
      },
      orderBy: { observedAt: "desc" },
    });
    const snapshot = savedSnapshot ?? await prisma.competitorSnapshot.create({
      data: {
        workspaceId: req.workspace!.id,
        brandId: competitor.brandId,
        competitorId: competitor.id,
        observedAt: new Date(),
        sources: [{ label: "Competitor profile" }],
        observations: {
          platformMetrics: [],
          posts: [],
          websiteFindings: [],
          seoFindings: [],
          audienceThemes: [],
          responsePatterns: [],
          visibleCampaigns: [],
          creativeNotes: [],
          notes: "",
        },
      },
    });
    const websiteWarnings: string[] = [];
    const [brandWebsite, competitorWebsite] = await Promise.all([
      competitor.brand.profile?.companyWebsite
        ? researchPublicWebsite(competitor.brand.profile.companyWebsite).catch((error: unknown) => {
          websiteWarnings.push(`Brand Kit website: ${error instanceof Error ? error.message : "Research failed."}`);
          return null;
        })
        : Promise.resolve(null),
      competitor.websiteUrl
        ? researchPublicWebsite(competitor.websiteUrl).catch((error: unknown) => {
          websiteWarnings.push(`Competitor website: ${error instanceof Error ? error.message : "Research failed."}`);
          return null;
        })
        : Promise.resolve(null),
    ]);
    if (!competitor.brand.profile?.companyWebsite) websiteWarnings.push("Add your website in Brand Kit to include your own site in competitor comparisons.");
    if (!competitor.websiteUrl) websiteWarnings.push("Add the competitor's HTTPS website URL to scan its public homepage.");

    const storedObservations = jsonRecord(snapshot.observations);
    const boundedList = (key: string) => {
      const value = storedObservations?.[key];
      return Array.isArray(value) ? value.slice(0, 15) : [];
    };
    const websiteReports = [
      ...(brandWebsite ? [{ label: "Brand Kit website", ...brandWebsite }] : []),
      ...(competitorWebsite ? [{ label: "Competitor website", ...competitorWebsite }] : []),
    ];
    const scannedFindings = websiteReports.flatMap((site) => [
      `${site.label} (${site.finalUrl}) title: ${site.title ?? "not provided"}. Description: ${site.description ?? "not provided"}.`,
      site.excerpt ? `${site.label} visible homepage text: ${site.excerpt}` : `${site.label} had no readable homepage text.`,
    ]);
    const existingSocialProfiles = jsonRecord(competitor.socialProfiles) ?? {};
    const discoveredSocialProfiles = competitorWebsite
      ? Object.fromEntries(Object.entries(competitorWebsite.socialProfiles).filter(([platform, url]) =>
        Boolean(url) && !(typeof existingSocialProfiles[platform] === "string" && existingSocialProfiles[platform])))
      : {};
    const mergedSocialProfiles = { ...existingSocialProfiles, ...discoveredSocialProfiles };
    const instagramProfileUrl = typeof mergedSocialProfiles.Instagram === "string" ? mergedSocialProfiles.Instagram : "";
    let facebookUserAccount: { id: string; encryptedTokens: string; tokenExpiresAt: Date | null } | null = null;
    let facebookPages: Array<{ providerAccountId: string; encryptedTokens: string }> = [];
    if (instagramProfileUrl) {
      [facebookUserAccount, facebookPages] = await Promise.all([
        prisma.socialAccount.findFirst({
          where: { workspaceId: req.workspace!.id, provider: "facebook-user", status: "CONNECTED" },
          select: { id: true, encryptedTokens: true, tokenExpiresAt: true },
        }),
        prisma.socialAccount.findMany({
          where: { workspaceId: req.workspace!.id, provider: "facebook", status: "CONNECTED" },
          select: { providerAccountId: true, encryptedTokens: true },
        }),
      ]);
    }
    const socialResearch = await researchCompetitorSocial({
      socialProfiles: mergedSocialProfiles,
      facebookUserAccount,
      facebookPages,
    });
    websiteWarnings.push(...socialResearch.warnings);
    const apifyInstagramMetric: Awaited<ReturnType<typeof collectInstagramProfileMetricsWithApify>> = instagramProfileUrl && !socialResearch.platformMetrics.some((metric) => metric.platform === "Instagram" && metric.metrics.followers !== undefined)
      ? await collectInstagramProfileMetricsWithApify(instagramProfileUrl)
      : {};
    if (apifyInstagramMetric.warning) websiteWarnings.push(`Instagram profile metrics: ${apifyInstagramMetric.warning}`);
    const refreshedPlatformMetrics = [
      ...socialResearch.platformMetrics,
      ...(apifyInstagramMetric.metric ? [apifyInstagramMetric.metric] : []),
    ];
    const newPostUrls = new Set(socialResearch.posts.map((post) => post.url));
    const savedPosts = boundedList("posts").filter((post) => {
      const record = jsonRecord(post);
      return !record || typeof record.url !== "string" || !newPostUrls.has(record.url);
    });
    const mergedPosts = [...socialResearch.posts, ...savedPosts].slice(0, 50);
    const updatedPlatforms = new Set(refreshedPlatformMetrics.map((metric) => metric.platform));
    const savedMetrics = boundedList("platformMetrics").filter((metric) => {
      const record = jsonRecord(metric);
      return !record || typeof record.platform !== "string" || !updatedPlatforms.has(record.platform);
    });
    const mergedMetrics = [...refreshedPlatformMetrics, ...savedMetrics].slice(0, 12);
    const existingSources = Array.isArray(snapshot.sources)
      ? snapshot.sources.map(jsonRecord).filter((source): source is Prisma.JsonObject => source !== null)
      : [];
    const websiteSources = websiteReports.map((site) => ({
      label: `${site.label} (automatically scanned)`,
      url: site.finalUrl,
    }));
    const socialSources = [...socialResearch.sources, ...(apifyInstagramMetric.source ? [apifyInstagramMetric.source] : [])].map((source) => ({
      label: source.label,
      url: source.url,
    }));
    const updatedSources = [
      ...existingSources,
      ...[...websiteSources, ...socialSources].filter((source) => !existingSources.some((existing) => existing.url === source.url)),
    ].slice(0, 30);
    const websiteResearch = {
      brandWebsite,
      competitorWebsite,
      warnings: websiteWarnings,
    };
    const updatedObservations = {
      ...storedObservations,
      websiteResearch,
      websiteFindings: [...scannedFindings, ...boundedList("websiteFindings")].slice(0, 30),
      platformMetrics: mergedMetrics,
      posts: mergedPosts,
    };
    if (Object.keys(discoveredSocialProfiles).length) {
      await prisma.competitor.update({
        where: { id: competitor.id },
        data: { socialProfiles: mergedSocialProfiles as Prisma.InputJsonValue },
      });
    }
    await prisma.competitorSnapshot.update({
      where: { id: snapshot.id },
      data: {
        sources: updatedSources as Prisma.InputJsonValue,
        observations: updatedObservations as Prisma.InputJsonValue,
      },
    });
    const observations = {
      platformMetrics: mergedMetrics,
      posts: mergedPosts.slice(0, 45),
      websiteFindings: [...scannedFindings, ...boundedList("websiteFindings")].slice(0, 15),
      seoFindings: boundedList("seoFindings"),
      audienceThemes: boundedList("audienceThemes"),
      responsePatterns: boundedList("responsePatterns"),
      visibleCampaigns: boundedList("visibleCampaigns"),
      creativeNotes: boundedList("creativeNotes"),
      notes: typeof storedObservations?.notes === "string" ? storedObservations.notes.slice(0, 2000) : "",
      websiteResearch: {
        warnings: websiteWarnings,
        brandWebsite: brandWebsite ? {
          url: brandWebsite.finalUrl,
          title: brandWebsite.title,
          description: brandWebsite.description,
          excerpt: brandWebsite.excerpt,
        } : null,
        competitorWebsite: competitorWebsite ? {
          url: competitorWebsite.finalUrl,
          title: competitorWebsite.title,
          description: competitorWebsite.description,
          logoUrl: competitorWebsite.logoUrl,
          logoText: competitorWebsite.logoText,
          excerpt: competitorWebsite.excerpt,
          discoveredSocialProfiles: competitorWebsite.socialProfiles,
        } : null,
      },
    };
    const result = await analyzeCompetitor({
      business: {
        name: competitor.brand.name,
        industry: competitor.brand.profile?.industry ?? null,
        description: competitor.brand.profile?.description ?? null,
        products: competitor.brand.profile?.products ?? null,
        audience: competitor.brand.profile?.audience ?? null,
        location: [competitor.brand.profile?.city, competitor.brand.profile?.country].filter(Boolean).join(", ") || null,
        tone: competitor.brand.profile?.tone ?? null,
        website: competitor.brand.profile?.companyWebsite ?? null,
        brandKit: {
          colors: Array.isArray(competitor.brand.kit?.colors)
            ? competitor.brand.kit.colors.filter((color): color is string => typeof color === "string").slice(0, 12)
            : [],
          fonts: Array.isArray(competitor.brand.kit?.fonts)
            ? competitor.brand.kit.fonts.filter((font): font is string => typeof font === "string").slice(0, 12)
            : [],
        },
      },
      competitor: {
        name: competitor.name,
        category: competitor.category,
        industry: competitor.industry,
        websiteUrl: competitor.websiteUrl,
        location: competitor.location,
        overview: competitor.overview,
        products: competitor.products,
        audience: competitor.audience,
        uniqueValue: competitor.uniqueValue,
        brandVoice: competitor.brandVoice,
        socialProfiles: mergedSocialProfiles,
        keywords: competitor.keywords,
        notes: competitor.notes,
      },
      observations,
      sources: Array.isArray(snapshot.sources) ? snapshot.sources.slice(0, 15) : [],
    });
    const updated = await prisma.competitorSnapshot.update({
      where: { id: snapshot.id },
      data: {
        analysisJson: result.analysis as unknown as Prisma.InputJsonValue,
        analysisProvider: result.provider,
      },
    });
    res.json({
      snapshot: updated,
      research: {
        scannedWebsiteCount: websiteReports.length,
        discoveredSocialProfiles: Object.keys(competitorWebsite?.socialProfiles ?? {}).length,
        addedSocialProfiles: Object.keys(discoveredSocialProfiles).length,
        collectedSocialPosts: socialResearch.posts.length,
        socialWarnings: socialResearch.warnings,
        warnings: websiteWarnings,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("all configured AI providers")) {
      res.status(502).json({ error: error.message });
      return;
    }
    next(error);
  }
});

export { router as competitorsRouter };
