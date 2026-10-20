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
  /** 0–1: da 0.75 l'abbinamento è considerato sicuro (da 0.65 se il cognome compare in un solo giocatore della fonte). */
  confidence: number;
  candidates: { id: number; name: string; teamName?: string; score: number }[];
}

const WILD = "?";

/** Lettere che la scomposizione Unicode non riduce a una lettera latina (ð di Guðmundsson, ø di Ødegaard…). */
const SPECIAL: Record<string, string> = { "ð": "d", "Ð": "d", "þ": "th", "Þ": "th", "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe", "ß": "ss", "ł": "l", "Ł": "l", "đ": "d", "Đ": "d", "ħ": "h", "Ħ": "h", "ı": "i", "ŀ": "l" };

/** Minuscole, senza accenti né punteggiatura; "�" diventa un jolly. */
export function normalizeName(s: string): string {
  return s
    .replace(/�/g, WILD)
    .replace(/[ðÐþÞøØæÆœŒßłŁđĐħĦıŀ]/g, (ch) => SPECIAL[ch] ?? ch)
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
  // Ruolo: i ruoli del fantacalcio non coincidono sempre con la posizione della fonte (es. esterno D/C),
  // quindi uno scarto di un ruolo pesa poco; portiere contro giocatore di movimento o D contro A pesa molto.
  if (role && candidate.role) {
    const gap = Math.abs(candidate.role - role);
    score += gap === 0 ? 0.05 : gap === 1 && role !== 1 && candidate.role !== 1 ? -0.05 : -0.2;
  }
  // Arrotondato: le somme in virgola mobile non devono far mancare una soglia per un millesimo.
  return Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000;
}

/**
 * Miglior candidato per un nome della rosa; se due candidati sono quasi pari la confidenza scende.
 * Un cognome che compare in un solo giocatore della fonte basta anche con ruolo diverso (soglia più bassa).
 */
export function matchPlayer(rosterName: string, role: Role | undefined, pool: CandidatePlayer[]): MatchResult {
  const scored = pool
    .map((c) => ({ id: c.id, name: c.name, teamName: c.teamName, score: scoreCandidate(rosterName, c, role) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { id: null, confidence: 0, candidates: [] };
  // Lo stesso giocatore compare due volte nel pool (nome completo e nome breve): l'ambiguità si misura
  // solo con il miglior candidato che è un giocatore diverso.
  const best = scored[0];
  const second = scored.find((c) => c.id !== best.id);
  const ambiguous = !!second && Math.round((best.score - second.score) * 1000) < 100;
  const confidence = ambiguous ? Math.min(best.score, 0.6) : best.score;
  const unique = !second;
  const threshold = unique ? 0.65 : 0.75;
  return { id: confidence >= threshold ? best.id : null, confidence, candidates: scored.slice(0, 5) };
}
