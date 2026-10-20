import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG, dueReminder, goalsFromPoints, matchPlayer, normalizeConfig, parseCsv, parseRosterGrid,
  parseCalendarGrid, playerLiveScore, projectTeam, scorePlayers, starterDrops, starterProbability, suggestLineup, validateLineup,
  type Cell, type RosterEntry,
} from "../src";

const cfg = DEFAULT_CONFIG;

describe("configurazione", () => {
  it("unisce valori salvati e predefiniti scartando quelli non validi", () => {
    const c = normalizeConfig({ rosterScheme: [3, 8, 8, 6], modules: ["343", "999"], goalSteps: [5], benchCount: "x" });
    expect(c.modules).toEqual(["343"]);
    expect(c.goalSteps).toEqual([5]);
    expect(c.benchCount).toBe(DEFAULT_CONFIG.benchCount);
    expect(c.bonus.goal).toEqual([3, 3, 3, 3]);
  });

  it("converte i fantapunti in gol con le soglie della lega", () => {
    const c = { goalFirst: 66, goalSteps: [5] };
    expect(goalsFromPoints(65.5, c)).toBe(0);
    expect(goalsFromPoints(66, c)).toBe(1);
    expect(goalsFromPoints(87.5, c)).toBe(5);
  });
});

describe("import rose", () => {
  // Stessa struttura del file esportato: squadre a gruppi di 3 colonne, riga "totale" in fondo.
  const players = (prefix: string) => Array.from({ length: 25 }, (_, i) => [`${prefix}${i + 1}`, i + 1] as const);
  const a = players("A"), b = players("B");
  const grid: Cell[][] = [
    ["Squadra Uno", "costo", null, "Squadra Due", "costo", null, "Vuota", "costo"],
    ...a.map((p, i) => [p[0], p[1], null, b[i][0], b[i][1], null, i === 0 ? "totale" : null, i === 0 ? 0 : null]),
    ["totale", 325, null, "totale", 325, null, null, null],
  ];

  it("legge squadre, costi e ruoli secondo lo schema 3-8-8-6", () => {
    const r = parseRosterGrid(grid, [3, 8, 8, 6]);
    expect(r.teams.map((t) => t.name)).toEqual(["Squadra Uno", "Squadra Due", "Vuota"]);
    const t = r.teams[0];
    expect(t.players).toHaveLength(25);
    expect(t.spent).toBe(325);
    expect(t.players.slice(0, 3).every((p) => p.role === 1)).toBe(true);
    expect(t.players[3].role).toBe(2);
    expect(t.players[11].role).toBe(3);
    expect(t.players[19].role).toBe(4);
    expect(r.teams[2].players).toHaveLength(0);
    expect(r.warnings).toEqual([]);
  });

  it("segnala rose con un numero di giocatori diverso dallo schema", () => {
    const r = parseRosterGrid(grid, [3, 8, 8, 5]);
    expect(r.warnings.length).toBe(2);
  });

  it("legge CSV con punto e virgola e virgolette", () => {
    const rows = parseCsv('Squadra;costo\n"Martinez L.";147\nKean;58\n');
    expect(rows).toEqual([["Squadra", "costo"], ["Martinez L.", 147], ["Kean", 58]]);
  });
});

describe("abbinamento nomi", () => {
  const pool = [
    { id: 1, name: "Lautaro Martínez", role: 4 as const },
    { id: 2, name: "Josep Martínez", role: 1 as const },
    { id: 3, name: "Manu Koné", role: 3 as const },
    { id: 4, name: "Sebastiano Esposito", role: 4 as const },
    { id: 5, name: "Francesco Pio Esposito", role: 4 as const },
    { id: 6, name: "André-Frank Zambo Anguissa", role: 3 as const },
    { id: 7, name: "Wesley", role: 2 as const },
  ];

  it("usa le iniziali per distinguere omonimi", () => {
    expect(matchPlayer("Martinez L.", 4, pool).id).toBe(1);
    expect(matchPlayer("Martinez Jo.", 1, pool).id).toBe(2);
    expect(matchPlayer("Esposito Se.", 4, pool).id).toBe(4);
    expect(matchPlayer("Esposito F.P.", 4, pool).id).toBe(5);
  });

  it("tollera gli accenti rovinati e i nomi composti", () => {
    expect(matchPlayer("Kon� M.", 3, pool).id).toBe(3);
    expect(matchPlayer("Zambo Anguissa", 3, pool).id).toBe(6);
    expect(matchPlayer("Wesley", 2, pool).id).toBe(7);
  });

  it("non abbina in caso di ambiguità", () => {
    const r = matchPlayer("Esposito", 4, pool);
    expect(r.id).toBeNull();
    expect(r.candidates.length).toBeGreaterThan(1);
  });
});

describe("titolarità e formazione consigliata", () => {
  it("stima la titolarità", () => {
    expect(starterProbability({ recentStarts: [true, true, true, true, true] })).toBe(100);
    expect(starterProbability({ recentStarts: [true, true, true], unavailable: "injury" })).toBe(0);
    expect(starterProbability({ recentStarts: [true, true, true], doubtful: true })).toBe(50);
    expect(starterProbability({ recentStarts: [false, false], predicted: "starter" })).toBe(70);
    expect(starterProbability({ recentStarts: [true], predicted: "bench", confirmed: true })).toBe(5);
  });

  it("sceglie un modulo ammesso con 11 titolari validi", () => {
    const roster: RosterEntry[] = [
      ...[1, 2].map((i) => ({ id: `p${i}`, name: `P${i}`, role: 1 as const })),
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `d${i}`, name: `D${i}`, role: 2 as const })),
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `c${i}`, name: `C${i}`, role: 3 as const })),
      ...[1, 2, 3, 4].map((i) => ({ id: `a${i}`, name: `A${i}`, role: 4 as const })),
    ];
    const outlook = new Map(roster.map((p) => [p.id, { recentStarts: [p.id !== "p2"], avgFantavote: p.role === 4 ? 7.5 : 6.2 }]));
    const s = suggestLineup(scorePlayers(roster, outlook, cfg), cfg)!;
    expect(cfg.modules).toContain(s.module);
    expect(s.starters[0].id).toBe("p1");
    expect(validateLineup(s.starters, s.bench, s.module, cfg)).toEqual([]);
    expect(s.bench.length).toBeLessThanOrEqual(cfg.benchCount);
  });
});

describe("calcolo live", () => {
  const ev = (o: Partial<Parameters<typeof playerLiveScore>[2] & object>) => ({
    minutes: 90, goals: 0, assists: 0, yellow: 0, red: 0, penaltyScored: 0, penaltyMissed: 0, penaltySaved: 0, ownGoals: 0, goalsConceded: 0, ...o,
  });

  it("calcola il fantavoto stimato con i bonus della lega", () => {
    expect(playerLiveScore("x", 4, ev({ goals: 1, yellow: 1 }), "live", cfg).fantavote).toBe(8.5);
    expect(playerLiveScore("p", 1, ev({}), "finished", cfg).fantavote).toBe(7); // porta inviolata
    expect(playerLiveScore("y", 3, undefined, "pending", cfg).fantavote).toBe(6);
    expect(playerLiveScore("z", 3, undefined, "finished", cfg).state).toBe("absent");
  });

  it("sostituisce i titolari senza voto", () => {
    const s = (id: string, role: 1 | 2 | 3 | 4, fv: number | null) => ({ id, role, state: fv === null ? "absent" as const : "played" as const, vote: fv, bonus: 0, fantavote: fv });
    const p = projectTeam([s("a", 1, 6), s("b", 2, null)], [s("c", 3, 7), s("d", 2, 6.5)], cfg);
    expect(p.substitutions).toEqual([{ out: "b", in: "d" }]);
    expect(p.total).toBe(12.5);
  });
});

describe("promemoria", () => {
  const h = 3600_000;
  it("non invia promemoria già superati", () => {
    expect(dueReminder(30 * h, 7 * h, [24, 3, 1], null)).toBe(24);
    expect(dueReminder(30 * h, 29.5 * h, [24, 3, 1], 24)).toBe(1);
    expect(dueReminder(30 * h, 31 * h, [24, 3, 1], null)).toBeNull();
  });
  it("rileva i cali sotto soglia", () => {
    expect(starterDrops({ a: 90, b: 80 }, { a: 50, b: 75 }, ["a", "b"], 70)).toEqual(["a"]);
  });
});

describe("import calendario", () => {
  it("legge giornate affiancate, giornata di Serie A e risultati", () => {
    const grid = [
      ["Calendario Lega Prova 26/27"], ["https://example.invalid/lega"], [],
      ["1� Giornata lega", null, "3� Giornata serie a", null, null, null, "2� Giornata lega", null, "4� Giornata serie a"],
      ["Alfa", 75, 87.5, "Beta", "2-5", null, "Beta", 0, 0, "Alfa", "-"],
      ["Gamma", 66, 59, "Delta", "1-0", null, "Delta", 0, 0, "Gamma", "-"],
    ];
    const r = parseCalendarGrid(grid);
    expect(r.title).toBe("Calendario Lega Prova 26/27");
    expect(r.days.map((d) => [d.leagueDay, d.serieADay, d.matches.length])).toEqual([[1, 3, 2], [2, 4, 2]]);
    expect(r.days[0].matches[0]).toEqual({ home: "Alfa", away: "Beta", homePoints: 75, awayPoints: 87.5, homeGoals: 2, awayGoals: 5 });
    expect(r.days[1].matches[0].homeGoals).toBeNull();
    expect(r.teams.sort()).toEqual(["Alfa", "Beta", "Delta", "Gamma"]);
  });
});
