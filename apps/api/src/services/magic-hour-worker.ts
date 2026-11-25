import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Prisma } from "@prisma/client";
import sharp from "sharp";
import { prisma } from "../db.js";
import {
  getMagicHourAudioProject,
  getMagicHourVideoProject,
  magicHourRequest,
  MagicHourError,
  uploadMagicHourAsset,
} from "./magic-hour.js";
import { createVideoThumbnail, resolveExecutable } from "./video-renderer.js";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputRoot = path.join(apiRoot, "assets", "rendered");
const execFileAsync = promisify(execFile);
let polling = false;

type Job = { id: string; workspaceId: string; brandId: string | null; inputJson: Prisma.JsonValue };
type Input = Prisma.JsonObject;

function object(value: Prisma.JsonValue): value is Input {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}
function str(input: Input, key: string, fallback = "") {
  return typeof input[key] === "string" ? input[key] as string : fallback;
}
function num(input: Input, key: string, fallback = 0) {
  return typeof input[key] === "number" ? input[key] as number : fallback;
}
function optionalNum(input: Input, key: string) {
  return typeof input[key] === "number" ? input[key] as number : undefined;
}
function accountSlot(input: Input) {
  return typeof input.magicHourAccountSlot === "number" && input.magicHourAccountSlot > 0 ? input.magicHourAccountSlot : 1;
}
function updateInput(input: Input, patch: Record<string, Prisma.InputJsonValue | null>) {
  return { ...input, ...patch } as Prisma.JsonObject;
}
function message(error: unknown) {
  if (error instanceof MagicHourError) {
    if (error.status === 402 || error.code.toLowerCase().includes("credit")) return "Magic Hour has insufficient credits for this generation. Add credits to the Magic Hour account, then retry.";
    return `Magic Hour could not generate this video: ${error.message}`.slice(0, 700);
  }
  return error instanceof Error ? `Magic Hour generation failed: ${error.message}`.slice(0, 700) : "Magic Hour generation failed. Please retry.";
}

async function sourceAsset(workspaceId: string, id: string, expected: "image/" | "video/") {
  const asset = await prisma.mediaAsset.findFirst({ where: { id, workspaceId }, select: { fileName: true, mimeType: true, fileData: true } });
  if (!asset || !asset.fileData || !asset.mimeType.startsWith(expected)) throw new Error("The selected source file is no longer available. Upload it again and retry.");
  return { bytes: Buffer.from(asset.fileData), fileName: asset.fileName, mimeType: asset.mimeType };
}
async function prepareImage(bytes: Buffer, aspectRatio: string) {
  const [width, height] = aspectRatio === "16:9" ? [854, 480] : aspectRatio === "1:1" ? [480, 480] : [480, 854];
  return sharp(bytes).rotate().resize(width, height, { fit: "contain", background: "#111827" }).png().toBuffer();
}
async function watermarkVideo(job: Job, videoPath: string) {
  if (!job.brandId) return;
  const kit = await prisma.brandKit.findUnique({ where: { brandId: job.brandId }, select: { logoUrl: true } });
  const assetId = kit?.logoUrl?.startsWith("media://") ? kit.logoUrl.slice("media://".length) : "";
  if (!assetId) return;
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, workspaceId: job.workspaceId, OR: [{ brandId: job.brandId }, { brandId: null }], mimeType: { in: ["image/jpeg", "image/png", "image/webp"] } },
    select: { fileData: true },
  });
  if (!asset?.fileData) return;
  const mark = await sharp(Buffer.from(asset.fileData)).rotate().resize(100, 60, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
  const badgePath = videoPath.replace(/\.mp4$/i, ".brand-mark.png");
  const outputPath = videoPath.replace(/\.mp4$/i, ".watermarked.mp4");
  await sharp({ create: { width: 120, height: 80, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.94 } } })
    .composite([{ input: mark, left: 10, top: 10 }]).png().toFile(badgePath);
  try {
    const ffmpeg = await resolveExecutable("ffmpeg");
    await execFileAsync(ffmpeg, ["-y", "-i", videoPath, "-i", badgePath, "-filter_complex", "[0:v][1:v]overlay=24:24", "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "copy", "-movflags", "+faststart", outputPath], { windowsHide: true, timeout: 240_000 });
    await rename(outputPath, videoPath);
  } finally {
    await Promise.all([unlink(badgePath).catch(() => undefined), unlink(outputPath).catch(() => undefined)]);
  }
}
function extension(fileName: string, fallback: string) {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return /^[a-z0-9]{2,5}$/.test(ext) ? ext : fallback;
}
async function setStage(jobId: string, input: Input, stage: string, progress: number, extra: Record<string, Prisma.InputJsonValue | null> = {}) {
  await prisma.videoRenderJob.updateMany({
    where: { id: jobId, status: "PROCESSING" },
    data: { inputJson: updateInput(input, { magicHourStage: stage, ...extra }), progress, heartbeatAt: new Date(), lockedAt: null },
  });
}

async function createSpeech(job: Job, input: Input) {
  const slot = accountSlot(input);
  const customVoice = str(input, "voiceMode") === "custom";
  let endpoint = "/ai-voice-generator";
  let body: Record<string, unknown>;
  if (customVoice) {
    const sampleId = str(input, "voiceSampleAssetId");
    const sample = await prisma.mediaAsset.findFirst({ where: { id: sampleId, workspaceId: job.workspaceId }, select: { fileName: true, mimeType: true, fileData: true } });
    if (!sample?.fileData || !["audio/mpeg", "audio/wav"].includes(sample.mimeType)) throw new Error("The custom voice sample is unavailable. Upload an MP3 or WAV sample and retry.");
    const isWav = sample.mimeType === "audio/wav";
    const samplePath = await uploadMagicHourAsset({ bytes: Buffer.from(sample.fileData), extension: isWav ? "wav" : "mp3", type: "audio", contentType: sample.mimeType, slot });
    endpoint = "/ai-voice-cloner";
    body = {
      name: `${str(input, "title", "Video")} custom voice`,
      assets: { audio_file_path: samplePath },
      style: { prompt: str(input, "script"), language: str(input, "language", "english") },
    };
  } else {
    body = {
      script: str(input, "script"),
      name: `${str(input, "title", "Video")} voice`,
      style: { prompt: str(input, "script"), voice_name: str(input, "voiceName"), language: str(input, "language", "english") },
    };
  }
  const response = await magicHourRequest<Record<string, unknown>>(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
  }, slot);
  const projectId = typeof response.id === "string" ? response.id : typeof response.project_id === "string" ? response.project_id : "";
  if (!projectId) throw new MagicHourError(502, "audio_project_missing", "Magic Hour did not return a voice project ID.");
  await setStage(job.id, input, "Generating voice", 8, { magicHourAudioProjectId: projectId });
}

async function submitVideo(job: Job, input: Input, audioFilePath?: string) {
  const slot = accountSlot(input);
  const type = str(input, "generationType");
  const title = str(input, "title", "Magic Hour video");
  const duration = num(input, "durationSeconds", 5);
  const prompt = str(input, "prompt");
  const resolution = str(input, "resolution", "480p");
  let response: Record<string, unknown>;
  const extra: Record<string, Prisma.InputJsonValue | null> = {};

  if (type === "product-image") {
    const file = await sourceAsset(job.workspaceId, str(input, "sourceAssetId"), "image/");
    const preparedImage = await prepareImage(file.bytes, str(input, "aspectRatio", "9:16"));
    const assetPath = await uploadMagicHourAsset({ bytes: preparedImage, extension: "png", type: "image", contentType: "image/png", slot });
    response = await magicHourRequest("/image-to-video", { method: "POST", body: JSON.stringify({
      name: title,
      end_seconds: duration,
      assets: { image_file_path: assetPath },
      style: { prompt },
      model: "ltx-2.5",
      resolution,
      audio: true,
    }) }, slot);
    extra.magicHourSourceFilePath = assetPath;
  } else if (type === "product-text") {
    response = await magicHourRequest("/text-to-video", { method: "POST", body: JSON.stringify({
      name: title,
      end_seconds: duration,
      aspect_ratio: str(input, "aspectRatio", "9:16"),
      resolution,
      model: "ltx-2.5",
      style: { prompt },
      audio: true,
    }) }, slot);
  } else {
    const audio = audioFilePath ?? str(input, "magicHourAudioFilePath");
    if (!audio) throw new Error("The voice track is not ready yet.");
    if (type === "talking-photo") {
      const file = await sourceAsset(job.workspaceId, str(input, "sourceAssetId"), "image/");
      const avatarImage = await prepareImage(file.bytes, str(input, "aspectRatio", "9:16"));
      const imagePath = await uploadMagicHourAsset({ bytes: avatarImage, extension: "png", type: "image", contentType: "image/png", slot });
      response = await magicHourRequest("/ai-talking-photo", { method: "POST", body: JSON.stringify({
        name: title,
        assets: { image_file_path: imagePath, audio_file_path: audio },
        start_seconds: 0,
        end_seconds: duration,
        style: {
          generation_mode: "realistic",
          prompt: str(input, "avatarStyle") === "animated"
            ? "A polished animated cartoon character performance inspired by the supplied portrait. Keep the character recognizable, friendly and professional, with smooth facial motion and clear synchronized speech."
            : "A natural, friendly, professional portrait performance. Maintain the speaker's identity with subtle head movement and expressive eyes; keep the upper-left corner visually calm.",
        },
        resolution: "480p",
      }) }, slot);
      extra.magicHourSourceFilePath = imagePath;
    } else {
      const file = await sourceAsset(job.workspaceId, str(input, "sourceVideoAssetId"), "video/");
      const videoPath = await uploadMagicHourAsset({ bytes: file.bytes, extension: extension(file.fileName, "mp4"), type: "video", contentType: file.mimeType, slot });
      response = await magicHourRequest("/lip-sync", { method: "POST", body: JSON.stringify({
        name: title,
        start_seconds: 0,
        end_seconds: duration,
        max_fps_limit: 12,
        assets: { video_file_path: videoPath, audio_file_path: audio, video_source: "file" },
        style: { generation_mode: str(input, "style", "realistic") === "realistic" ? "realistic" : "lite" },
      }) }, slot);
      extra.magicHourSourceFilePath = videoPath;
    }
  }
  const id = typeof response.id === "string" ? response.id : typeof response.project_id === "string" ? response.project_id : "";
  if (!id) throw new MagicHourError(502, "video_project_missing", "Magic Hour did not return a video project ID.");
  const charged = typeof response.credits_charged === "number" ? response.credits_charged : null;
  const credits = await prisma.videoRenderJob.findUnique({ where: { id: job.id }, select: { inputJson: true } });
  const latest = credits && object(credits.inputJson) ? credits.inputJson : input;
  await setStage(job.id, latest, "Rendering video", 12, { ...extra, magicHourProjectId: id, magicHourVideoCreditsCharged: charged });
}

async function downloadOutput(url: string, jobId: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error(`Could not download the completed video (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength < 1024) throw new Error("Magic Hour returned an empty video file.");
  await mkdir(outputRoot, { recursive: true });
  const fileName = `magic-hour-${jobId}.mp4`;
  const fullPath = path.join(outputRoot, fileName);
  await writeFile(fullPath, bytes);
  return { fullPath, key: fileName, size: bytes.byteLength };
}

async function ensureMagicHourAudioTrack(videoPath: string) {
  const ffmpeg = await resolveExecutable("ffmpeg");
  const ffprobe = await resolveExecutable("ffprobe");
  const { stdout: streamTypes } = await execFileAsync(ffprobe, [
    "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", videoPath,
  ], { windowsHide: true });
  if (streamTypes.split(/\r?\n/).some((value) => value.trim() === "audio")) return;

  const musicPath = path.join(apiRoot, "assets", "music", "calm-horizon.wav");
  const { stdout: durationText } = await execFileAsync(ffprobe, [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoPath,
  ], { windowsHide: true });
  const duration = Number.parseFloat(durationText.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not determine the Magic Hour video duration before adding its audio track.");

  const temporaryPath = videoPath.replace(/\.mp4$/i, ".with-audio.mp4");
  await execFileAsync(ffmpeg, [
    "-y",
    "-stream_loop", "-1", "-i", musicPath,
    "-i", videoPath,
    "-map", "1:v:0", "-map", "0:a:0",
    "-t", duration.toFixed(3),
    "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    temporaryPath,
  ], { windowsHide: true, timeout: 240_000 });
  await rename(temporaryPath, videoPath);
}

async function finish(job: Job, input: Input, project: Record<string, unknown>) {
  const downloads = project.downloads;
  const output = Array.isArray(downloads) ? downloads.find((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).url === "string") as Record<string, unknown> | undefined : undefined;
  const url = output?.url;
  if (typeof url !== "string") throw new Error("Magic Hour completed the project without a downloadable video URL.");
  const file = await downloadOutput(url, job.id);
  await ensureMagicHourAudioTrack(file.fullPath);
  await watermarkVideo(job, file.fullPath);
  file.size = (await stat(file.fullPath)).size;
  const thumbnailPath = file.fullPath.replace(/\.mp4$/i, ".jpg");
  await createVideoThumbnail(file.fullPath, thumbnailPath);
  const videoCredits = typeof project.credits_charged === "number" ? project.credits_charged : optionalNum(input, "magicHourVideoCreditsCharged");
  const voiceCredits = optionalNum(input, "magicHourVoiceCreditsCharged");
  const credits = videoCredits !== undefined && voiceCredits !== undefined ? videoCredits + voiceCredits : undefined;
  const duration = num(input, "durationSeconds", 5);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.videoRenderJob.updateMany({
      where: { id: job.id, status: "PROCESSING" },
      data: { status: "SUCCEEDED", progress: 100, outputKey: file.key, inputJson: updateInput(input, { magicHourStage: "Complete", magicHourCreditsCharged: credits ?? null, magicHourVideoCreditsCharged: videoCredits ?? null }), lockedAt: null, heartbeatAt: null, timeoutAt: null, error: null },
    });
    if (updated.count !== 1) throw new Error("This video job was canceled before completion.");
    await tx.mediaAsset.create({ data: {
      workspaceId: job.workspaceId, brandId: job.brandId, fileName: `${str(input, "title", "Magic Hour video")}.mp4`,
      storageKey: file.key, mimeType: "video/mp4", sizeBytes: BigInt(file.size), inGallery: true,
      metadata: { kind: "video", jobId: job.id, durationSeconds: duration, provider: "magic-hour", projectId: str(input, "magicHourProjectId"), ...(credits !== undefined ? { creditsCharged: credits } : {}) },
    } });
  });
}

async function process(job: Job) {
  if (!object(job.inputJson)) throw new Error("Magic Hour job input is invalid.");
  let input = job.inputJson;
  const slot = accountSlot(input);
  const type = str(input, "generationType");
  if (["talking-photo", "lip-sync"].includes(type) && !str(input, "magicHourProjectId")) {
    if (!str(input, "magicHourAudioProjectId")) {
      await createSpeech(job, input);
      return;
    }
    const audio = await getMagicHourAudioProject(str(input, "magicHourAudioProjectId"), slot);
    const status = String(audio.status ?? "").toLowerCase();
    if (status === "error" || status === "failed") throw new Error(typeof audio.error === "string" ? audio.error : "Magic Hour voice generation failed.");
    if (status !== "complete" && status !== "completed") {
      await setStage(job.id, input, "Generating voice", 8);
      return;
    }
    const downloads = audio.downloads;
    const item = Array.isArray(downloads) ? downloads.find((entry) => entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).url === "string") as Record<string, unknown> | undefined : undefined;
    if (typeof item?.url !== "string") throw new Error("Magic Hour completed voice generation without an audio URL.");
    const res = await fetch(item.url, { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) throw new Error("Could not download the generated voice track.");
    const bytes = Buffer.from(await res.arrayBuffer());
    const isWav = item.url.toLowerCase().includes(".wav");
    const audioPath = await uploadMagicHourAsset({ bytes, extension: isWav ? "wav" : "mp3", type: "audio", contentType: isWav ? "audio/wav" : "audio/mpeg", slot });
    input = updateInput(input, { magicHourAudioFilePath: audioPath, magicHourVoiceCreditsCharged: typeof audio.credits_charged === "number" ? audio.credits_charged : null });
    await setStage(job.id, input, "Starting avatar animation", 10);
    await submitVideo(job, input, audioPath);
    return;
  }
  const id = str(input, "magicHourProjectId");
  if (!id) {
    await submitVideo(job, input);
    return;
  }
  const project = await getMagicHourVideoProject(id, slot);
  const status = String(project.status ?? "").toLowerCase();
  if (status === "error" || status === "failed" || status === "canceled" || status === "cancelled") {
    throw new Error(typeof project.error === "string" ? project.error : `Magic Hour project ended with status ${status}.`);
  }
  if (status === "complete" || status === "completed") {
    await finish(job, input, project);
    return;
  }
  const progress = typeof project.progress === "number" ? Math.max(12, Math.min(94, project.progress)) : 25;
  await setStage(job.id, input, "Rendering video", progress);
}

export async function pollMagicHourJobs() {
  if (polling) return;
  polling = true;
  try {
    const rows = await prisma.videoRenderJob.findMany({ where: { status: "PROCESSING" }, orderBy: { updatedAt: "asc" }, take: 30, select: { id: true, workspaceId: true, brandId: true, inputJson: true, lockedAt: true, createdAt: true } });
    const jobs = rows.filter((row): row is typeof row & { inputJson: Prisma.JsonValue } => object(row.inputJson) && row.inputJson.provider === "magic-hour");
    for (const row of jobs) {
      if (Date.now() - row.createdAt.getTime() > 60 * 60 * 1000) {
        await prisma.videoRenderJob.updateMany({ where: { id: row.id, status: "PROCESSING" }, data: { status: "TIMED_OUT", progress: 0, error: "Magic Hour generation exceeded the 60-minute time limit. Retry with a shorter prompt or video, then try again.", lockedAt: null, heartbeatAt: null, timeoutAt: null } });
        continue;
      }
      const lock = await prisma.videoRenderJob.updateMany({ where: { id: row.id, status: "PROCESSING", lockedAt: null }, data: { lockedAt: new Date() } });
      if (lock.count !== 1) continue;
      const job: Job = { id: row.id, workspaceId: row.workspaceId, brandId: row.brandId, inputJson: row.inputJson };
      try { await process(job); }
      catch (error) {
        const current = await prisma.videoRenderJob.findUnique({ where: { id: row.id }, select: { status: true } });
        if (current?.status === "PROCESSING") await prisma.videoRenderJob.updateMany({ where: { id: row.id, status: "PROCESSING" }, data: { status: "FAILED", progress: 0, error: message(error), lockedAt: null, heartbeatAt: null, timeoutAt: null } });
      }
    }
  } finally { polling = false; }
}
