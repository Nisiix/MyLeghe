// Calcolo della giornata con il regolamento della lega: fantavoti, sostituzioni, capitano, modificatori e risultato.
// I voti sono stime FootballLite calcolate su statistiche con licenza: non sono i voti ufficiali.

import { bandValue, matchGoals, type LeagueConfig, type Role } from "./config";
import { MIN_MINUTES_FOR_VOTE, statVote, type PlayerStats } from "./vote";

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
  /** Rating della fonte, se esiste. */
  rating?: number | null;
  /** Statistiche complete della partita (per il voto statistico). */
  stats?: PlayerStats | null;
  /** Voto statistico già normalizzato sulla giornata (calcolato dal backend su tutti i giocatori). */
  statVote?: number | null;
}

export type MatchState = "pending" | "live" | "finished";

export interface PlayerLiveScore {
  id: string;
  role: Role;
  /** played = ha giocato; pending = deve ancora giocare; absent = non ha giocato a partita finita; office = voto d'ufficio. */
  state: "played" | "pending" | "absent" | "office";
  vote: number | null;
  bonus: number;
  fantavote: number | null;
  yellow: number;
  red: number;
  goals: number;
  assists: number;
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
  if (finished && e.goalsConceded === 0 && e.minutes > 0) bonus += b.cleanSheet[i];
  const vote = estimateVote(e, role, cfg) ?? cfg.baseVote;
  return { vote, bonus: round2(bonus), fantavote: round2(vote + bonus) };
}

/** Voto stimato secondo il modello scelto dalla lega; se mancano i dati si passa al successivo (statistico → rating → base). */
export function estimateVote(e: MatchEvents, role: Role, cfg: LeagueConfig): number | null {
  if (cfg.voteModel === "base") return cfg.baseVote;
  if (cfg.voteModel === "stats" && typeof e.statVote === "number") return e.statVote;
  if (cfg.voteModel === "stats" && e.stats) {
    const v = statVote({ ...e.stats, minutes_played: e.minutes }, role);
    if (v) return v.vote;
  }
  return e.rating ? ratingToVote(e.rating) : null;
}

/** Ha avuto eventi da bonus/malus (in quel caso prende voto anche con pochi minuti). */
function hasEvents(e: MatchEvents): boolean {
  return e.goals + e.assists + e.yellow + e.red + e.penaltyScored + e.penaltyMissed + e.penaltySaved + e.ownGoals > 0;
}

/**
 * Punteggio di un giocatore: con gli eventi se ha giocato; voto base se la sua partita deve ancora giocarsi;
 * nessun voto se la partita è finita e non è entrato.
 */
export function playerLiveScore(id: string, role: Role, events: MatchEvents | undefined, state: MatchState, cfg: LeagueConfig): PlayerLiveScore {
  const base = { id, role, yellow: events?.yellow ?? 0, red: events?.red ?? 0, goals: (events?.goals ?? 0) + (events?.penaltyScored ?? 0), assists: events?.assists ?? 0 };
  // Pochi minuti senza eventi: senza voto (s.v.), come nel fantacalcio, quando la sua partita è finita.
  const tooShort = events && events.minutes > 0 && events.minutes < MIN_MINUTES_FOR_VOTE && !hasEvents(events) && role !== 1;
  if (events && events.minutes > 0 && !(tooShort && state === "finished")) {
    const f = fantavote(events, role, cfg, state === "finished");
    return { ...base, state: "played", vote: f.vote, bonus: f.bonus, fantavote: f.fantavote };
  }
  if (state === "finished") return { ...base, state: "absent", vote: null, bonus: 0, fantavote: null };
  return { ...base, state: "pending", vote: cfg.baseVote, bonus: 0, fantavote: cfg.baseVote };
}

export interface TeamLineupInput {
  module: string;
  starters: PlayerLiveScore[];
  bench: PlayerLiveScore[];
  captain?: string | null;
  vice?: string | null;
}

export interface Modifier { label: string; value: number }

export interface TeamScore {
  /** Giocatori che contano (titolari con voto, sostituti, voti d'ufficio). */
  counted: PlayerLiveScore[];
  substitutions: { out: string; in: string | null }[];
  /** Somma dei fantavoti conteggiati. */
  base: number;
  mods: Modifier[];
  /** Totale con i modificatori di squadra (senza quelli che dipendono dall'avversario). */
  total: number;
  /** Malus da sottrarre all'avversario (modificatore difesa "all'avversario"). */
  opponentMalus: number;
  /** Somma dei voti dei centrocampisti conteggiati (per il modificatore centrocampo). */
  midfieldVotes: number;
  captainId: string | null;
}

/** Un titolare "conta" se ha un voto: in modalità parziale chi deve giocare non conta ancora (né viene sostituito). */
function counts(p: PlayerLiveScore, projection: boolean): boolean {
  return p.state === "played" || (projection && p.state === "pending");
}

/**
 * Formazione → punteggio di squadra con il regolamento.
 * `projection`: true = "Simula risultato" (chi deve giocare vale il voto base); false = parziale con i soli voti arrivati.
 */
export function computeTeam(t: TeamLineupInput, cfg: LeagueConfig, projection: boolean): TeamScore {
  const counted: PlayerLiveScore[] = [];
  const substitutions: TeamScore["substitutions"] = [];
  const used = new Set<string>();
  const roleCount = (list: PlayerLiveScore[], r: Role) => list.filter((p) => p.role === r).length;
  const shapeOk = (list: PlayerLiveScore[]) => roleCount(list, 1) === 1 && cfg.modules.includes(`${roleCount(list, 2)}${roleCount(list, 3)}${roleCount(list, 4)}`);

  // Formazione "effettiva" per controllare il modulo nelle sostituzioni libere.
  let effective = [...t.starters];
  for (const p of t.starters) {
    if (counts(p, projection)) { counted.push(p); continue; }
    // In parziale chi deve ancora giocare resta in attesa: niente sostituzione.
    if (p.state === "pending") continue;
    let sub: PlayerLiveScore | undefined;
    if (substitutions.filter((s) => s.in).length < cfg.substitutions.max) {
      const available = t.bench.filter((b) => !used.has(b.id) && counts(b, projection));
      sub = available.find((b) => b.role === p.role);
      if (!sub && cfg.substitutions.mode === "free" && p.role !== 1) {
        sub = available.find((b) => b.role !== 1 && shapeOk(effective.map((x) => (x.id === p.id ? b : x))));
      }
    }
    if (sub) {
      const s = sub;
      used.add(s.id);
      substitutions.push({ out: p.id, in: s.id });
      counted.push(s);
      effective = effective.map((x) => (x.id === p.id ? s : x));
    } else {
      const office = p.role === 1 ? cfg.substitutions.officeVoteGoalkeeper : cfg.substitutions.officeVoteField;
      if (office !== null) {
        substitutions.push({ out: p.id, in: null });
        counted.push({ ...p, state: "office", vote: office, bonus: 0, fantavote: office });
      }
    }
  }

  const mods: Modifier[] = [];
  const m = cfg.modifiers;
  const withVote = counted.filter((p) => p.vote !== null && p.state !== "office");

  // Capitano (o vice se il capitano non conta).
  let captainId: string | null = null;
  if (m.captain.enabled) {
    const c = withVote.find((p) => p.id === t.captain) ?? withVote.find((p) => p.id === t.vice);
    if (c) {
      captainId = c.id;
      let v = 0;
      if (m.captain.doubleBonus && c.bonus > 0) v += c.bonus;
      if (m.captain.doubleMalus && c.bonus < 0) v += c.bonus;
      v += bandValue(m.captain.bands, c.vote!);
      if (v) mods.push({ label: "Capitano", value: round2(v) });
    }
  }
  if (m.goalkeeper.enabled) {
    const gk = withVote.find((p) => p.role === 1);
    const v = gk ? bandValue(m.goalkeeper.bands, gk.vote!) : 0;
    if (v) mods.push({ label: "Modificatore portiere", value: v });
  }
  let opponentMalus = 0;
  if (m.defense.enabled) {
    const defenders = withVote.filter((p) => p.role === 2);
    if (defenders.length >= m.defense.minDefenders) {
      const votes = defenders.map((p) => p.vote!).sort((a, b) => b - a).slice(0, m.defense.defendersCounted);
      const gk = withVote.find((p) => p.role === 1);
      if (m.defense.includeGoalkeeper && gk) votes.push(gk.vote!);
      const v = votes.length ? bandValue(m.defense.bands, votes.reduce((a, b) => a + b, 0) / votes.length) : 0;
      if (v && m.defense.applyTo === "own") mods.push({ label: "Modificatore difesa", value: v });
      if (v && m.defense.applyTo === "opponent") opponentMalus = v;
    }
  }
  if (m.attack.enabled) {
    const v = withVote
      .filter((p) => p.role === 4 && p.goals === 0 && !(m.attack.excludeWithAssist && p.assists > 0))
      .reduce((s, p) => s + bandValue(m.attack.bands, p.vote!), 0);
    if (v) mods.push({ label: "Modificatore attacco", value: round2(v) });
  }
  // Fair play: nessun cartellino tra i conteggiati (in parziale solo quando hanno giocato tutti).
  if (m.fairPlay.enabled && withVote.length && !withVote.some((p) => p.yellow > 0 || p.red > 0) && (projection || withVote.every((p) => p.state === "played"))) {
    mods.push({ label: "Fair play", value: m.fairPlay.value });
  }
  const moduleBonus = m.module[t.module];
  if (moduleBonus) mods.push({ label: `Modulo ${t.module.split("").join("-")}`, value: moduleBonus });

  const base = round2(counted.reduce((s, p) => s + (p.fantavote ?? 0), 0));
  const midfieldVotes = withVote.filter((p) => p.role === 3).reduce((s, p) => s + p.vote!, 0);
  return {
    counted, substitutions, base, mods,
    total: round2(base + mods.reduce((s, x) => s + x.value, 0)),
    opponentMalus, midfieldVotes, captainId,
  };
}

export interface TeamMatchScore extends TeamScore { final: number; matchMods: Modifier[] }
export interface MatchScore { home: TeamMatchScore; away: TeamMatchScore; goals: [number, number] }

/** Partita: modificatori che dipendono da entrambe le squadre (centrocampo, difesa all'avversario, fattore campo) e gol. */
export function computeMatch(home: TeamScore, away: TeamScore, cfg: LeagueConfig): MatchScore {
  const hm: Modifier[] = [], am: Modifier[] = [];
  const m = cfg.modifiers;
  if (m.midfield.enabled) {
    const diff = home.midfieldVotes - away.midfieldVotes;
    const v = bandValue(m.midfield.bands, Math.abs(diff));
    if (v && diff !== 0) {
      (diff > 0 ? hm : am).push({ label: "Modificatore centrocampo", value: v });
      (diff > 0 ? am : hm).push({ label: "Modificatore centrocampo", value: -v });
    }
  }
  if (away.opponentMalus) hm.push({ label: "Modificatore difesa avversario", value: -away.opponentMalus });
  if (home.opponentMalus) am.push({ label: "Modificatore difesa avversario", value: -home.opponentMalus });
  if (m.homeAdvantage.enabled && m.homeAdvantage.value) hm.push({ label: "Fattore campo", value: m.homeAdvantage.value });
  const hf = round2(home.total + hm.reduce((s, x) => s + x.value, 0));
  const af = round2(away.total + am.reduce((s, x) => s + x.value, 0));
  return { home: { ...home, final: hf, matchMods: hm }, away: { ...away, final: af, matchMods: am }, goals: matchGoals(hf, af, cfg) };
}

/** Squadra senza formazione con regola "punteggio fisso"; null se la regola non assegna un risultato. */
export function noLineupScore(cfg: LeagueConfig): TeamScore | null {
  if (cfg.noLineup.mode !== "fixed") return null;
  const p = cfg.noLineup.points;
  return { counted: [], substitutions: [], base: p, mods: [], total: p, opponentMalus: 0, midfieldVotes: 0, captainId: null };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
