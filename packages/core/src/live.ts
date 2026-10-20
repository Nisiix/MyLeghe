// Fantavoto live stimato: voto base della lega + bonus/malus dagli eventi della partita.
// Non sono i voti ufficiali: è una stima FootballLite calcolata su eventi con licenza.

import type { LeagueConfig, Role } from "./config";

export interface MatchEvents {
  minutes: number;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  penaltyScored: number;
  penaltyMissed: number;
  penaltySaved: number;
  ownGoals: number;
  /** Gol subiti dalla squadra mentre il giocatore era in campo (per i portieri). */
  goalsConceded: number;
  /** Voto fornito dalla fonte, se esiste (altrimenti si usa il voto base della lega). */
  rating?: number | null;
}

export type MatchState = "pending" | "live" | "finished";

export interface PlayerLiveScore {
  id: string;
  role: Role;
  state: "played" | "pending" | "absent";
  vote: number | null;
  bonus: number;
  fantavote: number | null;
}

/**
 * Rating della fonte (scala tipo 3–10, media intorno a 6,8) → voto stimato sulla scala del fantacalcio
 * (media intorno a 6), arrotondato al mezzo voto.
 */
export function ratingToVote(rating: number): number {
  const v = 6 + (rating - 6.8);
  return Math.min(10, Math.max(3, Math.round(v * 2) / 2));
}

export function fantavote(e: MatchEvents, role: Role, cfg: LeagueConfig, finished: boolean): { vote: number; bonus: number; fantavote: number } {
  const i = role - 1;
  const b = cfg.bonus;
  let bonus =
    e.goals * b.goal[i] + e.assists * b.assist[i] + e.yellow * b.yellow[i] + e.red * b.red[i] +
    e.penaltyScored * b.penaltyScored[i] + e.penaltyMissed * b.penaltyMissed[i] +
    e.penaltySaved * b.penaltySaved[i] + e.ownGoals * b.ownGoal[i] + e.goalsConceded * b.goalConceded[i];
  if (finished && role === 1 && e.goalsConceded === 0 && e.minutes > 0) bonus += b.cleanSheet[i];
  const vote = cfg.voteFromRating && e.rating ? ratingToVote(e.rating) : cfg.baseVote;
  return { vote, bonus, fantavote: round2(vote + bonus) };
}

/**
 * Punteggio di un giocatore: con eventi se ha giocato; voto base se la sua partita deve ancora giocarsi
 * (come il simulatore LegheFC); nessun voto se la partita è finita e non è entrato.
 */
export function playerLiveScore(id: string, role: Role, events: MatchEvents | undefined, state: MatchState, cfg: LeagueConfig): PlayerLiveScore {
  if (events && events.minutes > 0) {
    const f = fantavote(events, role, cfg, state === "finished");
    return { id, role, state: "played", vote: f.vote, bonus: f.bonus, fantavote: f.fantavote };
  }
  if (state === "finished") return { id, role, state: "absent", vote: null, bonus: 0, fantavote: null };
  return { id, role, state: "pending", vote: null, bonus: 0, fantavote: cfg.baseVote };
}

export interface TeamProjection {
  total: number;
  counted: PlayerLiveScore[];
  substitutions: { out: string; in: string }[];
}

/** Titolari senza voto a partita finita sostituiti dal primo panchinaro dello stesso ruolo, fino al massimo della lega. */
export function projectTeam(starters: PlayerLiveScore[], bench: PlayerLiveScore[], cfg: LeagueConfig): TeamProjection {
  const counted: PlayerLiveScore[] = [];
  const substitutions: { out: string; in: string }[] = [];
  const used = new Set<string>();
  for (const p of starters) {
    if (p.fantavote !== null) { counted.push(p); continue; }
    if (substitutions.length >= cfg.maxSubstitutions) continue;
    const sub = bench.find((b) => !used.has(b.id) && b.role === p.role && b.fantavote !== null);
    if (sub) {
      used.add(sub.id);
      substitutions.push({ out: p.id, in: sub.id });
      counted.push(sub);
    }
  }
  return { total: round2(counted.reduce((s, p) => s + (p.fantavote ?? 0), 0)), counted, substitutions };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
