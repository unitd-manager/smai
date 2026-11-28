import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { createAudioFilterGraph, createMagicHourAudioFilterGraph, getNarrationSpeed, getRemotionBrowserExecutablePath, listMusicTracks, musicStyles, parseScenes, resolveRemotionBundleDirectory } from "../src/services/video-renderer.js";
import { piperVoiceProfiles, resolvePiperVoice, selectTtsProvider, ttsConfiguration } from "../src/services/video-tts.js";
import { getTargetSceneDuration, getTargetSceneDurations, getVideoSceneTimeline } from "../src/video/types.js";
import { inferIllustrationKind } from "../src/video/video-illustrations.js";
import { buildDialogueTimeline, getDialogueGapSeconds } from "../src/video/dialogue-timing.js";
import { parseSilenceDurations, validateVideoAudioQuality } from "../src/video/video-audio-quality.js";

test("music manifest only exposes playable tracks with a license note and an existing audio file", async () => {
  const tracks = await listMusicTracks();
  assert.ok(tracks.length >= 7);
  assert.ok(tracks.some((track) => track.id === "gentle-motion" && track.mood.includes("mild")));
  assert.ok(tracks.some((track) => track.id === "calm-horizon" && track.mood.includes("soft")));
  const hashes = new Set<string>();
  for (const track of tracks) {
    assert.ok(track.title);
    assert.ok(track.mood);
    assert.ok(track.licenseNote);
    assert.ok(track.durationSeconds > 0);
    await access(track.file);
    hashes.add(createHash("sha256").update(await readFile(track.file)).digest("hex"));
  }
  assert.equal(hashes.size, tracks.length, "each music option must point to a distinct audio composition");
});

test("video narration uses the offline Piper provider without paid TTS APIs", () => {
  assert.equal(selectTtsProvider().name, "piper");
  assert.equal(ttsConfiguration().defaultProvider, "piper");
  assert.deepEqual(Object.keys(ttsConfiguration().providers), ["piper"]);
  assert.equal(ttsConfiguration().voices.length, 5);
  assert.equal(piperVoiceProfiles.length, 5);
  assert.equal(new Set(piperVoiceProfiles.map((voice) => voice.speakerId)).size, 5);
  assert.equal(resolvePiperVoice("woman-warm"), "woman-warm");
  assert.equal(resolvePiperVoice("balanced"), "man-professional");
});

test("audio mixing uses FFmpeg's supported complex-filter syntax and ducks music under narration", () => {
  const graph = createAudioFilterGraph([2.5, 3], true, 0.12, 0.2, 8.5);
  assert.match(graph, /\[1:a\].*apad=whole_dur=2\.5/);
  assert.match(graph, /concat=n=2:v=0:a=1\[voice\]/);
  assert.match(graph, /\[3:a\].*volume='0\.12\*if\(lt\(t,5\.500\),0\.2,1\)'/);
  assert.match(graph, /amix=inputs=2:duration=longest/);
  assert.doesNotMatch(graph, /filter_script:a/);
});

test("narration audio can be slightly accelerated to fit an exact scene duration", () => {
  const graph = createAudioFilterGraph([12], false, 0.12, 0.2, 60, "balanced", [1.2]);
  assert.match(graph, /\[1:a\].*atempo=1\.200,apad=whole_dur=12/);
  const fasterGraph = createAudioFilterGraph([12], false, 0.12, 0.2, 60, "balanced", [2.5]);
  assert.match(fasterGraph, /\[1:a\].*atempo=2\.000,atempo=1\.250,apad=whole_dur=12/);
});

test("legacy video scenes narrate dialogue instead of stage directions and fit the requested timeline", () => {
  const scenes = parseScenes([
    "Scene 1: Customer walks into the shop looking tired. Narrator voiceover: Ready for a fresh start?",
    "Scene 2: The owner greets them at the counter. Owner: Welcome in. What would you like today?",
  ], "A shop story", 30);

  assert.equal(scenes[0]?.narrationText, "Ready for a fresh start?");
  assert.equal(scenes[1]?.narrationText, "Welcome in. What would you like today?");
  assert.deepEqual(
    getVideoSceneTimeline(getTargetSceneDurations(30, scenes.length), 30).totalFrames,
    30 * 30,
  );
});

test("legacy narration automatically fits overlong speech without rejecting the render", () => {
  assert.equal(getNarrationSpeed(6.48, 5.4), 1.2);
  assert.equal(getNarrationSpeed(5, 5.4), 1);
  assert.equal(getNarrationSpeed(7.4, 5.4), 7.4 / 5.4);
  assert.equal(getNarrationSpeed(20, 5), 4);
  assert.throws(() => getNarrationSpeed(0, 5), /positive finite/);
});

test("video music treatments generate distinct FFmpeg processing graphs", () => {
  assert.equal(musicStyles.length, 5);
  const graph = createAudioFilterGraph([2], true, 0.12, 0.2, 5, "cinematic");
  assert.match(graph, /equalizer=f=120:t=q:w=1:g=2/);
  assert.match(graph, /equalizer=f=7000:t=q:w=1:g=2/);
});

test("Magic Hour product narration replaces generated audio and ducks the selected music", () => {
  const graph = createMagicHourAudioFilterGraph({
    hasSourceAudio: true,
    hasVoiceover: true,
    hasMusic: true,
    totalDurationSeconds: 15,
    voiceoverDurationSeconds: 8,
    musicVolume: 0.2,
    musicDucking: 0.25,
    musicStyle: "warm",
  });
  assert.match(graph, /^\[1:a\].*\[base\]/);
  assert.match(graph, /\[2:a\].*volume='0\.2\*if\(lt\(t,8\.000\),0\.25,1\)'/);
  assert.match(graph, /amix=inputs=2:duration=first/);
  assert.doesNotMatch(graph, /\[0:a\]/);
});

test("Magic Hour avatar audio can mix background music or keep the original speech alone", () => {
  const withMusic = createMagicHourAudioFilterGraph({
    hasSourceAudio: true,
    hasVoiceover: false,
    hasMusic: true,
    totalDurationSeconds: 10,
    musicVolume: 0.12,
    musicDucking: 0.3,
    musicStyle: "balanced",
  });
  assert.match(withMusic, /\[0:a\].*\[base\]/);
  assert.match(withMusic, /\[1:a\].*volume='0\.12\*if\(lt\(t,10\.000\),0\.3,1\)'/);

  const withoutMusic = createMagicHourAudioFilterGraph({
    hasSourceAudio: true,
    hasVoiceover: false,
    hasMusic: false,
    totalDurationSeconds: 10,
    musicVolume: 0.12,
    musicDucking: 0.3,
    musicStyle: "balanced",
  });
  assert.match(withoutMusic, /\[0:a\].*\[base\]/);
  assert.match(withoutMusic, /\[base\]anull\[aout\]/);
});

test("dialogue timing follows measured clips with short varied turns and a short scene tail", () => {
  const timeline = buildDialogueTimeline([
    { durationSeconds: 1.2 },
    { durationSeconds: 1, pauseBeforeSeconds: 0.3 },
    { durationSeconds: 0.4, overlapMs: 120 },
  ], 30);

  assert.equal(timeline.lines[0]?.startFrame, 0);
  assert.equal(timeline.lines[1]?.startFrame, 45);
  assert.equal(timeline.lines[2]?.startFrame, 71);
  assert.ok(timeline.durationSeconds < 3.2);
  assert.equal(getDialogueGapSeconds({ durationSeconds: 1, pauseBeforeSeconds: 1.5 }, 1), 1.2);
  assert.equal(getDialogueGapSeconds({ durationSeconds: 1, overlapMs: 120 }, 1), -0.12);
});

test("audio quality checks reject unintended silence and duration drift", () => {
  assert.deepEqual(parseSilenceDurations("[silencedetect] silence_duration: 0.45\n[silencedetect] silence_duration: 1.3"), [0.45, 1.3]);
  assert.doesNotThrow(() => validateVideoAudioQuality({
    requestedDurationSeconds: 60,
    actualDurationSeconds: 62.9,
    silentGapSeconds: [0.8],
    audioPresent: true,
  }));
  assert.throws(() => validateVideoAudioQuality({
    requestedDurationSeconds: 60,
    actualDurationSeconds: 60,
    silentGapSeconds: [1.01],
    audioPresent: true,
  }), /unintended 1\.0 second silent gap/);
  assert.throws(() => validateVideoAudioQuality({
    requestedDurationSeconds: 60,
    actualDurationSeconds: 63.1,
    silentGapSeconds: [],
    audioPresent: false,
  }), /within 3 seconds/);
});

test("video scene timeline overlaps scene and end-card fades without adding blank frames", () => {
  const timeline = getVideoSceneTimeline([4, 5], 30);

  assert.deepEqual(timeline.segments, [
    { from: 0, durationInFrames: 120 },
    { from: 108, durationInFrames: 150 },
  ]);
  assert.equal(timeline.totalFrames, 336);
});

test("target scene pacing includes transitions and the brand end card in the requested runtime", () => {
  const requestedDuration = 60;
  const sceneCount = 4;
  const sceneDuration = getTargetSceneDuration(requestedDuration, sceneCount);
  const timeline = getVideoSceneTimeline(Array.from({ length: sceneCount }, () => sceneDuration), 30);

  assert.ok(Math.abs(timeline.totalFrames / 30 - requestedDuration) <= 1);
});

test("Idea to MP4 scene frame allocation keeps 1-to-5-minute renders exact", () => {
  for (const seconds of [60, 120, 180, 240, 300]) {
    const sceneCount = seconds / 12;
    const durations = getTargetSceneDurations(seconds, sceneCount);
    const timeline = getVideoSceneTimeline(durations, 30);
    assert.equal(timeline.totalFrames, seconds * 30);
    assert.ok(durations.every((duration) => duration >= 8 && duration <= 15));
  }
});

test("Remotion rendering only accepts the exact local bundle output, never a web origin", () => {
  const bundleDirectory = path.join(process.cwd(), "assets", "video-work", "job", "remotion-bundle");
  assert.equal(resolveRemotionBundleDirectory(bundleDirectory, bundleDirectory), bundleDirectory);
  assert.throws(
    () => resolveRemotionBundleDirectory("http://localhost:3000", bundleDirectory),
    /local absolute bundle directory/,
  );
  assert.throws(
    () => resolveRemotionBundleDirectory(path.join(process.cwd(), "apps", "web"), bundleDirectory),
    /different from the requested render bundle output/,
  );
});

test("Remotion Chromium preflight checks the managed browser cache for the current platform", () => {
  const windowsExecutable = getRemotionBrowserExecutablePath("win32", "x64", process.cwd());
  const linuxExecutable = getRemotionBrowserExecutablePath("linux", "arm64", process.cwd());

  assert.ok(windowsExecutable.endsWith(path.join(".remotion", "chrome-headless-shell", "win64", "chrome-headless-shell.exe")));
  assert.ok(linuxExecutable.endsWith(path.join(".remotion", "chrome-headless-shell", "linux-arm64", "chrome-headless-shell")));
});

test("local video illustrations select a scene treatment from the narration", () => {
  assert.equal(inferIllustrationKind("A patient arrives at the hospital and books an appointment"), "healthcare");
  assert.equal(inferIllustrationKind("Automate the booking workflow and confirm each step"), "workflow");
  assert.equal(inferIllustrationKind("A customer team grows the business"), "business");
  assert.equal(inferIllustrationKind("A thoughtful story for your audience"), "general");
});
