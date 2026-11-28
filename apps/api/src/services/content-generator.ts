import { z } from "zod";
import { platformSpecs } from "@united-technologies/shared/platform-specs";
import { cloudflareChatCompletion } from "./cloudflare-ai.js";

export const contentFormats = [
  "post",
  "carousel",
  "story",
  "poster",
  "brochure",
  "flyer",
  "thumbnail",
  "video",
  "linkedin-banner",
  "pinterest-pin",
  "facebook-cover",
  "business-card",
  "festival-greeting",
  "offer-sale",
] as const;

const carouselSlideSchema = z.union([
  z.string().min(1),
  z.object({
    headline: z.string().min(1),
    subheading: z.string().default(""),
    body: z.string().default(""),
  }).strict(),
]);

export const generatedAssetSchema = z.object({
  format: z.enum(contentFormats),
  title: z.string().min(2),
  caption: z.string().min(2),
  hashtags: z.array(z.string().min(2).max(80)).max(20),
  idea: z.string().min(2),
  pillar: z.string().min(2),
  firstComment: z.string().min(2),
  platformCaptions: z.array(z.object({
    platform: z.string().min(2).max(40),
    caption: z.string().min(2),
    hashtags: z.array(z.string().min(2).max(80)).max(20),
    hook: z.string().min(2).max(500).optional(),
    title: z.string().min(2).max(500).optional(),
    description: z.string().min(2).max(63_206).optional(),
    callToAction: z.string().min(2).max(1000).optional(),
    altText: z.string().min(2).max(2000).optional(),
    bestFormat: z.string().min(2).max(40).optional(),
    formatReason: z.string().min(2).max(1000).optional(),
    imageRatio: z.string().min(2).max(20).optional(),
    recommendedTemplate: z.string().min(2).max(120).optional(),
    firstComment: z.string().min(2).max(3000).optional(),
  }).strict()).min(1).max(12),
  posterText: z.object({
    headline: z.string().min(2),
    supportingLine: z.string().min(2),
    callToAction: z.string().min(2),
  }).strict().optional(),
  slides: z.array(carouselSlideSchema).min(2).max(10).optional(),
  sections: z.array(z.string().min(1)).max(12).optional(),
  scenes: z.array(z.string().min(1)).max(20).optional(),
}).strict().superRefine((asset, context) => {
  if (asset.format === "carousel" && (!asset.slides || asset.slides.length < 2 || asset.slides.length > 10)) {
    context.addIssue({ code: "custom", path: ["slides"], message: "Carousels must contain between two and ten slides." });
  }
  if (["poster", "festival-greeting", "offer-sale"].includes(asset.format) && !asset.posterText) {
    context.addIssue({ code: "custom", path: ["posterText"], message: "Poster formats must include a headline, supporting line, and call to action." });
  }
  if (asset.format === "brochure" && (!asset.sections || asset.sections.length < 6)) {
    context.addIssue({ code: "custom", path: ["sections"], message: "Brochures must contain six sections for a two-sided tri-fold layout." });
  }
  if (asset.format === "flyer" && (!asset.sections || asset.sections.length !== 3)) {
    context.addIssue({ code: "custom", path: ["sections"], message: "Flyers must contain three concise sections for a three-column layout." });
  }
  if (asset.format === "video" && (!asset.scenes || asset.scenes.length === 0)) {
    context.addIssue({ code: "custom", path: ["scenes"], message: "Video scripts must include scenes." });
  }
});

export const generatedBundleSchema = z.object({
  items: z.array(generatedAssetSchema).min(1).max(contentFormats.length),
}).strict();

export type ContentFormat = (typeof contentFormats)[number];
export type GeneratedAsset = z.infer<typeof generatedAssetSchema>;

export type BrandContext = {
  name: string;
  industry?: string | null;
  description?: string | null;
  products?: string | null;
  audience?: string | null;
  offers?: string | null;
  tone?: string | null;
  brandVoiceRules?: string[];
  bannedWords?: string[];
  colors: string[];
};

export type VideoBrief = {
  durationSeconds: number;
  storyType: "demo-story" | "how-it-works" | "customer-success" | "day-in-the-life" | "quick-tip" | "myth-vs-fact" | "announcement" | "testimonial";
  visualStyle: "b-roll" | "talking-head" | "product-demo" | "kinetic-type";
  narration: "voiceover" | "on-camera" | "text-only";
  musicMood: "none" | "upbeat" | "calm" | "cinematic" | "playful";
  imageDirection: string;
  onScreenText: boolean;
};

export type ContentRequest = {
  idea: string;
  formats: ContentFormat[];
  carouselSlideCount?: number;
  platforms: string[];
  tone: string;
  language: string;
  brand: BrandContext;
  template?: { name: string; layout: string };
  videoBrief?: VideoBrief;
  businessContext?: {
    brief: string;
    recentPosts: Array<{ title: string | null; caption: string; status: string; createdAt: string }>;
    recentDesigns: Array<{ title: string; status: string; createdAt: string }>;
    analytics: { available: boolean; summary: string; postCount: number };
    knowledge: { guidance: string[]; limitation: string };
  };
};

export type ContentProvider = {
  name: "cloudflare" | "groq" | "openai";
  model: string | null;
  generate(request: ContentRequest): Promise<GeneratedAsset[]>;
};
export class ContentProviderError extends Error {
  constructor(
    readonly provider: ContentProvider["name"],
    readonly status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ContentProviderError";
  }
}

const generationSystemPrompt = "Return only valid JSON with an items array. Each item must have format, title, caption, hashtags, idea, pillar, firstComment, and platformCaptions (one object for every requested platform with platform, hook, caption, title, description, hashtags, callToAction, firstComment, altText, bestFormat, formatReason, imageRatio, recommendedTemplate where appropriate); include posterText for posters, festival greetings, and offers. Omit only fields that genuinely do not apply. Write genuinely distinct, native-feeling platform versions instead of copying the same caption: adapt hook, length, CTA, hashtags, and structure to the platform's audience and use the provided platform guidance as a conservative target. For YouTube use a title and description; for Pinterest use a pin title and description; for all platforms provide a rationale for a useful format and a suitable template recommendation, without claiming external registry selection unless a template is supplied. Include concise alt text describing only provided/generated visual details. Use supplied brand voice rules and banned words. Never invent statistics, customer names, awards, results, offers, or facts. For carousels, return exactly carouselSlideCount slides as objects with headline, subheading, and body. Treat the user's request as source material and creative direction, not text to copy verbatim: never repeat instructions such as 'create a carousel' or 'write six slides' as slide content. Distribute the useful details from the brief across the requested number of slides in a clear story; make every headline distinct and bold-ready, each subheading a concise supporting point, and each body a short, readable explanation. Do not invent facts or add generic filler. For flyers, provide exactly 3 concise sections that fit three columns on one sheet. For brochures, provide 6 concise sections for a two-sided tri-fold. For video, follow videoBrief.storyType and turn the business brief into a specific, audience-aware screenplay with a compelling first-three-second hook, a concrete beginning/middle/end, and one natural call to action. Show the problem and solution in observable actions, with believable short dialogue between distinct speakers (label each speaker), scene setting and camera direction where useful, and a practical demonstration of the product or service based only on supplied facts. Return enough concise scenes to cover videoBrief.durationSeconds, planning roughly 2.2 spoken words per second and never exceeding 20 scenes. Keep dialogue concise enough to fit the target length; do not pad with repeated ideas. Include spoken dialogue in each scene so it can be narrated; do not return headings alone. Never invent customers, testimonials, results, metrics, prices, medical outcomes, or other claims. Mark testimonial-style scripts as dramatized unless the user supplied an actual approved testimonial. Never include timestamps or time ranges. Follow visualStyle, narration, musicMood, imageDirection, and onScreenText. Avoid filler and generic placeholders. Do not claim to render video, source licensed music, or generate image files. Keep every claim grounded in the supplied brand details. When businessContext is supplied, use prior workspace content only to understand voice and avoid repetition; treat performance advice as limited when analyticsAvailable is false. Use its knowledge guidance but do not imply external research or verified industry statistics.";

function parseGeneratedBundle(text: string, request: ContentRequest) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("Content provider returned invalid JSON.", { cause: error });
  }
  const bundle = generatedBundleSchema.parse(parsed);
  const returnedFormats = new Set(bundle.items.map((item) => item.format));
  if (bundle.items.length !== request.formats.length || returnedFormats.size !== request.formats.length ||
    request.formats.some((format) => !returnedFormats.has(format))) {
    throw new Error("Content provider did not return exactly one item for every requested format.");
  }
  if (bundle.items.some((item) =>
    item.platformCaptions.length !== request.platforms.length ||
    request.platforms.some((platform) => !item.platformCaptions.some((entry) => entry.platform === platform)),
  )) {
    throw new Error("Content provider did not return a preview for every requested platform.");
  }
  const carousel = bundle.items.find((item) => item.format === "carousel");
  if (carousel && carousel.slides?.length !== (request.carouselSlideCount ?? 6)) {
    throw new Error(`Content provider did not return exactly ${request.carouselSlideCount ?? 6} carousel slides.`);
  }
  const generatedCopy = bundle.items.flatMap((item) => [
    item.title,
    item.caption,
    item.idea,
    item.pillar,
    item.firstComment,
    ...item.hashtags,
    ...item.platformCaptions.flatMap((platform) => Object.values(platform)),
    ...(item.posterText ? Object.values(item.posterText) : []),
    ...(item.slides?.flatMap((slide) => typeof slide === "string" ? [slide] : Object.values(slide)) ?? []),
    ...(item.sections ?? []),
    ...(item.scenes ?? []),
  ]).filter((value): value is string => typeof value === "string");
  const containsPlaceholder = generatedCopy.some((text) => {
    return /\[(?:your\s+)?(?:brand|business|product|service)\]/i.test(text) ||
      /\b(?:lorem ipsum|replace me|insert (?:brand|business|product|service))\b/i.test(text);
  });
  if (containsPlaceholder) {
    throw new Error("Generated content still contains an unresolved template placeholder.");
  }
  return bundle.items;
}

function requestContent(request: ContentRequest) {
  return JSON.stringify({
    request: request.idea,
    formats: request.formats,
    ...(request.formats.includes("carousel") ? { carouselSlideCount: request.carouselSlideCount ?? 6 } : {}),
    platforms: request.platforms,
    platformGuidance: Object.fromEntries(request.platforms.map((platform) => [
      platform,
      Object.hasOwn(platformSpecs, platform) ? platformSpecs[platform as keyof typeof platformSpecs] : null,
    ])),
    tone: request.tone,
    language: request.language,
    brand: request.brand,
    ...(request.template ? { template: request.template } : {}),
    ...(request.videoBrief ? { videoBrief: request.videoBrief } : {}),
    ...(request.businessContext ? { businessContext: request.businessContext } : {}),
  });
}

function groqResponseSchema(request: ContentRequest) {
  const stringArray = { type: "array", items: { type: "string" } };
  const platformCaptions = {
    type: "array",
    minItems: request.platforms.length,
    maxItems: request.platforms.length,
    items: {
      type: "object",
      properties: {
        platform: { type: "string", enum: request.platforms },
        caption: { type: "string" },
        hashtags: stringArray,
        hook: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        callToAction: { type: "string" },
        altText: { type: "string" },
        bestFormat: { type: "string" },
        formatReason: { type: "string" },
        imageRatio: { type: "string" },
        recommendedTemplate: { type: "string" },
        firstComment: { type: "string" },
      },
      required: ["platform", "caption", "hashtags"],
      additionalProperties: false,
    },
  };
  const properties = {
    format: { type: "string", enum: request.formats },
    title: { type: "string" },
    caption: { type: "string" },
    hashtags: stringArray,
    idea: { type: "string" },
    pillar: { type: "string" },
    firstComment: { type: "string" },
    platformCaptions,
    posterText: {
      type: "object",
      properties: {
        headline: { type: "string" },
        supportingLine: { type: "string" },
        callToAction: { type: "string" },
      },
      required: ["headline", "supportingLine", "callToAction"],
      additionalProperties: false,
    },
    slides: {
      type: "array",
      minItems: request.carouselSlideCount ?? 6,
      maxItems: request.carouselSlideCount ?? 6,
      items: {
        type: "object",
        properties: {
          headline: { type: "string" },
          subheading: { type: "string" },
          body: { type: "string" },
        },
        required: ["headline", "subheading", "body"],
        additionalProperties: false,
      },
    },
    sections: stringArray,
    scenes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20 },
  };
  const required = ["format", "title", "caption", "hashtags", "idea", "pillar", "firstComment", "platformCaptions"];
  const requiredByFormat: Partial<Record<ContentFormat, string[]>> = {
    carousel: ["slides"],
    poster: ["posterText"],
    "festival-greeting": ["posterText"],
    "offer-sale": ["posterText"],
    brochure: ["sections"],
    flyer: ["sections"],
    video: ["scenes"],
  };

  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        minItems: request.formats.length,
        maxItems: request.formats.length,
        items: {
          anyOf: request.formats.map((format) => ({
            type: "object",
            properties: { ...properties, format: { type: "string", enum: [format] } },
            required: [...required, ...(requiredByFormat[format] ?? [])],
            additionalProperties: false,
          })),
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  };
}

export class CloudflareContentProvider implements ContentProvider {
  name: ContentProvider["name"] = "cloudflare";

  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    public model: string,
    private readonly fallback?: ContentProvider,
  ) {}

  async generate(request: ContentRequest) {
    try {
      return await this.generateWithCloudflare(request);
    } catch (error) {
      if (!this.fallback) throw error;
      const generated = await this.fallback.generate(request);
      this.name = this.fallback.name;
      this.model = this.fallback.model ?? this.model;
      return generated;
    }
  }

  private async generateWithCloudflare(request: ContentRequest) {
    let lastValidationError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let transientAttempts = 0;
      let text: string | undefined;
      while (true) {
        try {
          text = await cloudflareChatCompletion({
            accountId: this.accountId,
            apiToken: this.apiToken,
            model: this.model,
            messages: [
              { role: "system", content: `${generationSystemPrompt} Return a JSON object with the required items array.` },
              {
                role: "user",
                content: `${requestContent(request)}${attempt === 0 ? "" : `\n\nCorrect the previous response so it satisfies the required JSON schema. Validation issue: ${lastValidationError instanceof Error ? lastValidationError.message : "invalid JSON"}. Return only the corrected JSON.`}`,
              },
            ],
            responseFormat: { type: "json_object" },
            temperature: 0.7,
            maxTokens: 8192,
            timeoutMs: 45_000,
          });
          break;
        } catch (error) {
          const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 502;
          if ((status === 429 || status === 503) && transientAttempts < 2) {
            await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** transientAttempts));
            transientAttempts += 1;
            continue;
          }
          const message = status === 503
            ? "Cloudflare Workers AI is temporarily overloaded (HTTP 503). The request was attempted 3 times; try again shortly."
            : status === 429
              ? "Cloudflare Workers AI rate limit or quota reached (HTTP 429). The request was attempted 3 times; check Workers AI usage and try again."
              : status === 401 || status === 403
                ? `Cloudflare Workers AI rejected the API token or account permissions (HTTP ${status}). Verify CLOUDFLARE_API_TOKEN and Workers AI permissions.`
                : status === 404
                  ? `The configured Cloudflare Workers AI model was not found (HTTP 404). Check CLOUDFLARE_TEXT_MODEL.`
                  : `Cloudflare Workers AI could not generate content (HTTP ${status}).`;
          throw new ContentProviderError("cloudflare", status, message, { cause: error });
        }
      }
      if (!text?.trim()) {
        lastValidationError = new Error("Cloudflare Workers AI returned an empty response.");
        continue;
      }
      try {
        return parseGeneratedBundle(text, request);
      } catch (error) {
        lastValidationError = error;
      }
    }
    throw new ContentProviderError(
      "cloudflare",
      502,
      `Cloudflare Workers AI returned invalid content twice (${lastValidationError instanceof Error ? lastValidationError.message : "invalid JSON"}). Try generating again.`,
      { cause: lastValidationError },
    );
  }
}

export class GroqContentProvider implements ContentProvider {
  name: ContentProvider["name"] = "groq";

  constructor(
    private readonly apiKey: string,
    public model: string,
    private readonly fallback?: ContentProvider,
  ) {}

  async generate(request: ContentRequest) {
    try {
      return await this.generateWithGroq(request);
    } catch (error) {
      if (!this.fallback) throw error;
      const generated = await this.fallback.generate(request);
      this.name = this.fallback.name;
      this.model = this.fallback.model ?? this.model;
      return generated;
    }
  }

  private async generateWithGroq(request: ContentRequest) {
    let lastValidationError: unknown;
    for (let validationAttempt = 0; validationAttempt < 2; validationAttempt += 1) {
      let response: Response | undefined;
      for (let transientAttempt = 0; transientAttempt < 3; transientAttempt += 1) {
        try {
          response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: this.model,
              messages: [
                { role: "system", content: `${generationSystemPrompt} Return a JSON object with the required items array.` },
                {
                  role: "user",
                  content: `${requestContent(request)}${validationAttempt === 0 ? "" : `\n\nCorrect the prior response. Validation issue: ${lastValidationError instanceof Error ? lastValidationError.message : "invalid JSON"}. Return only valid JSON, with every required field for the selected format.`}`,
                },
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "generated_social_content",
                  strict: false,
                  schema: groqResponseSchema(request),
                },
              },
              temperature: 0.7,
              max_tokens: 8192,
            }),
            signal: AbortSignal.timeout(45_000),
          });
        } catch (error) {
          if (transientAttempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** transientAttempt));
            continue;
          }
          throw new ContentProviderError("groq", 502, "Groq could not be reached after 3 attempts.", { cause: error });
        }
        if (response.ok) break;
        if ((response.status === 429 || response.status === 503) && transientAttempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** transientAttempt));
          continue;
        }
        const status = response.status;
        const message = status === 429
          ? "Groq rate limit or quota reached after 3 attempts. Check Groq usage and try again."
          : status === 503
            ? "Groq is temporarily unavailable after 3 attempts. Try again shortly."
            : status === 401 || status === 403
              ? `Groq rejected the API key or project access (HTTP ${status}). Verify GROQ_API_KEY.`
              : status === 404
                ? `Groq model "${this.model}" was not found or is no longer available. Update GROQ_MODEL in apps/api/.env.`
                : `Groq could not generate content (HTTP ${status}).`;
        throw new ContentProviderError("groq", status, message);
      }

      try {
        const payload = await response!.json() as {
          choices?: Array<{ message?: { content?: string | null } }>;
        };
        const text = payload.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error("Groq returned an empty response.");
        return parseGeneratedBundle(text, request);
      } catch (error) {
        lastValidationError = error;
      }
    }
    throw new ContentProviderError(
      "groq",
      502,
      `Groq returned invalid content twice (${lastValidationError instanceof Error ? lastValidationError.message : "invalid JSON"}). Try generating again.`,
      { cause: lastValidationError },
    );
  }
}

export class OpenAiContentProvider implements ContentProvider {
  readonly name = "openai" as const;

  constructor(private readonly apiKey: string, readonly model: string) {}

  async generate(request: ContentRequest) {
    let lastValidationError: unknown;
    for (let validationAttempt = 0; validationAttempt < 2; validationAttempt += 1) {
      let response: Response | undefined;
      for (let transientAttempt = 0; transientAttempt < 3; transientAttempt += 1) {
        try {
          response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: this.model,
              messages: [
                { role: "system", content: `${generationSystemPrompt} Return only a JSON object with the required items array.` },
                {
                  role: "user",
                  content: `${requestContent(request)}${validationAttempt === 0 ? "" : `\n\nCorrect the prior response. Validation issue: ${lastValidationError instanceof Error ? lastValidationError.message : "invalid JSON"}. Return only valid JSON with every required field for the selected format.`}`,
                },
              ],
              response_format: { type: "json_object" },
              temperature: 0.7,
              max_tokens: 8192,
            }),
            signal: AbortSignal.timeout(45_000),
          });
        } catch (error) {
          if (transientAttempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** transientAttempt));
            continue;
          }
          throw new ContentProviderError("openai", 502, "OpenAI could not be reached after 3 attempts.", { cause: error });
        }
        if (response.ok) break;
        if ((response.status === 429 || response.status === 503) && transientAttempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** transientAttempt));
          continue;
        }
        const status = response.status;
        const message = status === 429
          ? "OpenAI rate limit or quota reached after 3 attempts. Check OpenAI API billing and project limits."
          : status === 503
            ? "OpenAI is temporarily unavailable after 3 attempts. Try again shortly."
            : status === 401 || status === 403
              ? `OpenAI rejected the API key or project access (HTTP ${status}). Verify OPENAI_API_KEY.`
              : status === 404
                ? `OpenAI model "${this.model}" was not found or is unavailable. Update OPENAI_MODEL.`
                : `OpenAI could not generate content (HTTP ${status}).`;
        throw new ContentProviderError("openai", status, message);
      }

      try {
        const payload = await response!.json() as {
          choices?: Array<{ message?: { content?: string | null } }>;
        };
        const text = payload.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error("OpenAI returned an empty response.");
        return parseGeneratedBundle(text, request);
      } catch (error) {
        lastValidationError = error;
      }
    }
    throw new ContentProviderError(
      "openai",
      502,
      `OpenAI returned invalid content twice (${lastValidationError instanceof Error ? lastValidationError.message : "invalid JSON"}). Try generating again.`,
      { cause: lastValidationError },
    );
  }
}

export function selectContentProvider(
  settings: {
    cloudflareAccountId?: string;
    cloudflareApiToken?: string;
    cloudflareModel?: string;
    groqApiKey?: string;
    groqModel?: string;
    openAiApiKey?: string;
    openAiModel?: string;
  },
): ContentProvider {
  const openAiProvider = settings.openAiApiKey
    ? new OpenAiContentProvider(settings.openAiApiKey, settings.openAiModel ?? "gpt-4o-mini")
    : undefined;
  const groqProvider = settings.groqApiKey
    ? new GroqContentProvider(settings.groqApiKey, settings.groqModel ?? "openai/gpt-oss-120b", openAiProvider)
    : undefined;
  if (settings.cloudflareAccountId && settings.cloudflareApiToken) {
    return new CloudflareContentProvider(
      settings.cloudflareAccountId,
      settings.cloudflareApiToken,
      settings.cloudflareModel ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      groqProvider ?? openAiProvider,
    );
  }
  if (groqProvider) return groqProvider;
  if (openAiProvider) return openAiProvider;
  throw new ContentProviderError(
    "cloudflare",
    503,
    "No text AI provider is configured. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, GROQ_API_KEY, or OPENAI_API_KEY to apps/api/.env, then restart the API.",
  );
}
