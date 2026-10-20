// Voto statistico FootballLite: stima sulla scala del fantacalcio dalle statistiche per giocatore e partita (fonte BSD).
// Non è il voto ufficiale. Combina un gradient boosting (70%) e un modello lineare per ruolo (30%), stimati confrontando
// le statistiche BSD con i voti statistici pubblicati (giornate 1–7 della Serie A 2026/27, usati solo per l'analisi e
// non inclusi nell'app). In validazione (ogni giornata stimata con le altre sei): 55% di voti identici,
// 95% entro mezzo punto, scarto medio 0,25.

import type { Role } from "./config";
import { VOTE_TREES, type VoteTree } from "./vote-trees";

/** Statistiche usate dal modello (nomi dei campi BSD; i mancanti valgono 0). */
export type PlayerStats = Partial<Record<
  | "minutes_played" | "rating" | "goals" | "goal_assist" | "expected_goals" | "expected_assists" | "total_shots" | "shots_on_target"
  | "key_pass" | "total_pass" | "accurate_pass" | "total_contest" | "won_contest" | "duel_won" | "duel_lost"
  | "won_tackle" | "total_clearance" | "interception" | "ball_recovery" | "blocked_scoring_attempt" | "dispossessed"
  | "fouls" | "yellow_card" | "red_card" | "saves" | "goals_conceded" | "goals_prevented" | "good_high_claim"
  | "accurate_keeper_sweeper" | "big_chance_created" | "big_chance_missed" | "last_man_tackle" | "clearance_off_line"
  | "error_lead_to_a_goal" | "error_lead_to_a_shot" | "progressive_ball_carries_count"
  | "total_cross" | "accurate_cross" | "aerial_won" | "aerial_lost" | "total_long_balls" | "accurate_long_balls"
  | "possession_lost" | "challenge_lost" | "hit_woodwork" | "was_fouled",
  number | null
>>;

/** Minuti sotto i quali il voto si dà solo con eventi decisivi (recupero escluso, quando la fonte lo distingue). */
export const MIN_MINUTES_FOR_VOTE = 12;

/** Contesto della partita: casa/trasferta e risultato (gol della squadra del giocatore e dell'avversario). */
export interface VoteContext {
  home?: boolean | null;
  teamGoals?: number | null;
  oppGoals?: number | null;
}

const n = (s: PlayerStats, k: keyof PlayerStats) => Number(s[k] ?? 0) || 0;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Caratteristiche del modello, calcolate dalle statistiche BSD e dal contesto. */
type Feature =
  | "min90" | "goals" | "assist" | "xg" | "xa" | "sot" | "shots" | "keypass" | "passacc" | "passes" | "longok" | "longko"
  | "crossok" | "crossko" | "dribok" | "dribko" | "duelw" | "duell" | "aerw" | "aerl" | "tackle" | "interc" | "clear"
  | "recov" | "block" | "dispos" | "posslost" | "fouls" | "fouled" | "yellow" | "red" | "saves" | "conc" | "prevented"
  | "claims" | "bigc" | "bigm" | "errgoal" | "errshot" | "challost" | "wood" | "carries" | "gd" | "win" | "loss" | "home"
  | "teamconc" | "rating" | "m_x_rating" | "short";

function features(s: PlayerStats, ctx: VoteContext): Record<Feature, number> {
  const minutes = n(s, "minutes_played");
  const passes = n(s, "total_pass");
  const gd = (ctx.teamGoals ?? 0) - (ctx.oppGoals ?? 0);
  const min90 = Math.min(minutes, 90) / 90;
  const rating = (Number(s.rating) || 6.8) - 6.8;
  return {
    min90, goals: n(s, "goals"), assist: n(s, "goal_assist"), xg: n(s, "expected_goals"), xa: n(s, "expected_assists"),
    sot: n(s, "shots_on_target"), shots: n(s, "total_shots"), keypass: n(s, "key_pass"),
    passacc: passes >= 10 ? n(s, "accurate_pass") / passes - 0.8 : 0, passes: passes / 50,
    longok: n(s, "accurate_long_balls"), longko: n(s, "total_long_balls") - n(s, "accurate_long_balls"),
    crossok: n(s, "accurate_cross"), crossko: n(s, "total_cross") - n(s, "accurate_cross"),
    dribok: n(s, "won_contest"), dribko: n(s, "total_contest") - n(s, "won_contest"),
    duelw: n(s, "duel_won"), duell: n(s, "duel_lost"), aerw: n(s, "aerial_won"), aerl: n(s, "aerial_lost"),
    tackle: n(s, "won_tackle"), interc: n(s, "interception"), clear: n(s, "total_clearance"), recov: n(s, "ball_recovery"),
    block: n(s, "blocked_scoring_attempt"), dispos: n(s, "dispossessed"), posslost: n(s, "possession_lost") / 10,
    fouls: n(s, "fouls"), fouled: n(s, "was_fouled"), yellow: n(s, "yellow_card"), red: n(s, "red_card"),
    saves: n(s, "saves"), conc: n(s, "goals_conceded"), prevented: n(s, "goals_prevented"), claims: n(s, "good_high_claim"),
    bigc: n(s, "big_chance_created"), bigm: n(s, "big_chance_missed"), errgoal: n(s, "error_lead_to_a_goal"),
    errshot: n(s, "error_lead_to_a_shot"), challost: n(s, "challenge_lost"), wood: n(s, "hit_woodwork"),
    carries: n(s, "progressive_ball_carries_count"),
    gd: clamp(gd, -3, 3), win: gd > 0 ? 1 : 0, loss: gd < 0 ? 1 : 0, home: ctx.home ? 1 : 0,
    teamconc: Math.min(ctx.oppGoals ?? 0, 4), rating, m_x_rating: min90 * rating, short: minutes < 30 ? 1 : 0,
  };
}

/** Modello lineare: pesi stimati per ruolo (voto = intercetta + Σ peso × caratteristica). */
const MODEL: Record<Role, { intercept: number; weights: Partial<Record<Feature, number>> }> = {
  // portieri
  1: {
    intercept: 6.5373,
    weights: {
      passacc: -0.2522, passes: -0.0953, longok: -0.0333, longko: 0.0015, duelw: -0.0781, aerw: 0.165,
      clear: 0.0297, recov: -0.0411, posslost: 0.0204, fouled: -0.0048, saves: 0.021, conc: -0.0127,
      prevented: 0.03, claims: 0.0089, gd: -0.0027, win: -0.0995, loss: -0.1538, home: 0.0062,
      teamconc: -0.0325, rating: 0.2146, m_x_rating: 0.2146,
    },
  },
  // difensori
  2: {
    intercept: 5.852,
    weights: {
      min90: 0.4639, goals: 0.7052, assist: 0.4249, xg: 0.1187, xa: -0.2476, sot: -0.0409,
      shots: -0.0121, keypass: 0.016, passacc: 0.1695, passes: -0.1651, longok: -0.01, longko: 0.0174,
      crossok: 0.019, crossko: 0.0135, dribok: 0.0909, dribko: -0.0018, duelw: -0.0342, duell: -0.0021,
      aerw: 0.0184, aerl: 0.005, tackle: 0.0492, interc: 0.056, clear: 0.001, recov: -0.0035,
      block: 0.011, dispos: -0.0407, posslost: -0.0671, fouls: -0.0138, fouled: 0.0672, yellow: -0.0412,
      conc: -0.1723, bigc: 0.0765, bigm: -0.1411, errshot: -0.1104, challost: -0.0274, wood: 0.2936,
      carries: 0.0191, gd: 0.0507, win: -0.0025, loss: -0.1389, home: -0.0631, teamconc: 0.0173,
      rating: 0.1257, m_x_rating: 0.2305, short: 0.1565,
    },
  },
  // centrocampisti
  3: {
    intercept: 5.6846,
    weights: {
      min90: 0.0518, goals: 0.7976, assist: 0.4381, xg: -0.3872, xa: -0.1389, sot: 0.047,
      shots: 0.0346, keypass: 0.0299, passacc: 0.019, passes: 0.1422, longok: 0.003, longko: 0.0006,
      crossok: 0.0383, crossko: -0.0146, dribok: 0.038, dribko: -0.0013, duelw: -0.0044, duell: -0.0022,
      aerw: -0.0356, aerl: -0.0492, tackle: 0.0626, interc: 0.0487, clear: 0.0424, recov: 0.0019,
      block: 0.0078, dispos: -0.015, posslost: -0.0653, fouls: -0.0096, fouled: 0.0536, yellow: -0.0392,
      conc: -0.1127, bigc: 0.1015, bigm: -0.0489, errgoal: -0.2522, errshot: -0.2103, challost: 0.0025,
      wood: 0.2227, carries: -0.0116, gd: 0.0522, win: 0.0679, loss: -0.1545, home: -0.0106,
      teamconc: 0.0626, rating: 0.1341, m_x_rating: 0.0606, short: 0.1818,
    },
  },
  // attaccanti
  4: {
    intercept: 5.7622,
    weights: {
      min90: -0.0547, goals: 0.6185, assist: 0.3312, xg: -0.2618, xa: 0.0679, sot: 0.0461,
      shots: 0.0233, keypass: 0.0343, passacc: 0.1336, passes: 0.0826, longok: 0.0321, longko: -0.0163,
      crossok: -0.0183, crossko: -0.0225, dribok: 0.014, dribko: -0.015, duelw: -0.0166, duell: 0.0088,
      aerw: -0.0192, aerl: 0.011, tackle: -0.0706, interc: -0.046, clear: 0.0168, recov: 0.015,
      block: 0.0543, dispos: 0.0057, posslost: -0.0392, fouls: -0.0316, fouled: 0.0435, yellow: -0.0599,
      conc: -0.0852, bigc: 0.057, bigm: -0.0418, challost: 0.0698, wood: 0.2235, carries: 0.011,
      gd: 0.0461, win: 0.0806, loss: -0.1284, home: -0.0663, teamconc: 0.0748, rating: 0.2077,
      m_x_rating: 0.2551, short: 0.1712,
    },
  },
};

export interface StatVoteResult {
  /** Voto arrotondato al mezzo punto. */
  vote: number;
  /** Scostamento dal 6 prima dell'arrotondamento (usato dalla calibrazione sulla lega). */
  raw: number;
}

const ROLE_LETTER: Record<Role, string> = { 1: "P", 2: "D", 3: "C", 4: "A" };
/** Peso del gradient boosting nella combinazione con il modello lineare. */
const TREES_WEIGHT = 0.7;

function evalTree(t: VoteTree, x: number[]): number {
  while (typeof t !== "number") t = x[t[0]] < t[1] ? t[2] : t[3];
  return t;
}

/** Voto statistico. Restituisce null se il giocatore non è sceso in campo. */
export function statVote(stats: PlayerStats, role: Role, ctx: VoteContext = {}): StatVoteResult | null {
  if (n(stats, "minutes_played") <= 0) return null;
  const f = features(stats, ctx);
  // Modello lineare per ruolo.
  const m = MODEL[role];
  let linear = m.intercept;
  for (const [k, w] of Object.entries(m.weights) as [Feature, number][]) linear += w * f[k];
  // Gradient boosting: stesse caratteristiche più il ruolo.
  const x = VOTE_TREES.names.map((k) => (k.startsWith("role_") ? (k === `role_${ROLE_LETTER[role]}` ? 1 : 0) : f[k as Feature]));
  let trees = VOTE_TREES.base;
  for (const t of VOTE_TREES.trees) trees += evalTree(t, x);
  const v = TREES_WEIGHT * trees + (1 - TREES_WEIGHT) * linear;
  const raw = Math.round((clamp(v, 3, 10) - 6) * 100) / 100;
  return { vote: roundVote(6 + raw), raw };
}

/** Arrotondamento al mezzo voto più vicino (6,39 → 6,5; 6,88 → 7), come per i voti statistici. */
const roundVote = (v: number) => clamp(Math.round(v * 2) / 2, 3, 10);

/** Voto con la correzione stimata dai risultati ufficiali della lega (vedi calibrate.ts), prima dell'arrotondamento. */
export function calibratedVote(raw: number, calibration?: { offset: number; scale: number } | null): number {
  if (!calibration) return roundVote(6 + raw);
  return roundVote(6 + calibration.scale * raw + calibration.offset);
}

/** Eventi che contano per la soglia dei minuti. */
export interface VoteEvents {
  minutes: number;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  penaltyScored: number;
  penaltyMissed: number;
  penaltySaved: number;
  ownGoals: number;
  goalsConceded: number;
}

/**
 * Chi prende voto (regola verificata sui voti statistici pubblicati: coincide nel 97% dei casi):
 * - "vote": almeno 12 minuti, oppure meno con un evento decisivo (gol, assist, espulsione, autogol, rigore segnato, sbagliato o parato);
 * - "base": sotto i 12 minuti con la sola ammonizione (se la lega lo prevede) o, per il portiere, con i soli gol subiti:
 *   voto base (6) a cui si applicano i malus;
 * - "none": senza voto (s.v.).
 */
export function voteEligibility(e: VoteEvents, role: Role, yellowShort: "none" | "base"): "vote" | "base" | "none" {
  if (e.minutes <= 0) return "none";
  if (e.minutes >= MIN_MINUTES_FOR_VOTE) return "vote";
  if (e.goals + e.assists + e.red + e.ownGoals + e.penaltyScored + e.penaltyMissed + e.penaltySaved > 0) return "vote";
  if (e.yellow > 0) return yellowShort === "base" ? "base" : "none";
  if (role === 1 && e.goalsConceded > 0) return "base";
  return "none";
}

/**
 * Posizione in campo, ricavata dal modulo e dall'ordine della formazione:
 * P portiere, DC difensore centrale, TD terzino o esterno a tutta fascia, CC centrocampista centrale,
 * EC esterno di centrocampo, AE ala o attaccante esterno, AT attaccante centrale.
 * Salvata per informazione: il confronto con i voti pubblicati non ha mostrato vantaggi nell'usarla nel modello.
 */
export type SubRole = "P" | "DC" | "TD" | "CC" | "EC" | "AE" | "AT";

/**
 * Posizioni in campo dalla formazione (modulo es. "4-2-3-1" e giocatori nell'ordine della fonte:
 * portiere, poi le linee dalla difesa all'attacco, ciascuna da un lato all'altro).
 */
export function subRolesFromLineup<T>(formation: string | null | undefined, players: T[]): Map<T, SubRole> {
  const out = new Map<T, SubRole>();
  const lines = (formation ?? "").split("-").map(Number).filter((x) => Number.isInteger(x) && x > 0);
  if (!players.length || lines.reduce((a, b) => a + b, 0) !== players.length - 1) return out;
  out.set(players[0], "P");
  let i = 1;
  lines.forEach((size, li) => {
    const defence = li === 0, attack = li === lines.length - 1;
    // Linea dietro le punte nei moduli a 4 linee (es. il "3" del 4-2-3-1): trequartisti ed esterni offensivi.
    const behindStrikers = lines.length >= 4 && li === lines.length - 2;
    for (let k = 0; k < size; k++, i++) {
      const edge = k === 0 || k === size - 1;
      let r: SubRole;
      if (defence) r = size >= 4 && edge ? "TD" : "DC";
      else if (attack) r = size === 3 && edge ? "AE" : "AT";
      else if (behindStrikers) r = size >= 3 && edge ? "AE" : "CC";
      else r = size >= 4 && edge ? "EC" : "CC";
      out.set(players[i], r);
    }
  });
  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
