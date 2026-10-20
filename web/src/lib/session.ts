// Sessioni sul dispositivo: una per ogni lega in cui si è entrati (codice invito), con la lega corrente.

import { useSyncExternalStore } from "react";

export interface Session {
  token: string;
  /** Token della sola lega (prima della scelta dell'utente): serve per tornare alla scelta dell'utente. */
  leagueToken?: string;
  league: { id: string; name: string };
  admin: boolean;
  /** Utente (squadra) scelto dopo il codice condiviso. */
  myTeamId: number | null;
  /** Username del profilo con cui si è entrati. */
  username?: string | null;
  /** Avviso da mostrare nella scelta dell'utente (es. accesso fatto da un altro dispositivo). */
  notice?: string | null;
}

interface Store {
  current: string | null;
  sessions: Record<string, Session>;
}

const KEY = "footballlite.sessions.v1";
const listeners = new Set<() => void>();

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
    // Migrazione dalla sessione singola della versione precedente.
    const old = localStorage.getItem("footballlite.session.v3");
    if (old) {
      const s = JSON.parse(old) as Session;
      return { current: s.league.id, sessions: { [s.league.id]: s } };
    }
  } catch { /* storage non disponibile */ }
  return { current: null, sessions: {} };
}

let store: Store = read();
let currentSnapshot: Session | null = store.current ? store.sessions[store.current] ?? null : null;

function write(next: Store) {
  store = next;
  currentSnapshot = next.current ? next.sessions[next.current] ?? null : null;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* resta in memoria */ }
  listeners.forEach((l) => l());
}

export const session = {
  get: () => currentSnapshot,
  /** Aggiunge o aggiorna la sessione di una lega e la rende corrente. */
  set(s: Session) {
    write({ current: s.league.id, sessions: { ...store.sessions, [s.league.id]: s } });
  },
  update(patch: Partial<Session>) {
    if (currentSnapshot) session.set({ ...currentSnapshot, ...patch });
  },
  switchTo(leagueId: string) {
    if (store.sessions[leagueId]) write({ ...store, current: leagueId });
  },
  /** Torna alla scelta dell'utente della lega corrente (si resta nella lega con il token della sola lega). */
  leaveUser(notice?: string) {
    if (!currentSnapshot) return;
    session.set({ ...currentSnapshot, token: currentSnapshot.leagueToken ?? currentSnapshot.token, myTeamId: null, username: null, notice: notice ?? null });
  },
  /** Esce dalla lega corrente; se ce ne sono altre si passa alla prima. */
  logout() {
    const rest = { ...store.sessions };
    if (store.current) delete rest[store.current];
    write({ current: Object.keys(rest)[0] ?? null, sessions: rest });
  },
  /** Torna alla schermata d'accesso (per entrare o creare un'altra lega) senza perdere le leghe salvate. */
  detach() {
    write({ ...store, current: null });
  },
  leagues: () => Object.values(store.sessions).map((s) => s.league),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useSession(): Session | null {
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}

export function useLeagues(): { id: string; name: string }[] {
  useSyncExternalStore(session.subscribe, () => store, () => store);
  return session.leagues();
}
