// Configurazione di una lega FootballLite: la imposta l'admin, nessun dato arriva da LegheFC.

/** Ruoli Classic: 1 portiere, 2 difensore, 3 centrocampista, 4 attaccante. */
export type Role = 1 | 2 | 3 | 4;
export const ROLES: Role[] = [1, 2, 3, 4];
export const ROLE_LABEL: Record<number, string> = { 1: "P", 2: "D", 3: "C", 4: "A" };
export const ROLE_NAME: Record<number, string> = { 1: "Portieri", 2: "Difensori", 3: "Centrocampisti", 4: "Attaccanti" };

/** Bonus e malus per ruolo [P, D, C, A]. */
export interface BonusTable {
  goal: number[];
  assist: number[];
  yellow: number[];
  red: number[];
  penaltyScored: number[];
  penaltyMissed: number[];
  penaltySaved: number[];
  ownGoal: number[];
  goalConceded: number[];
  cleanSheet: number[];
}

export interface LeagueConfig {
  /** Giocatori per ruolo nel file delle rose, nell'ordine P, D, C, A. */
  rosterScheme: [number, number, number, number];
  modules: string[];
  benchCount: number;
  /** Prima soglia gol e ampiezza delle successive (l'ultima si ripete). */
  goalFirst: number;
  goalSteps: number[];
  bonus: BonusTable;
  /** Voto ipotizzato per chi deve ancora giocare, o per tutti se non si usa il rating della fonte. */
  baseVote: number;
  /** Stima del voto dal rating della fonte dati (riportato sulla scala dei voti del fantacalcio). */
  voteFromRating: boolean;
  maxSubstitutions: number;
  /** Consente di modificare la formazione a giornata iniziata. */
  allowForcedEdit: boolean;
}

const all = (v: number) => [v, v, v, v];

/** Valori del regolamento Classic più diffuso: l'admin li adatta a quelli della propria lega. */
export const DEFAULT_CONFIG: LeagueConfig = {
  rosterScheme: [3, 8, 8, 6],
  modules: ["343", "352", "433", "442", "451", "532", "541"],
  benchCount: 7,
  goalFirst: 66,
  goalSteps: [6],
  bonus: {
    goal: all(3),
    assist: all(1),
    yellow: all(-0.5),
    red: all(-1),
    penaltyScored: all(3),
    penaltyMissed: all(-3),
    penaltySaved: all(3),
    ownGoal: all(-2),
    goalConceded: [-1, 0, 0, 0],
    cleanSheet: [1, 0, 0, 0],
  },
  baseVote: 6,
  voteFromRating: true,
  maxSubstitutions: 5,
  allowForcedEdit: true,
};

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const roleArr = (v: unknown, d: number[]) =>
  Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? (v as number[]) : d;

/** Unisce una configurazione salvata (anche parziale o vecchia) ai valori predefiniti, scartando valori non validi. */
export function normalizeConfig(raw: unknown): LeagueConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<LeagueConfig>;
  const d = DEFAULT_CONFIG;
  const scheme = roleArr(r.rosterScheme, d.rosterScheme).map((x) => Math.max(0, Math.round(x))) as LeagueConfig["rosterScheme"];
  const modules = Array.isArray(r.modules) ? r.modules.map(String).filter((m) => moduleShape(m)) : [];
  const steps = Array.isArray(r.goalSteps) ? r.goalSteps.map(Number).filter((x) => x > 0) : [];
  const b = (r.bonus ?? {}) as Partial<BonusTable>;
  const bonus = Object.fromEntries(
    (Object.keys(d.bonus) as (keyof BonusTable)[]).map((k) => [k, roleArr(b[k], d.bonus[k])]),
  ) as unknown as BonusTable;
  return {
    rosterScheme: scheme,
    modules: modules.length ? modules : d.modules,
    benchCount: Math.max(0, Math.round(num(r.benchCount, d.benchCount))),
    goalFirst: num(r.goalFirst, d.goalFirst),
    goalSteps: steps.length ? steps : d.goalSteps,
    bonus,
    baseVote: num(r.baseVote, d.baseVote),
    voteFromRating: typeof r.voteFromRating === "boolean" ? r.voteFromRating : d.voteFromRating,
    maxSubstitutions: Math.max(0, Math.round(num(r.maxSubstitutions, d.maxSubstitutions))),
    allowForcedEdit: typeof r.allowForcedEdit === "boolean" ? r.allowForcedEdit : d.allowForcedEdit,
  };
}

/** Difensori, centrocampisti e attaccanti di un modulo Classic ("343" → [3, 4, 3]). */
export function moduleShape(mod: string): [number, number, number] | null {
  const digits = mod.replace(/\D/g, "").split("").map(Number);
  if (digits.length !== 3 || digits.reduce((a, b) => a + b, 0) !== 10) return null;
  return [digits[0], digits[1], digits[2]];
}

/** Gol corrispondenti a un fantapunteggio secondo le soglie della lega. */
export function goalsFromPoints(points: number, cfg: Pick<LeagueConfig, "goalFirst" | "goalSteps">): number {
  if (points < cfg.goalFirst) return 0;
  let goals = 1;
  let threshold = cfg.goalFirst;
  for (let i = 0; goals < 30; i++) {
    threshold += cfg.goalSteps[Math.min(i, cfg.goalSteps.length - 1)];
    if (points < threshold) break;
    goals++;
  }
  return goals;
}
