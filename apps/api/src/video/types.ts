import type { DesignDocument } from "@united-technologies/shared/design-document";

export type VideoScene = {
  text: string;
  speakerName?: string;
  caption: string;
  narrationText?: string;
  onScreenText?: string;
  setting?: string;
  characters?: Array<{ role: string; action: string }>;
  props?: string[];
  ahaMoment?: boolean;
  cast?: Array<{ id: "A" | "B" | "C"; name: string; appearance: string; personality: string }>;
  dialogue?: Array<{
    speaker: "A" | "B" | "C";
    text: string;
    emotion?: "neutral" | "curious" | "warm" | "excited" | "reassuring" | "concerned" | "thoughtful" | "playful" | "serious" | "relieved";
    pace?: "slow" | "natural" | "brisk";
    volume?: "soft" | "normal" | "projected";
    energy?: number;
    pauseBeforeSeconds?: number;
    pauseReason?: string;
    overlapMs?: number;
    startFrame?: number;
    durationFrames?: number;
    speakerName?: string;
  }>;
  audioSpeed?: number;
  audioFile?: string;
  visualFile?: string;
  visualKind?: "image" | "video";
  durationSeconds: number;
};

export type VideoCompositionProps = {
  title: string;
  brandName: string;
  callToAction?: string;
  handle?: string | null;
  colors: string[];
  fontFamily: string;
  logoFile?: string;
  document: DesignDocument;
  scenes: VideoScene[];
  width: number;
  height: number;
  fps: number;
  avatarStyle?: "3d" | "illustrated";
};

export const SCENE_TRANSITION_FRAMES = 12;

export function getTargetSceneDuration(totalDurationSeconds: number, sceneCount: number, fps = 30) {
  if (sceneCount < 1) return 0;
  const endCardFrames = 3 * fps;
  const transitionFrames = sceneCount * SCENE_TRANSITION_FRAMES;
  return Math.max(
    2,
    (totalDurationSeconds * fps - endCardFrames + transitionFrames) / (sceneCount * fps),
  );
}

export function getTargetSceneDurations(totalDurationSeconds: number, sceneCount: number, fps = 30) {
  if (sceneCount < 1) return [];
  const sceneFrames = Math.round(totalDurationSeconds * fps) - 3 * fps + sceneCount * SCENE_TRANSITION_FRAMES;
  const baseFrames = Math.floor(sceneFrames / sceneCount);
  const extraFrames = sceneFrames - baseFrames * sceneCount;
  return Array.from({ length: sceneCount }, (_, index) =>
    (baseFrames + (index < extraFrames ? 1 : 0)) / fps,
  );
}

export function getVideoSceneTimeline(sceneDurations: number[], fps: number) {
  let nextFrom = 0;
  const segments = sceneDurations.map((durationSeconds, index) => {
    const durationInFrames = Math.max(30, Math.ceil(durationSeconds * fps));
    const from = nextFrom;
    nextFrom += durationInFrames - (index < sceneDurations.length - 1 ? SCENE_TRANSITION_FRAMES : 0);
    return { from, durationInFrames };
  });
  const sceneEnd = segments.reduce((end, segment) => Math.max(end, segment.from + segment.durationInFrames), 0);
  const endCardFrom = Math.max(0, sceneEnd - SCENE_TRANSITION_FRAMES);
  return {
    segments,
    totalFrames: endCardFrom + 3 * fps,
  };
}

export const VIDEO_SIZES = {
  vertical: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
} as const;
