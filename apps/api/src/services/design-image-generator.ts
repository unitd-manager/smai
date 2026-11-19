import { GoogleGenAI, Modality, type Part } from "@google/genai";
import {
  designDocumentVersion,
  getDesignPageSize,
  parseDesignDocument,
  type DesignDocument,
  type DesignLayer,
  type DesignPage,
} from "@united-technologies/shared/design-document";

export const imageDesignFormats = [
  "post", "carousel", "story", "poster", "brochure", "flyer", "thumbnail",
  "linkedin-banner", "pinterest-pin", "facebook-cover", "business-card", "festival-greeting", "offer-sale",
] as const;
export type ImageDesignFormat = (typeof imageDesignFormats)[number];

export type DesignReferenceImage = { mimeType: "image/jpeg" | "image/png" | "image/webp"; data: string };
export type DesignCopy = { headline: string; supportingLine: string; callToAction: string; sections: Array<{ title: string; body: string }> };

export function imageAspectRatio(format: ImageDesignFormat) {
  if (format === "brochure") return "4:3";
  if (format === "thumbnail" || format === "facebook-cover" || format === "linkedin-banner") return "16:9";
  if (format === "story") return "9:16";
  if (format === "pinterest-pin") return "2:3";
  if (format === "flyer" || format === "poster") return "3:4";
  if (format === "business-card") return "3:2";
  return "1:1";
}

export function buildImageDesignPrompt(input: {
  prompt: string;
  format: ImageDesignFormat;
  layout?: string;
  brandName: string;
  brandContext?: string[];
  colors: string[];
  referenceImage?: DesignReferenceImage;
}) {
  const isBrochure = input.format === "brochure";
  const layoutDirection: Record<string, string> = {
    editorial: "A refined editorial composition with strong type hierarchy and generous negative space.",
    split: "A clear split composition: copy-safe brand area on the left and a strong image focal area on the right.",
    bold: "A bold campaign composition with decisive scale, strong contrast, and a prominent hero visual.",
    collage: "An art-directed collage with one dominant image and a smaller secondary image crop, balanced with open copy space.",
    framed: "A calm, framed editorial composition with a contained photo and generous clean margins.",
    magazine: "A premium magazine cover with a large photo above a clean, structured type area.",
    "type-led": "A typography-first campaign with an inset hero image and substantial clear room for copy.",
    triptych: "A three-panel visual story with consistent image treatment and an orderly editorial footer.",
    spotlight: "A spotlight composition with one distinct portrait or product focal image and open copy space.",
    grid: "A precise asymmetric grid with one image block and one contrasting information block.",
    sparkle: "A restrained celebratory composition with small bright accents and a clear focal subject.",
    radiant: "A radiant hero composition with a single central subject, soft light, and controlled visual energy.",
  };
  return [
    `Create original, polished ${input.format.replaceAll("-", " ")} campaign artwork for ${input.brandName}.`,
    `The user’s visual direction is authoritative: ${input.prompt}`,
    `Use the brand palette as a guide where it fits: ${input.colors.slice(0, 5).join(", ") || "choose a considered palette"}.`,
    ...(input.layout && layoutDirection[input.layout] ? [`Visual composition: ${layoutDirection[input.layout]}`] : []),
    ...(input.brandContext?.length ? [`Brand context: ${input.brandContext.join("; ")}.`] : []),
    input.referenceImage
      ? "Use the attached image as a style and composition reference only. Create a new original image; do not reproduce its brand, wording, people, or exact artwork."
      : "",
    isBrochure
      ? "Compose a landscape tri-fold brochure cover image with a clear main focal subject and breathing room for editable typography."
      : "Compose a strong focal image with intentional negative space for editable headline and supporting copy; follow the requested format’s natural composition.",
    "Aim for premium commercial art direction: dimensional 3D objects or photorealistic product imagery when appropriate, believable materials, layered depth, cinematic lighting, nuanced shadows, and a refined editorial finish. Avoid generic rows of circles, boxes, and stock template geometry.",
    "Do not render ordinary words, headlines, body copy, or watermarks into the image; the app places crisp editable typography on top. Include recognizable logos, social platform marks, or specific symbols only when the user explicitly asks for them. Preserve the exact requested subject matter and visual details.",
  ].filter(Boolean).join("\n\n");
}

function parseGeneratedCopy(value: string, prompt: string): DesignCopy {
  const jsonText = value.match(/\{[\s\S]*\}/)?.[0];
  let parsed: Record<string, unknown> = {};
  if (jsonText) {
    try {
      const candidate: unknown = JSON.parse(jsonText);
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) parsed = candidate as Record<string, unknown>;
    } catch { /* the fallback copy keeps an image generation useful if the text part is malformed */ }
  }
  const sections = Array.isArray(parsed.sections) ? parsed.sections.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const section = item as Record<string, unknown>;
    if (typeof section.title !== "string" || typeof section.body !== "string") return [];
    return [{ title: section.title.trim().slice(0, 70), body: section.body.trim().slice(0, 220) }];
  }).slice(0, 6) : [];
  const firstSentence = prompt.trim().split(/[.!?\n]/)[0]?.trim() || "A fresh idea, beautifully brought to life";
  return {
    headline: (typeof parsed.headline === "string" ? parsed.headline.trim() : firstSentence).slice(0, 110),
    supportingLine: (typeof parsed.supportingLine === "string" ? parsed.supportingLine.trim() : "Thoughtful ideas, brought to life.").slice(0, 220),
    callToAction: (typeof parsed.callToAction === "string" ? parsed.callToAction.trim() : "DISCOVER MORE").slice(0, 60),
    sections: sections.length ? sections : [
      { title: "Made for your audience", body: "A thoughtful approach shaped around the people you serve." },
      { title: "Clear next steps", body: "Practical ideas that make it easy to move forward." },
      { title: "Built with care", body: "A dedicated team focused on useful, lasting results." },
      { title: "A better experience", body: "Every detail works together to make a stronger impression." },
      { title: "Progress you can see", body: "Meaningful work, measured against the goals that matter." },
      { title: "Let’s get started", body: "Tell us what you want to achieve and we’ll plan the next step." },
    ],
  };
}

function artworkCanvasSize(format: ImageDesignFormat) {
  if (format === "story") return { width: 1024, height: 1820 };
  if (format === "thumbnail" || format === "facebook-cover" || format === "linkedin-banner") return { width: 1820, height: 1024 };
  if (format === "brochure") return { width: 1365, height: 1024 };
  if (format === "business-card") return { width: 1536, height: 1024 };
  if (format === "flyer" || format === "poster" || format === "pinterest-pin") return { width: 1024, height: 1365 };
  return { width: 1200, height: 1200 };
}

export function sanitizeGroqArtworkSvg(svg: string, format: ImageDesignFormat) {
  const size = artworkCanvasSize(format);
  const fenced = svg.trim().replace(/^```(?:svg|xml)?\s*/i, "").replace(/\s*```$/, "");
  const match = fenced.match(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/i);
  if (!match || match[0].length > 1_500_000) throw new Error("Groq did not return a usable SVG illustration. Try a simpler visual brief.");
  let safeSvg = match[0];
  if (/<\s*(?:script|foreignObject|iframe|image|a|style)\b|\son[a-z]+\s*=|(?:href|src)\s*=|url\(\s*(?!#)/i.test(safeSvg)) {
    throw new Error("Groq returned unsupported SVG elements. Try again with a vector-only visual brief.");
  }
  safeSvg = safeSvg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/&(?!#\d+;|#x[\da-f]+;|[a-z][\da-z]+;)/gi, "&amp;")
    .replace(/<svg\b[^>]*>/i, `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">`);
  return Buffer.from(safeSvg, "utf8");
}

export async function generateGroqSvgDesign(input: {
  apiKey: string;
  model: string;
  prompt: string;
  format: ImageDesignFormat;
  brandName: string;
  brandContext?: string[];
  colors: string[];
  referenceImage?: DesignReferenceImage;
}) {
  const size = artworkCanvasSize(input.format);
  const userText = [
    `Create premium ${input.format.replaceAll("-", " ")} vector artwork for ${input.brandName}. Canvas: ${size.width} by ${size.height}.`,
    `Follow this visual brief exactly: ${input.prompt}`,
    `Brand palette: ${input.colors.slice(0, 5).join(", ") || "choose a cohesive professional palette"}.`,
    ...(input.brandContext?.length ? [`Brand context: ${input.brandContext.join("; ")}.`] : []),
    "Create rich, full-bleed SVG illustration with a clear hero subject, deliberate composition, layered depth, gradients, soft shadows, highlights, and refined detail. Favor illustrative 3D depth through SVG gradients and lighting. Avoid generic tile grids and rows of circles.",
    "Do not include headline, body copy, call-to-action text, logos, or watermarks in the artwork unless the user explicitly requests those exact marks. Editable campaign copy will be overlaid by the app.",
    `Return JSON with keys svg, headline, supportingLine, callToAction, sections. svg must be a complete inline SVG sized ${size.width}x${size.height}, viewBox 0 0 ${size.width} ${size.height}. Use only vector tags and local gradients/filters; no external images, fonts, URLs, CSS, scripts, or foreignObject. Keep the SVG under 1.5 MB. sections must be six short objects with title and body.`,
  ].join("\n\n");
  const content: Array<Record<string, unknown>> = [{ type: "text", text: userText }];
  if (input.referenceImage) content.unshift({
    type: "image_url",
    image_url: { url: `data:${input.referenceImage.mimeType};base64,${input.referenceImage.data}` },
  });
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      messages: [
        { role: "system", content: "You are an expert editorial illustrator and art director. Return one valid JSON object only. Create original expressive SVG artwork based on the user's brief. Be specific and visually rich." },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      temperature: 0.75,
      max_tokens: 7000,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    const providerError = await response.text().catch(() => "");
    const error = new Error(`Groq returned HTTP ${response.status}${providerError ? `: ${providerError.slice(0, 280)}` : ""}`) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq returned an empty artwork response.");
  let parsed: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected JSON object");
    parsed = value as Record<string, unknown>;
  } catch {
    throw new Error("Groq could not return a valid vector design. Try again with a simpler visual brief.");
  }
  if (typeof parsed.svg !== "string") throw new Error("Groq did not return vector artwork. Try again with a simpler visual brief.");
  const copy = parseGeneratedCopy(text, input.prompt);
  return {
    image: sanitizeGroqArtworkSvg(parsed.svg, input.format),
    mimeType: "image/svg+xml",
    copy,
    model: input.model,
  };
}

export async function generateImageDesign(input: {
  apiKey: string;
  model: string;
  prompt: string;
  format: ImageDesignFormat;
  layout?: string;
  brandName: string;
  brandContext?: string[];
  colors: string[];
  referenceImage?: DesignReferenceImage;
}) {
  const ai = new GoogleGenAI({ apiKey: input.apiKey });
  const parts: Part[] = [
    ...(input.referenceImage ? [{ inlineData: { mimeType: input.referenceImage.mimeType, data: input.referenceImage.data } }] : []),
    { text: `${buildImageDesignPrompt(input)}\n\nAlso return one short JSON object as text with the keys headline, supportingLine, callToAction, and sections. Make the headline, support line, and CTA relevant to the user's brief and brand. For sections, return six concise {"title":"...","body":"..."} entries. Do not put this copy into the generated image.` },
  ];
  const response = await ai.models.generateContent({
    model: input.model,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      imageConfig: { aspectRatio: imageAspectRatio(input.format), imageSize: "1K" },
      maxOutputTokens: 2048,
      abortSignal: AbortSignal.timeout(150_000),
    },
  });
  const outputParts = response.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
  const generatedImage = outputParts.find((part) => part.inlineData?.data && part.inlineData.mimeType?.startsWith("image/"))?.inlineData;
  if (!generatedImage?.data || !generatedImage.mimeType) {
    throw new Error(response.promptFeedback?.blockReason
      ? "The image provider could not create this design from the supplied brief. Adjust the prompt and try again."
      : "The image provider returned no artwork. Try again with a more specific visual brief.");
  }
  const text = outputParts.filter((part) => part.text).map((part) => part.text).join("\n");
  return {
    image: Buffer.from(generatedImage.data, "base64"),
    mimeType: generatedImage.mimeType,
    copy: parseGeneratedCopy(text, input.prompt),
    model: response.modelVersion ?? input.model,
  };
}

function textLayer(id: string, text: string, x: number, y: number, width: number, height: number, size: number, options: { color?: string; weight?: number; letterSpacing?: number; fontFamily?: string } = {}): DesignLayer {
  return {
    id, type: "text", x, y, width, height, text,
    fontFamily: options.fontFamily ?? "Inter, sans-serif", fontSize: size, fontWeight: options.weight ?? 600,
    color: options.color ?? "#FFFFFF", lineHeight: 1.08,
    ...(options.letterSpacing ? { letterSpacing: options.letterSpacing } : {}),
    effects: [{ type: "shadow", color: "#081223", blur: 10, offsetY: 2 }],
  };
}

function imageLayer(id: string, dataUrl: string, width: number, height: number): DesignLayer {
  return { id, type: "image", x: 0, y: 0, width, height, src: dataUrl, fit: "cover" };
}

function textPanel(id: string, x: number, y: number, width: number, height: number, color: string, opacity: number): DesignLayer {
  return { id, type: "shape", shape: "rounded-rectangle", x, y, width, height, radius: 32, fill: color, opacity };
}

function makeFlyerPage(input: { id: string; size: { width: number; height: number }; dataUrl: string; brandName: string; colors: string[]; fonts: string[]; copy: DesignCopy; format: ImageDesignFormat; layout?: string }): DesignPage {
  const { width, height } = input.size;
  const compact = input.format === "post" || input.format === "carousel" || input.format === "festival-greeting" || input.format === "offer-sale";
  const layout = input.layout ?? "editorial";
  const ink = input.colors[0] ?? "#102642";
  const accent = input.colors[1] ?? "#3298ED";
  const paper = input.colors[2] ?? "#F4F0E8";
  const image = (id: string, x: number, y: number, imageWidth: number, imageHeight: number, mask?: "circle" | "rounded-rectangle"): DesignLayer => ({
    id, type: "image", x, y, width: imageWidth, height: imageHeight, src: input.dataUrl, fit: "cover", ...(mask ? { mask } : {}),
  });
  const text = (id: string, value: string, x: number, y: number, w: number, h: number, fontSize: number, color: string, weight = 650): DesignLayer =>
    textLayer(id, value, x, y, w, h, fontSize, { color, weight, fontFamily: id.includes("headline") ? input.fonts[0] : input.fonts[1] });
  const button = (y: number, color: string, foreground = "#FFFFFF"): DesignLayer[] => [
    textPanel("cta-panel", width * 0.075, y, width * 0.54, height * 0.065, color, 1),
    text("call-to-action", input.copy.callToAction, width * 0.1, y + height * 0.015, width * 0.49, height * 0.04, Math.max(18, width * 0.022), foreground, 800),
  ];
  if (layout === "split") {
    return {
      id: `${input.id}-page-1`, name: "Split editorial", role: "cover", width, height,
      background: { type: "color", color: paper },
      layers: [
        image("ai-artwork", width * 0.55, 0, width * 0.45, height),
        { id: "split-accent", type: "shape", shape: "rectangle", x: 0, y: height * 0.08, width: width * 0.025, height: height * 0.84, fill: accent },
        text("brand-name", input.brandName.toLocaleUpperCase(), width * 0.075, height * 0.1, width * 0.43, height * 0.045, Math.max(17, width * 0.021), ink, 750),
        text("headline", input.copy.headline, width * 0.075, height * 0.25, width * 0.42, height * 0.26, Math.max(38, width * 0.064), ink, 800),
        text("supporting-line", input.copy.supportingLine, width * 0.075, height * 0.57, width * 0.41, height * 0.15, Math.max(18, width * 0.025), ink, 450),
        ...button(height * 0.8, accent),
      ],
    };
  }
  if (layout === "framed") {
    return {
      id: `${input.id}-page-1`, name: "Framed studio", role: "cover", width, height,
      background: { type: "color", color: paper },
      layers: [
        { id: "outer-frame", type: "shape", shape: "rectangle", x: width * 0.035, y: height * 0.035, width: width * 0.93, height: height * 0.93, fill: "transparent", stroke: ink, strokeWidth: Math.max(2, width * 0.003) },
        image("ai-artwork", width * 0.1, height * 0.09, width * 0.8, height * 0.47, "rounded-rectangle"),
        text("brand-name", input.brandName.toLocaleUpperCase(), width * 0.1, height * 0.61, width * 0.8, height * 0.04, Math.max(16, width * 0.02), accent, 750),
        text("headline", input.copy.headline, width * 0.1, height * 0.67, width * 0.8, height * 0.14, Math.max(34, width * 0.057), ink, 800),
        text("supporting-line", input.copy.supportingLine, width * 0.1, height * 0.82, width * 0.62, height * 0.08, Math.max(17, width * 0.022), ink, 450),
        text("call-to-action", input.copy.callToAction, width * 0.73, height * 0.87, width * 0.17, height * 0.04, Math.max(14, width * 0.017), accent, 800),
      ],
    };
  }
  if (layout === "magazine") {
    return {
      id: `${input.id}-page-1`, name: "Magazine cover", role: "cover", width, height,
      background: { type: "color", color: paper },
      layers: [
        image("ai-artwork", width * 0.04, height * 0.04, width * 0.92, height * 0.55),
        text("brand-name", input.brandName.toLocaleUpperCase(), width * 0.08, height * 0.64, width * 0.84, height * 0.035, Math.max(15, width * 0.018), accent, 750),
        text("headline", input.copy.headline, width * 0.08, height * 0.7, width * 0.84, height * 0.13, Math.max(34, width * 0.06), ink, 800),
        text("supporting-line", input.copy.supportingLine, width * 0.08, height * 0.85, width * 0.65, height * 0.08, Math.max(17, width * 0.022), ink, 450),
        text("call-to-action", input.copy.callToAction, width * 0.74, height * 0.88, width * 0.18, height * 0.04, Math.max(14, width * 0.016), accent, 800),
      ],
    };
  }
  if (layout === "spotlight") {
    const photoSize = Math.min(width * 0.48, height * 0.48);
    return {
      id: `${input.id}-page-1`, name: "Spotlight", role: "cover", width, height,
      background: { type: "color", color: paper },
      layers: [
        { id: "spotlight-ring", type: "shape", shape: "circle", x: width * 0.55, y: height * 0.12, width: photoSize * 1.12, height: photoSize * 1.12, fill: "transparent", stroke: accent, strokeWidth: Math.max(5, width * 0.012) },
        image("ai-artwork", width * 0.57, height * 0.14, photoSize, photoSize, "circle"),
        text("brand-name", input.brandName.toLocaleUpperCase(), width * 0.075, height * 0.1, width * 0.45, height * 0.04, Math.max(15, width * 0.018), accent, 750),
        text("headline", input.copy.headline, width * 0.075, height * 0.29, width * 0.47, height * 0.25, Math.max(34, width * 0.06), ink, 800),
        text("supporting-line", input.copy.supportingLine, width * 0.075, height * 0.59, width * 0.48, height * 0.15, Math.max(16, width * 0.022), ink, 450),
        ...button(height * 0.82, accent),
      ],
    };
  }
  if (layout === "collage") {
    return {
      id: `${input.id}-page-1`, name: "Editorial collage", role: "cover", width, height,
      background: { type: "color", color: ink },
      layers: [
        image("ai-artwork-main", width * 0.38, height * 0.08, width * 0.54, height * 0.56, "rounded-rectangle"),
        image("ai-artwork-detail", width * 0.08, height * 0.53, width * 0.32, height * 0.25, "rounded-rectangle"),
        text("brand-name", input.brandName.toLocaleUpperCase(), width * 0.08, height * 0.08, width * 0.48, height * 0.04, Math.max(15, width * 0.018), accent, 750),
        text("headline", input.copy.headline, width * 0.08, height * 0.17, width * 0.56, height * 0.29, Math.max(32, width * 0.055), "#FFFFFF", 800),
        text("supporting-line", input.copy.supportingLine, width * 0.45, height * 0.69, width * 0.47, height * 0.1, Math.max(16, width * 0.02), "#FFFFFF", 450),
        ...button(height * 0.86, accent),
      ],
    };
  }
  if (layout === "bold") {
    return {
      id: `${input.id}-page-1`, name: "Bold campaign", role: "cover", width, height,
      background: { type: "color", color: ink },
      layers: [
        image("ai-artwork", width * 0.43, height * 0.08, width * 0.5, height * 0.56, "rounded-rectangle"),
        { id: "bold-accent", type: "shape", shape: "rectangle", x: 0, y: height * 0.72, width, height: height * 0.28, fill: accent },
        text("brand-name", input.brandName.toLocaleUpperCase(), width * 0.075, height * 0.08, width * 0.4, height * 0.04, Math.max(15, width * 0.018), "#FFFFFF", 750),
        text("headline", input.copy.headline, width * 0.075, height * 0.22, width * 0.66, height * 0.31, Math.max(38, width * 0.074), "#FFFFFF", 850),
        text("supporting-line", input.copy.supportingLine, width * 0.075, height * 0.59, width * 0.8, height * 0.09, Math.max(17, width * 0.023), "#FFFFFF", 450),
        text("call-to-action", input.copy.callToAction, width * 0.075, height * 0.83, width * 0.78, height * 0.07, Math.max(20, width * 0.027), ink, 800),
      ],
    };
  }
  if (layout === "triptych") {
    return {
      id: `${input.id}-page-1`, name: "Three-panel story", role: "cover", width, height,
      background: { type: "color", color: paper },
      layers: [
        ...[0, 1, 2].map((index) => image(`triptych-image-${index + 1}`, index * width / 3, height * 0.04, width / 3, height * 0.51)),
        { id: "triptych-rule", type: "shape", shape: "rectangle", x: width * 0.075, y: height * 0.62, width: width * 0.12, height: 7, fill: accent },
        text("brand-name", input.brandName.toLocaleUpperCase(), width * 0.075, height * 0.59, width * 0.8, height * 0.035, Math.max(14, width * 0.017), accent, 750),
        text("headline", input.copy.headline, width * 0.075, height * 0.68, width * 0.82, height * 0.13, Math.max(34, width * 0.06), ink, 800),
        text("supporting-line", input.copy.supportingLine, width * 0.075, height * 0.83, width * 0.58, height * 0.09, Math.max(16, width * 0.021), ink, 450),
        text("call-to-action", input.copy.callToAction, width * 0.7, height * 0.86, width * 0.23, height * 0.05, Math.max(13, width * 0.016), accent, 800),
      ],
    };
  }
  if (layout === "grid") {
    return {
      id: `${input.id}-page-1`, name: "Grid campaign", role: "cover", width, height,
      background: { type: "color", color: paper },
      layers: [
        image("ai-artwork", width * 0.06, height * 0.06, width * 0.53, height * 0.51, "rounded-rectangle"),
        { id: "grid-copy-card", type: "shape", shape: "rounded-rectangle", x: width * 0.55, y: height * 0.16, width: width * 0.39, height: height * 0.58, fill: ink },
        text("brand-name", input.brandName.toLocaleUpperCase(), width * 0.61, height * 0.22, width * 0.28, height * 0.04, Math.max(13, width * 0.015), accent, 750),
        text("headline", input.copy.headline, width * 0.61, height * 0.32, width * 0.28, height * 0.22, Math.max(28, width * 0.045), "#FFFFFF", 800),
        text("supporting-line", input.copy.supportingLine, width * 0.61, height * 0.58, width * 0.28, height * 0.11, Math.max(14, width * 0.019), "#FFFFFF", 450),
        text("call-to-action", input.copy.callToAction, width * 0.075, height * 0.72, width * 0.82, height * 0.065, Math.max(18, width * 0.024), ink, 800),
      ],
    };
  }
  if (layout === "type-led") {
    return {
      id: `${input.id}-page-1`, name: "Type-led campaign", role: "cover", width, height,
      background: { type: "color", color: ink },
      layers: [
        image("ai-artwork", width * 0.58, height * 0.08, width * 0.34, height * 0.42, "rounded-rectangle"),
        text("brand-name", input.brandName.toLocaleUpperCase(), width * 0.075, height * 0.08, width * 0.45, height * 0.04, Math.max(15, width * 0.018), accent, 750),
        text("headline", input.copy.headline, width * 0.075, height * 0.2, width * 0.79, height * 0.31, Math.max(40, width * 0.082), "#FFFFFF", 850),
        text("supporting-line", input.copy.supportingLine, width * 0.075, height * 0.61, width * 0.8, height * 0.11, Math.max(17, width * 0.024), "#FFFFFF", 450),
        ...button(height * 0.82, accent),
      ],
    };
  }
  const headlineY = height * (compact ? 0.54 : 0.57);
  const panelY = height * (compact ? 0.48 : 0.52);
  const panelHeight = height - panelY;
  return {
    id: `${input.id}-page-1`, name: "Campaign artwork", role: "cover", width, height,
    background: { type: "color", color: input.colors[2] ?? "#111A2C" },
    layers: [
      imageLayer("ai-artwork", input.dataUrl, width, height),
      { id: "image-shade", type: "shape", shape: "rectangle", x: 0, y: 0, width, height, fill: "#07111F", opacity: 0.2 },
      textPanel("copy-panel", width * 0.045, panelY, width * 0.91, panelHeight * 0.89, "#07111F", 0.73),
      textLayer("brand-name", input.brandName.toLocaleUpperCase(), width * 0.075, height * 0.065, width * 0.82, height * 0.045, Math.max(22, width * 0.027), { letterSpacing: 3, weight: 700, fontFamily: input.fonts[1] }),
      textLayer("headline", input.copy.headline, width * 0.085, headlineY, width * 0.82, height * (compact ? 0.17 : 0.2), Math.max(46, width * 0.075), { weight: 800, fontFamily: input.fonts[0] }),
      textLayer("supporting-line", input.copy.supportingLine, width * 0.09, height * (compact ? 0.73 : 0.76), width * 0.78, height * 0.085, Math.max(24, width * 0.029), { weight: 500, fontFamily: input.fonts[1] }),
      textPanel("cta-panel", width * 0.085, height * 0.87, width * 0.56, height * 0.075, input.colors[1] ?? "#2A91FF", 0.96),
      textLayer("call-to-action", input.copy.callToAction, width * 0.115, height * 0.885, width * 0.5, height * 0.04, Math.max(20, width * 0.024), { weight: 800, fontFamily: input.fonts[1] }),
    ],
  };
}

function makeBrochurePages(input: { id: string; dataUrl: string; brandName: string; colors: string[]; fonts: string[]; copy: DesignCopy }): DesignPage[] {
  const width = 3300;
  const height = 2550;
  const panelWidth = width / 3;
  const front: DesignPage = {
    id: `${input.id}-outside`, name: "Outside panels", role: "cover", width, height,
    background: { type: "color", color: "#101A2A" },
    layers: [
      imageLayer("brochure-cover-art", input.dataUrl, width, height),
      { id: "brochure-shade", type: "shape", shape: "rectangle", x: 0, y: 0, width, height, fill: "#07111F", opacity: 0.28 },
      { id: "brochure-cover-panel", type: "shape", shape: "rectangle", x: panelWidth * 2, y: 0, width: panelWidth, height, fill: input.colors[0] ?? "#102642", opacity: 0.58 },
      ...[1, 2].map((index) => ({ id: `fold-${index}`, type: "shape" as const, shape: "rectangle" as const, x: panelWidth * index, y: height * 0.04, width: 3, height: height * 0.92, fill: "#FFFFFF", opacity: 0.55 })),
      textLayer("brochure-brand", input.brandName.toLocaleUpperCase(), panelWidth * 2.08, height * 0.13, panelWidth * 0.8, height * 0.05, 40, { weight: 750, letterSpacing: 3, fontFamily: input.fonts[1] }),
      textLayer("brochure-headline", input.copy.headline, panelWidth * 2.08, height * 0.4, panelWidth * 0.8, height * 0.24, 112, { weight: 800, fontFamily: input.fonts[0] }),
      textLayer("brochure-support", input.copy.supportingLine, panelWidth * 2.08, height * 0.67, panelWidth * 0.78, height * 0.1, 42, { weight: 500, fontFamily: input.fonts[1] }),
      textPanel("brochure-cta-panel", panelWidth * 2.08, height * 0.82, panelWidth * 0.78, height * 0.08, input.colors[1] ?? "#2A91FF", 0.96),
      textLayer("brochure-cta", input.copy.callToAction, panelWidth * 2.14, height * 0.84, panelWidth * 0.68, height * 0.04, 34, { weight: 800 }),
    ],
  };
  const inside: DesignPage = {
    id: `${input.id}-inside`, name: "Inside panels", role: "content", width, height,
    background: { type: "color", color: "#F7F5EF" },
    layers: [
      imageLayer("brochure-inside-art", input.dataUrl, width, height * 0.32),
      { id: "inside-image-shade", type: "shape", shape: "rectangle", x: 0, y: 0, width, height: height * 0.32, fill: "#07111F", opacity: 0.23 },
      textLayer("inside-brand", input.brandName.toLocaleUpperCase(), width * 0.055, height * 0.045, width * 0.86, height * 0.05, 42, { weight: 750, letterSpacing: 3 }),
      textLayer("inside-heading", "A closer look", width * 0.055, height * 0.16, width * 0.86, height * 0.1, 94, { weight: 800 }),
      ...input.copy.sections.slice(0, 6).map((section, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const x = column * panelWidth + panelWidth * 0.08;
        const y = height * (0.4 + row * 0.27);
        return [
          textPanel(`inside-panel-${index}`, x, y, panelWidth * 0.84, height * 0.22, "#FFFFFF", 1),
          textLayer(`inside-heading-${index}`, section.title, x + 26, y + 28, panelWidth * 0.76, height * 0.07, 40, { color: input.colors[0] ?? "#102642", weight: 750, fontFamily: input.fonts[0] }),
          textLayer(`inside-copy-${index}`, section.body, x + 26, y + height * 0.09, panelWidth * 0.76, height * 0.1, 27, { color: "#344358", weight: 450, fontFamily: input.fonts[1] }),
        ] as DesignLayer[];
      }).flat(),
      textLayer("inside-contact", input.copy.callToAction, width * 0.07, height * 0.94, width * 0.86, height * 0.035, 31, { color: input.colors[0] ?? "#102642", weight: 800 }),
    ],
  };
  return [front, inside];
}

function makeCarouselPages(input: { id: string; dataUrl: string; brandName: string; colors: string[]; fonts: string[]; copy: DesignCopy; layout?: string }): DesignPage[] {
  const width = 1080;
  const height = 1080;
  const cover = makeFlyerPage({
    id: `${input.id}-cover`, size: { width, height }, dataUrl: input.dataUrl, brandName: input.brandName,
    colors: input.colors, fonts: input.fonts, copy: input.copy, format: "carousel", layout: input.layout,
  });
  const slides = input.copy.sections.slice(0, 6).map((section, index): DesignPage => {
    const dark = index % 2 === 0;
    const background = dark ? input.colors[0] ?? "#102642" : input.colors[2] ?? "#F4F0E8";
    const foreground = dark ? "#FFFFFF" : "#18283D";
    const accent = input.colors[1] ?? "#3298ED";
    const imageWidth = width * 0.37;
    return {
      id: `${input.id}-slide-${index + 2}`,
      name: `Slide ${index + 2}`,
      role: index === input.copy.sections.length - 1 ? "closing" : "content",
      width,
      height,
      background: { type: "color", color: background },
      layers: [
        { ...imageLayer(`slide-${index + 2}-image`, input.dataUrl, imageWidth, height), x: width - imageWidth, width: imageWidth },
        { id: `slide-${index + 2}-image-tint`, type: "shape", shape: "rectangle", x: width - imageWidth, y: 0, width: imageWidth, height, fill: accent, opacity: 0.12 },
        { id: `slide-${index + 2}-brand`, type: "text", x: width * 0.075, y: height * 0.075, width: width * 0.76, height: height * 0.045, text: input.brandName.toLocaleUpperCase(), fontFamily: input.fonts[1], fontSize: 23, fontWeight: 750, color: foreground, letterSpacing: 3 },
        { id: `slide-${index + 2}-accent`, type: "shape", shape: "rectangle", x: width * 0.075, y: height * 0.19, width: width * 0.11, height: 8, fill: accent },
        { id: `slide-${index + 2}-heading`, type: "text", x: width * 0.075, y: height * 0.25, width: width * 0.53, height: height * 0.22, text: section.title, fontFamily: input.fonts[0] || "Inter, sans-serif", fontSize: 62, fontWeight: 800, color: foreground, lineHeight: 1.08 },
        { id: `slide-${index + 2}-body`, type: "text", x: width * 0.075, y: height * 0.51, width: width * 0.51, height: height * 0.25, text: section.body, fontFamily: input.fonts[1], fontSize: 28, fontWeight: 450, color: foreground, lineHeight: 1.35 },
        { id: `slide-${index + 2}-number`, type: "text", x: width * 0.075, y: height * 0.89, width: width * 0.5, height: height * 0.04, text: `${String(index + 2).padStart(2, "0")}  /  ${String(input.copy.sections.length + 1).padStart(2, "0")}`, fontFamily: input.fonts[1], fontSize: 20, fontWeight: 700, color: foreground },
      ],
    };
  });
  return [cover, ...slides];
}

export function createAiDesignDocument(input: {
  id: string;
  title: string;
  format: ImageDesignFormat;
  layout?: string;
  brandName: string;
  colors: string[];
  fonts: string[];
  imageData: Buffer;
  copy: DesignCopy;
  prompt: string;
  model: string;
}): DesignDocument {
  const palette = input.colors.filter((color) => /^#[\da-f]{6}$/i.test(color)).slice(0, 6);
  const finalPalette = palette.length >= 3 ? palette : ["#112544", "#3298ED", "#F4F0E8"];
  const dataUrl = `data:image/webp;base64,${input.imageData.toString("base64")}`;
  const size = input.format === "brochure" ? { width: 3300, height: 2550 } : getDesignPageSize(input.format);
  const pages = input.format === "brochure"
    ? makeBrochurePages({ id: input.id, dataUrl, brandName: input.brandName, colors: finalPalette, fonts: input.fonts, copy: input.copy })
    : input.format === "carousel"
      ? makeCarouselPages({ id: input.id, dataUrl, brandName: input.brandName, colors: finalPalette, fonts: input.fonts, copy: input.copy, layout: input.layout })
      : [makeFlyerPage({ id: input.id, size, dataUrl, brandName: input.brandName, colors: finalPalette, fonts: input.fonts, copy: input.copy, format: input.format, layout: input.layout })];
  return parseDesignDocument({
    version: designDocumentVersion,
    id: input.id,
    title: input.title,
    palette: finalPalette,
    metadata: {
      layout: input.layout ?? "editorial",
      provider: "google-ai-studio",
      model: input.model,
      prompt: input.prompt.slice(0, 2200),
      ...(input.fonts[0] ? { brandFont: input.fonts[0] } : {}),
      imageMimeType: "image/webp",
    },
    pages,
  });
}
