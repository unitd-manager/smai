import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve("src/app/globals.css"), "utf8");
const themeSettings = readFileSync(resolve("src/lib/theme-settings.ts"), "utf8");
const root = css.match(/:root\[data-theme-preset="midnight-blue-purple"\]\s*\{([^}]+)\}/i)?.[1] ?? "";
const requiredDefaults = new Map([
  ["--teal-900", "#050b17"],
  ["--gold-500", "#7952f6"],
  ["--background", "#070f1d"],
  ["--foreground", "#f4f7fc"],
]);
const errors = [];
const whiteCanvasExceptions = [".brand-kit-logo-preview", ".sidebar-brand"];
const expectedPresets = themeSettings.match(/\{ id: "[a-z-]+", name: "[^"]+", primaryName: "[^"]+", primary: "#[0-9A-F]{6}", accentName: "[^"]+", accent: "#[0-9A-F]{6}" \}/g) ?? [];

if (expectedPresets.length !== 8) errors.push(`Expected 8 professional color presets; found ${expectedPresets.length}.`);
if (/preset:\s*"midnight-blue-purple",\s*mode:\s*"dark"/.test(themeSettings) === false) {
  errors.push("The default appearance must use the midnight blue and violet dark theme.");
}
if (!css.includes("html[data-theme-font] body *")) {
  errors.push("The selected font pairing must cover all text across the web product.");
}
if (!css.includes("--studio-nav-active: linear-gradient(110deg, var(--teal-700) 0%, var(--accent-600) 100%)")) {
  errors.push("Active and hovered navigation must use the selected theme's shared gradient tokens.");
}
if (!css.includes("grid-template-columns: repeat(4, minmax(0, 1fr))")) {
  errors.push("The desktop color palette must display four choices per row.");
}
if (!css.includes(':root[data-theme-preset="midnight-blue-purple"][data-theme-mode="light"]')) {
  errors.push("The midnight preset must define an adaptive light-mode palette for its dashboard studio tokens.");
}
if (!css.includes("--studio-panel: var(--ivory-50)") || !css.includes("--studio-text: var(--foreground)")) {
  errors.push("Dashboard studio panel and text tokens must follow the resolved light-mode palette.");
}
if (!css.includes('html[data-theme-mode="light"][data-theme-preset="midnight-blue-purple"] body .app-shell .dashboard-topbar')) {
  errors.push("The dashboard top bar must switch to a light surface when light mode is selected.");
}
if (!css.includes("color-mix(in srgb, var(--ivory-200) 72%, var(--ivory-50))")) {
  errors.push("Dedicated feature containers must use adaptive surface tokens instead of dark-only colors.");
}

for (const [token, expected] of requiredDefaults) {
  const actual = root.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, "i"))?.[1]?.toLowerCase();
  if (actual !== expected) errors.push(`Expected ${token} to default to ${expected}.`);
}

if (/\.app-shell\s*\{[^}]*--(?:background|foreground|navy-[\w-]+|ivory-[\w-]+|accent-[\w-]+)\s*:\s*#[\da-f]{3,8}/i.test(css)) {
  errors.push("The app shell must use shared palette tokens instead of defining a fixed palette.");
}

for (const [, selector, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  if (
    selector.includes(".app-shell") &&
    /#[\da-f]{3,8}\b/i.test(declarations) &&
    !whiteCanvasExceptions.some((exception) => selector.includes(exception))
  ) {
    errors.push(`App-shell colors must use theme tokens (${selector.trim()}).`);
  }
}

if (errors.length) {
  console.error(`Theme palette check failed:\n- ${errors.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Theme palette defaults and app-shell token usage are valid.");
}
