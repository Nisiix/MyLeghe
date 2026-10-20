// Regolamento di una lega FootballLite: lo imposta l'admin (stesse voci del regolamento di Leghe Fantacalcio).

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
  /** Voci che le fonti gratuite non permettono di calcolare: restano nel regolamento ma non sono applicate. */
  assistSoft: number[];
  assistGold: number[];
  decisiveGoalWin: number[];
  decisiveGoalDraw: number[];
  playerOfTheMatch: number[];
}

/** Bonus/malus che dipendono da dati non disponibili nelle fonti usate. */
export const BONUS_NOT_COMPUTABLE: (keyof BonusTable)[] = ["assistSoft", "assistGold", "decisiveGoalWin", "decisiveGoalDraw", "playerOfTheMatch"];

/** Fascia di una tabella: vale `value` quando il dato è ≥ `from` (si applica la fascia più alta raggiunta). */
export interface Band { from: number; value: number }

export interface Modifiers {
  defense: {
    enabled: boolean;
    /** Media voto del portiere insieme ai difensori. */
    includeGoalkeeper: boolean;
    /** Difensori in campo necessari per applicarlo. */
    minDefenders: number;
    /** Difensori (i migliori per voto) che entrano nella media. */
    defendersCounted: number;
    bands: Band[];
    /** "own": bonus alla propria squadra; "opponent": sottratto all'avversario. */
    applyTo: "own" | "opponent";
  };
  goalkeeper: { enabled: boolean; bands: Band[] };
  /** Differenza tra le somme dei voti dei centrocampisti delle due squadre: bonus a chi vince, malus a chi perde. */
  midfield: { enabled: boolean; bands: Band[] };
  /** Per ogni attaccante senza gol con voto nella fascia. */
  attack: { enabled: boolean; bands: Band[]; excludeWithAssist: boolean };
  captain: {
    enabled: boolean;
    doubleBonus: boolean;
    doubleMalus: boolean;
    /** Bonus in base al voto del capitano (vuota = nessuno). */
    bands: Band[];
  };
  /** Bonus se nessun giocatore conteggiato è stato ammonito o espulso. */
  fairPlay: { enabled: boolean; value: number };
  homeAdvantage: { enabled: boolean; value: number };
  /** Bonus/malus fisso per modulo schierato. */
  module: Record<string, number>;
}

export interface LeagueConfig {
  /** Giocatori per ruolo nel file delle rose, nell'ordine P, D, C, A. */
  rosterScheme: [number, number, number, number];
  modules: string[];
  benchCount: number;
  /** Panchinari per ruolo [P, D, C, A]; null = liberi entro il totale. */
  benchPerRole: [number, number, number, number] | null;
  goalFirst: number;
  /** Ampiezza delle soglie successive (l'ultima si ripete). */
  goalSteps: number[];
  goalRules: {
    /** Con pari gol, chi supera l'avversario di almeno questi punti segna un gol in più (0 = no). */
    winByMargin: number;
    winByMarginUnderFirst: boolean;
    /** Con gol diversi ma scarto inferiore a questi punti, pareggio (0 = no). */
    drawWithin: number;
    drawWithinUnderFirst: boolean;
    /** Sotto questo punteggio si regala un gol all'avversario (0 = no). */
    ownGoalBelow: number;
  };
  bonus: BonusTable;
  /** Voto per chi gioca quando il modello scelto non ha dati (e per tutti con voteModel "base"). */
  baseVote: number;
  /**
   * Come si stima il voto: "stats" = voto statistico FootballLite (statistiche per giocatore),
   * "rating" = rating della fonte riportato sulla scala del fantacalcio, "base" = voto base a tutti.
   */
  voteModel: "stats" | "rating" | "base";
  /** Chi gioca meno di 12 minuti con la sola ammonizione: "none" = senza voto, "base" = voto base con il malus. */
  yellowShortVote: "none" | "base";
  substitutions: {
    max: number;
    /** "role": panchinaro dello stesso ruolo; "free": anche altro ruolo se il modulo risultante è ammesso. */
    mode: "role" | "free";
    /** Voto d'ufficio a un titolare senza voto e senza sostituto (null = nessun voto). */
    officeVoteGoalkeeper: number | null;
    officeVoteField: number | null;
  };
  modifiers: Modifiers;
  noLineup: {
    /** "none": nessun risultato finché qualcuno non la inserisce; "last": ultima formazione inserita; "fixed": punteggio fisso. */
    mode: "none" | "last" | "fixed";
    points: number;
  };
  /** Consente di modificare la propria formazione a giornata iniziata. */
  allowForcedEdit: boolean;
}

const all = (v: number) => [v, v, v, v];

/** Valori del regolamento Classic più diffuso: l'admin li adatta a quelli della propria lega. */
export const DEFAULT_CONFIG: LeagueConfig = {
  rosterScheme: [3, 8, 8, 6],
  modules: ["343", "352", "433", "442", "451", "532", "541"],
  benchCount: 7,
  benchPerRole: null,
  goalFirst: 66,
  goalSteps: [6],
  goalRules: { winByMargin: 0, winByMarginUnderFirst: false, drawWithin: 0, drawWithinUnderFirst: false, ownGoalBelow: 0 },
  bonus: {
    goal: all(3), assist: all(1), yellow: all(-0.5), red: all(-1), penaltyScored: all(3), penaltyMissed: all(-3),
    penaltySaved: all(3), ownGoal: all(-2), goalConceded: [-1, 0, 0, 0], cleanSheet: [1, 0, 0, 0],
    assistSoft: all(0.5), assistGold: all(1.5), decisiveGoalWin: all(0), decisiveGoalDraw: all(0), playerOfTheMatch: all(0),
  },
  baseVote: 6,
  voteModel: "stats",
  yellowShortVote: "none",
  substitutions: { max: 5, mode: "role", officeVoteGoalkeeper: null, officeVoteField: null },
  modifiers: {
    defense: {
      enabled: false, includeGoalkeeper: true, minDefenders: 4, defendersCounted: 3,
      bands: [{ from: 6, value: 1 }, { from: 6.5, value: 3 }, { from: 7, value: 6 }], applyTo: "own",
    },
    goalkeeper: { enabled: false, bands: [{ from: 6.5, value: 1 }, { from: 7, value: 2 }, { from: 7.5, value: 3 }] },
    midfield: { enabled: false, bands: [{ from: 2, value: 1 }, { from: 4, value: 2 }, { from: 6, value: 3 }, { from: 8, value: 4 }] },
    attack: { enabled: false, bands: [{ from: 6.5, value: 0.5 }, { from: 7, value: 1 }, { from: 7.5, value: 1.5 }], excludeWithAssist: false },
    captain: { enabled: false, doubleBonus: true, doubleMalus: false, bands: [] },
    fairPlay: { enabled: false, value: 1 },
    homeAdvantage: { enabled: false, value: 2 },
    module: {},
  },
  noLineup: { mode: "none", points: 0 },
  allowForcedEdit: true,
};

// ---- Normalizzazione di configurazioni salvate (anche vecchie o parziali) -------------------------

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const roleArr = (v: unknown, d: number[]) =>
  Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? (v as number[]) : d;
const bandList = (v: unknown, d: Band[]): Band[] =>
  Array.isArray(v)
    ? v.filter((b) => b && Number.isFinite(Number(b.from)) && Number.isFinite(Number(b.value)))
      .map((b) => ({ from: Number(b.from), value: Number(b.value) }))
      .sort((a, b) => a.from - b.from)
    : d;
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, any>) : {});
const office = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function normalizeConfig(raw: unknown): LeagueConfig {
  const r = obj(raw);
  const d = DEFAULT_CONFIG;
  const scheme = roleArr(r.rosterScheme, d.rosterScheme).map((x) => Math.max(0, Math.round(x))) as LeagueConfig["rosterScheme"];
  const modules = Array.isArray(r.modules) ? r.modules.map(String).filter((m: string) => moduleShape(m)) : [];
  const steps = Array.isArray(r.goalSteps) ? r.goalSteps.map(Number).filter((x: number) => x > 0) : [];
  const b = obj(r.bonus);
  const bonus = Object.fromEntries((Object.keys(d.bonus) as (keyof BonusTable)[]).map((k) => [k, roleArr(b[k], d.bonus[k])])) as unknown as BonusTable;
  const gr = obj(r.goalRules), sub = obj(r.substitutions), m = obj(r.modifiers), nl = obj(r.noLineup);
  const md = obj(m.defense), mg = obj(m.goalkeeper), mm = obj(m.midfield), ma = obj(m.attack), mc = obj(m.captain), mf = obj(m.fairPlay), mh = obj(m.homeAdvantage);
  const benchPerRole = Array.isArray(r.benchPerRole)
    ? (roleArr(r.benchPerRole, [0, 0, 0, 0]).map((x) => Math.max(0, Math.round(x))) as LeagueConfig["benchPerRole"])
    : null;
  const dm = d.modifiers;
  return {
    rosterScheme: scheme,
    modules: modules.length ? modules : d.modules,
    benchCount: Math.max(0, Math.round(num(r.benchCount, d.benchCount))),
    benchPerRole,
    goalFirst: num(r.goalFirst, d.goalFirst),
    goalSteps: steps.length ? steps : d.goalSteps,
    goalRules: {
      winByMargin: Math.max(0, num(gr.winByMargin, 0)),
      winByMarginUnderFirst: bool(gr.winByMarginUnderFirst, false),
      drawWithin: Math.max(0, num(gr.drawWithin, 0)),
      drawWithinUnderFirst: bool(gr.drawWithinUnderFirst, false),
      ownGoalBelow: Math.max(0, num(gr.ownGoalBelow, 0)),
    },
    bonus,
    baseVote: num(r.baseVote, d.baseVote),
    // Compatibilità: la prima versione aveva solo voteFromRating.
    voteModel: r.voteModel === "rating" || r.voteModel === "base" || r.voteModel === "stats" ? r.voteModel : r.voteFromRating === false ? "base" : d.voteModel,
    yellowShortVote: r.yellowShortVote === "base" ? "base" : "none",
    substitutions: {
      // Compatibilità con la prima versione del regolamento (maxSubstitutions).
      max: Math.max(0, Math.round(num(sub.max ?? r.maxSubstitutions, d.substitutions.max))),
      mode: sub.mode === "free" ? "free" : "role",
      officeVoteGoalkeeper: office(sub.officeVoteGoalkeeper),
      officeVoteField: office(sub.officeVoteField),
    },
    modifiers: {
      defense: {
        enabled: bool(md.enabled, false),
        includeGoalkeeper: bool(md.includeGoalkeeper, dm.defense.includeGoalkeeper),
        minDefenders: Math.max(0, Math.round(num(md.minDefenders, dm.defense.minDefenders))),
        defendersCounted: Math.max(1, Math.round(num(md.defendersCounted, dm.defense.defendersCounted))),
        bands: bandList(md.bands, dm.defense.bands),
        applyTo: md.applyTo === "opponent" ? "opponent" : "own",
      },
      goalkeeper: { enabled: bool(mg.enabled, false), bands: bandList(mg.bands, dm.goalkeeper.bands) },
      midfield: { enabled: bool(mm.enabled, false), bands: bandList(mm.bands, dm.midfield.bands) },
      attack: { enabled: bool(ma.enabled, false), bands: bandList(ma.bands, dm.attack.bands), excludeWithAssist: bool(ma.excludeWithAssist, false) },
      captain: {
        enabled: bool(mc.enabled, false),
        doubleBonus: bool(mc.doubleBonus, dm.captain.doubleBonus),
        doubleMalus: bool(mc.doubleMalus, dm.captain.doubleMalus),
        bands: bandList(mc.bands, []),
      },
      fairPlay: { enabled: bool(mf.enabled, false), value: num(mf.value, dm.fairPlay.value) },
      homeAdvantage: { enabled: bool(mh.enabled, false), value: num(mh.value, dm.homeAdvantage.value) },
      module: Object.fromEntries(
        Object.entries(obj(m.module)).filter(([k, v]) => moduleShape(k) && Number.isFinite(Number(v)) && Number(v) !== 0).map(([k, v]) => [k, Number(v)]),
      ),
    },
    noLineup: { mode: nl.mode === "last" || nl.mode === "fixed" ? nl.mode : "none", points: num(nl.points, 0) },
    allowForcedEdit: bool(r.allowForcedEdit, d.allowForcedEdit),
  };
}

/** Difensori, centrocampisti e attaccanti di un modulo Classic ("343" → [3, 4, 3]). */
export function moduleShape(mod: string): [number, number, number] | null {
  const digits = mod.replace(/\D/g, "").split("").map(Number);
  if (digits.length !== 3 || digits.reduce((a, b) => a + b, 0) !== 10) return null;
  return [digits[0], digits[1], digits[2]];
}

/** Valore della fascia più alta raggiunta (0 se nessuna). */
export function bandValue(list: Band[], x: number): number {
  let v = 0;
  for (const b of list) if (x >= b.from) v = b.value;
  return v;
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

/** Risultato di una partita: soglie gol più le regole della lega (scarto minimo, pareggio forzato, autogol). */
export function matchGoals(home: number, away: number, cfg: Pick<LeagueConfig, "goalFirst" | "goalSteps" | "goalRules">): [number, number] {
  let gh = goalsFromPoints(home, cfg);
  let ga = goalsFromPoints(away, cfg);
  const r = cfg.goalRules;
  if (r.ownGoalBelow > 0) {
    if (home < r.ownGoalBelow) ga++;
    if (away < r.ownGoalBelow) gh++;
  }
  const diff = Math.abs(home - away);
  const underFirst = Math.max(home, away) < cfg.goalFirst;
  if (r.winByMargin > 0 && gh === ga && diff >= r.winByMargin && (!underFirst || r.winByMarginUnderFirst)) {
    if (home > away) gh++; else ga++;
  }
  if (r.drawWithin > 0 && gh !== ga && diff < r.drawWithin && (!underFirst || r.drawWithinUnderFirst)) {
    gh = ga = Math.min(gh, ga);
  }
  return [gh, ga];
}
