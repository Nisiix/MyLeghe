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

/**
 * Probabilità di titolarità 0–100.
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
  return Math.round(Math.max(0, Math.min(1, p)) * 100);
}

export interface RosterEntry {
  id: string;
  name: string;
  role: Role;
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
}

/** Sceglie tra i moduli della lega quello con il punteggio atteso più alto. */
export function suggestLineup(scored: ScoredPlayer[], cfg: LeagueConfig): SuggestedLineup | null {
  const byRole = (r: Role) => scored.filter((p) => p.role === r).sort((a, b) => b.score - a.score);
  const [gk, def, mid, att] = ROLES.map(byRole);
  if (!gk.length) return null;
  let best: SuggestedLineup | null = null;
  for (const mod of cfg.modules) {
    const shape = moduleShape(mod);
    if (!shape) continue;
    const [d, c, a] = shape;
    if (def.length < d || mid.length < c || att.length < a) continue;
    const starters = [gk[0], ...def.slice(0, d), ...mid.slice(0, c), ...att.slice(0, a)];
    const total = round2(starters.reduce((s, p) => s + p.score, 0));
    if (!best || total > best.total) best = { module: mod, starters, bench: [], total };
  }
  if (!best) return null;
  const used = new Set(best.starters.map((p) => p.id));
  best.bench = orderBench(scored.filter((p) => !used.has(p.id)), cfg.benchCount);
  return best;
}

/** Panchina in ordine di ruolo (P, D, C, A), i migliori per primi. */
export function orderBench(rest: ScoredPlayer[], count: number): ScoredPlayer[] {
  return ROLES.flatMap((r) => rest.filter((p) => p.role === r).sort((a, b) => b.score - a.score)).slice(0, count);
}

export function validateLineup(starters: { role: Role }[], bench: unknown[], module: string, cfg: LeagueConfig): string[] {
  const errors: string[] = [];
  if (!cfg.modules.includes(module)) errors.push(`Modulo ${module.split("").join("-")} non ammesso dalla lega`);
  const shape = moduleShape(module);
  if (shape) {
    const want = [1, ...shape];
    const names = ["portiere", "difensori", "centrocampisti", "attaccanti"];
    ROLES.forEach((r, i) => {
      const n = starters.filter((p) => p.role === r).length;
      if (n !== want[i]) errors.push(`Servono ${want[i]} ${names[i]} (ora ${n})`);
    });
  }
  if (starters.length !== 11) errors.push(`Servono 11 titolari (ora ${starters.length})`);
  if (bench.length > cfg.benchCount) errors.push(`Massimo ${cfg.benchCount} panchinari`);
  return errors;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
