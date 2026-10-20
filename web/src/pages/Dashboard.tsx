import { Link } from "react-router-dom";
import { Button, Card, Empty, ErrorBox, RoleTag, Spinner, StarterPercent, TeamBadge, fmt, formatCountdown, useNow } from "../components/ui";
import { useCalendar, useLeague, useLineups, useLive, useOutlook, useRound, type Round } from "../lib/data";
import { useSession } from "../lib/session";
import { leagueMatches, matchCalc, myMatch, rosterOf, teamCalc } from "../lib/team";

export function Dashboard() {
  const s = useSession();
  const league = useLeague();
  const round = useRound();

  if (league.isLoading || round.isLoading) return <Spinner />;
  if (league.error) return <ErrorBox error={league.error} onRetry={() => league.refetch()} />;
  if (round.error) return <ErrorBox error={round.error} onRetry={() => round.refetch()} />;
  if (!league.data?.teams.length) {
    return (
      <Card title="Lega da configurare">
        <Empty>{s?.admin ? "Importa le rose e il calendario dalla gestione della lega (menu della lega in alto a sinistra)." : "L'admin non ha ancora importato le rose della lega."}</Empty>
        {s?.admin && <Link to="/admin"><Button className="w-full">Vai alla gestione della lega</Button></Link>}
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <RoundCard round={round.data!} />
      <LeagueDayCard round={round.data!} />
      <RiskCard />
      <SerieACard round={round.data!} />
    </div>
  );
}

function RoundCard({ round }: { round: Round }) {
  const s = useSession();
  const league = useLeague();
  const calendar = useCalendar();
  // La formazione da inserire è quella della giornata successiva quando quella in evidenza è conclusa.
  const lineups = useLineups(round.lineupMatchday);
  const now = useNow();
  const teams = new Map(league.data!.teams.map((t) => [t.id, t.name]));
  const mine = myMatch(calendar.data, round.matchday, s?.myTeamId);
  const next = round.lineupMatchday !== round.matchday ? myMatch(calendar.data, round.lineupMatchday, s?.myTeamId) : null;
  const myLineup = lineups.data?.lineups.find((l) => l.team_id === s?.myTeamId);
  const started = round.phase !== "upcoming";

  return (
    <section className="hero rounded-2xl p-5 text-chalk" aria-label="Tabellone della giornata">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-extrabold leading-none">{round.matchday}ª giornata</h2>
        <span className="text-xs text-chalk/70">{mine ? `${mine.league_day}ª di lega · ` : ""}Serie A</span>
      </div>
      {mine && (
        <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <TeamHead id={mine.home_team_id} name={teams.get(mine.home_team_id) ?? "?"} />
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-extrabold text-chalk/80">VS</span>
          <TeamHead id={mine.away_team_id} name={teams.get(mine.away_team_id) ?? "?"} />
        </div>
      )}
      <div className="flex flex-col gap-4">
        <div>
          {round.phase === "live" ? (
            <div className="flex items-center gap-2 text-lg font-semibold"><span className="size-2.5 animate-pulse rounded-full bg-danger" />Giornata in corso</div>
          ) : round.phase === "finished" ? (
            <>
              <div className="text-lg font-semibold">Giornata conclusa</div>
              {round.lineupMatchday !== round.matchday && (
                <div className="mt-2 rounded-xl bg-white/10 p-3">
                  <div className="text-xs text-chalk/70">Prossima: {round.lineupMatchday}ª giornata{next ? ` · ${teams.get(next.home_team_id)} – ${teams.get(next.away_team_id)}` : ""}</div>
                  {round.lineupDeadline > 0 && <div className="scoreboard tabular text-2xl leading-none">{formatCountdown(round.lineupDeadline - now)}</div>}
                  {round.lineupDeadline > 0 && <div className="mt-1 text-[11px] text-chalk/70">consegna entro {new Date(round.lineupDeadline).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>}
                </div>
              )}
            </>
          ) : round.deadline ? (
            <>
              <div className="text-xs text-chalk/70">Primo calcio d'inizio tra</div>
              <div className="scoreboard tabular text-4xl leading-none">{formatCountdown(round.deadline - now)}</div>
              <div className="mt-1 text-xs text-chalk/70">{new Date(round.deadline).toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</div>
            </>
          ) : null}
          {s?.myTeamId ? (
            <div className="mt-3 text-xs font-semibold">
              {lineups.isLoading ? "Verifica…" : myLineup ? `✓ Formazione inserita${round.lineupMatchday !== round.matchday ? ` per la ${round.lineupMatchday}ª` : ""}${myLineup.forced ? " · modificata a giornata iniziata" : ""}` : `Formazione${round.lineupMatchday !== round.matchday ? ` della ${round.lineupMatchday}ª` : ""} non ancora inserita`}
            </div>
          ) : (
            <p className="mt-3 text-xs text-chalk/80">Scegli il tuo utente nelle <Link to="/utente" className="underline">impostazioni utente</Link> per schierare.</p>
          )}
        </div>
        {s?.myTeamId ? (
          <Link to="/formazione" className="block"><Button variant="card" className="w-full py-3 text-base">Formazione</Button></Link>
        ) : started ? (
          <Link to="/live" className="block"><Button variant="card" className="w-full py-3 text-base">Live</Button></Link>
        ) : null}
      </div>
    </section>
  );
}

function TeamHead({ id, name }: { id: number; name: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <TeamBadge id={id} name={name} size={44} />
      <span className="w-full truncate text-sm font-semibold">{name}</span>
    </div>
  );
}

function LeagueDayCard({ round }: { round: Round }) {
  const s = useSession();
  const league = useLeague();
  const calendar = useCalendar();
  const lineups = useLineups(round.matchday);
  // A giornata iniziata si mostra subito il risultato stimato (chi deve ancora giocare vale 6), come nel Live.
  const started = round.phase !== "upcoming";
  const live = useLive(started ? round.matchday : undefined, round.phase === "live");
  const matches = leagueMatches(calendar.data, round.matchday);
  if (calendar.isLoading) return <Card title="Partite della lega"><Spinner /></Card>;
  if (!matches.length) {
    return <Card title="Partite della lega"><Empty>{calendar.data?.length ? "Nessuna partita di lega in questa giornata." : "Calendario non ancora importato dall'admin."}</Empty></Card>;
  }
  const names = new Map(league.data!.teams.map((t) => [t.id, t.name]));
  const inserted = new Set(lineups.data?.lineups.map((l) => l.team_id));
  const cfg = league.data!.league.config;
  const estimate = (m: (typeof matches)[number]) => {
    if (!started || !lineups.data) return null;
    const calc = (tid: number) => teamCalc(tid, rosterOf(league.data!, tid), lineups.data!.lineups.find((l) => l.team_id === tid), live.data, cfg, true);
    return matchCalc(calc(m.home_team_id), calc(m.away_team_id), cfg);
  };
  return (
    <Card title={`${matches[0].league_day}ª giornata di lega`}>
      <ul className="flex flex-col divide-y divide-line">
        {matches.map((m) => {
          const mine = m.home_team_id === s?.myTeamId || m.away_team_id === s?.myTeamId;
          const dot = (id: number) => round.phase === "upcoming" && <span title={inserted.has(id) ? "Formazione inserita" : "Formazione non inserita"} className={`size-2 shrink-0 rounded-full ${inserted.has(id) ? "bg-accent" : "bg-danger/60"}`} />;
          return (
            <li key={`${m.league_day}-${m.home_team_id}`} className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2.5 text-sm ${mine ? "font-semibold" : ""}`}>
              <span className="flex min-w-0 items-center gap-2"><span className="truncate">{names.get(m.home_team_id)}</span>{dot(m.home_team_id)}</span>
              <span className="tabular text-center">
                {m.home_goals !== null ? <><b>{m.home_goals} - {m.away_goals}</b><span className="block text-[10px] text-muted">{fmt(m.home_points)} – {fmt(m.away_points)}</span></> : (() => {
                  const r = estimate(m);
                  const hp = r?.result?.home.final ?? r?.home?.score.total ?? null;
                  const ap = r?.result?.away.final ?? r?.away?.score.total ?? null;
                  if (!r || (hp === null && ap === null)) return <span className="text-muted">vs</span>;
                  return <Link to={`/live?partita=${m.home_team_id}`}>{r.result ? <b>{r.result.goals[0]} - {r.result.goals[1]}</b> : <span className="text-muted">–</span>}<span className="block text-[10px] text-muted">{hp !== null ? fmt(hp) : "–"} – {ap !== null ? fmt(ap) : "–"}</span></Link>;
                })()}
              </span>
              <span className="flex min-w-0 items-center justify-end gap-2">{dot(m.away_team_id)}<span className="truncate text-right">{names.get(m.away_team_id)}</span></span>
            </li>
          );
        })}
      </ul>
      {started && matches.some((m) => m.home_goals === null) && <p className="mt-2 text-[11px] text-muted">Risultati stimati da FootballLite: chi deve ancora giocare vale fantavoto 6. Tocca una partita per il dettaglio.</p>}
      {calendar.importedAt && <p className="mt-2 text-[11px] text-muted">Risultati ufficiali aggiornati all'import del calendario del {new Date(calendar.importedAt).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.</p>}
    </Card>
  );
}

/** Giocatori della mia rosa indisponibili, in dubbio o con titolarità stimata bassa. */
function RiskCard() {
  const s = useSession();
  const league = useLeague();
  const outlook = useOutlook();
  if (!s?.myTeamId || !league.data) return null;
  if (outlook.isLoading) return <Card title="La tua rosa"><Spinner /></Card>;
  const roster = rosterOf(league.data, s.myTeamId);
  const risky = roster
    .map((p) => ({ p, o: p.ext_id ? outlook.data?.players[p.ext_id] : undefined }))
    .filter(({ o }) => o && (o.unavailable || o.doubtful || o.starterPercent < 50))
    .sort((a, b) => (a.o!.starterPercent - b.o!.starterPercent));
  const unmatched = roster.filter((p) => !p.ext_id).length;
  return (
    <Card title="La tua rosa: da tenere d'occhio">
      {!risky.length ? <Empty>Nessun indisponibile o titolare a rischio secondo le stime.</Empty> : (
        <ul className="flex flex-col gap-2">
          {risky.slice(0, 8).map(({ p, o }) => (
            <li key={p.slot} className="flex items-center gap-2 text-sm">
              <RoleTag role={p.role} />
              <span className="flex-1 truncate">{p.name} <span className="text-xs text-muted">{o!.opponent ?? ""}</span></span>
              <span className="text-xs text-muted">{o!.unavailable === "injury" ? "Infortunato" : o!.unavailable === "suspension" ? "Squalificato" : o!.unavailable ? "Indisponibile" : o!.doubtful ? "In dubbio" : ""}</span>
              <StarterPercent percent={o!.starterPercent} />
            </li>
          ))}
        </ul>
      )}
      {unmatched > 0 && (
        <p className="mt-2 text-[11px] text-muted">
          {unmatched === roster.length ? "Nessun giocatore della rosa è abbinato" : `${unmatched} giocatori non abbinati`} alla fonte dati: titolarità non disponibile.{" "}
          {unmatched === roster.length
            ? "Di solito i giocatori di Serie A non sono ancora stati scaricati: l'abbinamento avviene da solo dopo la prima sincronizzazione (una volta al giorno)."
            : "L'admin può abbinarli a mano."}
          {s.admin && <> Stato in <Link to="/admin" className="underline">Gestione lega → Abbinamenti</Link>.</>}
        </p>
      )}
    </Card>
  );
}

function SerieACard({ round }: { round: Round }) {
  if (!round.matches.length) return null;
  return (
    <Card title={`Serie A · giornata ${round.matchday}`}>
      <ul className="flex flex-col divide-y divide-line text-sm">
        {round.matches.map((m) => (
          <li key={m.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2">
            <span className="truncate">{m.home_name}</span>
            <span className="tabular text-center text-xs">
              {m.score_home !== null ? <b className="text-sm">{m.score_home} - {m.score_away}</b> : new Date(m.kickoff).toLocaleString("it-IT", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="truncate text-right">{m.away_name}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
