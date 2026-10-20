// Sessione sul dispositivo: token firmato dal backend dopo il codice condiviso e la scelta dell'utente.

import { useSyncExternalStore } from "react";

export interface Session {
  token: string;
  league: { id: string; name: string };
  admin: boolean;
  /** Utente (squadra) scelto dopo il codice condiviso. */
  myTeamId: number | null;
}

const KEY = "footballlite.session.v3";
const listeners = new Set<() => void>();

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

let current: Session | null = read();

function write(s: Session | null) {
  current = s;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch { /* storage non disponibile: la sessione resta in memoria */ }
  listeners.forEach((l) => l());
}

export const session = {
  get: () => current,
  set: write,
  update(patch: Partial<Session>) {
    if (current) write({ ...current, ...patch });
  },
  logout: () => write(null),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useSession(): Session | null {
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}
