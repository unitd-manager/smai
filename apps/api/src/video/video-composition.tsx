import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { renderDesignPageSvg } from "@united-technologies/shared/design-document";
import { getVideoSceneTimeline, SCENE_TRANSITION_FRAMES, type VideoCompositionProps, type VideoScene } from "./types.js";
import { IllustratedScene } from "./video-illustrations.js";
import { SphereConversationIllustration } from "./video-sphere-conversation.js";
import { ThreeDConversation } from "./video-3d-conversation.js";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

function Scene({ scene, index, document, fontFamily, avatarStyle }: {
  scene: VideoScene;
  index: number;
  document: VideoCompositionProps["document"];
  fontFamily: string;
  avatarStyle?: VideoCompositionProps["avatarStyle"];
}) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 85 } });
  const sceneProgress = interpolate(frame, [0, Math.max(1, scene.durationSeconds * fps)], [0, 1], clamp);
  const opacity = interpolate(frame, [0, 12, scene.durationSeconds * fps - 12, scene.durationSeconds * fps], [0, 1, 1, 0], clamp);
  const visualDocument = useMemo(() => ({
    ...document,
    pages: document.pages.map((page, pageIndex) => pageIndex === index
      ? { ...page, layers: page.layers.filter((layer) => !["scene-caption", "scene-headline", "scene-subtitle"].includes(layer.id)) }
      : page),
  }), [document, index]);
  const sceneImage = useMemo(() => renderDesignPageSvg(visualDocument, index), [visualDocument, index]);
  const words = scene.text.trim().split(/\s+/).filter(Boolean);
  const hasDialogue = Boolean(scene.dialogue?.length && scene.cast && scene.cast.length >= 2);
  const isConversation = hasDialogue && !scene.ahaMoment;
  const activeDialogue = [...(scene.dialogue ?? [])].reverse().find((line) =>
    line.startFrame !== undefined && line.durationFrames !== undefined &&
    frame >= line.startFrame && frame < line.startFrame + line.durationFrames,
  );
  const activeLineProgress = activeDialogue?.startFrame !== undefined && activeDialogue.durationFrames
    ? interpolate(frame, [activeDialogue.startFrame, activeDialogue.startFrame + activeDialogue.durationFrames], [0, 1], clamp)
    : 0;
  const headlineSize = Math.round(Math.min(width * 0.092, height * 0.105));
  const illustrationTop = width > height ? "45%" : width === height ? "59%" : "55%";
  const illustrationHeight = width > height ? "43%" : width === height ? "34%" : "31%";

  return <AbsoluteFill style={{
    opacity,
    background: isConversation
      ? "linear-gradient(155deg, #1B294B 0%, #3E4777 58%, #302744 100%)"
      : "transparent",
  }}>
      {scene.visualFile && scene.visualKind === "video" && (
        <OffthreadVideo src={staticFile(scene.visualFile)} muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.42 }} />
      )}
      {!isConversation && <Img src={sceneImage} style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        objectFit: "fill",
        transform: `translate(${interpolate(sceneProgress, [0, 1], [index % 2 ? 18 : -18, 0])}px, ${interpolate(sceneProgress, [0, 1], [12, -8])}px) scale(${interpolate(sceneProgress, [0, 1], [1.12, 1.04])})`,
      }} />}
      {!isConversation && <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(6, 14, 23, .12) 0%, rgba(6, 14, 23, .03) 42%, rgba(6, 14, 23, .5) 100%)", pointerEvents: "none" }} />}
      {!isConversation && <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
        <div style={{
          position: "absolute",
          top: `${12 + (index % 3) * 7}%`,
          right: `${-10 + (index % 2) * 5}%`,
          width: Math.min(width, height) * 0.52,
          aspectRatio: "1",
          border: `2px solid ${propsAccent(document, index)}`,
          borderRadius: index % 2 ? "28%" : "50%",
          opacity: 0.22,
          transform: `rotate(${frame * (index % 2 ? -0.3 : 0.3) + index * 17}deg) scale(${interpolate(enter, [0, 1], [0.72, 1])})`,
        }} />
        <div style={{
          position: "absolute",
          top: `${20 + (index % 2) * 11}%`,
          right: "12%",
          width: Math.min(width, height) * 0.16,
          aspectRatio: "1",
          borderRadius: "50%",
          background: propsAccent(document, index),
          opacity: interpolate(frame, [0, 16, 40], [0, 0.2, 0.08], clamp),
          transform: `translateY(${Math.sin(frame / 16 + index) * 18}px) scale(${interpolate(enter, [0, 1], [0.3, 1])})`,
        }} />
      </AbsoluteFill>}
      {!scene.visualFile && (
        <div style={{
          position: "absolute",
          top: isConversation ? "0" : illustrationTop,
          left: isConversation ? "0" : "7%",
          width: isConversation ? "100%" : "86%",
          height: isConversation ? "100%" : illustrationHeight,
          background: isConversation ? "linear-gradient(155deg, #1B294B 0%, #3E4777 58%, #302744 100%)" : undefined,
          filter: isConversation ? "none" : "drop-shadow(0 18px 24px rgba(0,0,0,.24))",
        }}>
          {isConversation
            ? avatarStyle === "illustrated"
              ? <SphereConversationIllustration
                  cast={scene.cast!}
                  activeSpeaker={activeDialogue?.speaker ?? null}
                  actions={scene.characters ?? []}
                  setting={scene.setting}
                  props={scene.props}
                  accent={propsAccent(document, index)}
                  ahaMoment={scene.ahaMoment}
                  portrait={height > width}
                />
              : <ThreeDConversation
                  cast={scene.cast!}
                  activeSpeaker={activeDialogue?.speaker ?? null}
                  activeLineText={activeDialogue?.text ?? ""}
                  activeLineProgress={activeLineProgress}
                  actions={scene.characters ?? []}
                  accent={propsAccent(document, index)}
                  setting={scene.setting}
                  props={scene.props}
                  width={width}
                  height={height}
                />
            : <IllustratedScene
                text={`${scene.text} ${scene.caption} ${scene.setting ?? ""} ${scene.props?.join(" ") ?? ""}`}
                index={index}
                accent={propsAccent(document, index)}
                setting={scene.setting}
                props={scene.props}
                characters={scene.characters}
                ahaMoment={scene.ahaMoment}
              />}
        </div>
      )}
      {!isConversation && <div style={{
        position: "absolute",
        top: `${interpolate(enter, [0, 1], [13, 16])}%`,
        left: "8%",
        maxWidth: "84%",
        color: propsAccent(document, index),
        fontFamily,
        fontSize: Math.max(22, Math.round(headlineSize * 0.34)),
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        opacity: interpolate(frame, [0, 12], [0, 1], clamp),
        textShadow: "0 2px 14px rgba(0,0,0,.4)",
      }}>{scene.caption}</div>}
      {isConversation && <div style={{
        position: "absolute",
        top: "7%",
        left: "7%",
        width: "86%",
        padding: "18px 22px",
        borderRadius: 18,
        background: "rgba(11, 24, 43, .78)",
        color: "#fff",
        fontFamily,
        fontSize: Math.max(26, Math.round(Math.min(width, height) * 0.042)),
        fontWeight: 750,
        lineHeight: 1.12,
        textAlign: "center",
        textShadow: "0 2px 12px rgba(0,0,0,.28)",
        opacity: interpolate(frame, [0, 12], [0, 1], clamp),
      }}>{scene.onScreenText ?? scene.text}</div>}
      {!isConversation && <div style={{
        position: "absolute",
        top: "34%",
        left: "8%",
        display: "flex",
        width: "84%",
        flexWrap: "wrap",
        alignContent: "center",
        columnGap: "0.24em",
        rowGap: "0.06em",
        color: "#fff",
        fontFamily,
        fontSize: headlineSize,
        fontWeight: 800,
        lineHeight: 1.04,
        textShadow: "0 4px 24px rgba(0,0,0,.48)",
      }}>
        {words.map((word, wordIndex) => {
          const progress = spring({ frame: Math.max(0, frame - wordIndex * 3), fps, config: { damping: 15, stiffness: 110, mass: 0.75 } });
          return <span key={`${word}-${wordIndex}`} style={{
            display: "inline-block",
            opacity: progress,
            filter: `blur(${interpolate(progress, [0, 1], [7, 0])}px)`,
            transform: `translateY(${interpolate(progress, [0, 1], [20, 0])}px) scale(${interpolate(progress, [0, 1], [0.96, 1])})`,
          }}>{word}</span>;
        })}
      </div>}
      {(activeDialogue?.text || (!isConversation && scene.narrationText)) && (
        <div style={{
          position: "absolute",
          right: "8%",
          bottom: "12%",
          left: "8%",
          padding: `${Math.max(10, Math.round(Math.min(width, height) * 0.012))}px ${Math.max(14, Math.round(Math.min(width, height) * 0.02))}px`,
          borderRadius: 16,
          backgroundColor: "rgba(6, 14, 23, .78)",
          color: "#fff",
          fontFamily,
          fontSize: Math.max(19, Math.round(Math.min(width, height) * 0.025)),
          fontWeight: 600,
          lineHeight: 1.24,
          textAlign: "center",
          textShadow: "0 2px 6px rgba(0,0,0,.4)",
          opacity: interpolate(frame, [5, 15], [0, 1], clamp),
        }}>
          {isConversation && activeDialogue?.speakerName && <strong style={{ display: "block", marginBottom: 4, color: "#FFF0A3" }}>{activeDialogue.speakerName}</strong>}
          {activeDialogue?.text ?? scene.narrationText}
        </div>
      )}
      <div style={{
        position: "absolute",
        right: "8%",
        bottom: "5%",
        left: "8%",
        display: "flex",
        alignItems: "center",
        gap: 14,
        opacity: interpolate(frame, [10, 26], [0, 1], clamp),
      }}>
        <span style={{ color: "#fff", fontFamily, fontSize: Math.max(18, Math.round(headlineSize * 0.2)), fontWeight: 700, letterSpacing: "0.12em" }}>{String(index + 1).padStart(2, "0")}</span>
        <div style={{ flex: 1, height: 3, borderRadius: 3, backgroundColor: "rgba(255,255,255,.28)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${sceneProgress * 100}%`, borderRadius: 3, backgroundColor: propsAccent(document, index) }} />
        </div>
      </div>
    </AbsoluteFill>;
}

function propsAccent(document: VideoCompositionProps["document"], index: number) {
  return document.palette[index % document.palette.length] ?? "#55c8ff";
}

function BrandEndCard({ props, pageIndex }: { props: VideoCompositionProps; pageIndex: number }) {
  const frame = useCurrentFrame();
  const enter = spring({ frame, fps: props.fps, config: { damping: 22, stiffness: 70 } });

  return (
    <AbsoluteFill style={{ opacity: interpolate(frame, [0, SCENE_TRANSITION_FRAMES], [0, 1], clamp) }}>
      <Img
        src={renderDesignPageSvg(props.document, pageIndex)}
        style={{
          width: props.width,
          height: props.height,
          objectFit: "fill",
          transform: `scale(${interpolate(enter, [0, 1], [1.035, 1])})`,
        }}
      />
    </AbsoluteFill>
  );
}

export function BrandedVideo(props: VideoCompositionProps) {
  const { fps } = useVideoConfig();
  const scenes = props.scenes;
  if (scenes.length === 0) throw new Error("Video rendering requires at least one approved scene.");
  const timeline = getVideoSceneTimeline(scenes.map((scene) => scene.durationSeconds), fps);

  return (
    <AbsoluteFill style={{ backgroundColor: props.colors[0] ?? "#253746" }}>
      {timeline.segments.map(({ from, durationInFrames }, index) => (
        <Sequence key={`${from}-${index}`} from={from} durationInFrames={durationInFrames} name={`Scene ${index + 1}`}>
          <Scene scene={scenes[index]!} index={index} document={props.document} fontFamily={props.fontFamily} avatarStyle={props.avatarStyle ?? "3d"} />
        </Sequence>
      ))}
      <Sequence from={timeline.totalFrames - 3 * fps} durationInFrames={3 * fps} name="Brand end card">
        <BrandEndCard props={props} pageIndex={Math.max(0, Math.min(props.scenes.length, props.document.pages.length - 1))} />
      </Sequence>
    </AbsoluteFill>
  );
}
