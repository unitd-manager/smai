import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { VideoScene } from "./types.js";

type Character = NonNullable<VideoScene["cast"]>[number];

function colorFromAppearance(appearance: string, fallback: string) {
  const palettes: Array<[RegExp, string]> = [
    [/\b(teal|turquoise|aqua)\b/i, "#38B9B2"],
    [/\b(blue|azure|navy)\b/i, "#558CDF"],
    [/\b(purple|violet|lavender)\b/i, "#9A6BE8"],
    [/\b(coral|orange|peach)\b/i, "#F28A64"],
    [/\b(pink|rose|magenta)\b/i, "#E77CA7"],
    [/\b(green|lime|mint)\b/i, "#68BB7A"],
    [/\b(yellow|gold|amber)\b/i, "#E9B848"],
    [/\b(red|crimson|scarlet)\b/i, "#D96065"],
  ];
  return palettes.find(([pattern]) => pattern.test(appearance))?.[1] ?? fallback;
}

function skinToneFromAppearance(appearance: string, fallback: string) {
  const tones: Array<[RegExp, string]> = [
    [/\b(very dark|deep|dark)\s+(?:brown\s+)?skin\b|\bdark brown skin\b|\bdark-skinned\b/i, "#754735"],
    [/\bmedium[- ]brown skin\b|\bbrown skin\b|\bdeep tan skin\b/i, "#A96F50"],
    [/\btan skin\b|\bolive skin\b|\bmedium skin\b/i, "#C58B69"],
    [/\blight skin\b|\bfair skin\b|\bpale skin\b|\bwhite[- ]skinned\b|\bwhite (?:woman|man|person|girl|boy)\b/i, "#E0A477"],
  ];
  return tones.find(([pattern]) => pattern.test(appearance))?.[1] ?? fallback;
}

function hairColorFromAppearance(appearance: string, fallback: string) {
  const colors: Array<[RegExp, string]> = [
    [/\b(platinum|blonde|blond)\b/i, "#E3C47C"],
    [/\b(auburn|red hair|ginger)\b/i, "#A84F36"],
    [/\b(gray|grey|silver|white hair)\b/i, "#AEB5C2"],
    [/\b(black hair|black curly hair|black coily hair|black braided hair|raven hair)\b/i, "#24232C"],
    [/\b(dark brown hair|brown hair|brunette)\b/i, "#553B31"],
  ];
  return colors.find(([pattern]) => pattern.test(appearance))?.[1] ?? fallback;
}

function characterScale(appearance: string) {
  if (/\b(infant|toddler|young child)\b/i.test(appearance)) return 0.72;
  if (/\b(child|kid)\b/i.test(appearance)) return 0.82;
  if (/\b(teen|teenager|adolescent)\b/i.test(appearance)) return 0.92;
  return 1;
}

function CharacterOutfit({ index, accent, jacket }: { index: number; accent: string; jacket: string }) {
  const shirt = index === 0 ? "#F6F1E8" : index === 1 ? "#F8EBD6" : "#EEE9FA";
  return (
    <>
      <mesh position={[0, -0.17, 0]} castShadow>
        <cylinderGeometry args={[0.37, 0.3, 1.02, 32]} />
        <meshStandardMaterial color={jacket} roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.3, 0]} scale={[0.5, 0.22, 0.34]} castShadow>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color={jacket} roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.12, 0.326]} scale={[0.17, 0.31, 0.035]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={shirt} roughness={0.72} />
      </mesh>
      <mesh position={[0, -0.28, 0.326]} scale={[0.065, 0.065, 0.03]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color={accent} metalness={0.24} roughness={0.38} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <group key={x} position={[x, 0.39, 0.02]} rotation={[0, 0, x < 0 ? -0.15 : 0.15]}>
          <mesh>
            <capsuleGeometry args={[0.15, 0.34, 6, 12]} />
            <meshStandardMaterial color={jacket} roughness={0.72} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Avatar({ character, index, activeSpeaker, activeLineText, activeLineProgress, action, accent }: {
  character: Character;
  index: number;
  activeSpeaker: string | null;
  activeLineText: string;
  activeLineProgress: number;
  action: string;
  accent: string;
}) {
  const frame = useCurrentFrame();
  const talking = activeSpeaker === character.id;
  const blink = Math.floor((frame + index * 29) % 119) < 5;
  const syllableCount = Math.max(1, (activeLineText.match(/[aeiouy]+/gi) ?? []).length);
  const mouthPhase = (activeLineProgress * syllableCount) % 1;
  const mouthOpen = talking && mouthPhase < 0.62;
  const bounce = Math.sin(frame / (talking ? 3.8 : 10) + index) * (talking ? 0.1 : 0.045);
  const handWave = Math.sin(frame / 5 + index) * (talking ? 0.36 : 0.08);
  const reaches = /\b(tap|touch|use|point|hold|show|press|reveal)\b/i.test(action);
  const baseColor = colorFromAppearance(character.appearance, index === 1 ? "#E9A465" : index === 2 ? "#9A6BE8" : "#558CDF");
  const skinTone = skinToneFromAppearance(character.appearance, ["#B97552", "#E0A477", "#8F5A46"][index] ?? "#C58B69");
  const hairColor = hairColorFromAppearance(character.appearance, ["#302339", "#553B31", "#27354B"][index] ?? "#302339");
  const appearance = character.appearance.toLowerCase();
  const longHair = /\b(long hair|long-haired|braids?|ponytail)\b/.test(appearance);
  const braidedHair = /\bbraids?\b/.test(appearance);
  const curlyHair = /\b(curly|coily|afro)\b/.test(appearance);
  const side = index % 2 === 0 ? 1 : -1;
  const leftArmRotation = reaches ? side * -0.72 : side * (0.25 + handWave);
  const rightArmRotation = reaches ? side * 0.72 : -side * (0.25 + handWave);

  return (
    <group position={[0, bounce, 0]} rotation={[0, Math.sin(frame / 31 + index) * 0.035, 0]}>
      <mesh position={[-0.23, -1.12, 0.02]} rotation={[0, 0, -0.04]} castShadow>
        <capsuleGeometry args={[0.13, 0.72, 8, 14]} />
        <meshStandardMaterial color={index === 1 ? "#51466B" : "#39445C"} roughness={0.8} />
      </mesh>
      <mesh position={[0.23, -1.12, 0.02]} rotation={[0, 0, 0.04]} castShadow>
        <capsuleGeometry args={[0.13, 0.72, 8, 14]} />
        <meshStandardMaterial color={index === 1 ? "#51466B" : "#39445C"} roughness={0.8} />
      </mesh>
      {[-0.27, 0.27].map((x) => (
        <mesh key={x} position={[x, -1.61, 0.11]} rotation={[0, 0, x < 0 ? -0.08 : 0.08]} scale={[1.1, 0.58, 1.35]}>
          <capsuleGeometry args={[0.12, 0.22, 6, 12]} />
          <meshStandardMaterial color={index === 1 ? "#51466B" : "#39445C"} roughness={0.72} />
        </mesh>
      ))}
      <CharacterOutfit index={index} accent={accent} jacket={baseColor} />
      <mesh position={[0, 0.57, 0]}>
        <cylinderGeometry args={[0.17, 0.19, 0.3, 20]} />
        <meshStandardMaterial color={skinTone} roughness={0.78} />
      </mesh>
      <mesh position={[0, 1.08, 0.04]} castShadow scale={[0.52, 0.62, 0.44]}>
        <sphereGeometry args={[1, 36, 28]} />
        <meshStandardMaterial color={skinTone} roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.56, 0.015]} scale={[0.52, 0.18, 0.42]} castShadow>
        <sphereGeometry args={[1, 32, 20]} />
        <meshStandardMaterial color={hairColor} roughness={0.86} />
      </mesh>
      {longHair && <mesh position={[0, 1.04, -0.27]} scale={[0.53, 0.66, 0.28]} castShadow>
        <sphereGeometry args={[1, 24, 18]} />
        <meshStandardMaterial color={hairColor} roughness={0.86} />
      </mesh>}
      {braidedHair && [-0.38, 0.38].map((x) => (
        <mesh key={x} position={[x, 0.98, 0.02]} rotation={[0, 0, x < 0 ? 0.12 : -0.12]}>
          <capsuleGeometry args={[0.075, 0.66, 6, 12]} />
          <meshStandardMaterial color={hairColor} roughness={0.86} />
        </mesh>
      ))}
      {curlyHair && [-0.34, -0.17, 0, 0.17, 0.34].map((x) => (
        <mesh key={x} position={[x, 1.64 + (1 - Math.abs(x) / 0.34) * 0.06, 0.03]} scale={[0.2, 0.18, 0.18]}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial color={hairColor} roughness={0.86} />
        </mesh>
      ))}
      <mesh position={[-0.49, 1.12, 0.035]} scale={[0.085, 0.13, 0.08]}>
        <sphereGeometry args={[1, 18, 14]} />
        <meshStandardMaterial color={skinTone} roughness={0.78} />
      </mesh>
      <mesh position={[0.49, 1.12, 0.035]} scale={[0.085, 0.13, 0.08]}>
        <sphereGeometry args={[1, 18, 14]} />
        <meshStandardMaterial color={skinTone} roughness={0.78} />
      </mesh>
      <mesh position={[-0.2, 1.2, 0.445]} scale={[0.12, blink ? 0.018 : 0.12, 0.055]}>
        <sphereGeometry args={[1, 20, 16]} />
        <meshStandardMaterial color="#FFFDF8" roughness={0.25} />
      </mesh>
      <mesh position={[0.2, 1.2, 0.445]} scale={[0.12, blink ? 0.018 : 0.12, 0.055]}>
        <sphereGeometry args={[1, 20, 16]} />
        <meshStandardMaterial color="#FFFDF8" roughness={0.25} />
      </mesh>
      {!blink && <>
        <mesh position={[-0.19, 1.19, 0.49]} scale={[0.045, 0.074, 0.03]}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial color="#27334D" />
        </mesh>
        <mesh position={[0.21, 1.19, 0.49]} scale={[0.045, 0.074, 0.03]}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial color="#27334D" />
        </mesh>
      </>}
      <mesh position={[-0.2, 1.37, 0.47]} rotation={[0, 0, -0.1]} scale={[0.15, 0.027, 0.035]}>
        <capsuleGeometry args={[0.5, 1, 4, 8]} />
        <meshStandardMaterial color={hairColor} />
      </mesh>
      <mesh position={[0.2, 1.37, 0.47]} rotation={[0, 0, 0.1]} scale={[0.15, 0.027, 0.035]}>
        <capsuleGeometry args={[0.5, 1, 4, 8]} />
        <meshStandardMaterial color={hairColor} />
      </mesh>
      <mesh position={[0, 1.02, 0.475]} scale={[0.055, 0.085, 0.055]}>
        <sphereGeometry args={[1, 18, 14]} />
        <meshStandardMaterial color={skinTone} roughness={0.68} />
      </mesh>
      <mesh position={[0, 0.83, 0.465]} scale={[0.105, mouthOpen ? 0.095 : 0.025, 0.03]}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial color="#512B43" roughness={0.5} />
      </mesh>
      <mesh position={[-0.63, -0.16, 0]} rotation={[0, 0, leftArmRotation]}>
        <capsuleGeometry args={[0.15, 0.64, 8, 14]} />
        <meshStandardMaterial color={baseColor} roughness={0.38} />
      </mesh>
      <mesh position={[0.63, -0.16, 0]} rotation={[0, 0, rightArmRotation]}>
        <capsuleGeometry args={[0.15, 0.64, 8, 14]} />
        <meshStandardMaterial color={baseColor} roughness={0.38} />
      </mesh>
      <mesh position={[-0.78, -0.45 + handWave * 0.16, 0.03]} scale={[0.16, 0.15, 0.16]}>
        <sphereGeometry args={[1, 20, 16]} />
        <meshStandardMaterial color={skinTone} roughness={0.76} />
      </mesh>
      <mesh position={[0.78, -0.45 - handWave * 0.16, 0.03]} scale={[0.16, 0.15, 0.16]}>
        <sphereGeometry args={[1, 20, 16]} />
        <meshStandardMaterial color={skinTone} roughness={0.76} />
      </mesh>
      <mesh position={[0, -0.34, 0.41]} scale={[0.12, 0.17, 0.035]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color={accent} roughness={0.45} metalness={0.24} />
      </mesh>
      {character.appearance.toLowerCase().includes("glasses") && [-0.2, 0.2].map((x) => (
        <mesh key={x} position={[x, 1.2, 0.51]}>
          <torusGeometry args={[0.15, 0.025, 8, 20]} />
          <meshStandardMaterial color="#342D40" metalness={0.55} roughness={0.28} />
        </mesh>
      ))}
    </group>
  );
}

export function ThreeDConversation({ cast, activeSpeaker, activeLineText, activeLineProgress, actions, accent, setting, props = [], width, height }: {
  cast: Character[];
  activeSpeaker: string | null;
  activeLineText: string;
  activeLineProgress: number;
  actions: NonNullable<VideoScene["characters"]>;
  accent: string;
  setting?: string;
  props?: string[];
  width: number;
  height: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const portrait = height > width;
  const positions = cast.length === 3
    ? portrait ? [-1.05, 0, 1.05] : [-1.22, 0, 1.22]
    : [-0.88, 0.88];
  const avatarScale = portrait ? [0.6, 0.62, 0.6] : [0.94, 0.94, 0.94];
  const cameraDistance = portrait ? 12.2 : height === width ? 7.5 : 7;
  const floorPulse = interpolate(Math.sin(frame / Math.max(1, fps)), [-1, 1], [0.02, 0.05]);
  const isOutdoor = setting === "outdoors";

  return (
    <ThreeCanvas
      width={width}
      height={height}
      orthographic={false}
      camera={{ position: [0, 0, cameraDistance], fov: 34 }}
      gl={{ alpha: true, antialias: true }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "transparent" }}
    >
      <ambientLight intensity={1.35} />
      <directionalLight position={[-3, 5, 6]} intensity={3.1} castShadow />
      <pointLight position={[4, 2, 3]} color={accent} intensity={22} distance={11} />
      {!isOutdoor && <mesh position={[0, 0.5, -2.8]}>
        <planeGeometry args={[18, 12]} />
        <meshStandardMaterial color="#D6E0E9" roughness={0.92} />
      </mesh>}
      <mesh position={[0, -2.05, -0.8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#32416B" roughness={0.92} metalness={0.02} transparent opacity={0.92} />
      </mesh>
      {!isOutdoor && <>
        <mesh position={[0, -1.08, 0.72]} castShadow receiveShadow>
          <boxGeometry args={[5.3, 0.16, 1.4]} />
          <meshStandardMaterial color="#80614A" roughness={0.56} />
        </mesh>
        {[-2.15, 2.15].map((x) => <mesh key={`table-leg-${x}`} position={[x, -1.62, 0.72]} castShadow>
          <boxGeometry args={[0.15, 1.02, 0.95]} />
          <meshStandardMaterial color="#4B5362" roughness={0.72} />
        </mesh>)}
        <group position={[0, -0.66, 0.08]}>
          <mesh position={[0, 0.18, 0]} castShadow>
            <boxGeometry args={[1.42, 0.94, 0.09]} />
            <meshStandardMaterial color="#263650" roughness={0.34} />
          </mesh>
          <mesh position={[0, 0.18, 0.055]}>
            <boxGeometry args={[1.22, 0.72, 0.025]} />
            <meshStandardMaterial color="#EAF1F7" emissive="#19334E" emissiveIntensity={0.12} />
          </mesh>
          {[0, 1, 2, 3].map((bar) => <mesh key={`chart-bar-${bar}`} position={[-0.38 + bar * 0.24, -0.06 + bar * 0.09, 0.075]}>
            <boxGeometry args={[0.11, 0.18 + bar * 0.18, 0.02]} />
            <meshStandardMaterial color={bar === 3 ? accent : "#5D92B7"} />
          </mesh>)}
          <mesh position={[0, -0.36, 0]} castShadow>
            <boxGeometry args={[1.62, 0.07, 0.62]} />
            <meshStandardMaterial color="#39475A" roughness={0.42} />
          </mesh>
        </group>
        {props.filter((name) => name === "phone" || name === "coffee-cup" || name === "book").slice(0, 2).map((name, index) => (
          <group key={`${name}-${index}`} position={[index === 0 ? -1.52 : 1.52, -0.88, 0.8]} rotation={[0, index ? -0.18 : 0.18, 0]}>
            {name === "phone" ? <>
              <mesh rotation={[-0.12, 0, 0]}><boxGeometry args={[0.3, 0.48, 0.045]} /><meshStandardMaterial color="#252E3D" /></mesh>
              <mesh position={[0, 0, 0.027]} rotation={[-0.12, 0, 0]}><boxGeometry args={[0.25, 0.4, 0.01]} /><meshStandardMaterial color="#A9D4E8" /></mesh>
            </> : <mesh position={[0, 0.07, 0]}>
              <cylinderGeometry args={[0.14, 0.16, 0.3, 24]} />
              <meshStandardMaterial color={name === "coffee-cup" ? "#F4F0E8" : accent} roughness={0.5} />
            </mesh>}
          </group>
        ))}
      </>}
      {cast.map((character, index) => (
        <group
          key={character.id}
          position={[positions[index] ?? 0, -0.1 - (1 - characterScale(character.appearance)) * 1.5 * avatarScale[1]!, index === 1 ? 0.18 : 0]}
          scale={avatarScale.map((scale) => scale * characterScale(character.appearance))}
        >
          <Avatar
            character={character}
            index={index}
            activeSpeaker={activeSpeaker}
            activeLineText={activeLineText}
            activeLineProgress={activeLineProgress}
            action={actions[index]?.action ?? character.personality}
            accent={accent}
          />
        </group>
      ))}
      <mesh position={[0, -1.85, -0.7]}>
        <sphereGeometry args={[0.1 + floorPulse, 20, 12]} />
        <meshBasicMaterial color={accent} transparent opacity={0.14} />
      </mesh>
    </ThreeCanvas>
  );
}
