import { Router } from "express";
import { createDesignDocument, renderDesignPageSvg } from "@united-technologies/shared/design-document";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { cloudflareAiConfigured, env } from "../env.js";
import { prisma } from "../db.js";
import { requireAuth, requireCompleteBrandProfile, requireWritableWorkspace, requireWorkspace } from "../middleware/auth.js";
import {
  ContentProviderError,
  contentFormats,
  selectContentProvider,
  type ContentProvider,
  type GeneratedAsset,
} from "../services/content-generator.js";
import { starterTemplates } from "../services/template-library.js";
import { getBusinessContext } from "../services/business-context.js";
import { recordDesignVersion, recordGeneratedContentVersion } from "../services/content-version-history.js";
import { getAiGenerationLimit } from "../services/plan-limits.js";
import { fromObjectStorageKey, getStoredObject } from "../services/object-storage.js";
import { createAiComposedDesign } from "../services/design-composition.js";

const router = Router();
const templateMatchesFormat = (templateFormat: string | undefined, format: string) =>
  templateFormat === format || templateFormat === "video" && format === "thumbnail";
const requestSchema = z.object({
  idea: z.string().trim().default(""),
  formats: z.array(z.enum(contentFormats)).min(1).max(contentFormats.length),
  carouselSlideCount: z.number().int().min(2).max(10).optional(),
  templateId: z.string().trim().min(1).optional(),
  templateCopy: z.object({
    headline: z.string().trim().max(180),
    supportingLine: z.string().trim().max(500),
    callToAction: z.string().trim().max(120),
  }).optional(),
  useBrandTemplate: z.boolean().default(false),
  platforms: z.array(z.string().trim().min(2).max(40)).min(1).max(12),
  tone: z.string().trim().max(80).default(""),
  language: z.string().trim().min(2).max(40).default("English"),
  useBrandProfile: z.boolean().default(true),
  videoBrief: z.object({
    durationSeconds: z.number().int().min(15).max(300),
    storyType: z.enum(["demo-story", "how-it-works", "customer-success", "day-in-the-life", "quick-tip", "myth-vs-fact", "announcement", "testimonial"]).default("demo-story"),
    visualStyle: z.enum(["b-roll", "talking-head", "product-demo", "kinetic-type"]),
    narration: z.enum(["voiceover", "on-camera", "text-only"]),
    musicMood: z.enum(["none", "upbeat", "calm", "cinematic", "playful"]),
    imageDirection: z.string().trim().default(""),
    onScreenText: z.boolean(),
  }).optional(),
  automationKey: z.string().trim().min(1).max(191).optional(),
});
const filterSchema = z.object({
  format: z.string().trim().min(1).optional(),
  platform: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  brandId: z.string().trim().min(1).optional(),
  library: z.enum(["media", "gallery"]).optional(),
});
const editSchema = z.object({
  title: z.string().trim().min(2).optional(),
  caption: z.string().trim().min(2).optional(),
  hashtags: z.array(z.string().trim().min(2).max(80)).max(20).optional(),
  platformCaptions: z.array(z.object({
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
  }).strict()).min(1).max(12).optional(),
}).refine((value) => Object.keys(value).length > 0);
const regeneratePlatformSchema = z.object({
  platform: z.string().trim().min(2).max(40),
});

function isJsonRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

router.use(requireAuth, requireWorkspace, requireCompleteBrandProfile);

router.get("/configuration", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    provider: cloudflareAiConfigured ? "cloudflare" : env.GROQ_API_KEY ? "groq" : env.OPENAI_API_KEY ? "openai" : null,
    configured: Boolean(cloudflareAiConfigured || env.GROQ_API_KEY || env.OPENAI_API_KEY),
    cloudflareConfigured: cloudflareAiConfigured,
    groqConfigured: Boolean(env.GROQ_API_KEY),
    openaiConfigured: Boolean(env.OPENAI_API_KEY),
    setup: "Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, GROQ_API_KEY, or OPENAI_API_KEY to apps/api/.env and restart the API.",
  });
});

router.post("/generate", requireWritableWorkspace, async (req, res, next) => {
  try {
    const input = requestSchema.parse(req.body);
    const brandId = req.header("x-brand-id");
    const brand = await prisma.brand.findFirst({
      where: { workspaceId: req.workspace!.id, ...(brandId ? { id: brandId } : {}) },
      select: {
        id: true,
        name: true,
        profile: {
          select: {
            industry: true,
            description: true,
            products: true,
            audience: true,
            offers: true,
            tone: true,
            brandVoiceRules: true,
            bannedWords: true,
          },
        },
        kit: { select: { colors: true, fonts: true, templateIds: true, logoUrl: true } },
      },
    });
    if (!brand) {
      res.status(404).json({ error: "No brand profile exists in this workspace." });
      return;
    }
    if (input.automationKey) {
      const existing = await prisma.generatedContent.findFirst({
        where: { automationKey: input.automationKey, workspaceId: req.workspace!.id, brandId: brand.id },
        select: { id: true, contentJson: true },
      });
      if (existing) {
        res.json({ generatedCount: 1, items: [{ ...existing, designs: [] }] });
        return;
      }
    }
    const storedTemplate = input.templateId
      ? await prisma.template.findFirst({
          where: {
            id: input.templateId,
            active: true,
            OR: [
              { workspaceId: null, resellerId: null },
              { workspaceId: req.workspace!.id },
            ],
          },
        })
      : null;
    const starterTemplate = input.templateId
      ? starterTemplates.find((item) => item.id === input.templateId)
      : undefined;
    const requestedTemplate = storedTemplate ?? (starterTemplate
      ? {
          id: starterTemplate.id,
          name: starterTemplate.name,
          format: starterTemplate.format,
          templateJson: starterTemplate.templateJson,
        }
      : null);
    if (input.templateId && !requestedTemplate) {
      res.status(404).json({ error: "The selected template is no longer available." });
      return;
    }
    const templateFormat = requestedTemplate
      ? contentFormats.find((format) => format === requestedTemplate.format)
      : undefined;
    if (requestedTemplate && (!templateFormat || !input.formats.some((format) => templateMatchesFormat(templateFormat, format)))) {
      res.status(400).json({ error: "Choose the selected template's format before creating content." });
      return;
    }
    const preferredTemplates = new Map<string, { id: string; name: string; format: string; templateJson: Prisma.JsonValue }>();
    const preferredTemplateIds = Array.isArray(brand.kit?.templateIds)
      ? brand.kit.templateIds.filter((id): id is string => typeof id === "string")
      : [];
    if (!requestedTemplate && input.useBrandTemplate && preferredTemplateIds.length) {
      const savedTemplates = await prisma.template.findMany({
        where: {
          id: { in: preferredTemplateIds },
          active: true,
          OR: [{ workspaceId: null, resellerId: null }, { workspaceId: req.workspace!.id }],
        },
        select: { id: true, name: true, format: true, templateJson: true },
      });
      const templatesById = new Map<string, { id: string; name: string; format: string; templateJson: Prisma.JsonValue }>(
        savedTemplates.map((template) => [template.id, template]),
      );
      for (const template of starterTemplates) {
        if (preferredTemplateIds.includes(template.id)) {
          templatesById.set(template.id, template);
        }
      }
      if (preferredTemplateIds.some((id) => !templatesById.has(id))) {
        res.status(409).json({ error: "A preferred brand template is no longer available. Update the Brand Kit before generating content." });
        return;
      }
      for (const id of preferredTemplateIds) {
        const template = templatesById.get(id)!;
        const format = contentFormats.find((candidate) => candidate === template.format);
        if (format && input.formats.includes(format)) {
          if (preferredTemplates.has(format)) {
            res.status(409).json({ error: `More than one preferred brand template is configured for ${format}. Update the Brand Kit.` });
            return;
          }
          preferredTemplates.set(format, template);
        }
      }
    }
    const brandColors = Array.isArray(brand.kit?.colors)
      ? brand.kit.colors.filter((color): color is string => typeof color === "string")
      : [];
    const brandFonts = Array.isArray(brand.kit?.fonts)
      ? brand.kit.fonts.filter((font): font is string => typeof font === "string")
      : [];
    let brandLogoSrc: string | undefined;
    const logoAssetId = brand.kit?.logoUrl?.startsWith("media://") ? brand.kit.logoUrl.slice("media://".length) : "";
    if (logoAssetId) {
      const logoAsset = await prisma.mediaAsset.findFirst({
        where: { id: logoAssetId, workspaceId: req.workspace!.id, OR: [{ brandId: null }, { brandId: brand.id }], mimeType: { in: ["image/jpeg", "image/png", "image/webp"] } },
        select: { mimeType: true, fileData: true, storageKey: true },
      });
      if (logoAsset) {
        let logoBytes = logoAsset.fileData ? Buffer.from(logoAsset.fileData) : null;
        const objectKey = fromObjectStorageKey(logoAsset.storageKey);
        if (!logoBytes && objectKey) {
          const object = await getStoredObject(objectKey);
          if (object.Body) logoBytes = Buffer.from(await object.Body.transformToByteArray());
        }
        if (logoBytes) brandLogoSrc = `data:${logoAsset.mimeType};base64,${logoBytes.toString("base64")}`;
      }
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const usage = await prisma.generatedContent.count({
        where: { workspaceId: req.workspace!.id, provider: { not: "duplicate" }, createdAt: { gte: monthStart } },
      });
    const generationLimit = getAiGenerationLimit(
      req.workspace!.subscriptionPlan,
      req.workspace!.subscriptionStatus,
      req.workspace!.trialEndsAt,
      now,
    );
    if (generationLimit !== null && usage + input.formats.length > generationLimit) {
      res.status(403).json({
        error: `This workspace has reached its ${generationLimit} monthly generation limit.`,
        code: "GENERATION_LIMIT_REACHED",
      });
      return;
    }

    let provider: ContentProvider;
    let generated: GeneratedAsset[];
    try {
      provider = selectContentProvider({
        cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
        cloudflareApiToken: env.CLOUDFLARE_API_TOKEN,
        cloudflareModel: env.CLOUDFLARE_TEXT_MODEL,
        groqApiKey: env.GROQ_API_KEY,
        groqModel: env.GROQ_MODEL,
        openAiApiKey: env.OPENAI_API_KEY,
        openAiModel: env.OPENAI_MODEL,
      });
      const businessContext = await getBusinessContext(req.workspace!.id, brand.id, input.idea);
      const defaultTemplate = requestedTemplate ?? preferredTemplates.get(input.formats[0]!);
      generated = await provider.generate({
        idea: input.idea,
        formats: input.formats,
        ...(input.formats.includes("carousel") ? { carouselSlideCount: input.carouselSlideCount ?? 6 } : {}),
        platforms: input.platforms,
        tone: input.tone || (input.useBrandProfile ? brand.profile?.tone : undefined) || "warm and confident",
        language: input.language,
        ...(input.videoBrief && input.formats.includes("video") ? { videoBrief: input.videoBrief } : {}),
        brand: {
          name: brand.name,
          ...(input.useBrandProfile ? {
            industry: brand.profile?.industry,
            description: brand.profile?.description,
            products: brand.profile?.products,
            audience: brand.profile?.audience,
            offers: brand.profile?.offers,
            tone: brand.profile?.tone,
            brandVoiceRules: Array.isArray(brand.profile?.brandVoiceRules)
              ? brand.profile.brandVoiceRules.filter((rule): rule is string => typeof rule === "string")
              : [],
            bannedWords: Array.isArray(brand.profile?.bannedWords)
              ? brand.profile.bannedWords.filter((word): word is string => typeof word === "string")
              : [],
          } : {}),
          colors: brandColors,
        },
        businessContext,
        ...(defaultTemplate ? {
          template: {
            name: defaultTemplate.name,
            layout: isJsonRecord(defaultTemplate.templateJson) && typeof defaultTemplate.templateJson.layout === "string"
              ? defaultTemplate.templateJson.layout
              : "editorial",
          },
        } : {}),
      });
    } catch (error) {
      if (!(error instanceof ContentProviderError)) throw error;
      console.error("Content provider request failed.", { provider: error.provider, status: error.status });
      res.status(error.status === 429 || error.status === 503 ? error.status : 502).json({ error: error.message });
      return;
    }

    const designWarnings: string[] = [];
    const dynamicDocuments = new Map<string, ReturnType<typeof createDesignDocument>>();
    await Promise.all(generated.map(async (asset) => {
      const template = requestedTemplate ?? preferredTemplates.get(asset.format);
      if (templateMatchesFormat(template?.format, asset.format)) return;
      const baseDocument = createDesignDocument({
        id: `dynamic-${asset.format}`,
        title: asset.title,
        colors: brandColors,
        fonts: brandFonts,
        logoSrc: brandLogoSrc,
        variant: 0,
        format: asset.format,
        content: {
          brandName: brand.name,
          caption: asset.caption,
          ...(asset.slides ? { slides: asset.slides } : {}),
          ...(asset.sections ? { sections: asset.sections } : {}),
          ...(asset.posterText ? { posterText: asset.posterText } : {}),
        },
      });
      try {
        const composedDocument = await createAiComposedDesign(baseDocument, {
          format: asset.format,
          title: asset.title,
          colors: brandColors,
          fonts: brandFonts,
        });
        dynamicDocuments.set(asset.format, {
          ...composedDocument,
          pages: composedDocument.pages.map((page, index) => {
            const logoLayer = baseDocument.pages[index]?.layers.find((layer) => layer.id === "brand-logo");
            return logoLayer && !page.layers.some((layer) => layer.id === "brand-logo")
              ? { ...page, layers: [...page.layers, logoLayer] }
              : page;
          }),
        });
      } catch (error) {
        designWarnings.push(`${asset.title}: AI layout planning fell back to the built-in composition (${error instanceof Error ? error.message : "layout planning failed"}).`.slice(0, 360));
      }
    }));

    const saved = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Workspace WHERE id = ${req.workspace!.id} FOR UPDATE`;
      const currentUsage = await tx.generatedContent.count({
        where: {
          workspaceId: req.workspace!.id,
          provider: { not: "duplicate" },
          createdAt: { gte: monthStart },
        },
      });
      if (generationLimit !== null && currentUsage + generated.length > generationLimit) {
        return { limitReached: true as const, used: currentUsage, items: [] };
      }
      const items = [];
      for (const asset of generated) {
        const template = requestedTemplate ?? preferredTemplates.get(asset.format);
        const posterText = input.templateCopy ? {
          headline: input.templateCopy.headline || asset.posterText?.headline || asset.title,
          supportingLine: input.templateCopy.supportingLine || asset.posterText?.supportingLine || asset.caption,
          callToAction: input.templateCopy.callToAction || asset.posterText?.callToAction || "LEARN MORE",
        } : asset.posterText;
        const content = await tx.generatedContent.create({
          data: {
            workspaceId: req.workspace!.id,
            resellerId: req.workspace!.resellerId,
            brandId: brand.id,
            ...(input.automationKey ? { automationKey: input.automationKey } : {}),
            request: input.idea || null,
            contentJson: {
              ...asset,
              ...(posterText ? { posterText } : {}),
              ...(asset.format === "video" && input.videoBrief ? { videoBrief: input.videoBrief } : {}),
              platforms: input.platforms,
              tone: input.tone || brand.profile?.tone || "warm and confident",
              language: input.language,
            },
            provider: provider.name,
            model: provider.model,
          },
          select: { id: true, contentJson: true, provider: true, createdAt: true },
        });
        await recordGeneratedContentVersion(tx, {
          workspaceId: req.workspace!.id,
          generatedContentId: content.id,
          createdById: req.auth!.userId,
          snapshot: content.contentJson as Prisma.InputJsonValue,
          note: "Created",
        });
        const designs = await Promise.all(
          (templateMatchesFormat(template?.format, asset.format) ? [0] : [0, 1, 2]).map((variant) => {
            const appliesTemplate = templateMatchesFormat(template?.format, asset.format);
            const templateJson = template && appliesTemplate && isJsonRecord(template.templateJson) ? template.templateJson : undefined;
            const templatePaletteValues: unknown[] = Array.isArray(templateJson?.palette) ? templateJson.palette : [];
            const templateColors = templatePaletteValues.filter((color): color is string =>
              typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)).slice(0, 6);
            const layout = typeof templateJson?.layout === "string" ? templateJson.layout : undefined;
            const previewTemplate = templateJson ? { ...templateJson } : undefined;
            const fallbackDocument = createDesignDocument({
              id: `${content.id}-${variant}`,
              title: asset.title,
              colors: templateColors.length >= 3 ? templateColors : brandColors,
              fonts: brandFonts,
              logoSrc: brandLogoSrc,
              variant,
              format: asset.format,
              template: previewTemplate,
              templateId: appliesTemplate ? template?.id : undefined,
              content: {
                brandName: brand.name,
                caption: asset.caption,
                ...(asset.slides ? { slides: asset.slides } : {}),
                ...(asset.sections ? { sections: asset.sections } : {}),
                ...(posterText ? { posterText } : {}),
              },
            });
            const document = variant === 0 && dynamicDocuments.has(asset.format)
              ? { ...dynamicDocuments.get(asset.format)!, id: `${content.id}-${variant}` }
              : fallbackDocument;
            const previewUrl = renderDesignPageSvg(document);
            return tx.design.create({
              data: {
                workspaceId: req.workspace!.id,
                resellerId: req.workspace!.resellerId,
                brandId: brand.id,
                templateId: appliesTemplate ? template?.id ?? null : null,
                title: `${asset.title} · ${(layout ?? ["editorial", "collage", "bold"][variant] ?? "editorial").replaceAll("-", " ")} design`,
                designJson: {
                  generatedContentId: content.id,
                  format: asset.format,
                  platforms: input.platforms,
                  document,
                  variant,
                  previewUrl,
                  template: previewTemplate ?? null,
                },
                previewUrl,
                status: "DRAFT",
              },
              select: { id: true, title: true, previewUrl: true, designJson: true, status: true },
            });
          }),
        );
        for (const design of designs) {
          await recordDesignVersion(tx, {
            workspaceId: req.workspace!.id,
            designId: design.id,
            createdById: req.auth!.userId,
            snapshot: {
              title: design.title,
              designJson: design.designJson as Prisma.InputJsonValue,
              previewUrl: design.previewUrl,
              status: design.status,
            },
            note: "Created",
          });
        }
        items.push({ ...content, designs });
      }
      return { limitReached: false as const, used: currentUsage + generated.length, items };
    });
    if (saved.limitReached) {
      if (generationLimit === null) throw new Error("Unrestricted trial generation was incorrectly limited.");
      res.status(403).json({
        error: `This workspace has reached its ${generationLimit} monthly generation limit.`,
        code: "GENERATION_LIMIT_REACHED",
      });
      return;
    }

    res.status(201).json({
      provider: provider.name,
      cloudflareConfigured: cloudflareAiConfigured,
      groqConfigured: Boolean(env.GROQ_API_KEY),
      openaiConfigured: Boolean(env.OPENAI_API_KEY),
      configured: Boolean(cloudflareAiConfigured || env.GROQ_API_KEY || env.OPENAI_API_KEY),
      renderer: "built-in-svg",
      ...(designWarnings.length ? { designWarnings } : {}),
      generatedCount: generated.length,
      usage: { used: saved.used, limit: generationLimit },
      items: saved.items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const filter = filterSchema.parse(req.query);
    const brandId = filter.brandId === "all" ? undefined : filter.brandId ?? req.header("x-brand-id") ?? undefined;
    const rows = await prisma.generatedContent.findMany({
      where: {
        workspaceId: req.workspace!.id,
        ...(filter.library ? { inGallery: filter.library === "gallery" } : {}),
        provider: { not: "platform-regeneration" },
        ...(brandId ? { brandId } : {}),
        ...(filter.status ? { status: filter.status.toUpperCase() } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        brandId: true,
        request: true,
        contentJson: true,
        provider: true,
        status: true,
        createdAt: true,
        brand: { select: { name: true } },
      },
    });
    const filteredRows = rows.filter((row) => {
      const content = row.contentJson;
      if (!isJsonRecord(content)) return !filter.format && !filter.platform;
      const record = content;
      const formatMatches = !filter.format || record.format === filter.format;
      const platforms = Array.isArray(record.platforms) ? record.platforms : [];
      const platformMatches = !filter.platform || platforms.includes(filter.platform);
      return formatMatches && platformMatches;
    });
    res.json({
      items: filteredRows.filter((row) => row.provider !== "platform-regeneration"),
      cloudflareConfigured: cloudflareAiConfigured,
      groqConfigured: Boolean(env.GROQ_API_KEY),
      openaiConfigured: Boolean(env.OPENAI_API_KEY),
      configured: Boolean(cloudflareAiConfigured || env.GROQ_API_KEY || env.OPENAI_API_KEY),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const item = await prisma.generatedContent.findFirst({
      where: { id, workspaceId: req.workspace!.id },
      select: { id: true, contentJson: true, request: true, provider: true, status: true, createdAt: true },
    });
    if (!item) {
      res.status(404).json({ error: "Saved content was not found in this workspace." });
      return;
    }
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/versions", async (req, res, next) => {
  try {
    const contentId = z.string().min(1).parse(req.params.id);
    const content = await prisma.generatedContent.findFirst({
      where: { id: contentId, workspaceId: req.workspace!.id },
      select: { id: true },
    });
    if (!content) {
      res.status(404).json({ error: "Generated content was not found." });
      return;
    }
    const versions = await prisma.contentVersion.findMany({
      where: { workspaceId: req.workspace!.id, generatedContentId: contentId },
      orderBy: { version: "desc" },
      take: 100,
      select: { id: true, version: true, snapshot: true, note: true, createdAt: true },
    });
    res.json({ versions });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/versions/:version/restore", requireWritableWorkspace, async (req, res, next) => {
  try {
    const contentId = z.string().min(1).parse(req.params.id);
    const versionNumber = z.coerce.number().int().min(1).parse(req.params.version);
    const [current, version] = await Promise.all([
      prisma.generatedContent.findFirst({
        where: { id: contentId, workspaceId: req.workspace!.id },
        select: { id: true, contentJson: true },
      }),
      prisma.contentVersion.findFirst({
        where: { workspaceId: req.workspace!.id, generatedContentId: contentId, version: versionNumber },
        select: { snapshot: true },
      }),
    ]);
    if (!current || !version) {
      res.status(404).json({ error: "Content or selected version was not found." });
      return;
    }
    if (!isJsonRecord(current.contentJson) || !isJsonRecord(version.snapshot)) {
      res.status(409).json({ error: "This content version cannot be restored because its saved data is invalid." });
      return;
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM GeneratedContent WHERE id = ${contentId} FOR UPDATE`;
      const lockedCurrent = await tx.generatedContent.findFirst({
        where: { id: contentId, workspaceId: req.workspace!.id },
        select: { contentJson: true },
      });
      if (!lockedCurrent || !isJsonRecord(lockedCurrent.contentJson)) {
        throw new Error("Generated content was removed before its version could be restored.");
      }
      await recordGeneratedContentVersion(tx, {
        workspaceId: req.workspace!.id,
        generatedContentId: contentId,
        createdById: req.auth!.userId,
        snapshot: lockedCurrent.contentJson as Prisma.InputJsonValue,
        note: `Before restoring version ${versionNumber}`,
      });
      const restored = await tx.generatedContent.update({
        where: { id: contentId },
        data: { contentJson: version.snapshot as Prisma.InputJsonValue },
        select: { id: true, contentJson: true, status: true },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: req.workspace!.id,
          actorId: req.auth!.userId,
          action: "content.version.restored",
          targetType: "generated-content",
          targetId: contentId,
          metadata: { version: versionNumber },
        },
      });
      return restored;
    });
    res.json({ item: updated });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireWritableWorkspace, async (req, res, next) => {
  try {
    const input = editSchema.parse(req.body);
    const contentId = z.string().min(1).parse(req.params.id);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM GeneratedContent WHERE id = ${contentId} AND workspaceId = ${req.workspace!.id} FOR UPDATE`;
      const current = await tx.generatedContent.findFirst({
        where: { id: contentId, workspaceId: req.workspace!.id },
        select: { id: true, contentJson: true },
      });
      if (!current) return null;
      const sourceContent = current.contentJson;
      if (!isJsonRecord(sourceContent)) {
        throw new Error("Stored content is not in the expected format.");
      }
      const contentJson = { ...sourceContent, ...input };
      const changed = JSON.stringify(contentJson) !== JSON.stringify(sourceContent);
      const saved = await tx.generatedContent.update({
        where: { id: current.id },
        data: { contentJson },
        select: { id: true, contentJson: true, status: true },
      });
      if (changed) {
        await recordGeneratedContentVersion(tx, {
          workspaceId: req.workspace!.id,
          generatedContentId: current.id,
          createdById: req.auth!.userId,
          snapshot: saved.contentJson as Prisma.InputJsonValue,
          note: "Edited",
        });
      }
      return saved;
    });
    if (!updated) {
      res.status(404).json({ error: "Generated content was not found." });
      return;
    }
    res.json({ item: updated });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/regenerate-platform", requireWritableWorkspace, async (req, res, next) => {
  try {
    const input = regeneratePlatformSchema.parse(req.body);
    const contentId = z.string().min(1).parse(req.params.id);
    const current = await prisma.generatedContent.findFirst({
      where: { id: contentId, workspaceId: req.workspace!.id },
      select: { id: true, brandId: true, request: true, contentJson: true },
    });
    if (!current || !isJsonRecord(current.contentJson)) {
      res.status(404).json({ error: "Generated content was not found." });
      return;
    }
    const content = current.contentJson;
    const format = z.enum(contentFormats).safeParse(content.format);
    const platforms = Array.isArray(content.platforms) ? content.platforms : [];
    if (!format.success || !platforms.includes(input.platform)) {
      res.status(400).json({ error: "Choose a platform already included in this content set." });
      return;
    }
    const brand = await prisma.brand.findFirst({
      where: { id: current.brandId, workspaceId: req.workspace!.id },
      select: {
        id: true,
        name: true,
        profile: {
          select: {
            industry: true, description: true, products: true, audience: true, offers: true, tone: true,
            brandVoiceRules: true, bannedWords: true,
          },
        },
        kit: { select: { colors: true } },
      },
    });
    if (!brand) {
      res.status(404).json({ error: "The brand for this content is no longer available." });
      return;
    }
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const usage = await prisma.generatedContent.count({
        where: { workspaceId: req.workspace!.id, provider: { not: "duplicate" }, createdAt: { gte: monthStart } },
      });
    const generationLimit = getAiGenerationLimit(
      req.workspace!.subscriptionPlan,
      req.workspace!.subscriptionStatus,
      req.workspace!.trialEndsAt,
      now,
    );
    if (generationLimit !== null && usage >= generationLimit) {
      res.status(403).json({
        error: `This workspace has reached its ${generationLimit} monthly generation limit.`,
        code: "GENERATION_LIMIT_REACHED",
      });
      return;
    }
    let provider: ContentProvider;
    const brandColors = Array.isArray(brand.kit?.colors)
      ? brand.kit.colors.filter((color): color is string => typeof color === "string")
      : [];
    let regenerated;
    try {
      provider = selectContentProvider({
        cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
        cloudflareApiToken: env.CLOUDFLARE_API_TOKEN,
        cloudflareModel: env.CLOUDFLARE_TEXT_MODEL,
        groqApiKey: env.GROQ_API_KEY,
        groqModel: env.GROQ_MODEL,
        openAiApiKey: env.OPENAI_API_KEY,
        openAiModel: env.OPENAI_MODEL,
      });
      const businessContext = await getBusinessContext(req.workspace!.id, brand.id, current.request ?? "");
      const result = await provider.generate({
        idea: current.request ?? (typeof content.idea === "string" ? content.idea : current.id),
        formats: [format.data],
        platforms: [input.platform],
        tone: typeof content.tone === "string" ? content.tone : brand.profile?.tone ?? "warm and confident",
        language: typeof content.language === "string" ? content.language : "English",
        brand: {
          name: brand.name,
          industry: brand.profile?.industry,
          description: brand.profile?.description,
          products: brand.profile?.products,
          audience: brand.profile?.audience,
          offers: brand.profile?.offers,
          tone: brand.profile?.tone,
          brandVoiceRules: Array.isArray(brand.profile?.brandVoiceRules)
            ? brand.profile.brandVoiceRules.filter((rule): rule is string => typeof rule === "string")
            : [],
          bannedWords: Array.isArray(brand.profile?.bannedWords)
            ? brand.profile.bannedWords.filter((word): word is string => typeof word === "string")
            : [],
          colors: brandColors,
        },
        businessContext,
      });
      const item = result[0];
      const platformCaption = item?.platformCaptions.find((preview) => preview.platform === input.platform);
      if (!platformCaption) throw new Error("The AI provider did not return the requested platform version.");
      regenerated = platformCaption;
    } catch (error) {
      if (!(error instanceof ContentProviderError)) throw error;
      console.error("Platform caption regeneration failed.", { provider: error.provider, status: error.status });
      res.status(error.status === 429 || error.status === 503 ? error.status : 502).json({ error: error.message });
      return;
    }
    const existingCaptions = Array.isArray(content.platformCaptions)
      ? content.platformCaptions.filter(isJsonRecord)
      : [];
    const platformCaptions = [
      ...existingCaptions.filter((preview) => preview.platform !== input.platform),
      regenerated,
    ];
    const updatedContent = { ...content, platformCaptions };
    const saved = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Workspace WHERE id = ${req.workspace!.id} FOR UPDATE`;
      const currentUsage = await tx.generatedContent.count({
        where: { workspaceId: req.workspace!.id, provider: { not: "duplicate" }, createdAt: { gte: monthStart } },
      });
      if (generationLimit !== null && currentUsage >= generationLimit) return null;
      await tx.generatedContent.create({
        data: {
          workspaceId: req.workspace!.id,
          resellerId: req.workspace!.resellerId,
          brandId: brand.id,
          request: `Regenerated ${input.platform} copy for ${current.id}`,
          contentJson: { format: format.data, platform: input.platform },
          provider: "platform-regeneration",
          model: provider.model,
          status: "INTERNAL",
        },
      });
      await tx.generatedContent.update({ where: { id: current.id }, data: { contentJson: updatedContent } });
      await recordGeneratedContentVersion(tx, {
        workspaceId: req.workspace!.id,
        generatedContentId: current.id,
        createdById: req.auth!.userId,
        snapshot: updatedContent as Prisma.InputJsonValue,
        note: `Regenerated ${input.platform} copy`,
      });
      return currentUsage + 1;
    });
    if (saved === null) {
      if (generationLimit === null) throw new Error("Unrestricted trial regeneration was incorrectly limited.");
      res.status(403).json({
        error: `This workspace has reached its ${generationLimit} monthly generation limit.`,
        code: "GENERATION_LIMIT_REACHED",
      });
      return;
    }
    res.json({
      provider: provider.name,
      cloudflareConfigured: cloudflareAiConfigured,
      groqConfigured: Boolean(env.GROQ_API_KEY),
      openaiConfigured: Boolean(env.OPENAI_API_KEY),
      configured: Boolean(cloudflareAiConfigured || env.GROQ_API_KEY || env.OPENAI_API_KEY),
      platformCaption: regenerated,
      usage: { used: saved, limit: generationLimit },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/duplicate", requireWritableWorkspace, async (req, res, next) => {
  try {
    const contentId = z.string().min(1).parse(req.params.id);
    const current = await prisma.generatedContent.findFirst({
      where: { id: contentId, workspaceId: req.workspace!.id },
      select: { id: true, brandId: true, resellerId: true, request: true, contentJson: true, provider: true, model: true },
    });
    if (!current) {
      res.status(404).json({ error: "Generated content was not found." });
      return;
    }
    const sourceContent = current.contentJson;
    if (!isJsonRecord(sourceContent)) {
      res.status(500).json({ error: "Stored content is not in the expected format." });
      return;
    }
    const designs = await prisma.design.findMany({
      where: {
        workspaceId: req.workspace!.id,
        designJson: { path: "$.generatedContentId", equals: current.id },
      },
      select: { title: true, designJson: true, previewUrl: true, status: true },
    });
    const duplicated = await prisma.$transaction(async (tx) => {
      const content = await tx.generatedContent.create({
        data: {
          workspaceId: req.workspace!.id,
          resellerId: current.resellerId,
          brandId: current.brandId,
          request: current.request,
          contentJson: sourceContent,
          provider: "duplicate",
          model: null,
          status: "COMPLETED",
        },
        select: { id: true, contentJson: true, provider: true, createdAt: true },
      });
      await recordGeneratedContentVersion(tx, {
        workspaceId: req.workspace!.id,
        generatedContentId: content.id,
        createdById: req.auth!.userId,
        snapshot: sourceContent as Prisma.InputJsonValue,
        note: "Duplicated",
      });
      const copiedDesigns = await Promise.all(designs.map(async (design) => {
        const designJson = isJsonRecord(design.designJson)
          ? { ...design.designJson, generatedContentId: content.id }
          : { generatedContentId: content.id };
        const copied = await tx.design.create({
          data: {
            workspaceId: req.workspace!.id,
            resellerId: current.resellerId,
            brandId: current.brandId,
            title: `${design.title} · Copy`,
            designJson,
            previewUrl: design.previewUrl,
            status: design.status,
          },
          select: { id: true, title: true, previewUrl: true, status: true },
        });
        await recordDesignVersion(tx, {
          workspaceId: req.workspace!.id,
          designId: copied.id,
          createdById: req.auth!.userId,
          snapshot: {
            title: copied.title,
            designJson: designJson as Prisma.InputJsonValue,
            previewUrl: copied.previewUrl,
            status: copied.status,
          },
          note: "Duplicated",
        });
        return copied;
      }));
      return { ...content, designs: copiedDesigns };
    });
    res.status(201).json({ item: duplicated });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireWritableWorkspace, async (req, res, next) => {
  try {
    const contentId = z.string().min(1).parse(req.params.id);
    const current = await prisma.generatedContent.findFirst({
      where: { id: contentId, workspaceId: req.workspace!.id },
      select: { id: true },
    });
    if (!current) {
      res.status(404).json({ error: "Generated content was not found." });
      return;
    }
    const designs = await prisma.design.findMany({
      where: {
        workspaceId: req.workspace!.id,
        designJson: { path: "$.generatedContentId", equals: current.id },
      },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.design.deleteMany({ where: { id: { in: designs.map((design) => design.id) }, workspaceId: req.workspace!.id } }),
      prisma.generatedContent.delete({ where: { id: current.id } }),
    ]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export { router as contentRouter };
