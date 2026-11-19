export type VideoAudioQualityInput = {
  requestedDurationSeconds: number;
  actualDurationSeconds: number;
  silentGapSeconds: number[];
  audioPresent: boolean;
};

export function parseSilenceDurations(stderr: string) {
  return [...stderr.matchAll(/silence_duration:\s*([\d.]+)/g)]
    .map((match) => Number.parseFloat(match[1]!))
    .filter((duration) => Number.isFinite(duration));
}

export function validateVideoAudioQuality(input: VideoAudioQualityInput) {
  const durationDifference = Math.abs(input.actualDurationSeconds - input.requestedDurationSeconds);
  if (durationDifference > 3) {
    throw new Error(
      `Rendered video duration is ${input.actualDurationSeconds.toFixed(1)} seconds; it must be within 3 seconds of the requested ${input.requestedDurationSeconds} seconds. Add or remove dialogue beats and render again.`,
    );
  }
  if (input.audioPresent) {
    const longGap = input.silentGapSeconds.find((duration) => duration > 1);
    if (longGap !== undefined) {
      throw new Error(
        `Rendered audio contains an unintended ${longGap.toFixed(1)} second silent gap. Add dialogue, sound design, or a background bed and render again.`,
      );
    }
  }
}
