import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../env.js";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const multiSpeakerModelPath = env.PIPER_MULTISPEAKER_VOICE_MODEL
  ? path.resolve(env.PIPER_MULTISPEAKER_VOICE_MODEL)
  : path.join(apiRoot, "assets", "voices", "en_US-libritts_r-medium.onnx");

export const piperVoiceProfiles = [
  { id: "woman-warm", label: "Woman · warm", description: "Warm US English voice", speakerId: 307 },
  { id: "woman-clear", label: "Woman · clear", description: "Clear US English voice", speakerId: 54 },
  { id: "woman-gentle", label: "Woman · gentle", description: "Gentle US English voice", speakerId: 26 },
  { id: "man-professional", label: "Man · professional", description: "Steady US English voice", speakerId: 805 },
  { id: "man-friendly", label: "Man · friendly", description: "Conversational US English voice", speakerId: 843 },
] as const;

export type PiperVoiceId = typeof piperVoiceProfiles[number]["id"];
export type PiperVoiceSelection = PiperVoiceId | "default";
export type TtsOptions = { voice: PiperVoiceSelection; language: string; speechRate?: number };

const legacyVoiceIds: Record<string, PiperVoiceId> = {
  feminine: "woman-clear",
  masculine: "man-professional",
  gentle: "woman-gentle",
  professional: "man-professional",
  energetic: "woman-clear",
  balanced: "man-professional",
  warm: "woman-warm",
  bright: "woman-clear",
  calm: "woman-gentle",
};

export function resolvePiperVoice(value: unknown): PiperVoiceId | undefined {
  if (typeof value !== "string") return undefined;
  const profile = piperVoiceProfiles.find((item) => item.id === value);
  if (profile) return profile.id;
  return legacyVoiceIds[value];
}

export type TextToSpeechProvider = {
  name: "piper";
  synthesize(text: string, options: TtsOptions, outputPath: string, signal?: AbortSignal): Promise<void>;
};

const piperTtsProvider: TextToSpeechProvider = {
  name: "piper",
  async synthesize(text, options, outputPath, signal) {
    const profile = piperVoiceProfiles.find((item) => item.id === options.voice);
    const usesMultiSpeakerModel = Boolean(profile && existsSync(multiSpeakerModelPath));
    const model = usesMultiSpeakerModel
      ? multiSpeakerModelPath
      : env.PIPER_VOICE_MODEL;
    if (!model) {
      throw new Error("Offline Piper is the free voice provider, but no Piper voice model is configured. Install the bundled multi-speaker model or set PIPER_VOICE_MODEL; see README.md.");
    }
    if (profile && !usesMultiSpeakerModel) {
      throw new Error(`The selected voice "${profile.label}" needs the multi-speaker Piper model at ${multiSpeakerModelPath}.`);
    }
    await mkdir(path.dirname(outputPath), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const speechRate = Math.max(0.85, Math.min(1.15, options.speechRate ?? 1));
      const args = ["--model", model, "--output_file", outputPath, "--length_scale", (2.1 / speechRate).toFixed(2)];
      if (profile && usesMultiSpeakerModel) args.push("--speaker", String(profile.speakerId));
      const child = spawn(env.PIPER_EXECUTABLE, args, {
        stdio: ["pipe", "ignore", "pipe"],
        windowsHide: true,
        signal,
      });
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-2000); });
      child.once("error", (error) => reject(new Error(`Could not start Piper (${env.PIPER_EXECUTABLE}): ${error.message}`)));
      child.once("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Piper voice generation failed (exit ${code ?? "unknown"}): ${stderr || "Check the Piper model and executable."}`));
      });
      child.stdin.end(text);
    });
  },
};

export function selectTtsProvider(): TextToSpeechProvider {
  return piperTtsProvider;
}

export function ttsConfiguration() {
  const multiSpeakerAvailable = existsSync(multiSpeakerModelPath);
  const configuredVoiceAvailable = Boolean(env.PIPER_VOICE_MODEL && existsSync(path.resolve(env.PIPER_VOICE_MODEL)));
  return {
    defaultProvider: "piper",
    providers: { piper: multiSpeakerAvailable || configuredVoiceAvailable },
    piperExecutable: env.PIPER_EXECUTABLE,
    voices: multiSpeakerAvailable
      ? piperVoiceProfiles.map(({ id, label, description }) => ({ id, label, description }))
      : env.PIPER_VOICE_MODEL
        ? [{ id: "default", label: "Configured voice", description: "Uses the configured local voice model" }]
        : [],
  };
}
