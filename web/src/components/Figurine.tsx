// Campioncino: busto in stile cartoon disegnato in SVG, unico per ogni giocatore (tratti dal nome, divisa dalla squadra).

import { useId } from "react";
import { lookFor, type Look } from "../lib/figurine";
import { ROLE_COLOR } from "./ui";

const INK = "#1f1e3a";

/** Torso con le spalle, da y=44 in giù, dentro il riquadro 64×64. */
const TORSO = "M6 64V56q0-8 10-11l10-3q6 6 12 0l10 3q10 3 10 11v8Z";

function KitPattern({ look, clip }: { look: Look; clip: string }) {
  const { primary, secondary, pattern } = look.kit;
  return (
    <g clipPath={`url(#${clip})`}>
      <rect x="0" y="40" width="64" height="24" fill={primary} />
      {pattern === "stripes" && [10, 22, 34, 46].map((x) => <rect key={x} x={x} y="40" width="6" height="24" fill={secondary} />)}
      {pattern === "halves" && <rect x="32" y="40" width="32" height="24" fill={secondary} />}
      {pattern === "hoops" && [46, 56].map((y) => <rect key={y} x="0" y={y} width="64" height="4" fill={secondary} />)}
      {pattern === "sash" && <rect x="26" y="30" width="9" height="50" fill={secondary} transform="rotate(32 32 55)" />}
      {/* Fascia bianca sulle spalle: dà il senso di maglia anche sulle tinte scure. */}
      <path d="M16 45l10-3M48 45l-10-3" stroke="rgba(255,255,255,.55)" strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

function Hair({ look }: { look: Look }) {
  const c = look.hair;
  switch (look.hairStyle) {
    case "bald": return null;
    case "buzz": return <path d="M19 22q2-12 13-12t13 12q-5-4-13-4t-13 4Z" fill={c} opacity=".8" />;
    case "short": return <path d="M18 24q1-14 14-14t14 14q-4-6-14-6t-14 6Z" fill={c} />;
    case "fringe": return <path d="M18 25q1-15 14-15t14 15q-3-6-8-6l-3 4-4-5-4 5-3-4q-4 0-6 6Z" fill={c} />;
    case "spiky": return <path d="M18 24l2-9 4 5 3-9 4 6 3-7 4 7 4-5 2 12q-6-6-13-6t-13 6Z" fill={c} />;
    case "mohawk": return <path d="M27 20l2-11 3 5 3-6 2 12q-2-2-5-2t-5 2Z" fill={c} />;
    case "curly": return (
      <g fill={c}>
        <circle cx="21" cy="20" r="4.5" /><circle cx="26" cy="15" r="4.5" /><circle cx="32" cy="13" r="5" /><circle cx="38" cy="15" r="4.5" /><circle cx="43" cy="20" r="4.5" />
        <path d="M18 24q1-13 14-13t14 13q-4-5-14-5t-14 5Z" />
      </g>
    );
    case "afro": return <g fill={c}><circle cx="32" cy="20" r="18" /><path d="M18 24q1-12 14-12t14 12q-4-5-14-5t-14 5Z" /></g>;
    case "long": return <path d="M17 44q-2-18 1-26 2-8 14-8t14 8q3 8 1 26l-6-2q2-14-1-20-3 4-8 4t-8-4q-3 6-1 20Z" fill={c} />;
    case "bun": return <g fill={c}><circle cx="32" cy="9" r="4.5" /><path d="M18 24q1-14 14-14t14 14q-4-6-14-6t-14 6Z" /></g>;
  }
}

function Face({ look }: { look: Look }) {
  const eyeY = 27;
  const brow = look.brows === "angry" ? "M23 21l6 2M41 21l-6 2" : look.brows === "raised" ? "M23 22q3-3 6-1M41 22q-3-3-6-1" : "M23 22h6M35 22h6";
  const mouth = look.mouth === "smile" ? <path d="M27 35q5 4 10 0" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
    : look.mouth === "grin" ? <><path d="M26 34q6 6 12 0Z" fill="#ffffff" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" /></>
    : look.mouth === "open" ? <ellipse cx="32" cy="35.5" rx="3.5" ry="2.6" fill="#8f1b25" stroke={INK} strokeWidth="1.3" />
    : <path d="M28 35h8" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />;
  return (
    <g>
      <ellipse cx="26.5" cy={eyeY} rx="2.6" ry="3" fill="#ffffff" /><ellipse cx="37.5" cy={eyeY} rx="2.6" ry="3" fill="#ffffff" />
      <circle cx="27" cy={eyeY + 0.5} r="1.5" fill={INK} /><circle cx="38" cy={eyeY + 0.5} r="1.5" fill={INK} />
      <path d={brow} fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M32 29l-1.5 3.5h3Z" fill="rgba(0,0,0,.18)" />
      {mouth}
    </g>
  );
}

function BeardShape({ look }: { look: Look }) {
  const c = look.hair;
  switch (look.beard) {
    case "stubble": return <path d="M19 30q1 10 13 11t13-11q-3 7-13 7t-13-7Z" fill={c} opacity=".28" />;
    case "goatee": return <path d="M28 37q4 3 8 0l-1 4q-3 2-6 0Z" fill={c} />;
    case "full": return <path d="M18 29q0 12 14 13t14-13q-3 5-6 3-2 6-8 6t-8-6q-3 2-6-3Z" fill={c} />;
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

/** Campioncino del giocatore. Per uno slot vuoto, sagoma tratteggiata nel colore del ruolo. */
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
  const clip = `fig-${id}`;
  const face = `face-${id}`;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="shrink-0 drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.3)]">
      <defs>
        <clipPath id={clip}><path d={TORSO} /></clipPath>
        <clipPath id={face}><circle cx="32" cy="32" r="31" /></clipPath>
      </defs>
      {framed && <rect x="1" y="1" width="62" height="62" rx="14" fill={ROLE_COLOR[role] ?? "#868e96"} opacity=".9" />}
      <g clipPath={framed ? `url(#${face})` : undefined}>
        {/* Capelli lunghi e afro stanno dietro al collo */}
        {(look.hairStyle === "long" || look.hairStyle === "afro") && <Hair look={look} />}
        <rect x="27" y="36" width="10" height="9" fill={look.skin} />
        <KitPattern look={look} clip={clip} />
        <path d={TORSO} fill="none" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
        {/* Scollo */}
        <path d="M26 42q6 6 12 0" fill="none" stroke={look.kit.secondary} strokeWidth="2.2" strokeLinecap="round" />
        {/* Orecchie e testa */}
        <ellipse cx="18.5" cy="27" rx="2.6" ry="3.4" fill={look.skin} stroke={INK} strokeWidth="1.2" />
        <ellipse cx="45.5" cy="27" rx="2.6" ry="3.4" fill={look.skin} stroke={INK} strokeWidth="1.2" />
        <ellipse cx="32" cy="26" rx={look.wide ? 14 : 12.5} ry="15" fill={look.skin} stroke={INK} strokeWidth="1.4" />
        <BeardShape look={look} />
        <Face look={look} />
        {look.hairStyle !== "long" && look.hairStyle !== "afro" && <Hair look={look} />}
        {look.headband && <path d="M19 20q13-6 26 0" fill="none" stroke={look.kit.pattern === "solid" ? look.kit.secondary : look.kit.primary} strokeWidth="3" strokeLinecap="round" />}
      </g>
    </svg>
  );
}
