import { prisma } from "../db.js";
import { getIndustryKnowledge } from "./industry-knowledge.js";

export type BusinessContext = {
  brand: {
    name: string;
    industry: string | null;
    description: string | null;
    products: string | null;
    audience: string | null;
    offers: string | null;
    tone: string | null;
    brandVoiceRules: unknown;
    bannedWords: unknown;
    languages: unknown;
    goals: unknown;
    preferredPlatforms: unknown;
    city: string | null;
    country: string | null;
    colors: string[];
  };
  brief: string;
  recentPosts: Array<{ title: string | null; caption: string; status: string; createdAt: string }>;
  recentDesigns: Array<{ title: string; status: string; createdAt: string }>;
  analytics: {
    available: boolean;
    summary: string;
    postCount: number;
  };
  knowledge: {
    source: string;
    version: number;
    lastReviewed: string;
    guidance: string[];
    limitation: string;
  };
};

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getBusinessContext(workspaceId: string, brandId: string, brief = ""): Promise<BusinessContext> {
  const [brand, posts, designs, snapshots] = await Promise.all([
    prisma.brand.findFirst({
      where: { id: brandId, workspaceId },
      select: {
        name: true,
        profile: {
          select: {
            industry: true, description: true, products: true, audience: true, offers: true, tone: true,
            brandVoiceRules: true, bannedWords: true,
            languages: true, goals: true, preferredPlatforms: true, city: true, country: true,
          },
        },
        kit: { select: { colors: true } },
      },
    }),
    prisma.post.findMany({
      where: { workspaceId, brandId },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: { title: true, caption: true, status: true, createdAt: true },
    }),
    prisma.design.findMany({
      where: { workspaceId, brandId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { title: true, status: true, createdAt: true },
    }),
    prisma.analyticsSnapshot.findMany({
      where: { workspaceId, post: { brandId } },
      orderBy: { capturedAt: "desc" },
      take: 30,
      select: { metrics: true },
    }),
  ]);
  if (!brand) throw new Error("The requested brand does not belong to this workspace.");

  const metrics = snapshots.flatMap((snapshot) => {
    const value = snapshot.metrics;
    if (!value || Array.isArray(value) || typeof value !== "object") return [];
    return [value as Record<string, unknown>];
  });
  const metricTotals = new Map<string, number>();
  for (const metric of metrics) {
    for (const [key, value] of Object.entries(metric)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        metricTotals.set(key, (metricTotals.get(key) ?? 0) + value);
      }
    }
  }
  const analyticsSummary = metricTotals.size
    ? [...metricTotals.entries()].map(([key, value]) => `${key}: ${value}`).join(", ")
    : "No usable performance metrics have been recorded.";
  const recentPosts = posts.map((post) => ({
    ...post,
    createdAt: post.createdAt.toISOString(),
  }));
  const recentDesigns = designs.map((design) => ({
    ...design,
    createdAt: design.createdAt.toISOString(),
  }));
  const profile = brand.profile;
  const brandColors = strings(brand.kit?.colors);
  const industryKnowledge = getIndustryKnowledge(profile?.industry ?? null, profile?.description ?? null);
  return {
    brand: {
      name: brand.name,
      industry: profile?.industry ?? null,
      description: profile?.description ?? null,
      products: profile?.products ?? null,
      audience: profile?.audience ?? null,
      offers: profile?.offers ?? null,
      tone: profile?.tone ?? null,
      brandVoiceRules: profile?.brandVoiceRules ?? [],
      bannedWords: profile?.bannedWords ?? [],
      languages: profile?.languages ?? [],
      goals: profile?.goals ?? [],
      preferredPlatforms: profile?.preferredPlatforms ?? [],
      city: profile?.city ?? null,
      country: profile?.country ?? null,
      colors: brandColors,
    },
    brief,
    recentPosts,
    recentDesigns,
    analytics: {
      available: metricTotals.size > 0,
      summary: analyticsSummary,
      postCount: snapshots.length,
    },
    knowledge: {
      source: industryKnowledge.source,
      version: industryKnowledge.version,
      lastReviewed: industryKnowledge.lastReviewed,
      guidance: [
        ...industryKnowledge.guidance,
        "Use only business facts and offers supplied in the brand profile or current brief.",
        "Use prior posts and designs as style and repetition context, not as verified performance evidence.",
        "Prefer clear, audience-relevant ideas with a practical call to action.",
        "Treat analytics as unavailable unless real numeric metrics are present.",
      ],
      limitation: profile?.industry
        ? `Context includes a small locally curated ${profile.industry} prompt cache and this workspace's history; it is not current external industry research. ${industryKnowledge.limitation}`
        : `Industry information is not set on the brand profile; advice is based on the brief, local general guidance, and available workspace content. ${industryKnowledge.limitation}`,
    },
  };
}

export function summarizeBusinessContext(context: BusinessContext) {
  return JSON.stringify(context);
}
