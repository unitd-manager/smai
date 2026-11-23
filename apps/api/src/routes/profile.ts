import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { approvalEmailConfigured, env, hasPartialSmtpConfiguration } from "../env.js";
import { prisma } from "../db.js";
import {
  requireAuth,
  requireWritableWorkspace,
  requireWorkspace,
  requireWorkspaceRole,
} from "../middleware/auth.js";
import { isInstagramMediaHostingConfigured } from "../services/instagram.js";
import { runInstagramAutopilot } from "../services/instagram-autopilot.js";
import { autopilotFormatOptions, defaultInstagramAutopilotSettings, getAutopilotPostCount } from "../services/instagram-autopilot.js";
import { starterTemplates } from "../services/template-library.js";

const router = Router();
const supportedTimezones = new Set(["UTC", ...Intl.supportedValuesOf("timeZone")]);
const autopilotRunLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const autopilotRunSchema = z.object({
  days: z.number().int().min(1).max(30).default(defaultInstagramAutopilotSettings.days),
  campaignGoal: z.string().trim().max(500).default(""),
  counts: z.object(Object.fromEntries(autopilotFormatOptions.map((format) => [format, z.number().int().min(0).max(30).default(defaultInstagramAutopilotSettings.counts[format])])) as Record<typeof autopilotFormatOptions[number], z.ZodDefault<z.ZodNumber>>),
}).default(defaultInstagramAutopilotSettings).superRefine((settings, context) => {
  const total = getAutopilotPostCount(settings);
  if (total < 1 || total > 30) context.addIssue({ code: "custom", path: ["counts"], message: "Choose between 1 and 30 posts for each Autopilot run." });
  if (total < settings.days) context.addIssue({ code: "custom", path: ["days"], message: "Choose no more scheduled days than posts." });
});

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
  if (!env.GOOGLE_AI_STUDIO_API_KEY && !env.GROQ_API_KEY && !env.OPENAI_API_KEY) {
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

router.post(
  "/instagram-autopilot/run",
  requireWorkspaceRole("OWNER"),
  requireWritableWorkspace,
  autopilotRunLimiter,
  async (req, res, next) => {
    try {
      const settings = autopilotRunSchema.parse(req.body ?? {});
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

      const now = new Date();
      const run = await prisma.$transaction(async (tx) => {
        const profile = await tx.companyProfile.findUnique({
          where: { brandId: status.brand.id },
          select: { id: true, instagramAutopilotEnabled: true, instagramAutopilotNextRunAt: true },
        });
        const dueRecurringRun = Boolean(profile?.instagramAutopilotEnabled &&
          (!profile.instagramAutopilotNextRunAt || profile.instagramAutopilotNextRunAt <= now));
        const weekStart = dueRecurringRun ? profile!.instagramAutopilotNextRunAt ?? now : now;
        if (dueRecurringRun && profile) {
          await tx.companyProfile.updateMany({
            where: {
              id: profile.id,
              instagramAutopilotEnabled: true,
              ...(profile.instagramAutopilotNextRunAt
                ? { instagramAutopilotNextRunAt: profile.instagramAutopilotNextRunAt }
                : { instagramAutopilotNextRunAt: null }),
            },
            data: { instagramAutopilotNextRunAt: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000) },
          });
        }
        return tx.instagramAutopilotRun.upsert({
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
        profile: { select: { instagramAutopilotEnabled: true } },
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
            instagramAutopilotNextRunAt: instagramAutopilotEnabled ? new Date() : null,
          } : {}),
        },
        update: {
          ...profile,
          ...(instagramAutopilotEnabled !== undefined ? {
            instagramAutopilotEnabled,
            ...(instagramAutopilotEnabled
              ? brand.profile?.instagramAutopilotEnabled ? {} : { instagramAutopilotNextRunAt: new Date() }
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
    res.json({ brand: saved });
  } catch (error) {
    next(error);
  }
});

export { router as profileRouter };
