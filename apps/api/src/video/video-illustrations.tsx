import React, { useId } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export type IllustrationKind = "healthcare" | "workflow" | "business" | "general";

export function inferIllustrationKind(text: string): IllustrationKind {
  const content = text.toLowerCase();
  if (/\b(hospital|clinic|patient|doctor|nurse|healthcare|appointment|receptionist|medical)\b/.test(content)) {
    return "healthcare";
  }
  if (/\b(automation|automate|workflow|booking|book|schedule|process|task|integration|dashboard)\b/.test(content)) {
    return "workflow";
  }
  if (/\b(customer|client|business|team|sales|service|product|brand|company|market)\b/.test(content)) {
    return "business";
  }
  return "general";
}

export function IllustratedProp({ name, accent }: { name: string; accent: string }) {
  const ink = "#18324B";
  const common = { fill: "#F5FAFF", stroke: ink, strokeWidth: 7 };
  switch (name) {
    case "medical-cross": return <path d="M-12-36h24v24h24v24H12v24h-24V12h-24v-24h24z" fill={accent} />;
    case "vegetables": return <><circle cx="-10" cy="5" r="20" fill="#72B65B" /><circle cx="15" cy="12" r="17" fill="#F29355" /><path d="M-10-13q5-18 17-17M12-6q1-18 16-20" fill="none" stroke="#347C45" strokeWidth="6" /></>;
    case "scissors": return <><circle cx="-20" cy="22" r="12" {...common} /><circle cx="20" cy="22" r="12" {...common} /><path d="M-12 13l38-39M12 13l-38-39" fill="none" stroke={accent} strokeWidth="8" strokeLinecap="round" /></>;
    case "mirror": return <><rect x="-26" y="-35" width="52" height="65" rx="23" {...common} /><path d="M0 30v20M-15 51h30" fill="none" stroke={ink} strokeWidth="7" strokeLinecap="round" /></>;
    case "calendar": return <><rect x="-34" y="-28" width="68" height="58" rx="8" {...common} /><path d="M-34-8h68M-18-36v16M18-36v16" fill="none" stroke={accent} strokeWidth="7" />{[-16, 0, 16].map((x) => [-1, 13].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill={ink} />))}</>;
    case "phone": case "tablet": return <><rect x="-25" y="-38" width="50" height="76" rx="10" {...common} /><rect x="-17" y="-25" width="34" height="45" rx="3" fill="#D9EBF7" /><circle cy="29" r="3" fill={accent} /></>;
    case "laptop": return <><rect x="-30" y="-32" width="60" height="46" rx="5" {...common} /><path d="M-39 22h78l-8 9h-62z" fill={accent} /></>;
    case "files": case "book": case "clipboard": return <><rect x="-25" y="-32" width="50" height="64" rx="5" fill="#F5FAFF" stroke={accent} strokeWidth="7" /><path d="M-13-14h26M-13 0h26M-13 14h18" stroke={ink} strokeWidth="5" strokeLinecap="round" /></>;
    case "delivery-box": case "shopping-bag": case "basket": return <><path d="M-32-12h64l-7 43h-50z" fill="#E8C486" stroke={ink} strokeWidth="6" /><path d="M-20-12q4-26 20-26t20 26" fill="none" stroke={accent} strokeWidth="7" strokeLinecap="round" /></>;
    case "location-pin": return <><path d="M0 37S-29 5-29-11a29 29 0 1 1 58 0C29 5 0 37 0 37z" fill={accent} /><circle cy="-11" r="9" fill="#fff" /></>;
    case "star-rating": return <path d="m0-35 10 23 25 3-18 16 5 25L0 19l-22 13 5-25-18-16 25-3z" fill="#F6C453" stroke={ink} strokeWidth="5" strokeLinejoin="round" />;
    case "money": return <><rect x="-37" y="-23" width="74" height="46" rx="8" fill="#D7F8E8" stroke={ink} strokeWidth="6" /><circle r="12" fill="none" stroke="#16885D" strokeWidth="5" /><path d="M-28-14v28M28-14v28" stroke="#16885D" strokeWidth="4" /></>;
    case "wrench": case "gear": return <><path d="M-23-23a23 23 0 0 0 29 29l24 24 16-16-24-24a23 23 0 0 0-29-29l14 14-16 16z" fill={accent} stroke={ink} strokeWidth="5" strokeLinejoin="round" /></>;
    case "chart": return <><path d="M-34 31V-30M-34 31h70" fill="none" stroke={ink} strokeWidth="6" /><rect x="-22" y="5" width="12" height="22" fill="#73BCE6" /><rect x="-2" y="-8" width="12" height="35" fill={accent} /><rect x="18" y="-22" width="12" height="49" fill="#72B65B" /></>;
    case "food-plate": case "coffee-cup": return <><circle r="31" fill="#F5FAFF" stroke={ink} strokeWidth="6" /><circle r="19" fill="none" stroke={accent} strokeWidth="5" /><path d="M30-8q20-6 15 13-4 9-15 6" fill="none" stroke={ink} strokeWidth="6" /></>;
    case "checkmark": return <><circle r="34" fill="#D7F8E8" /><path d="m-18 0 13 13 25-29" fill="none" stroke="#16885D" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /></>;
    case "speech-bubble": return <><rect x="-34" y="-25" width="68" height="48" rx="14" fill="#F5FAFF" stroke={ink} strokeWidth="6" /><path d="m-15 23-8 16 26-15" fill="#F5FAFF" stroke={ink} strokeWidth="5" /><circle cx="-15" r="4" cy="-1" fill={accent} /><circle r="4" cy="-1" fill={accent} /><circle cx="15" r="4" cy="-1" fill={accent} /></>;
    case "plant": return <><path d="M0 32V-12M0 1q-29 0-27-25 23-3 27 16M0-6q28 0 27-25Q5-34 0-14" fill="#72B65B" stroke="#347C45" strokeWidth="5" /><path d="M-20 33h40" stroke={ink} strokeWidth="7" /></>;
    case "clock": return <><circle r="31" fill="#F5FAFF" stroke={ink} strokeWidth="6" /><path d="M0-18V0l15 10" fill="none" stroke={accent} strokeWidth="7" strokeLinecap="round" /></>;
    case "school-bell": return <><path d="M-25 15q10-8 10-27 0-17 15-17t15 17q0 19 10 27z" fill="#F6C453" stroke={ink} strokeWidth="6" /><circle cy="25" r="7" fill={accent} /></>;
    case "paint-brush": return <><path d="m-22 20 42-46q13-12 21-4 8 8-4 21l-46 43z" fill={accent} stroke={ink} strokeWidth="5" /><path d="m-22 20-12 20 22-11" fill="#E8C486" stroke={ink} strokeWidth="4" /></>;
    default: return <><circle r="30" fill="#F5FAFF" stroke={accent} strokeWidth="6" /><path d="M-14 0h28M0-14v28" stroke={ink} strokeWidth="6" strokeLinecap="round" /></>;
  }
}

export function IllustratedScene({
  text,
  index,
  accent,
  setting,
  props = [],
  characters = [],
  ahaMoment = false,
}: {
  text: string;
  index: number;
  accent: string;
  setting?: string;
  props?: string[];
  characters?: Array<{ role: string; action: string }>;
  ahaMoment?: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const kind = inferIllustrationKind(text);
  const step = index % 3;
  const bob = Math.sin(frame / Math.max(1, fps / 2) + index) * 5;
  const walk = interpolate(frame, [0, fps * 1.4], [step === 0 ? -10 : 0, step === 0 ? 45 : 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const skin = "#D9A17A";
  const ink = "#18324B";

  return (
    <svg
      aria-label={`Animated ${kind} illustration`}
      role="img"
      viewBox="0 0 1000 420"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", width: "100%", height: "100%", overflow: "visible" }}
    >
      <ellipse cx="500" cy="382" rx="415" ry="25" fill="#061321" opacity=".34" />
      {setting && (
        <g opacity=".95">
          {setting === "shop-front" && <><rect x="122" y="70" width="756" height="275" rx="24" fill="#EAF5FC" /><path d="M122 155h756M180 155v190M820 155v190" stroke="#A8BFCE" strokeWidth="10" /><path d="M100 150 140 70h720l40 80z" fill={accent} /></>}
          {setting === "counter" && <><rect x="120" y="263" width="760" height="88" rx="14" fill="#D4B17B" /><path d="M150 350v26M850 350v26" stroke={ink} strokeWidth="14" /></>}
          {setting === "desk" && <><rect x="128" y="278" width="744" height="34" rx="10" fill="#D4B17B" /><path d="M180 310v67M820 310v67" stroke={ink} strokeWidth="16" /></>}
          {setting === "waiting-area" && <><rect x="155" y="248" width="690" height="58" rx="20" fill="#C5DDEC" /><path d="M190 305v66M810 305v66M215 228v28M785 228v28" stroke={ink} strokeWidth="16" /></>}
          {setting === "outdoors" && <><circle cx="155" cy="110" r="50" fill="#F6C453" /><path d="M90 350h820" stroke="#72B65B" strokeWidth="32" /><path d="M860 250V95M860 155q-55-15-51-65 48-5 51 39M860 185q48-12 48-54-42-5-48 30" fill="#72B65B" /></>}
          {(setting === "phone-demo" || setting === "laptop-demo" || setting === "dashboard") && <><rect x="112" y="70" width="776" height="292" rx="24" fill="#F5FAFF" /><rect x="140" y="98" width="720" height="56" rx="14" fill={ink} /><circle cx="175" cy="126" r="9" fill={accent} /><path d="M180 210h140M180 242h215M180 274h98" stroke="#9CB6C7" strokeWidth="11" strokeLinecap="round" /><path d="M485 304V246l56-45 54 28 72-92" fill="none" stroke={accent} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" /></>}
        </g>
      )}
      {kind === "healthcare" ? (
        <>
          <rect x="95" y="106" width="290" height="254" rx="24" fill="#F4FAFF" opacity=".95" />
          <rect x="124" y="142" width="232" height="218" rx="12" fill="#D9EBF7" />
          <path d="M216 226h48v-48h34v48h48v34h-48v48h-34v-48h-48z" fill={accent} />
          <rect x="755" y="165" width="150" height="197" rx="18" fill="#E8F4FB" />
          <rect x="776" y="186" width="108" height="96" rx="10" fill={ink} />
          <rect x="792" y="204" width="76" height="10" rx="5" fill="#8DDCFF" />
          <rect x="792" y="225" width="57" height="8" rx="4" fill="#AFC9DC" />
          <rect x="792" y="244" width="70" height="8" rx="4" fill="#AFC9DC" />
          <circle cx="830" cy="320" r="13" fill={accent} />
          {step === 2 && (
            <g transform="translate(0 4)">
              <circle cx="684" cy="185" r="29" fill={skin} />
              <path d="M650 219q34-30 68 0l17 110h-103z" fill="#F7FBFF" />
              <path d="M649 239l-39 49M710 239l37 45" stroke="#F7FBFF" strokeWidth="18" strokeLinecap="round" />
              <path d="M664 327l-12 42M697 327l14 42" stroke={ink} strokeWidth="19" strokeLinecap="round" />
              <path d="M649 229h67" stroke={accent} strokeWidth="11" />
            </g>
          )}
          <g transform={`translate(${step === 1 ? 590 : 430 + walk} ${bob})`}>
            <circle cx="0" cy="157" r="27" fill={skin} />
            <path d="M-25 145q6-38 47-23l5 23z" fill={ink} />
            <path d="M-37 195q37-28 74 0l12 103h-100z" fill={accent} />
            <path d="M-26 213l-37 48M27 212l27 46" stroke={skin} strokeWidth="17" strokeLinecap="round" />
            <path d="M-17 294l-15 58M19 294l15 58" stroke={ink} strokeWidth="19" strokeLinecap="round" />
            {step === 1 && <rect x="38" y="213" width="35" height="57" rx="7" fill={ink} stroke="#fff" strokeWidth="3" />}
          </g>
          {step > 0 && (
            <g transform="translate(846 105)">
              <circle r="35" fill="#D7F8E8" />
              <path d="M-14 1l10 10 20-23" fill="none" stroke="#16885D" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )}
        </>
      ) : kind === "workflow" ? (
        <>
          <rect x="146" y="105" width="708" height="250" rx="26" fill="#F5FAFF" opacity=".95" />
          <rect x="177" y="137" width="646" height="51" rx="14" fill={ink} />
          <circle cx="205" cy="162" r="8" fill="#8DDCFF" />
          <rect x="226" y="156" width="155" height="11" rx="5" fill="#EAF6FF" opacity=".82" />
          {[0, 1, 2].map((item) => (
            <g key={item} transform={`translate(${222 + item * 222} 232)`}>
              <circle r="31" fill={item < step + 1 ? accent : "#DCE9F2"} />
              <path d="M-12 0l9 9 17-19" fill="none" stroke={item < step + 1 ? "#fff" : "#7F9CAF"} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              {item < 2 && <path d="M45 0h110" stroke="#A8C0D2" strokeWidth="5" strokeDasharray="9 10" />}
              <rect x="-55" y="57" width="110" height="10" rx="5" fill="#A7BBC9" />
            </g>
          ))}
          <g transform={`translate(${250 + walk} ${18 + bob})`}>
            <circle cx="0" cy="94" r="23" fill={skin} />
            <path d="M-24 132q24-18 48 0l9 91h-67z" fill={accent} />
            <path d="M-12 218l-11 45M12 218l12 45" stroke={ink} strokeWidth="15" strokeLinecap="round" />
          </g>
          <circle cx={785 - step * 30} cy="112" r="20" fill="#D7F8E8" />
          <path d={`M${775 - step * 30} 112l8 8 15-17`} fill="none" stroke="#16885D" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : kind === "business" ? (
        <>
          <rect x="107" y="105" width="786" height="256" rx="27" fill="#F4F9FF" opacity=".95" />
          <rect x="137" y="137" width="313" height="194" rx="17" fill="#DFEDF7" />
          <path d="M174 293h225" stroke="#A8BFCE" strokeWidth="4" />
          {[0, 1, 2, 3].map((item) => (
            <rect key={item} x={187 + item * 49} y={260 - item * 26} width="28" height={33 + item * 26} rx="8" fill={item === 3 ? accent : "#76BFE7"} />
          ))}
          <path d="M168 254l76-39 58 16 101-64" fill="none" stroke={ink} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <g transform={`translate(628 ${35 + bob})`}>
            <circle cx="0" cy="100" r="29" fill={skin} />
            <path d="M-31 94q6-49 61-28l2 31z" fill={ink} />
            <path d="M-46 142q46-34 91 0l20 113h-133z" fill={accent} />
            <path d="M-28 251l-13 67M27 251l15 67" stroke={ink} strokeWidth="20" strokeLinecap="round" />
            <path d="M-33 158l-47 50M38 158l49-33" stroke={skin} strokeWidth="18" strokeLinecap="round" />
          </g>
          <rect x="743" y="132" width="103" height="51" rx="15" fill="#D7F8E8" />
          <path d="M768 158l10 10 23-25" fill="none" stroke="#16885D" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="500" cy="222" r="146" fill="#F0F8FE" opacity=".94" />
          <circle cx="500" cy="222" r="107" fill="#D8EBF7" />
          <g transform={`translate(${500 + Math.sin(frame / 22) * 18} ${12 + bob})`}>
            <circle cy="142" r="30" fill={skin} />
            <path d="M-32 135q6-48 61-28l2 31z" fill={ink} />
            <rect x="-45" y="180" width="90" height="121" rx="35" fill={accent} />
            <path d="M-23 298l-16 58M23 298l16 58" stroke={ink} strokeWidth="20" strokeLinecap="round" />
          </g>
          <circle cx="714" cy="134" r="35" fill="#D7F8E8" />
          <path d="M697 134l12 12 23-27" fill="none" stroke="#16885D" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {characters[0] && (
        <g transform={`translate(${640 + walk} ${28 + bob})`} aria-label={`${characters[0].role}: ${characters[0].action}`}>
          <circle cy="100" r="25" fill={skin} />
          <path d="M-27 95q5-39 54-22l2 27z" fill={ink} />
          <path d="M-42 137q42-31 84 0l17 105h-118z" fill={accent} />
          <path d="M-22 238l-11 50M22 238l12 50" stroke={ink} strokeWidth="17" strokeLinecap="round" />
          {/\b(tap|touch|use|point|hold|show)\b/i.test(characters[0].action)
            ? <path d="M34 157l82-48" stroke={skin} strokeWidth="15" strokeLinecap="round" />
            : <path d="M-36 157l-36 50M36 157l36 50" stroke={skin} strokeWidth="14" strokeLinecap="round" />}
          <ellipse cx="-9" cy="101" rx="3.5" ry={Math.floor(frame / 8) % 2 ? 3 : 1} fill="#18324B" />
          <ellipse cx="9" cy="101" rx="3.5" ry={Math.floor(frame / 8) % 2 ? 3 : 1} fill="#18324B" />
          <ellipse cx="0" cy="119" rx="5" ry={Math.floor(frame / 4) % 3 === 0 ? 6 : 2} fill="#7E3540" />
        </g>
      )}
      {props.slice(0, 4).map((name, propIndex) => (
        <g key={`${name}-${propIndex}`} transform={`translate(${338 + propIndex * 108} 355)`}>
          <IllustratedProp name={name} accent={accent} />
        </g>
      ))}
      {ahaMoment && (
        <g>
          <g opacity={interpolate(frame, [fps * 0.6, fps * 1.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}>
            <rect x="596" y="146" width="126" height="82" rx="16" fill="#F5FAFF" stroke={accent} strokeWidth="6" />
            <path d="m625 186 17 17 40-44" fill="none" stroke="#16885D" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <circle
            cx="500"
            cy="205"
            r="108"
            fill="none"
            stroke={accent}
            strokeWidth="11"
            strokeDasharray={Math.PI * 216}
            strokeDashoffset={interpolate(frame, [0, fps * 1.5], [Math.PI * 216, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
            strokeLinecap="round"
          />
          <circle cx="500" cy="205" r="12" fill="#fff" opacity={interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
        </g>
      )}
    </svg>
  );
}

export function ConversationIllustration({
  cast,
  activeSpeaker,
  actions,
  setting,
  props = [],
  accent,
}: {
  cast: Array<{ id: "A" | "B"; name: string; appearance: string; personality: string }>;
  activeSpeaker: "A" | "B" | null;
  actions: Array<{ role: string; action: string }>;
  setting?: string;
  props?: string[];
  accent: string;
}) {
  const frame = useCurrentFrame();
  const wallId = useId().replace(/:/g, "");
  const speaking = (id: "A" | "B") => activeSpeaker === id;
  const isOutdoors = setting === "outdoors";
  const isShop = setting === "shop-front" || setting === "counter";
  const isScreenDemo = setting === "dashboard" || setting === "phone-demo" || setting === "laptop-demo";
  const hairColors = ["#2B2024", "#844832"];
  const skinColors = ["#B97552", "#EDC19F"];
  const outfitColors = [accent, "#E4A64A"];

  return <svg
    aria-label="Two animated characters having a conversation"
    role="img"
    viewBox="0 0 1000 720"
    preserveAspectRatio="xMidYMid meet"
    style={{ display: "block", width: "100%", height: "100%" }}
  >
    <defs>
      <linearGradient id={`conversation-wall-${wallId}`} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor={isOutdoors ? "#9CDDF2" : isShop ? "#F7D6A0" : "#F4E6D0"} />
        <stop offset="1" stopColor={isOutdoors ? "#D5F2D1" : isShop ? "#F0A879" : "#B6D1DA"} />
      </linearGradient>
    </defs>
    <rect x="30" y="24" width="940" height="650" rx="40" fill={`url(#conversation-wall-${wallId})`} />
    {isOutdoors
      ? <>
          <circle cx="825" cy="150" r="57" fill="#FFD47A" />
          <path d="M48 348q180-132 340 0 170-116 335 0 119-86 229 0v86H48z" fill="#79B880" />
          <path d="M48 408q180-85 360 0 180-98 355 0 110-60 189 0v38H48z" fill="#4F976F" />
        </>
      : isScreenDemo
        ? <>
            <rect x="100" y="72" width="800" height="330" rx="28" fill="#18324B" />
            <rect x="124" y="98" width="752" height="278" rx="14" fill="#F4FAFF" />
            <rect x="154" y="130" width="210" height="26" rx="8" fill={accent} />
            {[0, 1, 2].map((item) => <g key={item} transform={`translate(${190 + item * 255} 250)`}>
              <rect x="-72" y="-56" width="144" height="112" rx="16" fill={item === 1 ? "#E5F6ED" : "#E8F0F7"} />
              <path d={`M-42 28V${item === 0 ? 2 : -10}h22v${item === 0 ? 26 : 38}h22V-30h22v58`} fill="none" stroke={accent} strokeWidth="9" strokeLinejoin="round" />
            </g>)}
          </>
        : <>
            <rect x="80" y="74" width="840" height="330" rx="28" fill="#F7F1E6" />
            <path d="M500 74v330M80 240h840" stroke="#D3C5AE" strokeWidth="18" />
            <rect x="122" y="105" width="142" height="95" rx="20" fill="#A3D2DB" opacity=".8" />
            <circle cx="840" cy="155" r="44" fill="#F2C979" opacity=".9" />
            {isShop && <path d="M90 73h820v42H90zM130 73v42m95-42v42m95-42v42m95-42v42m95-42v42m95-42v42m95-42v42m95-42v42" fill={accent} stroke="#fff" strokeWidth="8" />}
          </>}
    <path d="M0 575q260-60 500 0 240-60 500 0v145H0z" fill="#D6B38C" />
    <rect x="70" y="585" width="860" height="25" rx="12" fill="#9A684E" />
    <rect x="150" y="610" width="25" height="68" rx="10" fill="#77533F" />
    <rect x="825" y="610" width="25" height="68" rx="10" fill="#77533F" />
    {(["A", "B"] as const).map((id, index) => {
      const character = cast.find((item) => item.id === id);
      if (!character) return null;
      const talking = speaking(id);
      const action = actions[index]?.action ?? character.personality;
      const nod = Math.sin(frame / (talking ? 3.2 : 8) + index) * (talking ? 4 : 2);
      const mouthOpen = talking && Math.sin(frame * 1.7 + index * 2) > 0.1;
      const gesture = talking ? Math.sin(frame / 5 + index) * 15 : Math.sin(frame / 12 + index) * 4;
      const center = index === 0 ? 305 : 695;
      const hair = /blond|blonde|gold/i.test(character.appearance) ? "#D5A64E" : hairColors[index]!;
      const skin = /dark|brown|deep/i.test(character.appearance) ? skinColors[0]! : skinColors[index]!;
      const clothes = /teal|blue|green/i.test(character.appearance) ? accent : outfitColors[index]!;
      return <g key={id} transform={`translate(${center} ${nod})`}>
        <ellipse cx="0" cy="570" rx="140" ry="24" fill="#213744" opacity=".16" />
        <path d="M-120 565q8-178 120-190 112 12 120 190z" fill={clothes} stroke="#243842" strokeWidth="9" />
        <path d={`M-104 411q${gesture} 25 82 66`} fill="none" stroke={skin} strokeWidth="33" strokeLinecap="round" />
        <path d={`M104 411q${-gesture} 25 -82 66`} fill="none" stroke={skin} strokeWidth="33" strokeLinecap="round" />
        <path d="M-25 388v55l25 24 25-24v-55" fill={skin} />
        <ellipse cx="0" cy="283" rx="105" ry="125" fill={skin} stroke="#43342F" strokeWidth="8" />
        <path d={`M-104 278q-24-145 103-145 116 0 107 141-34-19-46-76-63 63-164 44z`} fill={hair} stroke="#332A2A" strokeWidth="9" strokeLinejoin="round" />
        <path d="M-73 268q15-15 33 0M40 268q15-15 33 0" fill="none" stroke="#42342F" strokeWidth="9" strokeLinecap="round" />
        <ellipse cx="-55" cy="296" rx="8" ry={Math.floor(frame / 63) % 8 === 0 ? 2 : 10} fill="#25353C" />
        <ellipse cx="55" cy="296" rx="8" ry={Math.floor(frame / 63) % 8 === 0 ? 2 : 10} fill="#25353C" />
        <path d="M-8 314q8 8 16 0" fill="none" stroke="#8E5747" strokeWidth="6" strokeLinecap="round" />
        <ellipse cx="0" cy="350" rx={mouthOpen ? 15 : 23} ry={mouthOpen ? 22 : 6} fill="#642E37" />
        {talking && <ellipse cx="0" cy="350" rx="9" ry="6" fill="#E99083" />}
        <path d="M-44 398l44 46 44-46" fill="none" stroke="#F3E9D8" strokeWidth="16" strokeLinejoin="round" />
        <title>{`${character.name}: ${action}`}</title>
      </g>;
    })}
    {props.slice(0, 3).map((name, index) => (
      <g key={`${name}-${index}`} transform={`translate(${420 + index * 80} 548) scale(.7)`}>
        <IllustratedProp name={name} accent={accent} />
      </g>
    ))}
    <rect x="382" y="103" width="236" height="12" rx="6" fill={accent} opacity=".82" />
    <text x="500" y={isScreenDemo ? 58 : 148} textAnchor="middle" fill={isScreenDemo ? "#fff" : "#263A44"} fontSize="22" fontWeight="700" fontFamily="Arial, sans-serif">
      {setting?.replaceAll("-", " ").toUpperCase() ?? "A CONVERSATION"}
    </text>
    <circle cx="305" cy="180" r="7" fill="#fff" opacity={activeSpeaker === "A" ? interpolate(frame % 20, [0, 10, 20], [0.2, 1, 0.2]) : 0.3} />
    <circle cx="695" cy="180" r="7" fill="#fff" opacity={activeSpeaker === "B" ? interpolate(frame % 20, [0, 10, 20], [0.2, 1, 0.2]) : 0.3} />
  </svg>;
}
