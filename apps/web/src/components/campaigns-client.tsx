"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { platformSpecs } from "@united-technologies/shared/platform-specs";
import type { DesignDocument } from "@united-technologies/shared/design-document";
import { apiRequest } from "@/lib/api";
import { DesignDocumentPreview } from "@/components/design-document-preview";
import { CompactSelect } from "@/components/compact-select";

const platforms = Object.keys(platformSpecs);
const campaignObjectives = [
  "Brand Awareness",
  "Audience Growth",
  "Lead Generation",
  "Sales & Conversions",
  "Product/Service Launch",
  "Website Traffic",
  "Engagement & Community Building",
  "Event Promotion",
  "Customer Retention",
  "Re-engagement",
  "Upselling & Cross-selling",
  "Referral Generation",
  "Seasonal and Local Moments",
] as const;
const campaignFormats = [
  "post",
  "carousel",
  "story",
  "poster",
  "brochure",
  "flyer",
  "thumbnail",
  "video",
  "linkedin-banner",
  "pinterest-pin",
  "facebook-cover",
  "business-card",
  "festival-greeting",
] as const;
type CampaignFormat = (typeof campaignFormats)[number];
const formatLabels: Record<CampaignFormat, string> = {
  post: "Social post",
  carousel: "Carousel",
  story: "Story",
  poster: "Poster",
  brochure: "Brochure",
  flyer: "Flyer",
  thumbnail: "Thumbnail",
  video: "Video script",
  "linkedin-banner": "LinkedIn banner",
  "pinterest-pin": "Pinterest pin",
  "facebook-cover": "Facebook cover",
  "business-card": "Business card",
  "festival-greeting": "Festival greeting",
};

type CampaignConcept = {
  name: string;
  idea: string;
  rationale: string;
  audienceFit: number;
  originality: number;
  feasibility: number;
  potentialImpact: number;
  risks: string[];
};
type CampaignTask = {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  dueDay: number;
  dependsOn: string[];
  status: "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "BLOCKED";
  assignee: string;
  deliverable: string;
};
type TeamMember = { id: string; name: string; email: string };
type CampaignStrategy = {
  concepts: CampaignConcept[];
  recommendedConcept: string;
  audience: {
    idealCustomerProfile: string;
    demographics: string;
    interestsAndBehaviors: string[];
    motivations: string[];
    painPoints: string[];
    objections: string[];
    buyingTriggers: string[];
    contentPreferences: string[];
    awarenessLevel: string;
    journeyStage: string;
    segments: Array<{ name: string; description: string; intent: "high" | "medium" | "low"; message: string }>;
    decisionFactors: string[];
  };
  positioning: {
    coreMessage: string;
    uniqueSellingProposition: string;
    valueProposition: string;
    differentiation: string;
    narrative: string;
    theme: string;
    visualDirection: string;
    tone: string;
    offer: { recommendation: string; confirmationRequired: boolean; safeguard: string };
    hooks: string[];
    primaryCta: string;
    secondaryCta: string;
    contentPillars: Array<{ name: string; purpose: string }>;
  };
  channelStrategy: Array<{ platform: string; role: string; format: string; frequency: string; distribution: string; paidApproach: "organic" | "optional-paid-test"; reason: string }>;
  funnel: Array<{ stage: "Awareness" | "Consideration" | "Conversion" | "Retention"; purpose: string; contentApproach: string; callToAction: string }>;
  timeline: Array<{ phase: string; startDay: number; endDay: number; objective: string }>;
  contentSequence: Array<{ day: number; phase: string; funnelStage: string; pillar: string; topic: string; hook: string; callToAction: string }>;
  tasks: Array<{ title: string; description: string; priority: "high" | "medium" | "low"; dueDay: number; dependsOn: string[] }>;
  paidMedia: { recommended: boolean; rationale: string; lowBudgetTest: string; balanced: string; scaleOption: string; measurement: string[] };
  experiments: Array<{ variable: string; hypothesis: string; metric: string; duration: string; decisionRule: string }>;
  trackingRecommendations: string[];
  assumptions: string[];
};
type GeneratedItem = {
  id: string;
  contentJson: { title: string; format: string; platforms: string[]; caption: string };
  designs: Array<{ id: string; designJson: { document?: DesignDocument } }>;
};
type CampaignResponse = {
  provider: string;
  usage?: { used: number; limit: number | null };
  items: GeneratedItem[];
};
type CampaignReadiness = {
  score: number;
  ready: boolean;
  checks: Array<{ key: string; label: string; complete: boolean; critical: boolean }>;
  blockers: string[];
};
type PersistedCampaign = {
  id: string;
  brandId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: string;
  planJson?: Record<string, unknown>;
  itemCount: number;
  readiness: CampaignReadiness;
  campaign: {
    objective: string;
    primaryKpi: { metric: string; target: string };
    budget: string;
    durationDays: number;
    formats: CampaignFormat[];
    lifecycle: string;
    provider: string;
    strategy: CampaignStrategy;
    tasks: CampaignTask[];
    analyticsAvailable: boolean;
    research: { limitations: string[]; externalResearchConnected: boolean };
  };
};
type ContentPlanResponse = {
  campaign: PersistedCampaign;
};
type CampaignDetailResponse = ContentPlanResponse & { items: GeneratedItem[]; publisherCapabilities: PublisherCapabilities };
type PublisherCapabilities = {
  instagramConnected: boolean;
  instagramLivePublishingIntegrated: boolean;
  facebookConnected: boolean;
  facebookLivePublishingIntegrated: boolean;
  otherSelectedPlatformsAreDraftOnly: string[];
};

const defaultKpi: Record<string, string> = {
  "Brand Awareness": "Reach",
  "Audience Growth": "New followers",
  "Lead Generation": "Qualified leads",
  "Sales & Conversions": "Conversions",
  "Product/Service Launch": "Qualified launch actions",
  "Website Traffic": "Website sessions",
  "Engagement & Community Building": "Meaningful engagements",
  "Event Promotion": "Registrations",
  "Customer Retention": "Repeat purchases",
  "Re-engagement": "Reactivated customers",
  "Upselling & Cross-selling": "Upsell conversions",
  "Referral Generation": "Qualified referrals",
  "Seasonal and Local Moments": "Reach",
};

function localDateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type CampaignMoment = { title: string; date: Date; angle: string; outcome: string };

function localDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function occasionCampaignStartDate(occasionDate: string, offset: number, durationDays: number) {
  const start = new Date(`${occasionDate}T12:00:00`);
  start.setDate(start.getDate() + offset - Math.min(7, durationDays - 1));
  return localDateValue(start < new Date() ? new Date(Date.now() + 86_400_000) : start);
}

function upcomingCampaignMoments(country: string, industry: string): CampaignMoment[] {
  const now = new Date();
  const year = now.getFullYear();
  const india = /india/i.test(country);
  const dates = [
    { month: 0, day: 1, title: "New Year", angle: "Share a fresh start tied to real services", outcome: "Brand recall and saves" },
    { month: 1, day: 14, title: "Valentine’s Day", angle: "Show a thoughtful way customers can enjoy or share your service", outcome: "Shares and discovery" },
    { month: 2, day: 8, title: "International Women’s Day", angle: "Recognize people and stories connected to your community", outcome: "Meaningful engagement" },
    { month: 5, day: 5, title: "World Environment Day", angle: "Explain a verified sustainability practice, if your business has one", outcome: "Trust and saves" },
    { month: 5, day: 21, title: "International Yoga Day", angle: "Create a calm, useful moment that fits your audience", outcome: "Reach and engagement" },
    { month: 8, day: 27, title: "World Tourism Day", angle: "Show how your local experience fits into a day out", outcome: "Local discovery" },
    { month: 9, day: 16, title: "World Food Day", angle: "Tell the story behind an ingredient, dish, or food tradition", outcome: "Saves and profile visits" },
    { month: 11, day: 25, title: "Christmas", angle: "Share a warm seasonal brand story without inventing a promotion", outcome: "Brand recall and shares" },
  ];
  if (india) dates.push(
    { month: 0, day: 26, title: "India · Republic Day", angle: "Celebrate local culture through a verified team or menu story", outcome: "Community engagement" },
    { month: 7, day: 15, title: "India · Independence Day", angle: "Connect a local tradition or regional ingredient to your brand", outcome: "Reach and shares" },
    { month: 9, day: 2, title: "India · Gandhi Jayanti", angle: "Share a thoughtful message grounded in actual business practices", outcome: "Brand trust" },
    { month: 10, day: 14, title: "India · Children’s Day", angle: "Show a family-friendly experience only if it reflects your service", outcome: "Saves and local discovery" },
  );
  const moments = dates.flatMap((item) => [year, year + 1].map((eventYear) => ({ ...item, date: new Date(eventYear, item.month, item.day, 12) })))
    .filter((item) => item.date.getTime() > now.getTime() && item.date.getTime() < now.getTime() + 121 * 86_400_000)
    .map((item) => ({ title: item.title, angle: item.angle, outcome: item.outcome, date: item.date }));
  for (const eventYear of [year, year + 1]) {
    const thanksgiving = new Date(eventYear, 10, 1, 12);
    thanksgiving.setDate(1 + ((4 - thanksgiving.getDay() + 7) % 7) + 21);
    const blackFriday = new Date(thanksgiving);
    blackFriday.setDate(thanksgiving.getDate() + 1);
    if (blackFriday > now && blackFriday.getTime() < now.getTime() + 121 * 86_400_000) {
      moments.push({ title: "Black Friday", date: blackFriday, angle: "Share a clear, accurate offer with its terms and end date", outcome: "Offer discovery and conversions" });
    }
  }
  if (india) {
    const regionalDates = [
      { year: 2026, month: 0, day: 14, title: "Pongal / Makar Sankranti" },
      { year: 2027, month: 0, day: 15, title: "Pongal / Makar Sankranti" },
      { year: 2026, month: 10, day: 8, title: "Diwali" },
      { year: 2027, month: 9, day: 29, title: "Diwali" },
    ];
    for (const event of regionalDates) {
      const eventDate = new Date(event.year, event.month, event.day, 12);
      if (eventDate > now && eventDate.getTime() < now.getTime() + 121 * 86_400_000) {
        moments.push({ title: event.title, date: eventDate, angle: "Use local cultural context and only make claims or offers approved by your brand", outcome: "Relevant community engagement" });
      }
    }
  }
  const season = india
    ? now.getMonth() >= 2 && now.getMonth() <= 5 ? "Summer" : now.getMonth() >= 5 && now.getMonth() <= 8 ? "Monsoon" : "Winter"
    : now.getMonth() >= 2 && now.getMonth() <= 4 ? "Spring" : now.getMonth() >= 5 && now.getMonth() <= 7 ? "Summer" : now.getMonth() >= 8 && now.getMonth() <= 10 ? "Autumn" : "Winter";
  moments.push({ title: `${season} · ${industry || "brand"} stories`, date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 12), angle: `Create useful ${season.toLowerCase()} content around real services, ingredients, and customer needs`, outcome: "Sustained seasonal relevance" });
  return moments.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 4);
}

function createDateRange(startDate: string, durationDays: number) {
  const start = new Date(`${startDate}T09:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + durationDays - 1);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function dateInputValue(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function campaignErrorSummary(message: string) {
  if (/\b(429|503)\b|high demand|rate limit|temporarily unavailable/i.test(message)) {
    return "The configured AI providers are busy or temporarily unavailable. Try again shortly.";
  }
  if (/invalid_type|invalid input|expected (array|number|string)|schema/i.test(message)) {
    return "The generated response could not be used. Try again; if it keeps happening, review the technical details.";
  }
  return message.length > 240 ? `${message.slice(0, 240).trimEnd()}…` : message;
}

function downloadCampaign(campaign: PersistedCampaign) {
  const blob = new Blob([JSON.stringify(campaign, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${campaign.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "campaign"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CampaignsClient() {
  const [name, setName] = useState("");
  const [objective, setObjective] = useState<(typeof campaignObjectives)[number]>("Brand Awareness");
  const [goal, setGoal] = useState("");
  const [audience, setAudience] = useState("");
  const [primaryKpi, setPrimaryKpi] = useState("Reach");
  const [primaryTarget, setPrimaryTarget] = useState("");
  const [budget, setBudget] = useState("");
  const [formats, setFormats] = useState<CampaignFormat[]>(["post", "carousel"]);
  const [selectedPlatforms, setSelectedPlatforms] = useState(["Instagram", "LinkedIn"]);
  const [startDate, setStartDate] = useState(() => localDateOffset(1));
  const [occasionDate, setOccasionDate] = useState("");
  const [occasionOffset, setOccasionOffset] = useState(-2);
  const [durationDays, setDurationDays] = useState(14);
  const [campaignId, setCampaignId] = useState("");
  const [campaignLifecycle, setCampaignLifecycle] = useState("");
  const [publisherCapabilities, setPublisherCapabilities] = useState<PublisherCapabilities | null>(null);
  const [strategy, setStrategy] = useState<CampaignStrategy | null>(null);
  const [tasks, setTasks] = useState<CampaignTask[]>([]);
  const [readiness, setReadiness] = useState<CampaignReadiness | null>(null);
  const [generated, setGenerated] = useState<CampaignResponse | null>(null);
  const [campaignHistory, setCampaignHistory] = useState<PersistedCampaign[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [savedPlan, setSavedPlan] = useState<{ id: string; name: string } | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [showAllDays, setShowAllDays] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingStrategy, setSavingStrategy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [teamError, setTeamError] = useState("");
  const [aiConfigured, setAiConfigured] = useState(false);
  const [configurationLoaded, setConfigurationLoaded] = useState(false);
  const [configurationError, setConfigurationError] = useState("");
  const [brandMarket, setBrandMarket] = useState({ country: "", industry: "" });

  useEffect(() => {
    apiRequest<{ configured: boolean }>("/api/content/configuration")
      .then(({ configured }) => {
        setAiConfigured(configured);
        setConfigurationError("");
      })
      .catch((requestError: unknown) => {
        setAiConfigured(false);
        setConfigurationError(requestError instanceof Error ? requestError.message : "Could not check AI provider configuration.");
      })
      .finally(() => setConfigurationLoaded(true));
    apiRequest<{ brand: { profile?: { country?: string; industry?: string } | null } }>("/api/brand-profile")
      .then(({ brand }) => {
        const market = { country: brand.profile?.country ?? "", industry: brand.profile?.industry ?? "" };
        setBrandMarket(market);
        const params = new URLSearchParams(window.location.search);
        if (!params.has("goal")) {
          const nextMoment = upcomingCampaignMoments(market.country, market.industry)[0];
          if (nextMoment) applyCampaignMoment(nextMoment);
        }
      })
      .catch(() => setBrandMarket({ country: "", industry: "" }));
    apiRequest<{ campaigns: PersistedCampaign[] }>("/api/campaigns")
      .then(({ campaigns }) => {
        setCampaignHistory(campaigns);
        setHistoryError("");
      })
      .catch((requestError: unknown) => setHistoryError(requestError instanceof Error ? requestError.message : "Could not load campaign history."));
    apiRequest<{ members: Array<{ user: TeamMember }> }>("/api/team")
      .then(({ members }) => {
        setTeamMembers(members.map(({ user }) => user));
        setTeamError("");
      })
      .catch((requestError: unknown) => setTeamError(requestError instanceof Error ? requestError.message : "Could not load workspace team members."));
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const goalFromUrl = params.get("goal");
      const nameFromUrl = params.get("name");
      if (goalFromUrl) setGoal(goalFromUrl);
      if (nameFromUrl) setName(nameFromUrl);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function toggle<T extends string>(value: T, values: T[], setValues: (next: T[]) => void) {
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  function applyCampaignMoment(moment: CampaignMoment) {
    setName(`${moment.title} · ${brandMarket.industry || "Brand"}`);
    setObjective("Brand Awareness");
    setPrimaryKpi("Reach");
    setPrimaryTarget("Compare with the previous 14-day period");
    setGoal(`${moment.angle}. Intended outcome: ${moment.outcome}. Use verified business details only. Do not invent offers, discounts, prices, or claims.`);
    const eventDate = localDateValue(moment.date);
    setOccasionDate(eventDate);
    setStartDate(occasionCampaignStartDate(eventDate, occasionOffset, durationDays));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function refreshHistory() {
    try {
      const { campaigns } = await apiRequest<{ campaigns: PersistedCampaign[] }>("/api/campaigns");
      setCampaignHistory(campaigns);
      setHistoryError("");
    } catch (requestError) {
      setHistoryError(requestError instanceof Error ? requestError.message : "Could not refresh campaign history.");
    }
  }

  async function createCampaign(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError("");
    setNotice("");
    if (!startDate || startDate < localDateOffset(1)) {
      setError("Choose a start date beginning tomorrow or later.");
      return;
    }
    if (!goal.trim() || !primaryTarget.trim() || formats.length === 0 || selectedPlatforms.length === 0) {
      setError("Add a campaign brief, measurable KPI target, at least one format, and at least one platform.");
      return;
    }
    setCampaignId("");
    setCampaignLifecycle("");
    setPublisherCapabilities(null);
    setCreating(true);
    setGenerated(null);
    setSavedPlan(null);
    setStrategy(null);
    setTasks([]);
    setReadiness(null);
    setGenerationProgress(0);
    setShowAllDays(false);
    try {
      const { start, end } = createDateRange(startDate, durationDays);
      const result = await apiRequest<{ campaign: PersistedCampaign; publisherCapabilities: PublisherCapabilities }>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          objective,
          goal: goal.trim(),
          audience: audience.trim(),
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          durationDays,
          platforms: selectedPlatforms,
          formats,
          primaryKpi: { metric: primaryKpi, target: primaryTarget.trim() },
          budget: budget.trim(),
        }),
      });
      setCampaignId(result.campaign.id);
      setPublisherCapabilities(result.publisherCapabilities);
      setCampaignLifecycle(result.campaign.campaign.lifecycle);
      setStrategy(result.campaign.campaign.strategy);
      setTasks(result.campaign.campaign.tasks);
      setReadiness(result.campaign.readiness);
      setSavedPlan({ id: result.campaign.id, name: result.campaign.name });
      setNotice("Strategy saved. Review or edit it below before generating campaign assets.");
      await refreshHistory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not generate the campaign strategy.");
    } finally {
      setCreating(false);
    }
  }

  async function saveStrategy() {
    if (!campaignId || !strategy) return;
    setSavingStrategy(true);
    setError("");
    setNotice("");
    try {
      const updated = await apiRequest<ContentPlanResponse>(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim() || goal.trim().slice(0, 120),
          strategy,
        }),
      });
      setStrategy(updated.campaign.campaign.strategy);
      setTasks(updated.campaign.campaign.tasks);
      setCampaignLifecycle(updated.campaign.campaign.lifecycle);
      setReadiness(updated.campaign.readiness);
      setSavedPlan({ id: updated.campaign.id, name: updated.campaign.name });
      setNotice("Campaign strategy and your edits are saved.");
      await refreshHistory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save your strategy edits.");
    } finally {
      setSavingStrategy(false);
    }
  }

  function campaignItems(items: GeneratedItem[]) {
    const start = new Date(`${startDate}T09:00:00`);
    return items.map((item, index) => {
      const scheduledAt = new Date(start);
      scheduledAt.setDate(start.getDate() + index);
      return {
        contentId: item.id,
        scheduledAt: scheduledAt.toISOString(),
        format: item.contentJson.format,
        platforms: item.contentJson.platforms,
      };
    });
  }

  async function persistItems(items: GeneratedItem[], lifecycle: "PRODUCTION" | "REVIEW") {
    if (!campaignId) throw new Error("Save a campaign strategy before saving campaign assets.");
    const updated = await apiRequest<ContentPlanResponse>(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      body: JSON.stringify({ items: campaignItems(items), lifecycle }),
    });
    setCampaignLifecycle(updated.campaign.campaign.lifecycle);
    setReadiness(updated.campaign.readiness);
    setSavedPlan({ id: updated.campaign.id, name: updated.campaign.name });
    return updated;
  }

  async function generateAssets(resume = false) {
    if (!campaignId || !strategy) {
      setError("Generate and review the campaign strategy before creating assets.");
      return;
    }
    setError("");
    setNotice("");
    setCreating(true);
    const items = resume ? [...(generated?.items ?? [])] : [];
    setGenerationProgress(items.length);
    try {
      await persistItems(items, "PRODUCTION");
      for (let dayIndex = items.length; dayIndex < durationDays; dayIndex += 1) {
        const format = formats[dayIndex % formats.length]!;
        const sequence = strategy.contentSequence[dayIndex];
        if (!sequence) throw new Error(`The strategy is missing its day ${dayIndex + 1} content recommendation.`);
        const concept = strategy.concepts.find((item) => item.name === strategy.recommendedConcept);
        const dailyBrief = [
          `Campaign objective: ${objective}.`,
          `Campaign goal: ${goal.trim()}.`,
          `Campaign audience: ${strategy.audience.idealCustomerProfile}.`,
          `Recommended concept: ${concept?.name ?? strategy.recommendedConcept} - ${concept?.idea ?? ""}.`,
          `Core message: ${strategy.positioning.coreMessage}.`,
          `Theme and art direction: ${strategy.positioning.theme}; ${strategy.positioning.visualDirection}.`,
          `Day ${sequence.day} of ${durationDays}; campaign phase: ${sequence.phase}; funnel stage: ${sequence.funnelStage}.`,
          `Content pillar: ${sequence.pillar}. Topic: ${sequence.topic}.`,
          `Use this opening angle: ${sequence.hook}. CTA: ${sequence.callToAction}.`,
          "Do not invent or suggest discounts, offers, prices, scarcity, guarantees, or unverified claims. Focus on the supplied brand experience and services.",
          "Make this asset distinct from the other campaign days, specific to the audience, and factually limited to the supplied brand brief. Do not invent testimonials, statistics, discounts, scarcity, guarantees, or product claims.",
        ].join("\n");
        const dailyResponse = await apiRequest<CampaignResponse>("/api/content/generate", {
          method: "POST",
          body: JSON.stringify({
            idea: dailyBrief,
            formats: [format],
            platforms: selectedPlatforms,
            tone: strategy.positioning.tone,
            language: "English",
            useBrandProfile: true,
          }),
        });
        items.push(...dailyResponse.items);
        setGenerated({ ...dailyResponse, items: [...items] });
        setGenerationProgress(items.length);
        await persistItems(items, "PRODUCTION");
      }
      await persistItems(items, "REVIEW");
      setNotice(`${items.length} campaign drafts are saved and ready for review. Nothing has been scheduled or published.`);
      await refreshHistory();
    } catch (requestError) {
      setError(requestError instanceof Error
        ? items.length
          ? `${items.length} of ${durationDays} assets are saved. Continue generation or review the saved partial campaign: ${requestError.message}`
          : requestError.message
        : "Could not generate campaign assets.");
    } finally {
      setCreating(false);
    }
  }

  async function approveCampaign() {
    if (!campaignId) return;
    setError("");
    setNotice("");
    try {
      const updated = await apiRequest<ContentPlanResponse>(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify({ lifecycle: "APPROVED" }),
      });
      setCampaignLifecycle(updated.campaign.campaign.lifecycle);
      setReadiness(updated.campaign.readiness);
      setNotice("Campaign approved. It is not published yet; use Content Plans to send the approved drafts into the existing publishing workflow.");
      await refreshHistory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Campaign approval failed.");
    }
  }

  async function changeLifecycle(lifecycle: string) {
    if (!campaignId) return;
    setError("");
    setNotice("");
    try {
      const updated = await apiRequest<ContentPlanResponse>(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify({ lifecycle }),
      });
      setCampaignLifecycle(updated.campaign.campaign.lifecycle);
      setReadiness(updated.campaign.readiness);
      setNotice(lifecycle === "PAUSED"
        ? "Campaign paused. Existing drafts and strategy are preserved."
        : "Campaign resumed for review. Approval is required again before the publishing workflow.");
      await refreshHistory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update campaign status.");
    }
  }

  async function updateTask(index: number, status: CampaignTask["status"], assignee?: string) {
    if (!campaignId) return;
    setError("");
    try {
      const updated = await apiRequest<ContentPlanResponse>(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify({ taskUpdates: [{ index, status, ...(assignee !== undefined ? { assignee } : {}) }] }),
      });
      setTasks(updated.campaign.campaign.tasks);
      setReadiness(updated.campaign.readiness);
      await refreshHistory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update the campaign task.");
    }
  }

  async function duplicateCampaign(campaign: PersistedCampaign) {
    setError("");
    setNotice("");
    try {
      const { campaign: duplicate } = await apiRequest<{ campaign: PersistedCampaign }>(`/api/campaigns/${campaign.id}/duplicate`, { method: "POST" });
      setNotice(`Created ${duplicate.name}. Its strategy was copied; new assets and dates still need review.`);
      await refreshHistory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not duplicate this campaign.");
    }
  }

  async function openCampaign(campaign: PersistedCampaign) {
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<CampaignDetailResponse>(`/api/campaigns/${campaign.id}`);
      const storedCampaign = result.campaign.campaign;
      const planJson = result.campaign.planJson ?? {};
      const storedObjective = campaignObjectives.find((item) => item === storedCampaign.objective);
      setCampaignId(result.campaign.id);
      setPublisherCapabilities(result.publisherCapabilities);
      setCampaignLifecycle(storedCampaign.lifecycle);
      setStrategy(storedCampaign.strategy);
      setTasks(storedCampaign.tasks);
      setReadiness(result.campaign.readiness);
      setName(result.campaign.name);
      setGoal(typeof planJson.goal === "string" ? planJson.goal : "");
      setAudience(typeof planJson.audience === "string" ? planJson.audience : "");
      setObjective(storedObjective ?? "Brand Awareness");
      setPrimaryKpi(storedCampaign.primaryKpi.metric);
      setPrimaryTarget(storedCampaign.primaryKpi.target);
      setBudget(storedCampaign.budget);
      setFormats(storedCampaign.formats);
      setSelectedPlatforms(Array.isArray(planJson.platforms) ? planJson.platforms.filter((item): item is string => typeof item === "string") : []);
      setStartDate(dateInputValue(result.campaign.startsAt));
      setDurationDays(storedCampaign.durationDays);
      setGenerated(result.items.length ? { provider: storedCampaign.provider, items: result.items } : null);
      setSavedPlan({ id: result.campaign.id, name: result.campaign.name });
      setNotice(`Loaded ${result.campaign.name}. Continue editing, generate remaining assets, or review its saved drafts.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load this campaign.");
    }
  }

  return (
    <section className="dashboard-content campaign-page">
      <header className="campaign-page-heading">
        <p className="eyebrow">YOUR STUDIO · CAMPAIGNS</p>
        <h1>Campaign intelligence</h1>
        <p className="dashboard-lead">Turn a marketing goal into a sequenced, reviewable content plan.</p>
      </header>
      {configurationLoaded && !aiConfigured && <div className="notice notice-error" role="alert">{configurationError || <>AI generation is unavailable. Add <code>CLOUDFLARE_ACCOUNT_ID</code> and <code>CLOUDFLARE_API_TOKEN</code>, <code>GROQ_API_KEY</code>, or <code>OPENAI_API_KEY</code> to <code>apps/api/.env</code>, then restart the API.</>}</div>}
      <details className="campaign-capability-note">
        <summary>How campaign recommendations and publishing work</summary>
        <p>Strategy and copy are AI recommendations based on your brief and saved brand profile. External market and trend research is not connected.</p>
        <p>Instagram and Facebook Page text and image publishing are integrated. Other selected channels create content drafts. Metrics appear only when actual campaign-attributed data is available.</p>
      </details>
      <section className="campaign-moments" aria-label="Upcoming campaign ideas">
        <div className="campaign-moments-heading"><div><p className="eyebrow">BRAND CALENDAR</p><h2>Campaign ideas coming up</h2><p>Ideas use your saved industry and country. Outcomes are goals, not guaranteed results.</p></div><span>{brandMarket.country || "Global dates"}</span></div>
        <div className="campaign-moments-grid">{upcomingCampaignMoments(brandMarket.country, brandMarket.industry).map((moment) => <article className="campaign-moment-card" key={`${moment.title}-${moment.date.toISOString()}`}><time dateTime={moment.date.toISOString()}>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(moment.date)}</time><h3>{moment.title}</h3><p>{moment.angle}</p><small>Goal: {moment.outcome}</small><button type="button" className="button button-outline" onClick={() => applyCampaignMoment(moment)}>Use this idea</button></article>)}</div>
      </section>
      {publisherCapabilities && <div className="campaign-capability-note" role="status">
        {[...(selectedPlatforms.includes("Instagram") ? [publisherCapabilities.instagramConnected ? "Instagram is connected" : "Instagram is not connected"] : []), ...(selectedPlatforms.includes("Facebook") ? [publisherCapabilities.facebookConnected ? "Facebook Page is connected" : "Facebook Page is not connected"] : [])].join(" · ") || "No live publishing channel is selected."} Publishing requires the platform permissions and public media-hosting readiness where images are used.
        {publisherCapabilities.otherSelectedPlatformsAreDraftOnly.length > 0 && ` Draft-only channels: ${publisherCapabilities.otherSelectedPlatformsAreDraftOnly.join(", ")}.`}
      </div>}
      <form className="create-form campaign-form" onSubmit={(event) => void createCampaign(event)}>
        <fieldset className="campaign-fields" disabled={creating || savingStrategy || Boolean(campaignId && !savedPlan)}>
          <label className="create-idea-field">Primary campaign objective
            <CompactSelect aria-label="Primary campaign objective" value={objective} onChange={(event) => {
              const nextObjective = event.target.value as (typeof campaignObjectives)[number];
              setObjective(nextObjective);
              setPrimaryKpi(defaultKpi[nextObjective] ?? "Conversions");
            }}>
              {campaignObjectives.map((item) => <option key={item} value={item}>{item}</option>)}
            </CompactSelect>
          </label>
          <label className="create-idea-field">Campaign goal and brief
            <textarea required minLength={8} maxLength={1000} rows={3} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="What are you promoting, what outcome do you want, and what should people do next?" />
          </label>
          <details className="campaign-optional-fields">
            <summary>Campaign name, audience, success target, and budget</summary>
            <div className="campaign-optional-grid">
              <label className="create-idea-field">Campaign name
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Give this campaign a name" />
              </label>
              <label className="create-idea-field">Target audience
                <input value={audience} onChange={(event) => setAudience(event.target.value)} maxLength={1000} placeholder="Optional if your brand profile already defines your audience" />
              </label>
              <label className="create-idea-field">Primary success metric
                <input required value={primaryKpi} onChange={(event) => setPrimaryKpi(event.target.value)} maxLength={80} placeholder="e.g. qualified leads" />
              </label>
              <label className="create-idea-field">Target outcome
                <input required value={primaryTarget} onChange={(event) => setPrimaryTarget(event.target.value)} maxLength={120} placeholder="e.g. 25 qualified leads by campaign end" />
              </label>
              <label className="create-idea-field">Optional budget and currency
                <input value={budget} onChange={(event) => setBudget(event.target.value)} maxLength={80} placeholder="e.g. INR 10,000 total, or leave blank" />
              </label>
            </div>
          </details>
          <fieldset className="create-fieldset">
            <legend>Content formats</legend>
            <div className="create-option-grid">
              {campaignFormats.map((format) => (
                <label className="create-check" key={format}>
                  <input type="checkbox" checked={formats.includes(format)} onChange={() => toggle(format, formats, setFormats)} />
                  {formatLabels[format]}
                </label>
              ))}
            </div>
            <small className="campaign-format-help">The strategy recommends a daily sequence; selected formats rotate across the campaign. One content draft is generated per day.</small>
          </fieldset>
          <fieldset className="create-fieldset">
            <legend>Distribution channels</legend>
            <div className="create-option-grid create-platform-grid">
              {platforms.map((platform) => (
                <label className="create-check" key={platform}>
                  <input type="checkbox" checked={selectedPlatforms.includes(platform)} onChange={() => toggle(platform, selectedPlatforms, setSelectedPlatforms)} />
                  {platform}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="create-select-grid">
            <label>Occasion timing
              <CompactSelect aria-label="Occasion campaign timing" value={occasionOffset} onChange={(event) => {
                const offset = Number(event.target.value);
                setOccasionOffset(offset);
                if (occasionDate) setStartDate(occasionCampaignStartDate(occasionDate, offset, durationDays));
              }}>
                <option value={-2}>Main occasion post · 2 days before</option>
                <option value={0}>Main occasion post · event date</option>
                <option value={2}>Main occasion post · 2 days after</option>
              </CompactSelect>
              <small>The daily campaign sequence starts about a week before the selected occasion date.</small>
            </label>
            <label>Start date
              <input required type="date" min={localDateOffset(1)} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>Campaign duration
              <CompactSelect aria-label="Campaign duration" value={durationDays} onChange={(event) => {
                const days = Number(event.target.value);
                setDurationDays(days);
                if (occasionDate) setStartDate(occasionCampaignStartDate(occasionDate, occasionOffset, days));
              }}>
                <option value={7}>1 week</option><option value={14}>2 weeks</option><option value={30}>30 days</option>
              </CompactSelect>
            </label>
          </div>
        </fieldset>
        {error && <div className="campaign-error-panel" role="alert">
          <strong>{/AI provider|cloudflare|workers ai|groq|openai|high demand|rate limit/i.test(error) ? "Strategy could not be generated" : "Campaign action could not be completed"}</strong>
          <p>{campaignErrorSummary(error)}</p>
          {error.length > 240 && <details><summary>Technical details</summary><pre>{error}</pre></details>}
        </div>}
        {notice && <p className="form-success" role="status">{notice}{savedPlan && <> <Link href="/dashboard/content-plans">Open Content Plans</Link></>}</p>}
        <button type="submit" className="button button-gold" disabled={creating || formats.length === 0 || selectedPlatforms.length === 0 || !primaryTarget.trim()}>
          {creating ? "Building your campaign strategy…" : strategy ? "Generate a new campaign strategy" : "Build campaign strategy"}
        </button>
      </form>

      {strategy && campaignId && (
        <section className="campaign-results campaign-intelligence-workspace" aria-label="Campaign strategy workspace">
          <div className="created-results-heading">
          <div><p className="card-kicker">CAMPAIGN WORKSPACE · {campaignLifecycle.replaceAll("_", " ")}</p><h2>{savedPlan?.name ?? (name || goal)}</h2><p>{objective} · {primaryKpi}: {primaryTarget} · {durationDays} days</p></div>
            <button className="button button-outline" type="button" onClick={() => {
              const campaign = campaignHistory.find((item) => item.id === campaignId);
              if (campaign) downloadCampaign(campaign);
            }}>Export saved campaign</button>
          </div>

          <section className="campaign-strategy-section">
            <div className="campaign-section-heading"><div><p className="card-kicker">1 · STRATEGIC CONCEPTS</p><h2>Choose the direction</h2><p>Scores are AI assessments, not market research or guaranteed outcomes.</p></div></div>
            <div className="campaign-concept-grid">
              {strategy.concepts.map((concept) => (
                <label className={`campaign-concept-card${strategy.recommendedConcept === concept.name ? " is-selected" : ""}`} key={concept.name}>
                  <span><input type="radio" name="campaign-concept" checked={strategy.recommendedConcept === concept.name} onChange={() => setStrategy({ ...strategy, recommendedConcept: concept.name })} />{concept.name}</span>
                  <p>{concept.idea}</p><small>{concept.rationale}</small>
                  <div className="campaign-score-row"><span>Audience {concept.audienceFit}</span><span>Originality {concept.originality}</span><span>Feasibility {concept.feasibility}</span><span>Impact {concept.potentialImpact}</span></div>
                  {concept.risks.length > 0 && <small>Risks to check: {concept.risks.join("; ")}</small>}
                </label>
              ))}
            </div>
          </section>

          <section className="campaign-strategy-section">
            <div className="campaign-section-heading"><div><p className="card-kicker">2 · AUDIENCE INTELLIGENCE</p><h2>Audience and journey</h2></div></div>
            <article className="campaign-insight-card">
              <h3>Ideal customer profile</h3><p>{strategy.audience.idealCustomerProfile}</p>
              {strategy.audience.demographics && <p><strong>Demographics (hypothesis):</strong> {strategy.audience.demographics}</p>}
              <p><strong>Awareness:</strong> {strategy.audience.awarenessLevel} · <strong>Journey stage:</strong> {strategy.audience.journeyStage}</p>
              <div className="campaign-insight-grid">
                <div><h4>Motivations and triggers</h4><ul>{[...strategy.audience.motivations, ...strategy.audience.buyingTriggers].slice(0, 6).map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>
                <div><h4>Pain points and objections</h4><ul>{[...strategy.audience.painPoints, ...strategy.audience.objections].slice(0, 6).map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>
              </div>
              <div className="campaign-segment-list">{strategy.audience.segments.map((segment) => <article key={segment.name}><strong>{segment.name}</strong><span>{segment.intent} intent</span><p>{segment.description}</p><small>{segment.message}</small></article>)}</div>
            </article>
          </section>

          <section className="campaign-strategy-section">
            <div className="campaign-section-heading"><div><p className="card-kicker">3 · POSITIONING AND CREATIVE DIRECTION</p><h2>Review and edit the strategy</h2></div></div>
            <div className="campaign-strategy-edit-grid">
              <label>Core message<textarea rows={3} value={strategy.positioning.coreMessage} onChange={(event) => setStrategy({ ...strategy, positioning: { ...strategy.positioning, coreMessage: event.target.value } })} /></label>
              <label>Unique value proposition<textarea rows={3} value={strategy.positioning.valueProposition} onChange={(event) => setStrategy({ ...strategy, positioning: { ...strategy.positioning, valueProposition: event.target.value } })} /></label>
              <label>Campaign theme<input value={strategy.positioning.theme} onChange={(event) => setStrategy({ ...strategy, positioning: { ...strategy.positioning, theme: event.target.value } })} /></label>
              <label>Visual direction<textarea rows={3} value={strategy.positioning.visualDirection} onChange={(event) => setStrategy({ ...strategy, positioning: { ...strategy.positioning, visualDirection: event.target.value } })} /></label>
              <label>Primary CTA<input value={strategy.positioning.primaryCta} onChange={(event) => setStrategy({ ...strategy, positioning: { ...strategy.positioning, primaryCta: event.target.value } })} /></label>
              <label>Secondary CTA<input value={strategy.positioning.secondaryCta} onChange={(event) => setStrategy({ ...strategy, positioning: { ...strategy.positioning, secondaryCta: event.target.value } })} /></label>
            </div>
            <div className="campaign-hook-list"><strong>Suggested hooks</strong>{strategy.positioning.hooks.map((hook) => <p key={hook}>{hook}</p>)}</div>
            <div className="campaign-pillars">{strategy.positioning.contentPillars.map((pillar) => <article key={pillar.name}><strong>{pillar.name}</strong><p>{pillar.purpose}</p></article>)}</div>
            <button className="button button-outline" type="button" onClick={() => void saveStrategy()} disabled={savingStrategy || creating}>{savingStrategy ? "Saving strategy…" : "Save strategy edits"}</button>
          </section>

          <section className="campaign-strategy-section">
            <div className="campaign-section-heading"><div><p className="card-kicker">4 · CHANNEL AND FUNNEL PLAN</p><h2>Recommended distribution</h2></div></div>
            <div className="campaign-channel-grid">{strategy.channelStrategy.map((channel) => <article className="campaign-insight-card" key={channel.platform}><h3>{channel.platform}</h3><p>{channel.reason}</p><p><strong>Role:</strong> {channel.role}</p><p><strong>Format/frequency:</strong> {channel.format} · {channel.frequency}</p><p><strong>Distribution:</strong> {channel.distribution}</p><small>{channel.paidApproach === "organic" ? "Organic recommendation" : "Optional paid test recommendation; no ad account is connected here."}</small></article>)}</div>
            <div className="campaign-funnel-grid">{strategy.funnel.map((stage) => <article key={stage.stage}><strong>{stage.stage}</strong><p>{stage.purpose}</p><small>{stage.contentApproach}</small><p><strong>CTA:</strong> {stage.callToAction}</p></article>)}</div>
          </section>

          <section className="campaign-strategy-section">
            <div className="campaign-section-heading"><div><p className="card-kicker">5 · TIMELINE AND CALENDAR</p><h2>Sequenced campaign plan</h2><p>Recommended dates are drafts only. They are not queued or published.</p></div></div>
            <div className="campaign-timeline">{strategy.timeline.map((phase) => <article key={`${phase.phase}-${phase.startDay}`}><span>Days {phase.startDay}–{phase.endDay}</span><strong>{phase.phase}</strong><p>{phase.objective}</p></article>)}</div>
            <div className="campaign-sequence-list">{strategy.contentSequence.map((item) => <article key={item.day}><span>Day {item.day} · {item.funnelStage}</span><strong>{item.topic}</strong><p>{item.phase} · {item.pillar}</p><small>{item.hook} · CTA: {item.callToAction}</small></article>)}</div>
          </section>

          <section className="campaign-strategy-section">
            <div className="campaign-section-heading"><div><p className="card-kicker">6 · EXECUTION AND EXPERIMENTS</p><h2>Tasks and testing plan</h2></div></div>
            {teamError && <p className="campaign-caution-note" role="status">Team assignments are unavailable: {teamError}</p>}
            <div className="campaign-task-list">{tasks.map((task, index) => <article key={`${index}-${task.title}`}><div><strong>{task.title}</strong><p>{task.description}</p><small>Due by day {task.dueDay} · {task.priority} priority{task.dependsOn.length ? ` · Depends on: ${task.dependsOn.join(", ")}` : ""}</small><label className="campaign-task-assignee">Assigned to<CompactSelect aria-label={`Assignee for ${task.title}`} value={task.assignee ?? ""} onChange={(event) => void updateTask(index, task.status, event.target.value)}><option value="">Unassigned</option>{teamMembers.map((member) => <option value={member.id} key={member.id}>{member.name} ({member.email})</option>)}</CompactSelect></label></div><CompactSelect aria-label={`Status for ${task.title}`} value={task.status} onChange={(event) => void updateTask(index, event.target.value as CampaignTask["status"], task.assignee)}><option value="NOT_STARTED">Not started</option><option value="IN_PROGRESS">In progress</option><option value="DONE">Done</option><option value="BLOCKED">Blocked</option></CompactSelect></article>)}</div>
            <div className="campaign-insight-grid"><article className="campaign-insight-card"><h3>Optional paid media</h3><p>{strategy.paidMedia.rationale}</p><p><strong>Low-budget test:</strong> {strategy.paidMedia.lowBudgetTest}</p><p><strong>Balanced:</strong> {strategy.paidMedia.balanced}</p><p><strong>Scale option:</strong> {strategy.paidMedia.scaleOption}</p><small>Recommendations only. Ad campaigns are not launched by this app.</small></article><article className="campaign-insight-card"><h3>Experiments</h3>{strategy.experiments.map((experiment) => <p key={experiment.variable}><strong>{experiment.variable}:</strong> {experiment.hypothesis} Metric: {experiment.metric}. {experiment.duration}. Decide: {experiment.decisionRule}</p>)}</article></div>
          </section>

          <section className="campaign-strategy-section">
            <div className="campaign-section-heading"><div><p className="card-kicker">7 · READINESS AND APPROVAL</p><h2>Launch readiness</h2></div><strong className="campaign-readiness-score">{readiness?.score ?? 0}%</strong></div>
            <ul className="campaign-readiness-list">{readiness?.checks.map((check) => <li className={check.complete ? "is-complete" : "is-incomplete"} key={check.key}>{check.complete ? "Complete" : check.critical ? "Required" : "Recommended"} · {check.label}</li>)}</ul>
            {readiness?.blockers.length ? <p className="campaign-caution-note">Before approval: {readiness.blockers.join("; ")}</p> : null}
            <p className="campaign-caution-note">Tracking suggestions: {strategy.trackingRecommendations.join(" · ")}</p>
            {strategy.assumptions.length > 0 && <details className="campaign-optional-fields"><summary>Assumptions and research limits</summary><ul>{strategy.assumptions.map((item) => <li key={item}>{item}</li>)}</ul><p>No external keyword, search-volume, competitor, or trend research is connected.</p></details>}
            <div className="campaign-workflow-actions">
              {campaignLifecycle === "PAUSED"
                ? <button className="button button-outline" type="button" onClick={() => void changeLifecycle(generated?.items.length === durationDays ? "REVIEW" : generated?.items.length ? "PRODUCTION" : "PLANNING")} disabled={creating}>Resume campaign</button>
                : campaignLifecycle !== "COMPLETED" && <button className="button button-outline" type="button" onClick={() => void changeLifecycle("PAUSED")} disabled={creating}>Pause campaign</button>}
              {!generated && <button className="button button-gold" type="button" onClick={() => void generateAssets()} disabled={creating || savingStrategy}>{creating ? `Generating day ${Math.min(generationProgress + 1, durationDays)} of ${durationDays}…` : `Generate ${durationDays} campaign assets`}</button>}
              {generated && generated.items.length < durationDays && <button className="button button-outline" type="button" onClick={() => void generateAssets(true)} disabled={creating}>{creating ? `Generating day ${Math.min(generationProgress + 1, durationDays)} of ${durationDays}…` : `Continue remaining assets (${generated.items.length}/${durationDays})`}</button>}
              {generated && generated.items.length > 0 && <button className="button button-outline" type="button" onClick={() => void persistItems(generated.items, "PRODUCTION")} disabled={creating}>Save partial campaign</button>}
              {generated && generated.items.length === durationDays && readiness?.ready && campaignLifecycle !== "APPROVED" && <button className="button button-gold" type="button" onClick={() => void approveCampaign()} disabled={creating}>Approve campaign for publishing workflow</button>}
              {campaignLifecycle === "APPROVED" && <Link className="button button-outline" href="/dashboard/content-plans">Open Content Plans</Link>}
            </div>
            {creating && <progress className="campaign-generation-progress" max={durationDays} value={generationProgress} aria-label={`Generated ${generationProgress} of ${durationDays} daily assets`} />}
            {generated?.usage && <p className="create-usage">{generated.usage.limit === null ? `${generated.usage.used} generations used this month · Unlimited during trial` : `${generated.usage.used} of ${generated.usage.limit} generations used this month`} · Latest provider: {generated.provider}</p>}
            <p className="campaign-caution-note">{generated?.items.length ?? 0} generated drafts · actual campaign-attributed reach, engagement, leads, conversions, and return are unavailable until a connected source provides those metrics. No performance is estimated here.</p>
          </section>
        </section>
      )}

      {generated && (
        <section className="campaign-results" aria-label="Generated campaign drafts">
          <div className="created-results-heading"><div><p className="card-kicker">CAMPAIGN CALENDAR · {generated.items.length}/{durationDays}</p><h2>{savedPlan?.name ?? (name || goal)}</h2><p>These are editable saved drafts. Review content in the library and publish through the existing approvals workflow.</p></div><Link href="/dashboard/content">Review drafts</Link></div>
          <div className="campaign-draft-list">
            {(showAllDays ? generated.items : generated.items.slice(0, 6)).map((item, index) => {
              const scheduledDate = new Date(`${startDate}T09:00:00`);
              scheduledDate.setDate(scheduledDate.getDate() + index);
              const document = item.designs[0]?.designJson.document;
              const sequence = strategy?.contentSequence[index];
              return (
                <article className="campaign-draft-card" key={item.id}>
                  <header><span>DAY {String(index + 1).padStart(2, "0")}</span><time dateTime={scheduledDate.toISOString()}>{scheduledDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time></header>
                  {sequence && <small>{sequence.funnelStage} · {sequence.phase}</small>}
                  {document && <div className="campaign-draft-visual"><DesignDocumentPreview document={document} title={item.contentJson.title} compact /></div>}
                  <div className="campaign-draft-copy"><span>{item.contentJson.format.replaceAll("-", " ")}</span><h3>{item.contentJson.title}</h3></div>
                  <details className="campaign-draft-details">
                    <summary>Read draft copy</summary>
                    <p>{item.contentJson.caption}</p>
                    <small>{item.contentJson.platforms.join(" · ")}</small>
                  </details>
                </article>
              );
            })}
          </div>
          {generated.items.length > 6 && <button className="button button-outline campaign-show-days" type="button" onClick={() => setShowAllDays((visible) => !visible)}>{showAllDays ? "Show fewer days" : `Show all ${generated.items.length} days`}</button>}
        </section>
      )}

      <section className="campaign-history-section">
        <div className="created-results-heading"><div><p className="card-kicker">SAVED CAMPAIGNS</p><h2>Campaign history</h2><p>Strategies and planning data are persisted in the workspace. Duplicate to reuse strategy without copying campaign assets.</p></div><button className="button button-outline" type="button" onClick={() => void refreshHistory()}>Refresh</button></div>
        {historyError && <p className="form-error" role="alert">{historyError}</p>}
        {campaignHistory.length === 0 ? <p className="campaign-history-empty">Saved campaigns will appear here after a strategy is generated.</p> : <div className="campaign-history-list">{campaignHistory.map((campaign) => (
          <article className="campaign-history-card" key={campaign.id}>
            <div><span>{campaign.campaign.lifecycle.replaceAll("_", " ")}</span><h3>{campaign.name}</h3><p>{campaign.campaign.objective} · {campaign.campaign.primaryKpi.metric}: {campaign.campaign.primaryKpi.target}</p><small>{campaign.itemCount} assets · readiness {campaign.readiness.score}% · {new Date(campaign.startsAt).toLocaleDateString()}–{new Date(campaign.endsAt).toLocaleDateString()}</small></div>
            <div className="campaign-history-actions"><button className="button button-outline" type="button" onClick={() => void openCampaign(campaign)}>Open</button><button className="button button-outline" type="button" onClick={() => downloadCampaign(campaign)}>Export</button><button className="button button-outline" type="button" onClick={() => void duplicateCampaign(campaign)}>Duplicate</button><Link className="button button-outline" href="/dashboard/content-plans">Open plans</Link></div>
            <details className="campaign-history-details"><summary>View strategy summary</summary><p>{campaign.campaign.strategy.positioning.coreMessage}</p><p><strong>Recommended concept:</strong> {campaign.campaign.strategy.recommendedConcept}</p><p><strong>Audience:</strong> {campaign.campaign.strategy.audience.idealCustomerProfile}</p><small>Provider: {campaign.campaign.provider} · External research {campaign.campaign.research.externalResearchConnected ? "connected" : "not connected"}</small></details>
          </article>
        ))}</div>}
      </section>
    </section>
  );
}
