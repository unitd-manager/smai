import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "../env.js";

export const campaignObjectives = [
  "Brand Awareness",
  "Audience Growth",
  "Lead Generation",
  "Sales & Conversions",
  "Product/Service Launch",
  "Website Traffic",
  "Engagement & Community Building",
  "Event Promotion",
  "Customer Retention",
  "Re-engagement",
  "Upselling & Cross-selling",
  "Referral Generation",
  "Seasonal/Promotional Campaign",
] as const;

const shortText = z.string().trim().min(2).max(1000);
const campaignStrategySchema = z.object({
  concepts: z.array(z.object({
    name: z.string().trim().min(2).max(100),
    idea: shortText,
    rationale: shortText,
    audienceFit: z.number().min(0).max(100),
    originality: z.number().min(0).max(100),
    feasibility: z.number().min(0).max(100),
    potentialImpact: z.number().min(0).max(100),
    risks: z.array(z.string().trim().min(2).max(300)).max(4),
  }).strict()).length(3),
  recommendedConcept: z.string().trim().min(2).max(100),
  audience: z.object({
    idealCustomerProfile: shortText,
    demographics: z.string().trim().max(600),
    interestsAndBehaviors: z.array(shortText).max(8),
    motivations: z.array(shortText).max(8),
    painPoints: z.array(shortText).max(8),
    objections: z.array(shortText).max(8),
    buyingTriggers: z.array(shortText).max(8),
    contentPreferences: z.array(shortText).max(8),
    awarenessLevel: shortText,
    journeyStage: shortText,
    segments: z.array(z.object({
      name: z.string().trim().min(2).max(100),
      description: shortText,
      intent: z.enum(["high", "medium", "low"]),
      message: shortText,
    }).strict()).min(1).max(5),
    decisionFactors: z.array(shortText).max(8),
  }).strict(),
  positioning: z.object({
    coreMessage: shortText,
    uniqueSellingProposition: shortText,
    valueProposition: shortText,
    differentiation: shortText,
    narrative: shortText,
    theme: shortText,
    visualDirection: shortText,
    tone: shortText,
    offer: z.object({
      recommendation: shortText,
      confirmationRequired: z.boolean(),
      safeguard: shortText,
    }).strict(),
    hooks: z.array(shortText).min(3).max(5),
    primaryCta: shortText,
    secondaryCta: shortText,
    contentPillars: z.array(z.object({
      name: z.string().trim().min(2).max(80),
      purpose: shortText,
    }).strict()).min(3).max(6),
  }).strict(),
  channelStrategy: z.array(z.object({
    platform: z.string().trim().min(2).max(40),
    role: shortText,
    format: shortText,
    frequency: shortText,
    distribution: shortText,
    paidApproach: z.enum(["organic", "optional-paid-test"]),
    reason: shortText,
  }).strict()).min(1).max(12),
  funnel: z.array(z.object({
    stage: z.enum(["Awareness", "Consideration", "Conversion", "Retention"]),
    purpose: shortText,
    contentApproach: shortText,
    callToAction: shortText,
  }).strict()).min(1).max(4),
  timeline: z.array(z.object({
    phase: z.string().trim().min(2).max(80),
    startDay: z.number().int().min(1).max(30),
    endDay: z.number().int().min(1).max(30),
    objective: shortText,
  }).strict()).min(2).max(8),
  contentSequence: z.array(z.object({
    day: z.number().int().min(1).max(30),
    phase: z.string().trim().min(2).max(80),
    funnelStage: z.enum(["Awareness", "Consideration", "Conversion", "Retention"]),
    pillar: z.string().trim().min(2).max(80),
    topic: shortText,
    hook: shortText,
    callToAction: shortText,
  }).strict()).min(1).max(30),
  tasks: z.array(z.object({
    title: z.string().trim().min(2).max(120),
    description: shortText,
    priority: z.enum(["high", "medium", "low"]),
    dueDay: z.number().int().min(1).max(30),
    dependsOn: z.array(z.string().trim().min(2).max(120)).max(5),
  }).strict()).min(3).max(12),
  paidMedia: z.object({
    recommended: z.boolean(),
    rationale: shortText,
    lowBudgetTest: shortText,
    balanced: shortText,
    scaleOption: shortText,
    measurement: z.array(shortText).max(5),
  }).strict(),
  experiments: z.array(z.object({
    variable: z.string().trim().min(2).max(80),
    hypothesis: shortText,
    metric: z.string().trim().min(2).max(80),
    duration: z.string().trim().min(2).max(80),
    decisionRule: shortText,
  }).strict()).min(2).max(5),
  trackingRecommendations: z.array(shortText).min(2).max(8),
  assumptions: z.array(shortText).max(8),
}).strict();

export type CampaignStrategy = z.infer<typeof campaignStrategySchema>;

export type CampaignStrategyRequest = {
  name: string;
  objective: (typeof campaignObjectives)[number];
  goal: string;
  audience: string;
  startsAt: string;
  endsAt: string;
  durationDays: number;
  platforms: string[];
  formats: string[];
  primaryKpi: { metric: string; target: string };
  budget: string;
  brand: {
    name: string;
    industry: string | null;
    description: string | null;
    products: string | null;
    audience: string | null;
    offers: string | null;
    tone: string | null;
    voiceRules: string[];
    bannedWords: string[];
    colors: string[];
  };
  contentAudit: {
    existingDrafts: Array<{ title: string; format: string; createdAt: string }>;
    availableAssets: Array<{ fileName: string; mimeType: string }>;
    analyticsAvailable: boolean;
  };
  marketingBrainInsights: Array<{ title: string; explanation: string }>;
  competitorInsights: Array<{ competitorName: string; summary: string; opportunities: string[] }>;
  history: Array<{ name: string; objective: string; status: string }>;
};

function makePrompt(request: CampaignStrategyRequest, correction?: string) {
  return `Create an evidence-conscious, actionable campaign strategy from this brief.

INPUT JSON:
${JSON.stringify(request)}

Return ONLY one JSON object with exactly these top-level keys and shapes:
{
  "concepts":[{"name":"string","idea":"string","rationale":"string","audienceFit":0,"originality":0,"feasibility":0,"potentialImpact":0,"risks":["string"]}],
  "recommendedConcept":"one concepts[].name",
  "audience":{"idealCustomerProfile":"string","demographics":"string or empty","interestsAndBehaviors":["string"],"motivations":["string"],"painPoints":["string"],"objections":["string"],"buyingTriggers":["string"],"contentPreferences":["string"],"awarenessLevel":"string","journeyStage":"string","segments":[{"name":"string","description":"string","intent":"high|medium|low","message":"string"}],"decisionFactors":["string"]},
  "positioning":{"coreMessage":"string","uniqueSellingProposition":"string","valueProposition":"string","differentiation":"string","narrative":"string","theme":"string","visualDirection":"string","tone":"string","offer":{"recommendation":"string","confirmationRequired":true,"safeguard":"string"},"hooks":["string"],"primaryCta":"string","secondaryCta":"string","contentPillars":[{"name":"string","purpose":"string"}]},
  "channelStrategy":[{"platform":"an input platform","role":"string","format":"string","frequency":"string","distribution":"string","paidApproach":"organic|optional-paid-test","reason":"string"}],
  "funnel":[{"stage":"Awareness|Consideration|Conversion|Retention","purpose":"string","contentApproach":"string","callToAction":"string"}],
  "timeline":[{"phase":"string","startDay":1,"endDay":1,"objective":"string"}],
  "contentSequence":[{"day":1,"phase":"string","funnelStage":"Awareness|Consideration|Conversion|Retention","pillar":"string","topic":"string","hook":"string","callToAction":"string"}],
  "tasks":[{"title":"string","description":"string","priority":"high|medium|low","dueDay":1,"dependsOn":["task title"]}],
  "paidMedia":{"recommended":false,"rationale":"string","lowBudgetTest":"string","balanced":"string","scaleOption":"string","measurement":["string"]},
  "experiments":[{"variable":"string","hypothesis":"string","metric":"string","duration":"string","decisionRule":"string"}],
  "trackingRecommendations":["string"],
  "assumptions":["string"]
}

Rules:
- Return exactly 3 distinct concepts, score each from 0 to 100, and set recommendedConcept to one of their exact names.
- Return exactly ${request.durationDays} contentSequence entries, numbered 1 through ${request.durationDays}, with distinct topics and a deliberate funnel-aware sequence. Use only the selected platforms and requested duration.
- Channel strategies must cover only the selected platforms: ${request.platforms.join(", ")}. These are recommendations; do not imply those platforms are connected or publishable.
- The primary success metric and target are fixed by the user: ${request.primaryKpi.metric} = ${request.primaryKpi.target}. Do not replace or invent a numeric target. Add supporting measurable metrics and explain how to track them.
- Do not invent customer facts, demographics, offers, testimonials, product claims, competitor findings, market statistics, trends, search volumes, or historical performance. When evidence is absent, mark it as a hypothesis or assumption and recommend validation.
- There is no external market, keyword, trend, or competitor research integration. State that limitation in assumptions. Never present model-generated market claims as researched facts.
- Existing content and media are listed in contentAudit. Suggest reuse where relevant; do not claim performance without analytics.
- Apply the supplied active Marketing Brain insights where relevant; do not turn recommendations into proven performance claims.
- Apply supplied competitor insights only as evidence-limited strategic hypotheses. Do not copy competitor wording, creative assets, claims, or branding; generate differentiated original work.
- If no analyzed competitor evidence is supplied, do not invent competitive strengths, weaknesses, or activity.
- Offers are recommendations only. Set confirmationRequired=true for unverified discounts, scarcity, guarantees, and incentives. Never create artificial urgency or claim an unconfirmed offer exists.
- Paid media is optional advice only. Do not imply campaigns can be launched through ad integrations. Use relative budget guidance, not a currency forecast.
- Generate 3 to 5 non-repetitive hooks and 3 to 6 content pillars. Use the brand's tone and avoid banned words.
- Timeline day ranges must fit 1..${request.durationDays}, cover the campaign without gaps, and be in chronological order. Content sequence phase names should correspond to timeline phases.
- Create 3 to 12 executable tasks with realistic due days and dependencies that refer to task titles.
- Keep recommendations specific to the stated objective, audience, brand, and products.
${correction ? `\nThe last response failed validation: ${correction}\nReturn a corrected complete JSON object only.` : ""}`;
}

function parseStrategy(text: string, request: CampaignStrategyRequest) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const strategy = campaignStrategySchema.parse(JSON.parse(cleaned));
  if (!strategy.concepts.some((concept) => concept.name === strategy.recommendedConcept)) {
    throw new Error("The recommended campaign concept must match one of the returned concepts.");
  }
  if (strategy.contentSequence.length !== request.durationDays ||
    strategy.contentSequence.some((item, index) => item.day !== index + 1)) {
    throw new Error(`Return exactly ${request.durationDays} content recommendations numbered from day 1.`);
  }
  if (strategy.channelStrategy.length !== request.platforms.length ||
    strategy.channelStrategy.some((channel) => !request.platforms.includes(channel.platform)) ||
    request.platforms.some((platform) => !strategy.channelStrategy.some((channel) => channel.platform === platform))) {
    throw new Error("Return one channel strategy for each selected platform and no unselected platforms.");
  }
  let nextDay = 1;
  for (const phase of strategy.timeline) {
    if (phase.startDay !== nextDay || phase.endDay < phase.startDay) {
      throw new Error("Timeline phases must be chronological, contiguous, and cover the full campaign.");
    }
    nextDay = phase.endDay + 1;
  }
  if (nextDay !== request.durationDays + 1) {
    throw new Error(`Timeline phases must cover every campaign day from 1 through ${request.durationDays}.`);
  }
  return strategy;
}

async function generateWithGemini(prompt: string) {
  if (!env.GOOGLE_AI_STUDIO_API_KEY) throw new Error("Gemini is not configured.");
  const ai = new GoogleGenAI({ apiKey: env.GOOGLE_AI_STUDIO_API_KEY });
  const response = await ai.models.generateContent({
    model: env.GOOGLE_AI_STUDIO_MODEL,
    contents: prompt,
    config: {
      systemInstruction: "You are a careful marketing strategist. Follow the requested JSON contract. Separate supplied facts from hypotheses.",
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
      abortSignal: AbortSignal.timeout(60_000),
    },
  });
  if (!response.text?.trim()) throw new Error("Gemini returned an empty strategy.");
  return response.text;
}

async function generateWithOpenAiCompatible(
  provider: "groq" | "openai",
  key: string,
  model: string,
  prompt: string,
) {
  const url = provider === "groq"
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are a careful marketing strategist. Follow the requested JSON contract. Separate supplied facts from hypotheses." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.6,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${provider} returned HTTP ${response.status}.`);
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = result.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${provider} returned an empty strategy.`);
  return text;
}

export async function generateCampaignStrategy(request: CampaignStrategyRequest) {
  const providers: Array<{ name: string; generate: (prompt: string) => Promise<string> }> = [];
  if (env.GOOGLE_AI_STUDIO_API_KEY) {
    providers.push({ name: "google-ai-studio", generate: generateWithGemini });
  }
  if (env.GROQ_API_KEY) {
    providers.push({
      name: "groq",
      generate: (prompt) => generateWithOpenAiCompatible("groq", env.GROQ_API_KEY!, env.GROQ_MODEL, prompt),
    });
  }
  if (env.OPENAI_API_KEY) {
    providers.push({
      name: "openai",
      generate: (prompt) => generateWithOpenAiCompatible("openai", env.OPENAI_API_KEY!, env.OPENAI_MODEL, prompt),
    });
  }
  if (!providers.length) {
    throw new Error("Configure GOOGLE_AI_STUDIO_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY to generate campaign strategy.");
  }

  const failures: string[] = [];
  for (const provider of providers) {
    let correction: string | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const text = await provider.generate(makePrompt(request, correction));
        return { strategy: parseStrategy(text, request), provider: provider.name };
      } catch (error) {
        correction = error instanceof Error ? error.message : "Invalid JSON response.";
        failures.push(`${provider.name}: ${correction}`);
      }
    }
  }
  throw new Error(`Campaign strategy could not be generated by any configured AI provider. ${failures.join(" | ")}`);
}

export { campaignStrategySchema };
