import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { approvalEmailConfigured, env } from "../env.js";
import { isInstagramMediaHostingConfigured } from "./instagram.js";
import { createInstagramAutopilotSchedule } from "./instagram-autopilot-schedule.js";
import { getMagicHourVoices } from "./magic-hour.js";

export const autopilotFormatOptions = ["post", "carousel", "brochure", "video-product-demo", "video-avatar", "linkedin-banner", "facebook-cover"] as const;
type AutopilotFormat = typeof autopilotFormatOptions[number];
export type AutopilotSettings = { days: number; counts: Record<AutopilotFormat, number>; campaignGoal: string };
export const defaultInstagramAutopilotSettings: AutopilotSettings = {
  days: 7,
  counts: { post: 5, carousel: 2, brochure: 2, "video-product-demo": 1, "video-avatar": 1, "linkedin-banner": 1, "facebook-cover": 1 },
  campaignGoal: "",
};
const retryIntervalMs = 15 * 60 * 1000;
const renderPollIntervalMs = 30 * 1000;
const staleLockMs = 30 * 60 * 1000;
let workerRunning = false;

type BrandContext = {
  id: string;
  workspaceId: string;
  name: string;
  timezone: string;
  profile: {
    industry: string | null;
    description: string | null;
    products: string | null;
    offers: string | null;
    tone: string | null;
    goals: Prisma.JsonValue | null;
    audience: string | null;
    languages: Prisma.JsonValue | null;
  } | null;
};

function strings(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringMap(value: Prisma.JsonValue | null | undefined): Record<string, string> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => /^\d+$/.test(entry[0]) && typeof entry[1] === "string"));
}

function readSettings(value: Prisma.JsonValue | null | undefined): AutopilotSettings {
  if (!value || Array.isArray(value) || typeof value !== "object" || !("__settings" in value)) return defaultInstagramAutopilotSettings;
  const raw = value.__settings;
  if (!raw || Array.isArray(raw) || typeof raw !== "object") return defaultInstagramAutopilotSettings;
  const counts = { ...defaultInstagramAutopilotSettings.counts };
  for (const format of autopilotFormatOptions) {
    const count = raw.counts && !Array.isArray(raw.counts) && typeof raw.counts === "object" ? raw.counts[format] : undefined;
    if (typeof count === "number" && Number.isInteger(count) && count >= 0) counts[format] = count;
  }
  return {
    days: typeof raw.days === "number" && Number.isInteger(raw.days) ? raw.days : defaultInstagramAutopilotSettings.days,
    counts,
    campaignGoal: typeof raw.campaignGoal === "string" ? raw.campaignGoal.slice(0, 500) : "",
  };
}

function selectedFormats(settings: AutopilotSettings) {
  const remaining = { ...settings.counts };
  const formats: AutopilotFormat[] = [];
  while (formats.length < getAutopilotPostCount(settings)) {
    for (const format of autopilotFormatOptions) {
      if (remaining[format] > 0) {
        formats.push(format);
        remaining[format] -= 1;
      }
    }
  }
  return formats;
}

function contentIdsWithSettings(contentIds: Record<string, string>, settings: AutopilotSettings): Prisma.InputJsonObject {
  return { ...contentIds, __settings: settings as unknown as Prisma.InputJsonObject };
}

export function getAutopilotPostCount(settings: AutopilotSettings) {
  return Object.values(settings.counts).reduce((sum, count) => sum + count, 0);
}

async function internalRequest<T>(brand: BrandContext, userId: string, route: string, body: unknown): Promise<T> {
  const token = jwt.sign({}, env.JWT_ACCESS_SECRET, { subject: userId, expiresIn: "5m" });
  const response = await fetch(`http://127.0.0.1:${env.API_PORT}${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `pf_access=${token}`,
      "x-workspace-id": brand.workspaceId,
      "x-brand-id": brand.id,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Instagram Autopilot received an invalid response from ${route}.`, { cause: error });
  }
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return payload as T;
}

async function getAutomationUser(workspaceId: string) {
  const owner = await prisma.membership.findFirst({
    where: { workspaceId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!owner) throw new Error("This workspace needs an owner account before Instagram Autopilot can run.");
  return owner.userId;
}

async function verifyPrerequisites(brand: BrandContext, settings = defaultInstagramAutopilotSettings) {
  if (!approvalEmailConfigured) {
    throw new Error("Configure SMTP_HOST, SMTP_USER, and SMTP_PASSWORD, or set RESEND_API_KEY and EMAIL_FROM before enabling email approval.");
  }
  if (!isInstagramMediaHostingConfigured()) {
    throw new Error("Configure a public HTTPS API URL and social media encryption key for Instagram media hosting.");
  }
  const account = await prisma.socialAccount.findFirst({
    where: {
      workspaceId: brand.workspaceId,
      provider: "instagram",
      status: "CONNECTED",
      OR: [{ brandId: brand.id }, { brandId: null }],
    },
    select: { id: true },
  });
  if (!account) throw new Error("Connect an Instagram Professional account to this workspace before generating a publishing batch.");
  if (settings.counts["video-product-demo"] + settings.counts["video-avatar"] > 0) {
    if (!env.MAGIC_HOUR_API_KEY) throw new Error("Add MAGIC_HOUR_API_KEY to apps/api/.env before selecting Magic Hour video formats.");
    const images = await prisma.mediaAsset.count({ where: { workspaceId: brand.workspaceId, inGallery: true, mimeType: { startsWith: "image/" }, fileData: { not: null }, sizeBytes: { lte: BigInt(50 * 1024 * 1024) }, OR: [{ brandId: brand.id }, { brandId: null }] } });
    if (!images) throw new Error("Add at least one image to Gallery before selecting Magic Hour video formats.");
  }
}

async function generateStaticContent(brand: BrandContext, userId: string, runId: string, index: number, format: string, batchSize: number, campaignGoal: string) {
  const priorContent = await prisma.generatedContent.findMany({
    where: {
      workspaceId: brand.workspaceId,
      brandId: brand.id,
      automationKey: { startsWith: `instagram-autopilot:${runId}:content:` },
    },
    orderBy: { createdAt: "asc" },
    take: 12,
    select: { contentJson: true },
  });
  const priorAngles = priorContent.flatMap(({ contentJson }) => {
    if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) return [];
    const title = typeof contentJson.title === "string" ? contentJson.title : "";
    const idea = typeof contentJson.idea === "string" ? contentJson.idea : "";
    return title || idea ? [`${title}${title && idea ? ": " : ""}${idea}`.slice(0, 180)] : [];
  });
  const idea = [
    `Create one original Instagram ${format} for ${brand.name}. Industry: ${brand.profile?.industry || "not provided"}. Business description: ${brand.profile?.description || "not provided"}.`,
    `Use a distinct angle numbered ${index + 1} of ${batchSize}; avoid repeating the other posts in this batch.`,
    priorAngles.length ? `These posts already exist in this batch; choose a clearly different topic and opening: ${priorAngles.join(" | ")}.` : "",
    brand.profile?.audience ? `Target audience: ${brand.profile.audience}.` : "",
    brand.profile?.products ? `Products or services: ${brand.profile.products}.` : "",
    brand.profile?.offers ? `Current offers: ${brand.profile.offers}.` : "",
    brand.profile?.tone ? `Brand voice: ${brand.profile.tone}.` : "",
    campaignGoal ? `Campaign focus: ${campaignGoal}. Tie the post to this focus only when it fits the business and audience; do not invent offers or claims.` : "",
    strings(brand.profile?.goals).length ? `Business goals: ${strings(brand.profile?.goals).join(", ")}.` : "",
    "Create content for this business as a service provider, not as one of its customers. Keep every post tied to its listed industry, audience, and services; do not invent discounts, prices, client results, or offers.",
    format === "brochure" || format === "flyer"
      ? "Make the brochure or flyer explain this business's actual services to prospective clients with useful, specific sections and a clear inquiry call to action."
      : "For a promotion format without a listed current offer, create a service spotlight with no invented price, discount, deadline, or guarantee.",
  ].filter(Boolean).join(" ");
  const result = await internalRequest<{ items?: Array<{ id?: unknown }> }>(brand, userId, "/api/content/generate", {
    idea,
    formats: [format],
    platforms: ["Instagram"],
    language: strings(brand.profile?.languages)[0] ?? "English",
    useBrandProfile: true,
    carouselSlideCount: 6,
    automationKey: `instagram-autopilot:${runId}:content:${index}`,
  });
  const id = result.items?.[0]?.id;
  if (typeof id !== "string") throw new Error(`Content generation did not return the saved ${format} draft.`);
  return id;
}

async function generateMagicHourVideo(brand: BrandContext, userId: string, runId: string, index: number, format: "video-product-demo" | "video-avatar", campaignGoal: string) {
  const sources = await prisma.mediaAsset.findMany({
    where: {
      workspaceId: brand.workspaceId,
      mimeType: { startsWith: "image/" },
      fileData: { not: null },
      sizeBytes: { lte: BigInt(50 * 1024 * 1024) },
      OR: [{ brandId: brand.id }, { brandId: null }],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true },
  });
  if (!sources.length) throw new Error(`Add at least one image to Gallery before generating a Magic Hour ${format === "video-avatar" ? "avatar" : "product demonstration"} video.`);
  const voiceResponse = format === "video-avatar" ? await getMagicHourVoices() : null;
  const voices = voiceResponse && Array.isArray(voiceResponse.voices) ? voiceResponse.voices : [];
  const firstVoice = voices.find((voice) => voice && typeof voice === "object" && !Array.isArray(voice) && typeof (voice as Record<string, unknown>).id === "string") as Record<string, unknown> | undefined;
  if (format === "video-avatar" && typeof firstVoice?.id !== "string") throw new Error("Magic Hour did not return a voice for avatar narration. Check the Magic Hour voice setup and retry.");
  const avatar = format === "video-avatar";
  const title = avatar ? `${brand.name} Presenter` : `${brand.name} Product Demonstration`;
  const description = [brand.profile?.description, brand.profile?.industry && `Industry: ${brand.profile.industry}`, brand.profile?.audience && `Audience: ${brand.profile.audience}`, brand.profile?.products && `Products and services: ${brand.profile.products}`, brand.profile?.tone && `Brand voice: ${brand.profile.tone}`].filter(Boolean).join(". ");
  const script = [
    `Introduce ${brand.name} and explain one useful benefit of ${brand.profile?.products || brand.profile?.industry || "its services"}.`,
    brand.profile?.audience ? `Speak directly to ${brand.profile.audience}.` : "",
    brand.profile?.tone ? `Use this tone: ${brand.profile.tone}.` : "",
    campaignGoal ? `Campaign focus: ${campaignGoal}, if it is relevant to the business.` : "",
    brand.profile?.offers ? `Mention only this current offer: ${brand.profile.offers}.` : "Do not invent an offer, price, discount, result, or guarantee.",
    "End with a clear invitation to contact the business.",
  ].filter(Boolean).join(" ");
  const generated = await internalRequest<{ job?: { id?: unknown }; contentId?: unknown }>(brand, userId, "/api/videos/magic-hour/generate", {
    generationType: avatar ? "talking-photo" : "product-image",
    title: title.slice(0, 120),
    productName: brand.profile?.products ?? brand.name,
    description,
    style: "commercial",
    aspectRatio: "9:16",
    durationSeconds: 15,
    sourceAssetId: sources[index % sources.length]!.id,
    ...(avatar ? { script, voiceName: firstVoice!.id as string } : {}),
    language: strings(brand.profile?.languages)[0] ?? "English",
    automationKey: `instagram-autopilot:${runId}:content:${index}`,
  });
  if (typeof generated.contentId !== "string" || typeof generated.job?.id !== "string") throw new Error("Magic Hour did not return a saved video job.");
  return { contentId: generated.contentId, jobId: generated.job.id };
}

async function prepareAssets(run: {
  id: string;
  contentIds: Prisma.JsonValue | null;
  videoJobIds: Prisma.JsonValue | null;
  brand: BrandContext;
}, userId: string) {
  const settings = readSettings(run.contentIds);
  const formats = selectedFormats(settings);
  if (formats.length === 0) throw new Error("Choose at least one post format for this Autopilot run.");
  const contentIds = stringMap(run.contentIds);
  const videoJobIds = stringMap(run.videoJobIds);
  for (const [index, format] of formats.entries()) {
    const key = String(index);
    if (!contentIds[key]) {
      await prisma.instagramAutopilotRun.update({ where: { id: run.id }, data: { lockedAt: new Date() } });
      if (format === "video-product-demo" || format === "video-avatar") {
        const generated = await generateMagicHourVideo(run.brand, userId, run.id, index, format, settings.campaignGoal);
        contentIds[key] = generated.contentId;
        videoJobIds[key] = generated.jobId;
      } else {
        contentIds[key] = await generateStaticContent(run.brand, userId, run.id, index, format, formats.length, settings.campaignGoal);
      }
      await prisma.instagramAutopilotRun.update({
        where: { id: run.id },
        data: { contentIds: contentIdsWithSettings(contentIds, settings), videoJobIds: videoJobIds as Prisma.InputJsonObject, status: "GENERATING", lockedAt: new Date() },
      });
    }
  }
  await prisma.instagramAutopilotRun.update({
    where: { id: run.id },
    data: {
      contentIds: contentIdsWithSettings(contentIds, settings),
      videoJobIds: videoJobIds as Prisma.InputJsonObject,
      status: "WAITING_FOR_RENDER",
      nextAttemptAt: new Date(Date.now() + renderPollIntervalMs),
      lockedAt: null,
      error: null,
    },
  });
}

async function finalizeRun(run: {
  id: string;
  weekStart: Date;
  workspaceId: string;
  brandId: string;
  contentPlanId: string | null;
  contentIds: Prisma.JsonValue | null;
  videoJobIds: Prisma.JsonValue | null;
  brand: BrandContext;
}, userId: string) {
  const settings = readSettings(run.contentIds);
  const formats = selectedFormats(settings);
  const contentIds = stringMap(run.contentIds);
  const videoJobIds = stringMap(run.videoJobIds);
  const missingContent = Array.from({ length: formats.length }, (_, index) => String(index)).some((key) => !contentIds[key]);
  const videoKeys = formats.flatMap((format, index) => format === "video-product-demo" || format === "video-avatar" ? [String(index)] : []);
  if (missingContent) throw new Error("The generated batch is incomplete; the missing items will be retried automatically.");

  const videoIds = videoKeys.map((key) => videoJobIds[key]!);
  const jobs = await prisma.videoRenderJob.findMany({
    where: { id: { in: videoIds }, workspaceId: run.workspaceId, brandId: run.brandId },
    select: { id: true, contentId: true, status: true, error: true },
  });
  const matchingJobs = new Map(jobs.map((job) => [job.id, job]));
  const missingJobKeys = videoKeys.filter((key) => !matchingJobs.has(videoJobIds[key]!) || matchingJobs.get(videoJobIds[key]!)!.contentId !== contentIds[key]);
  if (missingJobKeys.length) throw new Error(`A Magic Hour render for item ${Number(missingJobKeys[0]) + 1} is unavailable.`);
  if (jobs.some((job) => job.status === "FAILED" || job.status === "CANCELLED")) {
    throw new Error(jobs.find((job) => job.status === "FAILED" || job.status === "CANCELLED")?.error ?? "A Reel could not be rendered.");
  }
  if (jobs.length !== videoKeys.length || jobs.some((job) => job.status !== "SUCCEEDED")) {
    await prisma.instagramAutopilotRun.update({
      where: { id: run.id },
      data: { status: "WAITING_FOR_RENDER", lockedAt: null, nextAttemptAt: new Date(Date.now() + renderPollIntervalMs), error: null },
    });
    return;
  }

  const slots = createInstagramAutopilotSchedule(new Date(), run.brand.timezone, formats.length, settings.days);
  const items = formats.map((format, index) => {
    const contentId = contentIds[String(index)];
    if (!contentId) throw new Error(`The generated batch is missing content item ${index + 1}.`);
    const videoJobId = videoJobIds[String(index)];
    if ((format === "video-product-demo" || format === "video-avatar") && !videoJobId) throw new Error(`The generated batch is missing Magic Hour render ${index + 1}.`);
    const platform = format === "linkedin-banner" ? "LinkedIn" : format === "facebook-cover" ? "Facebook" : "Instagram";
    return {
      contentId,
      format: format.startsWith("video-") ? "video" : format,
      ...(videoJobId ? { videoJobId } : {}),
      scheduledAt: slots[index]!.toISOString(),
      platforms: [platform],
    };
  });
  const startsAt = slots[0]!;
  const endsAt = slots[slots.length - 1]!;
  const planName = `Instagram Autopilot ${run.weekStart.toISOString().slice(0, 10)} ${run.id}`;
  let planId = run.contentPlanId;
  if (!planId) {
    const existing = await prisma.contentPlan.findFirst({
      where: { workspaceId: run.workspaceId, brandId: run.brandId, name: planName },
      select: { id: true, status: true },
    });
    if (existing) planId = existing.id;
    else {
      const profile = await prisma.companyProfile.findFirst({
        where: { workspaceId: run.workspaceId, brandId: run.brandId },
        select: { audience: true, goals: true },
      });
      const created = await internalRequest<{ plan?: { id?: unknown } }>(run.brand, userId, "/api/content-plans", {
        name: planName,
        goal: strings(profile?.goals)[0] ?? "Consistent Instagram growth and engagement",
        audience: profile?.audience ?? "",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        platforms: ["Instagram"],
        items,
      });
      if (typeof created.plan?.id !== "string") throw new Error("The weekly Instagram content plan was not saved.");
      planId = created.plan.id;
    }
    await prisma.instagramAutopilotRun.update({
      where: { id: run.id },
      data: { contentPlanId: planId },
    });
  }

  const plan = await prisma.contentPlan.findFirst({
    where: { id: planId, workspaceId: run.workspaceId },
    select: { status: true, planJson: true },
  });
  if (!plan) throw new Error("The saved weekly content plan is no longer available.");
  if (plan.status !== "IN_REVIEW" && plan.status !== "SCHEDULED") {
    const planJson = plan.planJson;
    if (planJson && typeof planJson === "object" && !Array.isArray(planJson) && Array.isArray(planJson.items)) {
      const items = planJson.items.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item) || item.format !== "video" || typeof item.contentId !== "string") return item;
        const key = videoKeys.find((candidate) => contentIds[candidate] === item.contentId);
        const videoJobId = key ? videoJobIds[key] : undefined;
        return videoJobId ? { ...item, videoJobId } : item;
      });
      await prisma.contentPlan.update({
        where: { id: planId },
        data: { planJson: { ...planJson, items } as Prisma.InputJsonObject },
      });
    }
    await internalRequest(run.brand, userId, `/api/content-plans/${encodeURIComponent(planId)}/execute`, { mode: "approval" });
  }
  await prisma.instagramAutopilotRun.update({
    where: { id: run.id },
    data: { status: "IN_REVIEW", lockedAt: null, nextAttemptAt: null, completedAt: new Date(), error: null },
  });
}

async function failRun(runId: string, brandId: string, attempts: number, error: unknown) {
  const message = error instanceof Error ? error.message : "Instagram Autopilot could not complete this batch.";
  const retryAt = attempts < 3 ? new Date(Date.now() + retryIntervalMs) : null;
  await prisma.instagramAutopilotRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      error: message,
      lockedAt: null,
      nextAttemptAt: retryAt,
    },
  });
  console.error("Instagram Autopilot batch failed.", { runId, brandId, attempt: attempts, message });
}

async function queueDueProfiles(now: Date) {
  const profiles = await prisma.companyProfile.findMany({
    where: {
      instagramAutopilotEnabled: true,
      OR: [{ instagramAutopilotNextRunAt: null }, { instagramAutopilotNextRunAt: { lte: now } }],
    },
    take: 10,
    select: {
      id: true,
      brandId: true,
      workspaceId: true,
      instagramAutopilotNextRunAt: true,
    },
  });
  for (const profile of profiles) {
    const weekStart = profile.instagramAutopilotNextRunAt ?? now;
    const previousRun = await prisma.instagramAutopilotRun.findFirst({
      where: { workspaceId: profile.workspaceId, brandId: profile.brandId },
      orderBy: { createdAt: "desc" },
      select: { contentIds: true },
    });
    const settings = previousRun ? readSettings(previousRun.contentIds) : defaultInstagramAutopilotSettings;
    const run = await prisma.instagramAutopilotRun.upsert({
      where: { brandId_weekStart: { brandId: profile.brandId, weekStart } },
      create: {
        workspaceId: profile.workspaceId,
        brandId: profile.brandId,
        weekStart,
        contentIds: contentIdsWithSettings({}, settings),
      },
      update: {},
      select: { id: true },
    });
    const advanced = await prisma.companyProfile.updateMany({
      where: {
        id: profile.id,
        instagramAutopilotEnabled: true,
        ...(profile.instagramAutopilotNextRunAt
          ? { instagramAutopilotNextRunAt: profile.instagramAutopilotNextRunAt }
          : { instagramAutopilotNextRunAt: null }),
      },
      data: { instagramAutopilotNextRunAt: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000) },
    });
    if (advanced.count === 0) continue;
    console.info("Instagram Autopilot queued a weekly batch.", { brandId: profile.brandId, runId: run.id });
  }
}

async function recoverStaleLocks(now: Date) {
  await prisma.instagramAutopilotRun.updateMany({
    where: { status: "GENERATING", lockedAt: { lt: new Date(now.getTime() - staleLockMs) } },
    data: { status: "QUEUED", lockedAt: null, nextAttemptAt: null },
  });
}

async function processDueRuns(now: Date) {
  const runs = await prisma.instagramAutopilotRun.findMany({
    where: {
      OR: [
        { status: "QUEUED", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { status: "WAITING_FOR_RENDER", nextAttemptAt: { lte: now } },
        { status: "FAILED", nextAttemptAt: { lte: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 5,
    include: {
      brand: {
        select: {
          id: true,
          workspaceId: true,
          name: true,
          timezone: true,
          profile: { select: { industry: true, description: true, products: true, offers: true, tone: true, goals: true, audience: true, languages: true } },
        },
      },
    },
  });
  for (const run of runs) {
    const lock = await prisma.instagramAutopilotRun.updateMany({
      where: {
        id: run.id,
        lockedAt: null,
        OR: [
          { status: "QUEUED", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
          { status: "WAITING_FOR_RENDER", nextAttemptAt: { lte: now } },
          { status: "FAILED", nextAttemptAt: { lte: now }, attempts: { lt: 3 } },
        ],
      },
      data: {
        status: "GENERATING",
        lockedAt: now,
        ...(run.status !== "WAITING_FOR_RENDER" ? { attempts: { increment: 1 } } : {}),
        nextAttemptAt: null,
      },
    });
    if (lock.count === 0) continue;
    const attempts = run.status === "WAITING_FOR_RENDER" ? run.attempts : run.attempts + 1;
    try {
      await verifyPrerequisites(run.brand, readSettings(run.contentIds));
      const userId = await getAutomationUser(run.workspaceId);
      if (run.status !== "WAITING_FOR_RENDER") {
        await prepareAssets(run, userId);
      } else {
        await finalizeRun(run, userId);
      }
      const latest = await prisma.instagramAutopilotRun.findUnique({
        where: { id: run.id },
        select: { status: true },
      });
      if (latest?.status === "WAITING_FOR_RENDER") continue;
      if (latest?.status === "GENERATING") {
        const refreshed = await prisma.instagramAutopilotRun.findUniqueOrThrow({
          where: { id: run.id },
          select: { id: true, weekStart: true, workspaceId: true, brandId: true, contentPlanId: true, contentIds: true, videoJobIds: true },
        });
        await finalizeRun({ ...refreshed, brand: run.brand }, userId);
      }
    } catch (error) {
      await failRun(run.id, run.brandId, attempts, error);
    }
  }
}

export async function runInstagramAutopilot(now = new Date()) {
  if (workerRunning) return;
  workerRunning = true;
  try {
    await recoverStaleLocks(now);
    await queueDueProfiles(now);
    await processDueRuns(now);
  } finally {
    workerRunning = false;
  }
}
