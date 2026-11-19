import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireCompleteBrandProfile, requireWritableWorkspace, requireWorkspace } from "../middleware/auth.js";

const router = Router();

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

const platformCaptionSchema = z.object({
  platform: z.string().trim().min(2).max(40),
  caption: z.string().trim().min(2).max(63_206),
  hashtags: z.array(z.string().trim().min(2).max(80)).max(20),
  hook: z.string().trim().min(2).max(500).optional(),
  title: z.string().trim().min(2).max(500).optional(),
  description: z.string().trim().min(2).max(63_206).optional(),
  callToAction: z.string().trim().min(2).max(1000).optional(),
  altText: z.string().trim().min(2).max(2000).optional(),
  bestFormat: z.string().trim().min(2).max(40).optional(),
  formatReason: z.string().trim().min(2).max(1000).optional(),
  imageRatio: z.string().trim().min(2).max(20).optional(),
  recommendedTemplate: z.string().trim().min(2).max(120).optional(),
  firstComment: z.string().trim().min(2).max(3000).optional(),
}).strict();
const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  brief: z.string().trim().min(2).max(2000),
  platforms: z.array(z.string().trim().min(2).max(40)).min(1).max(12),
  items: z.array(z.object({
    contentId: z.string().trim().min(1),
    platformCaptions: z.array(platformCaptionSchema).min(1).max(12),
  }).strict()).min(1).max(14),
}).strict();

router.use(requireAuth, requireWorkspace, requireCompleteBrandProfile);

router.get("/", async (req, res, next) => {
  try {
    const sets = await prisma.contentSet.findMany({
      where: { workspaceId: req.workspace!.id, ...(req.header("x-brand-id") ? { brandId: req.header("x-brand-id")! } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        brandId: true,
        name: true,
        brief: true,
        platforms: true,
        contentIds: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json({ sets });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireWritableWorkspace, async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
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
    if (contentIds.length !== input.items.length) {
      res.status(400).json({ error: "Choose each generated content item only once." });
      return;
    }
    const savedSet = await prisma.$transaction(async (tx) => {
      const contents = await tx.generatedContent.findMany({
        where: { id: { in: contentIds }, workspaceId: req.workspace!.id, brandId: brand.id },
        select: { id: true, contentJson: true },
      });
      if (contents.length !== contentIds.length) return null;
      const contentsById = new Map(contents.map((content) => [content.id, content]));
      for (const item of input.items) {
        const content = contentsById.get(item.contentId);
        if (!content || !isJsonObject(content.contentJson)) {
          return null;
        }
      }
      for (const item of input.items) {
        const content = contentsById.get(item.contentId)!;
        if (!isJsonObject(content.contentJson)) return null;
        await tx.generatedContent.update({
          where: { id: item.contentId },
          data: { contentJson: { ...content.contentJson, platformCaptions: item.platformCaptions } },
        });
      }
      const contentSet = await tx.contentSet.create({
        data: {
          workspaceId: req.workspace!.id,
          resellerId: req.workspace!.resellerId,
          brandId: brand.id,
          name: input.name,
          brief: input.brief,
          platforms: input.platforms,
          contentIds,
        },
        select: { id: true, name: true, brief: true, platforms: true, contentIds: true, status: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: req.workspace!.id,
          actorId: req.auth!.userId,
          action: "content-set.created",
          targetType: "content-set",
          targetId: contentSet.id,
          metadata: { contentCount: contentIds.length, platformCount: input.platforms.length },
        },
      });
      return contentSet;
    });
    if (!savedSet) {
      res.status(404).json({ error: "One or more generated content items are unavailable in this workspace." });
      return;
    }
    res.status(201).json({ set: savedSet });
  } catch (error) {
    next(error);
  }
});

export { router as contentSetsRouter };
