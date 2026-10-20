// Chiamate al backend FootballLite (/api). I dati arrivano solo dalle rose importate e da fonti con licenza.

import { session } from "./session";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: any) {
    super(message);
  }
}

/** Errori delle pagine di Cloudflare (corpo "error code: NNNN") tradotti in un motivo leggibile. */
const CLOUDFLARE_CODES: Record<string, string> = {
  "1101": "il Worker FootballLite è andato in errore durante la richiesta",
  "1102": "il Worker FootballLite ha superato i limiti di CPU o memoria del piano",
  "1015": "Cloudflare sta limitando le richieste: troppe in poco tempo",
  "1027": "superato il limite giornaliero di richieste del piano gratuito di Cloudflare: riprende a mezzanotte (UTC)",
  "1042": "il Worker FootballLite non è raggiungibile in questo momento",
};

/** Motivo dell'errore quando la risposta non arriva dal backend ma da Cloudflare (o non arriva affatto). */
function failureReason(status: number, text: string): string {
  const code = /error code:?\s*(\d{4})/i.exec(text)?.[1];
  if (code) return `Cloudflare non ha restituito i dati (errore ${code}): ${CLOUDFLARE_CODES[code] ?? "errore del servizio"}.`;
  if (status >= 500) return `Cloudflare non ha restituito i dati (HTTP ${status}): errore del server, riprova tra poco.`;
  return `Errore ${status}`;
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }): Promise<T> {
  const s = session.get();
  let res: Response;
  try {
    res = await fetch("/api" + path, {
      method: init?.method ?? "GET",
      headers: {
        ...(s ? { Authorization: "Bearer " + s.token } : {}),
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    // La richiesta non è partita o non ha avuto risposta: rete assente o server non raggiungibile.
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new ApiError(0, offline
      ? "Sei offline: i dati arrivano dal server FootballLite su Cloudflare. Riprova quando torna la connessione."
      : "Server FootballLite su Cloudflare non raggiungibile: la richiesta non ha avuto risposta. Controlla la connessione o riprova tra poco.");
  }
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    // Accesso fatto da un altro dispositivo (o profilo azzerato): si resta nella lega e si torna alla scelta dell'utente.
    if (res.status === 401 && s && body?.otherDevice && s.leagueToken) session.leaveProfile(body.error);
    else if (res.status === 401 && s) session.logout();
    // 502: una fonte dati esterna (football-data.org o BSD) ha risposto con un errore.
    const fromApi = typeof body === "object" && body?.error ? (res.status === 502 ? `Fonte dati non disponibile: ${body.error}` : body.error) : null;
    throw new ApiError(res.status, fromApi ?? failureReason(res.status, typeof body === "string" ? body : ""), body);
  }
  return body as T;
}

export interface LeagueAccess {
  token: string;
  league: { id: string; name: string };
  admin: boolean;
  ready: boolean;
  hasRoster: boolean;
  hasCalendar: boolean;
  teams: AccessTeam[];
}

/** Squadra della rosa: `username` è il profilo a cui è collegata (null se libera). */
export interface AccessTeam { id: number; name: string; username: string | null }

/** Primo passo: codice condiviso della lega (più eventuale codice admin). Errore 409 se la lega non è pronta. */
export async function enterLeague(leagueCode: string, adminCode?: string): Promise<LeagueAccess> {
  const r = await api<LeagueAccess>("/session", { method: "POST", body: { leagueCode, adminCode: adminCode || undefined } });
  try { localStorage.setItem("footballlite.leagueCode", leagueCode); } catch { /* ignora */ }
  session.set({ token: r.token, leagueToken: r.token, league: r.league, admin: r.admin, myTeamId: null });
  return r;
}

/** Squadre della lega corrente tra cui scegliere l'utente (con lo stato del profilo). */
export async function accessTeams(): Promise<AccessTeam[]> {
  return (await api<{ teams: AccessTeam[] }>("/session/teams")).teams;
}

/** Creazione di una nuova lega: chi la crea ne diventa admin (riceve codice invito e codice admin). */
export async function createLeague(name: string): Promise<{ leagueCode: string; adminCode: string }> {
  const r = await api<{ league: { id: string; name: string }; leagueCode: string; adminCode: string; token: string }>("/leagues", { method: "POST", body: { name, acceptAppTerms: true } });
  session.set({ token: r.token, leagueToken: r.token, league: r.league, admin: true, myTeamId: null });
  return { leagueCode: r.leagueCode, adminCode: r.adminCode };
}

interface ProfileLogin { token: string; userId: number; username: string; teamId: number | null }

function openProfile(r: ProfileLogin) {
  const s = session.get();
  session.update({ token: r.token, leagueToken: s?.leagueToken ?? s?.token, userId: r.userId, username: r.username, myTeamId: r.teamId, notice: null });
  return r;
}

/** Secondo passo: login del profilo. Se ha già la squadra collegata si entra direttamente con quella. */
export async function loginProfile(username: string, password: string): Promise<ProfileLogin> {
  return openProfile(await api<ProfileLogin>("/session/login", { method: "POST", body: { username, password } }));
}

/** Creazione del profilo (username e password) nella lega. L'accesso resta valido solo su questo dispositivo (l'ultimo login). */
export async function registerProfile(username: string, password: string): Promise<ProfileLogin> {
  return openProfile(await api<ProfileLogin>("/session/register", { method: "POST", body: { username, password } }));
}

/** Terzo passo, una sola volta: collegamento della squadra della rosa al profilo. */
export async function linkTeam(teamId: number): Promise<void> {
  const r = await api<{ token: string; teamId: number }>("/session/team", { method: "POST", body: { teamId } });
  session.update({ token: r.token, myTeamId: r.teamId });
}

/** Scollega la squadra dal profilo (impostazioni): si potrà sceglierne di nuovo una. */
export async function unlinkTeam(): Promise<void> {
  const r = await api<{ token: string }>("/session/team", { method: "DELETE" });
  session.update({ token: r.token, myTeamId: null });
}

export function savedLeagueCode(): string {
  try { return localStorage.getItem("footballlite.leagueCode") ?? ""; } catch { return ""; }
}

/** Condizioni d'uso dell'app accettate su questo dispositivo. */
export const APP_TERMS_VERSION = "2026-10";
export function appTermsAccepted(): boolean {
  try { return localStorage.getItem("footballlite.terms") === APP_TERMS_VERSION; } catch { return false; }
}
export function acceptAppTerms(): void {
  try { localStorage.setItem("footballlite.terms", APP_TERMS_VERSION); } catch { /* ignora */ }
}

/** Iniziali del giocatore (al posto delle foto, per non usare immagini protette). */
export function initials(name: string): string {
  const parts = name.replace(/\./g, " ").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}
