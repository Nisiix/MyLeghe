// Dati aggregati per l'app: giornata attiva, titolarità stimata e dati live dei giocatori delle rose.

import { calibratedVote, fantavote, starterProbability, statVote, type Calibration, type LeagueConfig, type MatchEvents, type PlayerStats, type Role, type VoteContext } from "@footballlite/core";
import { Hono } from "hono";
import { requireSession, type AppEnv } from "./auth";
import type { Env } from "./env";
import { loadConfig } from "./league";
import { activeRound, kvRead, matchesOf, opponentFactor, standings, type SaMatch } from "./schedule";

/** Sigla a tre lettere in maiuscolo (dalla fonte, altrimenti dalle prime lettere del nome). */
const tla = (t: string | null, name: string | null) => (t ?? (name ?? "").replace(/[^A-Za-z]/g, "").slice(0, 3)).toUpperCase();
import { HISTORY_ROUNDS } from "./sync";

export const outlook = new Hono<AppEnv>();
outlook.use("/league/round", requireSession);
outlook.use("/league/outlook", requireSession);
outlook.use("/league/live/*", requireSession);

const stateOf = (m: SaMatch | undefined): "pending" | "live" | "finished" => {
  if (!m) return "pending";
  if (["FINISHED", "AWARDED"].includes(m.status)) return "finished";
  if (["IN_PLAY", "PAUSED", "LIVE"].includes(m.status) || Date.now() >= m.kickoff) {
    return Date.now() - m.kickoff > 2.5 * 3600_000 ? "finished" : "live";
  }
  return "pending";
};

outlook.get("/league/round", async (c) => {
  const info = await activeRound(c.env);
  return c.json({ ...info, now: Date.now() });
});

interface PmRow extends Record<string, number | string | null> {
  player_id: number; event_id: number; matchday: number; started: number; minutes: number; goals: number; assists: number; yellow: number; red: number;
  pen_scored: number; pen_missed: number; pen_saved: number; own_goals: number; conceded: number; rating: number | null; stats: string | null;
}

const toEvents = (r: PmRow): MatchEvents => ({
  minutes: r.minutes, goals: r.goals, assists: r.assists, yellow: r.yellow, red: r.red,
  penaltyScored: r.pen_scored, penaltyMissed: r.pen_missed, penaltySaved: r.pen_saved,
  ownGoals: r.own_goals, goalsConceded: r.conceded, rating: r.rating,
  stats: typeof r.stats === "string" ? (JSON.parse(r.stats) as PlayerStats) : null,
});

export interface PlayerOutlookOut {
  starterPercent: number;
  unavailable: string | null;
  /** Motivo e rientro previsto dell'indisponibilità, quando la fonte li fornisce. */
  reason: string | null;
  expectedReturn: string | null;
  statusUpdatedAt: number | null;
  doubtful: boolean;
  predicted: string | null;
  confirmed: boolean;
  recentStarts: boolean[];
  avgFantavote: number | null;
  opponentFactor: number;
  opponent: string | null;
  fixture: string | null;
  kickoff: number | null;
  matchState: "pending" | "live" | "finished";
}

/** Per ogni giocatore abbinato delle rose della lega: titolarità stimata e informazioni sulla prossima partita. */
export async function computeOutlook(env: Env, leagueId: string): Promise<{ matchday: number; players: Record<number, PlayerOutlookOut> }> {
  const cfg: LeagueConfig = await loadConfig(env.DB, leagueId);
  const active = await activeRound(env);
  // Titolarità e prossima partita per la giornata della formazione da inserire (la successiva, se quella attiva è conclusa).
  const info = { matchday: active.lineupMatchday, matches: active.lineupMatchday === active.matchday ? active.matches : await matchesOf(env, active.lineupMatchday) };
  const roster = await env.DB.prepare(
    `SELECT DISTINCT r.ext_id, r.role, p.team_ext_id FROM roster r JOIN teams t ON t.id = r.team_id LEFT JOIN players p ON p.id = r.ext_id
     WHERE t.league_id = ? AND r.ext_id IS NOT NULL`,
  ).bind(leagueId).all<{ ext_id: number; role: Role; team_ext_id: number | null }>();
  const ids = (roster.results ?? []).map((r) => r.ext_id);
  if (!ids.length) return { matchday: info.matchday, players: {} };

  const inList = ids.join(",");
  const [status, history] = await Promise.all([
    env.DB.prepare(`SELECT * FROM player_status WHERE matchday = ? AND player_id IN (${inList})`).bind(info.matchday).all<any>(),
    env.DB.prepare(`SELECT * FROM player_match WHERE player_id IN (${inList}) AND matchday < ? ORDER BY matchday DESC`).bind(info.matchday).all<PmRow>(),
  ]);
  const statusBy = new Map((status.results ?? []).map((r) => [r.player_id as number, r]));
  const histBy = new Map<number, PmRow[]>();
  for (const h of history.results ?? []) histBy.set(h.player_id, [...(histBy.get(h.player_id) ?? []), h]);

  const table = await standings(env);
  const teamMap = (await kvRead<Record<number, number>>(env, "teammap"))?.value ?? {};
  const players: Record<number, PlayerOutlookOut> = {};

  for (const r of roster.results ?? []) {
    const st = statusBy.get(r.ext_id);
    const hist = histBy.get(r.ext_id) ?? [];
    // Senza alcuna partita nello storico (fonte non ancora sincronizzata per lui) la titolarità recente è sconosciuta,
    // non "mai titolare": la stima resta neutra invece di scendere a 0%.
    const recentStarts: boolean[] = [];
    if (hist.length) for (let md = info.matchday - 1; md >= Math.max(1, info.matchday - HISTORY_ROUNDS); md--) recentStarts.push(hist.some((h) => h.matchday === md && h.started === 1));
    const played = hist.filter((h) => h.minutes > 0);
    const avgFantavote = played.length
      ? played.reduce((a, h) => a + fantavote(toEvents(h), r.role, cfg, true).fantavote, 0) / played.length
      : null;

    const fdTeam = r.team_ext_id ? teamMap[r.team_ext_id] : undefined;
    const match = fdTeam ? info.matches.find((m) => m.home_id === fdTeam || m.away_id === fdTeam) : undefined;
    const home = match ? match.home_id === fdTeam : true;
    const oppId = match ? (home ? match.away_id : match.home_id) : undefined;
    const oppPos = table.find((t) => t.team_id === oppId)?.position;
    const factor = match ? opponentFactor(oppPos, table.length, home) : 1;
    const outlook = {
      recentStarts,
      unavailable: st?.unavailable ?? null,
      doubtful: !!st?.doubtful,
      predicted: st?.predicted ?? null,
      confirmed: !!st?.confirmed,
      avgFantavote,
      opponentFactor: factor,
    };
    players[r.ext_id] = {
      ...outlook,
      reason: st?.reason ?? null,
      expectedReturn: st?.expected_return ?? null,
      statusUpdatedAt: st?.updated_at ?? null,
      starterPercent: starterProbability(outlook),
      opponent: match ? `${home ? "vs" : "@"} ${(home ? match.away_tla : match.home_tla) ?? (home ? match.away_name : match.home_name)}` : null,
      // Sigle Serie A delle due squadre della partita, casa-trasferta (es. "INT-JUV").
      fixture: match ? `${tla(match.home_tla, match.home_name)}-${tla(match.away_tla, match.away_name)}` : null,
      kickoff: match?.kickoff ?? null,
      matchState: stateOf(match),
    };
  }
  return { matchday: info.matchday, players };
}

outlook.get("/league/outlook", async (c) => c.json(await computeOutlook(c.env, c.get("session").lid)));

/** Eventi della giornata per i giocatori delle rose (per il live e "Simula"). */
outlook.get("/league/live/:round", async (c) => {
  const s = c.get("session");
  const cal = (await kvRead<Calibration>(c.env, `calib:${s.lid}`))?.value ?? null;
  return c.json(await liveRound(c.env, s.lid, Number(c.req.param("round")), cal));
});

export type LiveState = "pending" | "live" | "finished";

/**
 * Eventi e stato della giornata per i giocatori delle rose della lega, con il voto statistico normalizzato.
 * `calibration`: correzione stimata dai risultati ufficiali della lega (null = voti del modello senza correzione).
 */
export async function liveRound(env: Env, lid: string, round: number, calibration: Calibration | null) {
  const rows = await env.DB.prepare(
    `SELECT pm.* FROM player_match pm WHERE pm.matchday = ? AND pm.player_id IN
       (SELECT r.ext_id FROM roster r JOIN teams t ON t.id = r.team_id WHERE t.league_id = ? AND r.ext_id IS NOT NULL)`,
  ).bind(round, lid).all<PmRow>();
  const matches = await env.DB.prepare("SELECT * FROM sa_matches WHERE matchday = ? ORDER BY kickoff").bind(round).all<SaMatch>();
  const teamMap = (await kvRead<Record<number, number>>(env, "teammap"))?.value ?? {};
  const players = await env.DB.prepare(
    `SELECT p.id, p.team_ext_id FROM players p WHERE p.id IN
       (SELECT r.ext_id FROM roster r JOIN teams t ON t.id = r.team_id WHERE t.league_id = ? AND r.ext_id IS NOT NULL)`,
  ).bind(lid).all<{ id: number; team_ext_id: number | null }>();
  const ms = matches.results ?? [];
  const state: Record<number, LiveState> = {};
  for (const p of players.results ?? []) {
    const fd = p.team_ext_id ? teamMap[p.team_ext_id] : undefined;
    state[p.id] = stateOf(ms.find((m) => m.home_id === fd || m.away_id === fd));
  }
  // Voto statistico per ogni giocatore delle rose, con il suo ruolo nella lega e il contesto della sua partita.
  const roles = await env.DB.prepare(
    "SELECT DISTINCT r.ext_id, r.role FROM roster r JOIN teams t ON t.id = r.team_id WHERE t.league_id = ? AND r.ext_id IS NOT NULL",
  ).bind(lid).all<{ ext_id: number; role: Role }>();
  const roleOf = new Map((roles.results ?? []).map((r) => [r.ext_id, r.role]));
  const teamOf = new Map((players.results ?? []).map((p) => [p.id, p.team_ext_id]));
  // Gol di ogni squadra in ogni partita dalle statistiche dei giocatori (gol, rigori e autogol degli avversari):
  // seguono il live più da vicino del risultato del calendario, che si aggiorna meno spesso.
  const goals = await env.DB.prepare(
    `SELECT pm.event_id, p.team_ext_id AS team, SUM(pm.goals + pm.pen_scored) AS scored, SUM(pm.own_goals) AS own
     FROM player_match pm JOIN players p ON p.id = pm.player_id WHERE pm.matchday = ? GROUP BY pm.event_id, p.team_ext_id`,
  ).bind(round).all<{ event_id: number; team: number | null; scored: number; own: number }>();
  const byEvent = new Map<number, { team: number | null; scored: number; own: number }[]>();
  for (const g of goals.results ?? []) byEvent.set(g.event_id, [...(byEvent.get(g.event_id) ?? []), g]);
  const contextOf = (r: PmRow): VoteContext => {
    const m = ms.find((x) => x.ext_event_id === r.event_id);
    const bsdTeam = teamOf.get(r.player_id);
    const fd = bsdTeam ? teamMap[bsdTeam] : undefined;
    if (!m || !fd || (fd !== m.home_id && fd !== m.away_id)) return {};
    const home = fd === m.home_id;
    const sides = byEvent.get(r.event_id) ?? [];
    const mine = sides.find((g) => g.team === bsdTeam), other = sides.find((g) => g.team !== bsdTeam);
    if (mine && other) return { home, teamGoals: mine.scored + other.own, oppGoals: other.scored + mine.own };
    return { home, teamGoals: home ? m.score_home : m.score_away, oppGoals: home ? m.score_away : m.score_home };
  };
  const events: Record<number, MatchEvents> = {};
  for (const r of rows.results ?? []) {
    const stats: PlayerStats = { ...(r.stats ? (JSON.parse(r.stats) as PlayerStats) : {}), minutes_played: r.minutes, rating: r.rating };
    const v = statVote(stats, roleOf.get(r.player_id) ?? 3, contextOf(r));
    events[r.player_id] = { ...toEvents(r), statVote: v ? calibratedVote(v.raw, calibration) : null };
  }
  return {
    round,
    matches: ms.map((m) => ({ id: m.id, kickoff: m.kickoff, status: m.status, home: m.home_name, away: m.away_name, score: m.score_home === null ? null : [m.score_home, m.score_away], state: stateOf(m) })),
    state: state as Record<number, LiveState>,
    events,
  };
}
