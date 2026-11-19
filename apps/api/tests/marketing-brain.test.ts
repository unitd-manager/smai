import assert from "node:assert/strict";
import test from "node:test";
import { createRecommendationSuggestions } from "../src/services/marketing-brain.js";
import { getIndustryKnowledge } from "../src/services/industry-knowledge.js";
import { getUpcomingSeasonalMoments } from "../src/data/seasonal-calendar.js";

const now = new Date("2026-11-05T00:00:00.000Z");

test("Marketing Brain starts with a review-first recommendation when no publishing data exists", () => {
  const suggestions = createRecommendationSuggestions({
    now,
    posts: [],
    generated: [],
    goals: [],
    analyticsAvailable: false,
  });

  assert.equal(suggestions[0]?.key, "start-publishing");
  assert.match(suggestions[0]?.explanation ?? "", /reviewed draft/);
  assert.equal(suggestions[0]?.actionHref, "/dashboard/create");
  assert.equal(suggestions[0]?.metadata.limitedData, true);
});

test("Marketing Brain explains cadence and content-mix suggestions from recent activity", () => {
  const suggestions = createRecommendationSuggestions({
    now,
    posts: [{ status: "PUBLISHED", createdAt: new Date("2026-10-20T00:00:00.000Z"), scheduledAt: null }],
    generated: [{ contentJson: { format: "post" } }, { contentJson: { format: "carousel" } }],
    goals: ["awareness"],
    analyticsAvailable: false,
  });

  assert.deepEqual(suggestions.map((suggestion) => suggestion.key), ["posting-gap", "content-mix-video", "posting-frequency"]);
  assert.ok(suggestions.every((suggestion) => suggestion.title && suggestion.explanation && suggestion.actionHref));
  assert.equal(suggestions[2]?.metadata.limitedData, true);
});

test("Marketing Brain does not recommend a posting gap when a post is current", () => {
  const suggestions = createRecommendationSuggestions({
    now,
    posts: [{ status: "SCHEDULED", createdAt: now, scheduledAt: new Date("2026-11-06T00:00:00.000Z") }],
    generated: [{ contentJson: { format: "video" } }],
    goals: [],
    analyticsAvailable: true,
  });
  assert.equal(suggestions.some((suggestion) => suggestion.key === "posting-gap"), false);
  assert.equal(suggestions.some((suggestion) => suggestion.key === "content-mix-video"), false);
});

test("Marketing Brain links an upcoming local seasonal moment to a prefilled campaign draft", () => {
  const upcoming = getUpcomingSeasonalMoments(now, "India");
  assert.ok(upcoming.some((moment) => moment.name === "Diwali" && moment.date === "2026-11-08"));
  const suggestions = createRecommendationSuggestions({
    now,
    posts: [],
    generated: [],
    goals: [],
    analyticsAvailable: false,
    seasonalMoments: upcoming,
  });
  const seasonal = suggestions.find((suggestion) => suggestion.key === "seasonal-diwali-2026");

  assert.equal(seasonal?.kind, "seasonal");
  assert.match(seasonal?.actionHref ?? "", /dashboard\/campaigns\?goal=/);
  assert.match(seasonal?.explanation ?? "", /planning prompt/);
});

test("the industry cache provides bounded, explicit guidance without representing it as external research", () => {
  const knowledge = getIndustryKnowledge("Healthcare", "Community clinic");
  assert.match(knowledge.guidance.join(" "), /unsupported health outcomes/);
  assert.match(knowledge.limitation, /not live market research/);
  assert.ok(knowledge.version > 0);
});
