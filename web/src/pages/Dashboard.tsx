import { Link } from "react-router-dom";
import { Button, Card, Empty, ErrorBox, RoleTag, Spinner, StarterPercent, TeamBadge, fmt, formatCountdown, useNow } from "../components/ui";
import { useCalendar, useLeague, useLineups, useOutlook, useRound, type Round } from "../lib/data";
import { useSession } from "../lib/session";
import { leagueMatches, myMatch, rosterOf } from "../lib/team";

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
        <Empty>{s?.admin ? "Importa le rose e il calendario dalla pagina Admin." : "L'admin non ha ancora importato le rose della lega."}</Empty>
        {s?.admin && <Link to="/admin"><Button className="w-full">Vai ad Admin</Button></Link>}
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
  const lineups = useLineups(round.matchday);
  const now = useNow();
  const teams = new Map(league.data!.teams.map((t) => [t.id, t.name]));
  const mine = myMatch(calendar.data, round.matchday, s?.myTeamId);
  const myLineup = lineups.data?.lineups.find((l) => l.team_id === s?.myTeamId);
  const started = round.phase !== "upcoming";

  return (
    <section className="rounded-2xl bg-pitch-deep p-5 text-chalk" aria-label="Tabellone della giornata">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="scoreboard text-2xl leading-none">Giornata {round.matchday}</h2>
        <span className="text-xs text-chalk/70">{mine ? `${mine.league_day}ª di lega · ` : ""}Serie A</span>
      </div>
      {mine && (
        <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <TeamHead id={mine.home_team_id} name={teams.get(mine.home_team_id) ?? "?"} />
          <span className="scoreboard text-3xl text-chalk/60">vs</span>
          <TeamHead id={mine.away_team_id} name={teams.get(mine.away_team_id) ?? "?"} />
        </div>
      )}
      <div className="flex items-end justify-between gap-3">
        <div>
          {round.phase === "live" ? (
            <div className="flex items-center gap-2 text-lg font-semibold"><span className="size-2.5 animate-pulse rounded-full bg-danger" />Giornata in corso</div>
          ) : round.phase === "finished" ? (
            <div className="text-lg font-semibold">Giornata conclusa</div>
          ) : round.deadline ? (
            <>
              <div className="text-xs text-chalk/70">Primo calcio d'inizio tra</div>
              <div className="scoreboard tabular text-4xl leading-none">{formatCountdown(round.deadline - now)}</div>
              <div className="mt-1 text-xs text-chalk/70">{new Date(round.deadline).toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</div>
            </>
          ) : null}
          {s?.myTeamId ? (
            <div className="mt-3 text-xs font-semibold">
              {lineups.isLoading ? "Verifica…" : myLineup ? `✓ Formazione inserita${myLineup.forced ? " · modificata a giornata iniziata" : ""}` : "Formazione non ancora inserita"}
            </div>
          ) : (
            <p className="mt-3 text-xs text-chalk/80">Scegli il tuo utente nelle <Link to="/impostazioni" className="underline">impostazioni</Link> per schierare.</p>
          )}
        </div>
        {started ? (
          <Link to="/live"><Button variant="card">Visualizza live</Button></Link>
        ) : s?.myTeamId ? (
          <Link to="/formazione"><Button variant="card">{myLineup ? "Modifica formazione" : "Inserisci formazione"}</Button></Link>
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
  const matches = leagueMatches(calendar.data, round.matchday);
  if (calendar.isLoading) return <Card title="Partite della lega"><Spinner /></Card>;
  if (!matches.length) {
    return <Card title="Partite della lega"><Empty>{calendar.data?.length ? "Nessuna partita di lega in questa giornata." : "Calendario non ancora importato dall'admin."}</Empty></Card>;
  }
  const names = new Map(league.data!.teams.map((t) => [t.id, t.name]));
  const inserted = new Set(lineups.data?.lineups.map((l) => l.team_id));
  return (
    <Card title={`${matches[0].league_day}ª giornata di lega`}>
      <ul className="flex flex-col divide-y divide-line">
        {matches.map((m) => {
          const mine = m.home_team_id === s?.myTeamId || m.away_team_id === s?.myTeamId;
          const dot = (id: number) => round.phase === "upcoming" && <span title={inserted.has(id) ? "Formazione inserita" : "Formazione non inserita"} className={`size-2 shrink-0 rounded-full ${inserted.has(id) ? "bg-accent" : "bg-line"}`} />;
          return (
            <li key={`${m.league_day}-${m.home_team_id}`} className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2.5 text-sm ${mine ? "font-semibold" : ""}`}>
              <span className="flex min-w-0 items-center gap-2"><span className="truncate">{names.get(m.home_team_id)}</span>{dot(m.home_team_id)}</span>
              <span className="tabular text-center">
                {m.home_goals !== null ? <><b>{m.home_goals} - {m.away_goals}</b><span className="block text-[10px] text-muted">{fmt(m.home_points)} – {fmt(m.away_points)}</span></> : <span className="text-muted">vs</span>}
              </span>
              <span className="flex min-w-0 items-center justify-end gap-2">{dot(m.away_team_id)}<span className="truncate text-right">{names.get(m.away_team_id)}</span></span>
            </li>
          );
        })}
      </ul>
      {calendar.importedAt && <p className="mt-2 text-[11px] text-muted">Risultati ufficiali aggiornati all'import del calendario del {new Date(calendar.importedAt).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.</p>}
      {round.phase !== "upcoming" && <Link to="/live" className="mt-2 block text-center text-xs text-accent">Punteggi live e «Simula risultato»</Link>}
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
          {s.admin && <> Stato in <Link to="/admin" className="underline">Admin → Abbinamenti</Link>.</>}
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted">Titolarità stimata da FootballLite su dati BSD (formazioni probabili/ufficiali, indisponibili, ultime partite).</p>
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
      <p className="mt-2 text-[11px] text-muted">Dati: football-data.org</p>
    </Card>
  );
}
