import assert from "node:assert/strict";
import test from "node:test";
import {
  getVideoJobStage,
  maxVideoRenderAttempts,
  videoRenderFailureMessage,
  videoRenderTimeoutMs,
  videoRetryAt,
} from "../src/services/video-job-state.js";

test("video retries use bounded backoff and cap render attempts at two retries", () => {
  const now = new Date("2026-11-03T00:00:00.000Z");
  assert.equal(maxVideoRenderAttempts, 3);
  assert.equal(videoRetryAt(now, 1).getTime() - now.getTime(), 15_000);
  assert.equal(videoRetryAt(now, 2).getTime() - now.getTime(), 30_000);
  assert.equal(videoRetryAt(now, 3).getTime() - now.getTime(), 60_000);
  assert.equal(videoRetryAt(now, 10).getTime() - now.getTime(), 60_000);
});

test("video jobs expose actionable named stages and a finite timeout", () => {
  assert.equal(videoRenderTimeoutMs, 30 * 60_000);
  assert.equal(getVideoJobStage("QUEUED", 0), "Waiting in render queue");
  assert.equal(getVideoJobStage("PROCESSING", 5), "Preparing video");
  assert.equal(getVideoJobStage("PROCESSING", 20), "Generating voice");
  assert.equal(getVideoJobStage("PROCESSING", 35), "Preparing scenes");
  assert.equal(getVideoJobStage("PROCESSING", 50), "Rendering scenes");
  assert.equal(getVideoJobStage("PROCESSING", 97), "Adding music");
  assert.equal(getVideoJobStage("PROCESSING", 98), "Checking audio quality");
  assert.equal(getVideoJobStage("PROCESSING", 99), "Finishing video");
  assert.equal(getVideoJobStage("SUCCEEDED", 100), "Complete");
  assert.equal(getVideoJobStage("TIMED_OUT", 0), "Timed out");
});

test("video failures expose only safe, actionable render-validation errors", () => {
  const durationError = "Rendered video duration is 38.2 seconds; it must be within 3 seconds of the requested 30 seconds. Add or remove dialogue beats and render again.";
  assert.equal(videoRenderFailureMessage(new Error(durationError)), durationError);
  assert.equal(
    videoRenderFailureMessage(new Error("Piper failed; token=secret")),
    "Video rendering could not complete after three attempts. Retry the render or contact support.",
  );
  assert.equal(videoRenderFailureMessage("unexpected"), "Video rendering could not complete after three attempts. Retry the render or contact support.");
});
