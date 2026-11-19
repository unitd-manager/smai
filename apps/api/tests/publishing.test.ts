import assert from "node:assert/strict";
import test from "node:test";
import { makeDemoPublishResult, publishRetryDelayMs } from "../src/services/publishing.js";

test("demo publishing creates a deterministic fake platform ID", () => {
  const publishedAt = new Date("2026-01-02T03:04:05.000Z");
  assert.deepEqual(makeDemoPublishResult("job-123", publishedAt), {
    platformPostId: "demo_job-123",
    publishedAt,
  });
});

test("publish retries use capped exponential backoff", () => {
  assert.equal(publishRetryDelayMs(1), 120_000);
  assert.equal(publishRetryDelayMs(2), 240_000);
  assert.equal(publishRetryDelayMs(10), 30 * 60_000);
});
