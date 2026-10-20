// Voto statistico FootballLite: modello indipendente che stima un voto sulla scala del fantacalcio
// dalle statistiche per giocatore e partita (fonte BSD). Non è il voto ufficiale né un algoritmo di terzi:
// pesi e componenti sono scelti da FootballLite e sono tutti qui sotto.

import type { Role } from "./config";

/** Statistiche usate dal modello (nomi dei campi BSD; i mancanti valgono 0). */
export type PlayerStats = Partial<Record<
  | "minutes_played" | "goals" | "goal_assist" | "expected_goals" | "expected_assists" | "total_shots" | "shots_on_target"
  | "key_pass" | "total_pass" | "accurate_pass" | "total_contest" | "won_contest" | "duel_won" | "duel_lost"
  | "won_tackle" | "total_clearance" | "interception" | "ball_recovery" | "blocked_scoring_attempt" | "dispossessed"
  | "fouls" | "yellow_card" | "red_card" | "saves" | "goals_conceded" | "goals_prevented" | "good_high_claim"
  | "accurate_keeper_sweeper" | "big_chance_created" | "big_chance_missed" | "last_man_tackle" | "clearance_off_line"
  | "error_lead_to_a_goal" | "error_lead_to_a_shot" | "progressive_ball_carries_count",
  number | null
>>;

/** Minuti sotto i quali un giocatore senza eventi resta senza voto (come lo "s.v." del fantacalcio). */
export const MIN_MINUTES_FOR_VOTE = 20;

const n = (s: PlayerStats, k: keyof PlayerStats) => Number(s[k] ?? 0) || 0;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export interface StatVoteBreakdown {
  vote: number;
  attack: number;
  buildUp: number;
  defense: number;
  goalkeeping: number;
  errors: number;
}

/**
 * Voto statistico per ruolo. Restituisce null se il giocatore non ha minuti sufficienti per un voto.
 * Componenti (scostamenti dal 6):
 * - attacco: gol, assist, xG, xA, tiri in porta, occasioni create/sbagliate;
 * - costruzione: passaggi chiave, precisione passaggi (sopra/sotto l'80%), dribbling riusciti, conduzioni progressive;
 * - difesa: contrasti vinti, intercetti, respinte, recuperi, tiri bloccati, duelli;
 * - portiere: gol evitati rispetto agli xG subiti, parate, uscite, gol subiti;
 * - errori: errori che portano a gol/tiro, palle perse, falli, cartellini.
 */
export function statVote(stats: PlayerStats, role: Role): StatVoteBreakdown | null {
  const minutes = n(stats, "minutes_played");
  if (minutes <= 0) return null;
  // Peso delle componenti "di volume" in base ai minuti: poco tempo in campo, voto vicino al 6.
  const m = clamp(minutes / 90, 0.25, 1);

  const attack =
    0.35 * n(stats, "goals") + 0.25 * n(stats, "goal_assist") +
    0.5 * n(stats, "expected_goals") + 0.4 * n(stats, "expected_assists") +
    0.05 * n(stats, "shots_on_target") + 0.15 * n(stats, "big_chance_created") - 0.12 * n(stats, "big_chance_missed");

  const passes = n(stats, "total_pass");
  const accuracy = passes >= 10 ? n(stats, "accurate_pass") / passes : 0.8;
  const failedDribbles = Math.max(0, n(stats, "total_contest") - n(stats, "won_contest"));
  const buildUp = m * (
    0.08 * n(stats, "key_pass") + (accuracy - 0.8) * 1.5 +
    0.04 * n(stats, "won_contest") - 0.02 * failedDribbles + 0.02 * n(stats, "progressive_ball_carries_count")
  );

  const defense = m * (
    0.04 * n(stats, "won_tackle") + 0.04 * n(stats, "interception") + 0.02 * n(stats, "total_clearance") +
    0.02 * n(stats, "ball_recovery") + 0.05 * n(stats, "blocked_scoring_attempt") +
    0.03 * (n(stats, "duel_won") - n(stats, "duel_lost")) + 0.1 * n(stats, "last_man_tackle") + 0.15 * n(stats, "clearance_off_line")
  );

  const goalkeeping = role === 1
    ? 0.6 * n(stats, "goals_prevented") + 0.05 * n(stats, "saves") + 0.05 * n(stats, "good_high_claim") +
      0.1 * n(stats, "accurate_keeper_sweeper") - 0.2 * n(stats, "goals_conceded")
    : 0;

  const errors =
    -0.6 * n(stats, "error_lead_to_a_goal") - 0.25 * n(stats, "error_lead_to_a_shot") -
    0.03 * n(stats, "dispossessed") - 0.02 * n(stats, "fouls") - 0.1 * n(stats, "yellow_card") - 0.5 * n(stats, "red_card");

  // Pesi per ruolo: i difensori sono giudicati più sulla fase difensiva, gli attaccanti su quella offensiva.
  const w = { 1: [0.2, 0.3, 0.3], 2: [0.8, 0.8, 1.5], 3: [1, 1.2, 1], 4: [1.2, 0.9, 0.5] }[role] as [number, number, number];
  const delta = attack * w[0] + buildUp * w[1] + defense * w[2] + goalkeeping + errors;
  const vote = clamp(Math.round((6 + clamp(delta, -3, 3)) * 2) / 2, 3, 10);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { vote, attack: r2(attack * w[0]), buildUp: r2(buildUp * w[1]), defense: r2(defense * w[2]), goalkeeping: r2(goalkeeping), errors: r2(errors) };
}
