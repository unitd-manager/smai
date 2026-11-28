import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, type CancelSignal } from "@remotion/renderer";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { designDocumentVersion, type DesignDocument } from "@united-technologies/shared/design-document";
import type { VideoCompositionProps, VideoScene } from "../video/types.js";
import { getTargetSceneDurations, getVideoSceneTimeline, VIDEO_SIZES } from "../video/types.js";
import { buildDialogueTimeline, getDialogueGapSeconds } from "../video/dialogue-timing.js";
import { parseSilenceDurations, validateVideoAudioQuality } from "../video/video-audio-quality.js";
import { env } from "../env.js";
import { selectTtsProvider, type PiperVoiceSelection } from "./video-tts.js";
import { type VideoPlan } from "./video-plan.js";
import { prisma } from "../db.js";

const execFileAsync = promisify(execFile);
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const workRoot = path.join(apiRoot, "assets", "video-work");
const audioWorkRoot = path.join(apiRoot, "assets", "video-audio-work");
const outputRoot = path.join(apiRoot, "assets", "rendered");
const musicManifestPath = path.join(apiRoot, "assets", "music", "manifest.json");
const allowedMusicExtensions = new Set([".wav", ".mp3", ".m4a", ".aac", ".ogg"]);

export type MusicTrack = { id: string; title: string; mood: string; durationSeconds: number; licenseNote: string; file: string };
export const musicStyles = [
  { id: "balanced", label: "Balanced", description: "Original mix", filter: "anull" },
  { id: "warm", label: "Warm", description: "Soft low-end emphasis", filter: "equalizer=f=180:t=q:w=1:g=2,lowpass=f=9000" },
  { id: "bright", label: "Bright", description: "Crisp high-end emphasis", filter: "highpass=f=45,equalizer=f=3500:t=q:w=1:g=2" },
  { id: "calm", label: "Calm", description: "Smooth, mellow mix", filter: "lowpass=f=6500,equalizer=f=280:t=q:w=1:g=1" },
  { id: "cinematic", label: "Cinematic", description: "Wide, dramatic tone", filter: "equalizer=f=120:t=q:w=1:g=2,equalizer=f=1200:t=q:w=1:g=-1,equalizer=f=7000:t=q:w=1:g=2" },
] as const;
export type MusicStyle = typeof musicStyles[number]["id"];

export function isMusicStyle(value: unknown): value is MusicStyle {
  return musicStyles.some((style) => style.id === value);
}

export function createMagicHourAudioFilterGraph(input: {
  hasSourceAudio: boolean;
  hasVoiceover: boolean;
  hasMusic: boolean;
  totalDurationSeconds: number;
  voiceoverDurationSeconds?: number;
  musicVolume: number;
  musicDucking: number;
  musicStyle: MusicStyle;
}) {
  if (!Number.isFinite(input.totalDurationSeconds) || input.totalDurationSeconds <= 0) {
    throw new Error("Video duration must be a positive finite number.");
  }
  if (!isMusicStyle(input.musicStyle)) throw new Error("The selected music treatment is not available.");

  const duration = input.totalDurationSeconds.toFixed(3);
  const filters: string[] = [];
  const hasBaseAudio = input.hasVoiceover || input.hasSourceAudio;
  if (input.hasVoiceover) {
    filters.push(`[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad=whole_dur=${duration},atrim=duration=${duration},asetpts=PTS-STARTPTS[base]`);
  } else if (input.hasSourceAudio) {
    filters.push(`[0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad=whole_dur=${duration},atrim=duration=${duration},asetpts=PTS-STARTPTS[base]`);
  }

  if (input.hasMusic) {
    const musicInputIndex = input.hasVoiceover ? 2 : 1;
    const volume = Math.max(0, Math.min(1, input.musicVolume));
    const ducking = Math.max(0, Math.min(1, input.musicDucking));
    const duckDuration = input.hasVoiceover
      ? Math.min(input.totalDurationSeconds, Math.max(0, input.voiceoverDurationSeconds ?? input.totalDurationSeconds))
      : input.hasSourceAudio ? input.totalDurationSeconds : 0;
    const voiceVolume = hasBaseAudio ? `if(lt(t,${duckDuration.toFixed(3)}),${ducking},1)` : "1";
    const treatment = musicStyles.find((style) => style.id === input.musicStyle)!.filter;
    filters.push(`[${musicInputIndex}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,${treatment},volume='${volume}*${voiceVolume}',atrim=duration=${duration},asetpts=PTS-STARTPTS[music]`);
  }

  if (hasBaseAudio && input.hasMusic) {
    filters.push("[base][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]");
  } else if (hasBaseAudio) {
    filters.push("[base]anull[aout]");
  } else if (input.hasMusic) {
    filters.push("[music]anull[aout]");
  }
  return filters.join(";");
}

export async function createVideoThumbnail(videoPath: string, thumbnailPath: string, signal?: AbortSignal) {
  const ffmpegPath = await resolveExecutable("ffmpeg");
  await execFileAsync(ffmpegPath, [
    "-ss", "0.5", "-i", videoPath, "-frames:v", "1", "-q:v", "3", "-y", thumbnailPath,
  ], { windowsHide: true, signal });
}

export function createVideoDesignDocument(input: {
  id: string;
  title: string;
  callToAction?: string;
  handle?: string | null;
  brandName: string;
  colors: string[];
  fontFamily: string;
  logoFile?: string;
  scenes: VideoScene[];
  width: number;
  height: number;
}): DesignDocument {
  const validColors = input.colors.filter((color) => /^#[0-9a-f]{3,8}$/i.test(color));
  const colors = validColors.length ? validColors : ["#253746", "#C6A477", "#F8F5F0"];
  const pages: DesignDocument["pages"] = input.scenes.map((scene, index) => {
    const accent = colors[index % colors.length]!;
    const background = scene.visualKind === "image" && scene.visualFile
      ? { type: "image" as const, src: `/${scene.visualFile}`, fit: "cover" as const, opacity: 0.8 }
      : { type: "gradient" as const, angle: 145, stops: [{ color: colors[(index + 2) % colors.length]!, offset: 0 }, { color: colors[(index + 1) % colors.length]!, offset: 1 }] };
    const fontSize = Math.round(Math.min(input.width, input.height) * 0.074);
    return {
      id: `${input.id}-scene-${index + 1}`,
      name: `Scene ${index + 1}`,
      role: "content",
      width: input.width,
      height: input.height,
      background: scene.visualKind === "video" ? { type: "color", color: "transparent" } : background,
      layers: [
        { id: "scene-shade", type: "shape", shape: "rectangle", x: 0, y: 0, width: input.width, height: input.height, fill: "#0a121a", opacity: 0.48 },
        { id: "scene-accent", type: "shape", shape: "rounded-rectangle", x: input.width * 0.08, y: input.height * 0.11, width: input.width * 0.17, height: Math.max(8, input.height * 0.006), fill: accent },
        { id: "scene-caption", type: "text", x: input.width * 0.08, y: input.height * 0.16, width: input.width * 0.84, height: input.height * 0.1, text: `${String(index + 1).padStart(2, "0")} · ${scene.caption}`, fontFamily: input.fontFamily, fontSize: Math.round(fontSize * 0.38), fontWeight: 700, color: accent, letterSpacing: 2 },
        { id: "scene-headline", type: "text", x: input.width * 0.08, y: input.height * 0.31, width: input.width * 0.84, height: input.height * 0.39, text: scene.text, fontFamily: input.fontFamily, fontSize, fontWeight: 700, color: "#ffffff", lineHeight: 1.08, effects: [{ type: "shadow", color: "#000000", blur: 8, offsetY: 3 }] },
        { id: "scene-subtitle", type: "text", x: input.width * 0.08, y: input.height * 0.82, width: input.width * 0.84, height: input.height * 0.1, text: scene.caption, fontFamily: input.fontFamily, fontSize: Math.round(fontSize * 0.38), fontWeight: 500, color: "#ffffff", align: "center" },
      ],
    };
  });
  pages.push({
    id: `${input.id}-end-card`,
    name: "Brand end card",
    role: "closing",
    width: input.width,
    height: input.height,
    background: { type: "gradient", angle: 140, stops: [{ color: colors[0]!, offset: 0 }, { color: colors[1] ?? colors[0]!, offset: 1 }] },
    layers: [
      ...(input.logoFile ? [{
        id: "brand-logo",
        type: "image" as const,
        src: `/${input.logoFile}`,
        fit: "contain" as const,
        x: input.width * 0.26,
        y: input.height * 0.25,
        width: input.width * 0.48,
        height: input.height * 0.2,
      }] : []),
      { id: "brand-name", type: "text", x: input.width * 0.1, y: input.height * 0.52, width: input.width * 0.8, height: input.height * 0.1, text: input.brandName, fontFamily: input.fontFamily, fontSize: Math.round(Math.min(input.width, input.height) * 0.055), fontWeight: 700, color: "#ffffff", align: "center" },
      { id: "video-title", type: "text", x: input.width * 0.1, y: input.height * 0.66, width: input.width * 0.8, height: input.height * 0.2, text: input.title, fontFamily: input.fontFamily, fontSize: Math.round(Math.min(input.width, input.height) * 0.05), fontWeight: 600, color: "#ffffff", align: "center" },
      ...(input.callToAction ? [{ id: "video-cta", type: "text" as const, x: input.width * 0.1, y: input.height * 0.78, width: input.width * 0.8, height: input.height * 0.08, text: input.callToAction, fontFamily: input.fontFamily, fontSize: Math.round(Math.min(input.width, input.height) * 0.032), fontWeight: 600, color: "#ffffff", align: "center" as const }] : []),
      ...(input.handle ? [{ id: "video-handle", type: "text" as const, x: input.width * 0.1, y: input.height * 0.88, width: input.width * 0.8, height: input.height * 0.06, text: input.handle, fontFamily: input.fontFamily, fontSize: Math.round(Math.min(input.width, input.height) * 0.026), fontWeight: 500, color: "#ffffff", align: "center" as const }] : []),
    ],
  });
  return {
    version: designDocumentVersion,
    id: `video-${input.id}`,
    title: input.title,
    palette: colors,
    pages,
  };
}

export function resolveRemotionBundleDirectory(bundleOutput: string, expectedOutput: string) {
  if (!path.isAbsolute(bundleOutput) || /^https?:\/\//i.test(bundleOutput)) {
    throw new Error("Remotion bundling must return a local absolute bundle directory, not a web URL.");
  }
  const resolvedOutput = path.resolve(bundleOutput);
  if (resolvedOutput.toLowerCase() !== path.resolve(expectedOutput).toLowerCase()) {
    throw new Error("Remotion returned a bundle directory different from the requested render bundle output.");
  }
  return resolvedOutput;
}

export function createAudioFilterGraph(
  sceneDurations: number[],
  hasMusic: boolean,
  musicVolume: number,
  musicDucking: number,
  totalDuration: number,
  musicStyle: MusicStyle = "balanced",
  audioSpeedFactors: number[] = [],
) {
  const filters: string[] = [];
  const voiceDuration = sceneDurations.reduce((sum, duration) => sum + duration, 0);
  sceneDurations.forEach((duration, index) => {
    const speed = audioSpeedFactors[index] ?? 1;
    const speedFilter = getAtempoFilter(speed);
    filters.push(
      `[${index + 1}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,` +
      `${speedFilter}apad=whole_dur=${duration},atrim=duration=${duration},asetpts=PTS-STARTPTS[voice${index}]`,
    );
  });
  if (sceneDurations.length > 0) {
    filters.push(`${sceneDurations.map((_, index) => `[voice${index}]`).join("")}concat=n=${sceneDurations.length}:v=0:a=1[voice]`);
  }

  function getAtempoFilter(speed: number) {
    if (!Number.isFinite(speed) || speed <= 0) {
      throw new Error("Audio speed must be a positive finite number.");
    }
    if (speed <= 1) return "";
    const filters: string[] = [];
    let remaining = speed;
    while (remaining > 2) {
      filters.push("atempo=2.000");
      remaining /= 2;
    }
    if (remaining > 1.001) filters.push(`atempo=${remaining.toFixed(3)}`);
    return filters.length ? `${filters.join(",")},` : "";
  }

  const musicInputIndex = sceneDurations.length + 1;
  if (hasMusic) {
    const volume = Math.max(0, Math.min(1, musicVolume));
    const ducking = Math.max(0, Math.min(1, musicDucking));
    const voiceVolume = sceneDurations.length > 0 ? `if(lt(t,${voiceDuration.toFixed(3)}),${ducking},1)` : "1";
    const musicTreatment = musicStyles.find((style) => style.id === musicStyle)!.filter;
    filters.push(
      `[${musicInputIndex}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,` +
      `${musicTreatment},volume='${volume}*${voiceVolume}',atrim=duration=${totalDuration.toFixed(3)},asetpts=PTS-STARTPTS[music]`,
    );
  }

  if (sceneDurations.length > 0 && hasMusic) {
    filters.push(`[voice]apad=whole_dur=${totalDuration.toFixed(3)},atrim=duration=${totalDuration.toFixed(3)}[voicepad]`);
    filters.push("[voicepad][music]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]");
  } else if (sceneDurations.length > 0) {
    filters.push(`[voice]apad=whole_dur=${totalDuration.toFixed(3)},atrim=duration=${totalDuration.toFixed(3)}[aout]`);
  } else if (hasMusic) {
    filters.push("[music]anull[aout]");
  }

  return filters.join(";");
}

export async function resolveExecutable(name: string) {
  const configuredPath = name === "ffmpeg" ? env.FFMPEG_PATH : name === "ffprobe" ? env.FFPROBE_PATH : undefined;
  if (configuredPath) {
    if (!existsSync(configuredPath)) throw new Error(`${name} was not found at the configured path: ${configuredPath}`);
    return path.resolve(configuredPath);
  }
  const command = process.platform === "win32" ? "where.exe" : "which";
  try {
    const { stdout } = await execFileAsync(command, [name], { windowsHide: true });
    const executable = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (executable) return path.resolve(executable);
  } catch {
    // Replace platform-specific "where.exe" output with actionable setup guidance.
  }
  throw new Error(`${name} is not available on PATH. Install free FFmpeg (winget install Gyan.FFmpeg), restart the API, or set ${name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"} to its full executable path in apps/api/.env.`);
}

export async function videoToolStatus() {
  try {
    const ffmpegPath = await resolveExecutable("ffmpeg");
    const ffprobePath = await resolveExecutable("ffprobe");
    await execFileAsync(ffmpegPath, ["-version"], { windowsHide: true });
    await execFileAsync(ffprobePath, ["-version"], { windowsHide: true });
    return { ffmpeg: true, ffprobe: true, message: "" };
  } catch (error) {
    return {
      ffmpeg: false,
      ffprobe: false,
      message: error instanceof Error ? error.message : "FFmpeg/FFprobe is unavailable.",
    };
  }
}

export function getRemotionBrowserExecutablePath(platform = process.platform, arch = process.arch, cwd = process.cwd()) {
  const packageRoot = findNearestPackageRoot(cwd);
  const platformFolder = platform === "win32"
    ? "win64"
    : platform === "darwin"
      ? arch === "arm64" ? "mac-arm64" : "mac-x64"
      : platform === "linux"
        ? arch === "arm64" ? "linux-arm64" : "linux64"
        : null;
  if (!platformFolder) throw new Error(`Remotion does not support Chromium checks on ${platform}.`);
  const executableName = platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell";
  return path.join(packageRoot, "node_modules", ".remotion", "chrome-headless-shell", platformFolder, executableName);
}

function findNearestPackageRoot(cwd: string) {
  let directory = path.resolve(cwd);
  for (;;) {
    if (existsSync(path.join(directory, "package.json"))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error("Could not locate a package root for the Remotion browser cache.");
    directory = parent;
  }
}

export async function remotionBrowserStatus() {
  try {
    const executable = getRemotionBrowserExecutablePath();
    await execFileAsync(executable, ["--version"], { windowsHide: true, timeout: 8_000 });
    return { available: true, message: "Remotion's local Chrome Headless Shell is ready." };
  } catch {
    return {
      available: false,
      message: "Remotion's Chrome Headless Shell is not cached yet. The first render downloads it; check network access if that download fails.",
    };
  }
}

export async function listMusicTracks(): Promise<MusicTrack[]> {
  const parsed = JSON.parse(await readFile(musicManifestPath, "utf8")) as { tracks?: unknown };
  if (!Array.isArray(parsed.tracks)) throw new Error("Music manifest must contain a tracks array.");
  return parsed.tracks.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new Error("Music manifest contains an invalid entry.");
    const track = candidate as Record<string, unknown>;
    if (typeof track.id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,80}$/i.test(track.id) ||
      typeof track.title !== "string" || typeof track.mood !== "string" ||
      typeof track.durationSeconds !== "number" || !Number.isFinite(track.durationSeconds) ||
      typeof track.licenseNote !== "string" || typeof track.file !== "string") {
      throw new Error("Each music entry needs id, title, mood, durationSeconds, licenseNote, and file.");
    }
    const file = path.resolve(path.dirname(musicManifestPath), track.file);
    const relative = path.relative(path.dirname(musicManifestPath), file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !allowedMusicExtensions.has(path.extname(file).toLowerCase())) {
      throw new Error(`Music entry "${track.id}" points outside the approved music folder or uses an unsupported format.`);
    }
    return { id: track.id, title: track.title, mood: track.mood, durationSeconds: track.durationSeconds, licenseNote: track.licenseNote, file };
  });
}

async function probeDuration(file: string, signal?: AbortSignal, executable?: string) {
  const ffprobePath = executable ?? await resolveExecutable("ffprobe");
  const { stdout } = await execFileAsync(ffprobePath, [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file,
  ], { windowsHide: true, signal });
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Could not determine audio duration for ${path.basename(file)}.`);
  return seconds;
}

export function getNarrationSpeed(narrationDuration: number, targetDuration: number) {
  if (!Number.isFinite(narrationDuration) || narrationDuration <= 0 ||
      !Number.isFinite(targetDuration) || targetDuration <= 0) {
    throw new Error("Narration and scene durations must be positive finite values.");
  }
  const speed = narrationDuration / targetDuration;
  return Math.max(1, speed);
}

async function synthesizeDialogueScene(input: {
  scene: VideoScene;
  sceneIndex: number;
  cast: NonNullable<VideoScene["cast"]>;
  voiceA: PiperVoiceSelection;
  voiceB: PiperVoiceSelection;
  voiceC: PiperVoiceSelection;
  language: string;
  audioDir: string;
  ffmpegPath: string;
  ffprobePath: string;
  tts: ReturnType<typeof selectTtsProvider>;
  signal?: AbortSignal;
}) {
  const dialogue = input.scene.dialogue;
  if (!dialogue?.length || dialogue.length < 2) throw new Error("Conversation scenes need at least two dialogue lines.");
  const clips: Array<{ file: string; duration: number }> = [];
  for (const [lineIndex, line] of dialogue.entries()) {
    const rawFile = path.join(input.audioDir, `dialogue-raw-${input.sceneIndex + 1}-${lineIndex + 1}.wav`);
    const file = path.join(input.audioDir, `dialogue-${input.sceneIndex + 1}-${lineIndex + 1}.wav`);
    const voice = line.speaker === "A" ? input.voiceA : line.speaker === "B" ? input.voiceB : input.voiceC;
    const speechRate = line.pace === "slow" ? 0.88 : line.pace === "brisk" ? 1.08 : 1;
    await input.tts.synthesize(line.text, { voice, language: input.language, speechRate }, rawFile, input.signal);
    await execFileAsync(input.ffmpegPath, [
      "-i", rawFile,
      "-af", "silenceremove=start_periods=1:start_threshold=-48dB:start_duration=0.03:start_silence=0.02:stop_periods=1:stop_threshold=-48dB:stop_duration=0.2:stop_silence=0.08,asetpts=PTS-STARTPTS",
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", "-y", file,
    ], { windowsHide: true, signal: input.signal });
    clips.push({ file, duration: await probeDuration(file, input.signal, input.ffprobePath) });
  }

  const timeline = buildDialogueTimeline(dialogue.map((line, index) => ({
    durationSeconds: clips[index]!.duration,
    pauseBeforeSeconds: line.pauseBeforeSeconds,
    overlapMs: line.overlapMs,
  })), 30);
  const filters: string[] = [];
  for (const [index, clip] of clips.entries()) {
    filters.push(
      `[${index}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,` +
      `atrim=duration=${clip.duration.toFixed(3)},asetpts=PTS-STARTPTS[line${index}]`,
    );
  }
  let sequenceLabel = "line0";
  for (let index = 1; index < clips.length; index += 1) {
    const gapSeconds = getDialogueGapSeconds({
      durationSeconds: clips[index]!.duration,
      pauseBeforeSeconds: dialogue[index]!.pauseBeforeSeconds,
      overlapMs: dialogue[index]!.overlapMs,
    }, index);
    const nextLabel = `sequence${index}`;
    if (gapSeconds < 0) {
      const overlapSeconds = Math.min(-gapSeconds, clips[index - 1]!.duration - 0.02, clips[index]!.duration - 0.02);
      filters.push(`[${sequenceLabel}][line${index}]acrossfade=d=${overlapSeconds.toFixed(3)}:c1=tri:c2=tri[${nextLabel}]`);
    } else {
      filters.push(`anullsrc=r=48000:cl=stereo:d=${gapSeconds.toFixed(3)}[gap${index}]`);
      filters.push(`[${sequenceLabel}][gap${index}][line${index}]concat=n=3:v=0:a=1[${nextLabel}]`);
    }
    sequenceLabel = nextLabel;
  }
  filters.push(`anullsrc=r=48000:cl=stereo:d=0.35[tail]`);
  filters.push(`[${sequenceLabel}][tail]concat=n=2:v=0:a=1[aout]`);
  const audioFile = `scene-dialogue-${input.sceneIndex + 1}.wav`;
  const args = clips.flatMap((clip) => ["-i", clip.file]);
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[aout]",
    "-c:a", "pcm_s16le",
    "-y", path.join(input.audioDir, audioFile),
  );
  await execFileAsync(input.ffmpegPath, args, { windowsHide: true, signal: input.signal });
  const audioPath = path.join(input.audioDir, audioFile);
  const audioDuration = await probeDuration(audioPath, input.signal, input.ffprobePath);
  const sceneDuration = Math.ceil(Math.max(audioDuration, timeline.durationSeconds) * 30) / 30;
  return {
    audioFile,
    durationSeconds: sceneDuration,
    dialogue: dialogue.map((line, index) => ({
      ...line,
      startFrame: timeline.lines[index]!.startFrame,
      durationFrames: timeline.lines[index]!.durationFrames,
      speakerName: input.cast.find((character) => character.id === line.speaker)?.name ?? line.speaker,
    })),
  };
}

function getSceneText(raw: string, fallback: string) {
  const text = raw.replace(/^\s*\d{1,2}(?::\d{2})?(?:\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2})?)?\s*(?:s|sec|seconds)?\s*[·:|-]\s*/i, "").trim();
  return text || fallback;
}

export function parseScenes(value: unknown, title: string, totalSeconds: number): Array<Pick<VideoScene, "text" | "caption" | "narrationText" | "durationSeconds">> {
  const lines = Array.isArray(value) ? value.filter((line): line is string => typeof line === "string" && line.trim().length > 0) : [];
  const sceneLines = lines.length > 0 ? lines.slice(0, 38) : [title];
  return sceneLines.map((line, index) => {
    const rawText = getSceneText(line, title);
    const labeledScene = /^([^:]{2,36}):\s+(.+)$/.exec(rawText);
    const caption = labeledScene?.[1]?.trim() ?? `Scene ${index + 1}`;
    const text = labeledScene?.[2]?.trim() ?? rawText;
    const speakerLabel = /\b(?:Narrator(?:\s+voiceover)?|[A-Z][a-z][A-Za-z'’-]*(?:\s+[A-Z][a-z][A-Za-z'’-]*){0,2})\s*:\s*/g;
    const speakerLabels = [...text.matchAll(speakerLabel)];
    const narrationText = speakerLabels.length
      ? speakerLabels.map((match, labelIndex) => {
          const start = match.index! + match[0].length;
          const end = speakerLabels[labelIndex + 1]?.index ?? text.length;
          return text.slice(start, end).trim();
        }).filter(Boolean).join(" ")
      : text;
    return {
      text,
      caption,
      narrationText,
      durationSeconds: Math.max(2, totalSeconds / sceneLines.length),
    };
  });
}

async function findRemotionEntry() {
  const tsx = path.join(apiRoot, "src", "video", "remotion-entry.tsx");
  const js = path.join(apiRoot, "dist", "video", "remotion-entry.js");
  const entry = existsSync(tsx) ? tsx : js;
  if (!existsSync(entry)) throw new Error("The Remotion composition entry is missing. Build the API workspace and retry.");
  return entry;
}

async function prepareLogo(logoUrl: string | null, publicDir: string, workspaceId: string) {
  if (logoUrl?.startsWith("data:image/")) {
    const match = /^data:image\/(png|jpeg|svg\+xml);base64,([A-Za-z0-9+/=]+)$/i.exec(logoUrl);
    if (!match) throw new Error("Brand logo must be a base64 PNG, JPEG, or SVG image.");
    const bytes = Buffer.from(match[2]!, "base64");
    if (bytes.length > 4 * 1024 * 1024) throw new Error("Brand logo is larger than 4 MB.");
    const extension = match[1]!.toLowerCase() === "jpeg" ? "jpg" : match[1]!.toLowerCase() === "svg+xml" ? "svg" : "png";
    await writeFile(path.join(publicDir, `brand-logo.${extension}`), bytes);
    return `brand-logo.${extension}`;
  }
  const mediaMatch = /^media:\/\/([a-zA-Z0-9_-]+)$/.exec(logoUrl ?? "");
  if (mediaMatch) {
    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id: mediaMatch[1],
        workspaceId,
        storageKey: "database-upload",
        mimeType: { in: ["image/jpeg", "image/png", "image/webp"] },
      },
      select: { fileData: true, mimeType: true, sizeBytes: true },
    });
    if (!asset?.fileData || asset.sizeBytes > 4n * 1024n * 1024n) {
      throw new Error("The selected brand logo is unavailable or exceeds the 4 MB limit.");
    }
    const extension = asset.mimeType === "image/jpeg" ? "jpg" : asset.mimeType === "image/png" ? "png" : "webp";
    await writeFile(path.join(publicDir, `brand-logo.${extension}`), Buffer.from(asset.fileData));
    return `brand-logo.${extension}`;
  }
  const webLogo = path.join(repoRoot, "apps", "web", "public", "brand", "logo.svg");
  if (existsSync(webLogo)) {
    await copyFile(webLogo, path.join(publicDir, "brand-logo.svg"));
    return "brand-logo.svg";
  }
  return undefined;
}

export type RenderVideoInput = {
  jobId: string;
  workspaceId: string;
  title: string;
  brandName: string;
  callToAction: string;
  handle: string | null;
  colors: string[];
  fonts: string[];
  logoUrl: string | null;
  sourceScenes: unknown;
  scenePlan?: VideoPlan;
  durationSeconds: number;
  aspectRatio: keyof typeof VIDEO_SIZES;
  narration: "voiceover" | "on-camera" | "text-only";
  provider: "auto" | "piper";
  voice: PiperVoiceSelection;
  voiceB: PiperVoiceSelection;
  voiceC: PiperVoiceSelection;
  avatarStyle: "3d" | "illustrated";
  language: string;
  musicId: string | null;
  musicStyle: MusicStyle;
  musicVolume: number;
  musicDucking: number;
  imageDirection: string;
  pexelsApiKey: string | undefined;
};

type RenderCallbacks = {
  updateProgress: (progress: number, stage?: string) => Promise<void>;
  cancelSignal?: CancelSignal;
  signal?: AbortSignal;
};

export async function renderVideo(input: RenderVideoInput, callbacks: RenderCallbacks) {
  const ffmpegPath = await resolveExecutable("ffmpeg");
  const ffprobePath = await resolveExecutable("ffprobe");
  await execFileAsync(ffmpegPath, ["-version"], { windowsHide: true, signal: callbacks.signal });
  await execFileAsync(ffprobePath, ["-version"], { windowsHide: true, signal: callbacks.signal });
  const jobDir = path.join(workRoot, input.jobId);
  const publicDir = path.join(jobDir, "public");
  const audioDir = path.join(audioWorkRoot, input.jobId);
  const musicTracks = await listMusicTracks();
  const musicTrack = input.musicId
    ? musicTracks.find((track) => track.id === input.musicId)
    : musicTracks.find((track) => track.id === "calm-horizon");
  if (input.musicId && !musicTrack) throw new Error("The selected music track was not found or is no longer available.");
  let outputPath: string | undefined;
  let outputCompleted = false;
  await rm(jobDir, { recursive: true, force: true });
  await Promise.all([
    mkdir(publicDir, { recursive: true }),
    mkdir(audioDir, { recursive: true }),
  ]);
  try {
    await callbacks.updateProgress(5, "Preparing video");

  const scenePlan = input.scenePlan;
  const rawScenes: VideoScene[] = scenePlan
    ? scenePlan.scenes.map((scene) => ({
        text: scene.onScreenText,
        caption: scene.setting.replaceAll("-", " "),
        narrationText: scene.narration,
        onScreenText: scene.onScreenText,
        setting: scene.setting,
        characters: scene.characters,
        cast: scenePlan.cast,
        ...(scene.dialogue ? { dialogue: scene.dialogue.map((line) => ({ ...line })) } : {}),
        props: scene.props,
        ahaMoment: scene.ahaMoment,
        durationSeconds: scene.durationSeconds,
      }))
    : parseScenes(input.sourceScenes, input.title, input.durationSeconds);
  const scenes: VideoScene[] = [];
  const targetSceneDurations = getTargetSceneDurations(input.durationSeconds, rawScenes.length);
  if (input.narration === "text-only") {
    for (const [index, scene] of rawScenes.entries()) {
      const targetSceneDuration = targetSceneDurations[index]!;
      if (scene.dialogue?.length && scene.cast && scene.cast.length >= 2) {
        const timeline = buildDialogueTimeline(scene.dialogue.map((line) => ({
          durationSeconds: Math.max(0.8, line.text.trim().split(/\s+/).length / 2.6),
          pauseBeforeSeconds: line.pauseBeforeSeconds,
          overlapMs: line.overlapMs,
        })), 30, 0.25);
        const fit = Math.min(1, targetSceneDuration * 30 * 0.94 / Math.max(1, timeline.durationSeconds * 30));
        scenes.push({
          ...scene,
          dialogue: scene.dialogue.map((line, lineIndex) => ({
            ...line,
            speakerName: line.speakerName ?? scene.cast?.find((character) => character.id === line.speaker)?.name,
            startFrame: Math.round(timeline.lines[lineIndex]!.startFrame * fit),
            durationFrames: Math.max(1, Math.round(timeline.lines[lineIndex]!.durationFrames * fit)),
          })),
          durationSeconds: targetSceneDuration,
        });
      } else {
        scenes.push({ ...scene, durationSeconds: targetSceneDuration });
      }
    }
  } else {
    const tts = selectTtsProvider();
    for (const [index, scene] of rawScenes.entries()) {
      const targetSceneDuration = targetSceneDurations[index]!;
      if (scene.dialogue?.length && scene.cast && scene.cast.length >= 2) {
        try {
          const dialogueResult = await synthesizeDialogueScene({
            scene,
            sceneIndex: index,
            cast: scene.cast,
            voiceA: input.voice,
            voiceB: input.voiceB,
            voiceC: input.voiceC,
            language: input.language,
            audioDir,
            ffmpegPath,
            ffprobePath,
            tts,
            signal: callbacks.signal,
          });
          scenes.push({
            ...scene,
            audioFile: dialogueResult.audioFile,
            dialogue: dialogueResult.dialogue,
            durationSeconds: dialogueResult.durationSeconds,
          });
          await callbacks.updateProgress(8 + Math.round((index + 1) / rawScenes.length * 22), "Generating character dialogue");
          continue;
        } catch (error) {
          console.warn(`Piper character dialogue unavailable for video job ${input.jobId}; continuing with music.`, error);
        }
      }
      const fileName = `scene-${index + 1}.${tts.name === "piper" ? "wav" : "mp3"}`;
      const outputPath = path.join(audioDir, fileName);
      try {
        await tts.synthesize(scene.narrationText ?? scene.text, { voice: input.voice, language: input.language }, outputPath, callbacks.signal);
        const narrationDuration = await probeDuration(outputPath, callbacks.signal);
        const audioSpeed = getNarrationSpeed(narrationDuration, targetSceneDuration);
        scenes.push({
          ...scene,
          audioFile: fileName,
          durationSeconds: targetSceneDuration,
          ...(audioSpeed > 1 ? { audioSpeed } : {}),
        });
        await callbacks.updateProgress(8 + Math.round((index + 1) / rawScenes.length * 22), "Generating voice");
      } catch (error) {
        console.warn(`Piper narration unavailable for video job ${input.jobId}; continuing with music.`, error);
        scenes.push({ ...scene, durationSeconds: targetSceneDuration });
      }
    }
  }

  let musicFile: string | undefined;
  if (musicTrack) {
    musicFile = `music${path.extname(musicTrack.file).toLowerCase()}`;
    await copyFile(musicTrack.file, path.join(audioDir, musicFile));
  }

  let logoFile: string | undefined;
  if (input.logoUrl) logoFile = await prepareLogo(input.logoUrl, publicDir, input.workspaceId);
  else logoFile = await prepareLogo(null, publicDir, input.workspaceId);

  if (!input.scenePlan && input.pexelsApiKey && input.imageDirection.trim()) {
    try {
      await callbacks.updateProgress(33, "Preparing scenes");
      await addPexelsVisuals(scenes, input.imageDirection, input.pexelsApiKey, publicDir, input.aspectRatio, callbacks.signal);
    } catch (error) {
      if (callbacks.signal?.aborted) throw error;
      console.warn(`Pexels visuals unavailable for video job ${input.jobId}; using generated brand backgrounds.`, error);
    }
  }

  const size = VIDEO_SIZES[input.aspectRatio];
  const fps = 30;
  const fontFamily = input.fonts[0] || "Arial, sans-serif";
  const props: VideoCompositionProps = {
    title: input.title,
    brandName: input.brandName,
    callToAction: input.callToAction,
    handle: input.handle,
    colors: input.colors,
    fontFamily,
    document: createVideoDesignDocument({
      id: input.jobId,
      title: input.title,
      brandName: input.brandName,
      colors: input.colors,
      fontFamily,
      ...(logoFile ? { logoFile } : {}),
      scenes,
      ...size,
    }),
    scenes,
    ...size,
    fps,
    avatarStyle: input.avatarStyle,
    ...(logoFile ? { logoFile } : {}),
  };
  const durationInFrames = getVideoSceneTimeline(scenes.map((scene) => scene.durationSeconds), fps).totalFrames;
  const durationSeconds = durationInFrames / fps;
  await callbacks.updateProgress(38, "Rendering scenes");

  const entryPoint = await findRemotionEntry();
  const bundleOutputPath = path.join(jobDir, "remotion-bundle");
  const bundleOutput = await bundle({
    entryPoint,
    outDir: bundleOutputPath,
    publicDir,
    enableCaching: true,
    webpackOverride: (configuration) => {
      configuration.resolve ??= {};
      configuration.resolve.extensionAlias = {
        ...configuration.resolve.extensionAlias,
        ".js": [".ts", ".tsx", ".js"],
      };
      return configuration;
    },
  });
  const remotionBundleDirectory = resolveRemotionBundleDirectory(bundleOutput, bundleOutputPath);
  if (!(await stat(path.join(remotionBundleDirectory, "index.html"))).isFile()) {
    throw new Error("Remotion did not create an index.html in its local bundle output directory.");
  }
  const id = `Branded-${input.aspectRatio}`;
  const chromiumOptions = { gl: "angle" as const };
  const composition = await selectComposition({ serveUrl: remotionBundleDirectory, id, inputProps: props, chromiumOptions });
  const outputKey = path.join(input.workspaceId, `${input.jobId}.mp4`);
  outputPath = path.join(outputRoot, outputKey);
  const silentOutputPath = path.join(jobDir, "silent.mp4");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await renderMedia({
    composition: { ...composition, durationInFrames },
    serveUrl: remotionBundleDirectory,
    codec: "h264",
    outputLocation: silentOutputPath,
    inputProps: props,
    binariesDirectory: path.dirname(ffmpegPath),
    chromiumOptions,
    muted: true,
    ...(callbacks.cancelSignal ? { cancelSignal: callbacks.cancelSignal } : {}),
    onProgress: ({ progress }) => {
      void callbacks.updateProgress(38 + Math.round(progress * 57), "Rendering scenes").catch((error: unknown) => {
        console.error(`Could not update progress for video job ${input.jobId}.`, error);
      });
    },
    logLevel: "error",
  });
    const audioScenes = scenes.filter((scene) => scene.audioFile);
    if (audioScenes.length === 0 && !musicFile) {
      await copyFile(silentOutputPath, outputPath);
    } else {
      const graph = createAudioFilterGraph(
        audioScenes.map((scene) => Math.max(30, Math.ceil(scene.durationSeconds * fps)) / fps),
        Boolean(musicFile),
        input.musicVolume,
        input.musicDucking,
        durationSeconds,
        input.musicStyle,
        audioScenes.map((scene) => scene.audioSpeed ?? 1),
      );
      const args = ["-i", silentOutputPath];
      for (const scene of audioScenes) args.push("-i", path.join(audioDir, scene.audioFile!));
      if (musicFile) args.push("-stream_loop", "-1", "-i", path.join(audioDir, musicFile));
      args.push(
        "-filter_complex", graph,
        "-map", "0:v:0", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-t", durationSeconds.toFixed(3), "-movflags", "+faststart", "-y", outputPath,
      );
      await callbacks.updateProgress(96, "Adding music");
      await execFileAsync(ffmpegPath, args, { windowsHide: true, signal: callbacks.signal });
    }
      await callbacks.updateProgress(98, "Checking audio quality");
      const actualDurationSeconds = await probeDuration(outputPath, callbacks.signal, ffprobePath);
      const audioPresent = scenes.some((scene) => scene.audioFile !== undefined) || musicFile !== undefined;
      let silentGapSeconds: number[] = [];
      if (audioPresent) {
        const { stderr } = await execFileAsync(ffmpegPath, [
          "-i", outputPath,
          "-map", "0:a:0",
          "-af", "silencedetect=noise=-48dB:d=0.1",
          "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null",
        ], { windowsHide: true, signal: callbacks.signal });
        silentGapSeconds = parseSilenceDurations(stderr);
      }
      validateVideoAudioQuality({
        requestedDurationSeconds: input.durationSeconds,
        actualDurationSeconds,
        silentGapSeconds,
        audioPresent,
      });
      await callbacks.updateProgress(99, "Finishing video");
      await createVideoThumbnail(outputPath, outputPath.replace(/\.mp4$/i, ".jpg"), callbacks.signal);
      outputCompleted = true;
      return { outputKey, outputPath, sizeBytes: (await stat(outputPath)).size, durationSeconds: actualDurationSeconds };
  } finally {
    await rm(jobDir, { recursive: true, force: true });
    await rm(audioDir, { recursive: true, force: true });
    if (!outputCompleted && outputPath) {
      await rm(outputPath, { force: true });
      await rm(outputPath.replace(/\.mp4$/i, ".jpg"), { force: true });
    }
  }
}

async function addPexelsVisuals(
  scenes: VideoScene[],
  query: string,
  apiKey: string,
  publicDir: string,
  aspectRatio: keyof typeof VIDEO_SIZES,
  signal?: AbortSignal,
) {
  const headers = { Authorization: apiKey };
  const orientation = aspectRatio === "landscape" ? "landscape" : "portrait";
  const [videosResponse, photosResponse] = await Promise.all([
    fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${Math.min(scenes.length, 15)}&orientation=${orientation}`, { headers, signal }),
    fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${Math.min(scenes.length, 15)}&orientation=${orientation}`, { headers, signal }),
  ]);
  if (!videosResponse.ok || !photosResponse.ok) throw new Error(`Pexels search failed (videos ${videosResponse.status}, photos ${photosResponse.status}).`);
  const [videoData, photoData] = await Promise.all([
    videosResponse.json() as Promise<{ videos?: Array<{ video_files?: Array<{ link?: string; width?: number; height?: number }> }> }>,
    photosResponse.json() as Promise<{ photos?: Array<{ src?: { large?: string; large2x?: string } }> }>,
  ]);
  const videos = videoData.videos ?? [];
  const photos = photoData.photos ?? [];
  for (const [index, scene] of scenes.entries()) {
    const video = videos[index];
    const media = video?.video_files?.filter((file) => file.link && file.width && file.height)
      .sort((a, b) => Math.abs((a.width ?? 0) / (a.height ?? 1) - 9 / 16) - Math.abs((b.width ?? 0) / (b.height ?? 1) - 9 / 16))[0];
    if (media?.link) {
      const mediaUrl = new URL(media.link);
      if (mediaUrl.protocol === "https:" && mediaUrl.hostname === "videos.pexels.com") {
        const asset = await fetch(mediaUrl, { redirect: "error", signal });
        if (asset.ok && asset.headers.get("content-type")?.startsWith("video/")) {
          const bytes = Buffer.from(await asset.arrayBuffer());
          if (bytes.length <= 80 * 1024 * 1024) {
            const fileName = `scene-${index + 1}.mp4`;
            await writeFile(path.join(publicDir, fileName), bytes);
            scenes[index] = { ...scene, visualFile: fileName, visualKind: "video" };
            continue;
          }
        }
      }
    }
    const photoUrl = photos[index]?.src?.large2x ?? photos[index]?.src?.large;
    if (!photoUrl) continue;
    const photo = new URL(photoUrl);
    if (photo.protocol !== "https:" || photo.hostname !== "images.pexels.com") continue;
    const asset = await fetch(photo, { redirect: "error", signal });
    if (!asset.ok || !asset.headers.get("content-type")?.startsWith("image/")) continue;
    const bytes = Buffer.from(await asset.arrayBuffer());
    if (bytes.length > 15 * 1024 * 1024) continue;
    const extension = asset.headers.get("content-type")?.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
    const fileName = `scene-${index + 1}.${extension}`;
    await writeFile(path.join(publicDir, fileName), bytes);
    scenes[index] = { ...scene, visualFile: fileName, visualKind: "image" };
  }
}
