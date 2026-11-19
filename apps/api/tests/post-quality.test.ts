import assert from "node:assert/strict";
import test from "node:test";
import { checkPostQuality } from "../src/services/post-quality.js";

test("post quality blocks missing and over-limit captions but warns on recommendations", () => {
  const report = checkPostQuality(
    ["Instagram", "X", "LinkedIn"],
    {
      Instagram: "Join us to explore the new collection.",
      X: "x".repeat(281),
      LinkedIn: "Join us to explore the new collection.",
    },
  );

  assert.equal(report.passed, false);
  assert.ok(report.issues.some((issue) => issue.code === "caption-too-long" && issue.platform === "X"));
  assert.ok(report.issues.some((issue) => issue.code === "duplicate-platform-copy" && issue.platform === "LinkedIn"));
});

test("post quality uses safe warnings for unsupported platform rules and caption improvements", () => {
  const report = checkPostQuality(["Future Network"], { "Future Network": "A useful product update." });

  assert.equal(report.passed, true);
  assert.ok(report.issues.some((issue) => issue.code === "unverified-platform"));
  assert.ok(report.issues.some((issue) => issue.code === "missing-call-to-action"));
});

test("post quality blocks a missing per-platform caption", () => {
  const report = checkPostQuality(["Instagram"], {});

  assert.equal(report.passed, false);
  assert.equal(report.issues[0]?.code, "missing-caption");
});

test("post quality checks brand-banned words, placeholders, and unsupported absolute claims", () => {
  const report = checkPostQuality(
    ["LinkedIn"],
    { LinkedIn: "Our best offer guarantees results. Contact us for details. TBD" },
    ["best offer"],
  );

  assert.equal(report.passed, false);
  assert.ok(report.score < 100);
  assert.ok(report.issues.some((issue) => issue.code === "banned-word"));
  assert.ok(report.issues.some((issue) => issue.code === "unverified-claim"));
  assert.ok(report.issues.some((issue) => issue.code === "placeholder-copy"));
});
