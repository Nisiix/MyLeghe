import { moduleShape, orderBench, parseLineupText, ROLE_NAME, ROLES, suggestLineup, validateLineup, type LeagueConfig, type ScoredPlayer } from "@footballlite/core";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  const [params] = useSearchParams();
  // Dopo il salvataggio l'editor si ricarica con la formazione salvata: la conferma resta visibile.
  const [saved, setSaved] = useState<string | null>(null);

  if (league.isLoading || round.isLoading || outlook.isLoading || lineups.isLoading) return <Spinner label="Carico la tua rosa…" />;
  if (league.error || round.error) return <ErrorBox error={league.error ?? round.error} />;
  if (!s?.myTeamId) return <Card title="Formazione"><Empty>Collega la tua rosa al profilo dalle <Link to="/impostazioni" className="underline">impostazioni</Link>.</Empty></Card>;
  const started = round.data!.phase !== "upcoming";
  // Inserimento per conto di un altro utente: solo a giornata iniziata e se lui non ha inserito la sua.
  const target = Number(params.get("squadra")) || s.myTeamId;
  const proxyFor = target !== s.myTeamId ? league.data!.teams.find((t) => t.id === target) : undefined;
  const current = lineups.data?.lineups.find((l) => l.team_id === target && !l.hidden);
  if (proxyFor && (!started || (current && !current.entered_by))) {
    return <Card title="Formazione"><Empty>{!started ? "Prima dell'inizio della giornata ognuno inserisce la propria formazione." : `${proxyFor.name} ha già inserito la sua formazione.`}</Empty></Card>;
  }
  const roster = rosterOf(league.data!, target);
  if (!roster.length) return <Card title="Formazione"><Empty>La rosa di questo utente non è ancora stata importata.</Empty></Card>;
  const cfg = league.data!.league.config;
  const scored = scoredRoster(roster, outlook.data?.players, cfg);
  const unmatched = roster.filter((p) => !p.ext_id).length;
  return (
    <Editor key={`${target}-${current?.id ?? "new"}`} teamId={target} proxyName={proxyFor?.name} round={round.data!.matchday} started={started}
      scored={scored} cfg={cfg} current={current} unmatched={unmatched} admin={!!s.admin} savedMessage={saved} onSaved={setSaved} />
  );
}

type Picking = { role: number; replace: string | null; target: "starters" | "bench" };

/**
 * Inserimento della formazione come in Leghe Fantacalcio: modulo, campo con gli slot del modulo, panchina in ordine,
 * e sotto la rosa per ruolo. Un tocco su un giocatore della rosa lo schiera (campo, poi panchina), un tocco su
 * uno schierato lo toglie; dal titolare si scelgono capitano, vice, panchina o sostituto.
 */
function Editor({ teamId, proxyName, round, started, scored, cfg, current, unmatched, admin, savedMessage, onSaved }: {
  teamId: number; proxyName?: string; round: number; started: boolean; scored: Row[]; cfg: LeagueConfig; current?: Lineup; unmatched: number; admin: boolean;
  savedMessage: string | null; onSaved: (text: string | null) => void;
}) {
  const qc = useQueryClient();
  const byId = useMemo(() => new Map(scored.map((p) => [p.id, p])), [scored]);
  const initial = useMemo(() => {
    if (current) {
      return {
        module: current.module, starters: current.starters.map(String), bench: current.bench.map(String),
        captain: current.captain != null ? String(current.captain) : null, vice: current.vice != null ? String(current.vice) : null,
      };
    }
    const sug = suggestLineup(scored, cfg);
    return sug
      ? { module: sug.module, starters: sug.starters.map((p) => p.id), bench: sug.bench.map((p) => p.id), captain: sug.captain, vice: sug.vice }
      : { module: cfg.modules[0], starters: [] as string[], bench: [] as string[], captain: null, vice: null };
  }, [current, scored, cfg]);
  const [module, setModule] = useState(initial.module);
  const [starters, setStarters] = useState<string[]>(initial.starters);
  const [bench, setBench] = useState<string[]>(initial.bench);
  const [captain, setCaptain] = useState<string | null>(initial.captain);
  const [vice, setVice] = useState<string | null>(initial.vice);
  const captainOn = cfg.modifiers.captain.enabled;
  const [picking, setPicking] = useState<Picking | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [confirmForce, setConfirmForce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    savedMessage ? { ok: true, text: savedMessage } : current ? null : { ok: true, text: "Ti proponiamo la formazione consigliata: controllala e salvala." },
  );

  const shape = moduleShape(module) ?? [0, 0, 0];
  const want: Record<number, number> = { 1: 1, 2: shape[0], 3: shape[1], 4: shape[2] };
  const starterRows = starters.map((id) => byId.get(id)).filter(Boolean) as Row[];
  const benchRows = bench.map((id) => byId.get(id)).filter(Boolean) as Row[];
  const used = new Set([...starters, ...bench]);
  const free = scored.filter((p) => !used.has(p.id));
  const errors = validateLineup({ starters: starterRows, bench: benchRows, module, starterIds: starters, captain, vice }, cfg);
  const expected = starterRows.reduce((sum, p) => sum + (Number.isNaN(p.score) ? 0 : p.score), 0);
  const startersOf = (role: number) => starterRows.filter((p) => p.role === role);
  const benchRoomFor = (role: number) => bench.length < cfg.benchCount && (!cfg.benchPerRole || benchRows.filter((p) => p.role === role).length < cfg.benchPerRole[role - 1]);

  function clearRoles(id: string) {
    if (captain === id) setCaptain(null);
    if (vice === id) setVice(null);
  }

  /** Tocco sulla rosa: prima nello slot libero del suo ruolo in campo, altrimenti in panchina. */
  function addPlayer(id: string) {
    const p = byId.get(id);
    if (!p) return;
    setMessage(null);
    if (startersOf(p.role).length < want[p.role]) { setStarters([...starters, id]); return; }
    if (benchRoomFor(p.role)) { setBench([...bench, id]); return; }
    setMessage({ ok: false, text: `Non c'è posto per ${p.name}: i ${ROLE_NAME[p.role].toLowerCase()} del ${module.split("").join("-")} sono completi e la panchina è piena. Togli prima un giocatore.` });
  }

  function removePlayer(id: string) {
    setStarters(starters.filter((x) => x !== id));
    setBench(bench.filter((x) => x !== id));
    clearRoles(id);
    setAction(null);
    setMessage(null);
  }

  function toBench(id: string) {
    const p = byId.get(id);
    if (!p || !benchRoomFor(p.role)) { setMessage({ ok: false, text: "La panchina è piena: togli prima un panchinaro." }); setAction(null); return; }
    setStarters(starters.filter((x) => x !== id));
    setBench([...bench, id]);
    clearRoles(id);
    setAction(null);
    setMessage(null);
  }

  function applySuggestion() {
    const sug = suggestLineup(scored, cfg);
    if (!sug) { setMessage({ ok: false, text: "Non ci sono abbastanza giocatori per una formazione valida." }); return; }
    const same = sug.module === module && sug.starters.every((p) => starters.includes(p.id));
    setModule(sug.module);
    setStarters(sug.starters.map((p) => p.id));
    setBench(sug.bench.map((p) => p.id));
    setCaptain(sug.captain);
    setVice(sug.vice);
    setMessage({
      ok: true,
      text: same
        ? `La formazione consigliata (${sug.module.split("").join("-")}) coincide con quella in campo.${unmatched === scored.length ? " Senza abbinamento alla fonte dati la stima si basa solo sui crediti d'asta." : ""}`
        : `Formazione consigliata applicata (${sug.module.split("").join("-")}). Controlla e salva.`,
    });
  }

  /**
   * Formazione incollata come testo (es. condivisa da Leghe Fantacalcio o scritta in chat): modulo, titolari,
   * panchina, capitano e vice vengono riconosciuti dai nomi e dai ruoli e abbinati alla rosa.
   */
  function applyPasted() {
    const r = parseLineupText(pasteText, scored, cfg);
    if (!r.starters.length) { setPasteError("Nessun giocatore della rosa riconosciuto nel testo."); return; }
    const mod = r.module && cfg.modules.includes(r.module) ? r.module : module;
    setModule(mod);
    setStarters(r.starters);
    setBench(r.bench);
    setCaptain(captainOn ? r.captain : null);
    setVice(captainOn ? r.vice : null);
    setPasting(false);
    setPasteError(null);
    const notes = [...r.warnings];
    if (r.unmatched.length) notes.push(`Non riconosciuti: ${r.unmatched.join(", ")}.`);
    setMessage({
      ok: r.starters.length === 11 && !r.unmatched.length,
      text: `Formazione incollata: ${mod.split("").join("-")}, ${r.starters.length} titolari, ${r.bench.length} in panchina.${notes.length ? " " + notes.join(" ") : ""} Controlla e salva.`,
    });
  }
  async function pasteFromClipboard() {
    try { setPasteText(await navigator.clipboard.readText()); setPasteError(null); } catch { setPasteError("Non riesco a leggere gli appunti: incolla il testo nel riquadro."); }
  }

  /** Cambio modulo: si tengono i titolari migliori per ruolo, gli esclusi vanno in panchina. */
  function changeModule(mod: string) {
    const sh = moduleShape(mod);
    if (!sh) return;
    const w = [1, ...sh];
    const pool = [...starterRows, ...benchRows, ...free];
    const next: string[] = [];
    ROLES.forEach((role, i) => {
      const keep = starterRows.filter((p) => p.role === role).sort((a, b) => b.score - a.score);
      const extra = pool.filter((p) => p.role === role && !keep.includes(p)).sort((a, b) => b.score - a.score);
      next.push(...[...keep, ...extra].slice(0, w[i]).map((p) => p.id));
    });
    const nextSet = new Set(next);
    const kept = bench.filter((id) => !nextSet.has(id));
    const dropped = starterRows.filter((p) => !nextSet.has(p.id)).map((p) => p.id);
    const newBench = [...kept, ...dropped].slice(0, cfg.benchCount);
    setModule(mod);
    setStarters(next);
    setBench(newBench.length ? newBench : orderBench(pool.filter((p) => !nextSet.has(p.id)), cfg.benchCount, cfg.benchPerRole).map((p) => p.id));
    if (captain && !nextSet.has(captain)) setCaptain(null);
    if (vice && !nextSet.has(vice)) setVice(null);
    setMessage(null);
  }

  /** Scelta dalla lista: sostituzione di un titolare oppure riempimento di uno slot vuoto (campo o panchina). */
  function pick(id: string) {
    if (!picking) return;
    if (picking.replace !== null) {
      const replaced = picking.replace;
      setStarters(starters.map((x) => (x === replaced ? id : x)));
      if (captain === replaced) setCaptain(id);
      if (vice === replaced) setVice(id);
      if (bench.includes(id)) setBench(bench.map((x) => (x === id ? replaced : x)));
    } else if (picking.target === "starters") {
      setStarters([...starters, id]);
      setBench(bench.filter((x) => x !== id));
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
      await api(`/league/lineups/${round}/${teamId}`, { method: "PUT", body: { module, starters: starters.map(Number), bench: bench.map(Number), captain: captainOn && captain ? Number(captain) : null, vice: captainOn && vice ? Number(vice) : null, forced: forced || !!proxyName } });
      const text = proxyName ? `Formazione di ${proxyName} inserita: risulterà inserita da te.` : forced ? "Formazione modificata a giornata iniziata: la modifica è visibile a tutta la lega." : "Formazione salvata.";
      onSaved(text);
      setMessage({ ok: true, text });
      setConfirmForce(false);
      await qc.invalidateQueries({ queryKey: ["lineups"] });
    } catch (e) {
      if (e instanceof ApiError && e.body?.needsForce) setConfirmForce(true);
      else setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const rows = [4, 3, 2, 1].map((role) => ({ role, players: startersOf(role), empty: Math.max(0, want[role] - startersOf(role).length) }));
  const candidates = scored
    .filter((p) => (picking?.role ? p.role === picking.role : true) && !starters.includes(p.id) && (picking?.replace !== null || !bench.includes(p.id)))
    .filter((p) => !(picking?.target === "bench" && picking.replace === null) || benchRoomFor(p.role))
    .sort((a, b) => a.role - b.role || b.score - a.score);
  const acting = action ? byId.get(action) : undefined;
  const badgeOf = (id: string) => (captainOn ? (id === captain ? "C" : id === vice ? "VC" : null) : null);
  const stateOf = (id: string) => (starters.includes(id) ? "Titolare" : bench.includes(id) ? `Panchina ${bench.indexOf(id) + 1}` : null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="scoreboard text-3xl leading-none">{proxyName ? `Formazione di ${proxyName}` : "La tua formazione"}</h1>
          <p className="mt-1 text-xs text-muted">Giornata {round} · punteggio atteso {fmt(expected)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" onClick={() => { setPasting(true); setPasteError(null); }}>Incolla</Button>
          <Button variant="ghost" onClick={applySuggestion}>Consigliata</Button>
        </div>
      </div>

      {proxyName ? (
        <div className="rounded-xl border border-card bg-card/20 p-3 text-sm">
          {proxyName} non ha inserito la formazione. Puoi inserirla tu per vedere il risultato della sua partita: risulterà «inserita da» te e {proxyName} potrà sempre sostituirla.
        </div>
      ) : started && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
          La giornata è iniziata: puoi ancora cambiare la formazione, ma la modifica sarà segnalata a tutta la lega.
        </div>
      )}
      {unmatched === scored.length && (
        <div className="rounded-xl border border-line bg-surface-2 p-3 text-xs text-muted">
          Nessun giocatore della rosa è ancora abbinato alla fonte dati: la titolarità stimata non è disponibile e la formazione consigliata si basa sui crediti d'asta.
          {admin ? <> Controlla lo stato in <Link to="/admin" className="underline">Admin → Abbinamenti</Link>.</> : " L'abbinamento avviene da solo dopo la prima sincronizzazione."}
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
            {r.players.map((p) => <PitchPlayer key={p.id} p={p} badge={badgeOf(p.id)} onClick={() => setAction(p.id)} />)}
            {Array.from({ length: r.empty }, (_, i) => <EmptySlot key={`e${i}`} role={r.role} onClick={() => setPicking({ role: r.role, replace: null, target: "starters" })} />)}
          </div>
        ))}
      </div>
      <p className="-mt-2 text-[11px] text-muted">Sotto ogni giocatore la titolarità stimata da FootballLite (dati BSD). Tocca uno slot vuoto per scegliere chi schierare, un titolare per capitano, vice, panchina o sostituto.</p>

      {captainOn && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {([["Capitano", captain, setCaptain], ["Vice capitano", vice, setVice]] as const).map(([label, value, setter]) => (
            <label key={label} className="flex flex-col gap-1">
              <span className="font-semibold">{label}</span>
              <select className="rounded-lg border border-line bg-surface px-2 py-2" value={value ?? ""} onChange={(e) => setter(e.target.value || null)}>
                <option value="">Scegli…</option>
                {starterRows.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}

      {errors.length > 0 && <div className="rounded-xl border border-warn/40 bg-card/20 p-3 text-sm">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
      {message && <div className={`rounded-xl p-3 text-sm ${message.ok ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"}`}>{message.text}</div>}

      <Card title={`Panchina ${bench.length}/${cfg.benchCount}`}>
        <p className="mb-2 text-[11px] text-muted">L'ordine conta per le sostituzioni{cfg.benchPerRole ? ` (${cfg.benchPerRole.map((n, i) => `${n} ${["P", "D", "C", "A"][i]}`).join(", ")})` : ""}.</p>
        <ol className="flex flex-col divide-y divide-line">
          {benchRows.map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 py-1.5">
              <span className="w-5 text-xs text-muted tabular">{i + 1}</span>
              <RoleTag role={p.role} />
              <button className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm" onClick={() => setAction(p.id)}>
                <span className="truncate">{p.name}</span><span className="truncate text-xs text-muted">{p.outlook?.opponent ?? ""}</span>
              </button>
              <StarterPercent percent={p.starterPercent} />
              <button aria-label={`Sposta su ${p.name}`} className="px-1 text-muted disabled:opacity-30" disabled={i === 0} onClick={() => setBench(move(bench, i, i - 1))}>▲</button>
              <button aria-label={`Sposta giù ${p.name}`} className="px-1 text-muted disabled:opacity-30" disabled={i === bench.length - 1} onClick={() => setBench(move(bench, i, i + 1))}>▼</button>
              <button aria-label={`Togli ${p.name}`} className="px-1 text-muted" onClick={() => removePlayer(p.id)}>✕</button>
            </li>
          ))}
          {Array.from({ length: Math.max(0, cfg.benchCount - bench.length) }, (_, i) => (
            <li key={`b${i}`} className="py-1.5">
              <button className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line px-2 py-1.5 text-left text-sm text-muted hover:border-accent" onClick={() => setPicking({ role: 0, replace: null, target: "bench" })}>
                <span className="w-5 text-xs tabular">{bench.length + i + 1}</span><span>Aggiungi panchinaro</span>
              </button>
            </li>
          ))}
        </ol>
      </Card>

      <div className="sticky bottom-4 z-20">
        <Button variant={started && !proxyName ? "danger" : "card"} className="w-full py-3 text-base" disabled={saving || errors.length > 0} onClick={() => save(false)}>
          {saving ? "Salvataggio…" : proxyName ? `Inserisci per ${proxyName}` : started ? "Salva modifica forzata" : "Salva formazione"}
        </Button>
      </div>

      <Card title="Rosa">
        <p className="mb-2 text-[11px] text-muted">Tocca un giocatore per schierarlo (in campo nel suo ruolo, altrimenti in panchina) o per toglierlo dalla formazione.</p>
        {ROLES.map((role) => {
          const list = scored.filter((p) => p.role === role).sort((a, b) => Number(!!stateOf(b.id)) - Number(!!stateOf(a.id)) || b.score - a.score || (b.cost ?? 0) - (a.cost ?? 0));
          if (!list.length) return null;
          return (
            <div key={role} className="mb-3">
              <div className="mb-1 flex items-center justify-between text-xs text-muted"><span className="font-semibold">{ROLE_NAME[role]}</span><span>{startersOf(role).length}/{want[role]} in campo</span></div>
              <ul className="flex flex-col divide-y divide-line">
                {list.map((p) => {
                  const st = stateOf(p.id);
                  return (
                    <li key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
                      <button onClick={() => (st ? removePlayer(p.id) : addPlayer(p.id))} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={st ? `Togli ${p.name}` : `Schiera ${p.name}`}>
                        <PlayerAvatar name={p.name} role={p.role} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{p.name}{badgeOf(p.id) && <span className="ml-1 rounded bg-card px-1 text-[10px] font-bold text-card-ink">{badgeOf(p.id)}</span>}</span>
                          <span className="block truncate text-xs text-muted">{[p.info.ext_team, p.outlook?.opponent, statusText(p.outlook)].filter(Boolean).join(" · ")}</span>
                        </span>
                      </button>
                      <StarterPercent percent={p.starterPercent} />
                      <span className={`w-20 shrink-0 text-right text-xs font-semibold ${st ? (st === "Titolare" ? "text-accent" : "text-muted") : "text-accent"}`}>{st ?? "Schiera"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </Card>

      <Sheet open={!!acting} onClose={() => setAction(null)} title={acting?.name ?? ""}>
        {acting && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">{[ROLE_NAME[acting.role], acting.info.ext_team, acting.outlook?.opponent, statusText(acting.outlook)].filter(Boolean).join(" · ")} · FM stimata {fmt(acting.expectedFantavote, 2)}</p>
            {captainOn && starters.includes(acting.id) && <Button variant="ghost" onClick={() => { if (vice === acting.id) setVice(captain); setCaptain(acting.id); setAction(null); }}>Capitano</Button>}
            {captainOn && starters.includes(acting.id) && <Button variant="ghost" onClick={() => { if (captain === acting.id) setCaptain(vice); setVice(acting.id); setAction(null); }}>Vice capitano</Button>}
            {starters.includes(acting.id) && <Button variant="ghost" onClick={() => { setAction(null); setPicking({ role: acting.role, replace: acting.id, target: "starters" }); }}>Sostituisci con…</Button>}
            {starters.includes(acting.id) && <Button variant="ghost" onClick={() => toBench(acting.id)}>Sposta in panchina</Button>}
            {bench.includes(acting.id) && startersOf(acting.role).length < want[acting.role] && <Button variant="ghost" onClick={() => { setBench(bench.filter((x) => x !== acting.id)); setStarters([...starters, acting.id]); setAction(null); }}>Metti in campo</Button>}
            <Button variant="danger" onClick={() => removePlayer(acting.id)}>Togli dalla formazione</Button>
            <a href={newsSearchUrl(acting.info.ext_name ?? acting.name)} target="_blank" rel="noreferrer" className="text-center text-xs text-accent underline">News</a>
          </div>
        )}
      </Sheet>

      <Sheet open={!!picking} onClose={() => setPicking(null)} title={picking?.replace ? "Sostituisci con" : picking?.target === "bench" ? "Aggiungi in panchina" : `Scegli ${picking ? ROLE_NAME[picking.role]?.toLowerCase().replace(/i$/, "e") : ""}`}>
        {candidates.length === 0 && <Empty>Nessun giocatore disponibile per questo slot.</Empty>}
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

      <Sheet open={pasting} onClose={() => setPasting(false)} title="Incolla la formazione">
        <p className="mb-2 text-sm text-muted">Incolla il testo della formazione (es. quella condivisa da Leghe Fantacalcio o scritta in chat): FootballLite riconosce il modulo, i titolari, la panchina e il capitano dai nomi e dai ruoli indicati.</p>
        <textarea className="h-48 w-full rounded-xl border border-line bg-surface p-3 font-mono text-sm outline-none focus:border-accent" value={pasteText} onChange={(e) => setPasteText(e.target.value)}
          placeholder={"Squadra (3-4-3)\nVicario\nMiranda J.\n…\n----------\nMeret\n…"} aria-label="Testo della formazione" />
        {pasteError && <p className="mt-2 text-sm text-danger">{pasteError}</p>}
        <div className="mt-3 flex gap-2">
          {typeof navigator !== "undefined" && !!navigator.clipboard?.readText && <Button variant="ghost" className="flex-1" onClick={pasteFromClipboard}>Dagli appunti</Button>}
          <Button variant="card" className="flex-1" disabled={!pasteText.trim()} onClick={applyPasted}>Applica</Button>
        </div>
        <p className="mt-3 text-[11px] text-muted">Senza «Titolari» e «Panchina» (o una riga di trattini), i titolari sono i primi giocatori per ruolo secondo il modulo, oppure i primi 11. Capitano e vice con (C) e (VC). Se un nome è ambiguo, aggiungi l'iniziale.</p>
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
  if (!o) return "Non abbinato alla fonte dati";
  if (o.unavailable === "injury") return "Infortunato";
  if (o.unavailable === "suspension") return "Squalificato";
  if (o.unavailable) return "Indisponibile";
  if (o.doubtful) return "In dubbio";
  if (o.confirmed && o.predicted === "starter") return "Titolare ufficiale";
  if (o.confirmed && o.predicted === "bench") return "In panchina (ufficiale)";
  if (o.predicted === "starter") return "Probabile titolare";
  if (o.predicted === "bench") return "Probabile panchina";
  return "";
}

function PitchPlayer({ p, badge, onClick }: { p: Row; badge: "C" | "VC" | null; onClick: () => void }) {
  const low = !Number.isNaN(p.starterPercent) && p.starterPercent < 70;
  return (
    <button onClick={onClick} className="flex w-[74px] flex-col items-center gap-0.5 text-center text-chalk" aria-label={`${p.name}: opzioni`}>
      <span className={`relative rounded-full p-0.5 ${low ? "ring-2 ring-card" : ""}`}>
        <PlayerAvatar name={p.name} role={p.role} size={44} />
        {badge && <span className="absolute -right-1 -top-1 rounded-full bg-card px-1 text-[10px] font-bold text-card-ink">{badge}</span>}
      </span>
      <StarterPercent percent={p.starterPercent} />
      <span className="w-full truncate rounded bg-black/45 px-1 text-[11px] font-semibold leading-4">{p.name}</span>
      <span className="text-[10px] leading-3 text-chalk/75">{p.outlook?.opponent ?? ""}</span>
    </button>
  );
}

/** Slot del modulo ancora vuoto: un tocco apre la scelta del giocatore per quel ruolo. */
function EmptySlot({ role, onClick }: { role: number; onClick: () => void }) {
  const letter = ["", "P", "D", "C", "A"][role];
  return (
    <button onClick={onClick} className="flex w-[74px] flex-col items-center gap-0.5 text-center text-chalk/80" aria-label={`Slot vuoto ${ROLE_NAME[role]}: scegli`}>
      <span className="flex size-11 items-center justify-center rounded-full border-2 border-dashed border-chalk/60 text-base font-bold">{letter}</span>
      <span className="text-[11px] font-semibold leading-4">Scegli</span>
      <span className="text-[10px] leading-3 text-chalk/60">{ROLE_NAME[role]}</span>
    </button>
  );
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const out = [...arr];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}
