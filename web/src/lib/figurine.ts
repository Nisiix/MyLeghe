// Campioncini: tratti e divisa di ogni giocatore, calcolati dal nome (sempre gli stessi per lo stesso giocatore).
// Sono figure inventate: nessuna somiglianza con la persona reale, nessuna foto, nessuno stemma di club.

import { prettyTeam } from "./team";

export type Pattern = "solid" | "stripes" | "halves" | "hoops" | "sash";

export interface Kit { primary: string; secondary: string; pattern: Pattern }

/** Colori delle divise per squadra (tinte generiche, senza stemmi né sponsor). */
const KITS: Record<string, Kit> = {
  Inter: { primary: "#1f4fb8", secondary: "#15172b", pattern: "stripes" },
  Milan: { primary: "#d8202a", secondary: "#15172b", pattern: "stripes" },
  Juventus: { primary: "#f4f4f4", secondary: "#15172b", pattern: "stripes" },
  Napoli: { primary: "#1f8fe5", secondary: "#ffffff", pattern: "solid" },
  Roma: { primary: "#8f1c2f", secondary: "#f3b71f", pattern: "solid" },
  Lazio: { primary: "#8ec8ef", secondary: "#ffffff", pattern: "solid" },
  Atalanta: { primary: "#1f5fc2", secondary: "#15172b", pattern: "stripes" },
  Fiorentina: { primary: "#5a2d8f", secondary: "#f4f4f4", pattern: "solid" },
  Bologna: { primary: "#b5202d", secondary: "#1b3d73", pattern: "stripes" },
  Torino: { primary: "#8b1d2c", secondary: "#f4f4f4", pattern: "solid" },
  Udinese: { primary: "#f4f4f4", secondary: "#2a2a2a", pattern: "stripes" },
  Genoa: { primary: "#b5202d", secondary: "#1b3d73", pattern: "halves" },
  Cagliari: { primary: "#1b2f6b", secondary: "#c0252f", pattern: "halves" },
  Verona: { primary: "#1b3d8f", secondary: "#f5d33d", pattern: "solid" },
  Lecce: { primary: "#f2c230", secondary: "#c8102e", pattern: "stripes" },
  Parma: { primary: "#f4f4f4", secondary: "#f5d33d", pattern: "sash" },
  Como: { primary: "#1d4ea3", secondary: "#f4f4f4", pattern: "solid" },
  Sassuolo: { primary: "#1f8a4c", secondary: "#15172b", pattern: "stripes" },
  Cremonese: { primary: "#9a9a9a", secondary: "#c8102e", pattern: "stripes" },
  Pisa: { primary: "#1e4fa0", secondary: "#15172b", pattern: "stripes" },
  Empoli: { primary: "#1e5fbf", secondary: "#f4f4f4", pattern: "solid" },
  Monza: { primary: "#c8102e", secondary: "#f4f4f4", pattern: "solid" },
  Venezia: { primary: "#15172b", secondary: "#f28c28", pattern: "sash" },
  Salernitana: { primary: "#8b1d2c", secondary: "#f4f4f4", pattern: "solid" },
  Frosinone: { primary: "#f5d33d", secondary: "#1b3d8f", pattern: "stripes" },
  Sampdoria: { primary: "#1f4fb8", secondary: "#f4f4f4", pattern: "hoops" },
  Spezia: { primary: "#f4f4f4", secondary: "#15172b", pattern: "solid" },
  Brescia: { primary: "#1f4fb8", secondary: "#f4f4f4", pattern: "sash" },
  Palermo: { primary: "#f4a7c1", secondary: "#15172b", pattern: "solid" },
  Bari: { primary: "#f4f4f4", secondary: "#c8102e", pattern: "solid" },
  Catanzaro: { primary: "#f5d33d", secondary: "#c8102e", pattern: "hoops" },
  Cesena: { primary: "#f4f4f4", secondary: "#15172b", pattern: "solid" },
  Modena: { primary: "#f5d33d", secondary: "#1b3d8f", pattern: "solid" },
  Reggiana: { primary: "#8b1d2c", secondary: "#f4f4f4", pattern: "solid" },
  Carrarese: { primary: "#1f8fe5", secondary: "#f5d33d", pattern: "solid" },
};

/** Divise da portiere: colori accesi, uguali per tutte le squadre. */
const GK_KITS: Kit[] = [
  { primary: "#2fd36b", secondary: "#15172b", pattern: "solid" },
  { primary: "#ffd400", secondary: "#15172b", pattern: "solid" },
  { primary: "#ff7a00", secondary: "#15172b", pattern: "solid" },
  { primary: "#ff4fa3", secondary: "#15172b", pattern: "solid" },
  { primary: "#19c6e6", secondary: "#15172b", pattern: "solid" },
];

/** Divisa di riserva quando la squadra non è nota: colore del ruolo. */
const ROLE_KITS: Record<number, Kit> = {
  1: GK_KITS[0],
  2: { primary: "#27a148", secondary: "#ffffff", pattern: "solid" },
  3: { primary: "#1c7ed6", secondary: "#ffffff", pattern: "solid" },
  4: { primary: "#e0322e", secondary: "#ffffff", pattern: "solid" },
};

export const SKIN = ["#f6d3b5", "#eebf9b", "#d9a070", "#b97a4b", "#8a5431", "#5c3620"];
export const HAIR = ["#1b1b1b", "#3b2518", "#6b4423", "#a56a2d", "#d9a441", "#c7532a", "#8c6a4a"];
export type HairStyle = "short" | "buzz" | "curly" | "long" | "spiky" | "mohawk" | "bald" | "bun" | "afro" | "fringe";
export type Beard = "none" | "stubble" | "goatee" | "full";
export type Mouth = "smile" | "grin" | "neutral" | "open";
export type Brows = "flat" | "angry" | "raised";

export interface Look {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  beard: Beard;
  mouth: Mouth;
  brows: Brows;
  headband: boolean;
  wide: boolean;
  kit: Kit;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Numero pseudo-casuale 0..1 diverso per ogni `salt`, stabile per lo stesso nome. */
function rnd(seed: number, salt: number): number {
  let x = (seed ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: readonly T[], seed: number, salt: number): T => arr[Math.floor(rnd(seed, salt) * arr.length)];

export function kitFor(role: number, team?: string | null): Kit {
  if (role === 1) return GK_KITS[hash(team ?? "") % GK_KITS.length];
  const t = prettyTeam(team);
  return (t && KITS[t]) || ROLE_KITS[role] || ROLE_KITS[3];
}

export function lookFor(name: string, role: number, team?: string | null): Look {
  const seed = hash(name.trim().toLowerCase());
  const styles: HairStyle[] = ["short", "short", "short", "buzz", "curly", "long", "spiky", "mohawk", "bald", "bun", "afro", "fringe"];
  const beards: Beard[] = ["none", "none", "none", "stubble", "stubble", "goatee", "full"];
  const mouths: Mouth[] = ["smile", "smile", "grin", "neutral", "open"];
  const brows: Brows[] = ["flat", "flat", "angry", "raised"];
  return {
    skin: pick(SKIN, seed, 1),
    hair: pick(HAIR, seed, 2),
    hairStyle: pick(styles, seed, 3),
    beard: pick(beards, seed, 4),
    mouth: pick(mouths, seed, 5),
    brows: pick(brows, seed, 6),
    headband: rnd(seed, 7) < 0.1,
    wide: rnd(seed, 8) < 0.35,
    kit: role === 1 ? GK_KITS[Math.floor(rnd(seed, 9) * GK_KITS.length)] : kitFor(role, team),
  };
}
