import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { approvalEmailConfigured, cloudflareAiConfigured, env, hasPartialSmtpConfiguration } from "../env.js";
import { prisma } from "../db.js";
import {
  requireAuth,
  requireWritableWorkspace,
  requireWorkspace,
  requireWorkspaceRole,
} from "../middleware/auth.js";
import { isInstagramMediaHostingConfigured } from "../services/instagram.js";
import { runInstagramAutopilot } from "../services/instagram-autopilot.js";
import { autopilotFormatOptions, defaultAutopilotVideoSettings, defaultInstagramAutopilotScheduleSettings, defaultInstagramAutopilotSettings, getAutopilotPostCount, readAutopilotScheduleSettings } from "../services/instagram-autopilot.js";
import { getNextWeeklyAutopilotRunAt } from "../services/instagram-autopilot-schedule.js";
import { starterTemplates } from "../services/template-library.js";
import { enqueueCompetitorResearch } from "../services/competitor-research-worker.js";

const router = Router();
const supportedTimezones = new Set(["UTC", ...Intl.supportedValuesOf("timeZone")]);
const autopilotRunLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const autopilotSourceSchema = {
  creationMode: z.enum(["ai", "template"]).default("ai"),
  templateIds: z.record(z.string(), z.string().trim().min(1)).default({}),
};
const autopilotAutomationSourceSchema = {
  automationCreationMode: z.enum(["ai", "template"]).default("ai"),
  automationTemplateIds: z.record(z.string(), z.string().trim().min(1)).default({}),
};
const autopilotVideoSettingsSchema = z.object({
  videoType: z.enum(["product-motion", "realistic-avatar", "animated-avatar"]).default(defaultAutopilotVideoSettings.videoType),
  durationSeconds: z.number().int().min(3).max(60).default(defaultAutopilotVideoSettings.durationSeconds),
  narrationEnabled: z.boolean().default(defaultAutopilotVideoSettings.narrationEnabled),
  voiceName: z.string().trim().max(120).default(defaultAutopilotVideoSettings.voiceName),
  musicId: z.string().trim().max(80).nullable().default(defaultAutopilotVideoSettings.musicId),
  musicStyle: z.enum(["balanced", "warm", "bright", "calm", "cinematic"]).default(defaultAutopilotVideoSettings.musicStyle),
});
const autopilotRunSchema = z.object({
  days: z.number().int().min(1).max(30).default(defaultInstagramAutopilotSettings.days),
  campaignGoal: z.string().trim().max(500).default(""),
  videoSettings: autopilotVideoSettingsSchema.default(defaultAutopilotVideoSettings),
  ...autopilotSourceSchema,
  counts: z.object(Object.fromEntries(autopilotFormatOptions.map((format) => [format, z.number().int().min(0).max(30).default(defaultInstagramAutopilotSettings.counts[format])])) as Record<typeof autopilotFormatOptions[number], z.ZodDefault<z.ZodNumber>>),
}).default(defaultInstagramAutopilotSettings).superRefine((settings, context) => {
  const total = getAutopilotPostCount(settings);
  if (total < 1 || total > 30) context.addIssue({ code: "custom", path: ["counts"], message: "Choose between 1 and 30 posts for each Autopilot run." });
  if (total < settings.days) context.addIssue({ code: "custom", path: ["days"], message: "Choose no more scheduled days than posts." });
  if (settings.counts["video-product-demo"] + settings.counts["video-avatar"] > 0 &&
    (settings.videoSettings.videoType !== "product-motion" || settings.videoSettings.narrationEnabled) &&
    !settings.videoSettings.voiceName) {
    context.addIssue({ code: "custom", path: ["videoSettings", "voiceName"], message: "Choose a voice for the selected Autopilot video type." });
  }
});
const autopilotAutomationSchema = z.object({
  enabled: z.boolean(),
  weekday: z.number().int().min(0).max(6).default(defaultInstagramAutopilotScheduleSettings.weekday),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default(defaultInstagramAutopilotScheduleSettings.time),
  days: z.number().int().min(1).max(30).default(defaultInstagramAutopilotSettings.days),
  campaignGoal: z.string().trim().max(500).default(""),
  videoSettings: autopilotVideoSettingsSchema.default(defaultAutopilotVideoSettings),
  automationVideoSettings: autopilotVideoSettingsSchema.default(defaultAutopilotVideoSettings),
  ...autopilotSourceSchema,
  ...autopilotAutomationSourceSchema,
  counts: z.object(Object.fromEntries(autopilotFormatOptions.map((format) => [format, z.number().int().min(0).max(30).default(defaultInstagramAutopilotSettings.counts[format])])) as Record<typeof autopilotFormatOptions[number], z.ZodDefault<z.ZodNumber>>),
}).superRefine((settings, context) => {
  const total = getAutopilotPostCount(settings);
  if (total < 1 || total > 30) context.addIssue({ code: "custom", path: ["counts"], message: "Choose between 1 and 30 posts for each weekly run." });
  if (total < settings.days) context.addIssue({ code: "custom", path: ["days"], message: "Choose no more scheduled days than posts." });
  if (settings.counts["video-product-demo"] + settings.counts["video-avatar"] > 0) {
    if ((settings.videoSettings.videoType !== "product-motion" || settings.videoSettings.narrationEnabled) && !settings.videoSettings.voiceName) {
      context.addIssue({ code: "custom", path: ["videoSettings", "voiceName"], message: "Choose a voice for manual video generation." });
    }
    if ((settings.automationVideoSettings.videoType !== "product-motion" || settings.automationVideoSettings.narrationEnabled) && !settings.automationVideoSettings.voiceName) {
      context.addIssue({ code: "custom", path: ["automationVideoSettings", "voiceName"], message: "Choose a voice for recurring video generation." });
    }
  }
});

async function validateAutopilotTemplates(
  workspaceId: string,
  settings: { creationMode: "ai" | "template"; templateIds: Record<string, string>; counts: Record<string, number> },
) {
  if (settings.creationMode !== "template") return null;
  const requiredFormats = Object.entries(settings.counts)
    .filter(([format, count]) => count > 0 && !format.startsWith("video-"))
    .map(([format]) => format);
  const missingFormats = requiredFormats.filter((format) => !settings.templateIds[format]);
  if (missingFormats.length) return `Select a template for each selected static format: ${missingFormats.join(", ")}.`;
  const requested = requiredFormats.map((format) => [format, settings.templateIds[format]!] as const);
  if (!requested.length) return null;

  const stored = await prisma.template.findMany({
    where: {
      id: { in: requested.map(([, id]) => id) },
      active: true,
      OR: [{ workspaceId: null, resellerId: null }, { workspaceId }],
    },
    select: { id: true, format: true },
  });
  const available = new Map<string, string>([
    ...starterTemplates.map((template) => [template.id, template.format] as const),
    ...stored.map((template) => [template.id, template.format] as const),
  ]);
  const invalid = requested.find(([format, id]) => available.get(id) !== format);
  return invalid ? `The selected ${invalid[0]} template is unavailable or has the wrong format. Choose another template.` : null;
}

function hasNonEmptyList(value: unknown) {
  return Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim());
}

async function getInstagramAutopilotStatus(workspaceId: string, brandId?: string) {
  const brand = await prisma.brand.findFirst({
    where: { workspaceId, ...(brandId ? { id: brandId } : {}) },
    select: {
      id: true,
      name: true,
      timezone: true,
      profile: {
        select: {
          industry: true,
          products: true,
          audience: true,
          tone: true,
          goals: true,
          instagramAutopilotEnabled: true,
          instagramAutopilotNextRunAt: true,
          instagramAutopilotSettings: true,
        },
      },
      kit: { select: { colors: true, fonts: true } },
      instagramAutopilotRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, error: true, createdAt: true, completedAt: true },
      },
    },
  });
  if (!brand) return null;

  const hasColors = Array.isArray(brand.kit?.colors) &&
    brand.kit.colors.some((color) => typeof color === "string" && /^#[\da-f]{6}$/i.test(color));
  const profileComplete = Boolean(
    brand.name.trim() &&
    brand.profile?.industry?.trim() &&
    brand.profile.products?.trim() &&
    brand.profile.audience?.trim() &&
    brand.profile.tone?.trim() &&
    hasNonEmptyList(brand.profile.goals) &&
    hasColors &&
    hasNonEmptyList(brand.kit?.fonts),
  );
  const [connectedAccounts, ownerExists, workspace] = await Promise.all([
    prisma.socialAccount.findMany({
      where: {
        workspaceId,
        provider: "instagram",
        status: "CONNECTED",
        OR: [{ brandId: brand.id }, { brandId: null }],
      },
      select: { provider: true },
    }),
    prisma.membership.findFirst({
      where: { workspaceId, role: "OWNER" },
      select: { id: true },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        trialEndsAt: true,
        subscription: { select: { status: true } },
        billingWorkspace: {
          select: {
            trialEndsAt: true,
            subscription: { select: { status: true } },
          },
        },
      },
    }),
  ]);
  const blockers: string[] = [];
  if (!profileComplete) blockers.push("Complete the brand profile before generating posts.");
  const connectedPlatforms = [...new Set(connectedAccounts
    .filter((account) => account.provider === "instagram")
    .map(() => "Instagram"))];
  if (!connectedPlatforms.length) blockers.push("Connect a supported social publishing account. Autopilot uses connected channels automatically; no platform selection is needed.");
  const subscriptionStatus = workspace?.billingWorkspace?.subscription?.status ?? workspace?.subscription?.status ?? null;
  const trialEndsAt = workspace?.billingWorkspace?.trialEndsAt ?? workspace?.trialEndsAt;
  const canWrite = subscriptionStatus === "active" ||
    (subscriptionStatus === "trialing" && Boolean(trialEndsAt && trialEndsAt > new Date()));
  if (!canWrite) {
    blockers.push(subscriptionStatus === "trialing"
      ? "Your 14-day free trial has ended. Upgrade your plan to generate and save posts."
      : "An active subscription is required to generate and save posts.");
  }
  if (!approvalEmailConfigured) {
    blockers.push(hasPartialSmtpConfiguration
      ? "Complete SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in apps/api/.env, then restart the API."
      : "Configure SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in apps/api/.env, or set RESEND_API_KEY and EMAIL_FROM, then restart the API.");
  }
  if (!cloudflareAiConfigured && !env.GROQ_API_KEY && !env.OPENAI_API_KEY) {
    blockers.push("Configure an AI provider API key on the API.");
  }
  if (connectedPlatforms.includes("Instagram") && !isInstagramMediaHostingConfigured()) {
    blockers.push("Configure a public HTTPS API URL and social media encryption key for Instagram publishing.");
  }
  const videoBlockers: string[] = [];
  if (!env.MAGIC_HOUR_API_KEY) videoBlockers.push("Configure MAGIC_HOUR_API_KEY in apps/api/.env to generate product demonstration and avatar videos.");
  const galleryImageCount = await prisma.mediaAsset.count({ where: { workspaceId, mimeType: { startsWith: "image/" }, fileData: { not: null }, sizeBytes: { lte: BigInt(50 * 1024 * 1024) }, OR: [{ brandId: brand.id }, { brandId: null }] } });
  if (!galleryImageCount) videoBlockers.push("Add at least one image to Gallery for Magic Hour product and avatar videos.");
  if (!ownerExists) blockers.push("This workspace needs an owner account to receive approval emails.");

  return {
    brand: {
      id: brand.id,
      name: brand.name,
      timezone: brand.timezone,
      connectedPlatforms,
      instagramAutopilotEnabled: Boolean(brand.profile?.instagramAutopilotEnabled),
      instagramAutopilotNextRunAt: brand.profile?.instagramAutopilotNextRunAt ?? null,
      automationSettings: readAutopilotScheduleSettings(brand.profile?.instagramAutopilotSettings ?? null),
    },
    latestRun: brand.instagramAutopilotRuns[0] ?? null,
    blockers,
    videoBlockers,
    ready: blockers.length === 0,
  };
}

const profileSchema = z.object({
  brandName: z.string().trim().min(2).max(120).optional(),
  timezone: z.string().trim().min(1).max(100)
    .refine((timezone) => supportedTimezones.has(timezone), "Choose a valid time zone.")
    .optional(),
  industry: z.string().trim().optional(),
  description: z.string().trim().optional(),
  products: z.string().trim().optional(),
  audience: z.string().trim().optional(),
  offers: z.string().trim().optional(),
  tone: z.string().trim().optional(),
  brandVoiceRules: z.array(z.string().trim().min(2).max(240)).max(30).optional(),
  bannedWords: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  city: z.string().trim().optional(),
  country: z.string().trim().optional(),
  languages: z.array(z.string().trim().min(1)).max(12).optional(),
  competitors: z.array(z.string().trim().min(1)).max(20).optional(),
  goals: z.array(z.string().trim().min(1)).max(12).optional(),
  preferredPlatforms: z.array(z.string().trim().min(1)).max(20).optional(),
  instagramAutopilotEnabled: z.boolean().optional(),
  brandColors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(12).optional(),
  fonts: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  logoAssetId: z.string().trim().min(1).nullable().optional(),
  templateIds: z.array(z.string().trim().min(1)).max(14)
    .refine((ids) => new Set(ids).size === ids.length, "Choose each preferred template only once.")
    .optional(),
});

router.use(requireAuth, requireWorkspace);

router.get("/", async (req, res, next) => {
  try {
    const brandId = req.header("x-brand-id");
    const brand = await prisma.brand.findFirst({
      where: { workspaceId: req.workspace!.id, ...(brandId ? { id: brandId } : {}) },
      select: {
        id: true,
        name: true,
        timezone: true,
        profile: true,
        kit: true,
        instagramAutopilotRuns: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, error: true, createdAt: true, completedAt: true },
        },
      },
    });
    if (!brand) {
      res.status(404).json({ error: "No brand profile exists in this workspace." });
      return;
    }
    res.json({ brand });
  } catch (error) {
    next(error);
  }
});

router.get("/instagram-autopilot/status", async (req, res, next) => {
  try {
    const status = await getInstagramAutopilotStatus(req.workspace!.id, req.header("x-brand-id"));
    if (!status) {
      res.status(404).json({ error: "No brand profile exists in this workspace." });
      return;
    }
    res.json(status);
  } catch (error) {
    next(error);
  }
});

router.put("/instagram-autopilot/settings", requireWorkspaceRole("OWNER"), requireWritableWorkspace, async (req, res, next) => {
  try {
    const settings = autopilotAutomationSchema.parse(req.body ?? {});
    const batchTemplateError = await validateAutopilotTemplates(req.workspace!.id, settings);
    const recurringTemplateError = await validateAutopilotTemplates(req.workspace!.id, {
      creationMode: settings.automationCreationMode,
      templateIds: settings.automationTemplateIds,
      counts: settings.counts,
    });
    if (batchTemplateError || recurringTemplateError) {
      res.status(400).json({ error: batchTemplateError ?? recurringTemplateError });
      return;
    }
    const brand = await prisma.brand.findFirst({
      where: { workspaceId: req.workspace!.id, ...(req.header("x-brand-id") ? { id: req.header("x-brand-id")! } : {}) },
      select: { id: true, timezone: true },
    });
    if (!brand) {
      res.status(404).json({ error: "No brand profile exists in this workspace." });
      return;
    }
    const nextRunAt = settings.enabled
      ? getNextWeeklyAutopilotRunAt(new Date(), brand.timezone, settings.weekday, settings.time)
      : null;
    await prisma.companyProfile.upsert({
      where: { brandId: brand.id },
      create: {
        workspaceId: req.workspace!.id,
        resellerId: req.workspace!.resellerId,
        brandId: brand.id,
        segment: "business-unverified",
        instagramAutopilotEnabled: settings.enabled,
        instagramAutopilotNextRunAt: nextRunAt,
        instagramAutopilotSettings: {
          weekday: settings.weekday,
          time: settings.time,
          days: settings.days,
          counts: settings.counts,
          campaignGoal: settings.campaignGoal,
          creationMode: settings.creationMode,
          templateIds: settings.templateIds,
          videoSettings: settings.videoSettings,
          automationCreationMode: settings.automationCreationMode,
          automationTemplateIds: settings.automationTemplateIds,
          automationVideoSettings: settings.automationVideoSettings,
        },
      },
      update: {
        instagramAutopilotEnabled: settings.enabled,
        instagramAutopilotNextRunAt: nextRunAt,
        instagramAutopilotSettings: {
          weekday: settings.weekday,
          time: settings.time,
          days: settings.days,
          counts: settings.counts,
          campaignGoal: settings.campaignGoal,
          creationMode: settings.creationMode,
          templateIds: settings.templateIds,
          videoSettings: settings.videoSettings,
          automationCreationMode: settings.automationCreationMode,
          automationTemplateIds: settings.automationTemplateIds,
          automationVideoSettings: settings.automationVideoSettings,
        },
      },
    });
    await prisma.auditLog.create({
      data: {
        workspaceId: req.workspace!.id,
        actorId: req.auth!.userId,
        action: settings.enabled ? "instagram_autopilot.schedule_updated" : "instagram_autopilot.schedule_paused",
        targetType: "brand",
        targetId: brand.id,
        metadata: {
          weekday: settings.weekday,
          time: settings.time,
          days: settings.days,
          totalPosts: getAutopilotPostCount(settings),
          batchCreationMode: settings.creationMode,
          automationCreationMode: settings.automationCreationMode,
          batchVideoType: settings.videoSettings.videoType,
          automationVideoType: settings.automationVideoSettings.videoType,
        },
      },
    });
    res.json({ enabled: settings.enabled, settings, nextRunAt });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/instagram-autopilot/run",
  requireWorkspaceRole("OWNER"),
  requireWritableWorkspace,
  autopilotRunLimiter,
  async (req, res, next) => {
    try {
      const settings = autopilotRunSchema.parse(req.body ?? {});
      const templateError = await validateAutopilotTemplates(req.workspace!.id, settings);
      if (templateError) {
        res.status(400).json({ error: templateError });
        return;
      }
      const status = await getInstagramAutopilotStatus(req.workspace!.id, req.header("x-brand-id"));
      if (!status) {
        res.status(404).json({ error: "No brand profile exists in this workspace." });
        return;
      }
      const requestsMagicHour = settings.counts["video-product-demo"] + settings.counts["video-avatar"] > 0;
      if (!status.ready || (requestsMagicHour && status.videoBlockers.length > 0)) {
        const blockers = [...status.blockers, ...(requestsMagicHour ? status.videoBlockers : [])];
        res.status(409).json({ error: blockers.join(" "), blockers });
        return;
      }

      const activeRun = await prisma.instagramAutopilotRun.findFirst({
        where: {
          workspaceId: req.workspace!.id,
          brandId: status.brand.id,
          status: { in: ["QUEUED", "GENERATING", "WAITING_FOR_RENDER"] },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, createdAt: true },
      });
      if (activeRun) {
        res.status(409).json({ error: "An Instagram Autopilot batch is already being prepared for this brand.", run: activeRun });
        return;
      }

      const weekStart = new Date();
      const run = await prisma.instagramAutopilotRun.upsert({
          where: { brandId_weekStart: { brandId: status.brand.id, weekStart } },
          create: {
            workspaceId: req.workspace!.id,
            brandId: status.brand.id,
            weekStart,
            status: "QUEUED",
            contentIds: { __settings: settings },
          },
          update: {},
          select: { id: true, status: true, createdAt: true },
      });
      void runInstagramAutopilot().catch((error: unknown) => {
        console.error("Manually started Instagram Autopilot run failed.", { runId: run.id, error });
      });
      res.status(202).json({ run, message: `Your ${getAutopilotPostCount(settings)}-post batch across ${settings.days} days is queued. It will be emailed for approval after content and Magic Hour videos finish rendering.` });
    } catch (error) {
      next(error);
    }
  },
);

router.put("/", requireWorkspaceRole("OWNER", "ADMIN"), requireWritableWorkspace, async (req, res, next) => {
  try {
    const input = profileSchema.parse(req.body);
    const brandId = req.header("x-brand-id");
    const brand = await prisma.brand.findFirst({
      where: { workspaceId: req.workspace!.id, ...(brandId ? { id: brandId } : {}) },
      select: {
        id: true,
        timezone: true,
        profile: { select: { instagramAutopilotEnabled: true, instagramAutopilotNextRunAt: true, instagramAutopilotSettings: true } },
      },
    });
    if (!brand) {
      res.status(404).json({ error: "No brand profile exists in this workspace." });
      return;
    }
    const {
      brandName, timezone, brandColors, fonts, logoAssetId, templateIds,
      instagramAutopilotEnabled, ...profile
    } = input;
    const automationSettings = readAutopilotScheduleSettings(brand.profile?.instagramAutopilotSettings ?? null);
    const nextAutopilotRunAt = instagramAutopilotEnabled === undefined || !instagramAutopilotEnabled
      ? null
      : brand.profile?.instagramAutopilotEnabled && brand.profile.instagramAutopilotNextRunAt
        ? brand.profile.instagramAutopilotNextRunAt
        : getNextWeeklyAutopilotRunAt(new Date(), timezone ?? brand.timezone, automationSettings.weekday, automationSettings.time);
    if (templateIds) {
      const savedTemplates = await prisma.template.findMany({
        where: {
          id: { in: templateIds },
          active: true,
          OR: [{ workspaceId: null, resellerId: null }, { workspaceId: req.workspace!.id }],
        },
        select: { id: true, format: true },
      });
      const selectedTemplates = new Map<string, string>([
        ...starterTemplates.filter((template) => templateIds.includes(template.id)).map((template) => [template.id, template.format] as const),
        ...savedTemplates.map((template) => [template.id, template.format] as const),
      ]);
      const allowedIds = new Set(selectedTemplates.keys());
      const selectedFormats = [...selectedTemplates.values()];
      if (templateIds.some((id) => !allowedIds.has(id)) || new Set(selectedFormats).size !== selectedFormats.length) {
        res.status(400).json({ error: "Choose only available workspace templates, with no more than one preferred template per format." });
        return;
      }
    }
    const logoAsset = logoAssetId
      ? await prisma.mediaAsset.findFirst({
          where: {
            id: logoAssetId,
            workspaceId: req.workspace!.id,
            mimeType: { in: ["image/jpeg", "image/png", "image/webp"] },
            OR: [{ brandId: null }, { brandId: brand.id }],
          },
          select: { id: true, sizeBytes: true },
        })
      : null;
    if (logoAssetId && (!logoAsset || logoAsset.sizeBytes > 4n * 1024n * 1024n)) {
      res.status(400).json({ error: "Choose an image from this workspace no larger than 4 MB for the brand logo." });
      return;
    }
    const saved = await prisma.$transaction(async (tx) => {
      if (brandName || timezone) {
        await tx.brand.update({
          where: { id: brand.id },
          data: {
            ...(brandName ? { name: brandName } : {}),
            ...(timezone ? { timezone } : {}),
          },
        });
      }
      await tx.companyProfile.upsert({
        where: { brandId: brand.id },
        create: {
          workspaceId: req.workspace!.id,
          resellerId: req.workspace!.resellerId,
          brandId: brand.id,
          segment: "business-unverified",
          ...profile,
          ...(instagramAutopilotEnabled !== undefined ? {
            instagramAutopilotEnabled,
            instagramAutopilotNextRunAt: nextAutopilotRunAt,
          } : {}),
        },
        update: {
          ...profile,
          ...(instagramAutopilotEnabled !== undefined ? {
            instagramAutopilotEnabled,
            ...(instagramAutopilotEnabled
              ? { instagramAutopilotNextRunAt: nextAutopilotRunAt }
              : { instagramAutopilotNextRunAt: null }),
          } : {}),
        },
      });
      if (brandColors || fonts || logoAssetId !== undefined || templateIds !== undefined) {
        await tx.brandKit.upsert({
          where: { brandId: brand.id },
          create: {
            workspaceId: req.workspace!.id,
            resellerId: req.workspace!.resellerId,
            brandId: brand.id,
            colors: brandColors ?? [],
            fonts: fonts ?? [],
            templateIds: templateIds ?? [],
            logoUrl: logoAsset ? `media://${logoAsset.id}` : null,
          },
          update: {
            ...(brandColors ? { colors: brandColors } : {}),
            ...(fonts ? { fonts } : {}),
            ...(templateIds !== undefined ? { templateIds } : {}),
            ...(logoAssetId !== undefined ? { logoUrl: logoAsset ? `media://${logoAsset.id}` : null } : {}),
          },
        });
      }
      await tx.auditLog.create({
        data: {
          workspaceId: req.workspace!.id,
          actorId: req.auth!.userId,
          action: "brand.profile.updated",
          targetType: "brand",
          targetId: brand.id,
        },
      });
      return tx.brand.findUniqueOrThrow({
        where: { id: brand.id },
        select: { id: true, name: true, timezone: true, profile: true, kit: true },
      });
    });
    let competitorResearchJob = null;
    try {
      competitorResearchJob = await enqueueCompetitorResearch(req.workspace!.id, saved.id);
    } catch (error) {
      console.error("Brand profile saved, but competitor research could not be queued.", { workspaceId: req.workspace!.id, brandId: saved.id, error });
    }
    res.json({ brand: saved, competitorResearchJob: competitorResearchJob ? {
      id: competitorResearchJob.id, status: competitorResearchJob.status, stage: competitorResearchJob.stage,
    } : null });
  } catch (error) {
    next(error);
  }
});

export { router as profileRouter };
