// API-Football (api-sports.io), seconda fonte facoltativa per il dettaglio degli indisponibili.
// Serve solo se è impostato il segreto API_FOOTBALL_KEY: una richiesta al giorno, nel budget del piano Free
// (100 richieste al giorno). Fornisce il motivo dell'assenza ("Knee Injury", "Suspended"…) e se il giocatore è in dubbio;
// non fornisce il rientro previsto. I dati BSD già presenti non vengono mai sovrascritti.

import { matchPlayer, normalizeName, type CandidatePlayer } from "@footballlite/core";
import type { Env } from "./env";
import { kvRead, kvSet } from "./schedule";
import { afGet } from "./sources";

/** Serie A su API-Football. */
export const AF_SERIE_A = 135;

export interface AfInjury {
  player: { id: number; name: string; type: string | null; reason: string | null };
  team: { id: number; name: string };
  fixture: { id: number; date: string; timestamp: number };
  league: { round: string | null; season: number };
}

export interface AfState { ok: boolean; error?: string; read?: number; applied?: number; season?: number }

export const afEnabled = (env: Env): boolean => !!(env.API_FOOTBALL_KEY ?? "").trim();

/** Stagione come la indica API-Football (anno di inizio): da luglio è l'anno corrente. */
export function afSeason(now = new Date()): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

/** Numero di giornata da "Regular Season - 9". */
export function roundNumber(round: string | null | undefined): number | null {
  const m = /(\d+)\s*$/.exec(round ?? "");
  return m ? Number(m[1]) : null;
}

/** Parole che non distinguono una squadra dall'altra nei nomi delle fonti (AC Milan, SSC Napoli, Hellas Verona FC…). */
const TEAM_NOISE = new Set(["ac", "as", "fc", "us", "uc", "ssc", "ss", "sc", "calcio", "hellas", "1913", "1909", "1907"]);
const teamTokens = (name: string) => normalizeName(name).split(" ").filter((t) => t && !TEAM_NOISE.has(t));

/** Nome squadra BSD corrispondente a un nome API-Football: quello con più parole in comune. */
export function mapTeam(afName: string, bsdTeams: string[]): string | null {
  const a = teamTokens(afName);
  let best: { name: string; n: number } | null = null;
  for (const t of bsdTeams) {
    const b = new Set(teamTokens(t));
    const n = a.filter((x) => b.has(x)).length;
    if (n && (!best || n > best.n)) best = { name: t, n };
  }
  return best?.name ?? null;
}

/** Motivo in italiano, leggibile dall'utente; le diciture non note restano come arrivano dalla fonte. */
const REASONS: Record<string, string> = {
  "knee injury": "infortunio al ginocchio", "ankle injury": "infortunio alla caviglia", "hamstring injury": "lesione al bicipite femorale",
  "thigh injury": "infortunio alla coscia", "calf injury": "infortunio al polpaccio", "muscle injury": "infortunio muscolare",
  "groin injury": "infortunio all'inguine", "back injury": "infortunio alla schiena", "shoulder injury": "infortunio alla spalla",
  "foot injury": "infortunio al piede", "hip injury": "infortunio all'anca", "achilles tendon injury": "infortunio al tendine d'Achille",
  "knock": "botta", "illness": "malattia", "suspended": "squalificato", "red card": "squalificato per espulsione",
  "yellow cards": "squalificato per somma di ammonizioni", "coach's decision": "scelta tecnica", "national selection": "impegno con la nazionale",
  "lacking match fitness": "non al meglio della condizione", "virus": "virus", "broken nose": "frattura al naso", "fractured": "frattura",
  "cruciate ligament": "rottura del legamento crociato", "acl": "rottura del legamento crociato", "concussion": "trauma cranico",
};
export function italianReason(reason: string | null | undefined): string | null {
  const r = (reason ?? "").trim();
  if (!r) return null;
  const key = r.toLowerCase();
  if (REASONS[key]) return REASONS[key];
  for (const [en, it] of Object.entries(REASONS)) if (key.includes(en)) return it;
  return r;
}

/**
 * Indisponibili della stagione da API-Football (una richiesta), limitati alle giornate indicate: per ogni giocatore
 * abbinato per squadra e nome ai giocatori BSD, aggiunge motivo e stato dove la fonte principale non li ha.
 */
export async function syncInjuriesAF(env: Env, rounds: number[]): Promise<AfState> {
  const season = afSeason();
  let list: AfInjury[];
  try {
    const r = await afGet<AfInjury[]>(env, `/injuries?league=${AF_SERIE_A}&season=${season}`);
    list = r;
  } catch (e) {
    const state = { ok: false, error: (e as Error).message, season };
    await kvSet(env, "af:last", state);
    return state;
  }
  const wanted = new Set(rounds);
  const now = Date.now();
  // Voci delle giornate seguite oppure di partite entro una settimana (la giornata può non essere indicata).
  const current = list.filter((i) => {
    const md = roundNumber(i.league?.round);
    return md ? wanted.has(md) : Math.abs((i.fixture?.timestamp ?? 0) * 1000 - now) < 7 * 86400_000;
  });

  const players = await env.DB.prepare("SELECT id, name, short_name, role, team_name FROM players").all<{ id: number; name: string; short_name: string | null; role: 1 | 2 | 3 | 4 | null; team_name: string | null }>();
  const byTeam = new Map<string, CandidatePlayer[]>();
  for (const p of players.results ?? []) {
    const key = p.team_name ?? "";
    const arr = byTeam.get(key) ?? [];
    arr.push({ id: p.id, name: p.name, role: p.role, teamName: key });
    if (p.short_name && p.short_name !== p.name) arr.push({ id: p.id, name: p.short_name, role: p.role, teamName: key });
    byTeam.set(key, arr);
  }
  const teamNames = [...byTeam.keys()].filter(Boolean);
  const teamMap = new Map<number, string | null>();
  const resolved = new Map<string, { id: number; md: number; unavailable: string | null; doubtful: number; reason: string | null }>();
  for (const i of current) {
    const md = roundNumber(i.league?.round);
    if (!md || !i.player?.name) continue;
    if (!teamMap.has(i.team.id)) teamMap.set(i.team.id, mapTeam(i.team.name, teamNames));
    const team = teamMap.get(i.team.id);
    if (!team) continue;
    const m = matchPlayer(i.player.name, undefined, byTeam.get(team) ?? []);
    if (!m.id) continue;
    const doubtful = /questionable|doubt/i.test(i.player.type ?? "") ? 1 : 0;
    const reasonText = (i.player.reason ?? "").toLowerCase();
    const unavailable = doubtful ? null : /suspend|card/.test(reasonText) ? "suspension" : /injur|knock|illness|virus|fract|ligament|concussion|tendon|muscle/.test(reasonText) ? "injury" : "other";
    resolved.set(`${m.id}:${md}`, { id: m.id, md, unavailable, doubtful, reason: italianReason(i.player.reason) });
  }
  const stmts = [...resolved.values()].map((v) => env.DB.prepare(
    `INSERT INTO player_status (player_id, matchday, unavailable, doubtful, reason, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(player_id, matchday) DO UPDATE SET
       unavailable = COALESCE(player_status.unavailable, excluded.unavailable),
       doubtful = CASE WHEN player_status.unavailable IS NULL THEN MAX(player_status.doubtful, excluded.doubtful) ELSE player_status.doubtful END,
       reason = COALESCE(player_status.reason, excluded.reason),
       updated_at = excluded.updated_at`,
  ).bind(v.id, v.md, v.unavailable, v.doubtful, v.reason, now));
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  const state: AfState = { ok: true, read: list.length, applied: stmts.length, season };
  await kvSet(env, "af:last", state);
  return state;
}

export async function afLast(env: Env): Promise<(AfState & { at: number }) | null> {
  const r = await kvRead<AfState>(env, "af:last");
  return r ? { at: r.updatedAt, ...r.value } : null;
}
