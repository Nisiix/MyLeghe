import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG, dueReminder, goalsFromPoints, matchPlayer, normalizeConfig, parseCsv, parseRosterGrid,
  parseCalendarGrid, parseLineupText, playerLiveScore, computeTeam, statVote, subRolesFromLineup, voteEligibility, fitCalibration, computeMatch, matchGoals, noLineupScore, scorePlayers, starterDrops, starterProbability, suggestLineup, validateLineup,
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
    expect(r.teams.map((t) => t.name)).toEqual(["Squadra Uno", "Squadra Due"]);
    const t = r.teams[0];
    expect(t.players).toHaveLength(25);
    expect(t.spent).toBe(325);
    expect(t.players.slice(0, 3).every((p) => p.role === 1)).toBe(true);
    expect(t.players[3].role).toBe(2);
    expect(t.players[11].role).toBe(3);
    expect(t.players[19].role).toBe(4);
    expect(r.warnings).toEqual(["Ignorate perché senza giocatori: Vuota."]);
  });

  it("segnala rose con un numero di giocatori diverso dallo schema", () => {
    const r = parseRosterGrid(grid, [3, 8, 8, 5]);
    expect(r.warnings.filter((w) => w.includes("invece di 24"))).toHaveLength(2);
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

  it("abbina il cognome senza iniziale anche se la fonte dà una posizione diversa (es. esterno D/C)", () => {
    const pool2 = [
      { id: 10, name: "Federico Dimarco", role: 3 as const },
      { id: 11, name: "Nicolò Barella", role: 3 as const },
      { id: 12, name: "Davide Frattesi", role: 3 as const },
      ...pool,
    ];
    expect(matchPlayer("Dimarco", 2, pool2).id).toBe(10);
    expect(matchPlayer("Frattesi", 4, pool2).id).toBe(12);
    // Portiere contro giocatore di movimento con lo stesso cognome: vince il ruolo giusto, senza ambiguità.
    expect(matchPlayer("Martinez", 4, pool2).id).toBe(1);
    // Cognome unico ma ruolo lontano (D contro A): resta da verificare.
    expect(matchPlayer("Barella", 1, pool2).id).toBeNull();
  });

  it("il nome breve dello stesso giocatore non crea ambiguità", () => {
    const pool3 = [
      { id: 40, name: "Guglielmo Vicario", role: 1 as const }, { id: 40, name: "G. Vicario", role: 1 as const },
      { id: 41, name: "Federico Dimarco", role: 3 as const }, { id: 41, name: "F. Dimarco", role: 3 as const },
    ];
    expect(matchPlayer("Vicario", 1, pool3).id).toBe(40);
    expect(matchPlayer("Vicario", 1, pool3).confidence).toBeGreaterThanOrEqual(0.75);
    expect(matchPlayer("Dimarco", 2, pool3).id).toBe(41);
  });

  it("con cognomi uguali decidono l'iniziale del nome e il ruolo", () => {
    const thurams = [{ id: 20, name: "Marcus Thuram", role: 4 as const }, { id: 21, name: "Khéphren Thuram", role: 3 as const }];
    expect(matchPlayer("Thuram M.", 4, thurams).id).toBe(20);
    expect(matchPlayer("Thuram K.", 3, thurams).id).toBe(21);
    // Senza iniziale decide il ruolo; con lo stesso ruolo e senza iniziale si lascia la scelta all'utente.
    expect(matchPlayer("Thuram", 4, thurams).id).toBe(20);
    expect(matchPlayer("Thuram", 3, thurams).id).toBe(21);
    const same = [{ id: 30, name: "Marco Rossi", role: 2 as const }, { id: 31, name: "Luca Rossi", role: 2 as const }];
    const r = matchPlayer("Rossi", 2, same);
    expect(r.id).toBeNull();
    expect(r.candidates.map((c) => c.id).sort()).toEqual([30, 31]);
    expect(matchPlayer("Rossi L.", 2, same).id).toBe(31);
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

  it("arrotonda la titolarità al 5% più vicino", () => {
    // 1 − 0,25 = 75% esatto; (0,35 + 0,25) / 0,78 ≈ 77% → 75; 0,35 / 0,78 ≈ 45% → 45.
    expect(starterProbability({ recentStarts: [true, false, true, true, true] })).toBe(75);
    expect(starterProbability({ recentStarts: [true, true, false] })).toBe(75);
    expect(starterProbability({ recentStarts: [true, false, false] })).toBe(45);
    // 0,7 + 0,25 × 0,35 / 0,78 ≈ 81% → 80.
    expect(starterProbability({ recentStarts: [true, false, false], predicted: "starter" })).toBe(80);
    for (const o of [{ recentStarts: [true, true, false, true] }, { recentStarts: [false, true], doubtful: true }]) {
      expect(starterProbability(o) % 5).toBe(0);
    }
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
    expect(validateLineup({ starters: s.starters, bench: s.bench, module: s.module }, cfg)).toEqual([]);
    expect(s.captain).not.toBeNull();
    expect(s.bench.length).toBeLessThanOrEqual(cfg.benchCount);
  });
});

describe("formazione consigliata senza dati della fonte", () => {
  it("a parità di stima sceglie per costo d'asta", () => {
    const roster: RosterEntry[] = [
      { id: "p1", name: "P1", role: 1, cost: 1 }, { id: "p2", name: "P2", role: 1, cost: 20 },
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `d${i}`, name: `D${i}`, role: 2 as const, cost: i })),
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `c${i}`, name: `C${i}`, role: 3 as const, cost: 10 - i })),
      ...[1, 2, 3, 4].map((i) => ({ id: `a${i}`, name: `A${i}`, role: 4 as const, cost: i * 30 })),
    ];
    const s = suggestLineup(scorePlayers(roster, new Map(), cfg), cfg)!;
    expect(s.starters[0].id).toBe("p2");
    expect(s.starters.map((p) => p.id)).toContain("a4");
    expect(s.starters.map((p) => p.id)).not.toContain("d1");
    expect(s.captain).toBe("a4");
    expect(s.bench[0].id).toBe("p1");
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

  const P = (id: string, role: 1 | 2 | 3 | 4, vote: number | null, extra: Partial<{ bonus: number; yellow: number; goals: number; state: "played" | "pending" | "absent" }> = {}) => ({
    id, role, vote, bonus: extra.bonus ?? 0, fantavote: vote === null ? null : vote + (extra.bonus ?? 0),
    state: extra.state ?? (vote === null ? "absent" as const : "played" as const), yellow: extra.yellow ?? 0, red: 0, goals: extra.goals ?? 0, assists: 0,
  });
  const xi = () => [P("p", 1, 6), P("d1", 2, 6), P("d2", 2, 6.5), P("d3", 2, 7), P("d4", 2, 6), P("c1", 3, 6), P("c2", 3, 6), P("c3", 3, 6), P("c4", 3, 6), P("a1", 4, 6), P("a2", 4, 6)];

  it("sostituisce per ruolo e assegna il voto d'ufficio", () => {
    const starters = xi(); starters[1] = P("d1", 2, null); starters[9] = P("a1", 4, null);
    const c = { ...cfg, substitutions: { ...cfg.substitutions, officeVoteField: 4 } };
    const t = computeTeam({ module: "442", starters, bench: [P("b1", 3, 7), P("b2", 2, 6.5)] }, c, true);
    expect(t.substitutions).toEqual([{ out: "d1", in: "b2" }, { out: "a1", in: null }]);
    expect(t.base).toBe(6 + 6.5 + 6.5 + 7 + 6 + 6 * 4 + 4 + 6);
  });

  it("sostituzione libera solo se il modulo risultante è ammesso", () => {
    const starters = xi(); starters[1] = P("d1", 2, null);
    const free = { ...cfg, substitutions: { ...cfg.substitutions, mode: "free" as const } };
    expect(computeTeam({ module: "442", starters, bench: [P("b1", 3, 7)] }, free, true).substitutions).toEqual([{ out: "d1", in: "b1" }]); // 3-5-2 ammesso
    expect(computeTeam({ module: "442", starters, bench: [P("b1", 3, 7)] }, cfg, true).substitutions).toEqual([]); // per ruolo: no
  });

  it("in parziale chi deve giocare non conta e non viene sostituito", () => {
    const starters = xi(); starters[5] = P("c1", 3, 6, { state: "pending" });
    const t = computeTeam({ module: "442", starters, bench: [P("b1", 3, 7)] }, cfg, false);
    expect(t.substitutions).toEqual([]);
    expect(t.counted.length).toBe(10);
  });

  it("applica capitano e modificatori", () => {
    const c = {
      ...cfg,
      modifiers: {
        ...cfg.modifiers,
        captain: { enabled: true, doubleBonus: true, doubleMalus: false, bands: [] },
        defense: { ...cfg.modifiers.defense, enabled: true },
        goalkeeper: { enabled: true, bands: [{ from: 6, value: 1 }] },
        fairPlay: { enabled: true, value: 1 },
      },
    };
    const starters = xi(); starters[9] = P("a1", 4, 7, { bonus: 3, goals: 1 });
    const t = computeTeam({ module: "442", starters, bench: [], captain: "a1", vice: "a2" }, c, true);
    // difesa: migliori 3 difensori (7, 6.5, 6) + portiere 6 → media 6.375 → fascia 6 → +1
    expect(t.mods).toEqual([{ label: "Capitano", value: 3 }, { label: "Modificatore portiere", value: 1 }, { label: "Modificatore difesa", value: 1 }, { label: "Fair play", value: 1 }]);
    expect(t.total).toBe(t.base + 6);
  });

  it("modificatori di partita: centrocampo, difesa all'avversario, fattore campo e regole gol", () => {
    const c = {
      ...cfg,
      modifiers: { ...cfg.modifiers, midfield: { enabled: true, bands: [{ from: 2, value: 1 }] }, defense: { ...cfg.modifiers.defense, enabled: true, applyTo: "opponent" as const }, homeAdvantage: { enabled: true, value: 2 } },
    };
    const home = computeTeam({ module: "442", starters: xi(), bench: [] }, c, true);
    const awayXi = xi().map((p) => (p.role === 3 ? P(p.id, 3, 5) : p));
    const away = computeTeam({ module: "442", starters: awayXi, bench: [] }, c, true);
    const m = computeMatch(home, away, c);
    expect(m.home.matchMods).toEqual([{ label: "Modificatore centrocampo", value: 1 }, { label: "Modificatore difesa avversario", value: -1 }, { label: "Fattore campo", value: 2 }]);
    expect(m.away.matchMods).toEqual([{ label: "Modificatore centrocampo", value: -1 }, { label: "Modificatore difesa avversario", value: -1 }]);
    expect(matchGoals(66, 65, { ...cfg, goalRules: { ...cfg.goalRules, drawWithin: 2 } })).toEqual([0, 0]);
    expect(matchGoals(60, 64, { ...cfg, goalRules: { ...cfg.goalRules, winByMargin: 3, winByMarginUnderFirst: true } })).toEqual([0, 1]);
    expect(noLineupScore(cfg)).toBeNull();
    expect(noLineupScore({ ...cfg, noLineup: { mode: "fixed", points: 0 } })?.total).toBe(0);
  });

  it("controlla panchina per ruolo e capitano", () => {
    const c = { ...cfg, benchPerRole: [1, 2, 2, 2] as [number, number, number, number], modifiers: { ...cfg.modifiers, captain: { ...cfg.modifiers.captain, enabled: true } } };
    const starters = xi();
    const errors = validateLineup({ starters, bench: [{ role: 1 }, { role: 1 }], module: "442", starterIds: starters.map((p) => p.id), captain: "p", vice: "p" }, c);
    expect(errors).toContain("Massimo 1 panchinari portieri");
    expect(errors).toContain("Capitano e vice devono essere diversi");
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

describe("voto statistico FootballLite", () => {
  it("premia una buona partita e penalizza gli errori, per ruolo", () => {
    const good = statVote({ minutes_played: 90, rating: 8, goals: 1, expected_goals: 0.8, shots_on_target: 3, key_pass: 2, total_pass: 30, accurate_pass: 26 }, 4, { teamGoals: 2, oppGoals: 0 })!;
    const bad = statVote({ minutes_played: 90, rating: 6, error_lead_to_a_goal: 1, dispossessed: 5, total_pass: 30, accurate_pass: 18 }, 3, { teamGoals: 0, oppGoals: 2 })!;
    const keeper = statVote({ minutes_played: 90, rating: 7.6, saves: 6, goals_prevented: 1.2, goals_conceded: 1 }, 1)!;
    expect(good.vote).toBeGreaterThanOrEqual(7);
    expect(bad.vote).toBeLessThan(6);
    expect(keeper.vote).toBeGreaterThanOrEqual(6.5);
    expect(statVote({ minutes_played: 0 }, 2)).toBeNull();
  });

  const ev = { minutes: 10, goals: 0, assists: 0, yellow: 0, red: 0, penaltyScored: 0, penaltyMissed: 0, penaltySaved: 0, ownGoals: 0, goalsConceded: 0, stats: {} };

  it("sotto i 12 minuti dà voto solo con eventi decisivi", () => {
    expect(voteEligibility({ ...ev, minutes: 12 }, 3, "none")).toBe("vote");
    expect(voteEligibility(ev, 3, "none")).toBe("none");
    for (const k of ["goals", "assists", "red", "ownGoals", "penaltyScored", "penaltyMissed", "penaltySaved"] as const) {
      expect(voteEligibility({ ...ev, [k]: 1 }, 3, "none")).toBe("vote");
    }
    // Solo ammonizione: decide la lega. Portiere con soli gol subiti: voto base con il malus.
    expect(voteEligibility({ ...ev, yellow: 1 }, 3, "none")).toBe("none");
    expect(voteEligibility({ ...ev, yellow: 1 }, 3, "base")).toBe("base");
    expect(voteEligibility({ ...ev, goalsConceded: 1 }, 1, "none")).toBe("base");
    expect(voteEligibility(ev, 1, "none")).toBe("none");
  });

  it("a partita in corso sotto i 12 minuti il voto non è ancora maturato", () => {
    // Come in Leghe Fantacalcio: senza voto provvisorio, non conta nel parziale e non fa scattare sostituzioni.
    expect(playerLiveScore("x", 3, ev, "live", cfg).state).toBe("pending");
    expect(playerLiveScore("x", 3, { ...ev, goals: 1 }, "live", cfg).state).toBe("played");
    expect(playerLiveScore("x", 3, { ...ev, minutes: 20, stats: { minutes_played: 20 } }, "live", cfg).state).toBe("played");
  });

  it("applica la soglia nel calcolo live a partita finita", () => {
    expect(playerLiveScore("x", 3, ev, "finished", cfg).state).toBe("absent");
    expect(playerLiveScore("x", 3, { ...ev, goals: 1 }, "finished", cfg).state).toBe("played");
    const gk = playerLiveScore("p", 1, { ...ev, goalsConceded: 1 }, "finished", cfg);
    expect(gk.vote).toBe(6);
    expect(gk.fantavote).toBe(5);
    const booked = playerLiveScore("x", 3, { ...ev, yellow: 1 }, "finished", { ...cfg, yellowShortVote: "base" });
    expect(booked.fantavote).toBe(5.5);
  });

  it("ricava la posizione in campo da modulo e formazione", () => {
    const ids = (k: number) => Array.from({ length: k }, (_, i) => i);
    expect([...subRolesFromLineup("3-4-3", ids(11)).values()]).toEqual(["P", "DC", "DC", "DC", "EC", "CC", "CC", "EC", "AE", "AT", "AE"]);
    expect([...subRolesFromLineup("4-3-3", ids(11)).values()]).toEqual(["P", "TD", "DC", "DC", "TD", "CC", "CC", "CC", "AE", "AT", "AE"]);
    expect([...subRolesFromLineup("4-2-3-1", ids(11)).values()]).toEqual(["P", "TD", "DC", "DC", "TD", "CC", "CC", "AE", "CC", "AE", "AT"]);
    expect(subRolesFromLineup("4-4-2", ids(10)).size).toBe(0);
  });

  it("tiene conto del risultato della squadra", () => {
    const same = { minutes_played: 90, rating: 6.8, total_pass: 40, accurate_pass: 34, won_tackle: 3 };
    const won = statVote(same, 2, { home: true, teamGoals: 2, oppGoals: 0 })!;
    const lost = statVote(same, 2, { home: true, teamGoals: 0, oppGoals: 3 })!;
    expect(won.raw).toBeGreaterThan(lost.raw);
  });
});

describe("calibrazione sui risultati ufficiali", () => {
  // Punteggi ufficiali generati con voti più alti di 0,3 e più dispersi del 20% rispetto a quelli calcolati.
  const samples = Array.from({ length: 30 }, (_, i) => {
    const votes = Array.from({ length: 11 }, (_, k) => 6 + (((i * 7 + k * 3) % 9) - 4) * 0.25);
    const computed = 70 + votes.reduce((a, v) => a + v - 6, 0);
    const official = computed + votes.reduce((a, v) => a + 0.2 * (v - 6) + 0.3, 0);
    return { official, computed, votes };
  });

  it("stima spostamento e dispersione e riduce lo scarto", () => {
    const c = fitCalibration(samples)!;
    expect(c.offset).toBeGreaterThan(0.2);
    expect(c.offset).toBeLessThanOrEqual(0.3);
    expect(c.scale).toBeGreaterThan(1.1);
    expect(c.maeAfter).toBeLessThan(c.maeBefore / 2);
  });

  it("non corregge con pochi dati", () => {
    expect(fitCalibration(samples.slice(0, 5))).toBeNull();
  });
});

describe("formazione incollata", () => {
  const roster: RosterEntry[] = [
    { id: "1", name: "Vicario", role: 1 }, { id: "2", name: "Meret", role: 1 }, { id: "3", name: "Palmisani", role: 1 },
    { id: "4", name: "Miranda J.", role: 2 }, { id: "5", name: "Ostigard", role: 2 }, { id: "6", name: "Tavares N.", role: 2 },
    { id: "7", name: "Celik", role: 2 }, { id: "8", name: "Mina", role: 2 }, { id: "9", name: "Monterisi", role: 2 }, { id: "10", name: "Delprato", role: 2 },
    { id: "11", name: "Zielinski", role: 3 }, { id: "12", name: "Rabiot", role: 3 }, { id: "13", name: "McKennie", role: 3 }, { id: "14", name: "Politano", role: 3 },
    { id: "15", name: "Kamara H.", role: 3 }, { id: "16", name: "Ederson D.S.", role: 3 }, { id: "17", name: "Koopmeiners", role: 3 },
    { id: "18", name: "Ramos G.", role: 4 }, { id: "19", name: "Varela G.", role: 4 }, { id: "20", name: "Adams C.", role: 4 },
    { id: "21", name: "Esposito Se.", role: 4 }, { id: "22", name: "Esposito Sa.", role: 4 }, { id: "23", name: "Martinez L.", role: 4 },
  ];
  const shared = `Skibidi Boppy (3-4-3)
By Forza Napoli

Vicario
Miranda J.
Ostigard
Tavares N.
Zielinski
Rabiot
McKennie
Politano
Ramos G.
Varela G.
Adams C.
----------------------
Palmisani
Meret
Celik
Mina
Monterisi
Delprato
Kamara H.
Ederson D.S.
Koopmeiners
Esposito Se.
`;

  it("legge la formazione condivisa da Leghe Fantacalcio: modulo, undici e panchina in ordine", () => {
    const r = parseLineupText(shared, roster, cfg);
    expect(r.module).toBe("343");
    expect(r.starters).toEqual(["1", "4", "5", "6", "11", "12", "13", "14", "18", "19", "20"]);
    expect(r.bench).toEqual(["3", "2", "7", "8", "9", "10", "15"]);
    expect(r.unmatched).toEqual([]);
    expect(r.warnings.some((w) => w.includes("panchina"))).toBe(true);
    expect(validateLineup({ starters: r.starters.map((id) => roster.find((p) => p.id === id)!), bench: r.bench.map((id) => roster.find((p) => p.id === id)!), module: r.module! }, cfg)).toEqual([]);
  });

  it("usa i ruoli indicati, deduce il modulo e legge capitano e vice", () => {
    const text = `Titolari
Portiere: Vicario
Difensori: Miranda, Ostigard, Tavares, Celik
Centrocampisti: Zielinski (C), Rabiot, McKennie
Attaccanti: Ramos, Varela (VC), Adams
Panchina
P Meret
D Mina
A Esposito Se.`;
    const r = parseLineupText(text, roster, cfg);
    expect(r.module).toBe("433");
    expect(r.starters).toHaveLength(11);
    expect(r.captain).toBe("11");
    expect(r.vice).toBe("19");
    expect(r.bench).toEqual(["2", "8", "21"]);
    expect(r.unmatched).toEqual([]);
  });

  it("segnala i nomi ambigui o sconosciuti e con il modulo separa titolari e panchina", () => {
    const text = "4-4-2\nVicario, Miranda, Ostigard, Tavares, Celik, Zielinski, Rabiot, McKennie, Politano, Ramos, Esposito, Pinco Pallino, Meret";
    const r = parseLineupText(text, roster, cfg);
    expect(r.module).toBe("442");
    expect(r.unmatched).toEqual(["Esposito", "Pinco Pallino"]);
    expect(r.warnings.some((w) => w.includes("Esposito Se.") && w.includes("Esposito Sa."))).toBe(true);
    expect(r.starters).toHaveLength(10);
    expect(r.bench).toEqual(["2"]);
    expect(r.warnings.some((w) => w.includes("10 titolari"))).toBe(true);
  });

  it("titolari prima della riga tratteggiata e riserve dopo, anche con grassetto e trattini spaziati", () => {
    const text = `*Skibidi Boppy* (4-3-3)
*Vicario*
*Miranda J.*
*Ostigard*
*Tavares N.*
*Celik*
*Zielinski*
*Rabiot*
*McKennie*
*Ramos G.*
*Varela G.*
*Adams C.*
- - - - - - - - - -
Meret
Mina
Politano`;
    const r = parseLineupText(text, roster, cfg);
    expect(r.module).toBe("433");
    expect(r.starters).toEqual(["1", "4", "5", "6", "7", "11", "12", "13", "18", "19", "20"]);
    expect(r.bench).toEqual(["2", "8", "14"]);
    expect(r.unmatched).toEqual([]);
  });

  it("non confonde l'iniziale del nome con il ruolo", () => {
    const r = parseLineupText("Adams C.\nMartinez L.\nRamos G", roster, cfg);
    expect(r.starters).toEqual(["20", "23", "18"]);
  });
});
