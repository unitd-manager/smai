import { createHash } from "node:crypto";
import { prisma } from "../db.js";
import { getUpcomingSeasonalMoments } from "../data/seasonal-calendar.js";

type Suggestion = {
  key: string;
  fingerprint: string;
  title: string;
  explanation: string;
  actionLabel: string;
  actionHref: string;
  kind: string;
  metadata: Record<string, string | number | boolean>;
};

function stableFingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 40);
}

function contentFormat(value: unknown) {
  if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
  const format = (value as Record<string, unknown>).format;
  return typeof format === "string" ? format : undefined;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createRecommendationSuggestions(input: {
  now: Date;
  posts: Array<{ status: string; createdAt: Date; scheduledAt: Date | null }>;
  generated: Array<{ contentJson: unknown }>;
  goals: unknown;
  analyticsAvailable: boolean;
  seasonalMoments?: Array<{ id: string; name: string; date: string; region: string[]; source: string }>;
}) {
  const thirtyDaysAgo = new Date(input.now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const latestPostDate = input.posts
    .map((post) => post.scheduledAt ?? post.createdAt)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  const suggestions: Suggestion[] = [];
  if (!latestPostDate) {
    suggestions.push({
      key: "start-publishing",
      fingerprint: "no-post-history",
      title: "Create your first on-brand post",
      explanation: "There are no published or scheduled posts for this brand yet. A reviewed draft is a low-risk way to begin.",
      actionLabel: "Create a post",
      actionHref: "/dashboard/create",
      kind: "content",
      metadata: { limitedData: true },
    });
  } else {
    const daysSincePost = Math.max(0, Math.floor((input.now.getTime() - latestPostDate.getTime()) / 86_400_000));
    if (daysSincePost >= 12) {
      suggestions.push({
        key: "posting-gap",
        fingerprint: `gap-${Math.floor(daysSincePost / 7)}-weeks`,
        title: "Plan your next post",
        explanation: `Your latest published or scheduled post is about ${daysSincePost} days old. Consider drafting a useful update for your audience.`,
        actionLabel: "Create a post",
        actionHref: "/dashboard/create",
        kind: "cadence",
        metadata: { daysSincePost },
      });
    }
  }

  const formatCounts = new Map<string, number>();
  for (const item of input.generated) {
    const format = contentFormat(item.contentJson);
    if (format) formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1);
  }
  if (input.generated.length > 0 && !formatCounts.has("video")) {
    suggestions.push({
      key: "content-mix-video",
      fingerprint: `created-${input.generated.length}-no-video`,
      title: "Try a short video concept",
      explanation: "Your recent generated content includes no video drafts. A short demonstration or behind-the-scenes idea could add variety; review it before rendering.",
      actionLabel: "Open Video Studio",
      actionHref: "/dashboard/videos",
      kind: "content-mix",
      metadata: { generatedContentCount: input.generated.length },
    });
  }

  const recentPostCount = input.posts.filter((post) => (post.scheduledAt ?? post.createdAt) >= thirtyDaysAgo).length;
  if (recentPostCount > 0 && recentPostCount < 4) {
    suggestions.push({
      key: "posting-frequency",
      fingerprint: `month-${recentPostCount}-posts`,
      title: "Choose a sustainable posting rhythm",
      explanation: `There are ${recentPostCount} published or scheduled posts in the last 30 days. Pick a cadence your team can maintain rather than increasing frequency without a plan.`,
      actionLabel: "Open Content Plans",
      actionHref: "/dashboard/content-plans",
      kind: "cadence",
      metadata: { recentPostCount, limitedData: !input.analyticsAvailable },
    });
  }

  if (Array.isArray(input.goals) && input.goals.length > 0 && input.generated.length === 0) {
    suggestions.push({
      key: "goal-to-content",
      fingerprint: `profile-goals-${stableFingerprint(JSON.stringify(input.goals))}`,
      title: "Turn a brand goal into a draft",
      explanation: "Your brand profile includes business goals, but there are no recent generated content drafts to support them yet.",
      actionLabel: "Start a content plan",
      actionHref: "/dashboard/content-plans",
      kind: "planning",
      metadata: { limitedData: !input.analyticsAvailable },
    });
  }
  for (const moment of input.seasonalMoments ?? []) {
    suggestions.push({
      key: `seasonal-${moment.id}`,
      fingerprint: `${moment.id}-${moment.date}`,
      title: `Prepare for ${moment.name}`,
      explanation: `${moment.name} is coming up on ${moment.date}. Consider a relevant, respectful campaign only if it fits your audience and offer; this calendar entry is a planning prompt, not a recommendation to participate.`,
      actionLabel: "Draft a campaign",
      actionHref: `/dashboard/campaigns?goal=${encodeURIComponent(`Create an optional ${moment.name} campaign for the business. Use only confirmed brand facts and offers.`)}&name=${encodeURIComponent(moment.name)}`,
      kind: "seasonal",
      metadata: { date: moment.date, region: moment.region.join(", "), source: moment.source },
    });
  }
  return suggestions;
}

export async function refreshMarketingRecommendations(workspaceId: string, brandId: string) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [brand, posts, generated, analytics] = await Promise.all([
    prisma.brand.findFirst({
      where: { id: brandId, workspaceId },
      select: { id: true, profile: { select: { goals: true, preferredPlatforms: true, country: true } } },
    }),
    prisma.post.findMany({
      where: { workspaceId, brandId, status: { in: ["PUBLISHED", "SCHEDULED", "PROCESSING"] } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { status: true, createdAt: true, scheduledAt: true },
    }),
    prisma.generatedContent.findMany({
      where: { workspaceId, brandId, createdAt: { gte: thirtyDaysAgo } },
      select: { contentJson: true },
      take: 100,
    }),
    prisma.analyticsSnapshot.count({
      where: { workspaceId, post: { brandId } },
    }),
  ]);
  if (!brand) throw new Error("The requested brand does not belong to this workspace.");

  const suggestions = createRecommendationSuggestions({
    now,
    posts,
    generated,
    goals: brand.profile?.goals,
    analyticsAvailable: analytics > 0,
    seasonalMoments: getUpcomingSeasonalMoments(now, brand.profile?.country ?? null),
  });

  for (const suggestion of suggestions) {
    await prisma.marketingRecommendation.upsert({
      where: {
        workspaceId_brandId_recommendationKey_reasonFingerprint: {
          workspaceId,
          brandId,
          recommendationKey: suggestion.key,
          reasonFingerprint: suggestion.fingerprint,
        },
      },
      create: {
        workspaceId,
        brandId,
        recommendationKey: suggestion.key,
        reasonFingerprint: suggestion.fingerprint,
        title: suggestion.title,
        explanation: suggestion.explanation,
        actionLabel: suggestion.actionLabel,
        actionHref: suggestion.actionHref,
        kind: suggestion.kind,
        metadata: suggestion.metadata,
      },
      update: {
        title: suggestion.title,
        explanation: suggestion.explanation,
        actionLabel: suggestion.actionLabel,
        actionHref: suggestion.actionHref,
        metadata: suggestion.metadata,
      },
    });
  }

  return prisma.marketingRecommendation.findMany({
    where: {
      workspaceId,
      brandId,
      OR: [
        { status: "ACTIVE" },
        { status: "SNOOZED", snoozedUntil: { lte: now } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

function jsonStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export async function getMarketingIntelligence(workspaceId: string, brandId: string) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const [brand, posts, generated, plans, accounts, analytics, recommendations, competitorRecords] = await Promise.all([
    prisma.brand.findFirst({ where: { id: brandId, workspaceId }, select: { name: true, profile: { select: { industry: true, description: true, products: true, audience: true, tone: true, goals: true, preferredPlatforms: true, competitors: true, offers: true, country: true } } } }),
    prisma.post.findMany({ where: { workspaceId, brandId, createdAt: { gte: thirtyDaysAgo } }, select: { status: true, createdAt: true, scheduledAt: true } }),
    prisma.generatedContent.findMany({ where: { workspaceId, brandId, createdAt: { gte: thirtyDaysAgo } }, select: { contentJson: true, createdAt: true } }),
    prisma.contentPlan.findMany({ where: { workspaceId, brandId, status: { not: "ARCHIVED" } }, select: { id: true, name: true, status: true, startsAt: true, endsAt: true }, orderBy: { startsAt: "asc" }, take: 5 }),
    prisma.socialAccount.findMany({ where: { workspaceId, status: "CONNECTED" }, select: { provider: true, displayName: true } }),
    prisma.analyticsSnapshot.count({ where: { workspaceId, capturedAt: { gte: thirtyDaysAgo } } }),
    refreshMarketingRecommendations(workspaceId, brandId),
    prisma.competitor.findMany({
      where: { workspaceId, brandId },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: {
        name: true,
        category: true,
        snapshots: {
          orderBy: { observedAt: "desc" },
          take: 8,
          select: { observedAt: true, analysisJson: true },
        },
      },
    }),
  ]);
  if (!brand) throw new Error("The requested brand does not belong to this workspace.");
  const profile = brand.profile;
  const goals = jsonStrings(profile?.goals);
  const platforms = jsonStrings(profile?.preferredPlatforms);
  const competitors = jsonStrings(profile?.competitors);
  const recordedCompetitors = competitorRecords.map((competitor) => {
    const latest = competitor.snapshots.find((snapshot) => isJsonRecord(snapshot.analysisJson));
    const analysis = latest && isJsonRecord(latest.analysisJson) ? latest.analysisJson : null;
    const opportunityValues: unknown = analysis?.opportunities;
    const opportunities = Array.isArray(opportunityValues)
      ? opportunityValues.flatMap((value) => isJsonRecord(value) && typeof value.title === "string" ? [value.title] : []).slice(0, 3)
      : [];
    return {
      name: competitor.name,
      category: competitor.category,
      analyzedAt: analysis ? latest?.observedAt.toISOString() ?? null : null,
      summary: analysis && typeof analysis.summary === "string" ? analysis.summary : null,
      opportunities,
    };
  });
  const formats = generated.map((item) => contentFormat(item.contentJson)).filter((item): item is string => Boolean(item));
  const uniqueFormats = new Set(formats);
  const recentPosts = posts.filter((item) => ["PUBLISHED", "SCHEDULED", "PROCESSING"].includes(item.status)).length;
  const gaps = [
    !profile?.audience ? "Define a target audience" : null,
    !profile?.offers && !profile?.products ? "Add your products, services, or confirmed offers" : null,
    recentPosts < 4 ? "Build a sustainable four-post monthly rhythm" : null,
    generated.length > 0 && !uniqueFormats.has("video") ? "Add a video concept to your content mix" : null,
    !plans.length ? "Create a campaign plan for the next priority" : null,
    !analytics ? "Connect available platform analytics to measure results" : null,
  ].filter((item): item is string => Boolean(item));
  const healthSignals = [Boolean(profile?.industry), Boolean(profile?.audience), Boolean(profile?.products || profile?.offers), goals.length > 0, platforms.length > 0, recentPosts >= 4, plans.length > 0, analytics > 0];
  const healthScore = Math.round(healthSignals.filter(Boolean).length / healthSignals.length * 100);
  const healthLabel = healthScore >= 75 ? "Strong foundation" : healthScore >= 45 ? "Building momentum" : "Needs attention";
  const strategy = [
    goals.length ? `Primary goals: ${goals.join(", ")}.` : "Set a measurable marketing goal in Brand Profile.",
    profile?.audience ? `Audience focus: ${profile.audience}.` : "Audience is not defined yet.",
    platforms.length ? `Planned channels: ${platforms.join(", ")}.` : "Select the channels you want to serve.",
  ];
  return {
    brand: { name: brand.name, industry: profile?.industry ?? null },
    health: { score: healthScore, label: healthLabel, signals: healthSignals.filter(Boolean).length, totalSignals: healthSignals.length },
    strategy,
    metrics: { recentPosts, drafts: generated.length, plannedCampaigns: plans.length, connectedAccounts: accounts.length, analyticsAvailable: analytics > 0 },
    contextSummary: {
      industry: profile?.industry ?? null,
      recentPostCount: recentPosts,
      recentDesignCount: 0,
      analyticsAvailable: analytics > 0,
      analyticsSummary: analytics > 0 ? "Analytics snapshots are available for connected records." : "Performance analytics are not connected yet.",
      limitation: analytics > 0 ? "Only connected and stored platform metrics are used." : "Recommendations are based on your profile and workspace activity until analytics are available.",
    },
    content: { formats: Array.from(uniqueFormats), gaps: gaps.slice(0, 4) },
    campaigns: plans.map((plan) => ({ ...plan, startsAt: plan.startsAt.toISOString(), endsAt: plan.endsAt.toISOString() })),
    competitors: {
      entries: [...new Set([...competitors, ...competitorRecords.map((competitor) => competitor.name)])],
      status: recordedCompetitors.some((competitor) => competitor.summary)
        ? "Recent competitor analysis uses workspace-recorded public observations and labels AI interpretations as hypotheses. Automatic monitoring is not connected."
        : competitorRecords.length || competitors.length
          ? "Competitor profiles are recorded, but there is no analyzed, sourced observation yet. Add evidence in Competitor Intelligence."
          : "Add competitor profiles and dated public observations in Competitor Intelligence; no automatic public data collection is connected.",
      insights: recordedCompetitors,
    },
    performance: analytics > 0 ? { status: "Analytics snapshots are available for connected records.", evidence: "Recommendations use available workspace analytics; unavailable platform metrics are not estimated." } : { status: "No connected analytics snapshots yet.", evidence: "Performance recommendations are limited to profile and workspace activity." },
    priorities: gaps.slice(0, 3),
    recommendations,
  };
}
