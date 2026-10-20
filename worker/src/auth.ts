// Accesso con codici: codice lega (lettura), codice squadra (modifica della propria formazione),
// codice admin (import rose e impostazioni). Nel database ci sono solo gli hash dei codici.

import type { Context, Next } from "hono";
import type { Env } from "./env";

export interface SessionClaims {
  /** id lega */
  lid: string;
  /** squadre che l'utente può modificare */
  tids: number[];
  admin: boolean;
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

/** Richiede una sessione valida (header Authorization: Bearer …). */
export async function requireSession(c: Context<AppEnv>, next: Next) {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const claims = token ? await verifySession(c.env, token) : null;
  if (!claims) return c.json({ error: "Sessione scaduta: inserisci di nuovo il codice lega." }, 401);
  c.set("session", claims);
  await next();
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  if (!c.get("session")?.admin) return c.json({ error: "Serve il codice admin della lega." }, 403);
  await next();
}
