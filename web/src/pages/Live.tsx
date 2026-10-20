import type { Modifier, TeamMatchScore } from "@footballlite/core";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card, Empty, ErrorBox, RoleTag, Sheet, Spinner, StarterPercent, Tabs, TeamBadge, fmt } from "../components/ui";
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
  // Il risultato stimato (chi deve ancora giocare vale 6) si vede subito, come «Simula risultato» di Leghe Fantacalcio;
  // «Solo voti arrivati» mostra il parziale con i soli voti già disponibili.
  const [simulate, setSimulate] = useState(true);
  const [overrides, setOverrides] = useState<SimOverrides>({});
  const [editing, setEditing] = useState(false);

  if (league.isLoading || round.isLoading || calendar.isLoading || lineups.isLoading) return <Spinner />;
  if (league.error || round.error) return <ErrorBox error={league.error ?? round.error} />;
  const data = league.data!;
  const cfg = data.league.config;
  const matches = leagueMatches(calendar.data, md!);
  if (!matches.length) return <Card title="Live"><Empty>Nessuna partita di lega in questa giornata (calendario non importato o giornata di riposo).</Empty></Card>;

  const selectedHome = Number(params.get("partita")) || myMatch(calendar.data, md!, s?.myTeamId)?.home_team_id || matches[0].home_team_id;
  const match = matches.find((m) => m.home_team_id === selectedHome) ?? matches[0];
  const lineupOf = (tid: number) => lineups.data?.lineups.find((l) => l.team_id === tid);
  const calc = (tid: number, sim: boolean) => teamCalc(tid, rosterOf(data, tid), lineupOf(tid), live.data, cfg, sim, overrides);
  const mc = (m: CalendarRow, sim: boolean) => matchCalc(calc(m.home_team_id, sim), calc(m.away_team_id, sim), cfg);
  const current = mc(match, simulate);
  const names = new Map(data.teams.map((t) => [t.id, t.name]));
  const isMine = match.home_team_id === s?.myTeamId || match.away_team_id === s?.myTeamId;

  return (
    <div className="flex flex-col gap-4">
      <Scoreboard match={match} names={names} calc={current} simulate={simulate} phase={round.data!.phase} />
      {match.home_goals !== null && (
        <section className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
          <b>Risultato ufficiale: {match.home_goals}-{match.away_goals}</b> ({fmt(match.home_points)} – {fmt(match.away_points)}), dal calendario importato
          {calendar.importedAt ? ` il ${new Date(calendar.importedAt).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}. Il tabellone sopra resta la stima di FootballLite.
        </section>
      )}

      <section className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
        <div className="min-w-0 text-xs text-muted">
          {simulate
            ? <>Risultato stimato con il regolamento della lega: chi deve ancora giocare vale fantavoto {SIM_DEFAULT_VOTE}{Object.keys(overrides).length ? ", con le tue ipotesi" : ""}.</>
            : <>Parziale con i soli voti già arrivati: chi deve ancora giocare non conta.</>}
          {" "}<button className="font-semibold text-accent underline" onClick={() => { setSimulate(!simulate); if (simulate) setOverrides({}); }}>{simulate ? "Solo voti arrivati" : "Risultato stimato"}</button>
        </div>
        {simulate && <Button variant="ghost" className="shrink-0" onClick={() => setEditing(true)}>Modifica voti</Button>}
      </section>

      <ModsCard calc={current} names={names} match={match} />

      {isMine && s?.myTeamId && (
        <Link to="/formazione" className="text-center text-sm font-semibold text-danger underline">Modifica formazione (giornata iniziata)</Link>
      )}

      <TeamsPanel match={match} names={names} data={data} lineupOf={lineupOf} calc={current} outlook={outlook.data?.players} live={live.data} myTeamId={s?.myTeamId ?? null} />

      <Card title="Altri punteggi">
        <ul className="flex flex-col divide-y divide-line">
          {matches.filter((m) => m !== match).map((m) => {
            const r = mc(m, simulate);
            const hp = r.result?.home.final ?? r.home?.score.total ?? null;
            const ap = r.result?.away.final ?? r.away?.score.total ?? null;
            return (
              <li key={m.home_team_id}>
                <button onClick={() => setParams({ partita: String(m.home_team_id) })} className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 py-2.5 text-left text-sm">
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
        <p className="mt-2 text-[11px] text-muted">{simulate ? "Risultati stimati (chi deve ancora giocare vale 6)." : "Punteggi parziali con i voti già arrivati."} Voti stimati da FootballLite su statistiche BSD: non sono i voti ufficiali. I risultati ufficiali compaiono quando l'admin reimporta il calendario da Leghe Fantacalcio{calendar.importedAt ? ` (ultimo import: ${new Date(calendar.importedAt).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})` : ""}.</p>
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
    <section className="rounded-2xl bg-pitch-deep p-5 text-chalk" aria-label="Tabellone">
      <div className="mb-3 flex items-baseline justify-between text-xs text-chalk/70">
        <span>{match.league_day}ª giornata di lega</span>
        <span>{phase === "live" ? (simulate ? "Live · risultato stimato" : "Live · parziale") : phase === "finished" ? "Finale stimato" : simulate ? "Risultato stimato" : "Da giocare"}</span>
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

function TeamsPanel({ match, names, data, lineupOf, calc, outlook, live, myTeamId }: {
  match: CalendarRow; names: Map<number, string>; data: LeagueData; lineupOf: (t: number) => Lineup | undefined;
  calc: MatchCalc; outlook?: Record<string, Outlook>; live?: LiveData; myTeamId: number | null;
}) {
  const [side, setSide] = useState<"home" | "away">("home");
  const tid = side === "home" ? match.home_team_id : match.away_team_id;
  const lineup = lineupOf(tid);
  const t = side === "home" ? calc.home : calc.away;
  const roster = new Map(rosterOf(data, tid).map((p) => [String(p.slot), p]));
  const subsIn = new Set(t?.score.substitutions.map((x) => x.in).filter((x): x is string => !!x));
  const office = new Set(t?.score.counted.filter((p) => p.state === "office").map((p) => p.id));
  const subsOut = new Set(t?.score.substitutions.filter((x) => x.in).map((x) => x.out));

  const row = (p: Named) => {
    const info = roster.get(p.id);
    const o = info?.ext_id ? outlook?.[info.ext_id] : undefined;
    const ev = info?.ext_id ? live?.events[info.ext_id] : undefined;
    const tags = ev ? [
      ...Array(ev.goals + ev.penaltyScored).fill("⚽"), ...Array(ev.assists).fill("assist"), ...Array(ev.yellow).fill("🟨"), ...Array(ev.red).fill("🟥"),
      ...Array(ev.ownGoals).fill("autogol"), ...Array(ev.penaltyMissed).fill("rig. sbagliato"), ...Array(ev.penaltySaved).fill("rig. parato"),
    ] : [];
    const isCaptain = t?.score.captainId === p.id;
    return (
      <li key={p.id} className={`flex items-center gap-2 py-1.5 ${subsOut.has(p.id) ? "opacity-50" : ""}`}>
        <RoleTag role={p.role} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">
            {p.name}{isCaptain && <span className="ml-1 rounded bg-card px-1 text-[10px] font-bold text-card-ink">C</span>}
            {subsIn.has(p.id) && <span className="text-[10px] text-accent"> entra</span>}
            {subsOut.has(p.id) && <span className="text-[10px] text-danger"> esce</span>}
            {office.has(p.id) && <span className="text-[10px] text-muted"> voto d'ufficio</span>}
          </div>
          <div className="truncate text-[11px] text-muted">{tags.join(" ") || o?.opponent || ""}</div>
        </div>
        {p.state === "pending" ? (
          <span className="flex items-center gap-2"><StarterPercent percent={o?.starterPercent} /><span className="tabular text-sm text-muted">{p.fantavote !== null ? `${fmt(p.fantavote)}*` : "–"}</span></span>
        ) : (
          <span className="text-right tabular">
            <span className="block text-sm font-bold">{p.state === "absent" ? "s.v." : fmt(p.fantavote)}</span>
            {p.vote !== null && <span className="block text-[10px] text-muted">voto {fmt(p.vote)}{p.bonus ? ` ${p.bonus > 0 ? "+" : ""}${fmt(p.bonus)}` : ""}</span>}
          </span>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={side} onChange={setSide} items={[{ value: "home", label: names.get(match.home_team_id) ?? "Casa" }, { value: "away", label: names.get(match.away_team_id) ?? "Trasferta" }]} />
      {!lineup ? (
        <Card>
          <Empty>{names.get(tid)} non ha inserito la formazione: per questa partita non c'è un risultato.</Empty>
          {myTeamId && (
            <Link to={tid === myTeamId ? "/formazione" : `/formazione?squadra=${tid}`} className="block">
              <Button variant="ghost" className="w-full">{tid === myTeamId ? "Inserisci la tua formazione" : `Inserisci tu la formazione di ${names.get(tid)}`}</Button>
            </Link>
          )}
        </Card>
      ) : lineup.hidden || !t ? <Card><Empty>Formazione visibile dal primo calcio d'inizio.</Empty></Card> : (
        <>
          {lineup.recovered && <p className="text-xs text-muted">Formazione non inserita: si usa l'ultima inserita, come da regolamento.</p>}
          {lineup.entered_by && !lineup.recovered && (
            <p className="text-xs text-muted">Formazione inserita da {names.get(lineup.entered_by) ?? "un altro utente"}.{" "}
              {myTeamId && <Link to={tid === myTeamId ? "/formazione" : `/formazione?squadra=${tid}`} className="underline">{tid === myTeamId ? "Sostituiscila con la tua" : "Correggila"}</Link>}
            </p>
          )}
          {lineup.forced && !lineup.entered_by && (
            <p className="text-xs text-danger">Formazione modificata a giornata iniziata ({new Date(lineup.created_at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}).</p>
          )}
          <Card title={`Titolari ${lineup.module.split("").join("-")}`} action={<span className="scoreboard tabular text-xl">{fmt(t.score.base)}</span>}>
            <ul className="divide-y divide-line">{t.starters.map(row)}</ul>
          </Card>
          <Card title="Panchina"><ul className="divide-y divide-line">{t.bench.map(row)}</ul></Card>
          <p className="text-[11px] text-muted">* Da giocare: in simulazione vale il fantavoto ipotetico. A fianco la titolarità stimata.</p>
        </>
      )}
    </div>
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
