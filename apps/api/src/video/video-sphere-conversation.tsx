import React, { useId } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { IllustratedProp } from "./video-illustrations.js";

type SphereCharacter = { id: "A" | "B" | "C"; name: string; appearance: string; personality: string };
type CharacterAction = { role: string; action: string };

function sphereColor(appearance: string, fallback: string) {
  const colorWords: Array<[RegExp, string]> = [
    [/\b(teal|turquoise|aqua)\b/, "#38B9B2"],
    [/\b(blue|azure|navy)\b/, "#558CDF"],
    [/\b(purple|violet|lavender)\b/, "#9A6BE8"],
    [/\b(coral|orange|peach)\b/, "#F28A64"],
    [/\b(pink|rose|magenta)\b/, "#E77CA7"],
    [/\b(green|lime|mint)\b/, "#68BB7A"],
    [/\b(yellow|gold|amber)\b/, "#E9B848"],
    [/\b(red|crimson|scarlet)\b/, "#D96065"],
  ];
  return colorWords.find(([pattern]) => pattern.test(appearance.toLowerCase()))?.[1] ?? fallback;
}

export function SphereConversationIllustration({
  cast,
  activeSpeaker,
  actions,
  setting,
  props = [],
  accent,
  ahaMoment = false,
  portrait = false,
}: {
  cast: SphereCharacter[];
  activeSpeaker: "A" | "B" | null;
  actions: CharacterAction[];
  setting?: string;
  props?: string[];
  accent: string;
  ahaMoment?: boolean;
  portrait?: boolean;
}) {
  const frame = useCurrentFrame();
  const id = useId().replace(/:/g, "");
  const outdoor = setting === "outdoors";
  const shop = setting === "shop-front" || setting === "counter";
  const screen = setting === "dashboard" || setting === "phone-demo" || setting === "laptop-demo";
  const waiting = setting === "waiting-area";
  const ahaProgress = interpolate(frame, [5, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return <svg
    aria-label={`${cast.length} original illustrated characters having a conversation: ${cast.map((character) => character.name).join(", ")}`}
    role="img"
    viewBox={`0 0 1000 ${portrait ? 1778 : 760}`}
    preserveAspectRatio="xMidYMid meet"
    style={{ display: "block", width: "100%", height: "100%" }}
  >
    <defs>
      <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={outdoor ? "#244F80" : shop ? "#522C67" : "#26365F"} />
        <stop offset=".55" stopColor={outdoor ? "#408FA0" : shop ? "#A34E75" : "#4D5487"} />
        <stop offset="1" stopColor={outdoor ? "#A8C889" : shop ? "#F1A76D" : "#D27C82"} />
      </linearGradient>
      <linearGradient id={`floor-${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#F4BE85" stopOpacity=".84" />
        <stop offset="1" stopColor="#624974" stopOpacity=".92" />
      </linearGradient>
      <radialGradient id={`orb-a-${id}`} cx="30%" cy="22%" r="78%">
        <stop offset="0" stopColor="#FFFFFF" />
        <stop offset=".18" stopColor="#C7F5F5" />
        <stop offset=".7" stopColor={sphereColor(cast.find((item) => item.id === "A")?.appearance ?? "", accent)} />
        <stop offset="1" stopColor="#183C68" />
      </radialGradient>
      <radialGradient id={`orb-b-${id}`} cx="28%" cy="20%" r="80%">
        <stop offset="0" stopColor="#FFF5D9" />
        <stop offset=".2" stopColor="#FFD5A1" />
        <stop offset=".72" stopColor={sphereColor(cast.find((item) => item.id === "B")?.appearance ?? "", "#F2A65A")} />
        <stop offset="1" stopColor="#A74361" />
      </radialGradient>
      <radialGradient id={`orb-c-${id}`} cx="28%" cy="20%" r="80%">
        <stop offset="0" stopColor="#FFF5D9" />
        <stop offset=".2" stopColor="#E1D2FF" />
        <stop offset=".72" stopColor={sphereColor(cast.find((item) => item.id === "C")?.appearance ?? "", "#9A6BE8")} />
        <stop offset="1" stopColor="#563B83" />
      </radialGradient>
      <filter id={`shadow-${id}`} x="-.5" y="-.5" width="2" height="2">
        <feGaussianBlur stdDeviation="13" />
      </filter>
    </defs>
    <rect width="1000" height={portrait ? 1778 : 760} fill={`url(#bg-${id})`} />
    <g transform={portrait ? "translate(-125 430) scale(1.25)" : undefined}>
    <circle cx="480" cy="295" r="305" fill="#FFD3A8" opacity=".08" />
    {Array.from({ length: 14 }, (_, index) => {
      const x = (index * 173 + 57) % 980;
      const y = 55 + (index * 97) % 370;
      return <circle key={`sparkle-${index}`} cx={x} cy={y + Math.sin(frame / 18 + index) * 7} r={4 + index % 4} fill={index % 2 ? "#FFF4D6" : accent} opacity={.18 + (index % 3) * .08} />;
    })}
    {outdoor
      ? <>
          <circle cx="820" cy="135" r="94" fill="#FFD98A" opacity=".85" />
          <circle cx="820" cy="135" r="128" fill="none" stroke="#FFE4A8" strokeWidth="2" opacity=".35" />
          <path d="M0 390q200-140 390 4 175-125 330-8 155-105 280-13v180H0z" fill="#386F80" opacity=".78" />
          <path d="M0 437q220-85 420 6 220-108 580-4v120H0z" fill="#477F74" />
        </>
      : screen
        ? <>
            <rect x="220" y="76" width="560" height="275" rx="28" fill="#1C294A" stroke="#B5C9ED" strokeWidth="5" />
            <rect x="240" y="96" width="520" height="235" rx="15" fill="#E8F3FF" />
            <rect x="262" y="118" width="150" height="18" rx="9" fill={accent} />
            {[0, 1, 2].map((item) => <g key={item} transform={`translate(${335 + item * 165} 230)`}>
              <rect x="-55" y="-52" width="110" height="104" rx="16" fill={item === 1 ? "#D8F3E9" : "#DAE8FA"} />
              <path d={`M-35 28V${item === 0 ? 4 : -12}h18v${item === 0 ? 24 : 40}h20V-30h18v58`} fill="none" stroke={accent} strokeWidth="7" strokeLinejoin="round" />
            </g>)}
            <path d="M455 353h90l30 32H425z" fill="#B5C9ED" />
          </>
        : <>
            <rect x="80" y="90" width="840" height="268" rx="34" fill="#F8E8DC" opacity=".16" stroke="#FFE6D2" strokeWidth="3" />
            <path d="M500 90v268M80 224h840" stroke="#FFE6D2" strokeWidth="3" opacity=".18" />
            <rect x="126" y="124" width="156" height="104" rx="20" fill="#9AE1DF" opacity=".62" />
            <circle cx="844" cy="165" r="54" fill="#FFE5A8" opacity=".8" />
            {shop && <path d="M90 91h820v38H90zM140 91v38m95-38v38m95-38v38m95-38v38m95-38v38m95-38v38m95-38v38m95-38v38" stroke={accent} strokeWidth="7" opacity=".9" />}
            {waiting && <><rect x="735" y="251" width="106" height="18" rx="9" fill="#FFE7D3" opacity=".7" /><path d="M755 267v65m66-65v65" stroke="#FFE7D3" strokeWidth="12" opacity=".6" /></>}
          </>}
    <path d="M0 470q240-55 500 0 260-55 500 0v290H0z" fill={`url(#floor-${id})`} />
    <path d="M0 523q250-40 500 0 260-45 500 0" fill="none" stroke="#FFE1BC" strokeWidth="4" opacity=".24" />
    <ellipse cx="500" cy="640" rx="420" ry="76" fill="#1A2349" opacity=".32" />
    {[0, 1, 2, 3].map((index) => <path key={`floor-line-${index}`} d={`M${110 + index * 205} 515L${20 + index * 255} 760`} stroke="#FFE1BC" strokeWidth="3" opacity=".12" />)}
    {ahaMoment && <g transform="translate(500 505)">
      <circle r="91" fill="#FFF2AE" opacity={.12 + ahaProgress * .12} />
      <circle r="69" fill="none" stroke="#FFF0A3" strokeWidth="5" strokeDasharray="435" strokeDashoffset={435 * (1 - ahaProgress)} transform="rotate(-90)" />
      <path d="M-112-80l-12-22m236 22 12-22M0-112v-25" stroke="#FFF0A3" strokeWidth="6" strokeLinecap="round" opacity={ahaProgress} />
    </g>}
    {(["A", "B", "C"] as const).slice(0, cast.length).map((speaker, index) => {
      const character = cast.find((item) => item.id === speaker);
      if (!character) return null;
      const talking = activeSpeaker === speaker;
      const action = actions[index]?.action ?? character.personality;
      const facing = index === 0 ? 1 : -1;
      const beat = frame / (talking ? 3.1 : 7.5) + index * 1.7;
      const bob = Math.sin(beat) * (talking ? 8 : 4) + (talking ? -5 : 0);
      const squash = 1 + Math.sin(beat * 1.3) * (talking ? .035 : .014);
      const mouthOpen = talking && Math.sin(frame * 1.65 + index * 2) > -.15;
      const blink = Math.floor((frame + index * 19) % 107) < 5;
      const gesture = Math.sin(frame / (talking ? 4.2 : 10) + index) * (talking ? 18 : 6);
      const reaches = /\b(tap|touch|use|point|hold|show|press|reveal)\b/i.test(action) || (ahaMoment && index === 1);
      const center = cast.length === 3 ? [205, 500, 795][index]! : index === 0 ? 292 : 708;
      const size = cast.length === 3 ? 0.73 : 1;
      const orbGradient = `orb-${speaker.toLowerCase()}-${id}`;
      const appearance = character.appearance.toLowerCase();
      const handX = reaches ? facing * (164 + gesture * .3) : facing * 149;
      const handY = reaches ? 24 : 88 + gesture * .25;
      return <g key={speaker} transform={`translate(${center} ${437 + bob}) scale(${size * squash} ${size * (2 - squash)})`}>
        <ellipse cx="0" cy="145" rx="148" ry="26" fill="#171C3D" opacity=".42" filter={`url(#shadow-${id})`} />
        <path
          d={reaches
            ? `M${facing * 88} 66 Q${facing * 153} 98 ${handX} ${handY}`
            : `M${facing * 83} 80 Q${facing * 141} ${125 + gesture * .35} ${handX} ${handY}`}
          fill="none"
          stroke={index === 0 ? "#B7F6EF" : index === 1 ? "#FFE0B4" : "#E1D2FF"}
          strokeWidth="22"
          strokeLinecap="round"
        />
        <circle cx={handX} cy={handY} r="15" fill="#FFF0D7" stroke="#563E70" strokeWidth="4" />
        <circle r="128" fill={`url(#${orbGradient})`} stroke="#FFF4DB" strokeOpacity=".78" strokeWidth="5" />
        <circle cx="-43" cy="-78" r="30" fill="#fff" opacity=".13" />
        <path d="M-84-79q-28 34-21 75" fill="none" stroke="#fff" strokeWidth="9" opacity=".24" strokeLinecap="round" />
        <path d="M-42-9q15-18 30-2m24 0q16-17 31 2" fill="none" stroke="#3B3564" strokeWidth="9" strokeLinecap="round" transform={talking ? "translate(0 -5)" : ""} />
        <ellipse cx="-43" cy="18" rx="23" ry={blink ? 3 : 29} fill="#FFF7E9" stroke="#383052" strokeWidth="5" />
        <ellipse cx="43" cy="18" rx="23" ry={blink ? 3 : 29} fill="#FFF7E9" stroke="#383052" strokeWidth="5" />
        {!blink && <>
          <ellipse cx={-43 + (activeSpeaker && !talking ? facing * 7 : 0)} cy="23" rx="11" ry="16" fill="#3B6082" />
          <ellipse cx={43 + (activeSpeaker && !talking ? facing * 7 : 0)} cy="23" rx="11" ry="16" fill="#3B6082" />
          <circle cx={-47 + (activeSpeaker && !talking ? facing * 7 : 0)} cy="17" r="4" fill="#fff" />
          <circle cx={39 + (activeSpeaker && !talking ? facing * 7 : 0)} cy="17" r="4" fill="#fff" />
        </>}
        <ellipse cx="-77" cy="61" rx="16" ry="9" fill="#F98E9A" opacity=".6" />
        <ellipse cx="77" cy="61" rx="16" ry="9" fill="#F98E9A" opacity=".6" />
        <ellipse cx="0" cy="66" rx={mouthOpen ? 17 : 20} ry={mouthOpen ? 24 : 7} fill="#50284C" stroke="#432545" strokeWidth="4" />
        {mouthOpen && <ellipse cx="0" cy="80" rx="10" ry="5" fill="#F28398" />}
        {appearance.includes("star") && <path d="m77-92 7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2z" fill="#FFF0A3" stroke="#805D9C" strokeWidth="3" />}
        {appearance.includes("freckle") && <g fill="#FFF0A3"><circle cx="75" cy="48" r="5" /><circle cx="88" cy="59" r="4" /><circle cx="70" cy="67" r="4" /></g>}
        {appearance.includes("swoop") && <path d="M37-99q42-42 73-3-31-12-45 18" fill="none" stroke="#744D9A" strokeWidth="10" strokeLinecap="round" />}
        {!appearance.includes("star") && !appearance.includes("freckle") && !appearance.includes("swoop") && <path d="M74-93q22 15 20 39" fill="none" stroke="#FFF0A3" strokeWidth="8" strokeLinecap="round" opacity=".8" />}
        <circle cx="-92" cy="-98" r="7" fill="#FFECA9" opacity={.45 + Math.sin(frame / 5 + index) * .22} />
        <title>{`${character.name}: ${action}`}</title>
      </g>;
    })}
    {props.slice(0, 2).map((name, index) => (
      <g key={`${name}-${index}`} transform={`translate(${500 + (index - .5) * 76} ${525 + Math.sin(frame / 8 + index) * 5}) scale(.65)`}>
        <IllustratedProp name={name} accent={accent} />
      </g>
    ))}
    <path d="M340 654q160-24 320 0" fill="none" stroke="#FFF1CD" strokeWidth="4" opacity=".22" />
    <text x="500" y="710" textAnchor="middle" fill="#FFF4E4" fontSize="19" fontWeight="700" letterSpacing="4" fontFamily="Arial, sans-serif" opacity=".82">
      {setting?.replaceAll("-", " ").toUpperCase() ?? "A CONVERSATION"}
    </text>
    </g>
  </svg>;
}
