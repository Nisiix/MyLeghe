// Abbinamento dei nomi delle rose (formato "Cognome I.") ai giocatori della fonte dati.
// Tollera accenti rovinati nel file (carattere "�"), iniziali e nomi composti.

import type { Role } from "./config";

export interface CandidatePlayer {
  id: number;
  name: string;
  /** Ruolo già convertito in Classic, se noto. */
  role?: Role | null;
  teamName?: string;
}

export interface MatchResult {
  id: number | null;
  /** 0–1: sopra 0.75 l'abbinamento è considerato sicuro. */
  confidence: number;
  candidates: { id: number; name: string; teamName?: string; score: number }[];
}

const WILD = "?";

/** Minuscole, senza accenti né punteggiatura; "�" diventa un jolly. */
export function normalizeName(s: string): string {
  return s
    .replace(/�/g, WILD)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z?\s.'-]/g, " ")
    .replace(/['-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Confronto di due parole con il jolly "?" che vale una lettera qualsiasi. */
function sameWord(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== WILD && b[i] !== WILD && a[i] !== b[i]) return false;
  return true;
}

interface ParsedRosterName {
  surname: string[];
  initials: string[];
}

/** "Martinez L." → cognome [martinez], iniziali [l]; "Ederson D.S." → [ederson], [d, s]. */
export function parseRosterName(name: string): ParsedRosterName {
  const surname: string[] = [];
  const initials: string[] = [];
  for (const tok of normalizeName(name).split(" ")) {
    if (!tok) continue;
    if (tok.includes(".")) initials.push(...tok.split(".").filter(Boolean));
    else surname.push(tok);
  }
  return { surname, initials };
}

export function scoreCandidate(rosterName: string, candidate: CandidatePlayer, role?: Role): number {
  const { surname, initials } = parseRosterName(rosterName);
  const words = normalizeName(candidate.name).replace(/\./g, " ").split(" ").filter(Boolean);
  if (!surname.length || !words.length) return 0;

  // Tutte le parole del cognome devono comparire nel nome del candidato.
  const used = new Set<number>();
  for (const s of surname) {
    const idx = words.findIndex((w, i) => !used.has(i) && sameWord(s, w));
    if (idx < 0) return 0;
    used.add(idx);
  }
  let score = 0.6 + 0.1 * Math.min(surname.length, 2);

  // Iniziali: devono corrispondere all'inizio delle altre parole (es. "Se." → Sebastiano).
  const others = words.filter((_, i) => !used.has(i));
  if (initials.length) {
    const ok = initials.every((ini) => others.some((w) => w.startsWith(ini.replace(/\?/g, "")) || sameWord(ini, w.slice(0, ini.length))));
    score += ok ? 0.2 : -0.35;
  } else if (others.length === 0) {
    score += 0.1; // nome d'arte di una sola parola (es. "Wesley")
  }
  if (role && candidate.role) score += candidate.role === role ? 0.05 : -0.15;
  return Math.max(0, Math.min(1, score));
}

/** Miglior candidato per un nome della rosa; se due candidati sono quasi pari la confidenza scende. */
export function matchPlayer(rosterName: string, role: Role | undefined, pool: CandidatePlayer[]): MatchResult {
  const scored = pool
    .map((c) => ({ id: c.id, name: c.name, teamName: c.teamName, score: scoreCandidate(rosterName, c, role) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { id: null, confidence: 0, candidates: [] };
  const [best, second] = scored;
  const ambiguous = second && best.score - second.score < 0.1;
  const confidence = ambiguous ? Math.min(best.score, 0.6) : best.score;
  return { id: confidence >= 0.75 ? best.id : null, confidence, candidates: scored.slice(0, 5) };
}
