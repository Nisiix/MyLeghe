// Calibrazione del voto statistico della lega sui punteggi ufficiali del calendario importato.
// Si ricalcolano, senza correzione, le giornate con punteggi ufficiali e formazioni inserite in FootballLite,
// poi si stima la correzione (core/calibrate.ts) e la si salva: da lì il live usa i voti corretti.

import {
  computeMatch, computeTeam, fitCalibration, playerLiveScore,
  type Calibration, type CalibrationSample, type LeagueConfig, type PlayerLiveScore, type Role, type TeamScore,
} from "@footballlite/core";
import type { Env } from "./env";
import { loadConfig } from "./league";
import { liveRound } from "./outlook";
import { kvSet } from "./schedule";

export interface CalibrationResult extends Calibration { updatedAt: number }

interface LineupRow { team_id: number; module: string; starters: string; bench: string; captain: number | null; vice: number | null }

export async function calibrateLeague(env: Env, lid: string): Promise<CalibrationResult | null> {
  const cfg = await loadConfig(env.DB, lid);
  if (cfg.voteModel !== "stats") return null;
  const days = await env.DB.prepare(
    "SELECT DISTINCT serie_a_day AS day FROM league_calendar WHERE league_id = ? AND home_points IS NOT NULL AND away_points IS NOT NULL ORDER BY day",
  ).bind(lid).all<{ day: number }>();
  const roster = await env.DB.prepare(
    "SELECT r.team_id, r.slot, r.role, r.ext_id FROM roster r JOIN teams t ON t.id = r.team_id WHERE t.league_id = ?",
  ).bind(lid).all<{ team_id: number; slot: number; role: Role; ext_id: number | null }>();
  const bySlot = new Map((roster.results ?? []).map((p) => [`${p.team_id}:${p.slot}`, p]));

  const samples: CalibrationSample[] = [];
  for (const { day } of days.results ?? []) {
    const lineups = await env.DB.prepare(
      `SELECT l.* FROM lineups l JOIN (SELECT team_id, MAX(id) AS id FROM lineups WHERE league_id = ? AND round = ? GROUP BY team_id) last ON last.id = l.id`,
    ).bind(lid, day).all<LineupRow>();
    const byTeam = new Map((lineups.results ?? []).map((l) => [l.team_id, l]));
    if (!byTeam.size) continue;
    const live = await liveRound(env, lid, day, null);

    const teamScore = (teamId: number): { score: TeamScore; votes: number[] } | null => {
      const l = byTeam.get(teamId);
      if (!l) return null;
      const score = (slot: number): PlayerLiveScore | null => {
        const p = bySlot.get(`${teamId}:${slot}`);
        if (!p) return null;
        const ev = p.ext_id ? live.events[p.ext_id] : undefined;
        return playerLiveScore(String(slot), p.role, ev, p.ext_id ? live.state[p.ext_id] ?? "finished" : "finished", cfg);
      };
      const starters = (JSON.parse(l.starters) as number[]).map(score).filter(Boolean) as PlayerLiveScore[];
      const bench = (JSON.parse(l.bench) as number[]).map(score).filter(Boolean) as PlayerLiveScore[];
      const sc = computeTeam({ module: l.module, starters, bench, captain: l.captain != null ? String(l.captain) : null, vice: l.vice != null ? String(l.vice) : null }, cfg, false);
      const votes = sc.counted.filter((p) => p.state === "played" && p.vote !== null).map((p) => p.vote!);
      return { score: sc, votes };
    };

    const matches = await env.DB.prepare(
      "SELECT home_team_id, away_team_id, home_points, away_points FROM league_calendar WHERE league_id = ? AND serie_a_day = ? AND home_points IS NOT NULL AND away_points IS NOT NULL",
    ).bind(lid, day).all<{ home_team_id: number; away_team_id: number; home_points: number; away_points: number }>();
    for (const m of matches.results ?? []) {
      const h = teamScore(m.home_team_id), a = teamScore(m.away_team_id);
      if (h && a) {
        // Entrambe le formazioni: punteggi finali con i modificatori che dipendono dall'avversario.
        const r = computeMatch(h.score, a.score, cfg);
        samples.push({ official: m.home_points, computed: r.home.final, votes: h.votes });
        samples.push({ official: m.away_points, computed: r.away.final, votes: a.votes });
      } else if (!modifiersNeedOpponent(cfg)) {
        if (h) samples.push({ official: m.home_points, computed: h.score.total + homeBonus(cfg), votes: h.votes });
        if (a) samples.push({ official: m.away_points, computed: a.score.total, votes: a.votes });
      }
    }
  }

  const fit = fitCalibration(samples);
  if (!fit) return null;
  const result = { ...fit, updatedAt: Date.now() };
  await kvSet(env, `calib:${lid}`, result);
  return result;
}

const modifiersNeedOpponent = (cfg: LeagueConfig) => cfg.modifiers.midfield.enabled || cfg.modifiers.defense.applyTo === "opponent";
const homeBonus = (cfg: LeagueConfig) => (cfg.modifiers.homeAdvantage.enabled ? cfg.modifiers.homeAdvantage.value : 0);
