// Accesso con codici: codice lega (lettura), codice admin (import rose e impostazioni), poi username e
// password del profilo utente (squadra). Nel database ci sono solo gli hash di codici e password.

import type { Context, Next } from "hono";
import type { Env } from "./env";

export interface SessionClaims {
  /** id lega */
  lid: string;
  /** squadre che l'utente può modificare */
  tids: number[];
  admin: boolean;
  /** Profilo utente con cui si è entrati (username e password). */
  uid?: number;
  /** Accesso attivo del profilo: vale solo sul dispositivo dell'ultimo login. */
  sid?: string;
  exp: number;
}

export type AppEnv = { Bindings: Env; Variables: { session: SessionClaims } };

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function sha256(s: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

/** Codice facile da dettare: 10 caratteri senza simboli ambigui. */
export function newCode(len = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export const normalizeCode = (c: string) => c.trim().toUpperCase().replace(/[\s-]/g, "");

// ---- Password dei profili utente ------------------------------------------------------------------

/** Iterazioni PBKDF2: contenute per restare nel tempo CPU del piano gratuito di Cloudflare; la chiave di sessione fa da pepper. */
const PBKDF2_ITERATIONS = 20_000;

/** Hash della password con sale casuale e pepper (SESSION_SECRET): senza il segreto del server l'hash non è attaccabile offline. */
export async function hashPassword(env: Env, password: string, salt = b64url(crypto.getRandomValues(new Uint8Array(16)))): Promise<{ hash: string; salt: string }> {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET non configurato");
  const key = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(`${salt}:${env.SESSION_SECRET}`), iterations: PBKDF2_ITERATIONS }, key, 256);
  return { hash: b64url(bits), salt };
}

export async function verifyPassword(env: Env, password: string, hash: string, salt: string): Promise<boolean> {
  const h = await hashPassword(env, password, salt);
  if (h.hash.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= h.hash.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export const USERNAME_RE = /^[a-z0-9._-]{3,24}$/i;
export const MIN_PASSWORD = 6;

async function hmacKey(env: Env) {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET non configurato");
  return crypto.subtle.importKey("raw", enc.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(env: Env, claims: SessionClaims): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySession(env: Env, token: string): Promise<SessionClaims | null> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(env), fromB64url(sig), enc.encode(payload));
  if (!ok) return null;
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as SessionClaims;
  return claims.exp * 1000 > Date.now() ? claims : null;
}

/**
 * Richiede una sessione valida (header Authorization: Bearer …).
 * Per i profili utente l'accesso vale solo sul dispositivo dell'ultimo login: se nel frattempo
 * si è entrati da un altro dispositivo (o l'admin ha azzerato il profilo), la sessione decade.
 */
export async function requireSession(c: Context<AppEnv>, next: Next) {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const claims = token ? await verifySession(c.env, token) : null;
  if (!claims) return c.json({ error: "Sessione scaduta: inserisci di nuovo il codice lega." }, 401);
  if (claims.uid) {
    const u = await c.env.DB.prepare("SELECT session_id, team_id FROM users WHERE id = ? AND league_id = ?").bind(claims.uid, claims.lid).first<{ session_id: string | null; team_id: number }>();
    if (!u) return c.json({ error: "Profilo utente azzerato dall'admin: scegli di nuovo il tuo utente.", otherDevice: true }, 401);
    if (u.session_id !== claims.sid) return c.json({ error: "Hai effettuato l'accesso da un altro dispositivo: inserisci di nuovo la password per usare l'app qui.", otherDevice: true }, 401);
    claims.tids = [u.team_id];
  }
  c.set("session", claims);
  await next();
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  if (!c.get("session")?.admin) return c.json({ error: "Serve il codice admin della lega." }, 403);
  await next();
}
