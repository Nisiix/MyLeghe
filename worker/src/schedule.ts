// Calendario e classifica di Serie A da football-data.org (piano Free: 10 richieste/minuto).

import type { Env } from "./env";
import { fdGet } from "./sources";

export interface SaMatch {
  id: number;
  matchday: number;
  kickoff: number;
  status: string;
  home_id: number;
  away_id: number;
  home_name: string;
  away_name: string;
  home_tla: string | null;
  away_tla: string | null;
  score_home: number | null;
  score_away: number | null;
  ext_event_id: number | null;
}

export interface RoundBase {
  matchday: number;
  /** Primo calcio d'inizio: scadenza per inserire la formazione senza "modifica forzata". */
  deadline: number;
  /** Fine stimata dell'ultima partita (calcio d'inizio + 2 ore). */
  end: number;
  phase: "upcoming" | "live" | "finished";
  matches: SaMatch[];
}

export interface RoundInfo extends RoundBase {
  /** Giornata della formazione da inserire: la stessa, oppure la successiva quando questa è conclusa. */
  lineupMatchday: number;
  lineupDeadline: number;
}

/** Inizio del giorno (ora italiana) che contiene l'istante `t`. */
function romeDayStart(t: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date(t)).map((p) => [p.type, p.value]),
  );
  const secs = (Number(parts.hour) % 24) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  return t - secs * 1000 - (t % 1000);
}

/** La giornata conclusa resta quella in evidenza (finale) fino a tutto il giorno successivo all'ultima partita. */
export const keepUntil = (end: number) => romeDayStart(end) + 2 * 24 * 3600_000;

const FINISHED = new Set(["FINISHED", "AWARDED"]);
const LIVE = new Set(["IN_PLAY", "PAUSED", "LIVE"]);

async function kvGet(env: Env, key: string): Promise<{ value: string; updated_at: number } | null> {
  return env.DB.prepare("SELECT value, updated_at FROM kv WHERE key = ?").bind(key).first();
}
export async function kvSet(env: Env, key: string, value: unknown): Promise<void> {
  await env.DB.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(key, JSON.stringify(value), Date.now()).run();
}
export async function kvRead<T>(env: Env, key: string): Promise<{ value: T; updatedAt: number } | null> {
  const row = await kvGet(env, key);
  return row ? { value: JSON.parse(row.value) as T, updatedAt: row.updated_at } : null;
}

/** Aggiorna dalla fonte le partite di una giornata. */
export async function refreshMatchday(env: Env, matchday: number): Promise<void> {
  const r = await fdGet<{ matches: any[] }>(env, `/competitions/SA/matches?matchday=${matchday}`);
  const now = Date.now();
  const stmts = r.matches.map((m) =>
    env.DB.prepare(
      `INSERT INTO sa_matches (id, matchday, kickoff, status, home_id, away_id, home_name, away_name, home_tla, away_tla, score_home, score_away, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET matchday = excluded.matchday, kickoff = excluded.kickoff, status = excluded.status,
         score_home = excluded.score_home, score_away = excluded.score_away, updated_at = excluded.updated_at`,
    ).bind(
      m.id, m.matchday, Date.parse(m.utcDate), m.status, m.homeTeam.id, m.awayTeam.id,
      m.homeTeam.shortName ?? m.homeTeam.name, m.awayTeam.shortName ?? m.awayTeam.name,
      m.homeTeam.tla ?? null, m.awayTeam.tla ?? null,
      m.score?.fullTime?.home ?? null, m.score?.fullTime?.away ?? null, now,
    ));
  if (stmts.length) await env.DB.batch(stmts);
}

/** Giornata corrente secondo la fonte (aggiornata al massimo ogni 3 ore). */
export async function currentMatchday(env: Env, force = false): Promise<number> {
  const cached = await kvRead<number>(env, "fd:currentMatchday");
  if (cached && !force && Date.now() - cached.updatedAt < 3 * 3600_000) return cached.value;
  const r = await fdGet<{ currentSeason?: { currentMatchday?: number } }>(env, "/competitions/SA");
  const md = r.currentSeason?.currentMatchday ?? cached?.value ?? 1;
  await kvSet(env, "fd:currentMatchday", md);
  return md;
}

export async function matchesOf(env: Env, matchday: number): Promise<SaMatch[]> {
  const rows = await env.DB.prepare("SELECT * FROM sa_matches WHERE matchday = ? ORDER BY kickoff, id").bind(matchday).all<SaMatch>();
  return rows.results ?? [];
}

function roundInfo(matchday: number, matches: SaMatch[], now: number): RoundBase {
  const kickoffs = matches.map((m) => m.kickoff);
  const deadline = kickoffs.length ? Math.min(...kickoffs) : 0;
  const end = kickoffs.length ? Math.max(...kickoffs) + 2 * 3600_000 : 0;
  const allFinished = matches.length > 0 && matches.every((m) => FINISHED.has(m.status) || m.status === "POSTPONED" || m.status === "CANCELLED");
  const anyLive = matches.some((m) => LIVE.has(m.status));
  const phase = allFinished ? "finished" : anyLive || (deadline && now >= deadline) ? "live" : "upcoming";
  return { matchday, deadline, end, phase, matches };
}

/**
 * Giornata "attiva" per la lega: quella in corso, la prossima da giocare, oppure quella appena conclusa
 * finché resta in evidenza (fino a tutto il giorno successivo all'ultima partita). A giornata conclusa la
 * formazione da inserire è già quella della giornata successiva (`lineupMatchday`).
 */
export async function activeRound(env: Env): Promise<RoundInfo> {
  const now = Date.now();
  const load = async (md: number) => {
    let m = await matchesOf(env, md);
    if (!m.length) { await refreshMatchday(env, md); m = await matchesOf(env, md); }
    return m;
  };
  let md = await currentMatchday(env);
  let info: RoundBase | null = null;
  // La fonte può essere già passata alla giornata successiva: quella appena conclusa resta in evidenza.
  if (md > 1) {
    const prev = await matchesOf(env, md - 1);
    if (prev.length) {
      const pi = roundInfo(md - 1, prev, now);
      if (pi.phase === "finished" && now < keepUntil(pi.end)) info = pi;
    }
  }
  if (!info) {
    info = roundInfo(md, await load(md), now);
    if (info.phase === "finished" && md < 38 && now >= keepUntil(info.end)) {
      md += 1;
      info = roundInfo(md, await load(md), now);
    }
  }
  if (info.phase === "finished" && info.matchday < 38) {
    const next = roundInfo(info.matchday + 1, await load(info.matchday + 1), now);
    return { ...info, lineupMatchday: next.matchday, lineupDeadline: next.deadline };
  }
  return { ...info, lineupMatchday: info.matchday, lineupDeadline: info.deadline };
}

export interface SaStanding { team_id: number; name: string; tla: string | null; position: number; points: number; played: number }

export async function refreshStandings(env: Env): Promise<void> {
  const r = await fdGet<{ standings: { type: string; table: any[] }[] }>(env, "/competitions/SA/standings");
  const table = r.standings.find((s) => s.type === "TOTAL")?.table ?? [];
  const now = Date.now();
  if (!table.length) return;
  await env.DB.batch(table.map((t) =>
    env.DB.prepare(
      `INSERT INTO sa_standings (team_id, name, tla, position, points, played, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(team_id) DO UPDATE SET name = excluded.name, tla = excluded.tla, position = excluded.position,
         points = excluded.points, played = excluded.played, updated_at = excluded.updated_at`,
    ).bind(t.team.id, t.team.shortName ?? t.team.name, t.team.tla ?? null, t.position, t.points, t.playedGames, now)));
}

export async function standings(env: Env): Promise<SaStanding[]> {
  const rows = await env.DB.prepare("SELECT team_id, name, tla, position, points, played FROM sa_standings ORDER BY position").all<SaStanding>();
  return rows.results ?? [];
}

/** Correttivo avversario: fino a ±8% in base alla posizione in classifica, ±2% casa/trasferta. */
export function opponentFactor(opponentPosition: number | undefined, teams: number, home: boolean): number {
  let f = 1;
  if (opponentPosition && teams > 1) f += 0.08 * ((opponentPosition - 1) / (teams - 1) - 0.5) * 2;
  f += home ? 0.02 : -0.02;
  return Math.round(f * 1000) / 1000;
}
