// Chiamate al backend FootballLite (/api). I dati arrivano solo dalle rose importate e da fonti con licenza.

import { session } from "./session";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: any) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }): Promise<T> {
  const s = session.get();
  const res = await fetch("/api" + path, {
    method: init?.method ?? "GET",
    headers: {
      ...(s ? { Authorization: "Bearer " + s.token } : {}),
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    // Accesso fatto da un altro dispositivo (o profilo azzerato): si resta nella lega e si torna alla scelta dell'utente.
    if (res.status === 401 && s && body?.otherDevice && s.leagueToken) session.leaveUser(body.error);
    else if (res.status === 401 && s) session.logout();
    throw new ApiError(res.status, body?.error ?? `Errore ${res.status}`, body);
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

/** Squadra tra cui scegliere: `username` è null finché il profilo non è stato creato. */
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

/**
 * Secondo passo: scelta dell'utente (squadra) con username e password.
 * Al primo accesso il profilo viene creato; l'accesso resta valido solo su questo dispositivo (l'ultimo login).
 */
export async function chooseTeam(teamId: number, username: string, password: string): Promise<void> {
  const s = session.get();
  const r = await api<{ token: string; teamId: number; username: string }>("/session/team", { method: "POST", body: { teamId, username, password } });
  session.update({ token: r.token, leagueToken: s?.leagueToken ?? s?.token, myTeamId: r.teamId, username: r.username, notice: null });
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
