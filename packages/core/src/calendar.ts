// Import del calendario della lega dal file esportato da LegheFC.
// Formato: blocchi affiancati, uno per giornata. Riga d'intestazione "N° Giornata lega" … "M° Giornata serie a",
// poi una riga per partita: casa, punti casa, punti trasferta, trasferta, risultato ("2-5", oppure "-" se da giocare).

import type { Cell } from "./roster";

export interface CalendarMatch {
  home: string;
  away: string;
  /** Fantapunti e gol ufficiali, solo per le partite già calcolate. */
  homePoints: number | null;
  awayPoints: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
}

export interface CalendarDay {
  leagueDay: number;
  serieADay: number;
  matches: CalendarMatch[];
}

export interface CalendarImport {
  title: string | null;
  days: CalendarDay[];
  teams: string[];
  warnings: string[];
}

const text = (c: Cell) => (c === null || c === undefined ? "" : String(c).trim());
const LEAGUE_DAY = /^(\d+)\D*giornata\s+lega/i;
const SERIE_A_DAY = /^(\d+)\D*giornata\s+serie\s*a/i;

export function parseCalendarGrid(grid: Cell[][]): CalendarImport {
  const warnings: string[] = [];
  const days: CalendarDay[] = [];
  const title = text(grid[0]?.[0]) || null;

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const ld = LEAGUE_DAY.exec(text(row[c]));
      if (!ld) continue;
      // La giornata di Serie A è nella stessa riga, poco più a destra.
      let serieADay = 0;
      for (let k = c + 1; k < Math.min(row.length, c + 5); k++) {
        const sa = SERIE_A_DAY.exec(text(row[k]));
        if (sa) { serieADay = Number(sa[1]); break; }
      }
      const matches: CalendarMatch[] = [];
      for (let rr = r + 1; rr < grid.length; rr++) {
        const m = grid[rr] ?? [];
        const home = text(m[c]);
        if (!home || LEAGUE_DAY.test(home)) break;
        const away = text(m[c + 3]);
        if (!away) break;
        const res = /^(\d+)\s*-\s*(\d+)$/.exec(text(m[c + 4]));
        const hp = Number(m[c + 1]), ap = Number(m[c + 2]);
        const played = !!res;
        matches.push({
          home, away,
          homePoints: played && Number.isFinite(hp) ? hp : null,
          awayPoints: played && Number.isFinite(ap) ? ap : null,
          homeGoals: res ? Number(res[1]) : null,
          awayGoals: res ? Number(res[2]) : null,
        });
      }
      if (!serieADay) warnings.push(`Giornata ${ld[1]}: giornata di Serie A non trovata.`);
      days.push({ leagueDay: Number(ld[1]), serieADay, matches });
    }
  }
  days.sort((a, b) => a.leagueDay - b.leagueDay);
  const teams = [...new Set(days.flatMap((d) => d.matches.flatMap((m) => [m.home, m.away])))];
  if (!days.length) warnings.push("Nessuna giornata trovata: servono intestazioni del tipo \"1° Giornata lega\" / \"3° Giornata serie a\".");
  return { title, days, teams, warnings };
}
