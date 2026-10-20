// Stima della titolarità e formazione consigliata (stime FootballLite su dati con licenza).

import { moduleShape, ROLES, type LeagueConfig, type Role } from "./config";

/** Stato di un giocatore per la prossima giornata, dalla fonte dati. */
export interface PlayerOutlook {
  /** Ultime partite della sua squadra: true se è partito titolare (dalla più recente). */
  recentStarts: boolean[];
  /** Indisponibile (infortunio o squalifica) per la prossima partita. */
  unavailable?: "injury" | "suspension" | "other" | null;
  /** In dubbio per la prossima partita. */
  doubtful?: boolean;
  /** Undici probabile o ufficiale della fonte: "starter", "bench" o null se non pubblicato. */
  predicted?: "starter" | "bench" | null;
  /** true se la formazione della fonte è quella ufficiale (non una previsione). */
  confirmed?: boolean;
  /** Fantamedia stimata (voto base + bonus medi) o null se non ha giocato. */
  avgFantavote?: number | null;
  /** Correttivo avversario (1 = neutro). */
  opponentFactor?: number;
}

/** Arrotonda una percentuale al 5% più vicino (50, 55, 60…), come la titolarità mostrata nell'app. */
export const roundPercent5 = (p: number) => Math.round(p / 5) * 5;

/**
 * Probabilità di titolarità 0–100, arrotondata al 5% più vicino.
 * Formazione ufficiale > undici probabile > titolarità recente pesata; indisponibile = 0, in dubbio = metà.
 */
export function starterProbability(o: PlayerOutlook): number {
  if (o.unavailable) return 0;
  if (o.confirmed && o.predicted) return o.predicted === "starter" ? 100 : 5;

  const weights = [0.35, 0.25, 0.18, 0.12, 0.1];
  const recent = o.recentStarts.slice(0, weights.length);
  const wsum = weights.slice(0, recent.length).reduce((a, b) => a + b, 0);
  const history = recent.length ? recent.reduce((acc, s, i) => acc + (s ? weights[i] : 0), 0) / wsum : 0.5;

  let p: number;
  if (o.predicted === "starter") p = 0.7 + 0.25 * history;
  else if (o.predicted === "bench") p = 0.05 + 0.25 * history;
  else p = history;
  if (o.doubtful) p *= 0.5;
  return roundPercent5(Math.max(0, Math.min(1, p)) * 100);
}

export interface RosterEntry {
  id: string;
  name: string;
  role: Role;
  /** Crediti pagati all'asta: a parità di stima (es. senza dati della fonte) conta come indicazione del valore. */
  cost?: number;
}

export interface ScoredPlayer extends RosterEntry {
  starterPercent: number;
  expectedFantavote: number;
  score: number;
}

export function scorePlayers(roster: RosterEntry[], outlook: Map<string, PlayerOutlook>, cfg: LeagueConfig): ScoredPlayer[] {
  return roster.map((p) => {
    const o = outlook.get(p.id) ?? { recentStarts: [] };
    const pct = starterProbability(o);
    const efv = o.avgFantavote ?? cfg.baseVote;
    const factor = o.opponentFactor ?? 1;
    return { ...p, starterPercent: pct, expectedFantavote: round2(efv), score: round2(efv * (pct / 100) * factor) };
  });
}

export interface SuggestedLineup {
  module: string;
  starters: ScoredPlayer[];
  bench: ScoredPlayer[];
  total: number;
  captain: string | null;
  vice: string | null;
}

/** Ordine per punteggio atteso; a parità (o senza stime) per costo d'asta. */
export const byValue = (a: ScoredPlayer, b: ScoredPlayer) => (nz(b.score) - nz(a.score)) || ((b.cost ?? 0) - (a.cost ?? 0));
const nz = (x: number) => (Number.isFinite(x) ? x : 0);

/** Sceglie tra i moduli della lega quello con il punteggio atteso più alto. */
export function suggestLineup(scored: ScoredPlayer[], cfg: LeagueConfig): SuggestedLineup | null {
  const byRole = (r: Role) => scored.filter((p) => p.role === r).sort(byValue);
  const [gk, def, mid, att] = ROLES.map(byRole);
  if (!gk.length) return null;
  let best: SuggestedLineup | null = null;
  for (const mod of cfg.modules) {
    const shape = moduleShape(mod);
    if (!shape) continue;
    const [d, c, a] = shape;
    if (def.length < d || mid.length < c || att.length < a) continue;
    const starters = [gk[0], ...def.slice(0, d), ...mid.slice(0, c), ...att.slice(0, a)];
    const total = round2(starters.reduce((s, p) => s + nz(p.score), 0));
    if (!best || total > best.total) best = { module: mod, starters, bench: [], total, captain: null, vice: null };
  }
  if (!best) return null;
  const byScore = [...best.starters].sort(byValue);
  best.captain = byScore[0]?.id ?? null;
  best.vice = byScore[1]?.id ?? null;
  const used = new Set(best.starters.map((p) => p.id));
  best.bench = orderBench(scored.filter((p) => !used.has(p.id)), cfg.benchCount, cfg.benchPerRole);
  return best;
}

/** Panchina in ordine di ruolo (P, D, C, A), i migliori per primi; rispetta i panchinari per ruolo se la lega li fissa. */
export function orderBench(rest: ScoredPlayer[], count: number, perRole: LeagueConfig["benchPerRole"] = null): ScoredPlayer[] {
  return ROLES.flatMap((r) => {
    const list = rest.filter((p) => p.role === r).sort(byValue);
    return perRole ? list.slice(0, perRole[r - 1]) : list;
  }).slice(0, count);
}

export interface LineupCheck {
  starters: { role: Role }[];
  bench: { role: Role }[];
  module: string;
  captain?: string | null;
  vice?: string | null;
  starterIds?: string[];
}

/** Controlli della formazione con il regolamento della lega (modulo, ruoli, panchina, capitano). */
export function validateLineup(l: LineupCheck, cfg: LeagueConfig): string[] {
  const errors: string[] = [];
  if (!cfg.modules.includes(l.module)) errors.push(`Modulo ${l.module.split("").join("-")} non ammesso dalla lega`);
  const shape = moduleShape(l.module);
  if (shape) {
    const want = [1, ...shape];
    const names = ["portiere", "difensori", "centrocampisti", "attaccanti"];
    ROLES.forEach((r, i) => {
      const n = l.starters.filter((p) => p.role === r).length;
      if (n !== want[i]) errors.push(`Servono ${want[i]} ${names[i]} (ora ${n})`);
    });
  }
  if (l.starters.length !== 11) errors.push(`Servono 11 titolari (ora ${l.starters.length})`);
  if (l.bench.length > cfg.benchCount) errors.push(`Massimo ${cfg.benchCount} panchinari`);
  if (cfg.benchPerRole) {
    ROLES.forEach((r) => {
      const n = l.bench.filter((p) => p.role === r).length;
      if (n > cfg.benchPerRole![r - 1]) errors.push(`Massimo ${cfg.benchPerRole![r - 1]} panchinari ${["", "portieri", "difensori", "centrocampisti", "attaccanti"][r]}`);
    });
  }
  if (cfg.modifiers.captain.enabled && l.starterIds) {
    if (!l.captain || !l.starterIds.includes(l.captain)) errors.push("Scegli il capitano tra i titolari");
    if (!l.vice || !l.starterIds.includes(l.vice)) errors.push("Scegli il vice capitano tra i titolari");
    if (l.captain && l.captain === l.vice) errors.push("Capitano e vice devono essere diversi");
  }
  return errors;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
