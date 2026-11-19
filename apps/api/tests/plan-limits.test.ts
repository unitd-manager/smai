import assert from "node:assert/strict";
import test from "node:test";
import { getAiGenerationLimit } from "../src/services/plan-limits.js";

test("active trials have no app-level AI generation limit", () => {
  const now = new Date("2026-11-16T00:00:00Z");
  assert.equal(getAiGenerationLimit("trial", "trialing", new Date("2026-11-30T00:00:00Z"), now), null);
});

test("paid plans retain their configured AI generation limit", () => {
  const now = new Date("2026-11-16T00:00:00Z");
  assert.equal(getAiGenerationLimit("starter", "active", new Date("2026-11-30T00:00:00Z"), now), 100);
});

test("expired trials do not receive the active-trial unlimited allowance", () => {
  const now = new Date("2026-11-16T00:00:00Z");
  assert.equal(getAiGenerationLimit("trial", "trialing", new Date("2026-11-15T00:00:00Z"), now), 100);
});
