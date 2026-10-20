// Fonti dati con licenza. Nessun accesso a LegheFC o fantacalcio.it.
// - football-data.org (piano Free): calendario, orari e classifica di Serie A.
// - BSD, sports.bzzoiro.com (piano Free, 7.500 richieste/giorno): giocatori, indisponibili,
//   formazioni probabili/ufficiali, statistiche e cronaca delle partite.

import type { Env } from "./env";

const FD = "https://api.football-data.org/v4";
const BSD = "https://sports.bzzoiro.com/api/v2";

/** Serie A su BSD. */
export const BSD_SERIE_A = 4;

/** Budget giornaliero che FootballLite si impone su BSD (il piano ne concede 7.500), distribuito dal cron. */
export const BSD_DAILY_BUDGET = 1500;

export class SourceError extends Error {
  constructor(public source: string, public status: number, message: string) {
    super(`${source}: ${message}`);
  }
}

export async function fdGet<T = any>(env: Env, path: string): Promise<T> {
  const res = await fetch(FD + path, { headers: { "X-Auth-Token": env.FOOTBALL_DATA_TOKEN } });
  const body: any = await res.json().catch(() => null);
  if (!res.ok) throw new SourceError("football-data.org", res.status, body?.message ?? `HTTP ${res.status}`);
  return body as T;
}

const today = () => new Date().toISOString().slice(0, 10);

export async function quotaUsed(env: Env, source = "bsd"): Promise<number> {
  const row = await env.DB.prepare("SELECT used FROM quota WHERE day = ?").bind(`${source}:${today()}`).first<{ used: number }>();
  return row?.used ?? 0;
}

async function useQuota(env: Env, source: string, limit: number): Promise<void> {
  const used = await quotaUsed(env, source);
  if (used >= limit) throw new SourceError(source, 429, "budget giornaliero esaurito");
  await env.DB.prepare("INSERT INTO quota (day, used) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET used = used + 1").bind(`${source}:${today()}`).run();
}

export async function bsdGet<T = any>(env: Env, path: string): Promise<T> {
  await useQuota(env, "bsd", BSD_DAILY_BUDGET);
  const res = await fetch(BSD + path, { headers: { Authorization: `Token ${env.BSD_TOKEN}`, Accept: "application/json" } });
  const body: any = await res.json().catch(() => null);
  if (!res.ok) throw new SourceError("BSD", res.status, body?.detail ?? `HTTP ${res.status}`);
  return body as T;
}

/** Tutte le pagine di un elenco BSD (`{count, next, results}`), con un massimo di pagine. */
export async function bsdList<T = any>(env: Env, path: string, maxPages = 5): Promise<T[]> {
  const out: T[] = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let page = 0; page < maxPages; page++) {
    const r = await bsdGet<{ results?: T[]; next?: string | null }>(env, `${path}${sep}limit=200&offset=${page * 200}`);
    out.push(...(r.results ?? []));
    if (!r.next) break;
  }
  return out;
}
