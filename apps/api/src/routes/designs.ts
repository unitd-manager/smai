import { Router } from "express";
import { randomUUID } from "node:crypto";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Prisma } from "@prisma/client";
import sharp from "sharp";
import { getLegacyDesignDocument, parseDesignDocument, renderDesignPageSvg } from "@united-technologies/shared/design-document";
import { z } from "zod";
import { env } from "../env.js";
import { prisma } from "../db.js";
import { requireAuth, requireCompleteBrandProfile, requireWritableWorkspace, requireWorkspace } from "../middleware/auth.js";
import { recordDesignVersion } from "../services/content-version-history.js";
import { createAiDesignDocument, generateGroqSvgDesign, generateImageDesign, imageDesignFormats } from "../services/design-image-generator.js";
import { recordGeneratedContentVersion } from "../services/content-version-history.js";
import { getAiGenerationLimit } from "../services/plan-limits.js";

const router = Router();
const filterSchema = z.object({
  status: z.string().trim().min(1).optional(),
  brandId: z.string().trim().min(1).optional(),
  library: z.enum(["media", "gallery"]).optional(),
});
const editSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  document: z.unknown().optional(),
}).refine((value) => Object.keys(value).length > 0);
const referenceImageSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().min(100).max(2_800_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
}).optional();
const aiDesignSchema = z.object({
  prompt: z.string().trim().min(8).max(2200),
  format: z.enum(imageDesignFormats),
  layout: z.enum(["editorial", "split", "bold", "collage", "framed", "magazine", "type-led", "triptych", "spotlight", "grid", "sparkle", "radiant"]).default("editorial"),
  photorealistic: z.boolean().default(false),
  referenceImage: referenceImageSchema,
});

function isJsonRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

router.use(requireAuth, requireWorkspace, requireCompleteBrandProfile);

router.get("/image-generation-status", (_req, res) => {
  const usesGroq = Boolean(env.GROQ_API_KEY);
  res.json({
    configured: usesGroq || Boolean(env.GOOGLE_AI_STUDIO_API_KEY),
    photorealisticAvailable: Boolean(env.GOOGLE_AI_STUDIO_API_KEY),
    provider: usesGroq ? "Groq vector artwork" : "Gemini image generation",
    model: usesGroq ? env.GROQ_MODEL : env.DESIGN_IMAGE_MODEL,
  });
});

router.post(
  "/generate",
  requireWritableWorkspace,
  rateLimit({
    windowMs: 60_000,
    limit: 3,
    keyGenerator: (req) => req.workspace?.id ?? ipKeyGenerator(req.ip ?? "0.0.0.0"),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: "This workspace can create up to three AI artworks per minute. Wait a moment and try again.", code: "IMAGE_REQUEST_RATE_LIMIT" }),
  }),
  async (req, res, next) => {
    try {
      const input = aiDesignSchema.parse(req.body);
      if (!env.GOOGLE_AI_STUDIO_API_KEY && !env.GROQ_API_KEY) {
        res.status(503).json({ error: "AI artwork is not configured. Add GOOGLE_AI_STUDIO_API_KEY or GROQ_API_KEY to apps/api/.env and restart the API." });
        return;
      }
      const brand = await prisma.brand.findFirst({
        where: { workspaceId: req.workspace!.id, ...(req.header("x-brand-id") ? { id: req.header("x-brand-id")! } : {}) },
        select: {
          id: true,
          name: true,
          profile: { select: { industry: true, products: true, audience: true, tone: true, description: true, offers: true } },
          kit: { select: { colors: true, fonts: true } },
        },
      });
      if (!brand) {
        res.status(404).json({ error: "Choose a brand profile before creating artwork." });
        return;
      }
      const [subscription, usage] = await Promise.all([
        prisma.subscription.findUnique({ where: { workspaceId: req.workspace!.id }, select: { plan: true } }),
        prisma.generatedContent.count({ where: { workspaceId: req.workspace!.id, provider: { not: "duplicate" }, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
      ]);
      const limit = getAiGenerationLimit(
        subscription?.plan,
        req.workspace!.subscriptionStatus,
        req.workspace!.trialEndsAt,
      );
      if (limit !== null && usage >= limit) {
        res.status(403).json({ error: `This workspace has reached its ${limit} monthly AI generation limit.`, code: "GENERATION_LIMIT_REACHED" });
        return;
      }
      if (input.referenceImage) {
        const referenceBytes = Buffer.from(input.referenceImage.data, "base64");
        if (referenceBytes.length > 2_000_000) {
          res.status(413).json({ error: "Reference images must be under 2 MB after upload." });
          return;
        }
        let metadata: sharp.Metadata;
        try {
          metadata = await sharp(referenceBytes, { limitInputPixels: 25_000_000 }).metadata();
        } catch {
          res.status(415).json({ error: "That reference image could not be read. Choose an intact JPEG, PNG, or WebP image." });
          return;
        }
        if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) {
          res.status(415).json({ error: "Use a valid JPEG, PNG, or WebP reference image." });
          return;
        }
      }

      let generated;
      try {
        const commonInput = {
          model: env.GROQ_MODEL,
          prompt: input.prompt,
          format: input.format,
          brandName: brand.name,
          brandContext: [brand.profile?.description, brand.profile?.industry, brand.profile?.products, brand.profile?.audience, brand.profile?.offers, brand.profile?.tone].filter((value): value is string => Boolean(value)),
          colors: Array.isArray(brand.kit?.colors) ? brand.kit.colors.filter((value): value is string => typeof value === "string") : [],
          ...(input.referenceImage ? { referenceImage: input.referenceImage } : {}),
        };
        if (input.photorealistic && env.GOOGLE_AI_STUDIO_API_KEY) {
          generated = await generateImageDesign({ ...commonInput, apiKey: env.GOOGLE_AI_STUDIO_API_KEY, model: env.DESIGN_IMAGE_MODEL });
        } else if (env.GROQ_API_KEY) {
          generated = await generateGroqSvgDesign({ ...commonInput, apiKey: env.GROQ_API_KEY });
        } else if (env.GOOGLE_AI_STUDIO_API_KEY) {
          generated = await generateImageDesign({ ...commonInput, apiKey: env.GOOGLE_AI_STUDIO_API_KEY, model: env.DESIGN_IMAGE_MODEL });
        } else {
          res.status(503).json({ error: "AI artwork is not configured. Add GROQ_API_KEY or GOOGLE_AI_STUDIO_API_KEY to apps/api/.env and restart the API." });
          return;
        }
      } catch (error) {
        const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status
          : error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 502;
        const rawProviderMessage = error instanceof Error ? error.message : "Unknown image provider error";
        const safeProviderMessage = rawProviderMessage
          .replace(env.GOOGLE_AI_STUDIO_API_KEY ?? "\u0000", "[redacted]")
          .replace(env.GROQ_API_KEY ?? "\u0000", "[redacted]")
          .replace(/[\r\n\t]+/g, " ")
          .slice(0, 360);
        const providerDetail = safeProviderMessage.toLocaleLowerCase();
        const usesGroq = Boolean(env.GROQ_API_KEY);
        const providerName = usesGroq ? "Groq" : "Google AI Studio";
        const providerModel = usesGroq ? env.GROQ_MODEL : env.DESIGN_IMAGE_MODEL;
        console.error(`${providerName} artwork generation failed`, { status, model: providerModel, detail: safeProviderMessage });
        const noFreeImageQuota = providerDetail.includes("generate_content_free_tier_requests") || providerDetail.includes("free tier") && /limit\s*:?\s*0|quota\s*:?\s*0/.test(providerDetail);
        const message = status === 429 ? usesGroq
          ? "Groq returned HTTP 429 for vector artwork. Check the Groq project rate limits and usage quota, then try again."
          : noFreeImageQuota
            ? "This Google AI project has no free-tier quota for image generation. Enable Gemini API billing for this project. If it is already paid, check the model-specific image rate limit and project spend cap."
            : "Google returned HTTP 429 for image generation. Gemini 3.1 Flash Image has no free-tier generation quota; enable Gemini API billing if this project is free-tier, or check the paid project's image rate limit, spend cap, and usage."
          : status === 403 || status === 401 ? `${providerName} denied access for this API key or model. Check project permissions and model availability.`
            : status === 404 ? `The ${providerName} model “${providerModel}” is unavailable. Check the model configured in apps/api/.env.`
              : error instanceof Error && error.message.includes("no artwork") ? error.message
                : error instanceof Error && error.message.includes("could not create this design") ? error.message
                  : status === 400 || status === 422 ? `${providerName} rejected the artwork request: ${safeProviderMessage}`
                    : status >= 500 || /fetch failed|timed out|timeout|network|socket/i.test(safeProviderMessage)
                      ? `${providerName} could not be reached or is temporarily unavailable. Check the API connection and try again.`
                      : `Image generation failed (${status}): ${safeProviderMessage}`;
        res.status(status >= 400 && status < 500 ? status : 502).json({ error: message });
        return;
      }

      const imageData = await sharp(generated.image, { limitInputPixels: 25_000_000 })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 84, effort: 4 })
        .toBuffer();
      const designId = randomUUID();
      const title = generated.copy.headline || input.prompt.slice(0, 110);
      const colors = Array.isArray(brand.kit?.colors) ? brand.kit.colors.filter((value): value is string => typeof value === "string") : [];
      const fonts = Array.isArray(brand.kit?.fonts) ? brand.kit.fonts.filter((value): value is string => typeof value === "string") : [];
      const document = createAiDesignDocument({
        id: designId,
        title,
        format: input.format,
        layout: input.layout,
        brandName: brand.name,
        colors,
        fonts,
        imageData,
        copy: generated.copy,
        prompt: input.prompt,
        model: generated.model,
      });
      const previewUrl = renderDesignPageSvg(document, 0);
      const generatedContentJson: Prisma.InputJsonObject = {
        format: input.format,
        title,
        caption: generated.copy.supportingLine,
        hashtags: [],
        idea: input.prompt,
        pillar: "AI artwork",
        firstComment: generated.copy.callToAction,
        platforms: ["Instagram"],
        tone: brand.profile?.tone ?? "Professional and friendly",
        language: "English",
        platformCaptions: [{ platform: "Instagram", caption: generated.copy.supportingLine, hashtags: [] }],
        posterText: { headline: generated.copy.headline, supportingLine: generated.copy.supportingLine, callToAction: generated.copy.callToAction },
        ...(input.format === "flyer" || input.format === "brochure" ? { sections: generated.copy.sections.map((section) => `${section.title}: ${section.body}`) } : {}),
        ...(input.referenceImage ? { hasStyleReference: true } : {}),
      };
      const saved = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Workspace WHERE id = ${req.workspace!.id} FOR UPDATE`;
        const currentUsage = await tx.generatedContent.count({
          where: { workspaceId: req.workspace!.id, provider: { not: "duplicate" }, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
        });
        if (limit !== null && currentUsage >= limit) return null;
        const content = await tx.generatedContent.create({
          data: {
            workspaceId: req.workspace!.id,
            resellerId: req.workspace!.resellerId,
            brandId: brand.id,
            request: input.prompt,
            contentJson: generatedContentJson,
            provider: env.GROQ_API_KEY && !input.photorealistic ? "groq-vector-artwork" : "google-ai-studio",
            model: generated.model,
          },
          select: { id: true, contentJson: true },
        });
        await recordGeneratedContentVersion(tx, {
          workspaceId: req.workspace!.id, generatedContentId: content.id, createdById: req.auth!.userId,
          snapshot: content.contentJson as Prisma.InputJsonValue, note: "AI artwork created",
        });
        const design = await tx.design.create({
          data: {
            id: designId,
            workspaceId: req.workspace!.id,
            resellerId: req.workspace!.resellerId,
            brandId: brand.id,
            title,
            designJson: { format: input.format, prompt: input.prompt, generatedContentId: content.id, document } as unknown as Prisma.InputJsonValue,
            previewUrl: null,
            status: "DRAFT",
            inGallery: true,
          },
          select: { id: true, title: true, status: true, createdAt: true },
        });
        await recordDesignVersion(tx, {
          workspaceId: req.workspace!.id, designId: design.id, createdById: req.auth!.userId,
          snapshot: { title: design.title, designJson: { format: input.format, prompt: input.prompt, generatedContentId: content.id, document }, previewUrl: null, status: design.status },
          note: "Created with AI artwork",
        });
        await tx.auditLog.create({
          data: {
            workspaceId: req.workspace!.id, actorId: req.auth!.userId,
            action: "design.ai_generated", targetType: "design", targetId: design.id,
            metadata: { format: input.format, model: generated.model, referenceImage: Boolean(input.referenceImage) },
          },
        });
        return { design, contentId: content.id };
      });
      if (!saved) {
        if (limit === null) throw new Error("Unrestricted trial artwork generation was incorrectly limited.");
        res.status(403).json({ error: `This workspace reached its ${limit} monthly AI generation limit while the artwork was being generated. The image was not saved.`, code: "GENERATION_LIMIT_REACHED" });
        return;
      }
      res.status(201).json({
        design: { ...saved.design, contentId: saved.contentId, format: input.format, previewUrl, document },
        usage: { used: usage + 1, limit },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get("/", async (req, res, next) => {
  try {
    const filter = filterSchema.parse(req.query);
    const brandId = filter.brandId === "all" ? undefined : filter.brandId ?? req.header("x-brand-id") ?? undefined;
    const designs = await prisma.design.findMany({
      where: {
        workspaceId: req.workspace!.id,
        ...(filter.library ? { inGallery: filter.library === "gallery" } : {}),
        ...(brandId ? { brandId } : {}),
        ...(filter.status ? { status: filter.status.toUpperCase() } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        brandId: true,
        templateId: true,
        title: true,
        designJson: true,
        previewUrl: true,
        status: true,
        createdAt: true,
        brand: { select: { name: true, kit: { select: { colors: true } } } },
      },
    });
    const compatibleDesigns = designs.map((design) => {
      const colors = Array.isArray(design.brand.kit?.colors)
        ? design.brand.kit.colors.filter((color): color is string => typeof color === "string")
        : [];
      const designJson = isJsonRecord(design.designJson) ? design.designJson : {};
      const format = typeof designJson.format === "string" ? designJson.format : "post";
      const document = getLegacyDesignDocument(design.designJson, design.title, colors, format);
      if (!document) throw new Error(`Saved design "${design.id}" has no compatible design document.`);
      return { ...design, designJson: { ...designJson, document }, previewUrl: renderDesignPageSvg(document) };
    });
    res.json({ designs: compatibleDesigns });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/versions", async (req, res, next) => {
  try {
    const designId = z.string().min(1).parse(req.params.id);
    const design = await prisma.design.findFirst({
      where: { id: designId, workspaceId: req.workspace!.id },
      select: { id: true },
    });
    if (!design) {
      res.status(404).json({ error: "Design not found." });
      return;
    }
    const versions = await prisma.contentVersion.findMany({
      where: { workspaceId: req.workspace!.id, designId },
      orderBy: { version: "desc" },
      take: 100,
      select: { id: true, version: true, snapshot: true, note: true, createdAt: true },
    });
    res.json({ versions });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireWritableWorkspace, async (req, res, next) => {
  try {
    const designId = z.string().min(1).parse(req.params.id);
    const input = editSchema.parse(req.body);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Design WHERE id = ${designId} AND workspaceId = ${req.workspace!.id} FOR UPDATE`;
      const current = await tx.design.findFirst({
        where: { id: designId, workspaceId: req.workspace!.id },
        select: { id: true, title: true, designJson: true, previewUrl: true, status: true },
      });
      if (!current) return null;
      if (!isJsonRecord(current.designJson)) throw new Error("Stored design is not in the expected format.");
      const nextTitle = input.title ?? current.title;
      const nextJson = { ...current.designJson };
      let nextPreview = current.previewUrl;
      if (input.document !== undefined) {
        const document = parseDesignDocument(input.document);
        nextJson.document = JSON.parse(JSON.stringify(document)) as Prisma.JsonValue;
        nextPreview = renderDesignPageSvg(document);
        nextJson.previewUrl = nextPreview;
      }
      const changed = nextTitle !== current.title || JSON.stringify(nextJson) !== JSON.stringify(current.designJson);
      const saved = await tx.design.update({
        where: { id: designId },
        data: { title: nextTitle, designJson: nextJson, previewUrl: nextPreview },
        select: { id: true, title: true, designJson: true, previewUrl: true, status: true, updatedAt: true },
      });
      if (changed) {
        await recordDesignVersion(tx, {
          workspaceId: req.workspace!.id,
          designId,
          createdById: req.auth!.userId,
          snapshot: {
            title: saved.title,
            designJson: saved.designJson as Prisma.InputJsonValue,
            previewUrl: saved.previewUrl,
            status: saved.status,
          },
          note: "Edited",
        });
      }
      return saved;
    });
    if (!updated) {
      res.status(404).json({ error: "Design not found." });
      return;
    }
    res.json({ design: updated });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/versions/:version/restore", requireWritableWorkspace, async (req, res, next) => {
  try {
    const designId = z.string().min(1).parse(req.params.id);
    const versionNumber = z.coerce.number().int().min(1).parse(req.params.version);
    const [current, version] = await Promise.all([
      prisma.design.findFirst({
        where: { id: designId, workspaceId: req.workspace!.id },
        select: { id: true, title: true, designJson: true, previewUrl: true, status: true },
      }),
      prisma.contentVersion.findFirst({
        where: { workspaceId: req.workspace!.id, designId, version: versionNumber },
        select: { snapshot: true },
      }),
    ]);
    if (!current || !version) {
      res.status(404).json({ error: "Design or selected version was not found." });
      return;
    }
    const snapshot = version.snapshot;
    if (!isJsonRecord(snapshot)) {
      res.status(409).json({ error: "This design version cannot be restored because its saved data is invalid." });
      return;
    }
    const snapshotTitle = snapshot.title;
    const snapshotDesignJson = snapshot.designJson;
    if (typeof snapshotTitle !== "string" || snapshotDesignJson === undefined || !isJsonRecord(snapshotDesignJson)) {
      res.status(409).json({ error: "This design version cannot be restored because its saved data is invalid." });
      return;
    }
    const snapshotPreviewUrl = snapshot.previewUrl;
    const snapshotStatus = snapshot.status;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Design WHERE id = ${designId} AND workspaceId = ${req.workspace!.id} FOR UPDATE`;
      const lockedCurrent = await tx.design.findFirst({
        where: { id: designId, workspaceId: req.workspace!.id },
        select: { title: true, designJson: true, previewUrl: true, status: true },
      });
      if (!lockedCurrent || !isJsonRecord(lockedCurrent.designJson)) {
        throw new Error("Design was removed before its version could be restored.");
      }
      await recordDesignVersion(tx, {
        workspaceId: req.workspace!.id,
        designId,
        createdById: req.auth!.userId,
        snapshot: {
          title: lockedCurrent.title,
          designJson: lockedCurrent.designJson as Prisma.InputJsonValue,
          previewUrl: lockedCurrent.previewUrl,
          status: lockedCurrent.status,
        },
        note: `Before restoring version ${versionNumber}`,
      });
      const restored = await tx.design.update({
        where: { id: designId },
        data: {
          title: snapshotTitle,
          designJson: snapshotDesignJson as Prisma.InputJsonValue,
          previewUrl: typeof snapshotPreviewUrl === "string" ? snapshotPreviewUrl : null,
          status: typeof snapshotStatus === "string" ? snapshotStatus : "DRAFT",
        },
        select: { id: true, title: true, designJson: true, previewUrl: true, status: true, updatedAt: true },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: req.workspace!.id,
          actorId: req.auth!.userId,
          action: "design.version.restored",
          targetType: "design",
          targetId: designId,
          metadata: { version: versionNumber },
        },
      });
      return restored;
    });
    res.json({ design: updated });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/duplicate", requireWritableWorkspace, async (req, res, next) => {
  try {
    const designId = z.string().parse(req.params.id);
    const current = await prisma.design.findFirst({
      where: { id: designId, workspaceId: req.workspace!.id },
    });
    if (!current) {
      res.status(404).json({ error: "Design not found." });
      return;
    }
    if (current.designJson === null) {
      res.status(409).json({ error: "This design cannot be duplicated because it has no design data." });
      return;
    }
    const duplicate = await prisma.design.create({
      data: {
        workspaceId: current.workspaceId,
        resellerId: current.resellerId,
        brandId: current.brandId,
        templateId: current.templateId,
        title: `${current.title} · Copy`,
        designJson: current.designJson as Prisma.InputJsonValue,
        previewUrl: current.previewUrl,
      },
      select: { id: true, title: true },
    });
    await prisma.contentVersion.create({
      data: {
        workspaceId: req.workspace!.id,
        designId: duplicate.id,
        version: 1,
        createdById: req.auth!.userId,
        note: "Duplicated",
        snapshot: {
          title: duplicate.title,
          designJson: current.designJson as Prisma.InputJsonValue,
          previewUrl: current.previewUrl,
          status: current.status,
        },
      },
    });
    res.status(201).json({ design: duplicate });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireWritableWorkspace, async (req, res, next) => {
  try {
    const designId = z.string().parse(req.params.id);
    const result = await prisma.design.deleteMany({
      where: { id: designId, workspaceId: req.workspace!.id },
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Design not found." });
      return;
    }
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

export { router as designsRouter };
