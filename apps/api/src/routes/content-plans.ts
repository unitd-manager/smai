import { Router } from "express";
import { Prisma } from "@prisma/client";
import { getLegacyDesignDocument, renderDesignPageSvg } from "@united-technologies/shared/design-document";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireCompleteBrandProfile, requireWritableWorkspace, requireWorkspace } from "../middleware/auth.js";
import { checkPostQuality } from "../services/post-quality.js";
import { isInstagramMediaHostingConfigured } from "../services/instagram.js";

const router = Router();
const planItemSchema = z.object({
  contentId: z.string().trim().min(1),
  scheduledAt: z.string().datetime().optional(),
  format: z.string().trim().min(1).max(40),
  videoJobId: z.string().trim().min(1).optional(),
  platforms: z.array(z.string().trim().min(2).max(40)).min(1).max(12),
}).strict();
const createPlanSchema = z.object({
  name: z.string().trim().min(2).max(120),
  goal: z.string().trim().min(2).max(1000),
  audience: z.string().trim().max(500).default(""),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  platforms: z.array(z.string().trim().min(2).max(40)).min(1).max(12),
  items: z.array(planItemSchema).min(1).max(60),
});
const listSchema = z.object({
  brandId: z.string().trim().min(1).optional(),
});
const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
}).refine((value) => Object.keys(value).length > 0);

router.use(requireAuth, requireWorkspace, requireCompleteBrandProfile);

router.get("/", async (req, res, next) => {
  try {
    const filter = listSchema.parse(req.query);
    const brandId = filter.brandId === "all" ? undefined : filter.brandId ?? req.header("x-brand-id") ?? undefined;
    const plans = await prisma.contentPlan.findMany({
      where: { workspaceId: req.workspace!.id, ...(brandId ? { brandId } : {}) },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        brandId: true,
        name: true,
        startsAt: true,
        endsAt: true,
        planJson: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json({ plans });
  } catch (error) {
    next(error);
  }
});
const executeSchema = z.object({ mode: z.enum(["approval", "autonomous"]) });

function isJsonRecord(value: Prisma.JsonValue | undefined): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonStrings(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

router.post("/", requireWritableWorkspace, async (req, res, next) => {
  try {
    const input = createPlanSchema.parse(req.body);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) {
      res.status(400).json({ error: "The plan end date must be after its start date." });
      return;
    }
    if (input.items.some((item) => item.scheduledAt &&
      (new Date(item.scheduledAt) < startsAt || new Date(item.scheduledAt) > endsAt))) {
      res.status(400).json({ error: "Every planned post must fall within the selected plan dates." });
      return;
    }
    const brandId = req.header("x-brand-id");
    const brand = await prisma.brand.findFirst({
      where: { workspaceId: req.workspace!.id, ...(brandId ? { id: brandId } : {}) },
      select: { id: true },
    });
    if (!brand) {
      res.status(404).json({ error: "No brand profile exists in this workspace." });
      return;
    }
    const contentIds = [...new Set(input.items.map((item) => item.contentId))];
    const content = await prisma.generatedContent.findMany({
      where: { id: { in: contentIds }, workspaceId: req.workspace!.id, brandId: brand.id },
      select: { id: true },
    });
    if (content.length !== contentIds.length) {
      res.status(400).json({ error: "One or more planned content items are unavailable for this brand." });
      return;
    }
    const plan = await prisma.contentPlan.create({
      data: {
        workspaceId: req.workspace!.id,
        resellerId: req.workspace!.resellerId,
        brandId: brand.id,
        name: input.name,
        startsAt,
        endsAt,
        planJson: {
          goal: input.goal,
          audience: input.audience,
          platforms: input.platforms,
          items: input.items,
        },
        status: "DRAFT",
      },
      select: { id: true, name: true, startsAt: true, endsAt: true, planJson: true, status: true, createdAt: true },
    });
    res.status(201).json({ plan });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireWritableWorkspace, async (req, res, next) => {
  try {
    const id = z.string().trim().min(1).parse(req.params.id);
    const input = updateSchema.parse(req.body);
    const existing = await prisma.contentPlan.findFirst({
      where: { id, workspaceId: req.workspace!.id },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ error: "Content plan not found in this workspace." });
      return;
    }
    const plan = await prisma.contentPlan.update({
      where: { id: existing.id },
      data: input,
      select: { id: true, name: true, startsAt: true, endsAt: true, planJson: true, status: true, updatedAt: true },
    });
    res.json({ plan });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/execute", requireWritableWorkspace, async (req, res, next) => {
  try {
    const id = z.string().trim().min(1).parse(req.params.id);
    const { mode } = executeSchema.parse(req.body);
    const plan = await prisma.contentPlan.findFirst({
      where: { id, workspaceId: req.workspace!.id },
      select: { id: true, brandId: true, name: true, status: true, startsAt: true, endsAt: true, planJson: true, brand: { select: { timezone: true } } },
    });
    if (!plan) {
      res.status(404).json({ error: "Content plan not found in this workspace." });
      return;
    }
    if (plan.status === "SCHEDULED" || plan.status === "IN_REVIEW") {
      res.status(409).json({ error: "This plan has already been sent to its publishing workflow." });
      return;
    }
    if (plan.status === "ARCHIVED" || plan.status === "PAUSED") {
      res.status(409).json({ error: "Resume or activate this plan before executing it." });
      return;
    }
    const rawItems = isJsonRecord(plan.planJson) ? plan.planJson.items : undefined;
    const parsedItems = z.array(planItemSchema).min(1).max(60).safeParse(rawItems);
    if (!parsedItems.success) {
      res.status(422).json({ error: "This plan has incomplete items. Each item needs content, a format, and at least one platform." });
      return;
    }
    const items = parsedItems.data;
    if (items.some((item) => !item.scheduledAt || new Date(item.scheduledAt) <= new Date())) {
      res.status(422).json({ error: "Add a future publishing date to every plan item before executing the plan." });
      return;
    }
    if (mode === "autonomous" && items.some((item) => item.platforms.some((platform) => platform !== "Instagram"))) {
      res.status(422).json({ error: "Scheduled publishing is currently connected to Instagram only. Remove unsupported channels before sending this plan for approval." });
      return;
    }
    const contentIds = [...new Set(items.map((item) => item.contentId))];
    const contentRows = await prisma.generatedContent.findMany({
      where: { id: { in: contentIds }, workspaceId: req.workspace!.id, brandId: plan.brandId },
      select: { id: true, contentJson: true },
    });
    if (contentRows.length !== contentIds.length || contentRows.some((row) => !isJsonRecord(row.contentJson) || typeof row.contentJson.caption !== "string")) {
      res.status(422).json({ error: "One or more plan drafts are missing or no longer available for this brand." });
      return;
    }
    const contentById = new Map(contentRows.map((row) => [row.id, row.contentJson as Prisma.JsonObject]));
    const profile = await prisma.companyProfile.findFirst({
      where: { brandId: plan.brandId, workspaceId: req.workspace!.id },
      select: { bannedWords: true },
    });
    const bannedWords = jsonStrings(profile?.bannedWords);
    const account = mode === "autonomous"
      ? await prisma.socialAccount.findFirst({
          where: { workspaceId: req.workspace!.id, provider: "instagram", status: "CONNECTED" },
          select: { id: true },
        })
      : null;
    if (mode === "autonomous" && !account) {
      res.status(409).json({ error: "Autonomous publishing needs a connected Instagram account for this brand. Connect it in Social Accounts, then retry." });
      return;
    }

    const prepared: Array<{
      item: z.infer<typeof planItemSchema>;
      content: Prisma.JsonObject;
      caption: string;
      designId: string | null;
      media: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    }> = [];
    for (const item of items) {
      const content = contentById.get(item.contentId)!;
      const caption = typeof content.caption === "string" ? content.caption : "";
      const quality = checkPostQuality(item.platforms, Object.fromEntries(item.platforms.map((platform) => [platform, caption])), bannedWords);
      if (!quality.passed) {
        res.status(422).json({ error: `Resolve quality issues for “${typeof content.title === "string" ? content.title : item.format}” before executing this plan.`, quality });
        return;
      }
      let designId: string | null = null;
      let media: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
      if (item.format === "video") {
        if (!item.videoJobId) {
          res.status(422).json({ error: "Every Reel needs a completed video render before it can enter the approval queue." });
          return;
        }
        const videoJob = await prisma.videoRenderJob.findFirst({
          where: {
            id: item.videoJobId,
            contentId: item.contentId,
            workspaceId: req.workspace!.id,
            brandId: plan.brandId,
            status: "SUCCEEDED",
          },
          select: { outputKey: true },
        });
        if (!videoJob?.outputKey) {
          res.status(422).json({ error: "A Reel video is not rendered yet. Wait for rendering to finish before sending the batch for approval." });
          return;
        }
        if (!isInstagramMediaHostingConfigured()) {
          res.status(422).json({ error: "Configure a public HTTPS API URL and social media encryption key before scheduling Instagram Reels." });
          return;
        }
        media = [{ type: "video", storageKey: videoJob.outputKey }];
      }
      const design = item.format === "video" ? null : await prisma.design.findFirst({
        where: {
          workspaceId: req.workspace!.id,
          brandId: plan.brandId,
          designJson: { path: "$.generatedContentId", equals: item.contentId },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          previewUrl: true,
          designJson: true,
          brand: { select: { kit: { select: { colors: true } } } },
        },
      });
      if (design) {
        designId = design.id;
        const colors = Array.isArray(design.brand.kit?.colors)
          ? design.brand.kit.colors.filter((color): color is string => typeof color === "string")
          : [];
        const document = getLegacyDesignDocument(design.designJson, design.title, colors, item.format);
        const carouselPages = item.format === "carousel" && document
          ? document.pages.map((_page, index) => renderDesignPageSvg(document, index))
          : null;
        if (item.format === "carousel" && (!carouselPages || carouselPages.length < 2 || carouselPages.length > 10)) {
          res.status(422).json({ error: "Every scheduled carousel needs a saved design with 2 to 10 slides." });
          return;
        }
        if (carouselPages) media = carouselPages;
        else if (design.previewUrl) media = [design.previewUrl];
      }
      if (mode === "autonomous") {
        if (item.platforms.some((platform) => platform !== "Instagram")) {
          res.status(422).json({ error: "Live autonomous publishing currently supports Instagram only. Remove other platforms or use the approval queue." });
          return;
        }
        if (!design?.previewUrl?.startsWith("data:image/svg+xml;charset=utf-8,")) {
          res.status(422).json({ error: "Every autonomous Instagram post needs a rendered design preview. Add a publishable design in Content Studio or use the approval queue." });
          return;
        }
        designId = design.id;
        if (item.format !== "carousel" && design.previewUrl) media = [design.previewUrl];
      }
      prepared.push({ item, content, caption, designId, media });
    }

    const execution = await prisma.$transaction(async (tx) => {
      const freshPlan = await tx.contentPlan.findFirst({
        where: { id, workspaceId: req.workspace!.id },
        select: { status: true },
      });
      if (!freshPlan || freshPlan.status === "SCHEDULED" || freshPlan.status === "IN_REVIEW" || freshPlan.status === "ARCHIVED" || freshPlan.status === "PAUSED") {
        throw new Error("PLAN_NOT_EXECUTABLE");
      }
      const createdPostIds: string[] = [];
      for (const entry of prepared) {
        const post = await tx.post.create({
          data: {
            workspaceId: req.workspace!.id,
            resellerId: req.workspace!.resellerId,
            brandId: plan.brandId,
            designId: entry.designId,
            title: typeof entry.content.title === "string" ? entry.content.title : plan.name,
            caption: entry.caption,
            hashtags: Array.isArray(entry.content.hashtags) ? entry.content.hashtags : Prisma.JsonNull,
            status: "SCHEDULED",
            scheduledAt: new Date(entry.item.scheduledAt!),
            timezone: plan.brand.timezone || "UTC",
          },
          select: { id: true },
        });
        createdPostIds.push(post.id);
        const targets = await Promise.all(entry.item.platforms.map((platform) => tx.postTarget.create({
          data: {
            workspaceId: req.workspace!.id,
            resellerId: req.workspace!.resellerId,
            postId: post.id,
            platform,
            socialAccountId: platform === "Instagram" ? account?.id ?? null : null,
            captionOverride: entry.caption,
            media: entry.media,
            status: "PENDING",
          },
          select: { id: true },
        })));
        if (mode === "approval") {
          await tx.approval.create({
            data: { workspaceId: req.workspace!.id, resellerId: req.workspace!.resellerId, postId: post.id, status: "PENDING" },
          });
        } else {
          await tx.publishJob.createMany({
            data: targets.map((target) => ({
              workspaceId: req.workspace!.id,
              resellerId: req.workspace!.resellerId,
              postId: post.id,
              targetId: target.id,
              runAt: new Date(entry.item.scheduledAt!),
            })),
          });
        }
      }
      await tx.contentPlan.update({ where: { id }, data: { status: mode === "approval" ? "IN_REVIEW" : "SCHEDULED" } });
      await tx.auditLog.create({
        data: {
          workspaceId: req.workspace!.id,
          actorId: req.auth!.userId,
          action: mode === "approval" ? "content_plan.sent_for_approval" : "content_plan.autonomously_scheduled",
          targetType: "content_plan",
          targetId: id,
          metadata: { postIds: createdPostIds, mode },
        },
      });
      return createdPostIds;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.status(201).json({ created: execution.length, postIds: execution, mode });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAN_NOT_EXECUTABLE") {
      res.status(409).json({ error: "This plan is no longer available to execute." });
      return;
    }
    next(error);
  }
});

router.post("/:id/duplicate", requireWritableWorkspace, async (req, res, next) => {
  try {
    const id = z.string().trim().min(1).parse(req.params.id);
    const source = await prisma.contentPlan.findFirst({
      where: { id, workspaceId: req.workspace!.id },
      select: { brandId: true, name: true, startsAt: true, endsAt: true, planJson: true },
    });
    if (!source) {
      res.status(404).json({ error: "Content plan not found in this workspace." });
      return;
    }
    const duration = source.endsAt.getTime() - source.startsAt.getTime();
    const startsAt = new Date(Math.max(Date.now(), source.endsAt.getTime()) + 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + duration);
    const shiftMs = startsAt.getTime() - source.startsAt.getTime();
    const planJson = source.planJson && typeof source.planJson === "object" && !Array.isArray(source.planJson)
      ? { ...source.planJson, items: Array.isArray(source.planJson.items)
        ? source.planJson.items.map((rawItem) => {
          if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return rawItem;
          const item = rawItem as Record<string, unknown>;
          return typeof item.scheduledAt === "string"
            ? { ...item, scheduledAt: new Date(new Date(item.scheduledAt).getTime() + shiftMs).toISOString() }
            : item;
        })
        : source.planJson.items }
      : source.planJson;
    const plan = await prisma.contentPlan.create({
      data: {
        workspaceId: req.workspace!.id,
        resellerId: req.workspace!.resellerId,
        brandId: source.brandId,
        name: `${source.name} (copy)`.slice(0, 120),
        startsAt,
        endsAt,
        planJson: planJson as Prisma.InputJsonValue,
        status: "DRAFT",
      },
      select: { id: true, brandId: true, name: true, startsAt: true, endsAt: true, planJson: true, status: true, createdAt: true, updatedAt: true },
    });
    res.status(201).json({ plan });
  } catch (error) {
    next(error);
  }
});

export { router as contentPlansRouter };
