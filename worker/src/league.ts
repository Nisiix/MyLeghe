// Lega, squadre, rose importate e formazioni (salvate solo in FootballLite).

import { matchPlayer, normalizeConfig, validateLineup, type CalendarDay, type CandidatePlayer, type ImportedTeam, type LeagueConfig, type Role } from "@footballlite/core";
import { Hono } from "hono";
import { newCode, normalizeCode, requireAdmin, requireSession, sha256, signSession, type AppEnv } from "./auth";
import { kvSet } from "./schedule";
import { SOURCE_TERMS, sourcesAccepted } from "./terms";
import { activeRound } from "./schedule";

const SESSION_DAYS = 180;
export const league = new Hono<AppEnv>();

interface LeagueRow { id: string; name: string; settings: string; code_hash: string; admin_hash: string }
interface TeamRow { id: number; league_id: string; name: string; position: number; spent: number; code_hash: string | null }
export interface RosterRow { team_id: number; slot: number; name: string; role: Role; cost: number; ext_id: number | null; confidence: number; candidates: string | null }

export async function loadConfig(db: D1Database, leagueId: string): Promise<LeagueConfig> {
  const row = await db.prepare("SELECT settings FROM leagues WHERE id = ?").bind(leagueId).first<{ settings: string }>();
  return normalizeConfig(row ? JSON.parse(row.settings) : {});
}

// ---- Creazione lega (solo con il codice di setup dell'installazione) ---------------------------

league.get("/setup/terms", async (c) => c.json({ terms: SOURCE_TERMS, accepted: await sourcesAccepted(c.env) }));

/** Accettazione dei termini delle fonti dati da parte di chi gestisce l'installazione (titolare degli account). */
league.post("/setup/terms", async (c) => {
  const { setupCode, accept } = await c.req.json<{ setupCode: string; accept: boolean }>();
  if (!c.env.SETUP_CODE || setupCode !== c.env.SETUP_CODE) return c.json({ error: "Codice di setup non valido" }, 403);
  if (accept !== true) return c.json({ error: "Serve l'accettazione dei termini" }, 400);
  await kvSet(c.env, "terms:sources", { version: SOURCE_TERMS.version, acceptedAt: Date.now() });
  return c.json({ accepted: true });
});

league.post("/setup/league", async (c) => {
  const { setupCode, name, acceptSourcesTerms } = await c.req.json<{ setupCode: string; name: string; acceptSourcesTerms?: boolean }>();
  if (!c.env.SETUP_CODE || setupCode !== c.env.SETUP_CODE) return c.json({ error: "Codice di setup non valido" }, 403);
  if (!name?.trim()) return c.json({ error: "Nome lega obbligatorio" }, 400);
  if (!(await sourcesAccepted(c.env))) {
    if (acceptSourcesTerms !== true) return c.json({ error: "Prima accetta i termini d'uso delle fonti dati.", needsTerms: true }, 400);
    await kvSet(c.env, "terms:sources", { version: SOURCE_TERMS.version, acceptedAt: Date.now() });
  }
  const id = crypto.randomUUID();
  const leagueCode = newCode(8), adminCode = newCode(12);
  await c.env.DB.prepare("INSERT INTO leagues (id, name, code_hash, admin_hash, settings, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, name.trim(), await sha256(leagueCode), await sha256(adminCode), JSON.stringify(normalizeConfig({})), Date.now()).run();
  return c.json({ leagueId: id, leagueCode, adminCode });
});

// ---- Accesso -----------------------------------------------------------------------------------

/** La lega è utilizzabile solo dopo l'import di rose e calendario. */
async function leagueReady(db: D1Database, leagueId: string) {
  const teams = await db.prepare(
    "SELECT t.id, t.name, (SELECT COUNT(*) FROM roster r WHERE r.team_id = t.id) AS n FROM teams t WHERE t.league_id = ? ORDER BY t.position",
  ).bind(leagueId).all<{ id: number; name: string; n: number }>();
  const cal = await db.prepare("SELECT COUNT(*) AS n FROM league_calendar WHERE league_id = ?").bind(leagueId).first<{ n: number }>();
  // Le squadre senza rosa (presenti nel file ma vuote) non sono selezionabili.
  const withRoster = (teams.results ?? []).filter((t) => t.n > 0).map(({ id, name }) => ({ id, name }));
  const hasRoster = withRoster.length > 0;
  const hasCalendar = (cal?.n ?? 0) > 0;
  return { ready: hasRoster && hasCalendar, teams: withRoster, hasRoster, hasCalendar };
}

/**
 * Accesso con il codice condiviso della lega (più il codice admin per chi importa i file).
 * Restituisce gli utenti (squadre) da cui scegliere; se rose o calendario mancano la lega non è ancora pronta.
 */
league.post("/session", async (c) => {
  const body = await c.req.json<{ leagueCode: string; adminCode?: string }>();
  const lrow = await c.env.DB.prepare("SELECT id, name FROM leagues WHERE code_hash = ?").bind(await sha256(normalizeCode(body.leagueCode ?? ""))).first<{ id: string; name: string }>();
  if (!lrow) return c.json({ error: "Codice lega non valido" }, 404);
  let admin = false;
  if (body.adminCode) {
    const a = await c.env.DB.prepare("SELECT 1 FROM leagues WHERE id = ? AND admin_hash = ?").bind(lrow.id, await sha256(normalizeCode(body.adminCode))).first();
    if (!a) return c.json({ error: "Codice admin non valido" }, 403);
    admin = true;
  }
  const state = await leagueReady(c.env.DB, lrow.id);
  if (!state.ready && !admin) {
    const missing = [!state.hasRoster && "le rose", !state.hasCalendar && "il calendario"].filter(Boolean).join(" e ");
    return c.json({ error: `La lega non è ancora pronta: l'admin deve importare ${missing}.`, notReady: true }, 409);
  }
  const claims = { lid: lrow.id, tids: [] as number[], admin, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 };
  return c.json({ token: await signSession(c.env, claims), league: { id: lrow.id, name: lrow.name }, admin, ...state });
});

/** Scelta dell'utente (squadra) dopo il codice condiviso: da qui si può schierare la sua formazione. */
league.post("/session/team", requireSession, async (c) => {
  const s = c.get("session");
  const { teamId } = await c.req.json<{ teamId: number }>();
  const state = await leagueReady(c.env.DB, s.lid);
  if (!state.teams.some((t) => t.id === teamId)) return c.json({ error: "Utente non valido per questa lega" }, 400);
  return c.json({ token: await signSession(c.env, { ...s, tids: [teamId] }), teamId });
});

league.use("/league/*", requireSession);

league.get("/league", async (c) => {
  const s = c.get("session");
  const l = await c.env.DB.prepare("SELECT id, name, settings FROM leagues WHERE id = ?").bind(s.lid).first<LeagueRow>();
  if (!l) return c.json({ error: "Lega non trovata" }, 404);
  const teams = await c.env.DB.prepare("SELECT id, name, position, spent FROM teams WHERE league_id = ? ORDER BY position").bind(s.lid).all<TeamRow>();
  const roster = await c.env.DB.prepare(
    `SELECT r.team_id, r.slot, r.name, r.role, r.cost, r.ext_id, r.confidence, p.name AS ext_name, p.team_name AS ext_team
     FROM roster r JOIN teams t ON t.id = r.team_id LEFT JOIN players p ON p.id = r.ext_id
     WHERE t.league_id = ? ORDER BY r.team_id, r.slot`,
  ).bind(s.lid).all();
  return c.json({
    league: { id: l.id, name: l.name, config: normalizeConfig(JSON.parse(l.settings)) },
    teams: teams.results ?? [],
    roster: roster.results ?? [],
    me: { teamIds: s.tids, admin: s.admin },
  });
});

// ---- Admin: impostazioni, import rose, abbinamenti, codici squadra ------------------------------

league.use("/league/admin/*", requireAdmin);

league.put("/league/admin/settings", async (c) => {
  const s = c.get("session");
  const config = normalizeConfig(await c.req.json());
  await c.env.DB.prepare("UPDATE leagues SET settings = ? WHERE id = ?").bind(JSON.stringify(config), s.lid).run();
  return c.json({ config });
});

/** Pool dei giocatori di Serie A per l'abbinamento (dalla fonte dati, salvati in `players`). */
async function playerPool(db: D1Database): Promise<CandidatePlayer[]> {
  const rows = await db.prepare("SELECT id, name, short_name, role, team_name FROM players").all<{ id: number; name: string; short_name: string | null; role: Role | null; team_name: string | null }>();
  return (rows.results ?? []).flatMap((p) => {
    const base = { id: p.id, role: p.role, teamName: p.team_name ?? undefined };
    return p.short_name && p.short_name !== p.name ? [{ ...base, name: p.name }, { ...base, name: p.short_name }] : [{ ...base, name: p.name }];
  });
}

function bestOf(name: string, role: Role, pool: CandidatePlayer[]) {
  const m = matchPlayer(name, role, pool);
  // Lo stesso giocatore può comparire due volte nel pool (nome e nome breve): candidati unici.
  const seen = new Set<number>();
  const candidates = m.candidates.filter((x) => !seen.has(x.id) && seen.add(x.id)).slice(0, 4);
  return { ...m, candidates };
}

/**
 * Import delle rose già lette dal file sul dispositivo dell'admin.
 * Sostituisce squadre e rose della lega; restituisce i codici squadra (mostrati una sola volta).
 */
league.post("/league/admin/import", async (c) => {
  const s = c.get("session");
  const { teams } = await c.req.json<{ teams: ImportedTeam[] }>();
  if (!Array.isArray(teams) || !teams.length) return c.json({ error: "Nessuna squadra da importare" }, 400);
  const pool = await playerPool(c.env.DB);
  const db = c.env.DB;
  const existing = await db.prepare("SELECT id, name FROM teams WHERE league_id = ?").bind(s.lid).all<{ id: number; name: string }>();
  const byName = new Map((existing.results ?? []).map((t) => [t.name.toLowerCase(), t.id]));

  for (const [i, t] of teams.entries()) {
    let id = byName.get(t.name.toLowerCase());
    if (id) {
      await db.prepare("UPDATE teams SET position = ?, spent = ? WHERE id = ?").bind(i, t.spent ?? 0, id).run();
      byName.delete(t.name.toLowerCase());
    } else {
      const r = await db.prepare("INSERT INTO teams (league_id, name, position, spent) VALUES (?, ?, ?, ?)")
        .bind(s.lid, t.name, i, t.spent ?? 0).run();
      id = Number(r.meta.last_row_id);
    }
    const stmts = [db.prepare("DELETE FROM roster WHERE team_id = ?").bind(id)];
    t.players.forEach((p, slot) => {
      const m = pool.length ? bestOf(p.name, p.role, pool) : { id: null, confidence: 0, candidates: [] };
      stmts.push(db.prepare("INSERT INTO roster (team_id, slot, name, role, cost, ext_id, confidence, candidates) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, slot, p.name, p.role, p.cost ?? 0, m.id, m.confidence, JSON.stringify(m.candidates)));
    });
    await db.batch(stmts);
  }
  // Squadre non più presenti nel file: rimosse (con rose e formazioni).
  for (const id of byName.values()) await db.prepare("DELETE FROM teams WHERE id = ?").bind(id).run();
  return c.json({ imported: teams.length, poolSize: pool.length });
});

/** Rifà l'abbinamento automatico dei giocatori non abbinati (es. dopo l'aggiornamento delle rose di Serie A). */
league.post("/league/admin/rematch", async (c) => {
  const s = c.get("session");
  const pool = await playerPool(c.env.DB);
  if (!pool.length) return c.json({ error: "Giocatori di Serie A non ancora scaricati dalla fonte dati" }, 409);
  const rows = await c.env.DB.prepare("SELECT r.* FROM roster r JOIN teams t ON t.id = r.team_id WHERE t.league_id = ? AND r.ext_id IS NULL").bind(s.lid).all<RosterRow>();
  const stmts = (rows.results ?? []).map((r) => {
    const m = bestOf(r.name, r.role, pool);
    return c.env.DB.prepare("UPDATE roster SET ext_id = ?, confidence = ?, candidates = ? WHERE team_id = ? AND slot = ?")
      .bind(m.id, m.confidence, JSON.stringify(m.candidates), r.team_id, r.slot);
  });
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ checked: stmts.length });
});

league.get("/league/admin/unmatched", async (c) => {
  const s = c.get("session");
  const rows = await c.env.DB.prepare(
    "SELECT r.team_id, r.slot, r.name, r.role, r.confidence, r.candidates, t.name AS team FROM roster r JOIN teams t ON t.id = r.team_id WHERE t.league_id = ? AND r.ext_id IS NULL ORDER BY t.position, r.slot",
  ).bind(s.lid).all<RosterRow & { team: string }>();
  return c.json((rows.results ?? []).map((r) => ({ ...r, candidates: JSON.parse(r.candidates ?? "[]") })));
});

/** Abbinamento manuale (o ricerca per nome) di un giocatore della rosa. */
league.put("/league/admin/roster/:teamId/:slot", async (c) => {
  const s = c.get("session");
  const { extId, role } = await c.req.json<{ extId?: number | null; role?: Role }>();
  const own = await c.env.DB.prepare("SELECT 1 FROM teams WHERE id = ? AND league_id = ?").bind(Number(c.req.param("teamId")), s.lid).first();
  if (!own) return c.json({ error: "Squadra non trovata" }, 404);
  if (extId !== undefined) {
    await c.env.DB.prepare("UPDATE roster SET ext_id = ?, confidence = 1 WHERE team_id = ? AND slot = ?").bind(extId, Number(c.req.param("teamId")), Number(c.req.param("slot"))).run();
  }
  if (role && [1, 2, 3, 4].includes(role)) {
    await c.env.DB.prepare("UPDATE roster SET role = ? WHERE team_id = ? AND slot = ?").bind(role, Number(c.req.param("teamId")), Number(c.req.param("slot"))).run();
  }
  return c.json({ ok: true });
});

league.get("/league/admin/players", async (c) => {
  const q = `%${(c.req.query("q") ?? "").trim()}%`;
  const rows = await c.env.DB.prepare("SELECT id, name, role, team_name FROM players WHERE name LIKE ? OR short_name LIKE ? ORDER BY name LIMIT 20").bind(q, q).all();
  return c.json(rows.results ?? []);
});

// ---- Formazioni ------------------------------------------------------------------------------

interface LineupRow { id: number; team_id: number; round: number; module: string; starters: string; bench: string; forced: number; created_at: number; entered_by: number | null }

const parseLineup = (r: LineupRow) => ({ ...r, starters: JSON.parse(r.starters) as number[], bench: JSON.parse(r.bench) as number[], forced: !!r.forced });

/** Ultima formazione di ogni squadra per la giornata (visibili a tutti dopo il primo calcio d'inizio). */
league.get("/league/lineups/:round", async (c) => {
  const s = c.get("session");
  const round = Number(c.req.param("round"));
  const info = await activeRound(c.env);
  const rows = await c.env.DB.prepare(
    `SELECT l.* FROM lineups l JOIN (SELECT team_id, MAX(id) AS id FROM lineups WHERE league_id = ? AND round = ? GROUP BY team_id) last ON last.id = l.id`,
  ).bind(s.lid, round).all<LineupRow>();
  const started = round < info.matchday || (round === info.matchday && info.phase !== "upcoming");
  const list = (rows.results ?? []).map(parseLineup).map((l) =>
    started || s.tids.includes(l.team_id) ? l : { team_id: l.team_id, round: l.round, hidden: true, created_at: l.created_at });
  return c.json({ round, started, lineups: list });
});

league.get("/league/lineups/:round/history/:teamId", async (c) => {
  const s = c.get("session");
  const rows = await c.env.DB.prepare("SELECT * FROM lineups WHERE league_id = ? AND round = ? AND team_id = ? ORDER BY id DESC")
    .bind(s.lid, Number(c.req.param("round")), Number(c.req.param("teamId"))).all<LineupRow>();
  const info = await activeRound(c.env);
  const round = Number(c.req.param("round"));
  const started = round < info.matchday || (round === info.matchday && info.phase !== "upcoming");
  if (!started && !s.tids.includes(Number(c.req.param("teamId")))) return c.json([]);
  return c.json((rows.results ?? []).map(parseLineup));
});

/**
 * Salva la formazione della propria squadra. Dopo il primo calcio d'inizio serve `forced: true`
 * (se la lega lo consente): la versione resta nello storico ed è segnata come modificata a giornata iniziata.
 * A giornata iniziata un utente può inserire la formazione di chi non l'ha inserita (segnata "inserita da"):
 * può correggere le formazioni inserite così, ma mai sovrascrivere quella messa dal proprietario.
 */
league.put("/league/lineups/:round/:teamId", async (c) => {
  const s = c.get("session");
  const teamId = Number(c.req.param("teamId"));
  const round = Number(c.req.param("round"));
  const body = await c.req.json<{ module: string; starters: number[]; bench: number[]; forced?: boolean }>();
  const cfg = await loadConfig(c.env.DB, s.lid);
  const info = await activeRound(c.env);
  if (round !== info.matchday) return c.json({ error: `Si può schierare solo la giornata ${info.matchday}.` }, 400);
  const started = info.phase !== "upcoming";
  const team = await c.env.DB.prepare("SELECT 1 FROM teams WHERE id = ? AND league_id = ?").bind(teamId, s.lid).first();
  if (!team) return c.json({ error: "Utente non trovato" }, 404);
  let enteredBy: number | null = null;
  if (!s.tids.includes(teamId)) {
    const me = s.tids[0];
    if (!me) return c.json({ error: "Scegli prima il tuo utente." }, 403);
    if (!started) return c.json({ error: "Prima dell'inizio della giornata ognuno inserisce la propria formazione." }, 403);
    const last = await c.env.DB.prepare("SELECT entered_by FROM lineups WHERE team_id = ? AND round = ? ORDER BY id DESC LIMIT 1").bind(teamId, round).first<{ entered_by: number | null }>();
    if (last && last.entered_by === null) return c.json({ error: "Questo utente ha già inserito la sua formazione." }, 403);
    enteredBy = me;
    body.forced = true;
  }
  if (started && !body.forced) return c.json({ error: "La giornata è iniziata: conferma la modifica forzata.", needsForce: true }, 409);
  // La regola dell'admin riguarda la modifica della propria formazione, non l'inserimento per chi non l'ha fatto.
  if (started && !cfg.allowForcedEdit && enteredBy === null) return c.json({ error: "La lega non consente modifiche a giornata iniziata." }, 403);

  const roster = await c.env.DB.prepare("SELECT slot, role FROM roster WHERE team_id = ?").bind(teamId).all<{ slot: number; role: Role }>();
  const roles = new Map((roster.results ?? []).map((r) => [r.slot, r.role]));
  const all = [...body.starters, ...body.bench];
  if (new Set(all).size !== all.length || all.some((x) => !roles.has(x))) return c.json({ error: "Giocatori non validi o ripetuti" }, 400);
  const errors = validateLineup(body.starters.map((x) => ({ role: roles.get(x)! })), body.bench, body.module, cfg);
  if (errors.length) return c.json({ error: errors.join(". ") }, 400);

  await c.env.DB.prepare("INSERT INTO lineups (league_id, team_id, round, module, starters, bench, forced, created_at, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(s.lid, teamId, round, body.module, JSON.stringify(body.starters), JSON.stringify(body.bench), started ? 1 : 0, Date.now(), enteredBy).run();
  return c.json({ ok: true, forced: started, enteredBy });
});

// ---- Calendario della lega (importato dal file di LegheFC) ------------------------------------------

/** Import del calendario già letto sul dispositivo dell'admin: le squadre devono essere quelle delle rose. */
league.post("/league/admin/calendar", async (c) => {
  const s = c.get("session");
  const { days } = await c.req.json<{ days: CalendarDay[] }>();
  if (!Array.isArray(days) || !days.length) return c.json({ error: "Nessuna giornata da importare" }, 400);
  const teams = await c.env.DB.prepare("SELECT id, name FROM teams WHERE league_id = ?").bind(s.lid).all<{ id: number; name: string }>();
  const byName = new Map((teams.results ?? []).map((t) => [t.name.trim().toLowerCase(), t.id]));
  const missing = new Set<string>();
  const stmts = [c.env.DB.prepare("DELETE FROM league_calendar WHERE league_id = ?").bind(s.lid)];
  for (const d of days) {
    for (const m of d.matches) {
      const h = byName.get(m.home.trim().toLowerCase()), a = byName.get(m.away.trim().toLowerCase());
      if (!h) missing.add(m.home);
      if (!a) missing.add(m.away);
      if (!h || !a) continue;
      stmts.push(c.env.DB.prepare(
        "INSERT INTO league_calendar (league_id, league_day, serie_a_day, home_team_id, away_team_id, home_points, away_points, home_goals, away_goals) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(s.lid, d.leagueDay, d.serieADay, h, a, m.homePoints, m.awayPoints, m.homeGoals, m.awayGoals));
    }
  }
  if (missing.size) return c.json({ error: `Squadre non presenti nelle rose importate: ${[...missing].join(", ")}. Importa prima le rose.` }, 400);
  for (let i = 0; i < stmts.length; i += 50) await c.env.DB.batch(stmts.slice(i, i + 50));
  return c.json({ days: days.length, matches: stmts.length - 1 });
});

export interface CalendarRow {
  league_day: number; serie_a_day: number; home_team_id: number; away_team_id: number;
  home_points: number | null; away_points: number | null; home_goals: number | null; away_goals: number | null;
}

league.get("/league/calendar", async (c) => {
  const s = c.get("session");
  const rows = await c.env.DB.prepare("SELECT league_day, serie_a_day, home_team_id, away_team_id, home_points, away_points, home_goals, away_goals FROM league_calendar WHERE league_id = ? ORDER BY league_day, rowid").bind(s.lid).all<CalendarRow>();
  return c.json(rows.results ?? []);
});

/** Avversario di una squadra nella giornata di Serie A indicata, dal calendario importato. */
export async function opponentOf(db: D1Database, leagueId: string, teamId: number, serieADay: number): Promise<{ id: number; name: string; leagueDay: number } | null> {
  const row = await db.prepare(
    `SELECT c.league_day, CASE WHEN c.home_team_id = ? THEN c.away_team_id ELSE c.home_team_id END AS opp FROM league_calendar c
     WHERE c.league_id = ? AND c.serie_a_day = ? AND (c.home_team_id = ? OR c.away_team_id = ?)`,
  ).bind(teamId, leagueId, serieADay, teamId, teamId).first<{ league_day: number; opp: number }>();
  if (!row) return null;
  const t = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(row.opp).first<{ name: string }>();
  return t ? { id: row.opp, name: t.name, leagueDay: row.league_day } : null;
}
