import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "../env.js";
import type { ContentProvider } from "./content-generator.js";

export const availableVideoProps = [
  "phone", "laptop", "tablet", "basket", "vegetables", "scissors", "mirror", "medical-cross",
  "files", "calendar", "money", "delivery-box", "location-pin", "star-rating", "book", "school-bell",
  "wrench", "gear", "paint-brush", "food-plate", "coffee-cup", "shopping-bag", "plant", "clock",
  "chart", "checkmark", "speech-bubble", "storefront", "chair", "clipboard",
] as const;

const settingNames = ["counter", "desk", "shop-front", "waiting-area", "office", "outdoors", "phone-demo", "laptop-demo", "dashboard"] as const;
export const videoConversationStyles = ["story-driven", "warm", "playful", "dramatic", "product-demo"] as const;
const propSchema = z.enum(availableVideoProps);
const characterSchema = z.object({
  id: z.enum(["A", "B", "C"]),
  name: z.string().trim().min(1).max(40),
  appearance: z.string().trim().min(8).max(180),
  personality: z.string().trim().min(4).max(100),
}).strict();
const castSchema = z.array(characterSchema).min(2).max(3).refine((cast) =>
  cast.map((character) => character.id).join("") === (cast.length === 2 ? "AB" : "ABC"),
);
const generatedCastSchema = (size: 2 | 3) => z.array(characterSchema).length(size).refine((cast) =>
  cast.map((character) => character.id).join("") === (size === 2 ? "AB" : "ABC"),
);
const dialogueLineSchema = z.object({
  speaker: z.enum(["A", "B", "C"]),
  text: z.string().trim().min(2).max(240),
  emotion: z.enum(["neutral", "curious", "warm", "excited", "reassuring", "concerned", "thoughtful", "playful", "serious", "relieved"]).optional(),
  pace: z.enum(["slow", "natural", "brisk"]).optional(),
  volume: z.enum(["soft", "normal", "projected"]).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  pauseBeforeSeconds: z.number().min(0).max(1.2).optional(),
  pauseReason: z.string().trim().min(4).max(120).optional(),
  overlapMs: z.number().int().min(100).max(200).optional(),
}).strict();
const generatedDialogueLineSchema = dialogueLineSchema.extend({
  emotion: z.enum(["neutral", "curious", "warm", "excited", "reassuring", "concerned", "thoughtful", "playful", "serious", "relieved"]),
  pace: z.enum(["slow", "natural", "brisk"]),
  volume: z.enum(["soft", "normal", "projected"]),
  energy: z.number().int().min(1).max(5),
  pauseBeforeSeconds: z.number().min(0).max(1.2),
  pauseReason: z.string().trim().min(4).max(120).optional(),
  overlapMs: z.number().int().min(100).max(200).optional(),
}).superRefine((line, context) => {
  const wordCount = line.text.trim().split(/\s+/).length;
  if (wordCount < 3 || wordCount > 12) {
    context.addIssue({ code: "custom", path: ["text"], message: "Each dialogue turn must contain 3 to 12 words." });
  }
  if ((line.pauseBeforeSeconds ?? 0) > 0.6 && !line.pauseReason) {
    context.addIssue({ code: "custom", path: ["pauseReason"], message: "Long pauses need an explicit dramatic or action reason." });
  }
  if (line.overlapMs && !/^(oh|really|mm-?hm|yeah|right|wait|uh|huh)\b/i.test(line.text.trim())) {
    context.addIssue({ code: "custom", path: ["overlapMs"], message: "Only a brief natural reaction may overlap the previous line." });
  }
});
const sceneSchema = z.object({
  durationSeconds: z.number().int().min(8).max(15),
  setting: z.enum(settingNames),
  characters: z.array(z.object({
    role: z.string().trim().min(1).max(40),
    action: z.string().trim().min(1).max(180),
  }).strict()).min(1).max(3),
  onScreenText: z.string().trim().min(1).max(80),
  narration: z.string().trim().min(1).max(500),
  dialogue: z.array(dialogueLineSchema).min(2).max(6).optional(),
  props: z.array(propSchema).min(1).max(6),
  ahaMoment: z.boolean(),
}).strict().superRefine((scene, context) => {
  if (scene.onScreenText.trim().split(/\s+/).length > 6) {
    context.addIssue({ code: "custom", path: ["onScreenText"], message: "Scene headline text must use no more than six words." });
  }
});

export const videoPlanSchema = z.object({
  industry: z.string().trim().min(2).max(100),
  title: z.string().trim().min(2).max(120),
  hook: z.string().trim().min(2).max(240),
  story: z.string().trim().min(2).max(1200),
  cast: castSchema.optional(),
  scenes: z.array(sceneSchema).min(4).max(38),
  callToAction: z.string().trim().min(2).max(240),
}).strict();

export type VideoPlan = z.infer<typeof videoPlanSchema>;
export function getTargetDialogueWords(totalDurationSeconds: number, sceneCount: number) {
  if (sceneCount < 1) return 0;
  return Math.max(
    20,
    Math.round((totalDurationSeconds + 0.4 * (sceneCount - 1) - 3 - 1.35 * sceneCount) * 2.3 / sceneCount),
  );
}

export type VideoPlanRequest = {
  idea: string;
  businessContext?: string;
  durationSeconds: number;
  language: string;
  conversationStyle?: typeof videoConversationStyles[number];
  castSize?: 2 | 3;
  brand: {
    name: string;
    industry?: string | null;
    description?: string | null;
    products?: string | null;
    audience?: string | null;
    offers?: string | null;
    tone?: string | null;
    colors: string[];
    logoUrl: string | null;
    handle: string | null;
  };
};

const outlineSchema = (castSize: 2 | 3) => z.object({
  industry: z.string().trim().min(2).max(100),
  title: z.string().trim().min(2).max(120),
  hook: z.string().trim().min(2).max(240),
  story: z.string().trim().min(2).max(1200),
  cast: generatedCastSchema(castSize),
  callToAction: z.string().trim().min(2).max(240),
  scenes: z.array(z.object({
    goal: z.string().trim().min(2).max(220),
    setting: z.enum(settingNames),
    ahaMoment: z.boolean(),
  }).strict()).min(4).max(38),
}).strict();

/** Convert common model-specific outline fields into the stable video-plan contract. */
export function normalizeGeneratedVideoOutline(value: unknown, fallbackIndustry?: string | null, castSize: 2 | 3 = 3): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const outer = value as Record<string, unknown>;
  const nestedOutline = [outer.outline, outer.plan, outer.script].find((candidate) =>
    candidate && typeof candidate === "object" && !Array.isArray(candidate)) as Record<string, unknown> | undefined;
  const outline = nestedOutline ? { ...outer, ...nestedOutline } : outer;
  const rawScenes = Array.isArray(outline.scenes) ? outline.scenes : [];
  if (rawScenes.length === 0) return value;
  const text = (...candidates: unknown[]) => candidates.find((candidate): candidate is string =>
    typeof candidate === "string" && candidate.trim().length > 0)?.trim();
  const sceneText = (scene: unknown) => {
    if (!scene || typeof scene !== "object" || Array.isArray(scene)) return undefined;
    const record = scene as Record<string, unknown>;
    const nestedScript = record.script && typeof record.script === "object" && !Array.isArray(record.script)
      ? record.script as Record<string, unknown>
      : undefined;
    return text(record.goal, record.objective, record.description, record.narration, record.action,
      record.script, record.summary, record.title,
      nestedScript?.goal, nestedScript?.description, nestedScript?.narration, nestedScript?.action);
  };
  const rawAhaIndex = rawScenes.findIndex((scene) =>
    Boolean(scene && typeof scene === "object" && !Array.isArray(scene) && (scene as Record<string, unknown>).ahaMoment === true));
  const ahaIndex = rawAhaIndex >= 0 ? rawAhaIndex : Math.floor(rawScenes.length / 2);
  const scenes = rawScenes.map((scene, index) => {
    const record = scene && typeof scene === "object" && !Array.isArray(scene)
      ? scene as Record<string, unknown>
      : {};
    const setting = typeof record.setting === "string" && settingNames.includes(record.setting as typeof settingNames[number])
      ? record.setting as typeof settingNames[number]
      : "office";
    return {
      goal: (sceneText(scene) ?? `Show the next step in the story, scene ${index + 1}.`).slice(0, 220),
      setting,
      ahaMoment: index === ahaIndex,
    };
  });
  const fallbackAppearances = [
    "A warm, expressive cartoon customer in a practical everyday outfit.",
    "A calm, approachable cartoon business guide with a confident stance.",
    "A friendly cartoon colleague with an attentive expression and relaxed posture.",
  ];
  const fallbackPersonalities = ["curious and thoughtful", "calm and reassuring", "helpful and upbeat"];
  const fallbackNames = ["Maya", "Ari", "Ravi"];
  const rawCast = Array.isArray(outline.cast) ? outline.cast : [];
  const castIds = castSize === 2 ? ["A", "B"] as const : ["A", "B", "C"] as const;
  const cast = castIds.map((id, index) => {
    const entry = rawCast.find((candidate) => candidate && typeof candidate === "object" &&
      !Array.isArray(candidate) && (candidate as Record<string, unknown>).id === id) ?? rawCast[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return {
        id,
        name: fallbackNames[index] ?? `Character ${index + 1}`,
        appearance: fallbackAppearances[index] ?? fallbackAppearances[0],
        personality: fallbackPersonalities[index] ?? fallbackPersonalities[0],
      };
    }
    const character = entry as Record<string, unknown>;
    const parts = [character.ageGroup, character.skinTone, character.hairstyle ?? character.hairStyle, character.outfit, character.accessory]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .map((part) => part.trim());
    return {
      id,
      name: typeof character.name === "string" && character.name.trim() ? character.name.trim() : fallbackNames[index] ?? `Character ${index + 1}`,
      appearance: typeof character.appearance === "string" && character.appearance.trim()
        ? character.appearance.trim()
        : parts.length ? parts.join(", ") : fallbackAppearances[index] ?? fallbackAppearances[0],
      personality: typeof character.personality === "string" && character.personality.trim()
        ? character.personality.trim()
        : fallbackPersonalities[index] ?? fallbackPersonalities[0],
    };
  });
  const firstSceneGoal = sceneText(rawScenes[0]);
  const scriptText = typeof outer.script === "string" ? outer.script : undefined;
  const story = (text(outline.story, outline.summary, scriptText) ?? scenes.map((scene) => scene.goal).join(" ")).slice(0, 1200);
  return {
    industry: (text(outline.industry, outline.detectedIndustry, fallbackIndustry) ?? "General business").slice(0, 100),
    title: (text(outline.title, outline.headline, outline.name) ?? "A useful brand story").slice(0, 120),
    hook: (text(outline.hook, outline.openingHook, firstSceneGoal) ?? "A customer has a problem to solve.").slice(0, 240),
    story,
    cast,
    callToAction: (text(outline.callToAction, outline.cta) ?? "Learn more from the team.").slice(0, 240),
    scenes,
  };
}

function providerResponseSchema(responseSchema: unknown) {
  if (!responseSchema || typeof responseSchema !== "object" || Array.isArray(responseSchema)) return responseSchema;
  const schema = responseSchema as Record<string, unknown>;
  if (schema.type !== "ARRAY" && schema.type !== "array") return responseSchema;
  return { type: "OBJECT", properties: { scenes: responseSchema }, required: ["scenes"] };
}

function normalizeGeneratedArray(
  value: unknown,
  context?: { outlineScenes: Array<{ goal: string; setting: typeof settingNames[number]; ahaMoment: boolean }>; cast: Array<{ id: "A" | "B" | "C"; name: string }> },
) {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
  const scenes = Array.isArray(value) ? value
    : record ? [record.scenes, record.items].find(Array.isArray) as unknown[] | undefined
      : undefined;
  if (!scenes || !context) return scenes ?? value;

  const getText = (...values: unknown[]) => values.find((candidate): candidate is string =>
    typeof candidate === "string" && candidate.trim().length > 0)?.trim();
  const getRecord = (candidate: unknown) => candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : {};
  const fallbackDialogue = [
    "What matters most today?",
    "Start with your audience.",
    "Show one clear benefit.",
    "Make the next step simple.",
    "Keep every claim honest.",
    "Learn more from our team.",
  ];
  const supportedEmotions = new Set(["neutral", "curious", "warm", "excited", "reassuring", "concerned", "thoughtful", "playful", "serious", "relieved"]);
  const supportedPaces = new Set(["slow", "natural", "brisk"]);
  const supportedVolumes = new Set(["soft", "normal", "projected"]);
  return scenes.map((rawScene, sceneIndex) => {
    const scene = getRecord(rawScene);
    const script = getRecord(scene.script);
    const outlineScene = context.outlineScenes[sceneIndex];
    const rawDialogue = Array.isArray(scene.dialogue) ? scene.dialogue
      : Array.isArray(script.dialogue) ? script.dialogue
        : [];
    const scriptText = getText(scene.script, script.narration, script.text, script.content, scene.narration,
      scene.voiceover, scene.voiceOver, scene.description, scene.action, scene.goal, outlineScene?.goal);
    const scriptLines = scriptText?.split(/(?<=[.!?])\s+/).filter(Boolean) ?? [];
    const dialogue = Array.from({ length: 6 }, (_, lineIndex) => {
      const rawLine = rawDialogue[lineIndex];
      const line = getRecord(rawLine);
      const speakerValue = getText(line.speaker, line.character, line.role);
      const namedSpeaker = context.cast.find((character) => speakerValue?.toLocaleLowerCase().includes(character.name.toLocaleLowerCase()));
      const speakerId = namedSpeaker?.id ?? context.cast.find((character) => character.id === speakerValue)?.id ??
        context.cast[lineIndex % context.cast.length]!.id;
      let text = getText(line.text, line.line, line.dialogue, line.content, line.script,
        scriptLines[lineIndex], lineIndex === 0 ? scriptText : undefined);
      if (text) {
        const words = text.trim().split(/\s+/);
        if (words.length > 12) text = words.slice(0, 12).join(" ");
      }
      if (!text || text.trim().split(/\s+/).length < 3) text = fallbackDialogue[lineIndex]!;
      const emotion = typeof line.emotion === "string" && supportedEmotions.has(line.emotion as never) ? line.emotion : "neutral";
      const pace = typeof line.pace === "string" && supportedPaces.has(line.pace as never) ? line.pace : "natural";
      const volume = typeof line.volume === "string" && supportedVolumes.has(line.volume as never) ? line.volume : "normal";
      const energy = typeof line.energy === "number" && line.energy >= 1 && line.energy <= 5 ? Math.round(line.energy) : 3;
      const pauseBeforeSeconds = typeof line.pauseBeforeSeconds === "number" && line.pauseBeforeSeconds >= 0 && line.pauseBeforeSeconds <= 1.2
        ? line.pauseBeforeSeconds
        : 0;
      return {
        speaker: speakerId,
        text,
        emotion,
        pace,
        volume,
        energy,
        pauseBeforeSeconds,
        ...(typeof line.pauseReason === "string" && line.pauseReason.trim().length >= 4 ? { pauseReason: line.pauseReason.trim().slice(0, 120) } : {}),
        ...(typeof line.overlapMs === "number" && line.overlapMs >= 100 && line.overlapMs <= 200 ? { overlapMs: Math.round(line.overlapMs) } : {}),
      };
    });
    const characters = context.cast.map((character, characterIndex) => {
      const rawCharacter = Array.isArray(scene.characters) ? scene.characters[characterIndex] : undefined;
      const entry = getRecord(rawCharacter);
      const action = getText(entry.action, entry.description, entry.behavior, entry.script) ??
        "listens and responds naturally as the scene unfolds";
      return { role: getText(entry.role, entry.name, entry.character, character.name)!, action: action.slice(0, 180) };
    });
    const proposedSetting = getText(scene.setting, script.setting);
    const setting = proposedSetting && settingNames.includes(proposedSetting as typeof settingNames[number])
      ? proposedSetting as typeof settingNames[number]
      : outlineScene?.setting ?? "office";
    const requestedText = getText(scene.onScreenText, scene.headline, scene.title, scene.text, script.headline) ?? outlineScene?.goal ?? "A clearer next step";
    const onScreenText = requestedText.split(/\s+/).slice(0, 6).join(" ");
    const props = Array.isArray(scene.props)
      ? scene.props.filter((prop): prop is typeof availableVideoProps[number] =>
        typeof prop === "string" && availableVideoProps.includes(prop as typeof availableVideoProps[number])).slice(0, 6)
      : [];
    return {
      durationSeconds: 12,
      setting,
      characters,
      onScreenText,
      narration: dialogue.map((line) => line.text).join(" "),
      dialogue,
      props: props.length ? props : ["phone"],
      ahaMoment: outlineScene?.ahaMoment ?? false,
    };
  });
}

const outlineJsonSchema = (castSize: 2 | 3) => ({
  type: "OBJECT",
  properties: {
    industry: { type: "STRING" },
    title: { type: "STRING" },
    hook: { type: "STRING" },
    story: { type: "STRING" },
    cast: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING", enum: castSize === 2 ? ["A", "B"] : ["A", "B", "C"] },
          name: { type: "STRING" },
          appearance: { type: "STRING" },
          personality: { type: "STRING" },
        },
        required: ["id", "name", "appearance", "personality"],
      },
      minItems: castSize,
      maxItems: castSize,
    },
    callToAction: { type: "STRING" },
    scenes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          goal: { type: "STRING" },
          setting: { type: "STRING", enum: settingNames },
          ahaMoment: { type: "BOOLEAN" },
        },
        required: ["goal", "setting", "ahaMoment"],
      },
    },
  },
  required: ["industry", "title", "hook", "story", "cast", "callToAction", "scenes"],
});

const generatedSceneSchema = sceneSchema.safeExtend({
  dialogue: z.array(generatedDialogueLineSchema).length(6),
}).strict();
const sceneJsonSchema = (castSize: 2 | 3) => ({
  type: "OBJECT",
  properties: {
    durationSeconds: { type: "INTEGER", minimum: 8, maximum: 15 },
    setting: { type: "STRING", enum: settingNames },
    characters: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { role: { type: "STRING" }, action: { type: "STRING" } },
        required: ["role", "action"],
      },
    },
    onScreenText: { type: "STRING" },
    narration: { type: "STRING" },
    dialogue: {
      type: "ARRAY",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "OBJECT",
        properties: {
          speaker: { type: "STRING", enum: castSize === 2 ? ["A", "B"] : ["A", "B", "C"] },
          text: { type: "STRING" },
          emotion: { type: "STRING", enum: ["neutral", "curious", "warm", "excited", "reassuring", "concerned", "thoughtful", "playful", "serious", "relieved"] },
          pace: { type: "STRING", enum: ["slow", "natural", "brisk"] },
          volume: { type: "STRING", enum: ["soft", "normal", "projected"] },
          energy: { type: "INTEGER", minimum: 1, maximum: 5 },
          pauseBeforeSeconds: { type: "NUMBER", minimum: 0, maximum: 1.2 },
          pauseReason: { type: "STRING" },
          overlapMs: { type: "INTEGER", minimum: 100, maximum: 200 },
        },
        required: ["speaker", "text", "emotion", "pace", "volume", "energy", "pauseBeforeSeconds"],
      },
    },
    props: { type: "ARRAY", items: { type: "STRING", enum: availableVideoProps } },
    ahaMoment: { type: "BOOLEAN" },
  },
  required: ["durationSeconds", "setting", "characters", "onScreenText", "narration", "dialogue", "props", "ahaMoment"],
});

export class VideoPlanGenerationError extends Error {
  constructor(readonly status: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "VideoPlanGenerationError";
  }
}

function providerErrorDetail(error: unknown) {
  if (!(error instanceof Error)) return "unknown provider error";
  const detail = error.message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").trim();
  return detail ? detail.slice(0, 240) : error.name;
}

async function providerHttpError(response: Response, providerName: string) {
  let detail = "";
  try {
    const payload = await response.json() as { error?: { message?: unknown } };
    if (typeof payload.error?.message === "string") detail = payload.error.message;
  } catch {
    // Retain the status-based message if the provider returns non-JSON error content.
  }
  const suffix = detail ? `: ${detail.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 240)}` : "";
  return new Error(`${providerName} returned HTTP ${response.status}${suffix}.`) as Error & { status: number };
}

export type PlanProvider = Pick<ContentProvider, "name" | "model"> & { apiKey?: string; fallback?: PlanProvider };
type VideoPlanProviderSettings = {
  googleAiStudioApiKey?: string;
  googleAiStudioModel?: string;
  groqApiKey?: string;
  groqModel?: string;
  openAiApiKey?: string;
  openAiModel?: string;
};

export function selectVideoPlanProvider(settings: VideoPlanProviderSettings): PlanProvider {
  const openAiProvider: PlanProvider | undefined = settings.openAiApiKey
    ? { name: "openai", model: settings.openAiModel ?? "gpt-4o-mini", apiKey: settings.openAiApiKey }
    : undefined;
  const groqProvider: PlanProvider | undefined = settings.groqApiKey
    ? {
        name: "groq",
        model: settings.groqModel ?? "openai/gpt-oss-120b",
        apiKey: settings.groqApiKey,
        ...(openAiProvider ? { fallback: openAiProvider } : {}),
      }
    : undefined;
  const fallbackProvider = groqProvider ?? openAiProvider;
  if (!settings.googleAiStudioApiKey && fallbackProvider) return fallbackProvider;
  return {
    name: "google-ai-studio",
    model: settings.googleAiStudioModel ?? null,
    ...(settings.googleAiStudioApiKey ? { apiKey: settings.googleAiStudioApiKey } : {}),
    ...(fallbackProvider ? { fallback: fallbackProvider } : {}),
  };
}

function providerFromEnv() {
  return selectVideoPlanProvider({
    googleAiStudioApiKey: env.GOOGLE_AI_STUDIO_API_KEY,
    googleAiStudioModel: env.GOOGLE_AI_STUDIO_MODEL,
    groqApiKey: env.GROQ_API_KEY,
    groqModel: env.GROQ_MODEL,
    openAiApiKey: env.OPENAI_API_KEY,
    openAiModel: env.OPENAI_MODEL,
  });
}

export function activeVideoPlanProvider() {
  return providerFromEnv();
}

async function providerText(provider: PlanProvider, system: string, prompt: string, responseSchema: unknown) {
  if (!provider.apiKey) {
    throw new VideoPlanGenerationError(503, "No AI provider is configured. Add GOOGLE_AI_STUDIO_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY to apps/api/.env, then restart the API.");
  }
  let transientAttempts = 0;
  const schemaInstruction = `Return only valid JSON matching this exact schema. Do not wrap the result in any other key and do not add fields not listed here: ${JSON.stringify(providerResponseSchema(responseSchema))}`;
  while (true) {
    try {
      if (provider.name === "groq") {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              { role: "system", content: `${system} ${schemaInstruction}` },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.6,
            max_tokens: 8192,
          }),
          signal: AbortSignal.timeout(90_000),
        });
        if (!response.ok) {
          throw await providerHttpError(response, "Groq");
        }
        const payload = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
        const text = payload.choices?.[0]?.message?.content?.trim();
        if (!text) throw new VideoPlanGenerationError(502, "Groq returned an empty video plan response.");
        return text;
      }

      if (provider.name === "openai") {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              { role: "system", content: `${system} ${schemaInstruction}` },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.6,
            max_tokens: 8192,
          }),
          signal: AbortSignal.timeout(90_000),
        });
        if (!response.ok) {
          throw await providerHttpError(response, "OpenAI");
        }
        const payload = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
        const text = payload.choices?.[0]?.message?.content?.trim();
        if (!text) throw new VideoPlanGenerationError(502, "OpenAI returned an empty video plan response.");
        return text;
      }

      const ai = new GoogleGenAI({ apiKey: provider.apiKey });
      const response = await ai.models.generateContent({
        model: provider.model ?? env.GOOGLE_AI_STUDIO_MODEL,
        contents: prompt,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
          abortSignal: AbortSignal.timeout(90_000),
        },
      });
      if (!response.text) throw new VideoPlanGenerationError(502, "Gemini returned an empty video plan response.");
      return response.text;
    } catch (error) {
      if (error instanceof VideoPlanGenerationError) throw error;
      const status = error && typeof error === "object" && "status" in error && typeof error.status === "number"
        ? error.status
        : error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 502;
      if ((status === 429 || status === 503) && transientAttempts < 2) {
        await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** transientAttempts));
        transientAttempts += 1;
        continue;
      }
      const providerLabel = provider.name === "groq" ? "Groq" : provider.name === "openai" ? "OpenAI" : "Gemini";
      const message = status === 429
        ? `${providerLabel} rate limit or quota reached after 3 attempts. Check provider usage and try again.`
        : status === 503
          ? `${providerLabel} is temporarily overloaded (HTTP 503) after 3 attempts. Try again shortly.`
          : status === 401 || status === 403
            ? `${providerLabel} rejected the API key or project access (HTTP ${status}).`
            : `${providerLabel} video plan request failed (HTTP ${status}${error instanceof Error ? `: ${providerErrorDetail(error)}` : ""}).`;
      throw new VideoPlanGenerationError(status, message, { cause: error });
    }
  }
}
export function parseVideoPlanJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidates = fenced ? [fenced, trimmed] : [trimmed];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try to isolate a JSON object or array from any surrounding provider prose.
    }

    for (let start = 0; start < candidate.length; start += 1) {
      if (candidate[start] !== "{" && candidate[start] !== "[") continue;
      const openers: string[] = [];
      let inString = false;
      let escaped = false;
      for (let end = start; end < candidate.length; end += 1) {
        const character = candidate[end]!;
        if (inString) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === "\"") inString = false;
          continue;
        }
        if (character === "\"") {
          inString = true;
          continue;
        }
        if (character === "{" || character === "[") openers.push(character);
        else if (character === "}" || character === "]") {
          const opener = openers.pop();
          if (!opener || (opener === "{" && character !== "}") || (opener === "[" && character !== "]")) break;
          if (openers.length === 0) {
            try {
              return JSON.parse(candidate.slice(start, end + 1)) as unknown;
            } catch {
              break;
            }
          }
        }
      }
    }
  }
  throw new SyntaxError("The provider response did not contain a complete JSON document.");
}

async function generateValidated<T>(provider: PlanProvider & { apiKey?: string }, prompt: string, system: string, schema: z.ZodType<T>, jsonSchemaValue: unknown, normalize: (value: unknown) => unknown = (value) => value): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const retryPrompt = attempt === 0
      ? prompt
      : `${prompt}\n\nYour previous response failed strict validation: ${lastError instanceof Error ? lastError.message : "invalid JSON"}. Regenerate the complete response, correcting every listed issue. Count words in every dialogue line before returning: each line must contain 3 to 12 words. Use five short, alternating turns of about 4 to 6 words each, and keep the total dialogue near the requested word target. Return only complete JSON, without Markdown or explanation.`;
    let text: string;
    try {
      text = await providerText(provider, system, retryPrompt, jsonSchemaValue);
    } catch (error) {
      if (error instanceof VideoPlanGenerationError) {
        throw error;
      }
      throw new VideoPlanGenerationError(502, `Could not read a valid response from ${provider.name}: ${providerErrorDetail(error)}. Try generating the plan again.`, { cause: error });
    }

    try {
      const parsed = parseVideoPlanJson(text);
      const result = schema.safeParse(normalize(parsed));
      if (result.success) return result.data;
      lastError = new Error(result.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`)
        .join("; "));
    } catch (error) {
      lastError = error;
    }
  }
  const message = lastError instanceof Error ? lastError.message : "unknown response format";
  throw new VideoPlanGenerationError(502, `The AI provider returned an unusable plan after 3 attempts (${message}). Try generating the plan again.`, { cause: lastError });
}

async function generateVideoPlanWithProvider(request: VideoPlanRequest, provider: PlanProvider) {
  const sceneCount = request.durationSeconds / 12;
  const castSize = request.castSize ?? 3;
  const castIds = castSize === 2 ? ["A", "B"] as const : ["A", "B", "C"] as const;
  const selectedOutlineSchema = outlineSchema(castSize);
  const outlinePrompt = `First detect the most likely industry using the brief and profile, then create the story outline.
Target duration: ${request.durationSeconds} seconds. Scene count must be exactly ${sceneCount}; each scene will be 12 seconds.
Conversation treatment: ${request.conversationStyle ?? "story-driven"}.
Business profile: ${JSON.stringify(request.brand)}
Workspace business context (profile, recent posts/designs, and real analytics when present): ${request.businessContext ?? "No workspace history provided; rely only on the business profile and user brief. Do not invent industry research."}
User brief: ${request.idea}
Language: ${request.language}
Return one JSON object with exactly these top-level keys: industry, title, hook, story, cast, callToAction, scenes. Do not wrap the response in a script, plan, or result key, and do not add a script field. Each scene must have exactly goal, setting, and ahaMoment. Return a concise goal string for each scene, a supported setting, and exactly one ahaMoment: true across the outline. Include the required title, hook, story, exactly ${castSize} original stylized adult human cartoon characters (A is the customer or business owner, B is the business guide${castSize === 3 ? ", C is a relevant colleague" : ""}), call to action, and exactly ${sceneCount} scene outlines in narrative order. Honor the brief's character genders and appearance; when requested, show a man and a woman in a natural seated conversation at a cafe or meeting table. Give each character professional, distinctive clothing, natural proportions, expressive faces, and conversational body language. Give product demonstrations a clear prop close-up or visible use. Use profile facts only; never invent results, prices, offers, or guarantees. Do not imitate any existing character or studio style.`;
  const validatedOutlineSchema = selectedOutlineSchema.superRefine((value, context) => {
    if (value.scenes.length !== sceneCount) {
      context.addIssue({ code: "custom", path: ["scenes"], message: `Expected exactly ${sceneCount} scene outlines.` });
    }
    if (value.scenes.filter((scene) => scene.ahaMoment).length !== 1) {
      context.addIssue({ code: "custom", path: ["scenes"], message: "Exactly one outline scene must be the aha moment." });
    }
  });
  const outline = await generateValidated(
    provider,
    outlinePrompt,
    "You are a grounded creative director for any kind of local business. Create original stylized human cartoon characters; do not imitate existing characters or studio styles. Do not invent claims, results, prices, medical outcomes, or testimonials.",
    validatedOutlineSchema,
    outlineJsonSchema(castSize),
    (value) => normalizeGeneratedVideoOutline(value, request.brand.industry, castSize),
  );

  const generatedScenes: z.infer<typeof sceneSchema>[] = [];
  for (let start = 0; start < sceneCount; start += 5) {
    const chunk = outline.scenes.slice(start, start + 5);
    const scenePrompt = `Create only this chunk of the approved outline (scene numbers ${start + 1}-${start + chunk.length} of ${sceneCount}).
Business brief: ${request.idea}
Detected industry: ${outline.industry}
Brand name: ${request.brand.name}; brand colors: ${request.brand.colors.join(", ")}; social handle: ${request.brand.handle ?? "not configured"}
User language: ${request.language}
Props available (use one or more valid names for every scene): ${availableVideoProps.join(", ")}
Settings available: ${settingNames.join(", ")}
Each scene is a planning unit of about 12 seconds; final scene timing will be measured from generated speech, not padded. Keep on-screen headline text to six words maximum. Write exactly six dialogue turns, alternating ${castIds.join("/")}/${castIds.join("/")}/${castIds.join("/")}. Each line must have 3 to 6 words (never fewer than 3 or more than 12); count each line's words before returning. The six lines combined must contain ${getTargetDialogueWords(request.durationSeconds, sceneCount) - 4} to ${getTargetDialogueWords(request.durationSeconds, sceneCount) + 4} words inclusive. Keep each turn natural, specific, and responsive to the previous one; use contractions and occasional brief reactions. Use the chosen treatment (${request.conversationStyle ?? "story-driven"}) consistently. The narration field must be those six lines combined verbatim. Narration must match the requested language.
Established original character cast (keep appearance details, names and personalities consistent): ${JSON.stringify(outline.cast)}
Use all ${castSize} cartoon characters in every scene, with exactly ${castSize} character action entries. Describe expressive facial reactions, eye direction, body movement, and clear hand gestures to distinguish listening from speaking. Stage indoor conversations seated at a table when suitable. Make at least one character touch, tap, point to, or use a relevant product prop in the ahaMoment scene and show a visible result.
Scenes to expand: ${JSON.stringify(chunk)}
Return exactly ${chunk.length} scenes in order.`;
    const chunkSchema = z.array(generatedSceneSchema).length(chunk.length).superRefine((scenes, context) => {
      scenes.forEach((scene, index) => {
        if (scene.dialogue.some((line, lineIndex) => line.speaker !== castIds[lineIndex % castIds.length])) {
          context.addIssue({ code: "custom", path: [index, "dialogue"], message: `Dialogue must alternate through ${castIds.join(" and ")}.` });
        }
        const joinedDialogue = scene.dialogue.map((line) => line.text).join(" ");
        if (scene.narration !== joinedDialogue) {
          context.addIssue({ code: "custom", path: [index, "narration"], message: "Narration must exactly match all six dialogue turns." });
        }
        const targetWords = getTargetDialogueWords(request.durationSeconds, sceneCount);
        if (Math.abs(joinedDialogue.trim().split(/\s+/).length - targetWords) > 4) {
          context.addIssue({ code: "custom", path: [index, "dialogue"], message: `Aim for about ${targetWords} words so measured speech matches the requested runtime.` });
        }
      });
    });
    const checkedChunkSchema = chunkSchema.superRefine((scenes, context) => {
      scenes.forEach((scene, index) => {
        if (scene.ahaMoment !== chunk[index]?.ahaMoment) {
          context.addIssue({ code: "custom", path: [index, "ahaMoment"], message: "Keep the approved aha moment in its outlined scene." });
        }
        if (scene.narration.trim().split(/\s+/).length > scene.durationSeconds * 3.2) {
          context.addIssue({ code: "custom", path: [index, "narration"], message: "Narration is too long for the scene." });
        }
        if (scene.characters.length !== castSize) {
          context.addIssue({ code: "custom", path: [index, "characters"], message: `All ${castSize} conversation characters must appear in every scene.` });
        }
      });
    });
    const generated = await generateValidated(
      provider,
      scenePrompt,
      `Write practical, original dialogue scenes for a locally animated video with exactly ${castSize} stylized cartoon characters. Use only listed settings and props. Create expressive back-and-forth dialogue and physical acting directions; stage professional indoor scenes at a table when suitable. Do not imitate any existing characters or studio styles, and do not generate SVG or HTML.`,
      checkedChunkSchema,
      { type: "array", minItems: chunk.length, maxItems: chunk.length, items: sceneJsonSchema(castSize) },
      (value) => normalizeGeneratedArray(value, { outlineScenes: chunk, cast: outline.cast }),
    );
    generatedScenes.push(...generated);
  }

  return {
    provider,
    plan: videoPlanSchema.parse({ ...outline, scenes: generatedScenes }),
  };
}

export async function generateVideoPlan(request: VideoPlanRequest, provider = providerFromEnv()) {
  try {
    return await generateVideoPlanWithProvider(request, provider);
  } catch (primaryError) {
    if (!provider.fallback || !(primaryError instanceof VideoPlanGenerationError)) throw primaryError;
    try {
      return await generateVideoPlan(request, provider.fallback);
    } catch (fallbackError) {
      if (fallbackError instanceof VideoPlanGenerationError) {
        throw new VideoPlanGenerationError(
          fallbackError.status,
          `${provider.name} failed (${primaryError.message}), and its configured fallback chain also failed: ${fallbackError.message}`,
          { cause: fallbackError },
        );
      }
      throw fallbackError;
    }
  }
}
