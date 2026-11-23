import { Router } from "express";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireCompleteBrandProfile, requireWritableWorkspace, requireWorkspace } from "../middleware/auth.js";
import { createVideoThumbnail, listMusicTracks, musicStyles, videoToolStatus } from "../services/video-renderer.js";
import { assertInstagramMediaHostingAvailable, isInstagramConfigured } from "../services/instagram.js";
import { resolvePiperVoice, ttsConfiguration } from "../services/video-tts.js";
import { getVideoJobStage } from "../services/video-job-state.js";
import { activeVideoPlanProvider, generateVideoPlan, videoConversationStyles, videoPlanSchema, VideoPlanGenerationError } from "../services/video-plan.js";
import { getBusinessContext, summarizeBusinessContext } from "../services/business-context.js";
import { VIDEO_SIZES } from "../video/types.js";
import { getAiGenerationLimit } from "../services/plan-limits.js";
import { env } from "../env.js";
import { deleteMagicHourAudioProject, deleteMagicHourVideoProject, getMagicHourAccount, getMagicHourVoices, magicHourAccounts, MagicHourError } from "../services/magic-hour.js";

const router = Router();
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function objectJson(value: Prisma.JsonValue): Prisma.JsonObject | null {
  return value !== null && !Array.isArray(value) && typeof value === "object" ? value : null;
}
const createSchema = z.object({
  contentId: z.string().trim().min(1),
  aspectRatio: z.enum(["vertical", "square", "landscape"]).default("vertical"),
  narration: z.enum(["voiceover", "on-camera", "text-only"]).default("voiceover"),
  provider: z.enum(["auto", "piper"]).default("auto"),
  voice: z.enum(["woman-warm", "woman-clear", "woman-gentle", "man-professional", "man-friendly", "default", "feminine", "masculine", "gentle", "professional", "energetic", "balanced", "warm", "bright", "calm"]).default("man-professional"),
  voiceB: z.enum(["woman-warm", "woman-clear", "woman-gentle", "man-professional", "man-friendly", "default"]).optional(),
  voiceC: z.enum(["woman-warm", "woman-clear", "woman-gentle", "man-professional", "man-friendly", "default"]).optional(),
  avatarStyle: z.enum(["3d", "illustrated"]).default("3d"),
  language: z.string().trim().min(2).max(40).default("en-US"),
  durationSeconds: z.number().int().min(15).max(300).optional(),
  musicId: z.string().trim().max(80).nullable().default(null),
  musicStyle: z.enum(["balanced", "warm", "bright", "calm", "cinematic"]).default("balanced"),
  musicVolume: z.number().min(0).max(1).default(0.12),
  musicDucking: z.number().min(0).max(1).default(0.25),
  sourceScenes: z.array(z.string().trim().min(1)).max(38).optional(),
  scenePlan: videoPlanSchema.optional(),
}).superRefine((value, context) => {
  if (value.durationSeconds !== undefined && value.scenePlan && value.scenePlan.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) !== value.durationSeconds) {
    context.addIssue({ code: "custom", path: ["scenePlan", "scenes"], message: "Scene durations must add up to the requested video length." });
  }
  if (value.scenePlan) {
    const ahaScenes = value.scenePlan.scenes.filter((scene) => scene.ahaMoment);
    if (ahaScenes.length !== 1) {
      context.addIssue({ code: "custom", path: ["scenePlan", "scenes"], message: "The video plan must contain exactly one aha-moment scene." });
    }
    value.scenePlan.scenes.forEach((scene, index) => {
      if (scene.narration.trim().split(/\s+/).length > scene.durationSeconds * 3.2) {
        context.addIssue({
          code: "custom",
          path: ["scenePlan", "scenes", index, "narration"],
          message: "Shorten this scene's narration so it fits the target time, then render again.",
        });
      }
    });
  }
});
const ideaToMp4Schema = z.object({
  idea: z.string().trim().min(10).max(2400),
  durationSeconds: z.number().int().min(60).max(300).multipleOf(60),
  language: z.string().trim().min(2).max(40),
  aspectRatio: z.enum(["vertical", "landscape"]),
  voice: z.enum(["woman-warm", "woman-clear", "woman-gentle", "man-professional", "man-friendly", "default"]),
  conversationStyle: z.enum(videoConversationStyles).default("story-driven"),
  castSize: z.union([z.literal(2), z.literal(3)]).default(2),
  automationKey: z.string().trim().min(1).max(191).optional(),
});
const editSchema = z.object({ sourceScenes: z.array(z.string().trim().min(1)).min(1).max(20) });
const magicHourGenerateSchema = z.object({
  generationType: z.enum(["product-image", "product-text", "talking-photo", "lip-sync"]),
  title: z.string().trim().min(2).max(120),
  productName: z.string().trim().max(120).optional(),
  description: z.string().trim().max(1800).optional(),
  promotion: z.string().trim().max(500).optional(),
  style: z.enum(["realistic", "cinematic", "animated", "commercial"]).default("commercial"),
  aspectRatio: z.enum(["9:16", "1:1", "16:9"]).default("9:16"),
  resolution: z.enum(["480p", "720p", "1080p"]).default("480p"),
  durationSeconds: z.number().int().min(3).max(60).default(5),
  sourceAssetId: z.string().trim().min(1).optional(),
  sourceVideoAssetId: z.string().trim().min(1).optional(),
  script: z.string().trim().max(4000).optional(),
  voiceName: z.string().trim().min(1).max(120).optional(),
  voiceMode: z.enum(["preset", "custom"]).default("preset"),
  avatarStyle: z.enum(["realistic", "animated"]).default("realistic"),
  voiceSampleAssetId: z.string().trim().min(1).optional(),
  language: z.string().trim().min(2).max(40).default("english"),
  automationKey: z.string().trim().min(1).max(191).optional(),
}).superRefine((value, context) => {
  if (["product-image", "talking-photo"].includes(value.generationType) && !value.sourceAssetId) {
    context.addIssue({ code: "custom", path: ["sourceAssetId"], message: "Upload or select an image for this video type." });
  }
  if (value.generationType === "lip-sync" && !value.sourceVideoAssetId) {
    context.addIssue({ code: "custom", path: ["sourceVideoAssetId"], message: "Upload a source video for lip sync." });
  }
  if (["talking-photo", "lip-sync"].includes(value.generationType) && !value.script) {
    context.addIssue({ code: "custom", path: ["script"], message: "Enter the script to generate the voice track." });
  }
  if (["talking-photo", "lip-sync"].includes(value.generationType) && value.voiceMode === "preset" && !value.voiceName) {
    context.addIssue({ code: "custom", path: ["voiceName"], message: "Choose a Magic Hour voice." });
  }
  if (value.generationType === "talking-photo" && value.voiceMode === "custom" && !value.voiceSampleAssetId) {
    context.addIssue({ code: "custom", path: ["voiceSampleAssetId"], message: "Upload an MP3 or WAV voice sample." });
  }
  if (value.generationType !== "talking-photo" && value.voiceMode === "custom") {
    context.addIssue({ code: "custom", path: ["voiceMode"], message: "Custom voice samples are currently available for Talking Photo." });
  }
});
const ratios = {
  vertical: VIDEO_SIZES.vertical,
  square: VIDEO_SIZES.square,
  landscape: VIDEO_SIZES.landscape,
};

router.use(requireAuth, requireWorkspace, requireCompleteBrandProfile);

router.get("/configuration", async (_req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const [tools, tracks] = await Promise.all([videoToolStatus(), listMusicTracks()]);
    res.json({
      tools,
      tts: ttsConfiguration(),
      scriptProvider: activeVideoPlanProvider().name,
      geminiConfigured: Boolean(env.GOOGLE_AI_STUDIO_API_KEY),
      groqConfigured: Boolean(env.GROQ_API_KEY),
      openaiConfigured: Boolean(env.OPENAI_API_KEY),
      activeWritingProvider: activeVideoPlanProvider().name,
      pexelsConfigured: Boolean(env.PEXELS_API_KEY),
      magicHourConfigured: magicHourAccounts().length > 0,
      formats: Object.entries(ratios).map(([id, size]) => ({ id, ...size })),
      musicStyles: musicStyles.map(({ id, label, description }) => ({ id, label, description })),
      music: tracks.map((track) => ({
        id: track.id,
        title: track.title,
        mood: track.mood,
        durationSeconds: track.durationSeconds,
        licenseNote: track.licenseNote,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/magic-hour/configuration", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const accounts = magicHourAccounts();
  if (!accounts.length) {
    res.json({ configured: false, credits: null, voices: [] });
    return;
  }
  try {
    const accountResults = await Promise.allSettled(accounts.map(async ({ slot }) => ({ slot, account: await getMagicHourAccount(slot) })));
    const availableAccounts = accountResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const accountStatuses = accountResults.map((result, index) => {
      const slot = accounts[index]!.slot;
      if (result.status === "fulfilled") {
        return {
          slot,
          credits: typeof result.value.account.credits === "number" ? result.value.account.credits : null,
          status: "available" as const,
        };
      }
      return {
        slot,
        credits: null,
        status: "unavailable" as const,
        error: result.reason instanceof MagicHourError
          ? `Magic Hour rejected this account (${result.reason.status}: ${result.reason.code}).`
          : "Could not retrieve this account's balance.",
      };
    });
    const preferredAccount = availableAccounts.find(({ account }) => typeof account.credits === "number" && account.credits > 0) ?? availableAccounts[0];
    const voicesResult = preferredAccount
      ? await Promise.allSettled([getMagicHourVoices(preferredAccount.slot)])
      : [];
    const voiceResponse = voicesResult[0]?.status === "fulfilled" ? voicesResult[0].value : null;
    const voices = voiceResponse && Array.isArray(voiceResponse.voices) ? voiceResponse.voices.flatMap((voice) => {
      if (!voice || typeof voice !== "object" || Array.isArray(voice)) return [];
      const item = voice as Record<string, unknown>;
      return typeof item.id === "string" && typeof item.name === "string"
        ? [{ id: item.id, name: item.name, avatarUrl: typeof item.avatar_url === "string" ? item.avatar_url : null, previewUrl: typeof item.preview_url === "string" ? item.preview_url : null }]
        : [];
    }) : [];
    res.json({
      configured: true,
      credits: availableAccounts.reduce<number | null>((total, { account }) => typeof account.credits === "number" ? (total ?? 0) + account.credits : total, null),
      accounts: accountStatuses,
      voices,
      ...(voicesResult.length === 0 || voicesResult[0]?.status === "rejected" ? { voicesUnavailable: true } : {}),
    });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 502;
    const message = error instanceof Error ? error.message : "Magic Hour is temporarily unavailable.";
    res.status(status >= 400 && status < 500 ? status : 502).json({ error: message });
  }
});

router.post("/magic-hour/generate", requireWritableWorkspace, async (req, res, next) => {
  try {
    if (!magicHourAccounts().length) {
      res.status(503).json({ error: "Magic Hour is not configured. Add MAGIC_HOUR_API_KEY to apps/api/.env and restart the API." });
      return;
    }
    const input = magicHourGenerateSchema.parse(req.body);
    const brandId = req.header("x-brand-id");
    const brand = await prisma.brand.findFirst({
      where: { workspaceId: req.workspace!.id, ...(brandId ? { id: brandId } : {}) },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, profile: { select: { industry: true, description: true, products: true, audience: true, offers: true } } },
    });
    if (!brand) {
      res.status(404).json({ error: "Create a brand profile before generating a Magic Hour video." });
      return;
    }
    if (input.automationKey) {
      const existing = await prisma.generatedContent.findFirst({
        where: { automationKey: input.automationKey, workspaceId: req.workspace!.id, brandId: brand.id },
        select: { id: true },
      });
      if (existing) {
        const job = await prisma.videoRenderJob.findFirst({ where: { contentId: existing.id, workspaceId: req.workspace!.id }, select: { id: true, status: true, progress: true, createdAt: true } });
        if (job) {
          res.status(202).json({ job, contentId: existing.id, credits: null, reused: true });
          return;
        }
      }
    }
    const [usage, accountResults] = await Promise.all([
      prisma.generatedContent.count({ where: { workspaceId: req.workspace!.id, provider: { not: "duplicate" }, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
      Promise.allSettled(magicHourAccounts().map(async ({ slot }) => ({ slot, account: await getMagicHourAccount(slot) }))),
    ]);
    const availableAccounts = accountResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (!availableAccounts.length) throw accountResults[0]?.status === "rejected" ? accountResults[0].reason : new Error("Magic Hour account status is unavailable.");
    const selectedAccount = availableAccounts.find(({ account }) => typeof account.credits !== "number" || account.credits > 0) ?? availableAccounts[0]!;
    const account = selectedAccount.account;
    const limit = getAiGenerationLimit(req.workspace!.subscriptionPlan, req.workspace!.subscriptionStatus, req.workspace!.trialEndsAt);
    if (limit !== null && usage >= limit) {
      res.status(403).json({ error: `This workspace has reached its ${limit} monthly generation limit.`, code: "GENERATION_LIMIT_REACHED" });
      return;
    }
    if (typeof account.credits === "number" && account.credits <= 0) {
      res.status(402).json({ error: "The Magic Hour account has no credits available. Add credits in Magic Hour, then retry.", code: "INSUFFICIENT_CREDITS", credits: account.credits });
      return;
    }
    const sourceAssetId = input.sourceAssetId ?? input.sourceVideoAssetId;
    if (sourceAssetId) {
      const source = await prisma.mediaAsset.findFirst({
        where: { id: sourceAssetId, workspaceId: req.workspace!.id },
        select: { id: true, mimeType: true, sizeBytes: true, fileData: true },
      });
      const expectedType = input.generationType === "lip-sync" ? "video/" : "image/";
      if (!source || !source.mimeType.startsWith(expectedType)) {
        res.status(400).json({ error: input.generationType === "lip-sync" ? "Choose an MP4 video from this workspace." : "Choose an image from this workspace." });
        return;
      }
      if (!source.fileData || source.sizeBytes > BigInt(50 * 1024 * 1024)) {
        res.status(413).json({ error: "This asset is stored in large-file storage and cannot be sent to Magic Hour from this workspace. Re-upload a file smaller than 50 MB." });
        return;
      }
    }
    if (input.voiceSampleAssetId) {
      const sample = await prisma.mediaAsset.findFirst({
        where: { id: input.voiceSampleAssetId, workspaceId: req.workspace!.id },
        select: { mimeType: true, sizeBytes: true, fileData: true },
      });
      if (!sample || !["audio/mpeg", "audio/wav"].includes(sample.mimeType)) {
        res.status(400).json({ error: "Choose an MP3 or WAV voice sample from this workspace." });
        return;
      }
      if (!sample.fileData || sample.sizeBytes > BigInt(20 * 1024 * 1024)) {
        res.status(413).json({ error: "The voice sample must be stored in this workspace and smaller than 20 MB." });
        return;
      }
    }
    const prompt = input.generationType.startsWith("product-")
      ? [
          `Create a polished ${input.style} product advertisement for ${input.productName || input.title}.`,
          input.description,
          input.promotion ? `Promotional message: ${input.promotion}` : "",
          brand.profile?.description,
          brand.profile?.industry,
          brand.profile?.audience ? `Target audience: ${brand.profile.audience}` : "",
          brand.profile?.offers,
          "Show the actual product clearly, with realistic materials, attractive commercial lighting, and deliberate camera movement. Do not invent labels, claims, logos, or text; leave the upper-left corner visually calm for a brand mark.",
        ].filter(Boolean).join(" ").slice(0, 1800)
      : input.generationType === "talking-photo"
        ? "A natural, friendly, professional portrait performance. Keep the speaker's identity and appearance consistent; subtle head movement, expressive eyes, clear synchronized speech."
        : input.generationType === "lip-sync"
          ? input.style === "realistic" ? "realistic" : "lite"
          : [input.description, input.promotion, brand.profile?.description, brand.profile?.industry].filter(Boolean).join(" ").slice(0, 1800);
    const contentJson: Prisma.InputJsonObject = {
      format: "video",
      title: input.title,
      caption: input.script ?? [input.productName, input.description, input.promotion].filter(Boolean).join(" — "),
      hashtags: [],
      idea: prompt,
      pillar: "Magic Hour video",
      firstComment: input.promotion ?? "",
      platformCaptions: [],
      scenes: input.script ? [input.script] : [prompt],
      videoBrief: { durationSeconds: input.durationSeconds, language: input.language, aspectRatio: input.aspectRatio, imageDirection: prompt },
    };
    const created = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Workspace WHERE id = ${req.workspace!.id} FOR UPDATE`;
      const currentUsage = await tx.generatedContent.count({ where: { workspaceId: req.workspace!.id, provider: { not: "duplicate" }, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } });
      if (limit !== null && currentUsage >= limit) return null;
      const content = await tx.generatedContent.create({
        data: { workspaceId: req.workspace!.id, resellerId: req.workspace!.resellerId, brandId: brand.id, request: prompt, provider: "magic-hour", model: input.generationType, ...(input.automationKey ? { automationKey: input.automationKey } : {}), contentJson },
        select: { id: true },
      });
      const job = await tx.videoRenderJob.create({
        data: {
          workspaceId: req.workspace!.id,
          brandId: brand.id,
          contentId: content.id,
          inGallery: true,
          inputJson: {
            provider: "magic-hour",
            generationType: input.generationType,
            title: input.title,
            brandName: brand.name,
            prompt,
            productName: input.productName ?? "",
            description: input.description ?? "",
            promotion: input.promotion ?? "",
            style: input.style,
            aspectRatio: input.aspectRatio,
            resolution: input.resolution,
            durationSeconds: input.durationSeconds,
            sourceAssetId: input.sourceAssetId ?? null,
            sourceVideoAssetId: input.sourceVideoAssetId ?? null,
            script: input.script ?? "",
            voiceName: input.voiceName ?? "",
            voiceMode: input.voiceMode,
            voiceSampleAssetId: input.voiceSampleAssetId ?? null,
            language: input.language,
            magicHourCreditsAtQueue: typeof account.credits === "number" ? account.credits : null,
            magicHourAccountSlot: selectedAccount.slot,
            magicHourCreditsCharged: 0,
            magicHourStage: "Queued for Magic Hour",
          } as Prisma.InputJsonObject,
        },
        select: { id: true, status: true, progress: true, createdAt: true },
      });
      return { content, job };
    });
    if (!created) {
      res.status(403).json({ error: `This workspace has reached its ${limit} monthly generation limit.`, code: "GENERATION_LIMIT_REACHED" });
      return;
    }
    res.status(202).json({ job: created.job, contentId: created.content.id, credits: typeof account.credits === "number" ? account.credits : null });
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
      const status = error.status;
      const message = error instanceof Error ? error.message : "Magic Hour rejected the request.";
      const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
      res.status(status >= 400 && status < 500 ? status : 502).json({ error: message, ...(code ? { code } : {}) });
      return;
    }
    next(error);
  }
});

router.get("/publishing-readiness", async (req, res, next) => {
  try {
    const account = await prisma.socialAccount.findFirst({
      where: { workspaceId: req.workspace!.id, provider: "instagram", status: "CONNECTED" },
      orderBy: { createdAt: "asc" },
      select: { displayName: true, tokenExpiresAt: true },
    });
    if (!account) {
      res.json({
        ready: false,
        platform: "Instagram",
        accountName: null,
        connectionAction: "connect",
        message: "Connect an Instagram Professional account before publishing this video.",
      });
      return;
    }
    if (!isInstagramConfigured()) {
      res.json({ ready: false, platform: "Instagram", accountName: account.displayName, message: "Instagram publishing credentials are not configured on this server." });
      return;
    }
    if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() <= Date.now()) {
      res.json({
        ready: false,
        platform: "Instagram",
        accountName: account.displayName,
        connectionAction: "reconnect",
        message: "The Instagram connection has expired. Reconnect the account before publishing.",
      });
      return;
    }
    try {
      await assertInstagramMediaHostingAvailable();
    } catch (error) {
      console.error("Video publishing readiness check failed.", error);
      res.json({
        ready: false,
        platform: "Instagram",
        accountName: account.displayName,
        message: error instanceof Error
          ? error.message
          : "Public video hosting could not be verified. Check the API's public HTTPS URL and retry.",
      });
      return;
    }
    res.json({
      ready: true,
      platform: "Instagram",
      accountName: account.displayName,
      message: "Instagram account and public video hosting are ready. Instagram still confirms the final post when you publish.",
    });
  } catch (error) {
    next(error);
  }
});

router.get("/music/:trackId", async (req, res, next) => {
  try {
    const trackId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,80}$/i).parse(req.params.trackId);
    const track = (await listMusicTracks()).find((item) => item.id === trackId);
    if (!track) {
      res.status(404).json({ error: "Music track not found." });
      return;
    }
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.type(track.file);
    res.sendFile(track.file, (error) => { if (error) next(error); });
  } catch (error) {
    next(error);
  }
});

router.post("/idea-to-mp4/plan", requireWritableWorkspace, async (req, res, next) => {
  try {
    const input = ideaToMp4Schema.parse(req.body);
    const brandId = req.header("x-brand-id");
    const brand = await prisma.brand.findFirst({
      where: { workspaceId: req.workspace!.id, ...(brandId ? { id: brandId } : {}) },
      select: {
        id: true,
        name: true,
        profile: { select: { industry: true, description: true, products: true, audience: true, offers: true, tone: true } },
        kit: { select: { logoUrl: true, colors: true } },
      },
    });
    if (!brand) {
      res.status(404).json({ error: "No brand profile exists in this workspace." });
      return;
    }
    if (input.automationKey) {
      const existing = await prisma.generatedContent.findFirst({
        where: { automationKey: input.automationKey, workspaceId: req.workspace!.id, brandId: brand.id },
        select: { id: true, contentJson: true, provider: true, createdAt: true },
      });
      if (existing) {
        res.json({ item: { ...existing, brand: { name: brand.name } }, provider: existing.provider });
        return;
      }
    }

    const [usage, account] = await Promise.all([
      prisma.generatedContent.count({
        where: { workspaceId: req.workspace!.id, provider: { not: "duplicate" }, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
      }),
      prisma.socialAccount.findFirst({
        where: { workspaceId: req.workspace!.id, status: "CONNECTED", ...(brandId ? { brandId } : {}) },
        orderBy: { createdAt: "asc" },
        select: { displayName: true },
      }),
    ]);
    const limit = getAiGenerationLimit(
      req.workspace!.subscriptionPlan,
      req.workspace!.subscriptionStatus,
      req.workspace!.trialEndsAt,
    );
    if (limit !== null && usage >= limit) {
      res.status(403).json({ error: `This workspace has reached its ${limit} monthly generation limit.`, code: "GENERATION_LIMIT_REACHED" });
      return;
    }

    const colors = Array.isArray(brand.kit?.colors)
      ? brand.kit.colors.filter((color): color is string => typeof color === "string" && /^#[\da-f]{3,8}$/i.test(color))
      : [];
    const { provider, plan: videoPlan } = await generateVideoPlan({
      idea: input.idea,
      businessContext: summarizeBusinessContext(await getBusinessContext(req.workspace!.id, brand.id, input.idea)),
      durationSeconds: input.durationSeconds,
      language: input.language,
      conversationStyle: input.conversationStyle,
      castSize: input.castSize,
      brand: {
        name: brand.name,
        industry: brand.profile?.industry,
        description: brand.profile?.description,
        products: brand.profile?.products,
        audience: brand.profile?.audience,
        offers: brand.profile?.offers,
        tone: brand.profile?.tone,
        colors,
        logoUrl: brand.kit?.logoUrl ?? null,
        handle: account?.displayName ?? null,
      },
    });
    const scenes = videoPlan.scenes.map((scene) => scene.narration);
    const content = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Workspace WHERE id = ${req.workspace!.id} FOR UPDATE`;
      const currentUsage = await tx.generatedContent.count({
        where: { workspaceId: req.workspace!.id, provider: { not: "duplicate" }, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
      });
      if (limit !== null && currentUsage >= limit) return null;
      return tx.generatedContent.create({
        data: {
          workspaceId: req.workspace!.id,
          resellerId: req.workspace!.resellerId,
          brandId: brand.id,
          ...(input.automationKey ? { automationKey: input.automationKey } : {}),
          request: input.idea,
          provider: provider.name,
          model: provider.model,
          contentJson: {
            format: "video",
            title: videoPlan.title,
            caption: videoPlan.story,
            hashtags: account?.displayName ? [account.displayName] : [],
            idea: input.idea,
            pillar: videoPlan.industry,
            firstComment: videoPlan.callToAction,
            platformCaptions: [],
            scenes,
            videoPlan,
            videoBrief: {
              durationSeconds: input.durationSeconds,
              language: input.language,
              aspectRatio: input.aspectRatio,
              voice: input.voice,
              imageDirection: input.idea,
            },
          },
        },
        select: { id: true, contentJson: true, provider: true, createdAt: true },
      });
    });
    if (!content) {
      if (limit === null) throw new Error("Unrestricted trial video generation was incorrectly limited.");
      res.status(403).json({ error: `This workspace has reached its ${limit} monthly generation limit.`, code: "GENERATION_LIMIT_REACHED" });
      return;
    }
    res.status(201).json({
      item: { ...content, brand: { name: brand.name } },
      provider: provider.name,
    });
  } catch (error) {
    if (error instanceof VideoPlanGenerationError) {
      console.error("Idea to MP4 plan generation failed.", { status: error.status, provider: activeVideoPlanProvider().name });
      res.status(error.status === 429 || error.status === 503 ? error.status : 502).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.post("/render", requireWritableWorkspace, async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const content = await prisma.generatedContent.findFirst({
      where: { id: input.contentId, workspaceId: req.workspace!.id },
      select: {
        id: true,
        brandId: true,
        contentJson: true,
        brand: {
          select: {
            name: true,
            kit: { select: { logoUrl: true, colors: true, fonts: true } },
          },
        },
      },
    });
    if (!content || !content.contentJson || typeof content.contentJson !== "object" || Array.isArray(content.contentJson)) {
      res.status(404).json({ error: "Generated video script was not found in this workspace." });
      return;
    }
    const contentJson = content.contentJson as Prisma.JsonObject;
    if (contentJson.format !== "video") {
      res.status(400).json({ error: "Only a generated video script can be rendered." });
      return;
    }
    const existingJob = await prisma.videoRenderJob.findFirst({
      where: {
        workspaceId: req.workspace!.id,
        contentId: content.id,
        status: { in: ["QUEUED", "PROCESSING", "SUCCEEDED"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, progress: true, createdAt: true },
    });
    if (existingJob) {
      res.status(existingJob.status === "SUCCEEDED" ? 200 : 202).json({ job: existingJob });
      return;
    }
    const title = typeof contentJson.title === "string" ? contentJson.title : content.brand.name;
    const storedPlan = videoPlanSchema.safeParse(contentJson.videoPlan);
    const scenePlan = input.scenePlan ?? (storedPlan.success ? storedPlan.data : undefined);
    const scenes = input.sourceScenes ?? scenePlan?.scenes.map((scene) => scene.narration) ?? (Array.isArray(contentJson.scenes)
      ? contentJson.scenes.filter((scene): scene is string => typeof scene === "string")
      : []);
    if (scenes.length === 0) {
      res.status(400).json({ error: "Add at least one scene to render this video." });
      return;
    }
    const videoBrief = contentJson.videoBrief && typeof contentJson.videoBrief === "object" && !Array.isArray(contentJson.videoBrief)
      ? contentJson.videoBrief as Prisma.JsonObject
      : {};
    const colors = Array.isArray(content.brand.kit?.colors)
      ? content.brand.kit.colors.filter((color): color is string => typeof color === "string" && /^#[\da-f]{6}$/i.test(color))
      : [];
    const hashtagValues = Array.isArray(contentJson.hashtags)
      ? contentJson.hashtags.filter((tag): tag is string => typeof tag === "string")
      : [];
    const fonts = Array.isArray(content.brand.kit?.fonts)
      ? content.brand.kit.fonts.filter((font): font is string => typeof font === "string")
      : [];
    const job = await prisma.videoRenderJob.create({
      data: {
        workspaceId: req.workspace!.id,
        brandId: content.brandId,
        contentId: content.id,
        inputJson: {
          title,
          brandName: content.brand.name,
          caption: typeof contentJson.caption === "string" ? contentJson.caption : "",
          hashtags: hashtagValues,
          callToAction: scenePlan?.callToAction ?? "",
          handle: hashtagValues[0] ?? null,
          colors,
          fonts,
          logoUrl: content.brand.kit?.logoUrl ?? null,
          sourceScenes: scenes,
          ...(scenePlan ? { scenePlan } : {}),
          durationSeconds: input.durationSeconds ?? (typeof videoBrief.durationSeconds === "number" ? videoBrief.durationSeconds : 30),
          aspectRatio: input.aspectRatio,
          narration: input.narration,
          provider: input.provider,
          voice: resolvePiperVoice(input.voice) ?? (input.voice === "default" ? "default" : "man-professional"),
          voiceB: resolvePiperVoice(input.voiceB) ?? (input.voiceB === "default" ? "default" : resolvePiperVoice(input.voice) ?? "default"),
          voiceC: resolvePiperVoice(input.voiceC) ?? (input.voiceC === "default" ? "default" : "man-friendly"),
          avatarStyle: input.avatarStyle,
          language: input.language,
          musicId: input.musicId,
          musicStyle: input.musicStyle,
          musicVolume: input.musicVolume,
          musicDucking: input.musicDucking,
          imageDirection: typeof videoBrief.imageDirection === "string" ? videoBrief.imageDirection : "",
        },
      },
      select: { id: true, status: true, progress: true, createdAt: true },
    });
    res.status(202).json({ job });
  } catch (error) {
    next(error);
  }
});

router.get("/jobs", async (req, res, next) => {
  try {
    const library = z.enum(["media", "gallery"]).optional().parse(req.query.library);
    const jobs = await prisma.videoRenderJob.findMany({
      where: { workspaceId: req.workspace!.id, ...(library ? { inGallery: library === "gallery" } : {}) },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, contentId: true, status: true, progress: true, outputKey: true, error: true, inputJson: true, createdAt: true, updatedAt: true },
    });
    res.json({ jobs: jobs.map(({ outputKey, ...job }) => ({
      ...job,
      stage: job.inputJson && typeof job.inputJson === "object" && !Array.isArray(job.inputJson) && job.inputJson.provider === "magic-hour" && typeof job.inputJson.magicHourStage === "string"
        ? job.inputJson.magicHourStage
        : getVideoJobStage(job.status, job.progress),
      magicHourCreditsCharged: job.inputJson && typeof job.inputJson === "object" && !Array.isArray(job.inputJson) && typeof job.inputJson.magicHourCreditsCharged === "number"
        ? job.inputJson.magicHourCreditsCharged
        : null,
      videoUrl: outputKey && job.status === "SUCCEEDED" ? `/api/videos/jobs/${job.id}/file` : null,
      thumbnailUrl: outputKey && job.status === "SUCCEEDED" ? `/api/videos/jobs/${job.id}/thumbnail` : null,
    })) });
  } catch (error) {
    next(error);
  }
});

router.get("/jobs/:id/events", async (req, res, next) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const job = await prisma.videoRenderJob.findFirst({
      where: { id, workspaceId: req.workspace!.id },
      select: { id: true, status: true, progress: true, error: true, inputJson: true },
    });
    if (!job) {
      res.status(404).json({ error: "Video render job not found." });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const sendUpdate = (status: string, progress: number, error: string | null, inputJson: Prisma.JsonValue) => {
      const stage = objectJson(inputJson)?.provider === "magic-hour" && typeof objectJson(inputJson)?.magicHourStage === "string"
        ? objectJson(inputJson)?.magicHourStage
        : getVideoJobStage(status, progress);
      res.write(`data: ${JSON.stringify({ status, progress, stage, error })}\n\n`);
    };
    sendUpdate(job.status, job.progress, job.error, job.inputJson);
    if (job.status !== "QUEUED" && job.status !== "PROCESSING") {
      res.end();
      return;
    }

    let polling = false;
    const interval = setInterval(() => {
      if (polling) return;
      polling = true;
      void prisma.videoRenderJob.findFirst({
        where: { id, workspaceId: req.workspace!.id },
        select: { status: true, progress: true, error: true, inputJson: true },
      }).then((current) => {
        if (!current) {
          res.end();
          return;
        }
        sendUpdate(current.status, current.progress, current.error, current.inputJson);
        if (current.status !== "QUEUED" && current.status !== "PROCESSING") res.end();
      }).catch((error: unknown) => {
        console.error(`Could not stream progress for video job ${id}.`, error);
        res.end();
      }).finally(() => {
        polling = false;
      });
    }, 2_000);
    res.on("close", () => clearInterval(interval));
  } catch (error) {
    next(error);
  }
});

router.patch("/jobs/:id", requireWritableWorkspace, async (req, res, next) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const input = editSchema.parse(req.body);
    const job = await prisma.videoRenderJob.findFirst({ where: { id, workspaceId: req.workspace!.id } });
    if (!job) {
      res.status(404).json({ error: "Video render job not found." });
      return;
    }
    if (job.status === "PROCESSING") {
      res.status(409).json({ error: "This video is currently rendering and cannot be edited." });
      return;
    }
    const currentInput = job.inputJson as Prisma.JsonObject;
    const updated = await prisma.videoRenderJob.create({
      data: {
        workspaceId: job.workspaceId,
        brandId: job.brandId,
        contentId: job.contentId,
        inputJson: { ...currentInput, sourceScenes: input.sourceScenes },
      },
      select: { id: true, status: true, progress: true, createdAt: true },
    });
    res.status(202).json({ job: updated });
  } catch (error) {
    next(error);
  }
});

router.post("/jobs/:id/cancel", requireWritableWorkspace, async (req, res, next) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const beforeCancel = await prisma.videoRenderJob.findFirst({ where: { id, workspaceId: req.workspace!.id }, select: { inputJson: true } });
    const cancelled = await prisma.videoRenderJob.updateMany({
      where: {
        id,
        workspaceId: req.workspace!.id,
        status: { in: ["QUEUED", "PROCESSING"] },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        lockedAt: null,
        heartbeatAt: null,
        timeoutAt: null,
        nextAttemptAt: null,
        error: "Rendering was cancelled.",
      },
    });
    if (cancelled.count === 0) {
      const exists = await prisma.videoRenderJob.findFirst({
        where: { id, workspaceId: req.workspace!.id },
        select: { id: true },
      });
      if (!exists) {
        res.status(404).json({ error: "Video render job not found." });
        return;
      }
      res.status(409).json({ error: "This video is no longer queued or rendering." });
      return;
    }
    const input = beforeCancel ? objectJson(beforeCancel.inputJson) : null;
    if (input?.provider === "magic-hour") {
      try {
        const slot = typeof input.magicHourAccountSlot === "number" ? input.magicHourAccountSlot : 1;
        if (typeof input.magicHourProjectId === "string") await deleteMagicHourVideoProject(input.magicHourProjectId, slot);
        else if (typeof input.magicHourAudioProjectId === "string") await deleteMagicHourAudioProject(input.magicHourAudioProjectId, slot);
      } catch (error) {
        console.warn(`Could not cancel Magic Hour project for video job ${id}.`, error instanceof Error ? error.message : "provider cancellation failed");
      }
    }
    res.json({ status: "CANCELLED" });
  } catch (error) {
    next(error);
  }
});

router.delete("/jobs/:id", requireWritableWorkspace, async (req, res, next) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const job = await prisma.videoRenderJob.findFirst({
      where: { id, workspaceId: req.workspace!.id },
      select: { id: true, status: true, outputKey: true },
    });
    if (!job) {
      res.status(404).json({ error: "Video render job not found." });
      return;
    }
    if (job.status === "QUEUED" || job.status === "PROCESSING") {
      res.status(409).json({ error: "A queued or rendering video cannot be deleted yet." });
      return;
    }
    if (job.outputKey) {
      const targets = await prisma.postTarget.findMany({
        where: { workspaceId: req.workspace!.id },
        select: { media: true },
      });
      const isUsedByPost = targets.some(({ media }) =>
        Array.isArray(media) && media.some((item) =>
          item !== null && typeof item === "object" && !Array.isArray(item) &&
          "storageKey" in item && item.storageKey === job.outputKey,
        ),
      );
      if (isUsedByPost) {
        res.status(409).json({ error: "This video is attached to a post. Remove it from Posts and Queue before deleting the video." });
        return;
      }
    }

    const outputRoot = path.resolve(apiRoot, "assets", "rendered");
    const outputPath = job.outputKey ? path.resolve(outputRoot, job.outputKey) : undefined;
    if (outputPath && !outputPath.startsWith(`${outputRoot}${path.sep}`)) {
      res.status(400).json({ error: "The saved video path is invalid." });
      return;
    }
    if (outputPath) await rm(outputPath, { force: true });
    if (outputPath) await rm(outputPath.replace(/\.mp4$/i, ".jpg"), { force: true });
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.videoRenderJob.deleteMany({
        where: { id, workspaceId: req.workspace!.id, status: { in: ["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"] } },
      });
      if (deleted.count !== 1) throw new Error("The video job changed before it could be deleted.");
      await tx.mediaAsset.deleteMany({
        where: { workspaceId: req.workspace!.id, metadata: { path: "$.jobId", equals: id } },
      });
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post("/jobs/:id/regenerate", requireWritableWorkspace, async (req, res, next) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const source = await prisma.videoRenderJob.findFirst({
      where: { id, workspaceId: req.workspace!.id },
      select: { workspaceId: true, brandId: true, contentId: true, inputJson: true },
    });
    if (!source) {
      res.status(404).json({ error: "Video render job not found." });
      return;
    }
    const job = await prisma.videoRenderJob.create({
      data: {
        workspaceId: source.workspaceId,
        brandId: source.brandId,
        contentId: source.contentId,
        inputJson: source.inputJson as Prisma.InputJsonValue,
      },
      select: { id: true, status: true, progress: true, createdAt: true },
    });
    res.status(202).json({ job });
  } catch (error) {
    next(error);
  }
});

router.get("/jobs/:id/file", async (req, res, next) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const job = await prisma.videoRenderJob.findFirst({
      where: { id, workspaceId: req.workspace!.id, status: "SUCCEEDED" },
      select: { outputKey: true, inputJson: true },
    });
    if (!job?.outputKey) {
      res.status(404).json({ error: "The rendered video is not available." });
      return;
    }
    const root = path.resolve(apiRoot, "assets", "rendered");
    const file = path.resolve(root, job.outputKey);
    if (!file.startsWith(`${root}${path.sep}`)) {
      res.status(400).json({ error: "The saved video path is invalid." });
      return;
    }
    res.type("video/mp4");
    const input = job.inputJson as Prisma.JsonObject;
    const title = typeof input.title === "string" ? input.title.replace(/[^\w.-]+/g, "-").slice(0, 80) : `video-${id}`;
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Content-Disposition", `${req.query.download === "true" ? "attachment" : "inline"}; filename="${title}.mp4"`);
    res.sendFile(file, (error) => { if (error) next(error); });
  } catch (error) {
    next(error);
  }
});

router.get("/jobs/:id/thumbnail", async (req, res, next) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const job = await prisma.videoRenderJob.findFirst({
      where: { id, workspaceId: req.workspace!.id, status: "SUCCEEDED" },
      select: { outputKey: true },
    });
    if (!job?.outputKey) {
      res.status(404).json({ error: "The video thumbnail is not available." });
      return;
    }
    const root = path.resolve(apiRoot, "assets", "rendered");
    const videoFile = path.resolve(root, job.outputKey);
    if (!videoFile.startsWith(`${root}${path.sep}`)) {
      res.status(400).json({ error: "The saved video path is invalid." });
      return;
    }
    const thumbnailFile = videoFile.replace(/\.mp4$/i, ".jpg");
    if (!existsSync(thumbnailFile)) await createVideoThumbnail(videoFile, thumbnailFile);
    res.type("image/jpeg");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.sendFile(thumbnailFile, (error) => { if (error) next(error); });
  } catch (error) {
    next(error);
  }
});

export { router as videosRouter };
