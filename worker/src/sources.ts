// Fonti dati con licenza. Nessun accesso a LegheFC o fantacalcio.it.
// - football-data.org (piano Free): calendario, orari e classifica di Serie A.
// - BSD, sports.bzzoiro.com (piano Free, 7.500 richieste/giorno): giocatori, indisponibili,
//   formazioni probabili/ufficiali, statistiche e cronaca delle partite.
// - API-Football, api-sports.io (piano Free, 100 richieste/giorno, facoltativa): motivo delle assenze.

import type { Env } from "./env";

const FD = "https://api.football-data.org/v4";
const BSD = "https://sports.bzzoiro.com/api/v2";
const AF = "https://v3.football.api-sports.io";

/** Budget giornaliero su API-Football (il piano Free ne concede 100). */
export const AF_DAILY_BUDGET = 90;

/** Serie A su BSD. */
export const BSD_SERIE_A = 4;

/** Budget giornaliero che FootballLite si impone su BSD (il piano ne concede 7.500), distribuito dal cron. */
export const BSD_DAILY_BUDGET = 1500;

/** Raggiunto il tetto di richieste esterne della singola esecuzione: si riprende alla successiva. */
export class CallCapError extends Error {}

/** Conta una richiesta esterna: il piano Free di Cloudflare ne consente 50 per esecuzione. */
function countCall(env: Env): void {
  if (!env.calls) return;
  if (env.calls.n >= env.calls.cap) throw new CallCapError("limite di richieste per esecuzione raggiunto");
  env.calls.n++;
}

export class SourceError extends Error {
  constructor(public source: string, public status: number, message: string) {
    super(`${source}: ${message}`);
  }
}

export async function fdGet<T = any>(env: Env, path: string): Promise<T> {
  countCall(env);
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
  countCall(env);
  await useQuota(env, "bsd", BSD_DAILY_BUDGET);
  // Il token incollato può contenere spazi o già il prefisso "Token": si usa solo la chiave.
  const key = (env.BSD_TOKEN ?? "").trim().replace(/^Token\s+/i, "");
  const res = await fetch(BSD + path, { headers: { Authorization: `Token ${key}`, Accept: "application/json" } });
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

/** API-Football: la risposta è sempre 200, gli errori stanno in `errors`; i dati in `response`. */
export async function afGet<T = any>(env: Env, path: string): Promise<T> {
  countCall(env);
  await useQuota(env, "af", AF_DAILY_BUDGET);
  const key = (env.API_FOOTBALL_KEY ?? "").trim();
  const res = await fetch(AF + path, { headers: { "x-apisports-key": key, Accept: "application/json" } });
  const body: any = await res.json().catch(() => null);
  if (!res.ok) throw new SourceError("API-Football", res.status, body?.message ?? `HTTP ${res.status}`);
  const errors = body?.errors;
  const msgs = errors && typeof errors === "object" ? Object.values(errors).filter((v) => typeof v === "string") : Array.isArray(errors) ? errors : [];
  if (msgs.length) throw new SourceError("API-Football", 400, String(msgs[0]));
  return (body?.response ?? []) as T;
}
