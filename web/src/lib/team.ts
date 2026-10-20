// Unione di rosa importata, stima di titolarità e calcolo live per una squadra.

import {
  goalsFromPoints, playerLiveScore, projectTeam, scorePlayers,
  type LeagueConfig, type PlayerLiveScore, type ScoredPlayer, type TeamProjection,
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

export interface TeamLive {
  starters: (PlayerLiveScore & { name: string })[];
  bench: (PlayerLiveScore & { name: string })[];
  /** Totale con i soli voti già arrivati (chi deve giocare vale 0). */
  partial: number;
  /** Proiezione: chi deve giocare vale il voto base della lega (come "Simula risultato"). */
  projection: TeamProjection;
}

export function teamLive(roster: RosterPlayer[], lineup: Lineup | undefined, live: LiveData | undefined, cfg: LeagueConfig): TeamLive | null {
  if (!lineup || lineup.hidden) return null;
  const bySlot = new Map(roster.map((p) => [p.slot, p]));
  const score = (slot: number) => {
    const p = bySlot.get(slot);
    if (!p) return null;
    const ev = p.ext_id ? live?.events[p.ext_id] : undefined;
    const st = p.ext_id ? live?.state[p.ext_id] ?? "pending" : "pending";
    return { ...playerLiveScore(String(slot), p.role, ev, st, cfg), name: p.name };
  };
  const starters = lineup.starters.map(score).filter(Boolean) as TeamLive["starters"];
  const bench = lineup.bench.map(score).filter(Boolean) as TeamLive["bench"];
  const partial = Math.round(starters.reduce((s, p) => s + (p.state === "played" ? p.fantavote ?? 0 : 0), 0) * 100) / 100;
  return { starters, bench, partial, projection: projectTeam(starters, bench, cfg) };
}

export const goals = (points: number, cfg: LeagueConfig) => goalsFromPoints(points, cfg);

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
