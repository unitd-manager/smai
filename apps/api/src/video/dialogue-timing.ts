export type DialogueTimingInput = {
  durationSeconds: number;
  pauseBeforeSeconds?: number;
  overlapMs?: number;
};

export type TimedDialogueLine = {
  startFrame: number;
  durationFrames: number;
};

export function getDialogueGapSeconds(line: DialogueTimingInput, lineIndex: number) {
  if (line.overlapMs !== undefined) return -line.overlapMs / 1000;
  if (line.pauseBeforeSeconds !== undefined && line.pauseBeforeSeconds > 0.6) {
    return Math.min(1.2, line.pauseBeforeSeconds);
  }
  if (line.pauseBeforeSeconds !== undefined) {
    return Math.max(0.15, Math.min(0.4, line.pauseBeforeSeconds));
  }
  return 0.15 + (lineIndex % 5) * 0.055;
}

export function buildDialogueTimeline(
  lines: DialogueTimingInput[],
  fps: number,
  tailSeconds = 0.35,
): { lines: TimedDialogueLine[]; durationSeconds: number } {
  let elapsedSeconds = 0;
  const timedLines = lines.map((line, index) => {
    const gap = index === 0 ? 0 : getDialogueGapSeconds(line, index);
    const startSeconds = Math.max(0, elapsedSeconds + gap);
    const durationFrames = Math.max(1, Math.round(line.durationSeconds * fps));
    const startFrame = Math.round(startSeconds * fps);
    elapsedSeconds = Math.max(elapsedSeconds, startSeconds + durationFrames / fps);
    return { startFrame, durationFrames };
  });
  return {
    lines: timedLines,
    durationSeconds: elapsedSeconds + tailSeconds,
  };
}
