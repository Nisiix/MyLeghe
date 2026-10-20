// Calibrazione del voto statistico sui risultati ufficiali della lega.
// Per le giornate in cui il calendario importato ha i punteggi ufficiali, si confrontano con quelli calcolati da
// FootballLite sulle stesse formazioni. Lo scarto di ogni squadra si attribuisce ai voti dei giocatori conteggiati:
//   scarto ≈ (scala − 1) · Σ(voto − 6) + spostamento · (giocatori con voto)
// e si stimano scala e spostamento con i minimi quadrati, tirati verso "nessuna correzione" finché i dati sono pochi.

/** Correzione dei voti stimati: voto' = 6 + scala · (voto − 6) + spostamento. */
export interface Calibration {
  offset: number;
  scale: number;
  /** Punteggi di squadra confrontati. */
  samples: number;
  /** Scarto medio assoluto tra punteggi ufficiali e calcolati, prima e dopo la correzione. */
  maeBefore: number;
  maeAfter: number;
}

export interface CalibrationSample {
  /** Punteggio ufficiale della squadra (dal calendario importato). */
  official: number;
  /** Punteggio calcolato da FootballLite senza correzione. */
  computed: number;
  /** Voti stimati dei giocatori conteggiati (esclusi voti d'ufficio). */
  votes: number[];
}

/** Sotto questo numero di punteggi la correzione non si calcola. */
export const MIN_CALIBRATION_SAMPLES = 6;
/** Peso della prudenza: equivale a questo numero di punteggi "senza scarto" aggiunti ai dati. */
const PRIOR_SAMPLES = 4;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

export function fitCalibration(samples: CalibrationSample[]): Calibration | null {
  const rows = samples.filter((s) => s.votes.length > 0 && Number.isFinite(s.official) && Number.isFinite(s.computed))
    .map((s) => ({ d: s.official - s.computed, S: s.votes.reduce((a, v) => a + (v - 6), 0), N: s.votes.length }));
  if (rows.length < MIN_CALIBRATION_SAMPLES) return null;
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const ss = sum((r) => r.S * r.S), nn = sum((r) => r.N * r.N), sn = sum((r) => r.S * r.N);
  const sd = sum((r) => r.S * r.d), nd = sum((r) => r.N * r.d);
  // Regolarizzazione proporzionale alla scala tipica dei dati.
  const la = (PRIOR_SAMPLES * ss) / rows.length || 1, lb = (PRIOR_SAMPLES * nn) / rows.length || 1;
  const a11 = ss + la, a22 = nn + lb, det = a11 * a22 - sn * sn;
  if (!det) return null;
  const a = clamp((sd * a22 - sn * nd) / det, -0.4, 0.6);
  const b = clamp((a11 * nd - sn * sd) / det, -0.5, 0.5);
  const mae = (f: (r: (typeof rows)[number]) => number) => r2(sum((r) => Math.abs(f(r))) / rows.length);
  return { offset: r2(b), scale: r2(1 + a), samples: rows.length, maeBefore: mae((r) => r.d), maeAfter: mae((r) => r.d - a * r.S - b * r.N) };
}
