// Hook dei dati della lega (React Query).

import type { LeagueConfig, MatchEvents, Role } from "@footballlite/core";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useSession } from "./session";

const MIN = 60_000;

export interface Team { id: number; name: string; position: number; spent: number }
export interface RosterPlayer {
  team_id: number; slot: number; name: string; role: Role; cost: number;
  ext_id: number | null; confidence: number; ext_name: string | null; ext_team: string | null;
}
export interface LeagueData {
  league: { id: string; name: string; config: LeagueConfig };
  teams: Team[];
  roster: RosterPlayer[];
  me: { teamIds: number[]; admin: boolean };
}

export function useLeague() {
  const s = useSession();
  return useQuery({ queryKey: ["league", s?.league.id], enabled: !!s, queryFn: () => api<LeagueData>("/league"), staleTime: 5 * MIN });
}

export interface SaMatch {
  id: number; matchday: number; kickoff: number; status: string;
  home_name: string; away_name: string; home_tla: string | null; away_tla: string | null;
  score_home: number | null; score_away: number | null;
}
export interface Round { matchday: number; deadline: number; end: number; phase: "upcoming" | "live" | "finished"; matches: SaMatch[]; now: number }

export function useRound() {
  const s = useSession();
  return useQuery({ queryKey: ["round"], enabled: !!s, queryFn: () => api<Round>("/league/round"), staleTime: MIN, refetchInterval: 2 * MIN });
}

export interface Outlook {
  starterPercent: number;
  unavailable: "injury" | "suspension" | "other" | null;
  doubtful: boolean;
  predicted: "starter" | "bench" | null;
  confirmed: boolean;
  recentStarts: boolean[];
  avgFantavote: number | null;
  opponentFactor: number;
  opponent: string | null;
  kickoff: number | null;
  matchState: "pending" | "live" | "finished";
}

export function useOutlook() {
  const s = useSession();
  return useQuery({
    queryKey: ["outlook", s?.league.id],
    enabled: !!s,
    queryFn: () => api<{ matchday: number; players: Record<string, Outlook> }>("/league/outlook"),
    staleTime: 5 * MIN,
  });
}

export interface LiveData {
  round: number;
  matches: { id: number; kickoff: number; status: string; home: string; away: string; score: [number, number] | null; state: string }[];
  state: Record<string, "pending" | "live" | "finished">;
  events: Record<string, MatchEvents>;
}

export function useLive(round: number | undefined, live: boolean) {
  const s = useSession();
  return useQuery({
    queryKey: ["live", s?.league.id, round],
    enabled: !!s && !!round,
    queryFn: () => api<LiveData>(`/league/live/${round}`),
    refetchInterval: live ? 2 * MIN : false,
    staleTime: live ? MIN : 10 * MIN,
  });
}

export interface Lineup { id: number; team_id: number; round: number; module: string; starters: number[]; bench: number[]; forced: boolean; created_at: number; entered_by?: number | null; captain?: number | null; vice?: number | null; recovered?: boolean; hidden?: boolean }

export function useLineups(round: number | undefined) {
  const s = useSession();
  return useQuery({
    queryKey: ["lineups", s?.league.id, round],
    enabled: !!s && !!round,
    queryFn: () => api<{ round: number; started: boolean; lineups: Lineup[] }>(`/league/lineups/${round}`),
    staleTime: MIN,
  });
}

export interface CalendarRow {
  league_day: number; serie_a_day: number; home_team_id: number; away_team_id: number;
  home_points: number | null; away_points: number | null; home_goals: number | null; away_goals: number | null;
}

export function useCalendar() {
  const s = useSession();
  return useQuery({ queryKey: ["calendar", s?.league.id], enabled: !!s, queryFn: () => api<CalendarRow[]>("/league/calendar"), staleTime: 30 * MIN });
}
