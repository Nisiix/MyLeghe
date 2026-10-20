// Unione di rosa importata, stima di titolarità e calcolo della giornata con il regolamento della lega.

import {
  computeMatch, computeTeam, noLineupScore, playerLiveScore, scorePlayers,
  type LeagueConfig, type MatchScore, type PlayerLiveScore, type ScoredPlayer, type TeamScore,
} from "@footballlite/core";
import type { CalendarRow, LeagueData, LiveData, Lineup, Outlook, RosterPlayer } from "./data";

/** Giocatori della rosa di una squadra con l'id "slot" usato nelle formazioni. */
export function rosterOf(data: LeagueData, teamId: number): RosterPlayer[] {
  return data.roster.filter((p) => p.team_id === teamId).sort((a, b) => a.slot - b.slot);
}

export function scoredRoster(roster: RosterPlayer[], outlook: Record<string, Outlook> | undefined, cfg: LeagueConfig): (ScoredPlayer & { info: RosterPlayer; outlook?: Outlook })[] {
  const map = new Map(roster.filter((p) => p.ext_id && outlook?.[p.ext_id]).map((p) => [String(p.slot), outlook![p.ext_id!]]));
  return scorePlayers(roster.map((p) => ({ id: String(p.slot), name: p.name, role: p.role })), map, cfg)
    .map((s, i) => {
      const info = roster[i];
      const o = info.ext_id ? outlook?.[info.ext_id] : undefined;
      // Senza abbinamento alla fonte dati la titolarità non è stimabile.
      return { ...s, starterPercent: o ? s.starterPercent : NaN, info, outlook: o };
    });
}

/**
 * Ipotesi della simulazione, come in "Modifica voti" di Leghe Fantacalcio:
 * chi deve giocare prende fantavoto 6, ma si può togliere ("non prende voto") o cambiare voto e bonus/malus.
 */
export interface SimOverride { plays: boolean; vote: number; bonus: number }
export type SimOverrides = Record<string, SimOverride>;
export const simKey = (teamId: number, slot: string | number) => `${teamId}:${slot}`;
export const SIM_DEFAULT_VOTE = 6;

export type Named = PlayerLiveScore & { name: string };

function applyOverride(p: PlayerLiveScore, o: SimOverride | undefined): PlayerLiveScore {
  if (!o) return p;
  if (!o.plays) return { ...p, state: "absent", vote: null, bonus: 0, fantavote: null };
  return { ...p, state: "played", vote: o.vote, bonus: o.bonus, fantavote: Math.round((o.vote + o.bonus) * 100) / 100 };
}

export interface TeamCalc {
  lineup: Lineup;
  starters: Named[];
  bench: Named[];
  score: TeamScore;
}

/**
 * Punteggio di una squadra per la giornata. `simulate` = "Simula risultato": chi deve giocare vale 6 (o l'ipotesi
 * impostata); altrimenti parziale con i soli voti arrivati.
 */
export function teamCalc(teamId: number, roster: RosterPlayer[], lineup: Lineup | undefined, live: LiveData | undefined, cfg: LeagueConfig, simulate: boolean, overrides: SimOverrides = {}): TeamCalc | null {
  if (!lineup || lineup.hidden) return null;
  const bySlot = new Map(roster.map((p) => [p.slot, p]));
  // In simulazione il fantavoto ipotetico è 6, come nel simulatore di Leghe Fantacalcio.
  const simCfg = simulate ? { ...cfg, baseVote: SIM_DEFAULT_VOTE } : cfg;
  const score = (slot: number): Named | null => {
    const p = bySlot.get(slot);
    if (!p) return null;
    const ev = p.ext_id ? live?.events[p.ext_id] : undefined;
    const st = p.ext_id ? live?.state[p.ext_id] ?? "pending" : "pending";
    let s = playerLiveScore(String(slot), p.role, ev, st, simCfg);
    if (simulate) s = applyOverride(s, overrides[simKey(teamId, slot)]);
    return { ...s, name: p.name };
  };
  const starters = lineup.starters.map(score).filter(Boolean) as Named[];
  const bench = lineup.bench.map(score).filter(Boolean) as Named[];
  const sc = computeTeam({
    module: lineup.module, starters, bench,
    captain: lineup.captain != null ? String(lineup.captain) : null,
    vice: lineup.vice != null ? String(lineup.vice) : null,
  }, cfg, simulate);
  return { lineup, starters, bench, score: sc };
}

export interface MatchCalc {
  home: TeamCalc | null;
  away: TeamCalc | null;
  /** Risultato con il regolamento, solo se entrambe le squadre hanno un punteggio (formazione o regola della lega). */
  result: MatchScore | null;
}

export function matchCalc(home: TeamCalc | null, away: TeamCalc | null, cfg: LeagueConfig): MatchCalc {
  const fallback = noLineupScore(cfg);
  const h: TeamScore | null = home?.score ?? fallback;
  const a: TeamScore | null = away?.score ?? fallback;
  return { home, away, result: h && a ? computeMatch(h, a, cfg) : null };
}

/** Partite del calendario di lega per la giornata di Serie A indicata. */
export function leagueMatches(calendar: CalendarRow[] | undefined, serieADay: number): CalendarRow[] {
  return (calendar ?? []).filter((c) => c.serie_a_day === serieADay);
}

export function myMatch(calendar: CalendarRow[] | undefined, serieADay: number, teamId: number | null | undefined): CalendarRow | null {
  if (!teamId) return null;
  return leagueMatches(calendar, serieADay).find((c) => c.home_team_id === teamId || c.away_team_id === teamId) ?? null;
}

/** Link a una ricerca di notizie esterna (nessun contenuto riprodotto nell'app). */
export function newsSearchUrl(playerName: string): string {
  return `https://www.google.com/search?tbm=nws&q=${encodeURIComponent(`${playerName} Serie A`)}`;
}
