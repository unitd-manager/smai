import { Router } from "express";
import { Prisma } from "@prisma/client";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireWorkspace } from "../middleware/auth.js";
import { analyzeCompetitor } from "../services/competitor-intelligence.js";
import { searchCompetitorWebsites } from "../services/competitor-web-search.js";
import { researchPublicWebsite } from "../services/public-website-research.js";
import { env } from "../env.js";

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
const analysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
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

function jsonRecord(value: Prisma.JsonValue): Prisma.JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

async function selectedBrand(workspaceId: string, requestedBrandId?: string) {
  return prisma.brand.findFirst({
    where: { workspaceId, ...(requestedBrandId ? { id: requestedBrandId } : {}) },
    select: {
      id: true,
      name: true,
      profile: {
        select: {
          industry: true,
          description: true,
          products: true,
          audience: true,
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
    const instagramAccount = await prisma.socialAccount.findFirst({
      where: { workspaceId: req.workspace!.id, provider: "instagram", status: "CONNECTED" },
      select: { id: true },
    });
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
      dataCollection: {
        automaticMonitoring: false,
        connectedCompetitorPlatforms: [],
        websiteSearchAvailable: Boolean(env.TAVILY_API_KEY),
        websiteSearchProvider: env.TAVILY_API_KEY ? "Tavily Search" : null,
        instagramAccountConnected: Boolean(instagramAccount),
        instagramCompetitorInsightsAvailable: false,
        instagramCompetitorInsightsMessage: "The connected Instagram login can publish from your own account; it does not grant competitor discovery or insights. Competitor posts and metrics require Meta Business Discovery permissions, which are not enabled for this connection.",
        message: "Public homepages can be searched and scanned. Social profile links may be discovered; social posts and private metrics are not collected.",
      },
    });
  } catch (error) {
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

router.post("/:id/analyze", analysisLimiter, async (req, res, next) => {
  try {
    const id = z.string().trim().min(1).parse(req.params.id);
    const input = analyzeSchema.parse(req.body);
    const competitor = await prisma.competitor.findFirst({
      where: { id, workspaceId: req.workspace!.id, ...(req.header("x-brand-id") ? { brandId: req.header("x-brand-id")! } : {}) },
      include: { brand: { include: { profile: true } } },
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
    const existingSources = Array.isArray(snapshot.sources)
      ? snapshot.sources.map(jsonRecord).filter((source): source is Prisma.JsonObject => source !== null)
      : [];
    const websiteSources = websiteReports.map((site) => ({
      label: `${site.label} (automatically scanned)`,
      url: site.finalUrl,
    }));
    const updatedSources = [
      ...existingSources,
      ...websiteSources.filter((source) => !existingSources.some((existing) => existing.url === source.url)),
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
    const platformMetrics = boundedList("platformMetrics");
    const posts = boundedList("posts");
    const observations = {
      platformMetrics,
      posts: posts.slice(0, 20),
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
