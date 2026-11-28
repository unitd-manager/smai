import assert from "node:assert/strict";
import test from "node:test";
import { createDesignDocument, renderDesignPageSvg } from "@united-technologies/shared/design-document";
import { buildAutopilotCompetitorGuidance, readAutopilotScheduleSettings } from "../src/services/instagram-autopilot.js";
import { starterTemplates } from "../src/services/template-library.js";

test("competitor guidance summarizes strategy signals without using post copy", () => {
  const guidance = buildAutopilotCompetitorGuidance([{
    observedAt: new Date("2026-11-27T00:00:00.000Z"),
    analysis: {
      content: { formats: ["Short-form video"], patterns: ["Show a problem, then a practical demonstration"] },
      actionPlan: { formatsToPrioritize: ["Short-form video"], topicsToOwn: ["Care tips"], audienceNeeds: ["Clear setup instructions"] },
      audience: { unmetNeeds: ["A simple comparison guide"] },
      creative: { differentiationIdeas: ["Use a calm expert voice"] },
    },
  }]);

  assert.match(guidance, /Short-form video/);
  assert.match(guidance, /Clear setup instructions/);
  assert.match(guidance, /2026-11-27/);
  assert.match(guidance, /Do not copy competitor wording/);
});

test("autopilot competitor guidance is empty when there are no analyzed signals", () => {
  assert.equal(buildAutopilotCompetitorGuidance([]), "");
  assert.equal(buildAutopilotCompetitorGuidance([{
    observedAt: new Date(),
    analysis: { content: {}, actionPlan: {}, audience: {}, creative: {} },
  }]), "");
});

test("weekly settings preserve template choices and default older settings to AI", () => {
  const configured = readAutopilotScheduleSettings({
    creationMode: "template",
    templateIds: { post: "starter-post-1", unknown: "ignored" },
    automationCreationMode: "ai",
    automationTemplateIds: {},
  });
  assert.equal(configured.creationMode, "template");
  assert.deepEqual(configured.templateIds, { post: "starter-post-1" });
  assert.equal(configured.automationCreationMode, "ai");
  assert.deepEqual(configured.automationTemplateIds, {});
  assert.equal(readAutopilotScheduleSettings({}).creationMode, "ai");
});

test("legacy recurring settings inherit their previous creation mode", () => {
  const legacy = readAutopilotScheduleSettings({
    creationMode: "template",
    templateIds: { post: "starter-post-1" },
  });
  assert.equal(legacy.automationCreationMode, "template");
  assert.deepEqual(legacy.automationTemplateIds, { post: "starter-post-1" });
});

test("manual and recurring video settings stay independent and older schedules get safe defaults", () => {
  const configured = readAutopilotScheduleSettings({
    videoSettings: {
      videoType: "realistic-avatar",
      durationSeconds: 30,
      narrationEnabled: true,
      voiceName: "voice-manual",
      musicId: "calm-horizon",
      musicStyle: "calm",
    },
    automationVideoSettings: {
      videoType: "animated-avatar",
      durationSeconds: 10,
      narrationEnabled: false,
      voiceName: "voice-weekly",
      musicId: "none",
      musicStyle: "bright",
    },
  });
  assert.equal(configured.videoSettings.videoType, "realistic-avatar");
  assert.equal(configured.videoSettings.voiceName, "voice-manual");
  assert.equal(configured.automationVideoSettings.videoType, "animated-avatar");
  assert.equal(configured.automationVideoSettings.voiceName, "voice-weekly");
  assert.equal(configured.automationVideoSettings.musicId, "none");

  const legacy = readAutopilotScheduleSettings({});
  assert.equal(legacy.videoSettings.videoType, "product-motion");
  assert.equal(legacy.videoSettings.durationSeconds, 15);
  assert.equal(legacy.automationVideoSettings.videoType, "product-motion");
});

test("starter template treatments map to distinct rendered layouts", () => {
  const templates = starterTemplates.filter((template) => template.format === "post").slice(0, 10);
  const layouts = templates.map((template) => template.templateJson.layout);
  assert.equal(new Set(layouts).size, templates.length);

  const previews = templates.map((template) => renderDesignPageSvg(createDesignDocument({
    id: template.id,
    title: "A useful brand story",
    format: "post",
    colors: template.templateJson.palette as string[],
    template: template.templateJson,
    content: { brandName: "Studio North", caption: "A practical, original message for the audience." },
  })));
  assert.equal(new Set(previews).size, templates.length);
});
