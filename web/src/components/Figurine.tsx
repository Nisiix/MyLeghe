// Campioncino: busto disegnato in SVG, unico per ogni giocatore (tratti dal nome, divisa dalla squadra).
// Stile "animato realistico": ombre sulla pelle, capelli con luce, occhi con iride, pieghe della maglia.

import { useId } from "react";
import { lookFor, type Look } from "../lib/figurine";
import { ROLE_COLOR } from "./ui";

const INK = "#1c1a2e";

/** Torso con le spalle, da y=44 in giù, dentro il riquadro 64×64. */
const TORSO = "M5 64V57q0-9 11-12l9-3q7 7 14 0l9 3q11 3 11 12v7Z";

/** Testa: forma della mascella diversa per giocatore. */
function headPath(jaw: Look["jaw"]): string {
  switch (jaw) {
    case "round": return "M32 10c8 0 13.5 6 13.5 15 0 9-5 18-13.5 18S18.5 34 18.5 25c0-9 5.5-15 13.5-15Z";
    case "square": return "M32 10c8 0 13 5.5 13 14v8c0 7-6 11-13 11s-13-4-13-11v-8c0-8.5 5-14 13-14Z";
    case "long": return "M32 9c7.5 0 12.5 6 12.5 15.5 0 10-5 19.5-12.5 19.5S19.5 34.5 19.5 24.5C19.5 15 24.5 9 32 9Z";
    default: return "M32 10c8 0 13 6 13 15 0 10-5.5 18-13 18s-13-8-13-18c0-9 5-15 13-15Z";
  }
}

function Kit({ look, clip, grad }: { look: Look; clip: string; grad: string }) {
  const { primary, secondary, pattern } = look.kit;
  return (
    <g clipPath={`url(#${clip})`}>
      <rect x="0" y="40" width="64" height="24" fill={primary} />
      {pattern === "stripes" && [9, 21, 33, 45].map((x) => <rect key={x} x={x} y="40" width="6.5" height="24" fill={secondary} />)}
      {pattern === "halves" && <rect x="32" y="40" width="32" height="24" fill={secondary} />}
      {pattern === "hoops" && [47, 56].map((y) => <rect key={y} x="0" y={y} width="64" height="4" fill={secondary} />)}
      {pattern === "sash" && <rect x="26" y="30" width="9" height="50" fill={secondary} transform="rotate(32 32 55)" />}
      {/* Luce e ombra sul tessuto, cuciture delle maniche, pieghe */}
      <rect x="0" y="40" width="64" height="24" fill={`url(#${grad})`} />
      <path d="M16 46q-2 8-1 18M48 46q2 8 1 18" fill="none" stroke="rgba(0,0,0,.28)" strokeWidth="1" />
      <path d="M24 52q2 6 1 12M40 52q-2 6-1 12" fill="none" stroke="rgba(0,0,0,.14)" strokeWidth="1" />
      <path d="M17 45l8-3M47 45l-8-3" stroke="rgba(255,255,255,.35)" strokeWidth="1.4" strokeLinecap="round" />
    </g>
  );
}

function Hair({ look }: { look: Look }) {
  const { base, light } = look.hair;
  switch (look.hairStyle) {
    case "bald": return null;
    case "fade": return (
      <g>
        <path d="M19 26q0-16 13-16t13 16q-3-8-13-8t-13 8Z" fill={base} />
        <path d="M22 18q4-5 10-5t10 5q-4-2-10-2t-10 2Z" fill={light} />
        <path d="M19 26v4q-1-2 0-4M45 26v4q1-2 0-4" stroke={base} strokeWidth="1.5" opacity=".6" />
      </g>
    );
    case "short": return (
      <g>
        <path d="M18.5 26q0-16 13.5-16t13.5 16q-4-8-13.5-8t-13.5 8Z" fill={base} />
        <path d="M23 19q4-5 9-5t9 5q-3-2-9-2t-9 2Z" fill={light} />
      </g>
    );
    case "slick": return (
      <g>
        <path d="M18.5 27q-1-18 13.5-17t13.5 17q-3-9-13.5-9T18.5 27Z" fill={base} />
        <path d="M21 17q5-5 11-5t11 5" fill="none" stroke={light} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M24 15q5-3 12-2" fill="none" stroke={light} strokeWidth="1" strokeLinecap="round" />
      </g>
    );
    case "curtains": return (
      <g>
        <path d="M18 29q-1-19 14-19t14 19q-2-9-7-11l-3 6-4-7-4 7-3-6q-5 2-7 11Z" fill={base} />
        <path d="M22 18q4-4 7-4M42 18q-4-4-7-4" fill="none" stroke={light} strokeWidth="1.4" strokeLinecap="round" />
      </g>
    );
    case "spiky": return (
      <g>
        <path d="M18.5 26l1-9 4 4 2-9 4 5 2-8 4 7 3-6 3 6 3-4 1 14q-5-8-13.5-8t-13.5 8Z" fill={base} />
        <path d="M25 17l2-5M33 15l1-4M40 17l2-4" stroke={light} strokeWidth="1.2" strokeLinecap="round" />
      </g>
    );
    case "mohawk": return (
      <g>
        <path d="M19 25q1-7 6-9h14q5 2 6 9-4-5-13-5t-13 5Z" fill={base} opacity=".5" />
        <path d="M27 18l1-11 2 5 2-7 2 7 2-5 1 11q-2-2-5-2t-5 2Z" fill={base} />
        <path d="M30 12l1-3M34 12l-1-3" stroke={light} strokeWidth="1" strokeLinecap="round" />
      </g>
    );
    case "curly": return (
      <g fill={base}>
        <circle cx="21" cy="21" r="4.5" /><circle cx="25.5" cy="15.5" r="4.5" /><circle cx="32" cy="13" r="5" /><circle cx="38.5" cy="15.5" r="4.5" /><circle cx="43" cy="21" r="4.5" />
        <path d="M18.5 26q0-13 13.5-13T45.5 26q-4-5-13.5-5t-13.5 5Z" />
        <g fill={light}><circle cx="27" cy="14" r="1.3" /><circle cx="33" cy="11.5" r="1.3" /><circle cx="39.5" cy="14" r="1.3" /></g>
      </g>
    );
    case "afro": return (
      <g>
        <circle cx="32" cy="21" r="18.5" fill={base} />
        <circle cx="26" cy="13" r="3" fill={light} opacity=".5" />
        <path d="M18.5 26q0-13 13.5-13T45.5 26q-4-5-13.5-5t-13.5 5Z" fill={base} />
      </g>
    );
    case "dreads": return (
      <g fill={base}>
        <path d="M18 27q0-15 14-15t14 15q-4-7-14-7t-14 7Z" />
        {[20, 23, 41, 44].map((x) => <path key={x} d={`M${x} 20q-1.5 8 0 16`} fill="none" stroke={base} strokeWidth="2.6" strokeLinecap="round" />)}
        {[26, 30, 34, 38].map((x) => <path key={x} d={`M${x} 13q-1 2 0 5`} fill="none" stroke={base} strokeWidth="2.6" strokeLinecap="round" />)}
        {[21, 43].map((x) => <path key={x} d={`M${x} 22q-.5 5 0 11`} fill="none" stroke={light} strokeWidth=".8" strokeLinecap="round" />)}
      </g>
    );
    case "long": return (
      <g>
        <path d="M17 46q-3-20 1-28 3-8 14-8t14 8q4 8 1 28l-6-2q2-14-1-22-3 5-8 5t-8-5q-3 8-1 22Z" fill={base} />
        <path d="M22 20q3-6 10-6t10 6" fill="none" stroke={light} strokeWidth="1.4" strokeLinecap="round" />
      </g>
    );
    case "bun": return (
      <g>
        <circle cx="32" cy="9.5" r="4.5" fill={base} /><circle cx="31" cy="8.5" r="1.5" fill={light} opacity=".6" />
        <path d="M18.5 27q-1-18 13.5-17t13.5 17q-3-9-13.5-9T18.5 27Z" fill={base} />
        <path d="M22 18q5-5 10-5t10 5" fill="none" stroke={light} strokeWidth="1.2" strokeLinecap="round" />
      </g>
    );
    case "receding": return (
      <g>
        <path d="M18.5 27q0-13 6-15 3 2 3 6-2-3-9 9ZM45.5 27q0-13-6-15-3 2-3 6 2-3 9 9Z" fill={base} />
        <path d="M27 14q5-2 10 0" fill="none" stroke={base} strokeWidth="2" opacity=".6" />
      </g>
    );
  }
}

function Face({ look }: { look: Look }) {
  const y = 27.5;
  const browW = look.thickBrows ? 2.4 : 1.6;
  const brow = look.brows === "angry" ? "M22.5 20.5l7 2.5M41.5 20.5l-7 2.5"
    : look.brows === "raised" ? "M22.5 21.5q3.5-3.5 7-1.5M41.5 21.5q-3.5-3.5-7-1.5"
    : "M22.5 21.5q3.5-1.5 7-.5M41.5 21.5q-3.5-1.5-7-.5";
  const mouth = look.mouth === "smile" ? <path d="M27 36q5 4 10 0" fill="none" stroke={look.skin.lip} strokeWidth="1.8" strokeLinecap="round" />
    : look.mouth === "grin" ? <g><path d="M26 35q6 6 12 0Z" fill="#ffffff" stroke={look.skin.lip} strokeWidth="1.3" strokeLinejoin="round" /><path d="M28 36h8" stroke="rgba(0,0,0,.2)" strokeWidth=".6" /></g>
    : look.mouth === "open" ? <ellipse cx="32" cy="36.5" rx="3.4" ry="2.4" fill="#7a2230" stroke={look.skin.lip} strokeWidth="1.2" />
    : <path d="M28 36h8" fill="none" stroke={look.skin.lip} strokeWidth="1.8" strokeLinecap="round" />;
  const nose = look.bigNose ? "M32 27l-2.8 6.5q1.4 1.2 2.8 1.2t2.8-1.2Z" : "M32 28l-2 5q1 1 2 1t2-1Z";
  return (
    <g>
      {/* Occhiaie leggere e zigomi */}
      <ellipse cx="26.5" cy={y + 3.8} rx="3.6" ry="1.2" fill={look.skin.shade} opacity=".18" />
      <ellipse cx="37.5" cy={y + 3.8} rx="3.6" ry="1.2" fill={look.skin.shade} opacity=".18" />
      {/* Occhi: bianco, iride, pupilla, luce, palpebra */}
      <path d="M22.8 27.5q3.7-4.6 7.4 0-3.7 4.2-7.4 0Z" fill="#ffffff" /><path d="M33.8 27.5q3.7-4.6 7.4 0-3.7 4.2-7.4 0Z" fill="#ffffff" />
      <circle cx="26.6" cy={y} r="1.8" fill={look.eye} /><circle cx="37.6" cy={y} r="1.8" fill={look.eye} />
      <circle cx="26.6" cy={y} r=".9" fill={INK} /><circle cx="37.6" cy={y} r=".9" fill={INK} />
      <circle cx="26.1" cy={y - .6} r=".45" fill="#ffffff" /><circle cx="37.1" cy={y - .6} r=".45" fill="#ffffff" />
      <path d="M22.8 27.5q3.7-4.6 7.4 0M33.8 27.5q3.7-4.6 7.4 0" fill="none" stroke={INK} strokeWidth=".9" strokeLinecap="round" />
      <path d={brow} fill="none" stroke={look.hair.base} strokeWidth={browW} strokeLinecap="round" />
      <path d={nose} fill={look.skin.shade} opacity=".55" />
      {mouth}
    </g>
  );
}

function BeardShape({ look }: { look: Look }) {
  const c = look.hair.base;
  switch (look.beard) {
    case "stubble": return <path d="M19.5 29q1 11 12.5 12.5T44.5 29q-3 8-12.5 8T19.5 29Z" fill={c} opacity=".22" />;
    case "goatee": return <g fill={c}><path d="M28.5 38q3.5 2.5 7 0l-.8 4q-2.7 1.6-5.4 0Z" /><path d="M27 33.5q5-1.5 10 0" fill="none" stroke={c} strokeWidth="1.3" strokeLinecap="round" opacity=".9" /></g>;
    case "mustache": return <path d="M26.5 33.5q5.5-2.5 11 0-2.5 1.6-5.5 1-3 .6-5.5-1Z" fill={c} />;
    case "full": return (
      <g>
        <path d="M19 29q-.5 13 13 14t13-14q-3 6-6 4-2 7-7 7t-7-7q-3 2-6-4Z" fill={c} />
        <path d="M26.5 33.5q5.5-2 11 0" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M22 34q3 5 10 6" fill="none" stroke={look.hair.light} strokeWidth=".8" opacity=".7" />
      </g>
    );
    default: return null;
  }
}

export interface FigurineProps {
  name?: string;
  role: number;
  team?: string | null;
  size?: number;
  /** Slot libero: sagoma tratteggiata. */
  empty?: boolean;
  /** Riquadro colorato dietro al busto (card). */
  framed?: boolean;
}

/** Campioncino del giocatore. Per uno slot vuoto, sagoma tratteggiata. */
export function Figurine({ name, role, team, size = 44, empty = false, framed = false }: FigurineProps) {
  const id = useId().replace(/:/g, "");
  if (empty || !name) {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="shrink-0">
        <circle cx="32" cy="25" r="13" fill="rgba(255,255,255,.14)" stroke="#ffffff" strokeWidth="1.8" strokeDasharray="3 2.5" />
        <path d={TORSO} fill="rgba(255,255,255,.14)" stroke="#ffffff" strokeWidth="1.8" strokeDasharray="3 2.5" strokeLinejoin="round" />
        <path d="M32 46v10M27 51h10" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }
  const look = lookFor(name, role, team);
  const clip = `fc-${id}`, face = `ff-${id}`, skin = `fs-${id}`, cloth = `fk-${id}`;
  const head = headPath(look.jaw);
  const behind = look.hairStyle === "long" || look.hairStyle === "afro";
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="shrink-0 drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.35)]">
      <defs>
        <clipPath id={clip}><path d={TORSO} /></clipPath>
        <clipPath id={face}><circle cx="32" cy="32" r="31" /></clipPath>
        <radialGradient id={skin} cx=".4" cy=".3" r=".8"><stop offset="0" stopColor={look.skin.base} /><stop offset=".75" stopColor={look.skin.base} /><stop offset="1" stopColor={look.skin.shade} /></radialGradient>
        <linearGradient id={cloth} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".22" /><stop offset=".5" stopColor="#ffffff" stopOpacity="0" /><stop offset="1" stopColor="#000000" stopOpacity=".28" /></linearGradient>
      </defs>
      {framed && <rect x="1" y="1" width="62" height="62" rx="14" fill={ROLE_COLOR[role] ?? "#868e96"} opacity=".9" />}
      <g clipPath={framed ? `url(#${face})` : undefined}>
        {behind && <Hair look={look} />}
        {/* Collo con ombra della mascella */}
        <path d="M26.5 36h11v10h-11Z" fill={look.skin.shade} />
        <path d="M27.5 36h9v7q-4.5 3-9 0Z" fill={look.skin.base} opacity=".55" />
        <Kit look={look} clip={clip} grad={cloth} />
        <path d={TORSO} fill="none" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
        {/* Scollo */}
        <path d="M25 42q7 7 14 0" fill="none" stroke={look.kit.secondary} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M25 42q7 7 14 0" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth=".8" />
        {/* Orecchie e testa */}
        <ellipse cx="18.8" cy="27.5" rx="2.5" ry="3.4" fill={look.skin.shade} stroke={INK} strokeWidth="1" />
        <ellipse cx="45.2" cy="27.5" rx="2.5" ry="3.4" fill={look.skin.shade} stroke={INK} strokeWidth="1" />
        <path d={head} fill={`url(#${skin})`} stroke={INK} strokeWidth="1.2" />
        <BeardShape look={look} />
        <Face look={look} />
        {!behind && <Hair look={look} />}
        {look.headband && <path d="M19.5 20.5q12.5-6 25 0" fill="none" stroke={look.kit.pattern === "solid" ? look.kit.secondary : look.kit.primary} strokeWidth="3" strokeLinecap="round" />}
      </g>
    </svg>
  );
}
