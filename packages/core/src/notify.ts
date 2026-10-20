// Regole dei promemoria push.

export interface NotifyPrefs {
  enabled: boolean;
  /** Ore prima del primo calcio d'inizio in cui avvisare se la formazione non è inserita. */
  reminderHours: number[];
  /** Avviso se un titolare stimato della tua formazione scende sotto questa soglia. */
  starterThreshold: number;
  starterAlerts: boolean;
  /** Durante la giornata: bonus e malus dei propri titolari. */
  myEventAlerts: boolean;
  /** Durante la giornata: bonus e malus dei titolari dell'avversario scelto. */
  opponentEventAlerts: boolean;
}

export const DEFAULT_NOTIFY: NotifyPrefs = {
  enabled: true, reminderHours: [24, 3, 1], starterThreshold: 70, starterAlerts: true, myEventAlerts: true, opponentEventAlerts: true,
};

export type EventKind = "goal" | "assist" | "yellow" | "red" | "penaltyScored" | "penaltyMissed" | "penaltySaved" | "ownGoal";

export const EVENT_TEXT: Record<EventKind, string> = {
  goal: "Gol", assist: "Assist", yellow: "Ammonizione", red: "Espulsione", penaltyScored: "Rigore segnato",
  penaltyMissed: "Rigore sbagliato", penaltySaved: "Rigore parato", ownGoal: "Autogol",
};

export type EventCounts = Partial<Record<EventKind, number>>;

/** Nuovi eventi rispetto all'ultimo controllo (es. un secondo gol): un elemento per ogni evento in più. */
export function newEvents(before: EventCounts | undefined, now: EventCounts): EventKind[] {
  const out: EventKind[] = [];
  for (const k of Object.keys(EVENT_TEXT) as EventKind[]) {
    const n = (now[k] ?? 0) - (before?.[k] ?? 0);
    for (let i = 0; i < n; i++) out.push(k);
  }
  return out;
}

/**
 * Promemoria da inviare ora: la soglia più piccola già raggiunta, se è più vicina alla scadenza
 * dell'ultima inviata (`lastSent`). Così, se il cron salta un giro, non partono avvisi vecchi.
 */
export function dueReminder(deadline: number, now: number, hours: number[], lastSent: number | null): number | null {
  if (now >= deadline) return null;
  const left = (deadline - now) / 3600_000;
  const due = hours.filter((h) => left <= h && (lastSent === null || h < lastSent)).sort((a, b) => a - b);
  return due.length ? due[0] : null;
}

/** Giocatori passati da ≥ soglia a < soglia tra due stime. */
export function starterDrops(previous: Record<string, number>, current: Record<string, number>, ids: Iterable<string>, threshold: number): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const before = previous[id];
    const now = current[id];
    if (before !== undefined && now !== undefined && before >= threshold && now < threshold) out.push(id);
  }
  return out;
}
