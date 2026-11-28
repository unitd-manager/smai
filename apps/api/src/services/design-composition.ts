import { z } from "zod";
import { getReadableDesignTextColor, type DesignDocument, type DesignLayer } from "@united-technologies/shared/design-document";
import { cloudflareAiConfigured, env } from "../env.js";
import { cloudflareChatCompletion } from "./cloudflare-ai.js";

const planSchema = z.object({
  pages: z.array(z.object({
    pageIndex: z.number().int().nonnegative(),
    background: z.string().regex(/^#[\da-f]{6}$/i),
    placements: z.array(z.object({
      id: z.string().min(1),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().gt(0).max(1),
      height: z.number().gt(0).max(1),
      fill: z.string().regex(/^#[\da-f]{6}$/i).optional(),
      color: z.string().regex(/^#[\da-f]{6}$/i).optional(),
      fontScale: z.number().min(0.012).max(0.18).optional(),
      weight: z.number().int().min(300).max(900).optional(),
      align: z.enum(["left", "center", "right"]).optional(),
      typeStyle: z.enum(["brand", "display", "body"]).optional(),
    }).strict()).min(1).max(80),
  }).strict()).min(1).max(12),
}).strict();

type Plan = z.infer<typeof planSchema>;
type Placement = Plan["pages"][number]["placements"][number];

function textBackgroundColor(
  text: Extract<DesignLayer, { type: "text" }>,
  layers: DesignLayer[],
  placements: Map<string, Placement>,
  pageWidth: number,
  pageHeight: number,
  fallback: string,
  layerOrder: Map<string, number>,
) {
  const textPlacement = placements.get(text.id);
  if (!textPlacement) return fallback;
  const textX = textPlacement.x * pageWidth;
  const textY = textPlacement.y * pageHeight;
  const textWidth = textPlacement.width * pageWidth;
  const textHeight = textPlacement.height * pageHeight;
  let background = fallback;
  let backgroundOrder = -1;
  for (const layer of layers) {
    if (layer.type !== "shape" || layer.shape !== "rectangle" || (layer.opacity ?? 1) < 0.9) continue;
    const order = layerOrder.get(layer.id) ?? -1;
    if (order >= (layerOrder.get(text.id) ?? Number.MAX_SAFE_INTEGER) || order < backgroundOrder) continue;
    const placement = placements.get(layer.id);
    if (!placement) continue;
    const x = placement.x * pageWidth;
    const y = placement.y * pageHeight;
    const width = placement.width * pageWidth;
    const height = placement.height * pageHeight;
    const overlapWidth = Math.max(0, Math.min(textX + textWidth, x + width) - Math.max(textX, x));
    const overlapHeight = Math.max(0, Math.min(textY + textHeight, y + height) - Math.max(textY, y));
    if (overlapWidth * overlapHeight / Math.max(1, textWidth * textHeight) < 0.9) continue;
    const fill = placement.color ?? placement.fill ?? layer.fill;
    if (!fill || !/^#[\da-f]{6}$/i.test(fill)) continue;
    background = fill;
    backgroundOrder = order;
  }
  return background;
}

function flatten(layers: DesignLayer[]): DesignLayer[] {
  return layers.flatMap((layer) => layer.type === "group" ? flatten(layer.children) : [layer]);
}

function buildPrompt(document: DesignDocument, format: string, title: string, colors: string[], fonts: string[]) {
  const pages = document.pages.map((page, pageIndex) => ({
    pageIndex,
    width: page.width,
    height: page.height,
    role: page.role ?? "content",
    elements: flatten(page.layers).map((layer) => ({
      id: layer.id,
      type: layer.type,
      current: { x: layer.x / page.width, y: layer.y / page.height, width: layer.width / page.width, height: layer.height / page.height },
      ...(layer.type === "text" ? { text: layer.text.slice(0, 600), fontSize: layer.fontSize } : {}),
      ...(layer.type === "shape" ? { shape: layer.shape } : {}),
    })),
  }));
  return `You are a senior editorial graphic designer. Create a polished, production-ready composition for this ${format} titled "${title}". Establish one clear focal point, a deliberate reading order, generous negative space, and a consistent alignment grid. Keep every text layer inside a 6% safe margin; never crop, collide, or stack text layers. Reserve distinct boxes for brand, headline, supporting copy, and call to action. Use a strong but restrained type scale: headline largest, supporting copy comfortably readable, labels smallest. Align related edges and use consistent spacing. Avoid generic centered-card layouts and decorative clutter. For posters, make the headline and focal image dominant, keep details grouped and aligned, and make the CTA easy to find. Return JSON only matching {"pages":[{"pageIndex":0,"background":"#hex","placements":[{"id":"existing-layer-id","x":0.1,"y":0.1,"width":0.8,"height":0.2,"fill":"#hex","color":"#hex","fontScale":0.05,"weight":700,"align":"left","typeStyle":"display"}]}]}. Coordinates and dimensions are normalized from 0 to 1 against each page. Include exactly one placement for every listed element on every page; preserve every id and all text content. Keep background and decorative shapes behind content by placing them first. Use only supplied brand colors as the core palette when provided; choose complementary neutral colors where needed. These are the brand colors: ${JSON.stringify(colors)}. Brand fonts available: ${JSON.stringify(fonts)}. fontScale is relative to page height. For paragraphs use body style and enough height to wrap; for headlines use display style. Pages and current editable layers: ${JSON.stringify(pages)}`;
}

async function askPlanner(prompt: string): Promise<string> {
  const failures: string[] = [];
  if (cloudflareAiConfigured) {
    try {
      return await cloudflareChatCompletion({
        accountId: env.CLOUDFLARE_ACCOUNT_ID!,
        apiToken: env.CLOUDFLARE_API_TOKEN!,
        model: env.CLOUDFLARE_TEXT_MODEL,
        messages: [
          { role: "system", content: "You are a professional graphic designer. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        responseFormat: { type: "json_object" },
        temperature: 0.8,
        maxTokens: 4096,
        timeoutMs: 45_000,
      });
    } catch (error) {
      failures.push(`Cloudflare Workers AI: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  const providers = [
    ...(env.GROQ_API_KEY ? [{
      name: "Groq",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_MODEL,
    }] : []),
    ...(env.OPENAI_API_KEY ? [{
      name: "OpenAI",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
    }] : []),
  ];
  for (const provider of providers) {
    try {
      const response = await fetch(provider.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.8,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "You are a professional graphic designer. Return valid JSON only." },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("returned no JSON content");
      return content;
    } catch (error) {
      failures.push(`${provider.name}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }
  if (!failures.length) throw new Error("No AI provider is configured for design layout planning.");
  throw new Error(`Design layout planning failed for all configured providers. ${failures.join(" | ")}`);
}

function applyPlacements(document: DesignDocument, plan: Plan, brandColors: string[], brandFonts: string[]) {
  if (plan.pages.length !== document.pages.length) throw new Error("Planner returned the wrong number of pages.");
  const pagePlans = new Map(plan.pages.map((page) => [page.pageIndex, page]));
  const pages = document.pages.map((page, pageIndex) => {
    const pagePlan = pagePlans.get(pageIndex);
    if (!pagePlan) throw new Error("Planner omitted a design page.");
    const layers = flatten(page.layers);
    if (pagePlan.placements.length !== layers.length || new Set(pagePlan.placements.map((entry) => entry.id)).size !== layers.length) {
      throw new Error("Planner returned incomplete or duplicate layer placements.");
    }
    const placements = new Map<string, Placement>(pagePlan.placements.map((entry) => [entry.id, entry]));
    if (layers.some((layer) => !placements.has(layer.id))) throw new Error("Planner changed an editable layer ID.");
    const layerOrder = new Map(pagePlan.placements.map((entry, index) => [entry.id, index]));
    const updatedLayers = page.layers.map((layer) => {
      const position = placements.get(layer.id);
      if (!position) return layer;
      const x = Math.round(position.x * page.width);
      const y = Math.round(position.y * page.height);
      const width = Math.min(page.width - x, Math.round(position.width * page.width));
      const height = Math.min(page.height - y, Math.round(position.height * page.height));
      if (width < 1 || height < 1 || x + width > page.width || y + height > page.height) throw new Error("Planner placed a layer outside the page.");
      const common = { x, y, width, height };
      if (layer.type === "shape") return { ...layer, ...common, ...(position.fill ? { fill: position.fill } : {}), ...(position.color ? { fill: position.color } : {}) };
      if (layer.type === "text") {
        const styleFont = position.typeStyle === "display" ? brandFonts[0] ?? "Georgia" : position.typeStyle === "body" ? brandFonts[1] ?? "Arial" : brandFonts[0] ?? layer.fontFamily ?? "Arial";
        const plannedColor = position.color ?? layer.color ?? "#172531";
        const background = textBackgroundColor(layer, layers, placements, page.width, page.height, pagePlan.background, layerOrder);
        return { ...layer, ...common, fontFamily: styleFont, fontSize: Math.max(12, Math.round(position.fontScale ? position.fontScale * page.height : layer.fontSize ?? 24)), fontWeight: position.weight ?? layer.fontWeight, align: position.align ?? layer.align, color: getReadableDesignTextColor(background, plannedColor) };
      }
      return { ...layer, ...common };
    }).sort((first, second) => (layerOrder.get(first.id) ?? 0) - (layerOrder.get(second.id) ?? 0));
    return { ...page, background: { type: "color" as const, color: pagePlan.background }, layers: updatedLayers };
  });
  return { ...document, palette: brandColors.length ? brandColors : document.palette, pages };
}

export async function createAiComposedDesign(document: DesignDocument, input: { format: string; title: string; colors: string[]; fonts: string[] }) {
  const prompt = buildPrompt(document, input.format, input.title, input.colors, input.fonts);
  const raw = await askPlanner(prompt);
  const plan = planSchema.parse(JSON.parse(raw));
  return applyPlacements(document, plan, input.colors, input.fonts);
}
