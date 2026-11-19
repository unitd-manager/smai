import assert from "node:assert/strict";
import test from "node:test";
import { createDesignDocument } from "@united-technologies/shared/design-document";
import { starterTemplates } from "../src/services/template-library.js";

test("every supported format has sixty distinct template choices", () => {
  const formats = new Set(starterTemplates.map((template) => template.format));
  assert.equal(formats.size, 14);
  for (const format of formats) {
    assert.equal(starterTemplates.filter((template) => template.format === format).length, 60, format);
  }
  assert.equal(new Set(starterTemplates.map((template) => template.id)).size, starterTemplates.length);
  assert.equal(new Set(starterTemplates.map((template) => template.name)).size, starterTemplates.length);
});

test("starter templates expose the categories and slots needed by the layout engine", () => {
  const categories = new Set(starterTemplates.map((template) => template.category));
  assert.ok(categories.has("Indian festival greetings"));
  assert.ok(categories.has("Offers and sales"));
  assert.ok(starterTemplates.every((template) =>
    template.templateJson.layout &&
    template.templateJson.slots.includes("headline") &&
    template.templateJson.slots.includes("logo") &&
    template.templateJson.slots.includes("brandColors"),
  ));
});

test("starter templates provide distinct professional layouts beyond the three original variants", () => {
  const layouts = new Set(starterTemplates.map((template) => template.templateJson.layout));
  assert.ok(layouts.size >= 12);
  assert.ok(layouts.has("collage"));
  assert.ok(layouts.has("triptych"));
  assert.ok(layouts.has("magazine"));
  assert.ok(layouts.has("sparkle"));
  assert.ok(layouts.has("radiant"));
});

test("starter templates provide varied original palettes for their previews", () => {
  const palettes = new Set(starterTemplates.map((template) => template.templateJson.palette.join(",")));
  assert.ok(palettes.size >= 8);
});

test("every starter template keeps its chosen layout when generating a design", () => {
  for (const template of starterTemplates) {
    const document = createDesignDocument({
      id: template.id,
      title: template.name,
      format: template.format,
      colors: ["#123a70", "#2563eb", "#ffffff"],
      variant: 8,
      templateId: template.id,
      template: template.templateJson,
    });
    assert.equal(document.metadata?.layout, template.templateJson.layout, template.name);
    assert.equal(document.templateId, template.id);
  }
});
