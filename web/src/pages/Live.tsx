import type { LeagueConfig } from "@footballlite/core";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card, Empty, ErrorBox, RoleTag, Spinner, StarterPercent, Tabs, TeamBadge, fmt } from "../components/ui";
import { useCalendar, useLeague, useLineups, useLive, useOutlook, useRound, type CalendarRow, type LeagueData, type LiveData, type Lineup, type Outlook } from "../lib/data";
import { useSession } from "../lib/session";
import { goals, leagueMatches, myMatch, rosterOf, teamLive, type TeamLive } from "../lib/team";

export function LivePage() {
  const s = useSession();
  const league = useLeague();
  const round = useRound();
  const calendar = useCalendar();
  const md = round.data?.matchday;
  const lineups = useLineups(md);
  const live = useLive(md, round.data?.phase === "live");
  const outlook = useOutlook();
  const [params, setParams] = useSearchParams();
  const [simulate, setSimulate] = useState(false);

  if (league.isLoading || round.isLoading || calendar.isLoading || lineups.isLoading) return <Spinner />;
  if (league.error || round.error) return <ErrorBox error={league.error ?? round.error} />;
  const data = league.data!;
  const cfg = data.league.config;
  const matches = leagueMatches(calendar.data, md!);
  if (!matches.length) return <Card title="Live"><Empty>Nessuna partita di lega in questa giornata (calendario non importato o giornata di riposo).</Empty></Card>;

  const selectedHome = Number(params.get("partita")) || myMatch(calendar.data, md!, s?.myTeamId)?.home_team_id || matches[0].home_team_id;
  const match = matches.find((m) => m.home_team_id === selectedHome) ?? matches[0];
  const lineupOf = (tid: number) => lineups.data?.lineups.find((l) => l.team_id === tid);
  const calc = (tid: number) => teamLive(rosterOf(data, tid), lineupOf(tid), live.data, cfg);
  const names = new Map(data.teams.map((t) => [t.id, t.name]));
  const isMine = match.home_team_id === s?.myTeamId || match.away_team_id === s?.myTeamId;

  return (
    <div className="flex flex-col gap-4">
      <Scoreboard match={match} names={names} home={calc(match.home_team_id)} away={calc(match.away_team_id)} simulate={simulate} cfg={cfg} phase={round.data!.phase} />

      {!simulate ? (
        <section className="rounded-xl border border-line bg-surface p-4 text-center">
          <h2 className="scoreboard text-xl">Simula il risultato finale</h2>
          <p className="mb-3 mt-1 text-sm text-muted">Chi deve ancora giocare vale il voto base della lega ({fmt(cfg.baseVote)}). Bonus e malus seguono il regolamento della lega.</p>
          <Button variant="card" onClick={() => setSimulate(true)}>Simula risultato</Button>
        </section>
      ) : (
        <button className="text-sm text-accent underline" onClick={() => setSimulate(false)}>Torna al punteggio parziale</button>
      )}

      {isMine && s?.myTeamId && (
        <Link to="/formazione" className="text-center text-sm font-semibold text-danger underline">Modifica formazione (giornata iniziata)</Link>
      )}

      <TeamsPanel match={match} names={names} data={data} lineupOf={lineupOf} calc={calc} outlook={outlook.data?.players} live={live.data} />

      <Card title="Altri punteggi">
        <ul className="flex flex-col divide-y divide-line">
          {matches.filter((m) => m !== match).map((m) => {
            const h = calc(m.home_team_id), a = calc(m.away_team_id);
            const hp = h ? (simulate ? h.projection.total : h.partial) : null;
            const ap = a ? (simulate ? a.projection.total : a.partial) : null;
            return (
              <li key={m.home_team_id}>
                <button onClick={() => setParams({ partita: String(m.home_team_id) })} className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 py-2.5 text-left text-sm">
                  <span className="truncate">{names.get(m.home_team_id)}</span>
                  <span className="tabular text-center">
                    {hp !== null && ap !== null ? <><b className="scoreboard text-lg">{goals(hp, cfg)}-{goals(ap, cfg)}</b><span className="block text-[10px] text-muted">{fmt(hp)} – {fmt(ap)}</span></> : <span className="text-xs text-muted">formazioni non visibili</span>}
                  </span>
                  <span className="truncate text-right">{names.get(m.away_team_id)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-muted">{simulate ? "Risultati simulati." : "Punteggi parziali con i voti già arrivati."} Voti stimati da FootballLite su statistiche BSD: non sono i voti ufficiali.</p>
      </Card>
    </div>
  );
}

function Scoreboard({ match, names, home, away, simulate, cfg, phase }: { match: CalendarRow; names: Map<number, string>; home: TeamLive | null; away: TeamLive | null; simulate: boolean; cfg: LeagueConfig; phase: string }) {
  const pts = (t: TeamLive | null) => (t ? (simulate ? t.projection.total : t.partial) : null);
  const hp = pts(home), ap = pts(away);
  return (
    <section className="rounded-2xl bg-pitch-deep p-5 text-chalk" aria-label="Tabellone">
      <div className="mb-3 flex items-baseline justify-between text-xs text-chalk/70">
        <span>{match.league_day}ª giornata di lega</span>
        <span>{simulate ? "Risultato simulato" : phase === "live" ? "Live" : phase === "finished" ? "Finale stimato" : "Da giocare"}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
        <Side id={match.home_team_id} name={names.get(match.home_team_id) ?? ""} />
        <div className="tabular">
          <div className="scoreboard text-5xl leading-none">{hp !== null && ap !== null ? `${goals(hp, cfg)}-${goals(ap, cfg)}` : "–"}</div>
          <div className="mt-1 text-xs text-chalk/75">{fmt(hp)} – {fmt(ap)}</div>
        </div>
        <Side id={match.away_team_id} name={names.get(match.away_team_id) ?? ""} />
      </div>
    </section>
  );
}

function Side({ id, name }: { id: number; name: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <TeamBadge id={id} name={name} size={42} />
      <span className="w-full truncate text-sm font-semibold">{name}</span>
    </div>
  );
}

function TeamsPanel({ match, names, data, lineupOf, calc, outlook, live }: {
  match: CalendarRow; names: Map<number, string>; data: LeagueData; lineupOf: (t: number) => Lineup | undefined;
  calc: (t: number) => TeamLive | null; outlook?: Record<string, Outlook>; live?: LiveData;
}) {
  const [side, setSide] = useState<"home" | "away">("home");
  const tid = side === "home" ? match.home_team_id : match.away_team_id;
  const lineup = lineupOf(tid);
  const t = calc(tid);
  const roster = new Map(rosterOf(data, tid).map((p) => [String(p.slot), p]));
  const subsIn = new Set(t?.projection.substitutions.map((x) => x.in));
  const subsOut = new Set(t?.projection.substitutions.map((x) => x.out));

  const row = (p: TeamLive["starters"][number]) => {
    const info = roster.get(p.id);
    const o = info?.ext_id ? outlook?.[info.ext_id] : undefined;
    const ev = info?.ext_id ? live?.events[info.ext_id] : undefined;
    const tags = ev ? [
      ...Array(ev.goals + ev.penaltyScored).fill("⚽"), ...Array(ev.assists).fill("🅰"), ...Array(ev.yellow).fill("🟨"), ...Array(ev.red).fill("🟥"),
      ...Array(ev.ownGoals).fill("autogol"), ...Array(ev.penaltyMissed).fill("rig. sbagliato"), ...Array(ev.penaltySaved).fill("rig. parato"),
    ] : [];
    return (
      <li key={p.id} className={`flex items-center gap-2 py-1.5 ${subsOut.has(p.id) ? "opacity-50" : ""}`}>
        <RoleTag role={p.role} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{p.name}{subsIn.has(p.id) && <span className="text-[10px] text-accent"> entra</span>}{subsOut.has(p.id) && <span className="text-[10px] text-danger"> esce</span>}</div>
          <div className="truncate text-[11px] text-muted">{tags.join(" ") || o?.opponent || ""}</div>
        </div>
        {p.state === "pending" ? (
          <span className="flex items-center gap-2"><StarterPercent percent={o?.starterPercent} /><span className="tabular text-sm text-muted">{fmt(p.fantavote)}*</span></span>
        ) : (
          <span className="text-right tabular">
            <span className="block text-sm font-bold">{p.state === "absent" ? "s.v." : fmt(p.fantavote)}</span>
            {p.vote !== null && <span className="block text-[10px] text-muted">voto {fmt(p.vote)}</span>}
          </span>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={side} onChange={setSide} items={[{ value: "home", label: names.get(match.home_team_id) ?? "Casa" }, { value: "away", label: names.get(match.away_team_id) ?? "Trasferta" }]} />
      {!lineup ? <Card><Empty>Formazione non inserita.</Empty></Card> : lineup.hidden || !t ? <Card><Empty>Formazione visibile dal primo calcio d'inizio.</Empty></Card> : (
        <>
          {lineup.forced && <p className="text-xs text-danger">Formazione modificata a giornata iniziata ({new Date(lineup.created_at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}).</p>}
          <Card title={`Titolari ${lineup.module.split("").join("-")}`} action={<span className="scoreboard tabular text-xl">{fmt(t.partial)}</span>}>
            <ul className="divide-y divide-line">{t.starters.map(row)}</ul>
          </Card>
          <Card title="Panchina"><ul className="divide-y divide-line">{t.bench.map(row)}</ul></Card>
          <p className="text-[11px] text-muted">* Da giocare: voto base ipotizzato. A fianco la titolarità stimata.</p>
        </>
      )}
    </div>
  );
}
