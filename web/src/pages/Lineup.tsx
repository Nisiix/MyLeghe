import { moduleShape, orderBench, ROLES, suggestLineup, validateLineup, type LeagueConfig, type ScoredPlayer } from "@footballlite/core";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Empty, ErrorBox, PlayerAvatar, RoleTag, Sheet, Spinner, StarterPercent, fmt } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useLeague, useLineups, useOutlook, useRound, type Lineup, type Outlook, type RosterPlayer } from "../lib/data";
import { useSession } from "../lib/session";
import { newsSearchUrl, rosterOf, scoredRoster } from "../lib/team";

type Row = ScoredPlayer & { info: RosterPlayer; outlook?: Outlook };

export function LineupPage() {
  const s = useSession();
  const league = useLeague();
  const round = useRound();
  const outlook = useOutlook();
  const lineups = useLineups(round.data?.matchday);

  if (league.isLoading || round.isLoading || outlook.isLoading || lineups.isLoading) return <Spinner label="Carico la tua rosa…" />;
  if (league.error || round.error) return <ErrorBox error={league.error ?? round.error} />;
  if (!s?.myTeamId) return <Card title="Formazione"><Empty>Scegli il tuo utente nelle <Link to="/impostazioni" className="underline">impostazioni</Link>.</Empty></Card>;
  const roster = rosterOf(league.data!, s.myTeamId);
  if (!roster.length) return <Card title="Formazione"><Empty>La rosa della tua squadra non è ancora stata importata.</Empty></Card>;
  const cfg = league.data!.league.config;
  const scored = scoredRoster(roster, outlook.data?.players, cfg);
  const current = lineups.data?.lineups.find((l) => l.team_id === s.myTeamId && !l.hidden);
  return <Editor key={current?.id ?? "new"} teamId={s.myTeamId} round={round.data!.matchday} started={round.data!.phase !== "upcoming"} scored={scored} cfg={cfg} current={current} />;
}

function Editor({ teamId, round, started, scored, cfg, current }: { teamId: number; round: number; started: boolean; scored: Row[]; cfg: LeagueConfig; current?: Lineup }) {
  const qc = useQueryClient();
  const byId = useMemo(() => new Map(scored.map((p) => [p.id, p])), [scored]);
  const initial = useMemo(() => {
    if (current) return { module: current.module, starters: current.starters.map(String), bench: current.bench.map(String) };
    const sug = suggestLineup(scored, cfg);
    return sug ? { module: sug.module, starters: sug.starters.map((p) => p.id), bench: sug.bench.map((p) => p.id) } : { module: cfg.modules[0], starters: [], bench: [] };
  }, [current, scored, cfg]);
  const [module, setModule] = useState(initial.module);
  const [starters, setStarters] = useState<string[]>(initial.starters);
  const [bench, setBench] = useState<string[]>(initial.bench);
  const [picking, setPicking] = useState<{ role: number; replace: string | null } | null>(null);
  const [confirmForce, setConfirmForce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(current ? null : { ok: true, text: "Ti proponiamo la formazione consigliata: controllala e salvala." });

  const starterRows = starters.map((id) => byId.get(id)).filter(Boolean) as Row[];
  const benchRows = bench.map((id) => byId.get(id)).filter(Boolean) as Row[];
  const used = new Set([...starters, ...bench]);
  const stands = scored.filter((p) => !used.has(p.id)).sort((a, b) => a.role - b.role || b.score - a.score);
  const errors = validateLineup(starterRows, bench, module, cfg);
  const expected = starterRows.reduce((sum, p) => sum + (Number.isNaN(p.score) ? 0 : p.score), 0);

  function applySuggestion() {
    const sug = suggestLineup(scored, cfg);
    if (!sug) { setMessage({ ok: false, text: "Non ci sono abbastanza giocatori per una formazione valida." }); return; }
    setModule(sug.module);
    setStarters(sug.starters.map((p) => p.id));
    setBench(sug.bench.map((p) => p.id));
    setMessage({ ok: true, text: `Formazione consigliata applicata (${sug.module.split("").join("-")}). Controlla e salva.` });
  }

  /** Cambio modulo: si tengono i titolari migliori per ruolo, gli esclusi vanno in panchina. */
  function changeModule(mod: string) {
    const shape = moduleShape(mod);
    if (!shape) return;
    const want = [1, ...shape];
    const pool = [...starterRows, ...benchRows, ...stands];
    const next: string[] = [];
    ROLES.forEach((role, i) => {
      const keep = starterRows.filter((p) => p.role === role).sort((a, b) => b.score - a.score);
      const extra = pool.filter((p) => p.role === role && !keep.includes(p)).sort((a, b) => b.score - a.score);
      next.push(...[...keep, ...extra].slice(0, want[i]).map((p) => p.id));
    });
    const nextSet = new Set(next);
    const kept = bench.filter((id) => !nextSet.has(id));
    const dropped = starterRows.filter((p) => !nextSet.has(p.id)).map((p) => p.id);
    const newBench = [...kept, ...dropped].slice(0, cfg.benchCount);
    setModule(mod);
    setStarters(next);
    setBench(newBench.length ? newBench : orderBench(pool.filter((p) => !nextSet.has(p.id)), cfg.benchCount).map((p) => p.id));
    setMessage(null);
  }

  function pick(id: string) {
    if (!picking) return;
    if (picking.replace !== null) {
      const replaced = picking.replace;
      setStarters(starters.map((x) => (x === replaced ? id : x)));
      if (bench.includes(id)) setBench(bench.map((x) => (x === id ? replaced : x)));
    } else {
      setBench([...bench, id].slice(0, cfg.benchCount));
    }
    setPicking(null);
    setMessage(null);
  }

  async function save(forced = false) {
    setSaving(true);
    setMessage(null);
    try {
      await api(`/league/lineups/${round}/${teamId}`, { method: "PUT", body: { module, starters: starters.map(Number), bench: bench.map(Number), forced } });
      await qc.invalidateQueries({ queryKey: ["lineups"] });
      setConfirmForce(false);
      setMessage({ ok: true, text: forced ? "Formazione modificata a giornata iniziata: la modifica è visibile a tutta la lega." : "Formazione salvata." });
    } catch (e) {
      if (e instanceof ApiError && e.body?.needsForce) setConfirmForce(true);
      else setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const rows = [4, 3, 2, 1].map((role) => ({ role, players: starterRows.filter((p) => p.role === role) }));
  const candidates = scored
    .filter((p) => (picking?.role ? p.role === picking.role : true) && !starters.includes(p.id) && (picking?.replace !== null || !bench.includes(p.id)))
    .sort((a, b) => a.role - b.role || b.score - a.score);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="scoreboard text-3xl leading-none">La tua formazione</h1>
          <p className="mt-1 text-xs text-muted">Giornata {round} · punteggio atteso {fmt(expected)}</p>
        </div>
        <Button variant="ghost" onClick={applySuggestion}>Consigliata</Button>
      </div>

      {started && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
          La giornata è iniziata: puoi ancora cambiare la formazione, ma la modifica sarà segnalata a tutta la lega.
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Modulo">
        {cfg.modules.map((m) => (
          <button key={m} role="radio" aria-checked={m === module} onClick={() => changeModule(m)}
            className={`scoreboard rounded-lg border px-3 py-1 text-lg tabular ${m === module ? "border-pitch bg-pitch text-chalk" : "border-line bg-surface text-muted"}`}>
            {m.split("").join("-")}
          </button>
        ))}
      </div>

      <div className="pitch flex flex-col gap-5 rounded-2xl px-2 py-5">
        {rows.map((r) => (
          <div key={r.role} className="flex justify-center gap-1">
            {r.players.map((p) => <PitchPlayer key={p.id} p={p} onClick={() => setPicking({ role: p.role, replace: p.id })} />)}
          </div>
        ))}
      </div>
      <p className="-mt-2 text-[11px] text-muted">Sotto ogni giocatore la titolarità stimata da FootballLite (dati BSD). Tocca un giocatore per sostituirlo.</p>

      {errors.length > 0 && <div className="rounded-xl border border-warn/40 bg-card/20 p-3 text-sm">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
      {message && <div className={`rounded-xl p-3 text-sm ${message.ok ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"}`}>{message.text}</div>}

      <Card title={`Panchina ${bench.length}/${cfg.benchCount}`} action={<button className="text-sm font-semibold text-accent" onClick={() => setPicking({ role: 0, replace: null })}>Aggiungi</button>}>
        <ol className="flex flex-col divide-y divide-line">
          {benchRows.map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 py-1.5">
              <span className="w-5 text-xs text-muted tabular">{i + 1}</span>
              <RoleTag role={p.role} />
              <span className="flex-1 truncate text-sm">{p.name} <span className="text-xs text-muted">{p.outlook?.opponent ?? ""}</span></span>
              <StarterPercent percent={p.starterPercent} />
              <button aria-label={`Sposta su ${p.name}`} className="px-1 text-muted disabled:opacity-30" disabled={i === 0} onClick={() => setBench(move(bench, i, i - 1))}>▲</button>
              <button aria-label={`Sposta giù ${p.name}`} className="px-1 text-muted disabled:opacity-30" disabled={i === bench.length - 1} onClick={() => setBench(move(bench, i, i + 1))}>▼</button>
              <button aria-label={`Togli ${p.name}`} className="px-1 text-muted" onClick={() => setBench(bench.filter((x) => x !== p.id))}>✕</button>
            </li>
          ))}
        </ol>
      </Card>

      <div className="sticky bottom-4 z-20">
        <Button variant={started ? "danger" : "card"} className="w-full py-3 text-base" disabled={saving || errors.length > 0} onClick={() => save(false)}>
          {saving ? "Salvataggio…" : started ? "Salva modifica forzata" : "Salva formazione"}
        </Button>
      </div>

      <Card title="Tribuna">
        <ul className="flex flex-col divide-y divide-line">
          {stands.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
              <RoleTag role={p.role} />
              <span className="flex-1 truncate">{p.name} <span className="text-xs text-muted">{p.outlook?.opponent ?? ""}</span></span>
              <StarterPercent percent={p.starterPercent} />
            </li>
          ))}
        </ul>
      </Card>

      <Sheet open={!!picking} onClose={() => setPicking(null)} title={picking?.replace ? "Sostituisci con" : "Aggiungi in panchina"}>
        <ul className="flex flex-col gap-1">
          {candidates.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <button onClick={() => pick(p.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-left">
                <PlayerAvatar name={p.name} role={p.role} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name}{bench.includes(p.id) && <span className="text-[10px] text-muted"> (panchina)</span>}</div>
                  <div className="text-xs text-muted">{statusText(p.outlook)} FM stimata {fmt(p.expectedFantavote, 2)}</div>
                </div>
                <StarterPercent percent={p.starterPercent} />
              </button>
              <a href={newsSearchUrl(p.info.ext_name ?? p.name)} target="_blank" rel="noreferrer" className="shrink-0 px-1 text-xs text-accent underline">News</a>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={confirmForce} onClose={() => setConfirmForce(false)} title="Modificare a giornata iniziata?">
        <p className="mb-4 text-sm">La giornata di Serie A è già cominciata. La nuova formazione sostituirà quella precedente, resterà nello storico e tutta la lega vedrà che è stata modificata dopo l'inizio.</p>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setConfirmForce(false)}>Annulla</Button>
          <Button variant="danger" className="flex-1" disabled={saving} onClick={() => save(true)}>Modifica comunque</Button>
        </div>
      </Sheet>
    </div>
  );
}

function statusText(o?: Outlook): string {
  if (!o) return "Non abbinato alla fonte dati ·";
  if (o.unavailable === "injury") return "Infortunato ·";
  if (o.unavailable === "suspension") return "Squalificato ·";
  if (o.unavailable) return "Indisponibile ·";
  if (o.doubtful) return "In dubbio ·";
  return o.opponent ? `${o.opponent} ·` : "";
}

function PitchPlayer({ p, onClick }: { p: Row; onClick: () => void }) {
  const low = !Number.isNaN(p.starterPercent) && p.starterPercent < 70;
  return (
    <button onClick={onClick} className="flex w-[74px] flex-col items-center gap-0.5 text-center text-chalk">
      <span className={`rounded-full p-0.5 ${low ? "ring-2 ring-card" : ""}`}><PlayerAvatar name={p.name} role={p.role} size={44} /></span>
      <StarterPercent percent={p.starterPercent} />
      <span className="w-full truncate rounded bg-black/45 px-1 text-[11px] font-semibold leading-4">{p.name}</span>
      <span className="text-[10px] leading-3 text-chalk/75">{p.outlook?.opponent ?? ""}</span>
    </button>
  );
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const out = [...arr];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}
