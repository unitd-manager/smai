export const themePresets = [
  { id: "midnight-blue-purple", name: "Blue and Purple", primaryName: "Midnight", primary: "#050B17", accentName: "Violet", accent: "#7952F6" },
  { id: "teal-gold", name: "Teal and Gold", primaryName: "Teal", primary: "#073B3A", accentName: "Gold", accent: "#C9A227" },
  { id: "ocean-blue", name: "Ocean Blue", primaryName: "Ocean", primary: "#14516B", accentName: "Sky", accent: "#48A9C5" },
  { id: "royal-purple", name: "Royal Purple", primaryName: "Royal", primary: "#4B3275", accentName: "Gold", accent: "#D7AD45" },
  { id: "charcoal-orange", name: "Charcoal and Orange", primaryName: "Charcoal", primary: "#34383D", accentName: "Orange", accent: "#E67E22" },
  { id: "forest-green", name: "Forest Green", primaryName: "Forest", primary: "#28563E", accentName: "Gold", accent: "#C6A348" },
  { id: "rose-plum", name: "Rose and Plum", primaryName: "Plum", primary: "#693B59", accentName: "Rose", accent: "#D28AA3" },
  { id: "slate-sky", name: "Slate and Sky", primaryName: "Slate", primary: "#3A4B61", accentName: "Sky", accent: "#5EA7D6" },
] as const;

export type ThemePresetId = (typeof themePresets)[number]["id"] | "custom";
export type ThemeMode = "light" | "dark" | "system";
export type SidebarStyle = "colored" | "light";
export type ThemeDensity = "comfortable" | "compact";
export type ThemeCorners = "subtle" | "rounded" | "pill";
export type ThemeFontPairing = "modern" | "editorial" | "classic";
export type ThemeCardStyle = "bordered" | "elevated";

export type ThemeSettings = {
  preset: ThemePresetId;
  mode: ThemeMode;
  sidebarStyle: SidebarStyle;
  density: ThemeDensity;
  corners: ThemeCorners;
  fontPairing: ThemeFontPairing;
  cardStyle: ThemeCardStyle;
  customPrimary?: string;
  customAccent?: string;
};

export const defaultThemeSettings: ThemeSettings = {
  preset: "midnight-blue-purple",
  mode: "dark",
  sidebarStyle: "colored",
  density: "comfortable",
  corners: "rounded",
  fontPairing: "modern",
  cardStyle: "bordered",
};

const themeModes: ThemeMode[] = ["light", "dark", "system"];
const sidebarStyles: SidebarStyle[] = ["colored", "light"];
const densities: ThemeDensity[] = ["comfortable", "compact"];
const cornerStyles: ThemeCorners[] = ["subtle", "rounded", "pill"];
const fontPairings: ThemeFontPairing[] = ["modern", "editorial", "classic"];
const cardStyles: ThemeCardStyle[] = ["bordered", "elevated"];
const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

export function normalizeThemeSettings(value: unknown): ThemeSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultThemeSettings;
  const input = value as Record<string, unknown>;
  const preset = themePresets.some((item) => item.id === input.preset)
    ? input.preset as ThemePresetId
    : defaultThemeSettings.preset;
  return {
    preset,
    mode: themeModes.includes(input.mode as ThemeMode) ? input.mode as ThemeMode : defaultThemeSettings.mode,
    sidebarStyle: sidebarStyles.includes(input.sidebarStyle as SidebarStyle)
      ? input.sidebarStyle as SidebarStyle
      : defaultThemeSettings.sidebarStyle,
    density: densities.includes(input.density as ThemeDensity)
      ? input.density as ThemeDensity
      : defaultThemeSettings.density,
    corners: cornerStyles.includes(input.corners as ThemeCorners)
      ? input.corners as ThemeCorners
      : defaultThemeSettings.corners,
    fontPairing: fontPairings.includes(input.fontPairing as ThemeFontPairing)
      ? input.fontPairing as ThemeFontPairing
      : defaultThemeSettings.fontPairing,
    cardStyle: cardStyles.includes(input.cardStyle as ThemeCardStyle)
      ? input.cardStyle as ThemeCardStyle
      : defaultThemeSettings.cardStyle,
    ...(isHexColor(input.customPrimary) ? { customPrimary: input.customPrimary } : {}),
    ...(isHexColor(input.customAccent) ? { customAccent: input.customAccent } : {}),
  };
}

function hasGreenPrimary(value: string | undefined) {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return false;
  const red = Number.parseInt(value.slice(1, 3), 16) / 255;
  const green = Number.parseInt(value.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(value.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) return false;
  let hue = max === red ? ((green - blue) / delta) % 6
    : max === green ? (blue - red) / delta + 2
      : (red - green) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return hue >= 85 && hue <= 180;
}

export function isLegacyGreenTheme(value: ThemeSettings) {
  return value.preset === "teal-gold" || value.preset === "forest-green" ||
    (value.preset === "custom" && hasGreenPrimary(value.customPrimary));
}

export function upgradeLegacyThemeSettings(value: unknown): ThemeSettings {
  // Green and teal palettes remain valid selectable themes. Older migration logic
  // ran on every route load and incorrectly replaced deliberate user selections.
  return normalizeThemeSettings(value);
}

export type ThemeTokens = Record<string, string>;
const tealScale = {
  "--teal-950": "#042625",
  "--teal-900": "#073B3A",
  "--teal-800": "#0B4F4D",
  "--teal-700": "#11635F",
  "--teal-600": "#1A7A75",
  "--teal-300": "#8FC1BD",
  "--teal-100": "#D6EAE8",
  "--teal-50": "#EEF6F5",
};
const goldScale = {
  "--gold-700": "#8F7218",
  "--gold-600": "#A8871F",
  "--gold-500": "#C9A227",
  "--gold-400": "#D9B84A",
  "--gold-200": "#EBD790",
  "--gold-100": "#F6EBC4",
  "--gold-50": "#FBF6E3",
};

const tealGoldLight: ThemeTokens = {
  ...tealScale,
  ...goldScale,
  "--background": "#FFFFFF",
  "--foreground": "#0F2A29",
  "--navy-950": "#073B3A",
  "--navy-900": "#FFFFFF",
  "--navy-800": "#0F2A29",
  "--navy-700": "#EEF6F5",
  "--navy-600": "#3F5B5A",
  "--navy-400": "#7A9392",
  "--navy-200": "#3F5B5A",
  "--accent-700": "#8F7218",
  "--accent-600": "#A8871F",
  "--accent-500": "#C9A227",
  "--accent-400": "#D9B84A",
  "--accent-300": "#EBD790",
  "--accent-100": "#F6EBC4",
  "--ivory-50": "#FFFFFF",
  "--ivory-100": "#FFFFFF",
  "--ivory-200": "#EEF6F5",
  "--ivory-300": "#DCE7E6",
  "--control-placeholder": "#657C7A",
  "--action-primary": "#C9A227",
  "--action-primary-hover": "#D9B84A",
};

const tealGoldDark: ThemeTokens = {
  ...tealGoldLight,
  "--background": "#031C1B",
  "--foreground": "#F2F6F5",
  "--navy-950": "#031C1B",
  "--navy-900": "#031C1B",
  "--navy-800": "#073B3A",
  "--navy-700": "#0B4F4D",
  "--navy-600": "#11635F",
  "--navy-400": "#8FC1BD",
  "--navy-200": "#D6EAE8",
  "--accent-700": "#EBD790",
  "--accent-600": "#D9B84A",
  "--accent-500": "#C9A227",
  "--accent-400": "#D9B84A",
  "--accent-300": "#EBD790",
  "--accent-100": "#254B43",
  "--ivory-50": "#073B3A",
  "--ivory-100": "#F2F6F5",
  "--ivory-200": "#0B4F4D",
  "--ivory-300": "#11635F",
  "--control-placeholder": "#AFCAC7",
  "--action-primary": "#C9A227",
  "--action-primary-hover": "#D9B84A",
};

function hexChannels(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function mixHex(first: string, second: string, weight: number): string {
  const a = hexChannels(first);
  const b = hexChannels(second);
  return `#${a.map((value, index) => Math.round(value * (1 - weight) + b[index]! * weight)
    .toString(16).padStart(2, "0")).join("")}`;
}

function readableTextColor(background: string): string {
  const darkText = "#000000";
  const lightText = "#FFFFFF";
  return contrastRatio(background, darkText) >= contrastRatio(background, lightText)
    ? darkText
    : lightText;
}

function makePaletteTokens(primary: string, accent: string, mode: "light" | "dark"): ThemeTokens {
  const dark = mode === "dark";
  const page = dark ? mixHex(primary, "#000000", 0.67) : "#FFFFFF";
  const surface = dark ? mixHex(primary, "#000000", 0.42) : "#FFFFFF";
  const soft = dark ? mixHex(primary, "#FFFFFF", 0.14) : mixHex(primary, "#FFFFFF", 0.93);
  const border = dark ? mixHex(primary, "#FFFFFF", 0.28) : mixHex(primary, "#FFFFFF", 0.84);
  const strong = dark ? "#F2F6F5" : "#172C2B";
  const text = dark ? "#D5E0DF" : "#405B59";
  const muted = dark ? "#A4B8B6" : "#718987";
  const accentText = dark ? mixHex(accent, "#FFFFFF", 0.28) : mixHex(accent, "#000000", 0.33);
  return {
    "--teal-950": mixHex(primary, "#000000", 0.7),
    "--teal-900": primary,
    "--teal-800": mixHex(primary, "#FFFFFF", dark ? 0.16 : 0.12),
    "--teal-700": mixHex(primary, "#FFFFFF", dark ? 0.3 : 0.24),
    "--teal-600": mixHex(primary, "#FFFFFF", dark ? 0.44 : 0.38),
    "--teal-300": mixHex(primary, "#FFFFFF", 0.64),
    "--teal-100": mixHex(primary, "#FFFFFF", 0.84),
    "--teal-50": mixHex(primary, "#FFFFFF", 0.94),
    "--gold-700": accentText,
    "--gold-600": dark ? mixHex(accent, "#FFFFFF", 0.12) : mixHex(accent, "#000000", 0.2),
    "--gold-500": accent,
    "--gold-400": dark ? mixHex(accent, "#FFFFFF", 0.22) : mixHex(accent, "#FFFFFF", 0.12),
    "--gold-200": mixHex(accent, "#FFFFFF", 0.4),
    "--gold-100": dark ? mixHex(primary, accent, 0.16) : mixHex(accent, "#FFFFFF", 0.84),
    "--gold-50": dark ? mixHex(primary, accent, 0.1) : mixHex(accent, "#FFFFFF", 0.93),
    "--background": page,
    "--foreground": strong,
    "--navy-950": dark ? mixHex(primary, "#000000", 0.67) : primary,
    "--navy-900": page,
    "--navy-800": dark ? surface : strong,
    "--navy-700": soft,
    "--navy-600": text,
    "--navy-400": muted,
    "--navy-200": dark ? "#D5E0DF" : text,
    "--accent-700": strong,
    "--accent-600": dark ? mixHex(accent, "#FFFFFF", 0.12) : mixHex(accent, "#000000", 0.2),
    "--accent-500": accent,
    "--accent-400": dark ? mixHex(accent, "#FFFFFF", 0.22) : mixHex(accent, "#FFFFFF", 0.12),
    "--accent-300": dark ? mixHex(accent, "#FFFFFF", 0.4) : mixHex(accent, "#FFFFFF", 0.36),
    "--accent-100": dark ? mixHex(primary, accent, 0.16) : mixHex(accent, "#FFFFFF", 0.84),
    "--ivory-50": surface,
    "--ivory-100": dark ? "#F2F6F5" : "#FFFFFF",
    "--ivory-200": dark ? soft : mixHex(primary, "#FFFFFF", 0.95),
    "--ivory-300": border,
    "--control-placeholder": muted,
    "--action-primary": accent,
    "--action-primary-hover": dark ? mixHex(accent, "#FFFFFF", 0.16) : mixHex(accent, "#FFFFFF", 0.12),
  };
}

function withSidebarStyle(tokens: ThemeTokens, style: SidebarStyle, mode: "light" | "dark"): ThemeTokens {
  const light = mode === "light";
  if (style === "colored") {
    return {
      ...tokens,
      "--sidebar-background": tokens["--teal-900"]!,
      "--sidebar-foreground": readableTextColor(tokens["--teal-900"]!),
      "--sidebar-muted": readableTextColor(tokens["--teal-900"]!),
    };
  }
  return {
    ...tokens,
    "--navy-950": light ? "#F4F8F7" : "#071918",
    "--sidebar-background": light ? "#F4F8F7" : "#071918",
    "--sidebar-foreground": light ? tokens["--foreground"]! : "#F2F6F5",
    "--sidebar-muted": light ? tokens["--navy-600"]! : "#D5E0DF",
  };
}

export function getThemeTokens(settings: ThemeSettings, resolvedMode: "light" | "dark"): ThemeTokens {
  const selected = settings.preset === "custom"
    ? { primary: settings.customPrimary ?? "#073B3A", accent: settings.customAccent ?? "#C9A227" }
    : themePresets.find((preset) => preset.id === settings.preset) ?? themePresets[0];
  const base = settings.preset === "teal-gold" && resolvedMode === "light"
    ? tealGoldLight
    : settings.preset === "teal-gold" && resolvedMode === "dark"
      ? tealGoldDark
      : settings.preset === "midnight-blue-purple" && resolvedMode === "light"
        ? {
          ...makePaletteTokens(selected.primary, selected.accent, resolvedMode),
          "--teal-700": "#356DFF", "--teal-600": "#4D83FF",
        }
        : settings.preset === "midnight-blue-purple" && resolvedMode === "dark"
        ? {
          ...makePaletteTokens(selected.primary, selected.accent, resolvedMode),
          "--teal-950": "#050B17", "--teal-900": "#050B17", "--teal-800": "#0C1729", "--teal-700": "#356DFF",
          "--teal-600": "#4D83FF", "--teal-300": "#A7B3C7", "--teal-100": "#D7DEEA", "--teal-50": "#F4F7FC",
          "--gold-700": "#B5A2FF", "--gold-600": "#9678FF", "--gold-500": "#7952F6", "--gold-400": "#9275FF",
          "--gold-200": "#B4A4FF", "--gold-100": "#25203F", "--gold-50": "#1B1A31",
          "--background": "#070F1D", "--foreground": "#F4F7FC", "--navy-950": "#050B17", "--navy-900": "#070F1D",
          "--navy-800": "#101D30", "--navy-700": "#0C1729", "--navy-600": "#A7B3C7", "--navy-400": "#A7B3C7", "--navy-200": "#A7B3C7",
          "--accent-700": "#C4B7FF", "--accent-600": "#9A7BFF", "--accent-500": "#7952F6", "--accent-400": "#9275FF",
          "--accent-300": "#B4A4FF", "--accent-100": "#25203F", "--ivory-50": "#0C1729", "--ivory-100": "#F4F7FC",
          "--ivory-200": "#101D30", "--ivory-300": "#26364E", "--control-placeholder": "#A7B3C7",
          "--success": "#25C98A", "--warning": "#F5B84B", "--danger": "#EF6262",
          "--action-primary": "#356DFF", "--action-primary-hover": "#4B7DFF",
        }
        : makePaletteTokens(selected.primary, selected.accent, resolvedMode);
  const themed = withSidebarStyle(base, settings.sidebarStyle, resolvedMode);
  if (settings.preset === "midnight-blue-purple" && settings.sidebarStyle === "colored") {
    themed["--sidebar-background"] = resolvedMode === "dark" ? "#070F1D" : "#FFFFFF";
    themed["--sidebar-foreground"] = themed["--foreground"]!;
    themed["--sidebar-muted"] = themed["--navy-600"]!;
  }
  const action = themed["--action-primary"]!;
  const actionHover = themed["--action-primary-hover"]!;
  return {
    ...themed,
    "--action-primary-text": resolvedMode === "dark" ? "#FFFFFF" : readableTextColor(action),
    "--action-primary-hover-text": resolvedMode === "dark" ? "#FFFFFF" : readableTextColor(actionHover),
  };
}

function linearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(first: string, second: string): number {
  const luminance = (hex: string) => {
    const [red, green, blue] = hexChannels(hex).map(linearChannel);
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

export function resolveThemeMode(mode: ThemeMode): "light" | "dark" {
  if (mode === "system" && typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode === "dark" ? "dark" : "light";
}

export function applyThemeSettings(settings: ThemeSettings): "light" | "dark" {
  const normalized = normalizeThemeSettings(settings);
  const resolvedMode = resolveThemeMode(normalized.mode);
  const root = document.documentElement;
  root.dataset.themePreset = normalized.preset;
  root.dataset.themeMode = resolvedMode;
  root.dataset.themeDensity = normalized.density;
  root.dataset.themeCorners = normalized.corners;
  root.dataset.themeFont = normalized.fontPairing;
  root.dataset.themeCardStyle = normalized.cardStyle;
  root.dataset.themeSidebar = normalized.sidebarStyle;
  if (resolvedMode === "dark") root.dataset.appTheme = "dark";
  else delete root.dataset.appTheme;
  for (const [name, value] of Object.entries(getThemeTokens(normalized, resolvedMode))) {
    root.style.setProperty(name, value);
  }
  root.style.setProperty("--theme-font-body",
    normalized.fontPairing === "classic" ? "Arial, sans-serif" : "var(--font-inter), sans-serif");
  root.style.setProperty("--theme-font-heading",
    normalized.fontPairing === "modern" ? "var(--font-inter), sans-serif"
      : normalized.fontPairing === "classic" ? "Georgia, serif"
        : "var(--font-playfair), Georgia, serif");
  return resolvedMode;
}
