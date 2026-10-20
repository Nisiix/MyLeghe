// Sincronizzazione dei dati con licenza (BSD e football-data.org), distribuita nella giornata dal cron.

import { normalizeName, subRolesFromLineup } from "@footballlite/core";
import type { Env } from "./env";
import { rematchUnmatched } from "./matching";
import { activeRound, kvRead, kvSet, matchesOf, refreshMatchday, refreshStandings, type SaMatch } from "./schedule";
import { BSD_SERIE_A, bsdGet, bsdList, quotaUsed, BSD_DAILY_BUDGET, CallCapError, SourceError } from "./sources";
import { sourcesAccepted } from "./terms";

const MIN = 60_000, HOUR = 3600_000;
/** Intervallo di aggiornamento di statistiche e risultati durante le partite (il cron gira ogni 5 minuti). */
const LIVE_EVERY = 5 * MIN - 30_000;
/** Richieste BSD massime per singola esecuzione del cron (ogni 5 minuti). */
const RUN_CAP = 40;
/** Richieste esterne massime per esecuzione (BSD + football-data.org): il piano Free di Cloudflare ne consente 50. */
const MAX_EXTERNAL_CALLS = 45;
/** Giornate passate usate per la titolarità recente. */
export const HISTORY_ROUNDS = 5;

const POSITION_ROLE: Record<string, number> = { G: 1, D: 2, M: 3, F: 4 };

interface Budget { left: number }

/**
 * Aggiornamento di una singola partita: un errore temporaneo della fonte (5xx) la salta senza segnarla
 * come aggiornata, così si riprova all'esecuzione successiva e le altre partite proseguono.
 */
async function perMatch(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof SourceError && e.status >= 500)) throw e;
    console.warn("sync", e.message);
  }
}

async function due(env: Env, key: string, everyMs: number): Promise<boolean> {
  const last = await kvRead<number>(env, key);
  return !last || Date.now() - last.updatedAt >= everyMs;
}

export async function seasonId(env: Env): Promise<number> {
  const cached = await kvRead<number>(env, "bsd:season");
  if (cached && Date.now() - cached.updatedAt < 24 * HOUR) return cached.value;
  const r = await bsdGet<{ season: { id: number } | null }>(env, `/leagues/${BSD_SERIE_A}/season/`);
  if (!r.season) throw new Error("BSD: stagione di Serie A non disponibile");
  await kvSet(env, "bsd:season", r.season.id);
  return r.season.id;
}

/**
 * Rose delle 20 squadre di Serie A, una volta al giorno (1 + 20 richieste). Si procede a blocchi:
 * le squadre già aggiornate oggi sono salvate, così un'esecuzione interrotta riprende da quelle mancanti.
 */
export async function syncPlayers(env: Env, budget: Budget): Promise<void> {
  if (budget.left < 2) return;
  const day = new Date().toISOString().slice(0, 10);
  type Team = { id: number; name: string; short_name: string | null };
  let teams = (await kvRead<{ day: string; teams: Team[] }>(env, "bsd:teams"))?.value;
  if (teams?.day !== day) {
    const sid = await seasonId(env);
    // Senza limit/offset: su /teams/ BSD risponde 502 se si passa "limit" (le 20 squadre stanno in una pagina).
    const r = await bsdGet<{ results?: Team[] }>(env, `/teams/?league_id=${BSD_SERIE_A}&season_id=${sid}`);
    teams = { day, teams: r.results ?? [] };
    budget.left--;
    await kvSet(env, "bsd:teams", teams);
  }
  const prog = (await kvRead<{ day: string; done: number[] }>(env, "bsd:playersProgress"))?.value;
  const done = new Set(prog?.day === day ? prog.done : []);
  const now = Date.now();
  try {
    for (const t of teams.teams) {
      if (done.has(t.id)) continue;
      if (budget.left < 1) break;
      const squad = await bsdGet<{ players: { id: number; name: string; short_name: string | null; position: string }[] }>(env, `/teams/${t.id}/squad/`);
      budget.left--;
      const stmts = squad.players.map((p) =>
        env.DB.prepare(
          `INSERT INTO players (id, name, short_name, role, team_name, team_ext_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, short_name = excluded.short_name, role = excluded.role,
             team_name = excluded.team_name, team_ext_id = excluded.team_ext_id, updated_at = excluded.updated_at`,
        ).bind(p.id, p.name, p.short_name, POSITION_ROLE[p.position] ?? null, t.short_name ?? t.name, t.id, now));
      if (stmts.length) await env.DB.batch(stmts);
      done.add(t.id);
    }
  } finally {
    await kvSet(env, "bsd:playersProgress", { day, done: [...done] });
  }
  if (teams.teams.every((t) => done.has(t.id))) {
    await kvSet(env, "bsd:playersDay", day);
    // Giocatori aggiornati: le rose importate prima (o con nomi nuovi) vengono riabbinate senza intervento dell'admin.
    const r = await rematchUnmatched(env.DB);
    if (r.checked) console.log(`riabbinati ${r.matched}/${r.checked} giocatori delle rose`);
  }
}

const sameTeam = (a: string, b: string) => {
  const x = normalizeName(a).replace(/\b(fc|ac|as|ss|us|calcio|bc|hellas)\b/g, "").trim();
  const y = normalizeName(b).replace(/\b(fc|ac|as|ss|us|calcio|bc|hellas)\b/g, "").trim();
  return !!x && !!y && (x.includes(y) || y.includes(x));
};

/** Abbina le partite football-data.org della giornata agli eventi BSD (orario + nomi delle squadre). */
export async function mapRoundEvents(env: Env, matchday: number, budget: Budget): Promise<void> {
  const matches = await matchesOf(env, matchday);
  if (!matches.length || matches.every((m) => m.ext_event_id)) return;
  const sid = await seasonId(env);
  const events = await bsdList<any>(env, `/events/?league_id=${BSD_SERIE_A}&season_id=${sid}&stage=regular-season&round=${matchday}`, 1);
  budget.left--;
  const teamMap: Record<number, number> = (await kvRead<Record<number, number>>(env, "teammap"))?.value ?? {};
  const stmts = [];
  for (const m of matches) {
    const e = events.find((ev) => sameTeam(ev.home_team, m.home_name) && sameTeam(ev.away_team, m.away_name))
      ?? events.find((ev) => Math.abs(Date.parse(ev.event_date) - m.kickoff) < 10 * MIN && (sameTeam(ev.home_team, m.home_name) || sameTeam(ev.away_team, m.away_name)));
    if (!e) continue;
    teamMap[e.home_team_id] = m.home_id;
    teamMap[e.away_team_id] = m.away_id;
    stmts.push(env.DB.prepare("UPDATE sa_matches SET ext_event_id = ? WHERE id = ?").bind(e.id, m.id));
  }
  if (stmts.length) await env.DB.batch(stmts);
  await kvSet(env, "teammap", teamMap);
}

/** Formazione probabile/ufficiale e indisponibili di una partita. */
export async function syncLineups(env: Env, m: SaMatch, budget: Budget): Promise<boolean> {
  if (!m.ext_event_id || budget.left < 1) return false;
  const r = await bsdGet<any>(env, `/events/${m.ext_event_id}/lineups/`);
  budget.left--;
  const now = Date.now();
  const confirmed = r.lineup_status === "confirmed" ? 1 : 0;
  type Row = { unavailable: string | null; doubtful: number; predicted: string | null; subRole: string | null; reason: string | null; expectedReturn: string | null };
  const rows = new Map<number, Row>();
  const set = (id: number | null, patch: Partial<Row>) => {
    if (!id) return;
    rows.set(id, { unavailable: null, doubtful: 0, predicted: null, subRole: null, reason: null, expectedReturn: null, ...rows.get(id), ...patch });
  };
  // Motivo e rientro previsto: i nomi dei campi variano tra le fonti, si prendono quelli presenti.
  const text = (...v: unknown[]) => { const x = v.find((y) => typeof y === "string" && y.trim()); return x ? String(x).trim().slice(0, 120) : null; };
  const detail = (u: any) => ({ reason: text(u.reason, u.injury, u.injury_type, u.description, u.details, u.note), expectedReturn: text(u.expected_return, u.expected_return_date, u.estimated_return, u.return_date, u.expected_return_at) });
  for (const side of ["home", "away"] as const) {
    const l = r.lineups?.[side];
    // Posizione in campo dei titolari dal modulo (es. 3-4-3) e dall'ordine della formazione.
    const subRoles = subRolesFromLineup(l?.formation, (l?.players ?? []) as { id: number }[]);
    for (const p of l?.players ?? []) set(p.id, { predicted: "starter", subRole: subRoles.get(p) ?? null });
    for (const p of l?.substitutes ?? []) set(p.id, { predicted: "bench" });
    for (const u of r.unavailable_players?.[side] ?? []) {
      if (u.status === "doubtful") set(u.id, { doubtful: 1, ...detail(u) });
      else set(u.id, { unavailable: u.status === "suspended" ? "suspension" : u.status === "injured" ? "injury" : "other", ...detail(u) });
    }
  }
  const stmts = [...rows].map(([id, v]) =>
    env.DB.prepare(
      `INSERT INTO player_status (player_id, matchday, unavailable, doubtful, predicted, confirmed, sub_role, reason, expected_return, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(player_id, matchday) DO UPDATE SET unavailable = excluded.unavailable, doubtful = excluded.doubtful,
         predicted = excluded.predicted, confirmed = excluded.confirmed, sub_role = excluded.sub_role, reason = excluded.reason,
         expected_return = excluded.expected_return, updated_at = excluded.updated_at`,
    ).bind(id, m.matchday, v.unavailable, v.doubtful, v.predicted, confirmed, v.subRole, v.reason, v.expectedReturn, now));
  if (stmts.length) await env.DB.batch(stmts);
  return confirmed === 1;
}

/**
 * Statistiche per giocatore e cronaca di una partita (in corso o finita).
 * Dalla cronaca: rigori segnati/sbagliati, autogol; dalle statistiche: minuti, gol, assist, cartellini, gol subiti, rating.
 */
export async function syncMatchStats(env: Env, m: SaMatch, budget: Budget): Promise<void> {
  if (!m.ext_event_id || budget.left < 3) return;
  const stats = await bsdGet<{ player_stats: any[] }>(env, `/events/${m.ext_event_id}/player-stats/`);
  const comm = await bsdGet<{ results?: any[]; commentary?: any[] } | any[]>(env, `/events/${m.ext_event_id}/commentary/`);
  budget.left -= 2;
  const lines: any[] = Array.isArray(comm) ? comm : comm.results ?? comm.commentary ?? [];
  const count = (type: string) => {
    const c = new Map<number, number>();
    for (const l of lines) if (l.type === type && l.player?.id) c.set(l.player.id, (c.get(l.player.id) ?? 0) + 1);
    return c;
  };
  const penGoals = count("penalty_goal"), ownGoals = count("own_goal"), penMissed = count("penalty_missed");

  // Chi entra dalla panchina prende la posizione in campo di chi esce (in ordine di minuto, anche a catena).
  const subs = lines.filter((l) => l.type === "substitution" && l.player?.id && l.related_player?.id)
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
  if (subs.length) {
    const known = await env.DB.prepare("SELECT player_id, sub_role FROM player_status WHERE matchday = ? AND sub_role IS NOT NULL")
      .bind(m.matchday).all<{ player_id: number; sub_role: string }>();
    const pos = new Map((known.results ?? []).map((r) => [r.player_id, r.sub_role]));
    const inherited: [number, string][] = [];
    for (const s of subs) {
      const from = pos.get(s.player.id);
      if (from && !pos.has(s.related_player.id)) { pos.set(s.related_player.id, from); inherited.push([s.related_player.id, from]); }
    }
    if (inherited.length) await env.DB.batch(inherited.map(([id, role]) => env.DB.prepare(
      `INSERT INTO player_status (player_id, matchday, sub_role, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(player_id, matchday) DO UPDATE SET sub_role = COALESCE(player_status.sub_role, excluded.sub_role)`,
    ).bind(id, m.matchday, role, Date.now())));
  }

  // Rigori parati: solo se in cronaca c'è un rigore sbagliato, si chiede chi l'ha parato agli incidenti.
  const penSaved = new Map<number, number>();
  if (penMissed.size && budget.left > 0) {
    const inc = await bsdGet<{ incidents: any[] }>(env, `/events/${m.ext_event_id}/incidents/`);
    budget.left--;
    for (const i of inc.incidents ?? []) {
      if (i.type !== "penalty_missed" || i.reason !== "saved") continue;
      // Il portiere della squadra opposta al rigorista con più minuti giocati.
      const keeper = stats.player_stats
        .filter((p) => p.team_id !== stats.player_stats.find((x) => x.player_id === i.player_id)?.team_id && p.saves !== undefined && p.goals_conceded !== undefined)
        .sort((a, b) => (b.saves ?? 0) - (a.saves ?? 0))[0];
      if (keeper) penSaved.set(keeper.player_id, (penSaved.get(keeper.player_id) ?? 0) + 1);
    }
  }

  const starters = await env.DB.prepare("SELECT player_id FROM player_status WHERE matchday = ? AND confirmed = 1 AND predicted = 'starter'").bind(m.matchday).all<{ player_id: number }>();
  const startedSet = new Set((starters.results ?? []).map((r) => r.player_id));
  const now = Date.now();
  const stmts = stats.player_stats.map((p) => {
    const pg = penGoals.get(p.player_id) ?? 0;
    return env.DB.prepare(
      `INSERT INTO player_match (event_id, player_id, matchday, started, minutes, goals, assists, yellow, red, pen_scored, pen_missed, pen_saved, own_goals, conceded, rating, stats, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_id, player_id) DO UPDATE SET started = excluded.started, minutes = excluded.minutes, goals = excluded.goals,
         assists = excluded.assists, yellow = excluded.yellow, red = excluded.red, pen_scored = excluded.pen_scored,
         pen_missed = excluded.pen_missed, pen_saved = excluded.pen_saved, own_goals = excluded.own_goals,
         conceded = excluded.conceded, rating = excluded.rating, stats = excluded.stats, updated_at = excluded.updated_at`,
    ).bind(
      m.ext_event_id, p.player_id, m.matchday, startedSet.has(p.player_id) ? 1 : 0, p.minutes_played ?? 0,
      Math.max(0, (p.goals ?? 0) - pg), p.goal_assist ?? 0, p.yellow_card ?? 0, p.red_card ?? 0, pg,
      penMissed.get(p.player_id) ?? 0, penSaved.get(p.player_id) ?? 0, ownGoals.get(p.player_id) ?? 0,
      p.goals_conceded ?? 0, p.rating ?? null, JSON.stringify(pickStats(p)), now,
    );
  });
  if (stmts.length) await env.DB.batch(stmts);
}

/** Un passaggio del cron: decide cosa aggiornare in base al momento della giornata e al budget. */
export async function runSync(baseEnv: Env): Promise<{ used: number; calls: number; partial?: boolean; skipped?: string }> {
  // Nessuna richiesta alle fonti finché chi gestisce l'installazione non ne accetta i termini.
  if (!(await sourcesAccepted(baseEnv))) return { used: 0, calls: 0, skipped: "termini delle fonti non accettati" };
  const env: Env = { ...baseEnv, calls: { n: 0, cap: MAX_EXTERNAL_CALLS } };
  const before = await quotaUsed(env);
  const budget: Budget = { left: Math.min(RUN_CAP, BSD_DAILY_BUDGET - before) };
  let partial = false;
  try {
    await syncSteps(env, budget);
  } catch (e) {
    // Tetto di richieste raggiunto: quanto fatto è salvato, il resto alla prossima esecuzione del cron.
    if (!(e instanceof CallCapError)) throw e;
    partial = true;
  }
  return { used: (await quotaUsed(env)) - before, calls: env.calls!.n, ...(partial ? { partial } : {}) };
}

async function syncSteps(env: Env, budget: Budget): Promise<void> {
  const now = Date.now();

  // Orari, risultati e stato delle partite: ogni 5 minuti mentre si gioca (per chiudere presto le partite finite), altrimenti ogni 30.
  const round = await activeRound(env);
  const playing = round.matches.some((m) => m.kickoff <= now && now - m.kickoff < 2.5 * HOUR && !["FINISHED", "AWARDED"].includes(m.status));
  if (await due(env, "sync:fdMatches", playing ? LIVE_EVERY : 30 * MIN)) {
    await refreshMatchday(env, round.matchday);
    if (round.lineupMatchday !== round.matchday) await refreshMatchday(env, round.lineupMatchday);
    await kvSet(env, "sync:fdMatches", now);
  }
  if (await due(env, "sync:fdStandings", 6 * HOUR)) { await refreshStandings(env); await kvSet(env, "sync:fdStandings", now); }

  const day = new Date().toISOString().slice(0, 10);
  if ((await kvRead<string>(env, "bsd:playersDay"))?.value !== day) await syncPlayers(env, budget);

  const info = await activeRound(env);
  // Giornate da seguire: quella attiva e, se è conclusa, anche quella della formazione da inserire.
  const rounds = info.lineupMatchday !== info.matchday ? [info.matchday, info.lineupMatchday] : [info.matchday];
  if (await due(env, "sync:map", 3 * HOUR) || info.matches.some((m) => !m.ext_event_id)) {
    for (const md of rounds) await mapRoundEvents(env, md, budget);
    await kvSet(env, "sync:map", now);
  }
  const matches: SaMatch[] = [];
  for (const md of rounds) matches.push(...(await matchesOf(env, md)));

  for (const m of matches) {
    if (budget.left <= 0) break;
    await perMatch(async () => {
      const toKick = m.kickoff - now;
      const key = `sync:lineup:${m.id}`;
      const state = await kvRead<{ confirmed: boolean }>(env, key);
      if (toKick > 0 && !state?.value.confirmed) {
        // Lontano dalla partita ogni 3 ore, nell'ultima ora e mezza ogni 10 minuti finché non è ufficiale.
        const every = toKick < 90 * MIN ? 10 * MIN : 3 * HOUR;
        if (toKick < 7 * 24 * HOUR && (!state || now - state.updatedAt >= every)) {
          const confirmed = await syncLineups(env, m, budget);
          await kvSet(env, key, { confirmed });
        }
      } else if (toKick <= 0 && now - m.kickoff < 2.5 * HOUR) {
        // In corso: statistiche e cronaca ogni 5 minuti (prima la formazione ufficiale, se manca).
        if (!state?.value.confirmed) await kvSet(env, key, { confirmed: await syncLineups(env, m, budget) });
        if (await due(env, `sync:live:${m.id}`, LIVE_EVERY)) { await syncMatchStats(env, m, budget); await kvSet(env, `sync:live:${m.id}`, now); }
      } else if (toKick <= 0 && !(await kvRead<boolean>(env, `sync:final:${m.id}`))) {
        // Finita: ultimo aggiornamento definitivo.
        if (!state?.value.confirmed) await syncLineups(env, m, budget);
        await syncMatchStats(env, m, budget);
        await kvSet(env, `sync:final:${m.id}`, true);
      }
    });
  }

  // Indisponibili: una verifica al giorno sulle partite della giornata della formazione, anche se lontane.
  const dayKey = `sync:injuries:${day}`;
  if (!(await kvRead<boolean>(env, dayKey)) && budget.left > 10) {
    for (const m of await matchesOf(env, info.lineupMatchday)) {
      if (!m.ext_event_id || m.kickoff <= now || budget.left <= 10) continue;
      await perMatch(async () => { const confirmed = await syncLineups(env, m, budget); await kvSet(env, `sync:lineup:${m.id}`, { confirmed }); });
    }
    await kvSet(env, dayKey, true);
  }

  // Storico per la titolarità recente: giornate passate, poche partite per volta.
  for (let md = info.matchday - 1; md >= Math.max(1, info.matchday - HISTORY_ROUNDS) && budget.left > 4; md--) {
    let past = await matchesOf(env, md);
    if (!past.length) { await refreshMatchday(env, md); past = await matchesOf(env, md); }
    if (past.some((m) => !m.ext_event_id)) await mapRoundEvents(env, md, budget);
    past = await matchesOf(env, md);
    for (const m of past) {
      if (budget.left <= 4) break;
      if (!m.ext_event_id || (await kvRead<boolean>(env, `sync:final:${m.id}`))) continue;
      await perMatch(async () => {
        await syncLineups(env, m, budget);
        await syncMatchStats(env, m, budget);
        await kvSet(env, `sync:final:${m.id}`, true);
      });
    }
  }
}

/** Statistiche usate dal voto statistico (solo valori numerici non nulli, per contenere lo spazio). */
const STAT_KEYS = [
  "goals", "goal_assist", "expected_goals", "expected_assists", "total_shots", "shots_on_target", "key_pass", "total_pass",
  "accurate_pass", "total_contest", "won_contest", "duel_won", "duel_lost", "won_tackle", "total_clearance", "interception",
  "ball_recovery", "blocked_scoring_attempt", "dispossessed", "fouls", "yellow_card", "red_card", "saves", "goals_conceded",
  "goals_prevented", "good_high_claim", "accurate_keeper_sweeper", "big_chance_created", "big_chance_missed", "last_man_tackle",
  "clearance_off_line", "error_lead_to_a_goal", "error_lead_to_a_shot", "progressive_ball_carries_count",
  "total_cross", "accurate_cross", "aerial_won", "aerial_lost", "total_long_balls", "accurate_long_balls",
  "possession_lost", "challenge_lost", "hit_woodwork", "was_fouled",
];
function pickStats(p: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of STAT_KEYS) if (typeof p[k] === "number" && p[k] !== 0) out[k] = p[k] as number;
  return out;
}
