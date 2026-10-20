// Formazione incollata come testo (es. da un messaggio o da un'altra app): riconosce modulo, titolari,
// panchina, capitano e vice abbinando i nomi del testo ai giocatori della rosa, con l'aiuto dei ruoli indicati.

import { moduleShape, ROLES, type LeagueConfig, type Role } from "./config";
import type { RosterEntry } from "./lineup";
import { normalizeName, parseRosterName } from "./match";

export interface PastedLineup {
  /** Modulo trovato nel testo o dedotto dai titolari (null se non deducibile). */
  module: string | null;
  starters: string[];
  bench: string[];
  captain: string | null;
  vice: string | null;
  /** Righe o nomi del testo non abbinati a nessun giocatore della rosa. */
  unmatched: string[];
  warnings: string[];
}

const ROLE_WORDS: [RegExp, Role][] = [
  [/^(p|por|portier[ei])$/, 1],
  [/^(d|dif|difensor[ei])$/, 2],
  [/^(c|cen|cc|centrocampist[ai])$/, 3],
  [/^(a|att|attaccant[ei])$/, 4],
];
const SECTION_START = /^(titolari|formazione|undici|in campo|campo)\b/;
const SECTION_BENCH = /^(panchina|panchinari|riserve|bench)\b/;
const SECTION_STOP = /^(tribuna|esclusi|fuori|non convocati)\b/;
const SKIP = /^(modulo|giornata|squadra|totale|punti|capitano|vice|capitani|cap|data|ora|lega)\b/;

function roleOf(tok: string): Role | null {
  const t = tok.toLowerCase().replace(/[.:]/g, "");
  for (const [re, r] of ROLE_WORDS) if (re.test(t)) return r;
  return null;
}

/** Modulo scritto come 3-4-3, 3 4 3 o 343 (tre cifre che sommano a 10). */
export function findModule(text: string): string | null {
  const m = text.match(/\b([2-6])\s*[-–/.]?\s*([1-6])\s*[-–/.]?\s*([1-4])\b/);
  if (!m) return null;
  const mod = m[1] + m[2] + m[3];
  return moduleShape(mod) ? mod : null;
}

interface Item { text: string; role: Role | null; captain: boolean; vice: boolean; section: "starters" | "bench" | null }

const stripHeader = (line: string) => line.replace(/^[^:：]*[:：]/, "").trim();

/**
 * Spezza il testo in voci (una per giocatore) con ruolo, sezione e marcatori di capitano.
 * Formati riconosciuti: elenco condiviso da Leghe Fantacalcio («Squadra (3-4-3)», «By …», undici titolari,
 * riga di trattini, panchina), elenchi con sezioni «Titolari»/«Panchina», righe con il ruolo
 * («D Bastoni», «Difensori: Bastoni, Bremer»), marcatori «(C)» e «(VC)».
 */
function items(text: string): Item[] {
  const out: Item[] = [];
  let section: Item["section"] = null;
  let headerRole: Role | null = null;
  const startBench = () => {
    // Separatore senza sezione «Titolari» prima: quanto letto finora sono i titolari.
    if (!out.some((i) => i.section)) for (const i of out) i.section = "starters";
    section = "bench"; headerRole = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    // Riga di trattini (anche con spazi, es. «- - - -»): prima ci sono i titolari, dopo le riserve.
    if (/^[-–—=_*.· ]+$/.test(line) && line.replace(/\s/g, "").length >= 3) { startBench(); continue; }
    const low = normalizeName(line);
    // Intestazioni: nome squadra con il modulo, «By …», «Modulo 3-4-3», «Giornata 8»…
    if (findModule(line) && !/[,;]/.test(line)) continue;
    if (/^by\s/.test(low)) continue;
    if (SECTION_STOP.test(low)) { startBench(); if (!/[:：]/.test(line) || !stripHeader(line)) continue; line = stripHeader(line); }
    else if (SECTION_START.test(low)) { section = "starters"; headerRole = null; if (!/[:：]/.test(line) || !stripHeader(line)) continue; line = stripHeader(line); }
    else if (SECTION_BENCH.test(low)) { startBench(); if (!/[:：]/.test(line) || !stripHeader(line)) continue; line = stripHeader(line); }
    // Riga «Difensori» o «Difensori:» da sola: il ruolo vale per le righe seguenti.
    const solo = roleOf(line.replace(/[:：]\s*$/, ""));
    if (solo) { headerRole = solo; continue; }
    if (SKIP.test(low) && !/[,;]/.test(line) && low.split(" ").length <= 3) continue;
    // Prefisso di ruolo sulla riga: «D Bastoni», «Difensori: Bastoni, Bremer», «(D) Bastoni». Una lettera sola vale solo in maiuscolo.
    let lineRole: Role | null = null;
    const pre = line.match(/^\(?([A-Za-z]{1,14})[.)\]:]?\s+(.+)$/);
    if (pre && roleOf(pre[1]) && (pre[1].length > 1 || pre[1] === pre[1].toUpperCase())) { lineRole = roleOf(pre[1]); line = pre[2]; }
    // Numero di maglia o posizione a inizio riga («1. Sommer», «12 - Carnesecchi»).
    line = line.replace(/^\d{1,2}\s*[.)\-–]?\s*/, "");
    for (let part of line.split(/[,;]|\s{2,}|\s[|/]\s/)) {
      part = part.trim();
      if (!part) continue;
      const vice = /\((vc|v\.?c\.?|vice|vice ?capitano)\)|\bvice\b/i.test(part);
      const captain = !vice && /\((c|cap|capitano)\)|\bcapitano\b/i.test(part);
      // Marcatori di capitano, squadra tra parentesi, ruolo in coda («Bastoni (D)», «Bastoni Dif»), voti e simboli.
      let name = part.replace(/\((c|cap|capitano|vc|v\.?c\.?|vice|vice ?capitano)\)/gi, "").replace(/\b(capitano|vice ?capitano|vice)\b/gi, "");
      let role: Role | null = lineRole ?? headerRole;
      const paren = name.match(/\(([A-Za-z]{1,14})\)/);
      if (paren && roleOf(paren[1])) role = roleOf(paren[1]);
      name = name.replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "").replace(/\s[-–]\s.*$/, "").replace(/[*_~]/g, "").replace(/\s+\d+([.,]\d+)?\s*$/, "").trim();
      const tail = name.match(/^(.+?)\s+([A-Za-z]{2,14})$/);
      if (!role && tail && roleOf(tail[2])) { role = roleOf(tail[2]); name = tail[1]; }
      const head = name.match(/^([A-Z]{1,3})[.)\]:]?\s+(.+)$/);
      if (!lineRole && head && roleOf(head[1])) { role = roleOf(head[1]); name = head[2]; }
      name = name.trim();
      if (!/[a-zà-ÿ]{2,}/i.test(name)) continue;
      out.push({ text: name, role, captain, vice, section });
    }
  }
  return out;
}

/** Punteggio dell'abbinamento tra un nome del testo e un giocatore della rosa ("Cognome I."). */
function score(text: string, p: RosterEntry, role: Role | null): number {
  const { surname, initials } = parseRosterName(p.name);
  const words = normalizeName(text).replace(/\./g, " ").split(" ").filter(Boolean);
  if (!surname.length || !words.length) return 0;
  const used = new Set<number>();
  for (const s of surname) {
    const idx = words.findIndex((w, i) => !used.has(i) && (w === s || (s.includes("?") && w.length === s.length && [...s].every((ch, k) => ch === "?" || ch === w[k]))));
    if (idx < 0) return 0;
    used.add(idx);
  }
  let sc = 0.6 + 0.1 * Math.min(surname.length, 2);
  const others = words.filter((_, i) => !used.has(i));
  if (initials.length && others.length) {
    const ok = initials.every((ini) => others.some((w) => w.startsWith(ini.replace(/\?/g, ""))));
    sc += ok ? 0.2 : -0.3;
  } else if (!others.length) {
    sc += 0.05;
  }
  if (role) sc += p.role === role ? 0.1 : -0.3;
  return Math.max(0, Math.min(1, sc));
}

/**
 * Legge una formazione incollata e la abbina alla rosa. Senza indicazioni di sezione, con il modulo
 * si prendono come titolari i primi giocatori per ruolo secondo il modulo; altrimenti i primi 11.
 */
export function parseLineupText(text: string, roster: RosterEntry[], cfg: LeagueConfig): PastedLineup {
  const warnings: string[] = [];
  const unmatched: string[] = [];
  const explicitModule = findModule(text);
  const list = items(text);
  const taken = new Set<string>();
  const matched: { id: string; role: Role; captain: boolean; vice: boolean; section: Item["section"] }[] = [];

  for (const it of list) {
    const scored = roster
      .filter((p) => !taken.has(p.id))
      .map((p) => ({ p, s: score(it.text, p, it.role) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    const [best, second] = scored;
    if (!best || best.s < 0.5) { unmatched.push(it.text); continue; }
    if (second && best.s - second.s < 0.1) {
      warnings.push(`«${it.text}» può essere ${best.p.name} o ${second.p.name}: scrivi anche l'iniziale del nome.`);
      unmatched.push(it.text);
      continue;
    }
    taken.add(best.p.id);
    matched.push({ id: best.p.id, role: best.p.role, captain: it.captain, vice: it.vice, section: it.section });
  }

  // Titolari e panchina: dalle sezioni se presenti, altrimenti dal modulo o dai primi 11.
  const hasSections = matched.some((m) => m.section === "starters") && matched.some((m) => m.section === "bench");
  let starters: typeof matched = [], bench: typeof matched = [];
  if (hasSections) {
    starters = matched.filter((m) => m.section === "starters");
    bench = matched.filter((m) => m.section !== "starters");
  } else if (matched.some((m) => m.section === "bench") && !matched.some((m) => m.section === "starters")) {
    starters = matched.filter((m) => m.section !== "bench");
    bench = matched.filter((m) => m.section === "bench");
  } else if (explicitModule) {
    const want = [1, ...moduleShape(explicitModule)!];
    const count = [0, 0, 0, 0];
    for (const m of matched) {
      const i = ROLES.indexOf(m.role);
      if (count[i] < want[i]) { count[i]++; starters.push(m); } else bench.push(m);
    }
  } else {
    starters = matched.slice(0, 11);
    bench = matched.slice(11);
  }

  // Modulo: quello scritto, se ammesso; altrimenti dedotto dai titolari (D-C-A).
  const counts = ROLES.map((r) => starters.filter((m) => m.role === r).length);
  const deduced = counts[0] === 1 && counts[1] + counts[2] + counts[3] === 10 ? `${counts[1]}${counts[2]}${counts[3]}` : null;
  let module: string | null = explicitModule ?? deduced;
  if (explicitModule && deduced && explicitModule !== deduced && hasSections) warnings.push(`Nel testo c'è il modulo ${fmtMod(explicitModule)} ma i titolari formano un ${fmtMod(deduced)}.`);
  if (module && !cfg.modules.includes(module)) {
    warnings.push(`Il modulo ${fmtMod(module)} non è tra quelli ammessi dalla lega.`);
    if (deduced && cfg.modules.includes(deduced)) module = deduced;
  }
  if (starters.length !== 11) warnings.push(`Trovati ${starters.length} titolari invece di 11.`);
  if (bench.length > cfg.benchCount) warnings.push(`In panchina ci sono ${bench.length} giocatori: la lega ne ammette ${cfg.benchCount}, gli ultimi sono stati esclusi.`);

  const captain = starters.find((m) => m.captain)?.id ?? null;
  const vice = starters.find((m) => m.vice && m.id !== captain)?.id ?? null;
  return { module, starters: starters.map((m) => m.id), bench: bench.slice(0, cfg.benchCount).map((m) => m.id), captain, vice, unmatched, warnings };
}

const fmtMod = (m: string) => m.split("").join("-");
