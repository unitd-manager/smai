import { makeCancelSignal } from "@remotion/renderer";
import { Prisma } from "@prisma/client";
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../db.js";
import { env } from "../env.js";
import {
  maxVideoRenderAttempts,
  staleVideoHeartbeatMs,
  videoHeartbeatIntervalMs,
  videoRenderFailureMessage,
  videoRenderTimeoutMs,
  videoRetryAt,
} from "./video-job-state.js";
import { isMusicStyle, renderVideo, type RenderVideoInput } from "./video-renderer.js";
import { resolvePiperVoice } from "./video-tts.js";
import { videoPlanSchema } from "./video-plan.js";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const videoWorkRoot = path.join(apiRoot, "assets", "video-work");
const videoAudioWorkRoot = path.join(apiRoot, "assets", "video-audio-work");
let workerRunning = false;

function isRenderInput(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

export async function recoverInterruptedVideoJobs(now = new Date()) {
  const staleBefore = new Date(now.getTime() - staleVideoHeartbeatMs);
  const interruptedJobs = await prisma.videoRenderJob.findMany({
    where: {
      status: "PROCESSING",
      OR: [
        { timeoutAt: { lte: now } },
        { heartbeatAt: { lt: staleBefore } },
        { heartbeatAt: null, lockedAt: { lt: staleBefore } },
      ],
    },
    select: { id: true, attempts: true, timeoutAt: true },
  });

  for (const job of interruptedJobs) {
    const timedOut = Boolean(job.timeoutAt && job.timeoutAt <= now);
    const terminal = job.attempts >= maxVideoRenderAttempts;
    await prisma.videoRenderJob.updateMany({
      where: { id: job.id, status: "PROCESSING" },
      data: {
        status: terminal ? "FAILED" : "QUEUED",
        lockedAt: null,
        heartbeatAt: null,
        timeoutAt: null,
        nextAttemptAt: terminal ? null : videoRetryAt(now, job.attempts),
        error: terminal
          ? "Video rendering could not finish after several attempts. Retry the render or contact support."
          : timedOut
            ? "Video rendering reached its time limit and is being retried automatically."
            : "The render worker stopped responding. The video is being retried automatically.",
      },
    });
  }
  await cleanupOrphanedVideoWorkDirectories();
}

async function cleanupOrphanedVideoWorkDirectories() {
  if (!existsSync(videoWorkRoot) && !existsSync(videoAudioWorkRoot)) return;
  const activeJobs = await prisma.videoRenderJob.findMany({
    where: { status: "PROCESSING" },
    select: { id: true },
  });
  const activeIds = new Set(activeJobs.map((job) => job.id));
  for (const root of [videoWorkRoot, videoAudioWorkRoot]) {
    if (!existsSync(root)) continue;
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !activeIds.has(entry.name)) {
        await rm(path.join(root, entry.name), { recursive: true, force: true });
      }
    }
  }
}

export async function renderQueuedVideos() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    await recoverInterruptedVideoJobs();
    const jobs = await prisma.videoRenderJob.findMany({
      where: {
        status: "QUEUED",
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      },
      orderBy: { createdAt: "asc" },
      take: 1,
      select: { id: true, workspaceId: true, brandId: true, inputJson: true, attempts: true },
    });
    for (const job of jobs) await processVideoJob(job);
  } finally {
    workerRunning = false;
  }
}

async function processVideoJob(job: {
  id: string;
  workspaceId: string;
  brandId: string | null;
  inputJson: Prisma.JsonValue;
  attempts: number;
}) {
  const now = new Date();
  const locked = await prisma.videoRenderJob.updateMany({
    where: {
      id: job.id,
      status: "QUEUED",
      lockedAt: null,
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    data: {
      status: "PROCESSING",
      lockedAt: now,
      heartbeatAt: now,
      timeoutAt: new Date(now.getTime() + videoRenderTimeoutMs),
      nextAttemptAt: null,
      attempts: { increment: 1 },
      progress: 1,
      error: null,
    },
  });
  if (locked.count === 0) return;

  if (isRenderInput(job.inputJson) && job.inputJson.provider === "magic-hour") {
    // Magic Hour jobs are advanced by its project poller, not the local renderer.
    await prisma.videoRenderJob.updateMany({
      where: { id: job.id, status: "PROCESSING" },
      data: { lockedAt: null, heartbeatAt: new Date(), timeoutAt: null },
    });
    return;
  }

  const attempt = job.attempts + 1;
  const remotionCancellation = makeCancelSignal();
  const abortController = new AbortController();
  let timedOut = false;
  let cancelled = false;
  let heartbeatInFlight = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    remotionCancellation.cancel();
    abortController.abort();
  }, videoRenderTimeoutMs);
  const heartbeat = setInterval(() => {
    if (heartbeatInFlight) return;
    heartbeatInFlight = true;
    void (async () => {
      const current = await prisma.videoRenderJob.findUnique({
        where: { id: job.id },
        select: { status: true, timeoutAt: true },
      });
      if (!current || current.status !== "PROCESSING") {
        cancelled = current?.status === "CANCELLED";
        remotionCancellation.cancel();
        abortController.abort();
        return;
      }
      if (current.timeoutAt && current.timeoutAt.getTime() <= Date.now()) {
        timedOut = true;
        remotionCancellation.cancel();
        abortController.abort();
        return;
      }
      await prisma.videoRenderJob.updateMany({
        where: { id: job.id, status: "PROCESSING" },
        data: { heartbeatAt: new Date() },
      });
    })().catch((error: unknown) => {
      console.error(`Could not update heartbeat for video job ${job.id}.`, error);
    }).finally(() => {
      heartbeatInFlight = false;
    });
  }, videoHeartbeatIntervalMs);

  let outputPath: string | undefined;
  try {
    if (!isRenderInput(job.inputJson)) throw new Error("Video render job has invalid input data.");
    const data = job.inputJson;
    const voice = resolvePiperVoice(data.voice);
    const voiceB = resolvePiperVoice(data.voiceB);
    const voiceC = resolvePiperVoice(data.voiceC);
    if (data.voice !== undefined && data.voice !== "" && !voice) {
      throw new Error("Video render job has an unsupported voice selection.");
    }
    if (data.voiceB !== undefined && data.voiceB !== "" && !voiceB) {
      throw new Error("Video render job has an unsupported second-character voice selection.");
    }
    if (data.voiceC !== undefined && data.voiceC !== "" && !voiceC) {
      throw new Error("Video render job has an unsupported third-character voice selection.");
    }
    if (data.musicStyle !== undefined && !isMusicStyle(data.musicStyle)) {
      throw new Error("Video render job has an unsupported music treatment.");
    }
    const input: RenderVideoInput = {
      jobId: job.id,
      workspaceId: job.workspaceId,
      title: requiredString(data, "title"),
      brandName: requiredString(data, "brandName"),
      callToAction: typeof data.callToAction === "string" ? data.callToAction : "",
      handle: typeof data.handle === "string" ? data.handle : null,
      colors: stringArray(data.colors),
      fonts: stringArray(data.fonts),
      logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : null,
      sourceScenes: data.sourceScenes,
      ...(videoPlanSchema.safeParse(data.scenePlan).success
        ? { scenePlan: videoPlanSchema.parse(data.scenePlan) }
        : {}),
      durationSeconds: typeof data.durationSeconds === "number" ? data.durationSeconds : 30,
      aspectRatio: data.aspectRatio === "square" || data.aspectRatio === "landscape" ? data.aspectRatio : "vertical",
      narration: data.narration === "text-only" || data.narration === "on-camera" ? data.narration : "voiceover",
      provider: data.provider === "piper" ? "piper" : "auto",
      voice: voice ?? "default",
      voiceB: voiceB ?? voice ?? "default",
      voiceC: voiceC ?? "man-friendly",
      avatarStyle: data.avatarStyle === "illustrated" ? "illustrated" : "3d",
      language: typeof data.language === "string" ? data.language : "en-US",
      musicId: typeof data.musicId === "string" ? data.musicId : null,
      musicStyle: isMusicStyle(data.musicStyle) ? data.musicStyle : "balanced",
      musicVolume: typeof data.musicVolume === "number" ? data.musicVolume : 0.12,
      musicDucking: typeof data.musicDucking === "number" ? data.musicDucking : 0.25,
      imageDirection: typeof data.imageDirection === "string" ? data.imageDirection : "",
      pexelsApiKey: env.PEXELS_API_KEY,
    };
    const result = await renderVideo(input, {
      cancelSignal: remotionCancellation.cancelSignal,
      signal: abortController.signal,
      updateProgress: async (progress) => {
        await prisma.videoRenderJob.updateMany({
          where: { id: job.id, status: "PROCESSING" },
            data: { progress: Math.max(1, Math.min(98, progress)), heartbeatAt: new Date() },
        });
      },
    });
    outputPath = result.outputPath;
    const outputKey = result.outputKey.replaceAll("\\", "/");
    const fileName = `${safeFileName(input.title)}.mp4`;
    await prisma.$transaction(async (tx) => {
      const completed = await tx.videoRenderJob.updateMany({
        where: { id: job.id, status: "PROCESSING" },
        data: { status: "SUCCEEDED", progress: 100, outputKey, lockedAt: null, heartbeatAt: null, timeoutAt: null, error: null },
      });
      if (completed.count !== 1) throw new Error("The video job was cancelled before it could finish.");
      await tx.mediaAsset.create({
        data: {
          workspaceId: job.workspaceId,
          brandId: job.brandId,
          fileName,
          storageKey: outputKey,
          mimeType: "video/mp4",
          sizeBytes: BigInt(result.sizeBytes),
          metadata: { kind: "video", jobId: job.id, durationSeconds: result.durationSeconds },
        },
      });
    });
  } catch (error) {
    const current = await prisma.videoRenderJob.findUnique({
      where: { id: job.id },
      select: { status: true },
    });
    if (outputPath && current?.status !== "SUCCEEDED") {
      await rm(outputPath, { force: true });
      await rm(outputPath.replace(/\.mp4$/i, ".jpg"), { force: true });
    }
    if (current?.status === "PROCESSING") {
      const retry = attempt < maxVideoRenderAttempts && !cancelled;
      const now = new Date();
      await prisma.videoRenderJob.updateMany({
        where: { id: job.id, status: "PROCESSING" },
        data: {
          status: retry ? "QUEUED" : timedOut ? "TIMED_OUT" : "FAILED",
          lockedAt: null,
          heartbeatAt: null,
          timeoutAt: null,
          nextAttemptAt: retry ? videoRetryAt(now, attempt) : null,
          error: retry
            ? timedOut
              ? "Video rendering reached its time limit and is being retried automatically."
              : "Video rendering hit a temporary problem and is being retried automatically."
            : timedOut
              ? "Video rendering exceeded its time limit after three attempts. Retry the render or contact support."
              : videoRenderFailureMessage(error),
        },
      });
      console.error(`Video render job ${job.id} failed on attempt ${attempt}.`, error);
    }
  } finally {
    clearTimeout(timeout);
    clearInterval(heartbeat);
  }
}

function requiredString(value: Prisma.JsonObject, key: string) {
  const item = value[key];
  if (typeof item !== "string" || !item.trim()) throw new Error(`Video job is missing ${key}.`);
  return item;
}

function stringArray(value: Prisma.JsonValue | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function safeFileName(value: string) {
  return value.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "rendered-video";
}
