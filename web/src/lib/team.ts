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
  return scorePlayers(roster.map((p) => ({ id: String(p.slot), name: p.name, role: p.role, cost: p.cost })), map, cfg)
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

/** Stato del giocatore per la prossima partita, in parole (indisponibile, in dubbio, probabile/ufficiale). */
/** Squadre di Serie A e B con il nome breve usato nell'app (ordine: i nomi contenuti in altri vengono dopo). */
const TEAM_SHORT = [
  "Inter", "Milan", "Juventus", "Napoli", "Roma", "Lazio", "Atalanta", "Fiorentina", "Bologna", "Torino", "Udinese", "Genoa",
  "Cagliari", "Verona", "Lecce", "Parma", "Como", "Sassuolo", "Cremonese", "Pisa", "Empoli", "Monza", "Venezia", "Salernitana",
  "Frosinone", "Sampdoria", "Spezia", "Brescia", "Palermo", "Bari", "Catanzaro", "Cesena", "Modena", "Reggiana", "Carrarese",
  "Cittadella", "Juve Stabia", "Mantova", "Cosenza", "Pescara", "Avellino", "Padova", "Entella", "Sudtirol",
];

/** Nome della squadra di Serie A ripulito (via sigle, anni e caratteri strani): «Hellas Verona FC» → «Verona». */
export function prettyTeam(raw?: string | null): string {
  if (!raw) return "";
  const clean = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const low = clean.toLowerCase();
  const hit = TEAM_SHORT.find((t) => low.includes(t.toLowerCase()));
  if (hit) return hit;
  const words = clean.split(" ").filter((w) => !/^(fc|ac|as|ss|ssc|us|uc|sc|calcio|hellas|\d{4})$/i.test(w));
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ") || clean;
}

/** Solo la disponibilità (infortunio, squalifica, dubbio): la probabilità di giocare è già nella percentuale di titolarità. */
export function availabilityText(o?: Outlook): string {
  if (!o) return "Non abbinato alla fonte dati";
  if (o.unavailable === "injury") return "Infortunato";
  if (o.unavailable === "suspension") return "Squalificato";
  if (o.unavailable) return "Indisponibile";
  if (o.doubtful) return "In dubbio";
  return "";
}

/** Dettaglio dell'indisponibilità: motivo e rientro previsto, oppure l'avviso che non si conoscono. */
export function injuryDetail(o: Outlook): string {
  const parts: string[] = [];
  if (o.reason) parts.push(o.reason);
  if (o.expectedReturn) parts.push(`rientro previsto ${formatReturn(o.expectedReturn)}`);
  if (!parts.length) return "Al momento non si conoscono i dettagli dell'infortunio o i tempi di recupero.";
  return parts.join(" · ") + ".";
}

function formatReturn(v: string): string {
  const t = Date.parse(v);
  return Number.isNaN(t) ? v : new Date(t).toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

export function outlookStatus(o?: Outlook): string {
  if (!o) return "Non abbinato alla fonte dati";
  if (o.unavailable === "injury") return "Infortunato";
  if (o.unavailable === "suspension") return "Squalificato";
  if (o.unavailable) return "Indisponibile";
  if (o.doubtful) return "In dubbio";
  if (o.confirmed && o.predicted === "starter") return "Titolare ufficiale";
  if (o.confirmed && o.predicted === "bench") return "In panchina (ufficiale)";
  if (o.predicted === "starter") return "Probabile titolare";
  if (o.predicted === "bench") return "Probabile panchina";
  return "";
}
