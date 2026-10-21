import type { Modifier, TeamMatchScore } from "@footballlite/core";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card, Empty, ErrorBox, RoleTag, Sheet, Spinner, StarterPercent, TeamBadge, fmt } from "../components/ui";
import { useCalendar, useLeague, useLineups, useLive, useOutlook, useRound, type CalendarRow, type LeagueData, type Lineup, type LiveData, type Outlook } from "../lib/data";
import { useSession } from "../lib/session";
import { SIM_DEFAULT_VOTE, leagueMatches, matchCalc, myMatch, rosterOf, simKey, teamCalc, type MatchCalc, type Named, type SimOverrides, type TeamCalc } from "../lib/team";

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
  // Il risultato stimato (chi deve ancora giocare vale 6) è l'unica vista, come «Simula risultato» di Leghe Fantacalcio.
  const simulate = true;
  const [overrides, setOverrides] = useState<SimOverrides>({});
  const [editing, setEditing] = useState(false);

  if (league.isLoading || round.isLoading || calendar.isLoading || lineups.isLoading) return <Spinner />;
  if (league.error || round.error) return <ErrorBox error={league.error ?? round.error} />;
  const data = league.data!;
  const cfg = data.league.config;
  const matches = leagueMatches(calendar.data, md!);
  const started = round.data!.phase !== "upcoming";
  if (!matches.length) return <Card title="Live"><Empty>Nessuna partita di lega in questa giornata (calendario non importato o giornata di riposo).</Empty></Card>;
  // Di base la propria partita; con il filtro in alto si passa alle altre partite della giornata.
  const mineOf = (m: CalendarRow) => m.home_team_id === s?.myTeamId || m.away_team_id === s?.myTeamId;
  const shown = matches;
  const selectedHome = Number(params.get("partita")) || myMatch(calendar.data, md!, s?.myTeamId)?.home_team_id || shown[0].home_team_id;
  const match = shown.find((m) => m.home_team_id === selectedHome) ?? shown[0];
  const lineupOf = (tid: number) => lineups.data?.lineups.find((l) => l.team_id === tid);
  const calc = (tid: number, sim: boolean) => teamCalc(tid, rosterOf(data, tid), lineupOf(tid), live.data, cfg, sim, overrides);
  const mc = (m: CalendarRow, sim: boolean) => matchCalc(calc(m.home_team_id, sim), calc(m.away_team_id, sim), cfg);
  const current = mc(match, simulate);
  const names = new Map(data.teams.map((t) => [t.id, t.name]));
  const isMine = match.home_team_id === s?.myTeamId || match.away_team_id === s?.myTeamId;

  const select = (homeId: number) => { setParams({ partita: String(homeId) }); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="scoreboard flex-1 text-2xl leading-none">Live</h1>
        <label className="flex min-w-0 items-center gap-1 text-xs text-muted">
          <span className="sr-only">Partita</span>
          <select value={match.home_team_id} onChange={(e) => select(Number(e.target.value))} aria-label="Partita della giornata" className="max-w-[220px] rounded-full border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink">
            {shown.map((m) => <option key={m.home_team_id} value={m.home_team_id}>{names.get(m.home_team_id)} – {names.get(m.away_team_id)}{mineOf(m) ? " (la tua)" : ""}</option>)}
          </select>
        </label>
      </div>
      {!started && <p className="-mt-2 text-xs text-muted">Prima del calcio d'inizio si vede chi ha già inserito la formazione; le formazioni delle altre squadre compaiono dal primo fischio. Il risultato è stimato con fantavoto 6 per chi deve giocare.</p>}
      <Scoreboard match={match} names={names} calc={current} simulate={simulate} phase={round.data!.phase} />
      {match.home_goals !== null && (
        <section className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
          <b>Risultato ufficiale: {match.home_goals}-{match.away_goals}</b> ({fmt(match.home_points)} – {fmt(match.away_points)}), dal calendario importato
          {calendar.importedAt ? ` il ${new Date(calendar.importedAt).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}. Il tabellone sopra resta la stima di FootballLite.
        </section>
      )}

      <MatchDetail match={match} names={names} data={data} lineupOf={lineupOf} calc={current} outlook={outlook.data?.players} live={live.data} myTeamId={s?.myTeamId ?? null} started={started}
        action={started ? <button className="text-xs font-semibold text-accent underline" onClick={() => setEditing(true)}>Modifica voti{Object.keys(overrides).length ? " ✓" : ""}</button> : null} />

      <ModsCard calc={current} names={names} match={match} />

      {isMine && s?.myTeamId && started && (
        <Link to="/formazione" className="text-center text-sm font-semibold text-danger underline">Modifica formazione (giornata iniziata)</Link>
      )}

      <Card title="Altri punteggi">
        <ul className="flex flex-col divide-y divide-line">
          {shown.filter((m) => m !== match).map((m) => {
            const r = mc(m, simulate);
            const hp = r.result?.home.final ?? r.home?.score.total ?? null;
            const ap = r.result?.away.final ?? r.away?.score.total ?? null;
            return (
              <li key={m.home_team_id}>
                <button onClick={() => select(m.home_team_id)} className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 py-2.5 text-left text-sm" aria-label={`Dettaglio ${names.get(m.home_team_id)} – ${names.get(m.away_team_id)}`}>
                  <span className="truncate">{names.get(m.home_team_id)}{!r.home && <span className="block text-[10px] text-danger">formazione mancante</span>}</span>
                  <span className="tabular text-center">
                    {r.result ? <><b className="scoreboard text-lg">{r.result.goals[0]}-{r.result.goals[1]}</b><span className="block text-[10px] text-muted">{fmt(hp)} – {fmt(ap)}</span></> : <span className="text-[10px] text-muted">{hp !== null ? fmt(hp) : ""} – {ap !== null ? fmt(ap) : ""}</span>}
                  </span>
                  <span className="truncate text-right">{names.get(m.away_team_id)}{!r.away && <span className="block text-[10px] text-danger">formazione mancante</span>}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-muted">Tocca una partita per il dettaglio delle due formazioni. Risultati stimati (chi deve ancora giocare vale 6). Voti stimati da FootballLite: non sono i voti ufficiali. I risultati ufficiali compaiono quando l'admin reimporta il calendario da Leghe Fantacalcio{calendar.importedAt ? ` (ultimo import: ${new Date(calendar.importedAt).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})` : ""}.</p>
      </Card>

      {editing && (
        <SimEditor onClose={() => setEditing(false)} teams={[current.home, current.away]} teamIds={[match.home_team_id, match.away_team_id]} names={names} overrides={overrides} setOverrides={setOverrides} />
      )}
    </div>
  );
}

function Scoreboard({ match, names, calc, simulate, phase }: { match: CalendarRow; names: Map<number, string>; calc: MatchCalc; simulate: boolean; phase: string }) {
  const r = calc.result;
  const hp = r?.home.final ?? calc.home?.score.total ?? null;
  const ap = r?.away.final ?? calc.away?.score.total ?? null;
  return (
    <section className="hero rounded-2xl p-5 text-chalk" aria-label="Tabellone">
      <div className="mb-3 flex items-baseline justify-between text-xs text-chalk/70">
        <span>{match.league_day}ª giornata di lega</span>
        <span>{phase === "live" ? "Live" : phase === "finished" ? "Finale" : "Da giocare"}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
        <Side id={match.home_team_id} name={names.get(match.home_team_id) ?? ""} />
        <div className="tabular">
          {/* Senza una delle due formazioni (e senza una regola della lega) non c'è risultato: solo i punti della squadra presente. */}
          <div className="scoreboard text-5xl leading-none">{r ? `${r.goals[0]}-${r.goals[1]}` : "–"}</div>
          <div className="mt-1 text-xs text-chalk/75">{hp !== null ? fmt(hp) : ""} – {ap !== null ? fmt(ap) : ""}</div>
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

/** Dettaglio dei modificatori applicati alle due squadre. */
function ModsCard({ calc, names, match }: { calc: MatchCalc; names: Map<number, string>; match: CalendarRow }) {
  const r = calc.result;
  const list = (t: TeamMatchScore | undefined, fallback: Modifier[] | undefined): Modifier[] => (t ? [...t.mods, ...t.matchMods] : fallback ?? []);
  const hm = list(r?.home, calc.home?.score.mods);
  const am = list(r?.away, calc.away?.score.mods);
  if (!hm.length && !am.length) return null;
  const col = (title: string, mods: Modifier[]) => (
    <div className="min-w-0">
      <div className="mb-1 truncate text-xs font-semibold">{title}</div>
      {mods.length ? mods.map((m, i) => (
        <div key={i} className="flex justify-between gap-2 text-xs"><span className="truncate text-muted">{m.label}</span><span className="tabular">{m.value > 0 ? "+" : ""}{fmt(m.value)}</span></div>
      )) : <div className="text-xs text-muted">Nessuno</div>}
    </div>
  );
  return (
    <Card title="Modificatori">
      <div className="grid grid-cols-2 gap-4">{col(names.get(match.home_team_id) ?? "", hm)}{col(names.get(match.away_team_id) ?? "", am)}</div>
    </Card>
  );
}

/**
 * Dettaglio della partita: i giocatori delle due squadre in verticale, su due colonne nello stesso contenitore,
 * con il fantavoto (live o ipotetico 6 per chi deve giocare) e la titolarità stimata.
 */
function MatchDetail({ match, names, data, lineupOf, calc, outlook, live, myTeamId, started, action }: {
  match: CalendarRow; names: Map<number, string>; data: LeagueData; lineupOf: (t: number) => Lineup | undefined;
  calc: MatchCalc; outlook?: Record<string, Outlook>; live?: LiveData; myTeamId: number | null; started: boolean; action?: React.ReactNode;
}) {
  const column = (tid: number, t: TeamCalc | null) => {
    const lineup = lineupOf(tid);
    const roster = new Map(rosterOf(data, tid).map((p) => [String(p.slot), p]));
    const subsIn = new Set(t?.score.substitutions.map((x) => x.in).filter((x): x is string => !!x));
    const subsOut = new Set(t?.score.substitutions.filter((x) => x.in).map((x) => x.out));
    const row = (p: Named, i?: number) => {
      const info = roster.get(p.id);
      const o = info?.ext_id ? outlook?.[info.ext_id] : undefined;
      const ev = info?.ext_id ? live?.events[info.ext_id] : undefined;
      const tags = ev ? [...Array(ev.goals + ev.penaltyScored).fill("⚽"), ...Array(ev.assists).fill("A"), ...Array(ev.yellow).fill("🟨"), ...Array(ev.red).fill("🟥"), ...Array(ev.ownGoals).fill("AG")] : [];
      const isCaptain = t?.score.captainId === p.id;
      return (
        <li key={p.id} className={`flex items-center gap-1.5 py-1 ${subsOut.has(p.id) ? "opacity-50" : ""}`}>
          {i !== undefined && <span className="w-3 shrink-0 text-[10px] text-muted tabular">{i + 1}</span>}
          <RoleTag role={p.role} size={14} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight">
              {p.name}{isCaptain && <span className="ml-1 rounded bg-card px-1 text-[9px] font-extrabold text-card-ink">C</span>}
              {subsIn.has(p.id) && <span className="text-[9px] text-accent"> ↑</span>}{subsOut.has(p.id) && <span className="text-[9px] text-danger"> ↓</span>}
            </span>
            {tags.length > 0 && <span className="block truncate text-[10px] leading-tight text-muted">{tags.join(" ")}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <StarterPercent percent={o?.starterPercent} />
            <span className={`w-8 text-right text-[13px] tabular ${p.state === "pending" ? "text-muted" : "font-bold"}`}>{p.state === "absent" ? "s.v." : p.fantavote !== null ? fmt(p.fantavote) : "–"}</span>
          </span>
        </li>
      );
    };
    const head = (
      <div className="mb-1 flex items-center gap-2 border-b border-line pb-1.5">
        <TeamBadge id={tid} name={names.get(tid) ?? ""} size={24} />
        <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{names.get(tid)}</span>
        {t && <span className="scoreboard tabular text-base">{fmt(t.score.total)}</span>}
      </div>
    );
    if (!lineup) {
      return (
        <div className="min-w-0">{head}
          <p className="py-3 text-xs text-muted">Formazione non inserita.</p>
          {myTeamId && started && <Link to={tid === myTeamId ? "/formazione" : `/formazione?squadra=${tid}`} className="text-xs font-semibold text-accent underline">{tid === myTeamId ? "Inserisci la tua" : "Inseriscila tu"}</Link>}
        </div>
      );
    }
    if (lineup.hidden || !t) return <div className="min-w-0">{head}<p className="py-3 text-xs text-muted">Formazione inserita: visibile dal primo calcio d'inizio.</p></div>;
    return (
      <div className="min-w-0">
        {head}
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">Titolari {lineup.module.split("").join("-")}</p>
        <ul className="divide-y divide-line">{t.starters.map((p) => row(p))}</ul>
        <p className="mt-2 mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">Panchina</p>
        <ol className="divide-y divide-line">{t.bench.map((p, i) => row(p, i))}</ol>
        {lineup.recovered && <p className="mt-1 text-[10px] text-muted">Ultima formazione inserita (regola della lega).</p>}
        {lineup.entered_by && !lineup.recovered && <p className="mt-1 text-[10px] text-muted">Inserita da {names.get(lineup.entered_by) ?? "un altro utente"}.</p>}
        {lineup.forced && !lineup.entered_by && <p className="mt-1 text-[10px] text-danger">Modificata a giornata iniziata.</p>}
      </div>
    );
  };
  return (
    <Card title="Formazioni" action={action}>
      <div className="grid grid-cols-2 gap-3">{column(match.home_team_id, calc.home)}{column(match.away_team_id, calc.away)}</div>
      <p className="mt-2 text-[11px] text-muted">Voto: fantavoto live, oppure 6 ipotetico per chi deve ancora giocare. Accanto la titolarità stimata. ↑ entra, ↓ esce.</p>
    </Card>
  );
}

/** "Modifica voti" come nel simulatore di Leghe Fantacalcio: prende voto sì/no, voto e bonus/malus ipotetici. */
function SimEditor({ onClose, teams, teamIds, names, overrides, setOverrides }: {
  onClose: () => void; teams: (TeamCalc | null)[]; teamIds: number[]; names: Map<number, string>;
  overrides: SimOverrides; setOverrides: (o: SimOverrides) => void;
}) {
  const [draft, setDraft] = useState<SimOverrides>(overrides);
  const set = (key: string, patch: Partial<SimOverrides[string]>, p: Named) => {
    const cur = draft[key] ?? { plays: p.state !== "absent", vote: p.vote ?? SIM_DEFAULT_VOTE, bonus: p.bonus };
    setDraft({ ...draft, [key]: { ...cur, ...patch } });
  };
  return (
    <Sheet open onClose={onClose} title="Modifica voti">
      {[0, 1].map((i) => {
        const t = teams[i];
        return (
          <div key={i} className="mb-4">
            <h3 className="mb-1 font-semibold">{names.get(teamIds[i])}</h3>
            {!t ? <p className="text-xs text-muted">Formazione non disponibile.</p> : (
              <ul className="divide-y divide-line">
                {[...t.starters, ...t.bench].map((p) => {
                  const key = simKey(teamIds[i], p.id);
                  const o = draft[key];
                  const plays = o ? o.plays : p.state !== "absent";
                  return (
                    <li key={key} className="flex items-center gap-2 py-1.5 text-sm">
                      <RoleTag role={p.role} />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <label className="flex items-center gap-1 text-[11px]">
                        <input type="checkbox" className="accent-[var(--color-accent)]" checked={plays} onChange={(e) => set(key, { plays: e.target.checked }, p)} />Prende voto
                      </label>
                      <input type="number" step={0.5} aria-label={`Voto di ${p.name}`} disabled={!plays} className="w-14 rounded border border-line bg-surface px-1 text-right tabular disabled:opacity-40"
                        value={o?.vote ?? p.vote ?? SIM_DEFAULT_VOTE} onChange={(e) => set(key, { vote: Number(e.target.value) }, p)} />
                      <input type="number" step={0.5} aria-label={`Bonus/malus di ${p.name}`} disabled={!plays} className="w-14 rounded border border-line bg-surface px-1 text-right tabular disabled:opacity-40"
                        value={o?.bonus ?? p.bonus} onChange={(e) => set(key, { bonus: Number(e.target.value) }, p)} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={() => { setDraft({}); setOverrides({}); }}>Azzera</Button>
        <Button variant="card" className="flex-1" onClick={() => { setOverrides(draft); onClose(); }}>Calcola risultato</Button>
      </div>
    </Sheet>
  );
}
