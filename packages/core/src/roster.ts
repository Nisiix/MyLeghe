// Import delle rose dal file esportato da "Gestione rose" (LegheFC) o da un'app d'asta.
// Formato: squadre affiancate a gruppi di colonne (nome giocatore, "costo", separatore vuoto);
// riga 1 = nome squadra, poi i giocatori in ordine di ruolo, infine la riga "totale".

import type { LeagueConfig, Role } from "./config";

export type Cell = string | number | null | undefined;

export interface ImportedPlayer {
  name: string;
  cost: number;
  role: Role;
}

export interface ImportedTeam {
  name: string;
  players: ImportedPlayer[];
  spent: number;
}

export interface ImportResult {
  teams: ImportedTeam[];
  warnings: string[];
}

const text = (c: Cell) => (c === null || c === undefined ? "" : String(c).trim());
const isCostHeader = (c: Cell) => /^(costo|prezzo|crediti|cr)$/i.test(text(c));
const isTotal = (c: Cell) => /^totale$/i.test(text(c));

/** Ruolo dalla posizione nella colonna, secondo lo schema della lega (es. 3-8-8-6). */
export function roleForIndex(index: number, scheme: LeagueConfig["rosterScheme"]): Role {
  let acc = 0;
  for (let r = 0; r < 4; r++) {
    acc += scheme[r];
    if (index < acc) return (r + 1) as Role;
  }
  return 4;
}

/** Legge una griglia di celle (da xlsx o csv) e restituisce le squadre con le rose. */
export function parseRosterGrid(grid: Cell[][], scheme: LeagueConfig["rosterScheme"]): ImportResult {
  const warnings: string[] = [];
  const header = grid[0] ?? [];
  const teams: ImportedTeam[] = [];
  const expected = scheme.reduce((a, b) => a + b, 0);

  for (let col = 0; col < header.length; col++) {
    const name = text(header[col]);
    if (!name || isCostHeader(header[col]) || !isCostHeader(header[col + 1])) continue;
    const players: ImportedPlayer[] = [];
    let spent = 0;
    for (let row = 1; row < grid.length; row++) {
      const cell = grid[row]?.[col];
      if (isTotal(cell)) {
        spent = Number(grid[row]?.[col + 1]) || 0;
        break;
      }
      const pname = text(cell);
      if (!pname) continue;
      const cost = Number(grid[row]?.[col + 1]) || 0;
      players.push({ name: pname, cost, role: roleForIndex(players.length, scheme) });
    }
    if (players.length && players.length !== expected) {
      warnings.push(`${name}: ${players.length} giocatori invece di ${expected}: controlla i ruoli assegnati.`);
    }
    if (!spent) spent = players.reduce((a, p) => a + p.cost, 0);
    teams.push({ name, players, spent });
  }
  if (!teams.length) warnings.push("Nessuna squadra trovata: la prima riga deve contenere i nomi delle squadre seguiti da una colonna \"costo\".");
  return { teams, warnings };
}

/** CSV con separatore `,` o `;` (rilevato automaticamente) e campi tra virgolette. */
export function parseCsv(input: string): Cell[][] {
  const textIn = input.replace(/^﻿/, "");
  const firstLine = textIn.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < textIn.length; i++) {
    const ch = textIn[i];
    if (quoted) {
      if (ch === '"' && textIn[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && textIn[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.map((r) => r.map((c) => (typeof c === "string" && /^-?\d+(\.\d+)?$/.test(c.trim()) ? Number(c) : c)));
}
