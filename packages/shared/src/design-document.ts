export const designDocumentVersion = 1 as const;

export type DesignPoint = { x: number; y: number };
export type DesignSize = { width: number; height: number };
export type DesignGradientStop = { color: string; offset: number; opacity?: number };
export type DesignAnimation = {
  preset: "none" | "fade" | "slide" | "pop" | "typewriter" | "bounce" | "zoom";
  durationMs?: number;
  delayMs?: number;
};
export type DesignTextEffect = {
  type: "shadow" | "outline" | "glow";
  color: string;
  blur?: number;
  offsetX?: number;
  offsetY?: number;
  width?: number;
};
export type DesignTextSpan = {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  italic?: boolean;
  underline?: boolean;
};
export type DesignLayerBase = {
  id: string;
  type: "text" | "shape" | "image" | "group" | "frame" | "icon" | "sticker" | "chart" | "table" | "qr-code" | "video-clip" | "audio";
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  visible?: boolean;
  animation?: DesignAnimation;
};
export type DesignTextLayer = DesignLayerBase & {
  type: "text";
  text: string;
  spans?: DesignTextSpan[];
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  gradient?: DesignGradientStop[];
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  effects?: DesignTextEffect[];
  curved?: boolean;
};
export type DesignShapeLayer = DesignLayerBase & {
  type: "shape";
  shape: "rectangle" | "rounded-rectangle" | "circle" | "ellipse" | "polygon" | "star" | "line" | "arrow" | "blob" | "custom-path";
  fill?: string;
  fillGradient?: DesignGradientStop[];
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  points?: DesignPoint[];
  path?: string;
};
export type DesignImageLayer = DesignLayerBase & {
  type: "image";
  src: string;
  fit?: "cover" | "contain";
  crop?: { x: number; y: number; width: number; height: number };
  mask?: "rectangle" | "rounded-rectangle" | "circle";
  filters?: { brightness?: number; contrast?: number; saturation?: number; blur?: number; opacity?: number };
  flipX?: boolean;
  flipY?: boolean;
};
export type DesignGroupLayer = DesignLayerBase & { type: "group"; children: DesignLayer[] };
export type DesignFrameLayer = DesignLayerBase & {
  type: "frame";
  shape: "rectangle" | "rounded-rectangle" | "circle";
  placeholderLabel?: string;
  image?: DesignImageLayer;
  fill?: string;
  stroke?: string;
};
export type DesignDataLayer = DesignLayerBase & {
  type: "icon" | "sticker";
  assetId: string;
  color?: string;
  label?: string;
};
export type DesignChartLayer = DesignLayerBase & {
  type: "chart";
  chartType: "bar" | "line" | "pie";
  labels: string[];
  values: number[];
  colors: string[];
};
export type DesignTableLayer = DesignLayerBase & { type: "table"; rows: string[][]; colors?: string[] };
export type DesignQrLayer = DesignLayerBase & { type: "qr-code"; value: string; label?: string };
export type DesignMediaLayer = DesignLayerBase & {
  type: "video-clip" | "audio";
  src: string;
  poster?: string;
  label?: string;
};
export type DesignLayer =
  | DesignTextLayer
  | DesignShapeLayer
  | DesignImageLayer
  | DesignGroupLayer
  | DesignFrameLayer
  | DesignDataLayer
  | DesignChartLayer
  | DesignTableLayer
  | DesignQrLayer
  | DesignMediaLayer;

export type DesignBackground =
  | { type: "color"; color: string }
  | { type: "gradient"; angle?: number; stops: DesignGradientStop[] }
  | { type: "image"; src: string; fit?: "cover" | "contain"; opacity?: number }
  | { type: "pattern"; pattern: "dots" | "lines" | "grid"; color: string; background: string; scale?: number; opacity?: number };

export type DesignPage = {
  id: string;
  name?: string;
  role?: "cover" | "content" | "list" | "stats" | "quote" | "call-to-action" | "closing" | "custom";
  width: number;
  height: number;
  bleed?: number;
  background: DesignBackground;
  layers: DesignLayer[];
  transition?: "none" | "fade" | "slide" | "zoom";
};

export type DesignDocument = {
  version: typeof designDocumentVersion;
  id: string;
  title: string;
  templateId?: string;
  themeId?: string;
  palette: string[];
  pages: DesignPage[];
  metadata?: Record<string, string>;
};

const pagePresets: Record<string, DesignSize> = {
  post: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  carousel: { width: 1080, height: 1080 },
  flyer: { width: 2550, height: 3300 },
  poster: { width: 2550, height: 3300 },
  brochure: { width: 3300, height: 2550 },
  thumbnail: { width: 1280, height: 720 },
  video: { width: 1080, height: 1920 },
  "linkedin-banner": { width: 1584, height: 396 },
  "pinterest-pin": { width: 1000, height: 1500 },
  "facebook-cover": { width: 1640, height: 624 },
  "business-card": { width: 1050, height: 600 },
  "festival-greeting": { width: 1080, height: 1080 },
  "offer-sale": { width: 1080, height: 1080 },
};

export function getDesignPageSize(format: string): DesignSize {
  const size = pagePresets[format];
  return size ? { ...size } : { width: 1080, height: 1080 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateLayer(value: unknown, path: string): asserts value is DesignLayer {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string") {
    throw new Error(`${path} must have a string id and layer type.`);
  }
  for (const key of ["x", "y", "width", "height"] as const) {
    if (!isFiniteNumber(value[key]) || (key === "width" || key === "height") && Number(value[key]) < 0) {
      throw new Error(`${path}.${key} must be a finite ${key === "width" || key === "height" ? "non-negative " : ""}number.`);
    }
  }
  if (value.rotation !== undefined && !isFiniteNumber(value.rotation)) throw new Error(`${path}.rotation must be finite.`);
  const opacity = value.opacity;
  if (opacity !== undefined && (!isFiniteNumber(opacity) || opacity < 0 || opacity > 1)) {
    throw new Error(`${path}.opacity must be between 0 and 1.`);
  }
  const needsText = value.type === "text" && typeof value.text !== "string";
  const needsSource = (value.type === "image" || value.type === "video-clip" || value.type === "audio") && typeof value.src !== "string";
  const needsShape = value.type === "shape" && typeof value.shape !== "string";
  const needsAsset = (value.type === "icon" || value.type === "sticker") && typeof value.assetId !== "string";
  if (needsText || needsSource || needsShape || needsAsset) throw new Error(`${path} is missing required content for its layer type.`);
  if (value.type === "shape" && !["rectangle", "rounded-rectangle", "circle", "ellipse", "polygon", "star", "line", "arrow", "blob", "custom-path"].includes(String(value.shape))) {
    throw new Error(`${path}.shape is not supported.`);
  }
  if (value.type === "image" && value.fit !== undefined && value.fit !== "cover" && value.fit !== "contain") {
    throw new Error(`${path}.fit must be cover or contain.`);
  }
  if (value.type === "frame" && !["rectangle", "rounded-rectangle", "circle"].includes(String(value.shape))) {
    throw new Error(`${path}.shape is not supported for a frame.`);
  }
  if (value.type === "chart" && (!Array.isArray(value.labels) || !value.labels.every((item) => typeof item === "string") ||
    !Array.isArray(value.values) || !value.values.every(isFiniteNumber) || !["bar", "line", "pie"].includes(String(value.chartType)))) {
    throw new Error(`${path} must have a supported chart type and matching numeric values and labels.`);
  }
  if (value.type === "table" && (!Array.isArray(value.rows) || !value.rows.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === "string")))) {
    throw new Error(`${path}.rows must be a matrix of strings.`);
  }
  if (value.type === "qr-code" && typeof value.value !== "string") throw new Error(`${path}.value must be a string.`);
  if (value.type === "group") {
    if (!Array.isArray(value.children)) throw new Error(`${path}.children must be an array.`);
    value.children.forEach((child, index) => validateLayer(child, `${path}.children[${index}]`));
  }
  if (value.type === "frame" && value.image !== undefined) validateLayer(value.image, `${path}.image`);
  if (!["text", "shape", "image", "group", "frame", "icon", "sticker", "chart", "table", "qr-code", "video-clip", "audio"].includes(value.type)) {
    throw new Error(`${path}.type is not supported.`);
  }
}

export function parseDesignDocument(value: unknown): DesignDocument {
  if (!isRecord(value) || value.version !== designDocumentVersion || typeof value.id !== "string" ||
    typeof value.title !== "string" || !Array.isArray(value.palette) || !value.palette.every((item) => typeof item === "string") ||
    !Array.isArray(value.pages) || value.pages.length === 0) {
    throw new Error("Design document must use the supported version and contain an id, title, palette, and at least one page.");
  }
  value.pages.forEach((page, pageIndex) => {
    const path = `pages[${pageIndex}]`;
    if (!isRecord(page) || typeof page.id !== "string" || !isFiniteNumber(page.width) || !isFiniteNumber(page.height) ||
      !Array.isArray(page.layers) || !isRecord(page.background)) {
      throw new Error(`${path} must have an id, positive dimensions, background, and layers.`);
    }
    if (page.width <= 0 || page.height <= 0) throw new Error(`${path} dimensions must be positive.`);
    if (!["color", "gradient", "image", "pattern"].includes(String(page.background.type))) {
      throw new Error(`${path}.background.type is not supported.`);
    }
    if (page.background.type === "color" && typeof page.background.color !== "string") throw new Error(`${path}.background.color must be a string.`);
    if (page.background.type === "image" && typeof page.background.src !== "string") throw new Error(`${path}.background.src must be a string.`);
    if (page.background.type === "gradient" && (!Array.isArray(page.background.stops) || page.background.stops.length < 2 ||
      !page.background.stops.every((stop) => isRecord(stop) && typeof stop.color === "string" && isFiniteNumber(stop.offset)))) {
      throw new Error(`${path}.background.stops must contain at least two valid color stops.`);
    }
    if (page.background.type === "pattern" && (!["dots", "lines", "grid"].includes(String(page.background.pattern)) ||
      typeof page.background.color !== "string" || typeof page.background.background !== "string")) {
      throw new Error(`${path}.background must specify a supported pattern and colors.`);
    }
    page.layers.forEach((layer, layerIndex) => validateLayer(layer, `${path}.layers[${layerIndex}]`));
  });
  return value as unknown as DesignDocument;
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;",
  })[character]!);
}

function safeColor(value: string | undefined, fallback = "transparent") {
  return value && (/^#[0-9a-f]{3,8}$/i.test(value) || /^[a-z]{1,24}$/i.test(value) || /^rgba?\([\d.,%\s]+\)$/i.test(value))
    ? value
    : fallback;
}

function isLightColor(value: string) {
  const match = value.match(/^#([\da-f]{6})$/i);
  if (!match) return false;
  const color = match[1]!;
  const red = Number.parseInt(color.slice(0, 2), 16) / 255;
  const green = Number.parseInt(color.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(color.slice(4, 6), 16) / 255;
  const linear = (channel: number) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue) > 0.55;
}

function safeImageSource(value: string) {
  return /^(https:\/\/|\/(?!\/)|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(value) ? escapeXml(value) : "";
}

function renderBackground(background: DesignBackground, id: string) {
  if (background.type === "color") return `<rect width="100%" height="100%" fill="${safeColor(background.color, "#ffffff")}"/>`;
  if (background.type === "image") {
    const src = safeImageSource(background.src);
    return src ? `<image href="${src}" width="100%" height="100%" preserveAspectRatio="${background.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"}" opacity="${background.opacity ?? 1}"/>` : "";
  }
  if (background.type === "pattern") {
    const scale = Math.max(4, Math.min(120, background.scale ?? 24));
    const pattern = background.pattern === "dots"
      ? `<circle cx="${scale / 2}" cy="${scale / 2}" r="1.5" fill="${safeColor(background.color, "#333333")}"/>`
      : background.pattern === "grid"
        ? `<path d="M${scale} 0H0V${scale}" fill="none" stroke="${safeColor(background.color, "#333333")}" stroke-width="1"/>`
        : `<path d="M0 ${scale}L${scale} 0" fill="none" stroke="${safeColor(background.color, "#333333")}" stroke-width="1"/>`;
    return `<rect width="100%" height="100%" fill="${safeColor(background.background, "#ffffff")}"/><defs><pattern id="${id}" width="${scale}" height="${scale}" patternUnits="userSpaceOnUse">${pattern}</pattern></defs><rect width="100%" height="100%" fill="url(#${id})" opacity="${background.opacity ?? 1}"/>`;
  }
  const stops = background.stops.map((stop) =>
    `<stop offset="${Math.max(0, Math.min(100, stop.offset * 100))}%" stop-color="${safeColor(stop.color, "#ffffff")}" stop-opacity="${stop.opacity ?? 1}"/>`,
  ).join("");
  return `<defs><linearGradient id="${id}" gradientTransform="rotate(${background.angle ?? 135})">${stops}</linearGradient></defs><rect width="100%" height="100%" fill="url(#${id})"/>`;
}

function wrappedLines(text: string, fontSize: number, maxWidth: number) {
  const maxCharacters = Math.max(1, Math.floor(maxWidth / (fontSize * 0.55)));
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const originalWord of paragraph.split(/\s+/)) {
      const wordParts = originalWord.length > maxCharacters
        ? originalWord.match(new RegExp(`.{1,${maxCharacters}}`, "g")) ?? [originalWord]
        : [originalWord];
      for (const word of wordParts) {
        const next = line ? `${line} ${word}` : word;
        if (line && next.length > maxCharacters) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
    }
    lines.push(line);
  }
  return lines;
}

export function fitTextToBox(text: string, requestedFontSize: number, width: number, height: number, lineHeightRatio = 1.2) {
  let fontSize = Math.max(0.5, requestedFontSize);
  let lines = wrappedLines(text, fontSize, width);
  let lineHeight = lineHeightRatio * fontSize;
  for (let attempt = 0; attempt < 120 && lines.length * lineHeight > height; attempt += 1) {
    fontSize = Math.max(0.5, fontSize * 0.9);
    lines = wrappedLines(text, fontSize, width);
    lineHeight = Math.min(lineHeightRatio * fontSize, height / Math.max(1, lines.length));
  }
  fontSize = Math.min(fontSize, lineHeight);
  return { fontSize, lines, lineHeight };
}

function renderLayer(layer: DesignLayer, defs: string[], prefix: string): string {
  if (layer.visible === false) return "";
  const transform = `translate(${layer.x} ${layer.y})${layer.rotation ? ` rotate(${layer.rotation} ${layer.width / 2} ${layer.height / 2})` : ""}`;
  const common = `transform="${transform}" opacity="${layer.opacity ?? 1}"`;
  if (layer.type === "group") return `<g ${common}>${layer.children.map((child) => renderLayer(child, defs, prefix)).join("")}</g>`;
  if (layer.type === "text") {
    const requestedFontSize = Math.max(1, layer.fontSize ?? 36);
    const color = safeColor(layer.color, "#172531");
    const x = layer.align === "center" ? layer.width / 2 : layer.align === "right" ? layer.width : 0;
    const anchor = layer.align === "center" ? "middle" : layer.align === "right" ? "end" : "start";
    const text = layer.textTransform === "uppercase" ? layer.text.toLocaleUpperCase()
      : layer.textTransform === "lowercase" ? layer.text.toLocaleLowerCase()
        : layer.textTransform === "capitalize" ? layer.text.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase()) : layer.text;
    const fitted = fitTextToBox(text, requestedFontSize, layer.width, layer.height, layer.lineHeight ?? 1.2);
    const { fontSize, lines, lineHeight } = fitted;
    const totalHeight = lines.length * lineHeight;
    const firstY = layer.verticalAlign === "middle" ? (layer.height - totalHeight) / 2 + lineHeight
      : layer.verticalAlign === "bottom" ? layer.height - totalHeight + lineHeight : lineHeight;
    const style = layer.effects?.find((effect) => effect.type === "shadow");
    const effect = style ? ` filter="drop-shadow(${style.offsetX ?? 0}px ${style.offsetY ?? 2}px ${style.blur ?? 4}px ${safeColor(style.color, "#000000")})"` : "";
    const outputLines = lines.map((line, index) =>
      `<text x="${x}" y="${firstY + index * lineHeight}" text-anchor="${anchor}" fill="${color}" font-family="${escapeXml(layer.fontFamily ?? "Inter, sans-serif")}" font-size="${fontSize}" font-weight="${layer.fontWeight ?? 500}" letter-spacing="${layer.letterSpacing ?? 0}"${effect}>${escapeXml(line)}</text>`,
    ).join("");
    return `<g ${common}>${outputLines}</g>`;
  }
  if (layer.type === "shape") {
    const fill = safeColor(layer.fill, "transparent");
    const stroke = safeColor(layer.stroke);
    const strokeStyle = `stroke="${stroke}" stroke-width="${layer.strokeWidth ?? 0}"`;
    let shape = "";
    if (layer.shape === "circle" || layer.shape === "ellipse") {
      shape = `<ellipse cx="${layer.width / 2}" cy="${layer.height / 2}" rx="${layer.width / 2}" ry="${layer.height / 2}" fill="${fill}" ${strokeStyle}/>`;
    } else if (layer.shape === "line" || layer.shape === "arrow") {
      shape = `<path d="M0 ${layer.height / 2}H${layer.width}${layer.shape === "arrow" ? `m-${Math.min(16, layer.width / 3)} -${Math.min(12, layer.height / 3)}l${Math.min(16, layer.width / 3)} ${Math.min(12, layer.height / 3)}l-${Math.min(16, layer.width / 3)} ${Math.min(12, layer.height / 3)}` : ""}" fill="none" ${strokeStyle}/>`;
    } else if (layer.shape === "polygon" || layer.shape === "star") {
      const points = layer.points?.map((point) => `${point.x},${point.y}`).join(" ") ?? `${layer.width / 2},0 ${layer.width},${layer.height} 0,${layer.height}`;
      shape = `<polygon points="${points}" fill="${fill}" ${strokeStyle}/>`;
    } else if (layer.shape === "custom-path" && layer.path && /^[MmLlHhVvCcSsQqTtAaZz0-9, .+-]+$/.test(layer.path)) {
      shape = `<path d="${layer.path}" fill="${fill}" ${strokeStyle}/>`;
    } else {
      shape = `<rect width="${layer.width}" height="${layer.height}" rx="${layer.shape === "rounded-rectangle" ? layer.radius ?? 16 : 0}" fill="${fill}" ${strokeStyle}/>`;
    }
    return `<g ${common}>${shape}</g>`;
  }
  if (layer.type === "image") {
    const src = safeImageSource(layer.src);
    if (!src) return "";
    const clipId = `${prefix}-clip-${escapeXml(layer.id)}`;
    const mask = layer.mask === "circle" ? `<circle cx="${layer.width / 2}" cy="${layer.height / 2}" r="${Math.min(layer.width, layer.height) / 2}"/>`
      : `<rect width="${layer.width}" height="${layer.height}" rx="${layer.mask === "rounded-rectangle" ? 16 : 0}"/>`;
    defs.push(`<clipPath id="${clipId}">${mask}</clipPath>`);
    const filters = layer.filters;
    const css = filters ? `filter="brightness(${filters.brightness ?? 1}) contrast(${filters.contrast ?? 1}) saturate(${filters.saturation ?? 1}) blur(${filters.blur ?? 0}px)"` : "";
    return `<g ${common}><image href="${src}" width="${layer.width}" height="${layer.height}" preserveAspectRatio="${layer.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"}" clip-path="url(#${clipId})" opacity="${filters?.opacity ?? 1}" ${css}/></g>`;
  }
  if (layer.type === "frame") {
    if (layer.image) return renderLayer({ ...layer.image, x: layer.x, y: layer.y, width: layer.width, height: layer.height, mask: layer.shape }, defs, prefix);
    const frameShape = layer.shape === "circle"
      ? `<ellipse cx="${layer.width / 2}" cy="${layer.height / 2}" rx="${layer.width / 2}" ry="${layer.height / 2}"/>`
      : `<rect width="${layer.width}" height="${layer.height}" rx="${layer.shape === "rounded-rectangle" ? 16 : 0}"/>`;
    return `<g ${common}><g fill="${safeColor(layer.fill, "#efeae1")}" stroke="${safeColor(layer.stroke, "#a8845a")}">${frameShape}</g><text x="${layer.width / 2}" y="${layer.height / 2}" text-anchor="middle" dominant-baseline="middle" fill="#6b7280" font-family="Inter,sans-serif" font-size="16">${escapeXml(layer.placeholderLabel ?? "Image")}</text></g>`;
  }
  if (layer.type === "icon" || layer.type === "sticker") {
    const label = escapeXml(layer.label ?? layer.assetId);
    return `<g ${common}><rect width="${layer.width}" height="${layer.height}" rx="8" fill="${safeColor(layer.color, "#efeae1")}"/><text x="${layer.width / 2}" y="${layer.height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Inter,sans-serif" font-size="14" fill="#253746">${label}</text></g>`;
  }
  if (layer.type === "chart") {
    const max = Math.max(1, ...layer.values);
    const step = layer.width / Math.max(1, layer.values.length);
    const bars = layer.values.map((value, index) => {
      const height = Math.max(0, value / max * (layer.height * 0.75));
      const x = index * step + step * 0.15;
      const y = layer.height - height - 20;
      return `<rect x="${x}" y="${y}" width="${step * 0.7}" height="${height}" rx="4" fill="${safeColor(layer.colors[index % layer.colors.length], "#c6a477")}"/><text x="${x + step * 0.35}" y="${layer.height}" text-anchor="middle" font-size="10" fill="#253746">${escapeXml(layer.labels[index] ?? "")}</text>`;
    }).join("");
    return `<g ${common}>${bars}</g>`;
  }
  if (layer.type === "table") {
    const rows = layer.rows.length;
    const cols = Math.max(1, ...layer.rows.map((row) => row.length));
    const cellW = layer.width / cols;
    const cellH = layer.height / Math.max(1, rows);
    const cells = layer.rows.flatMap((row, rowIndex) => row.map((cell, colIndex) =>
      `<rect x="${colIndex * cellW}" y="${rowIndex * cellH}" width="${cellW}" height="${cellH}" fill="${safeColor(layer.colors?.[rowIndex % (layer.colors.length || 1)], "#ffffff")}" stroke="#cbd5e1"/><text x="${colIndex * cellW + 6}" y="${rowIndex * cellH + cellH / 2}" dominant-baseline="middle" font-size="12" fill="#253746">${escapeXml(cell)}</text>`,
    )).join("");
    return `<g ${common}>${cells}</g>`;
  }
  if (layer.type === "qr-code") {
    return `<g ${common}><rect width="${layer.width}" height="${layer.height}" fill="#ffffff" stroke="#253746"/><text x="${layer.width / 2}" y="${layer.height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Inter,sans-serif" font-size="12" fill="#253746">QR · ${escapeXml(layer.label ?? layer.value.slice(0, 24))}</text></g>`;
  }
  const mediaLabel = layer.type === "audio" ? "Audio track" : layer.label ?? "Video clip";
  return `<g ${common}><rect width="${layer.width}" height="${layer.height}" rx="8" fill="#202a32" stroke="#c6a477"/><text x="${layer.width / 2}" y="${layer.height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Inter,sans-serif" font-size="16" fill="#ffffff">${escapeXml(mediaLabel)}</text></g>`;
}

export function renderDesignPageSvg(documentValue: unknown, pageIndex = 0): string {
  const document = parseDesignDocument(documentValue);
  const page = document.pages[pageIndex];
  if (!page) throw new Error(`Design page ${pageIndex + 1} does not exist.`);
  const prefix = `design-${page.id.replace(/[^a-z0-9_-]/gi, "-")}`;
  const defs: string[] = [];
  const background = renderBackground(page.background, `${prefix}-background`);
  const layers = page.layers.map((layer) => renderLayer(layer, defs, prefix)).join("");
  const width = Math.round(page.width);
  const height = Math.round(page.height);
  const template = document.templateId ? ` data-template-id="${escapeXml(document.templateId)}"` : "";
  const theme = document.themeId ? ` data-theme-id="${escapeXml(document.themeId)}"` : "";
  const layout = document.metadata?.layout ? ` data-layout="${escapeXml(document.metadata.layout)}"` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-document-id="${escapeXml(document.id)}"${template}${theme}${layout}><title>${escapeXml(document.title)}</title><defs>${defs.join("")}</defs>${background}${layers}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createDesignDocument(input: {
  id: string;
  title: string;
  format: string;
  colors: string[];
  fonts?: string[];
  variant?: number;
  templateId?: string;
  template?: unknown;
  logoSrc?: string;
  content?: {
    brandName?: string;
    caption?: string;
    slides?: Array<string | { headline: string; subheading?: string; body?: string }>;
    sections?: string[];
    posterText?: { headline: string; supportingLine: string; callToAction: string };
  };
}): DesignDocument {
  const size = getDesignPageSize(input.format);
  const validColors = input.colors.filter((color) => /^#[0-9a-f]{3,8}$/i.test(color));
  const palette = validColors.length > 0 ? validColors : ["#123a70", "#2563eb", "#ffffff"];
  const brandHeadingFont = input.fonts?.[0]?.trim();
  const brandBodyFont = input.fonts?.[1]?.trim() ?? brandHeadingFont ?? "Inter, sans-serif";
  const template = isRecord(input.template) ? input.template : undefined;
  const layouts = ["editorial", "split", "bold", "collage", "framed", "magazine", "type-led", "triptych", "spotlight", "grid", "sparkle", "radiant"];
  const requestedLayout = typeof template?.layout === "string" ? template.layout : undefined;
  const layout = requestedLayout && layouts.includes(requestedLayout)
    ? requestedLayout
    : template ? "editorial" : layouts[(input.variant ?? 0) % layouts.length]!;
  const title = input.title;
  const variant = input.variant ?? 0;
  const isLight = isLightColor(palette.at(-1) ?? "#ffffff");
  const foreground = isLight ? "#253746" : "#ffffff";
  const headingX = layout === "split" || layout === "magazine" ? size.width * 0.08 : size.width * 0.1;
  const titleWidth = size.width * (layout === "split" ? 0.58 : layout === "triptych" ? 0.76 : 0.8);
  const headlineLayout: Record<string, { x: number; y: number; width: number; height: number; size: number; align?: "left" | "center" | "right"; font?: string }> = {
    editorial: { x: 0.1, y: 0.3, width: 0.8, height: 0.31, size: 0.075, font: "Playfair Display, serif" },
    split: { x: 0.08, y: 0.24, width: 0.56, height: 0.36, size: 0.073 },
    bold: { x: 0.075, y: 0.2, width: 0.86, height: 0.43, size: 0.105 },
    collage: { x: 0.08, y: 0.28, width: 0.55, height: 0.37, size: 0.07 },
    framed: { x: 0.12, y: 0.29, width: 0.76, height: 0.32, size: 0.076, align: "center", font: "Playfair Display, serif" },
    magazine: { x: 0.08, y: 0.35, width: 0.82, height: 0.3, size: 0.078, font: "Playfair Display, serif" },
    "type-led": { x: 0.08, y: 0.19, width: 0.86, height: 0.47, size: 0.112 },
    triptych: { x: 0.12, y: 0.24, width: 0.76, height: 0.36, size: 0.078, align: "center" },
    spotlight: { x: 0.08, y: 0.31, width: 0.78, height: 0.34, size: 0.082 },
    grid: { x: 0.1, y: 0.34, width: 0.7, height: 0.28, size: 0.068 },
    sparkle: { x: 0.1, y: 0.3, width: 0.8, height: 0.34, size: 0.078, align: "center" },
    radiant: { x: 0.08, y: 0.32, width: 0.8, height: 0.33, size: 0.08 },
  };
  const headlineStyle = headlineLayout[layout] ?? headlineLayout.editorial!;
  const layoutDecorations: DesignLayer[] = layout === "framed"
    ? [{ id: "layout-frame", type: "shape", shape: "rectangle", x: size.width * 0.045, y: size.height * 0.045, width: size.width * 0.91, height: size.height * 0.91, fill: "transparent", stroke: palette[0]!, strokeWidth: Math.max(2, size.width * 0.002) }]
    : layout === "magazine"
      ? [{ id: "layout-rule", type: "shape", shape: "rectangle", x: size.width * 0.08, y: size.height * 0.245, width: size.width * 0.84, height: Math.max(2, size.width * 0.002), fill: palette[1]! }]
      : layout === "bold" || layout === "type-led"
        ? [{ id: "layout-footer-band", type: "shape", shape: "rectangle", x: 0, y: size.height * 0.86, width: size.width, height: size.height * 0.14, fill: palette[0]! }]
        : layout === "split"
          ? [{ id: "layout-split-rule", type: "shape", shape: "rectangle", x: size.width * 0.7, y: size.height * 0.08, width: Math.max(3, size.width * 0.004), height: size.height * 0.84, fill: palette[1]! }]
          : [];
  const brandName = input.content?.brandName?.trim() || "YOUR BRAND";
  const summary = input.content?.caption?.trim().split(/\r?\n/).filter(Boolean).slice(0, 2).join(" ").slice(0, 260)
    || "Built around your next business goal. A clear story, ready to share.";
  const makePage = (
    pageTitle: string,
    pageCopy: string,
    pageIndex: number,
    role: DesignPage["role"] = "content",
    pageSubheading = "",
  ): DesignPage => {
    const carouselPage = input.format === "carousel";
    const headlineFontSize = Math.max(30, Math.min(
      size.width * headlineStyle.size,
      size.width * headlineStyle.size * Math.sqrt(3 / Math.max(3, pageTitle.length / 28)),
    ));
    const bodyFontSize = Math.max(16, Math.min(
      32,
      32 * Math.sqrt(160 / Math.max(160, pageCopy.length)),
    ));
    return ({
    id: `${input.id}-page-${pageIndex + 1}`,
    name: `Page ${pageIndex + 1}`,
    role,
    ...size,
    background: { type: "color", color: palette[2] ?? (isLight ? "#ffffff" : "#24364B") },
    layers: [
        ...layoutDecorations,
        {
          id: "brand-label",
          type: "text",
          x: layout === "framed" || layout === "sparkle" ? size.width * 0.1 : headingX,
          y: layout === "magazine" ? size.height * 0.19 : layout === "bold" ? size.height * 0.09 : size.height * 0.13,
          width: layout === "framed" || layout === "sparkle" ? size.width * 0.8 : titleWidth,
          height: size.height * 0.06,
          text: brandName,
          fontFamily: brandBodyFont,
          fontSize: Math.max(14, size.width * 0.022),
          fontWeight: 700,
          color: foreground,
          letterSpacing: 2,
        },
        {
          id: "headline",
          type: "text",
          x: size.width * headlineStyle.x,
          y: size.height * (carouselPage ? 0.27 : headlineStyle.y),
          width: size.width * headlineStyle.width,
          height: size.height * (carouselPage ? 0.3 : headlineStyle.height),
          text: pageTitle,
          fontFamily: brandHeadingFont ?? headlineStyle.font ?? "Inter, sans-serif",
          fontSize: carouselPage ? headlineFontSize : Math.max(30, Math.min(size.width * headlineStyle.size, size.height * 0.13)),
          fontWeight: 700,
          color: foreground,
          lineHeight: 1.08,
          align: headlineStyle.align,
        },
        ...(carouselPage && pageSubheading ? [{
          id: "subheading",
          type: "text" as const,
          x: size.width * headlineStyle.x,
          y: size.height * 0.59,
          width: size.width * headlineStyle.width,
          height: size.height * 0.055,
          text: pageSubheading,
          fontFamily: brandBodyFont,
          fontSize: Math.max(18, size.width * 0.024),
          fontWeight: 600,
          color: palette[0]!,
        }] : []),
        ...(pageCopy ? [{
          id: "supporting-copy",
          type: "text",
          x: size.width * (headlineStyle.align === "center" ? 0.12 : headlineStyle.x),
          y: size.height * (carouselPage ? 0.67 : layout === "bold" || layout === "type-led" ? 0.73 : layout === "framed" ? 0.67 : layout === "triptych" || layout === "sparkle" ? 0.65 : 0.68),
          width: size.width * (headlineStyle.align === "center" ? 0.76 : headlineStyle.width),
          height: size.height * (carouselPage ? 0.18 : 0.17),
          text: pageCopy,
          fontFamily: brandBodyFont,
          fontSize: carouselPage ? bodyFontSize : Math.max(16, size.width * 0.032),
          fontWeight: 500,
          color: foreground,
          align: headlineStyle.align,
        } as const] : []),
        ...(input.format === "carousel" ? [{
          id: "page-number",
          type: "text" as const,
          x: size.width * 0.78,
          y: size.height * 0.9,
          width: size.width * 0.12,
          height: size.height * 0.05,
          text: `${String(pageIndex + 1).padStart(2, "0")} / ${String(input.content?.slides?.length ?? 1).padStart(2, "0")}`,
          fontFamily: brandBodyFont,
          fontSize: Math.max(14, size.width * 0.018),
          fontWeight: 700,
          color: foreground,
          align: "right" as const,
        }] : []),
        ...(input.logoSrc ? [{
          id: "brand-logo",
          type: "image" as const,
          x: size.width * 0.035,
          y: size.height * 0.035,
          width: size.width * 0.19,
          height: size.height * 0.105,
          src: input.logoSrc,
          fit: "contain" as const,
        }] : []),
    ],
    });
  };

  let pages: DesignPage[];
  if (input.format === "carousel" && input.content?.slides?.length) {
    pages = input.content.slides.map((slideValue, index) => {
      const slide = typeof slideValue === "string"
        ? { headline: slideValue, subheading: "", body: "" }
        : slideValue;
      const pageTitle = slide.headline || title;
      return makePage(
        pageTitle,
        slide.body ?? "",
        index,
        index === 0 ? "cover" : index === input.content!.slides!.length - 1 ? "closing" : "content",
        slide.subheading ?? "",
      );
    });
  } else if (input.format === "brochure") {
    const width = size.width;
    const height = size.height;
    const panelWidth = width / 3;
    const sourceSections = input.content?.sections ?? [];
    const sections = Array.from({ length: 6 }, (_, index) => sourceSections[index] ?? "");
    const getSection = (value: string) => {
      const split = value.split(/:\s*/, 2);
      return { heading: (split[0] || "").trim().slice(0, 58), body: (split[1] || "").trim().slice(0, 220) };
    };
    const outsideLayers: DesignLayer[] = [
      { id: "outside-back-panel", type: "shape", shape: "rectangle", x: 0, y: 0, width: panelWidth, height, fill: palette[2] ?? "#F5F3EE" },
      { id: "outside-fold-panel", type: "shape", shape: "rectangle", x: panelWidth, y: 0, width: panelWidth, height, fill: "#FFFFFF" },
      { id: "outside-front-panel", type: "shape", shape: "rectangle", x: panelWidth * 2, y: 0, width: panelWidth, height, fill: palette[0] ?? "#24364B" },
      { id: "outside-rule-1", type: "shape", shape: "rectangle", x: panelWidth - 2, y: height * 0.04, width: 2, height: height * 0.92, fill: palette[0] ?? "#24364B", opacity: 0.14 },
      { id: "outside-rule-2", type: "shape", shape: "rectangle", x: panelWidth * 2 - 2, y: height * 0.04, width: 2, height: height * 0.92, fill: palette[0] ?? "#24364B", opacity: 0.14 },
      { id: "brochure-brand", type: "text", x: panelWidth * 2 + panelWidth * 0.09, y: height * 0.12, width: panelWidth * 0.8, height: height * 0.045, text: brandName.toLocaleUpperCase(), fontFamily: brandBodyFont, fontSize: 36, fontWeight: 750, color: palette[2] ?? "#F5F3EE", letterSpacing: 3 },
      { id: "brochure-title", type: "text", x: panelWidth * 2 + panelWidth * 0.09, y: height * 0.29, width: panelWidth * 0.8, height: height * 0.27, text: title, fontFamily: brandHeadingFont ?? "Inter, sans-serif", fontSize: 100, fontWeight: 760, color: "#FFFFFF", lineHeight: 1.08 },
      { id: "brochure-support", type: "text", x: panelWidth * 2 + panelWidth * 0.09, y: height * 0.61, width: panelWidth * 0.8, height: height * 0.13, text: summary.slice(0, 150), fontFamily: brandBodyFont, fontSize: 34, fontWeight: 450, color: palette[2] ?? "#F5F3EE", lineHeight: 1.35 },
      { id: "brochure-cover-accent", type: "shape", shape: "rectangle", x: panelWidth * 2 + panelWidth * 0.09, y: height * 0.81, width: panelWidth * 0.16, height: 9, fill: palette[1] ?? "#B69A6A" },
      { id: "brochure-cta", type: "text", x: panelWidth * 2 + panelWidth * 0.09, y: height * 0.86, width: panelWidth * 0.8, height: height * 0.055, text: input.content?.posterText?.callToAction ?? "LEARN MORE", fontFamily: brandBodyFont, fontSize: 30, fontWeight: 750, color: "#FFFFFF" },
    ];
    const back = getSection(sections[5]!);
    const flap = getSection(sections[4]!);
    outsideLayers.push(
      { id: "brochure-back-brand", type: "text", x: panelWidth * 0.1, y: height * 0.1, width: panelWidth * 0.8, height: height * 0.045, text: brandName.toLocaleUpperCase(), fontFamily: brandBodyFont, fontSize: 28, fontWeight: 750, color: palette[0]!, letterSpacing: 2 },
      { id: "brochure-back-heading", type: "text", x: panelWidth * 0.1, y: height * 0.25, width: panelWidth * 0.8, height: height * 0.14, text: back.heading || "Get in touch", fontFamily: brandHeadingFont ?? "Inter, sans-serif", fontSize: 58, fontWeight: 750, color: palette[0]! },
      ...(back.body ? [{ id: "brochure-back-copy", type: "text" as const, x: panelWidth * 0.1, y: height * 0.42, width: panelWidth * 0.8, height: height * 0.2, text: back.body, fontFamily: brandBodyFont, fontSize: 29, fontWeight: 450, color: palette[0]! }] : []),
      { id: "brochure-fold-heading", type: "text", x: panelWidth * 1.1, y: height * 0.17, width: panelWidth * 0.8, height: height * 0.13, text: flap.heading || "What we do", fontFamily: brandHeadingFont ?? "Inter, sans-serif", fontSize: 54, fontWeight: 750, color: palette[0]! },
      ...(flap.body ? [{ id: "brochure-fold-copy", type: "text" as const, x: panelWidth * 1.1, y: height * 0.34, width: panelWidth * 0.8, height: height * 0.24, text: flap.body, fontFamily: brandBodyFont, fontSize: 28, fontWeight: 450, color: palette[0]! }] : []),
      { id: "brochure-fold-accent", type: "shape", shape: "rectangle", x: panelWidth * 1.1, y: height * 0.68, width: panelWidth * 0.15, height: 8, fill: palette[1]! },
    );
    const insideLayers: DesignLayer[] = [];
    sections.slice(0, 3).forEach((sectionValue, index) => {
      const section = getSection(sectionValue);
      const x = panelWidth * index;
      if (index > 0) insideLayers.push({ id: `inside-fold-rule-${index}`, type: "shape", shape: "rectangle", x, y: height * 0.05, width: 2, height: height * 0.9, fill: palette[0]!, opacity: 0.14 });
      insideLayers.push(
        { id: `inside-section-${index}-number`, type: "text", x: x + panelWidth * 0.09, y: height * 0.1, width: panelWidth * 0.8, height: height * 0.05, text: `0${index + 1}`, fontFamily: brandBodyFont, fontSize: 25, fontWeight: 750, color: palette[1]! },
        { id: `inside-section-${index}-title`, type: "text", x: x + panelWidth * 0.09, y: height * 0.21, width: panelWidth * 0.8, height: height * 0.18, text: section.heading || sections[index]!.slice(0, 58), fontFamily: brandHeadingFont ?? "Inter, sans-serif", fontSize: 53, fontWeight: 750, color: palette[0]!, lineHeight: 1.12 },
        ...(section.body ? [{ id: `inside-section-${index}-body`, type: "text" as const, x: x + panelWidth * 0.09, y: height * 0.44, width: panelWidth * 0.8, height: height * 0.26, text: section.body, fontFamily: brandBodyFont, fontSize: 28, fontWeight: 450, color: palette[0]!, lineHeight: 1.35 }] : []),
        { id: `inside-section-${index}-rule`, type: "shape", shape: "rectangle", x: x + panelWidth * 0.09, y: height * 0.82, width: panelWidth * 0.15, height: 8, fill: palette[1]! },
      );
    });
    pages = [
      { id: `${input.id}-outside`, name: "Outside ? tri-fold", role: "cover", ...size, background: { type: "color", color: palette[2] ?? "#F5F3EE" }, layers: outsideLayers },
      { id: `${input.id}-inside`, name: "Inside ? tri-fold", role: "content", ...size, background: { type: "color", color: "#FFFFFF" }, layers: insideLayers },
    ];
  } else if (input.format === "flyer") {
    const sections = input.content?.sections?.slice(0, 3) ?? [];
    const flyerLayers: DesignLayer[] = [
      { id: "flyer-brand", type: "text", x: size.width * 0.08, y: size.height * 0.07, width: size.width * 0.84, height: size.height * 0.04, text: brandName.toLocaleUpperCase(), fontFamily: brandBodyFont, fontSize: 44, fontWeight: 750, color: palette[1]!, letterSpacing: 3 },
      { id: "flyer-headline", type: "text", x: size.width * 0.08, y: size.height * 0.17, width: size.width * 0.84, height: size.height * 0.21, text: input.content?.posterText?.headline ?? title, fontFamily: brandHeadingFont ?? "Inter, sans-serif", fontSize: 118, fontWeight: 780, color: palette[0]!, lineHeight: 1.06 },
      { id: "flyer-support", type: "text", x: size.width * 0.08, y: size.height * 0.42, width: size.width * 0.78, height: size.height * 0.11, text: input.content?.posterText?.supportingLine ?? summary.slice(0, 130), fontFamily: brandBodyFont, fontSize: 37, fontWeight: 450, color: palette[0]!, lineHeight: 1.3 },
      { id: "flyer-rule", type: "shape", shape: "rectangle", x: size.width * 0.08, y: size.height * 0.57, width: size.width * 0.84, height: 3, fill: palette[1]!, opacity: 0.55 },
      ...sections.map((section, index) => ({ id: `flyer-detail-${index + 1}`, type: "text" as const, x: size.width * 0.08, y: size.height * (0.62 + index * 0.075), width: size.width * 0.84, height: size.height * 0.055, text: section.slice(0, 90), fontFamily: brandBodyFont, fontSize: 30, fontWeight: 550, color: palette[0]! })),
      { id: "flyer-cta", type: "text", x: size.width * 0.08, y: size.height * 0.9, width: size.width * 0.84, height: size.height * 0.045, text: input.content?.posterText?.callToAction ?? "LEARN MORE", fontFamily: brandBodyFont, fontSize: 34, fontWeight: 750, color: palette[0]! },
    ];
    pages = [{ id: `${input.id}-page-1`, name: "Flyer", role: "cover", ...size, background: { type: "color", color: palette[2] ?? "#F5F3EE" }, layers: flyerLayers }];
  } else {
    const posterText = input.content?.posterText;
    pages = [makePage(
        posterText?.headline ?? title,
        [posterText?.supportingLine, posterText?.callToAction].filter(Boolean).join(" · ") || summary,
        0,
        "cover",
    )];
  }
  return parseDesignDocument({
    version: designDocumentVersion,
    id: input.id,
    title,
    ...(input.templateId ? { templateId: input.templateId } : {}),
    palette,
    metadata: { layout, ...(input.content?.brandName ? { brandName: input.content.brandName } : {}) },
    pages,
  });
}

export function getLegacyDesignDocument(value: unknown, title: string, colors: string[], format: string): DesignDocument | null {
  if (isRecord(value) && value.version === designDocumentVersion) return parseDesignDocument(value);
  if (!isRecord(value)) return null;
  if (value.document !== undefined) return parseDesignDocument(value.document);
  const sourceTitle = typeof value.title === "string" ? value.title : title;
  const generatedContentId = typeof value.generatedContentId === "string" ? value.generatedContentId : "legacy-design";
  const variant = typeof value.variant === "number" ? value.variant : 0;
  return createDesignDocument({
    id: generatedContentId,
    title: sourceTitle,
    colors,
    format: typeof value.format === "string" ? value.format : format,
    variant,
    template: value.template,
  });
}
