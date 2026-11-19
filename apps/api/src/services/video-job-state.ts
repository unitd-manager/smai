export const maxVideoRenderAttempts = 3;
export const videoRenderTimeoutMs = 30 * 60_000;
export const videoHeartbeatIntervalMs = 5_000;
export const staleVideoHeartbeatMs = 90_000;

export function videoRetryAt(now: Date, attempts: number) {
  const delayMs = Math.min(60_000, 15_000 * 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + delayMs);
}

export function videoRenderFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const actionableErrors = [
    /^Rendered video duration is \d+(?:\.\d+)? seconds; it must be within 3 seconds of the requested \d+ seconds\. Add or remove dialogue beats and render again\.$/,
    /^Rendered audio contains an unintended \d+(?:\.\d+)? second silent gap\. Add dialogue, sound design, or a background bed and render again\.$/,
  ];
  return actionableErrors.some((pattern) => pattern.test(message))
    ? message
    : "Video rendering could not complete after three attempts. Retry the render or contact support.";
}

export function getVideoJobStage(status: string, progress: number) {
  if (status === "QUEUED") return "Waiting in render queue";
  if (status === "PROCESSING") {
    if (progress < 8) return "Preparing video";
    if (progress < 31) return "Generating voice";
    if (progress < 38) return "Preparing scenes";
    if (progress < 96) return "Rendering scenes";
    if (progress < 98) return "Adding music";
    if (progress < 99) return "Checking audio quality";
    return "Finishing video";
  }
  if (status === "SUCCEEDED") return "Complete";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "TIMED_OUT") return "Timed out";
  return "Failed";
}
