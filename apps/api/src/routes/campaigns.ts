import { Router } from "express";
import { Prisma } from "@prisma/client";
import { getLegacyDesignDocument } from "@united-technologies/shared/design-document";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireCompleteBrandProfile, requireWritableWorkspace, requireWorkspace } from "../middleware/auth.js";
import { campaignObjectives, campaignStrategySchema, generateCampaignStrategy } from "../services/campaign-strategy.js";

const router = Router();
const campaignInputSchema = z.object({
  name: z.string().trim().max(120).default(""),
  objective: z.enum(campaignObjectives),
  goal: z.string().trim().min(8).max(1000),
  audience: z.string().trim().max(1000).default(""),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  durationDays: z.number().int().min(7).max(30),
  platforms: z.array(z.string().trim().min(2).max(40)).min(1).max(12).refine((items) => new Set(items).size === items.length, "Select each platform only once."),
  formats: z.array(z.string().trim().min(2).max(40)).min(1).max(14).refine((items) => new Set(items).size === items.length, "Select each content format only once."),
  primaryKpi: z.object({
    metric: z.string().trim().min(2).max(80),
    target: z.string().trim().min(1).max(120),
  }).strict(),
  budget: z.string().trim().max(80).default(""),
}).strict();
const campaignItemSchema = z.object({
  contentId: z.string().trim().min(1),
  scheduledAt: z.string().datetime(),
  format: z.string().trim().min(1).max(40),
  platforms: z.array(z.string().trim().min(2).max(40)).min(1).max(12),
}).strict();
const updateCampaignSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  lifecycle: z.enum(["PLANNING", "PRODUCTION", "REVIEW", "APPROVED", "SCHEDULED", "LIVE", "COMPLETED", "PAUSED"]).optional(),
  items: z.array(campaignItemSchema).max(60).optional(),
  strategy: campaignStrategySchema.optional(),
  taskUpdates: z.array(z.object({
    index: z.number().int().min(0).max(11),
    status: z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE", "BLOCKED"]),
    assignee: z.string().trim().max(120).optional(),
  }).strict()).max(12).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

function isJsonObject(value: Prisma.JsonValue | undefined): value is Prisma.JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonStrings(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function campaignFromPlan(planJson: Prisma.JsonValue) {
  if (!isJsonObject(planJson) || !isJsonObject(planJson.campaign)) return null;
  return planJson.campaign;
}

function taskRecords(strategy: z.infer<typeof campaignStrategySchema>) {
  return strategy.tasks.map((task) => ({
    ...task,
    status: "NOT_STARTED",
    assignee: "",
    deliverable: task.description,
  }));
}

function readiness(campaign: Prisma.JsonObject | Prisma.InputJsonObject, itemCount: number) {
  const strategyValue: unknown = campaign["strategy"];
  const strategy: Record<string, unknown> = isRecord(strategyValue) ? strategyValue : {};
  const audience = typeof campaign.audience === "string" ? campaign.audience.trim() : "";
  const primaryKpiValue: unknown = campaign["primaryKpi"];
  const primaryKpi: Record<string, unknown> = isRecord(primaryKpiValue) ? primaryKpiValue : {};
  const positioningValue: unknown = strategy["positioning"];
  const positioning: Record<string, unknown> = isRecord(positioningValue) ? positioningValue : {};
  const channels = Array.isArray(campaign.platforms) ? campaign.platforms.length : 0;
  const expectedAssets = typeof campaign.durationDays === "number" ? campaign.durationDays : 1;
  const checks = [
    { key: "objective", label: "Primary objective selected", complete: typeof campaign.objective === "string" && campaign.objective.length > 0, critical: true },
    { key: "kpi", label: "Measurable KPI and target defined", complete: typeof primaryKpi.metric === "string" && typeof primaryKpi.target === "string" && primaryKpi.target.trim().length > 0, critical: true },
    { key: "audience", label: "Audience brief defined", complete: audience.length > 0, critical: true },
    { key: "strategy", label: "Strategy and creative direction generated", complete: typeof positioning.coreMessage === "string" && typeof positioning.primaryCta === "string", critical: true },
    { key: "channels", label: "Distribution channels selected", complete: channels > 0, critical: true },
    { key: "assets", label: `All ${expectedAssets} planned campaign assets generated`, complete: itemCount >= expectedAssets, critical: true },
    { key: "approval", label: "Human review completed", complete: campaign.lifecycle === "APPROVED" || campaign.lifecycle === "SCHEDULED" || campaign.lifecycle === "LIVE" || campaign.lifecycle === "COMPLETED", critical: true },
    { key: "tracking", label: "Tracking and attribution configured", complete: campaign.trackingConfigured === true, critical: false },
  ];
  const completed = checks.filter((check) => check.complete).length;
  return {
    score: Math.round(completed / checks.length * 100),
    ready: checks.every((check) => check.key === "approval" || !check.critical || check.complete),
    checks,
    blockers: checks.filter((check) => check.critical && !check.complete).map((check) => check.label),
  };
}

router.use(requireAuth, requireWorkspace, requireCompleteBrandProfile);

router.get("/", async (req, res, next) => {
  try {
    const brandId = req.header("x-brand-id");
    const plans = await prisma.contentPlan.findMany({
      where: { workspaceId: req.workspace!.id, ...(brandId ? { brandId } : {}) },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: { id: true, brandId: true, name: true, startsAt: true, endsAt: true, planJson: true, status: true, createdAt: true, updatedAt: true },
    });
    const campaigns = plans.flatMap((plan) => {
      const campaign = campaignFromPlan(plan.planJson);
      if (!campaign) return [];
      const items = isJsonObject(plan.planJson) && Array.isArray(plan.planJson.items) ? plan.planJson.items : [];
      const campaignReadiness = readiness(campaign, items.length);
      return [{ ...plan, planJson: plan.planJson, campaign, readiness: campaignReadiness, itemCount: items.length }];
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({ campaigns });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireWritableWorkspace, async (req, res, next) => {
  try {
    const input = campaignInputSchema.parse(req.body);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) {
      res.status(400).json({ error: "The campaign end date must be after its start date." });
      return;
    }

    const brandId = req.header("x-brand-id");
    const brand = await prisma.brand.findFirst({
      where: { workspaceId: req.workspace!.id, ...(brandId ? { id: brandId } : {}) },
      select: {
        id: true,
        name: true,
        profile: { select: { industry: true, description: true, products: true, audience: true, offers: true, tone: true, brandVoiceRules: true, bannedWords: true } },
        kit: { select: { colors: true } },
      },
    });
    if (!brand) {
      res.status(404).json({ error: "No brand profile exists in this workspace." });
      return;
    }
    const audience = input.audience || brand.profile?.audience?.trim() || "";
    const productDetails = [brand.profile?.products, brand.profile?.description].filter((value): value is string => Boolean(value?.trim())).join("\n");
    const missingInformation = [
      ...(!audience ? ["Describe the intended customers and their main needs."] : []),
      ...(!productDetails ? ["Add the product or service details this campaign should promote."] : []),
    ];
    if (missingInformation.length) {
      res.status(422).json({
        error: `Add the missing campaign context before generating a strategy: ${missingInformation.join(" ")}`,
        missingInformation,
      });
      return;
    }

    const [existingDrafts, availableAssets, analyticsCount, connectedAccounts, existingPlans, marketingBrainInsights, competitors] = await Promise.all([
      prisma.generatedContent.findMany({
        where: { workspaceId: req.workspace!.id, brandId: brand.id },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { contentJson: true, createdAt: true },
      }),
      prisma.mediaAsset.findMany({
        where: { workspaceId: req.workspace!.id, OR: [{ brandId: brand.id }, { brandId: null }] },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { fileName: true, mimeType: true },
      }),
      prisma.analyticsSnapshot.count({ where: { workspaceId: req.workspace!.id, post: { brandId: brand.id } } }),
      prisma.socialAccount.findMany({
        where: { workspaceId: req.workspace!.id, status: "CONNECTED", provider: { in: ["instagram", "facebook"] } },
        select: { provider: true, displayName: true },
      }),
      prisma.contentPlan.findMany({
        where: { workspaceId: req.workspace!.id, brandId: brand.id },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { name: true, status: true, planJson: true },
      }),
      prisma.marketingRecommendation.findMany({
        where: { workspaceId: req.workspace!.id, brandId: brand.id, status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { title: true, explanation: true },
      }),
      prisma.competitor.findMany({
        where: { workspaceId: req.workspace!.id, brandId: brand.id },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          name: true,
          snapshots: {
            orderBy: { observedAt: "desc" },
            take: 8,
            select: { analysisJson: true },
          },
        },
      }),
    ]);

    const histories = existingPlans.flatMap((plan) => {
      const campaign = campaignFromPlan(plan.planJson);
      if (!campaign) return [];
      return [{
        name: plan.name,
        objective: typeof campaign.objective === "string" ? campaign.objective : "Unknown",
        status: plan.status,
      }];
    });
    const strategyRequest = {
      name: input.name || input.goal.slice(0, 120),
      objective: input.objective,
      goal: input.goal,
      audience,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      durationDays: input.durationDays,
      platforms: input.platforms,
      formats: input.formats,
      primaryKpi: input.primaryKpi,
      budget: input.budget,
      brand: {
        name: brand.name,
        industry: brand.profile?.industry ?? null,
        description: brand.profile?.description ?? null,
        products: brand.profile?.products ?? null,
        audience: brand.profile?.audience ?? null,
        offers: brand.profile?.offers ?? null,
        tone: brand.profile?.tone ?? null,
        voiceRules: jsonStrings(brand.profile?.brandVoiceRules),
        bannedWords: jsonStrings(brand.profile?.bannedWords),
        colors: Array.isArray(brand.kit?.colors) ? brand.kit.colors.filter((color): color is string => typeof color === "string") : [],
      },
      contentAudit: {
        existingDrafts: existingDrafts.map((draft) => {
          const json = isJsonObject(draft.contentJson) ? draft.contentJson : {};
          return {
            title: typeof json.title === "string" ? json.title : "Untitled draft",
            format: typeof json.format === "string" ? json.format : "unknown",
            createdAt: draft.createdAt.toISOString(),
          };
        }),
        availableAssets,
        analyticsAvailable: analyticsCount > 0,
      },
      marketingBrainInsights,
      competitorInsights: competitors.flatMap((competitor) => {
        const analysis = competitor.snapshots
          .map((snapshot) => snapshot.analysisJson)
          .find((value) => isJsonObject(value) && typeof value.summary === "string");
        if (!isJsonObject(analysis) || typeof analysis.summary !== "string") return [];
        const opportunityValues: unknown = analysis.opportunities;
        const opportunities = Array.isArray(opportunityValues)
          ? opportunityValues.flatMap((value) => isJsonObject(value) && typeof value.title === "string" ? [value.title] : []).slice(0, 5)
          : [];
        return [{ competitorName: competitor.name, summary: analysis.summary, opportunities }];
      }),
      history: histories,
    } as const;
    let strategy: Awaited<ReturnType<typeof generateCampaignStrategy>>;
    try {
      strategy = await generateCampaignStrategy(strategyRequest);
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Campaign strategy generation failed." });
      return;
    }
    if (strategy.strategy.contentSequence.length !== input.durationDays ||
      strategy.strategy.contentSequence.some((item, index) => item.day !== index + 1)) {
      res.status(502).json({
        error: "The AI strategy did not return one correctly numbered content recommendation for every campaign day. Try generating the strategy again.",
      });
      return;
    }
    if (strategy.strategy.channelStrategy.some((channel) => !input.platforms.includes(channel.platform)) ||
      input.platforms.some((platform) => !strategy.strategy.channelStrategy.some((channel) => channel.platform === platform))) {
      res.status(502).json({ error: "The AI strategy returned a channel recommendation that does not match your selected platforms. Try again." });
      return;
    }

    const campaign = {
      version: 1,
      objective: input.objective,
      primaryKpi: input.primaryKpi,
      audience,
      platforms: input.platforms,
      formats: input.formats,
      budget: input.budget,
      durationDays: input.durationDays,
      lifecycle: "PLANNING",
      provider: strategy.provider,
      generatedAt: new Date().toISOString(),
      strategy: strategy.strategy,
      tasks: taskRecords(strategy.strategy),
      contentIds: [],
      trackingConfigured: false,
      research: {
        sourcesUsed: ["User-provided campaign brief", "Saved brand profile", "Workspace content and media inventory"],
        externalResearchConnected: false,
        limitations: ["No external keyword, trend, competitor, or search-volume research service is connected."],
      },
      connectedAccounts: connectedAccounts.map((account) => ({ platform: account.provider, displayName: account.displayName })),
      analyticsAvailable: analyticsCount > 0,
    };
    const plan = await prisma.contentPlan.create({
      data: {
        workspaceId: req.workspace!.id,
        resellerId: req.workspace!.resellerId,
        brandId: brand.id,
        name: strategyRequest.name,
        startsAt,
        endsAt,
        planJson: { goal: input.goal, audience, platforms: input.platforms, items: [], campaign },
        status: "DRAFT",
      },
      select: { id: true, brandId: true, name: true, startsAt: true, endsAt: true, planJson: true, status: true, createdAt: true, updatedAt: true },
    });
    res.status(201).json({
      campaign: { ...plan, planJson: plan.planJson, campaign, itemCount: 0, readiness: readiness(campaign, 0) },
      publisherCapabilities: {
        instagramConnected: connectedAccounts.some((account) => account.provider === "instagram"),
        instagramLivePublishingIntegrated: true,
        facebookConnected: connectedAccounts.some((account) => account.provider === "facebook"),
        facebookLivePublishingIntegrated: true,
        otherSelectedPlatformsAreDraftOnly: input.platforms.filter((platform) => !["instagram", "facebook"].includes(platform.toLowerCase())),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = z.string().trim().min(1).parse(req.params.id);
    const plan = await prisma.contentPlan.findFirst({
      where: { id, workspaceId: req.workspace!.id },
      select: { id: true, brandId: true, name: true, startsAt: true, endsAt: true, planJson: true, status: true, createdAt: true, updatedAt: true },
    });
    if (!plan || !campaignFromPlan(plan.planJson)) {
      res.status(404).json({ error: "Campaign not found in this workspace." });
      return;
    }
    const campaign = campaignFromPlan(plan.planJson)!;
    const items = isJsonObject(plan.planJson) && Array.isArray(plan.planJson.items) ? plan.planJson.items : [];
    const contentIds = Array.isArray(campaign.contentIds)
      ? campaign.contentIds.filter((contentId): contentId is string => typeof contentId === "string")
      : [];
    const contentRows = contentIds.length
      ? await prisma.generatedContent.findMany({
          where: { id: { in: contentIds }, workspaceId: req.workspace!.id, brandId: plan.brandId },
          select: { id: true, contentJson: true },
        })
      : [];
    const designRows = contentIds.length
      ? await prisma.design.findMany({
          where: {
            workspaceId: req.workspace!.id,
            brandId: plan.brandId,
            OR: contentIds.map((contentId) => ({
              designJson: { path: "$.generatedContentId", equals: contentId },
            })),
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            title: true,
            designJson: true,
            brand: { select: { kit: { select: { colors: true } } } },
          },
        })
      : [];
    const instagramAccount = await prisma.socialAccount.findFirst({
      where: { workspaceId: req.workspace!.id, provider: "instagram", status: "CONNECTED" },
      select: { id: true },
    });
    const facebookAccount = await prisma.socialAccount.findFirst({
      where: { workspaceId: req.workspace!.id, provider: "facebook", status: "CONNECTED" },
      select: { id: true },
    });
    const contentById = new Map(contentRows.map((row) => [row.id, row]));
    const designsByContentId = new Map<string, typeof designRows>();
    for (const design of designRows) {
      if (!isJsonObject(design.designJson) || typeof design.designJson.generatedContentId !== "string") continue;
      const designs = designsByContentId.get(design.designJson.generatedContentId) ?? [];
      designs.push(design);
      designsByContentId.set(design.designJson.generatedContentId, designs);
    }
    const contentItems = contentIds.flatMap((contentId) => {
      const row = contentById.get(contentId);
      if (!row) return [];
      const contentJson = isJsonObject(row.contentJson) ? row.contentJson : {};
      const designs = (designsByContentId.get(contentId) ?? []).slice(0, 3).map((design) => {
        const designJson = isJsonObject(design.designJson) ? design.designJson : {};
        const colors = Array.isArray(design.brand.kit?.colors)
          ? design.brand.kit.colors.filter((color): color is string => typeof color === "string")
          : [];
        const format = typeof designJson.format === "string" ? designJson.format : "post";
        const document = getLegacyDesignDocument(design.designJson, design.title, colors, format);
        return { id: design.id, designJson: { ...designJson, ...(document ? { document } : {}) } };
      });
      return [{
        id: row.id,
        contentJson: {
          title: typeof contentJson.title === "string" ? contentJson.title : "Campaign draft",
          format: typeof contentJson.format === "string" ? contentJson.format : "post",
          platforms: Array.isArray(contentJson.platforms) ? contentJson.platforms.filter((platform): platform is string => typeof platform === "string") : [],
          caption: typeof contentJson.caption === "string" ? contentJson.caption : "",
        },
        designs,
      }];
    });
    res.json({
      campaign: { ...plan, planJson: plan.planJson, campaign, itemCount: items.length, readiness: readiness(campaign, items.length) },
      items: contentItems,
      publisherCapabilities: {
        instagramConnected: Boolean(instagramAccount),
        instagramLivePublishingIntegrated: true,
        facebookConnected: Boolean(facebookAccount),
        facebookLivePublishingIntegrated: true,
        otherSelectedPlatformsAreDraftOnly: Array.isArray(campaign.platforms)
          ? campaign.platforms.filter((platform): platform is string => typeof platform === "string" && !["instagram", "facebook"].includes(platform.toLowerCase()))
          : [],
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireWritableWorkspace, async (req, res, next) => {
  try {
    const id = z.string().trim().min(1).parse(req.params.id);
    const input = updateCampaignSchema.parse(req.body);
    const existing = await prisma.contentPlan.findFirst({
      where: { id, workspaceId: req.workspace!.id },
      select: { id: true, brandId: true, startsAt: true, endsAt: true, name: true, planJson: true },
    });
    const currentCampaign = existing ? campaignFromPlan(existing.planJson) : null;
    if (!existing || !currentCampaign || !isJsonObject(existing.planJson)) {
      res.status(404).json({ error: "Campaign not found in this workspace." });
      return;
    }
    if (input.items) {
      const contentIds = [...new Set(input.items.map((item) => item.contentId))];
      if (contentIds.length !== input.items.length) {
        res.status(400).json({ error: "Each campaign asset must be listed only once." });
        return;
      }
      const content = await prisma.generatedContent.findMany({
        where: { id: { in: contentIds }, workspaceId: req.workspace!.id, brandId: existing.brandId },
        select: { id: true },
      });
      if (content.length !== contentIds.length) {
        res.status(400).json({ error: "One or more campaign content items are unavailable for this brand." });
        return;
      }
      if (input.items.some((item) => {
        const scheduledAt = new Date(item.scheduledAt);
        return scheduledAt < existing.startsAt || scheduledAt > existing.endsAt;
      })) {
        res.status(400).json({ error: "Every campaign content date must fall within the campaign dates." });
        return;
      }
    }
    const assigneeIds = [...new Set((input.taskUpdates ?? []).flatMap((update) => update.assignee ? [update.assignee] : []))];
    if (assigneeIds.length) {
      const members = await prisma.membership.findMany({
        where: { workspaceId: req.workspace!.id, userId: { in: assigneeIds } },
        select: { userId: true },
      });
      if (members.length !== assigneeIds.length) {
        res.status(400).json({ error: "Assign campaign tasks only to members of this workspace." });
        return;
      }
    }
    const currentLifecycle = typeof currentCampaign.lifecycle === "string" ? currentCampaign.lifecycle : "PLANNING";
    const lifecycleTransitions: Record<string, string[]> = {
      PLANNING: ["PLANNING", "PRODUCTION", "PAUSED"],
      PRODUCTION: ["PRODUCTION", "REVIEW", "PAUSED"],
      REVIEW: ["REVIEW", "PRODUCTION", "APPROVED", "PAUSED"],
      APPROVED: ["APPROVED", "PRODUCTION", "SCHEDULED", "PAUSED"],
      SCHEDULED: ["SCHEDULED", "LIVE", "PAUSED"],
      LIVE: ["LIVE", "COMPLETED", "PAUSED"],
      COMPLETED: ["COMPLETED"],
      PAUSED: ["PAUSED", "PLANNING", "PRODUCTION", "REVIEW", "APPROVED", "SCHEDULED", "LIVE", "COMPLETED"],
    };
    if (input.lifecycle && !lifecycleTransitions[currentLifecycle]?.includes(input.lifecycle)) {
      res.status(409).json({ error: `Campaign cannot move from ${currentLifecycle} to ${input.lifecycle}.` });
      return;
    }
    const nextCampaign = { ...currentCampaign };
    if (input.lifecycle) nextCampaign.lifecycle = input.lifecycle;
    if (input.strategy) {
      nextCampaign.strategy = input.strategy;
      const previousTasks = Array.isArray(currentCampaign.tasks) ? currentCampaign.tasks : [];
      nextCampaign.tasks = taskRecords(input.strategy).map((task) => {
        const previous = previousTasks.find((item) => isJsonObject(item) && item.title === task.title);
        return isJsonObject(previous)
          ? { ...task, status: previous.status ?? task.status, assignee: previous.assignee ?? task.assignee }
          : task;
      });
    }
    if (input.items) nextCampaign.contentIds = input.items.map((item) => item.contentId);
    if (input.taskUpdates?.length) {
      const tasks = Array.isArray(currentCampaign.tasks) ? [...currentCampaign.tasks] : [];
      for (const update of input.taskUpdates) {
        const currentTask = tasks[update.index];
        if (!isJsonObject(currentTask)) {
          res.status(400).json({ error: `Campaign task ${update.index + 1} does not exist.` });
          return;
        }
        tasks[update.index] = {
          ...currentTask,
          status: update.status,
          ...(update.assignee !== undefined ? { assignee: update.assignee } : {}),
        };
      }
      nextCampaign.tasks = tasks;
    }
    const lifecycle = input.lifecycle ?? currentLifecycle;
    nextCampaign.lifecycle = lifecycle;
    const campaignReadiness = readiness(nextCampaign, input.items?.length ?? (Array.isArray(existing.planJson.items) ? existing.planJson.items.length : 0));
    if (lifecycle === "APPROVED" && !campaignReadiness.ready) {
      res.status(409).json({
        error: "This campaign cannot be approved while critical readiness checks are incomplete.",
        blockers: campaignReadiness.blockers,
      });
      return;
    }
    if (lifecycle === "APPROVED") {
      const storedItems = input.items ?? z.array(campaignItemSchema).max(60).safeParse(existing.planJson.items).data;
      if (!storedItems || storedItems.length < (typeof currentCampaign.durationDays === "number" ? currentCampaign.durationDays : 1)) {
        res.status(409).json({ error: "Generate and save every planned campaign asset before approval." });
        return;
      }
      const contentIds = [...new Set(storedItems.map((item) => item.contentId))];
      const availableContent = await prisma.generatedContent.findMany({
        where: { id: { in: contentIds }, workspaceId: req.workspace!.id, brandId: existing.brandId },
        select: { id: true },
      });
      if (availableContent.length !== storedItems.length) {
        res.status(409).json({ error: "Some campaign assets are missing or unavailable. Restore the drafts before approval." });
        return;
      }
    }
    const planJson: Prisma.InputJsonObject = {
      ...existing.planJson,
      ...(input.items ? { items: input.items } : {}),
      campaign: nextCampaign,
    };
    const plan = await prisma.contentPlan.update({
      where: { id: existing.id },
      data: { ...(input.name ? { name: input.name } : {}), planJson },
      select: { id: true, brandId: true, name: true, startsAt: true, endsAt: true, planJson: true, status: true, createdAt: true, updatedAt: true },
    });
    res.json({
      campaign: { ...plan, planJson: plan.planJson, campaign: nextCampaign, itemCount: input.items?.length ?? (Array.isArray(planJson.items) ? planJson.items.length : 0), readiness: campaignReadiness },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/duplicate", requireWritableWorkspace, async (req, res, next) => {
  try {
    const id = z.string().trim().min(1).parse(req.params.id);
    const source = await prisma.contentPlan.findFirst({
      where: { id, workspaceId: req.workspace!.id },
      select: { brandId: true, resellerId: true, name: true, startsAt: true, endsAt: true, planJson: true },
    });
    if (!source || !campaignFromPlan(source.planJson) || !isJsonObject(source.planJson)) {
      res.status(404).json({ error: "Campaign not found in this workspace." });
      return;
    }
    const duration = source.endsAt.getTime() - source.startsAt.getTime();
    const startsAt = new Date(Math.max(source.endsAt.getTime(), Date.now()) + 86400000);
    const endsAt = new Date(startsAt.getTime() + duration);
    const sourceCampaign = campaignFromPlan(source.planJson)!;
    const tasks = Array.isArray(sourceCampaign.tasks)
      ? sourceCampaign.tasks.map((task) => isJsonObject(task) ? { ...task, status: "NOT_STARTED", assignee: "" } : task)
      : [];
    const campaign: Prisma.InputJsonObject = {
      ...sourceCampaign,
      lifecycle: "PLANNING",
      generatedAt: new Date().toISOString(),
      contentIds: [],
      tasks,
    };
    const planJson: Prisma.InputJsonObject = {
      ...source.planJson,
      items: [],
      campaign,
    };
    const duplicate = await prisma.contentPlan.create({
      data: {
        workspaceId: req.workspace!.id,
        resellerId: source.resellerId,
        brandId: source.brandId,
        name: `${source.name} (copy)`.slice(0, 120),
        startsAt,
        endsAt,
        planJson,
        status: "DRAFT",
      },
      select: { id: true, brandId: true, name: true, startsAt: true, endsAt: true, planJson: true, status: true, createdAt: true, updatedAt: true },
    });
    res.status(201).json({ campaign: { ...duplicate, planJson: duplicate.planJson, campaign, itemCount: 0, readiness: readiness(campaign, 0) } });
  } catch (error) {
    next(error);
  }
});

export { router as campaignsRouter };
