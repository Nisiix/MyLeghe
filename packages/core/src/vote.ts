// Voto statistico FootballLite: modello indipendente che stima un voto sulla scala del fantacalcio
// dalle statistiche per giocatore e partita (fonte BSD). Non è il voto ufficiale né un algoritmo di terzi:
// pesi e componenti sono scelti da FootballLite e sono tutti qui sotto. Segue i principi dichiarati
// pubblicamente per i voti statistici: valutazione per posizione in campo, contesto della partita
// (casa/trasferta, forza dell'avversario), soglia minima di minuti, arrotondamento al mezzo voto.

import type { Role } from "./config";

/** Statistiche usate dal modello (nomi dei campi BSD; i mancanti valgono 0). */
export type PlayerStats = Partial<Record<
  | "minutes_played" | "goals" | "goal_assist" | "expected_goals" | "expected_assists" | "total_shots" | "shots_on_target"
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

/**
 * Posizione in campo, ricavata dal modulo e dall'ordine della formazione:
 * P portiere, DC difensore centrale, TD terzino o esterno a tutta fascia, CC centrocampista centrale,
 * EC esterno di centrocampo, AE ala o attaccante esterno, AT attaccante centrale.
 */
export type SubRole = "P" | "DC" | "TD" | "CC" | "EC" | "AE" | "AT";

/** Contesto della partita: posizione in campo, casa/trasferta, forza dell'avversario (-1 ultima … 1 prima in classifica). */
export interface VoteContext {
  subRole?: SubRole | null;
  home?: boolean | null;
  opponentStrength?: number | null;
}

const n = (s: PlayerStats, k: keyof PlayerStats) => Number(s[k] ?? 0) || 0;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export interface StatVoteBreakdown {
  vote: number;
  /** Scostamento grezzo dal 6 (prima dell'arrotondamento), usato dalla normalizzazione di giornata. */
  raw: number;
  attack: number;
  buildUp: number;
  defense: number;
  wide: number;
  goalkeeping: number;
  errors: number;
  context: number;
}

/** Pesi per posizione: [attacco, costruzione, difesa, gioco sulle fasce (cross), gioco aereo]. */
const SUB_ROLE_WEIGHTS: Record<SubRole, [number, number, number, number, number]> = {
  P: [0.2, 0.3, 0.3, 0, 0.2],
  DC: [0.6, 0.7, 1.6, 0.3, 1],
  TD: [0.9, 1, 1.2, 1, 0.5],
  CC: [0.9, 1.3, 1, 0.5, 0.5],
  EC: [1.1, 1, 0.6, 1, 0.3],
  AE: [1.2, 1, 0.4, 1, 0.3],
  AT: [1.3, 0.7, 0.3, 0.4, 1],
};
/** Senza posizione in campo si usa quella tipica del ruolo. */
const ROLE_DEFAULT: Record<Role, SubRole> = { 1: "P", 2: "DC", 3: "CC", 4: "AT" };

/**
 * Voto statistico per posizione. Restituisce null se il giocatore non è sceso in campo.
 * Componenti (scostamenti dal 6):
 * - attacco: gol, assist, xG, xA, tiri in porta, pali, occasioni create/sbagliate;
 * - costruzione: passaggi chiave, precisione passaggi (sopra/sotto l'80%), lanci riusciti, dribbling, conduzioni progressive, falli subiti;
 * - difesa: contrasti vinti, anticipi (intercetti), respinte, recuperi, tiri bloccati, duelli, dribbling subiti;
 * - fasce: cross riusciti e sbagliati; gioco aereo: duelli aerei;
 * - portiere: gol evitati rispetto agli xG subiti, parate, uscite, gol subiti;
 * - errori: errori che portano a gol/tiro, palle perse, falli, cartellini;
 * - contesto: forza dell'avversario e partita in trasferta alzano leggermente il voto a parità di prestazione.
 */
export function statVote(stats: PlayerStats, role: Role, ctx: VoteContext = {}): StatVoteBreakdown | null {
  const minutes = n(stats, "minutes_played");
  if (minutes <= 0) return null;
  // Peso delle componenti "di volume" in base ai minuti: poco tempo in campo, voto vicino al 6.
  const m = clamp(minutes / 90, 0.25, 1);
  const sub = role === 1 ? "P" : ctx.subRole && ctx.subRole !== "P" ? ctx.subRole : ROLE_DEFAULT[role];
  const w = SUB_ROLE_WEIGHTS[sub];

  const attack =
    0.35 * n(stats, "goals") + 0.25 * n(stats, "goal_assist") +
    0.5 * n(stats, "expected_goals") + 0.4 * n(stats, "expected_assists") +
    0.05 * n(stats, "shots_on_target") + 0.05 * n(stats, "hit_woodwork") +
    0.15 * n(stats, "big_chance_created") - 0.12 * n(stats, "big_chance_missed");

  const passes = n(stats, "total_pass");
  const accuracy = passes >= 10 ? n(stats, "accurate_pass") / passes : 0.8;
  const failedDribbles = Math.max(0, n(stats, "total_contest") - n(stats, "won_contest"));
  const failedLong = Math.max(0, n(stats, "total_long_balls") - n(stats, "accurate_long_balls"));
  const buildUp = m * (
    0.08 * n(stats, "key_pass") + (accuracy - 0.8) * 1.5 + 0.015 * n(stats, "accurate_long_balls") - 0.005 * failedLong +
    0.04 * n(stats, "won_contest") - 0.02 * failedDribbles + 0.02 * n(stats, "progressive_ball_carries_count") +
    0.01 * n(stats, "was_fouled")
  );

  const defense = m * (
    0.04 * n(stats, "won_tackle") + 0.04 * n(stats, "interception") + 0.02 * n(stats, "total_clearance") +
    0.02 * n(stats, "ball_recovery") + 0.05 * n(stats, "blocked_scoring_attempt") +
    0.03 * (n(stats, "duel_won") - n(stats, "duel_lost")) - 0.03 * n(stats, "challenge_lost") +
    0.1 * n(stats, "last_man_tackle") + 0.15 * n(stats, "clearance_off_line")
  );

  const failedCrosses = Math.max(0, n(stats, "total_cross") - n(stats, "accurate_cross"));
  const wide = m * (0.06 * n(stats, "accurate_cross") - 0.02 * failedCrosses);
  const aerial = m * 0.03 * (n(stats, "aerial_won") - n(stats, "aerial_lost"));

  const goalkeeping = role === 1
    ? 0.6 * n(stats, "goals_prevented") + 0.05 * n(stats, "saves") + 0.05 * n(stats, "good_high_claim") +
      0.1 * n(stats, "accurate_keeper_sweeper") - 0.2 * n(stats, "goals_conceded")
    : 0;

  const errors =
    -0.6 * n(stats, "error_lead_to_a_goal") - 0.25 * n(stats, "error_lead_to_a_shot") -
    0.03 * n(stats, "dispossessed") - 0.004 * n(stats, "possession_lost") - 0.02 * n(stats, "fouls") -
    0.1 * n(stats, "yellow_card") - 0.5 * n(stats, "red_card");

  // L'asticella cambia con il contesto: contro una squadra forte o in trasferta la stessa prestazione vale un po' di più.
  const context = 0.15 * clamp(ctx.opponentStrength ?? 0, -1, 1) + (ctx.home === false ? 0.05 : 0);

  const delta = attack * w[0] + buildUp * w[1] + defense * w[2] + wide * w[3] + aerial * w[4] + goalkeeping + errors + context;
  const vote = roundVote(6 + clamp(delta, -3, 3));
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    vote, raw: r2(delta), attack: r2(attack * w[0]), buildUp: r2(buildUp * w[1]), defense: r2(defense * w[2] + aerial * w[4]),
    wide: r2(wide * w[3]), goalkeeping: r2(goalkeeping), errors: r2(errors), context: r2(context),
  };
}

/** Arrotondamento al mezzo voto (6,39 → 6,5; 6,88 → 7). */
const roundVote = (v: number) => clamp(Math.round(v * 2) / 2, 3, 10);

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
 * Chi prende voto:
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

export interface RoundEntry { id: number; role: Role; raw: number; minutes: number }

/**
 * Normalizzazione di giornata: ogni giocatore è confrontato con quelli dello stesso ruolo nella stessa giornata.
 * Lo scostamento dal giocatore "tipico" del ruolo diventa un voto centrato sul 6 con dispersione `spread`.
 * Centro e dispersione sono mediana e deviazione mediana (robuste: poche prestazioni eccezionali non spostano
 * tutti gli altri), calcolate su chi ha giocato almeno 45 minuti; chi ne ha giocati meno è confrontato con i subentrati.
 */
export function normalizeRound(entries: RoundEntry[], spread = 0.65): Map<number, number> {
  const out = new Map<number, number>();
  for (const role of [1, 2, 3, 4] as Role[]) {
    const all = entries.filter((e) => e.role === role);
    const base = all.filter((e) => e.minutes >= 45);
    const sample = base.length >= 5 ? base : all;
    if (sample.length < 3) {
      for (const e of all) out.set(e.id, roundVote(6 + clamp(e.raw, -3, 3)));
      continue;
    }
    const center = median(sample.map((e) => e.raw));
    const sd = 1.4826 * median(sample.map((e) => Math.abs(e.raw - center))) || 1;
    // Chi è in campo meno di 45 minuti accumula meno statistiche: si confronta con gli altri subentrati del ruolo
    // (o, se sono pochi, con il centro riproporzionato ai suoi minuti).
    const short = all.filter((e) => e.minutes < 45);
    const shortCenter = short.length >= 5 ? median(short.map((e) => e.raw)) : null;
    for (const e of all) {
      const c = e.minutes >= 45 || sample === all ? center : shortCenter ?? center * clamp(e.minutes / 90, 0.25, 1);
      out.set(e.id, roundVote(6 + clamp(((e.raw - c) / sd) * spread, -3, 3)));
    }
  }
  return out;
}
