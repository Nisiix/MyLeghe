import { moduleShape, orderBench, parseLineupText, ROLE_NAME, ROLES, suggestLineup, validateLineup, type LeagueConfig, type ScoredPlayer } from "@footballlite/core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Empty, ErrorBox, RoleTag, Sheet, Spinner, StarterPercent, fmt, formatCountdown, useNow } from "../components/ui";
import { Figurine } from "../components/Figurine";
import { api, ApiError } from "../lib/api";
import { useLeague, useLineups, useOutlook, useRound, type Lineup, type Outlook, type RosterPlayer } from "../lib/data";
import { useSession } from "../lib/session";
import { availabilityText as statusText, newsSearchUrl, prettyTeam, rosterOf, scoredRoster } from "../lib/team";

type Row = ScoredPlayer & { info: RosterPlayer; outlook?: Outlook };

export function LineupPage() {
  const s = useSession();
  const league = useLeague();
  const round = useRound();
  const outlook = useOutlook();
  // La formazione si inserisce per la giornata della formazione (la successiva, se quella attiva è conclusa).
  const lineups = useLineups(round.data?.lineupMatchday);
  // Senza formazione per la giornata si riparte dall'ultima inserita (giornata precedente), come nelle app di lega.
  const prevRound = round.data && round.data.lineupMatchday > 1 ? round.data.lineupMatchday - 1 : undefined;
  const previous = useLineups(prevRound);
  const [params] = useSearchParams();
  // Dopo il salvataggio l'editor si ricarica con la formazione salvata: la conferma resta visibile.
  const [saved, setSaved] = useState<string | null>(null);

  if (league.isLoading || round.isLoading || outlook.isLoading || lineups.isLoading || (prevRound && previous.isLoading)) return <Spinner label="Carico la tua rosa…" />;
  if (league.error || round.error) return <ErrorBox error={league.error ?? round.error} />;
  if (!s?.myTeamId) return <Card title="Formazione"><Empty>Collega la tua rosa al profilo dalle <Link to="/utente" className="underline">impostazioni utente</Link>.</Empty></Card>;
  const started = round.data!.lineupMatchday === round.data!.matchday && round.data!.phase !== "upcoming";
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
  const last = current ? undefined : previous.data?.lineups.find((l) => l.team_id === target && !l.hidden && Array.isArray(l.starters));
  return (
    <Editor key={`${target}-${current?.id ?? "new"}`} teamId={target} proxyName={proxyFor?.name} round={round.data!.lineupMatchday} deadline={round.data!.lineupDeadline} started={started}
      liveLabel={round.data!.phase === "upcoming" ? "Altre formazioni" : "Live"}
      scored={scored} cfg={cfg} current={current} last={last} unmatched={unmatched} admin={!!s.admin} savedMessage={saved} onSaved={setSaved} />
  );
}

type Snapshot = { module: string; starters: string[]; bench: string[]; captain: string | null; vice: string | null; message: { ok: boolean; text: string } | null };
/** Slot vuoto toccato (campo con il ruolo, o panchina) oppure titolare da sostituire (`replace`). */
type Picking = { role: number; target: "starters" | "bench"; replace?: string };
type Candidate = { id: number; name: string; team_name: string; role?: number | null };
/** Gestori del trascinamento (dito o mouse) e del tocco su un giocatore. */
type Grab = { onPointerDown: (e: React.PointerEvent) => void; onClick: (e: React.MouseEvent) => void; onContextMenu: (e: React.MouseEvent) => void };
/** Esempi del formato accettato da «Importa rosa» (formazione incollata come testo). */
const EXAMPLE_LINEUP = "Atletico Mascalzone (3-4-3)\nSommer\nBastoni\nBremer\nBuongiorno\nDimarco\nBarella (C)\nTonali\nCalhanoglu\nLookman\nLautaro (VC)\nKean\n----------\nMeret\nDarmian\nFrattesi\nThuram";
const EXAMPLE_ROLES = "Modulo 3-4-3\nTitolari\nP Sommer\nD Bastoni, Bremer, Buongiorno\nC Dimarco, Barella (C), Tonali, Calhanoglu\nA Lookman, Lautaro (VC), Kean\nPanchina\nP Meret\nD Darmian\nC Frattesi\nA Thuram";
const SINGULAR: Record<number, string> = { 1: "portiere", 2: "difensore", 3: "centrocampista", 4: "attaccante" };

/**
 * Inserimento della formazione come in Leghe Fantacalcio: modulo, campo con gli slot del modulo, panchina in ordine
 * e sotto le riserve (chi non è schierato). Un tocco su un giocatore apre la sua scheda con le due destinazioni
 * possibili (titolare, panchina, riserve: quelle diverse da dove si trova); un giocatore si può anche trascinare sul
 * posto di un altro (scambio), su uno slot libero o in panchina.
 */
function Editor({ teamId, proxyName, round, deadline, started, liveLabel, scored, cfg, current, last, unmatched, admin, savedMessage, onSaved }: {
  teamId: number; proxyName?: string; round: number; deadline: number; started: boolean; liveLabel: string; scored: Row[]; cfg: LeagueConfig; current?: Lineup; last?: Lineup; unmatched: number; admin: boolean;
  savedMessage: string | null; onSaved: (text: string | null) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const byId = useMemo(() => new Map(scored.map((p) => [p.id, p])), [scored]);
  /**
   * Formazione di partenza: quella salvata per la giornata; altrimenti l'ultima inserita (giocatori ancora in rosa);
   * altrimenti il campo vuoto. La consigliata non si applica da sola: si attiva con il pulsante «Consigliata».
   */
  const initial = useMemo(() => {
    const from = current ?? last;
    if (from) {
      const keep = (ids: number[]) => ids.map(String).filter((id) => byId.has(id));
      const starters = keep(from.starters);
      const has = (id: number | null | undefined) => (id != null && starters.includes(String(id)) ? String(id) : null);
      return {
        module: cfg.modules.includes(from.module) ? from.module : cfg.modules[0], starters, bench: keep(from.bench).slice(0, cfg.benchCount),
        captain: has(from.captain), vice: has(from.vice), source: current ? "saved" as const : "last" as const,
      };
    }
    return { module: cfg.modules[0], starters: [] as string[], bench: [] as string[], captain: null, vice: null, source: "empty" as const };
  }, [current, last, byId, cfg]);
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
  // Abbinamento manuale alla fonte dati (per i giocatori su cui l'automatico non ha potuto decidere).
  const [matchQuery, setMatchQuery] = useState("");
  const [matchFound, setMatchFound] = useState<Candidate[] | null>(null);
  const [matching, setMatching] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    savedMessage ? { ok: true, text: savedMessage }
      : initial.source === "last" ? { ok: true, text: `Formazione non ancora inserita: ti riproponiamo l'ultima (giornata ${last?.round ?? round - 1}). Controllala e salvala.` }
      : initial.source === "empty" ? { ok: true, text: "Formazione non ancora inserita: tocca gli slot del campo oppure premi «Consigliata»." }
      : null,
  );
  /**
   * Formazione consigliata come interruttore: attivandola si memorizza la formazione in campo (modulo, titolari,
   * panchina, capitano, vice e messaggio) e si applica la consigliata; ripremendo il pulsante si torna esattamente
   * a quella memorizzata, con il suo modulo.
   */
  const [suggested, setSuggested] = useState<Snapshot | null>(null);

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

  function removePlayer(id: string) {
    setStarters(starters.filter((x) => x !== id));
    setBench(bench.filter((x) => x !== id));
    clearRoles(id);
    setAction(null);
    setMessage(null);
  }

  /** Scheda del giocatore toccato; `choose` = destinazione piena, si sceglie al posto di chi. */
  const [choose, setChoose] = useState<"field" | "bench" | null>(null);
  function openSheet(id: string) { setAction(id); setChoose(null); setMatchFound(null); setMatchQuery(""); }
  function closeSheet() { setAction(null); setChoose(null); setMatchFound(null); setMatchQuery(""); }
  const fieldRoom = (p: Row) => startersOf(p.role).length < want[p.role];
  /** Panchinaro `r` sostituibile con `p` rispettando il limite per ruolo della panchina. */
  const benchSwapOk = (p: Row, r: Row) => !cfg.benchPerRole || r.role === p.role || benchRows.filter((x) => x.role === p.role).length < cfg.benchPerRole[p.role - 1];

  /** In campo da titolare: nello slot libero del ruolo, oppure al posto di `replace` (che va dove era il giocatore). */
  function toField(p: Row, replace?: string) {
    const fromBench = bench.includes(p.id);
    if (!replace) {
      setStarters([...starters, p.id]);
      if (fromBench) setBench(bench.filter((x) => x !== p.id));
    } else {
      setStarters(starters.map((x) => (x === replace ? p.id : x)));
      if (fromBench) setBench(bench.map((x) => (x === p.id ? replace : x)));
      if (captain === replace) setCaptain(p.id);
      if (vice === replace) setVice(p.id);
    }
    const r = replace ? byId.get(replace) : undefined;
    setMessage({ ok: true, text: `${p.name} titolare${r ? ` al posto di ${r.name}${fromBench ? ", che va in panchina" : ", che torna tra le riserve"}` : ""}.` });
    closeSheet();
  }

  /** In panchina: in coda, oppure al posto del panchinaro `replace` (che torna titolare se dello stesso ruolo, altrimenti tra le riserve). */
  function toBenchSpot(p: Row, replace?: string) {
    const fromField = starters.includes(p.id);
    const r = replace ? byId.get(replace) : undefined;
    if (!r) {
      if (fromField) { setStarters(starters.filter((x) => x !== p.id)); clearRoles(p.id); }
      setBench([...bench, p.id]);
    } else {
      setBench(bench.map((x) => (x === r.id ? p.id : x)));
      if (fromField) {
        if (r.role === p.role) {
          setStarters(starters.map((x) => (x === p.id ? r.id : x)));
          if (captain === p.id) setCaptain(r.id);
          if (vice === p.id) setVice(r.id);
        } else { setStarters(starters.filter((x) => x !== p.id)); clearRoles(p.id); }
      }
    }
    setMessage({ ok: true, text: `${p.name} in panchina${r ? ` al posto di ${r.name}${fromField && r.role === p.role ? ", che diventa titolare" : ", che torna tra le riserve"}` : ""}.` });
    closeSheet();
  }

  function toReserves(p: Row) {
    removePlayer(p.id);
    setMessage({ ok: true, text: `${p.name} spostato tra le riserve.` });
    closeSheet();
  }

  /**
   * Rilascio di un giocatore trascinato. Zone: "s:<id>" titolare (scambio), "slot:<ruolo>" slot libero del campo,
   * "b:<indice>" panchinaro (ordine o scambio), "bench" posto libero in panchina, "reserve" riserve.
   */
  function dropOn(id: string, zone: string) {
    const p = byId.get(id);
    if (!p) return;
    const [kind, arg] = zone.split(":");
    const from = starters.includes(id) ? "starter" : bench.includes(id) ? "bench" : "reserve";
    const fail = (text: string) => setMessage({ ok: false, text });
    const benchFull = (role: number) => bench.length >= cfg.benchCount
      ? "La panchina è piena: trascina il giocatore su un panchinaro per scambiarli."
      : `In panchina c'è già il numero massimo di ${ROLE_NAME[role].toLowerCase()}.`;
    setMessage(null);
    if (kind === "s") {
      const other = arg;
      const o = byId.get(other);
      if (!o || other === id) return;
      if (o.role !== p.role) return fail(`${p.name} (${SINGULAR[p.role]}) non può prendere il posto di ${o.name} (${SINGULAR[o.role]}): il modulo resta ${module.split("").join("-")}.`);
      if (from === "starter") { setStarters(starters.map((x) => (x === id ? other : x === other ? id : x))); return; }
      setStarters(starters.map((x) => (x === other ? id : x)));
      if (from === "bench") setBench(bench.map((x) => (x === id ? other : x)));
      if (captain === other) setCaptain(id);
      if (vice === other) setVice(id);
      return;
    }
    if (kind === "slot") {
      const role = Number(arg);
      if (from === "starter") return;
      if (p.role !== role) return fail(`Lo slot libero è per un ${SINGULAR[role]}: ${p.name} è ${SINGULAR[p.role]}.`);
      setStarters([...starters, id]);
      if (from === "bench") setBench(bench.filter((x) => x !== id));
      return;
    }
    if (kind === "b") {
      const at = Number(arg);
      const other = bench[at];
      const o = other ? byId.get(other) : undefined;
      if (!o || other === id) return;
      if (from === "bench") { setBench(move(bench, bench.indexOf(id), at)); return; }
      if (from === "starter") {
        if (o.role !== p.role) return fail(`${p.name} e ${o.name} hanno ruoli diversi: per scambiare un titolare con un panchinaro servono giocatori dello stesso ruolo.`);
        setStarters(starters.map((x) => (x === id ? other : x)));
        setBench(bench.map((x) => (x === other ? id : x)));
        if (captain === id) setCaptain(other);
        if (vice === id) setVice(other);
        return;
      }
      // Dalle riserve: prende il posto del panchinaro, che torna tra le riserve.
      if (cfg.benchPerRole && o.role !== p.role && benchRows.filter((x) => x.role === p.role).length >= cfg.benchPerRole[p.role - 1]) return fail(benchFull(p.role));
      setBench(bench.map((x) => (x === other ? id : x)));
      return;
    }
    if (kind === "bench") {
      if (from === "bench") { setBench([...bench.filter((x) => x !== id), id]); return; }
      if (!benchRoomFor(p.role)) return fail(benchFull(p.role));
      if (from === "starter") { setStarters(starters.filter((x) => x !== id)); clearRoles(id); }
      setBench([...bench, id]);
      return;
    }
    if (kind === "reserve" && from !== "reserve") removePlayer(id);
  }

  // Trascinamento: posizione del dito/mouse e zona sotto (per l'evidenziazione); la logica di rilascio è sempre quella dell'ultimo render.
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: string | null } | null>(null);
  const dropRef = useRef(dropOn);
  dropRef.current = dropOn;
  const dragging = useRef(false);
  // Durante il trascinamento al tocco la pagina non deve scorrere (listener non passivo registrato prima del tocco).
  useEffect(() => {
    const block = (e: TouchEvent) => { if (dragging.current) e.preventDefault(); };
    document.addEventListener("touchmove", block, { passive: false });
    return () => document.removeEventListener("touchmove", block);
  }, []);

  /**
   * Con il mouse il trascinamento parte dopo pochi pixel; al tocco dopo una breve pressione, così lo scorrimento
   * della pagina resta libero. Senza trascinamento è un tocco (anche da tastiera): `onTap`.
   */
  function grab(id: string, onTap: () => void): Grab {
    return {
      onContextMenu: (e) => e.preventDefault(),
      onClick: (e) => { if (e.detail === 0) onTap(); },
      onPointerDown: (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const touch = e.pointerType !== "mouse";
        const x0 = e.clientX, y0 = e.clientY;
        let state: "pending" | "drag" | "scroll" = "pending";
        let timer = 0;
        const zoneAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-zone]") as HTMLElement | null)?.dataset.zone ?? null;
        const begin = (x: number, y: number) => {
          state = "drag";
          dragging.current = true;
          navigator.vibrate?.(15);
          setDrag({ id, x, y, over: zoneAt(x, y) });
        };
        const onMove = (ev: PointerEvent) => {
          if (state === "pending") {
            if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
            if (touch) { state = "scroll"; clearTimeout(timer); return; }
            begin(ev.clientX, ev.clientY);
          }
          if (state !== "drag") return;
          // Scorrimento automatico verso il bordo a cui si sta andando (non quello da cui si è partiti).
          if (ev.clientY > innerHeight - 110 && ev.clientY > y0 + 24) scrollBy(0, 14);
          else if (ev.clientY < 100 && ev.clientY < y0 - 24) scrollBy(0, -14);
          setDrag({ id, x: ev.clientX, y: ev.clientY, over: zoneAt(ev.clientX, ev.clientY) });
        };
        const finish = (ev: PointerEvent, cancelled: boolean) => {
          clearTimeout(timer);
          removeEventListener("pointermove", onMove);
          removeEventListener("pointerup", onUp);
          removeEventListener("pointercancel", onCancel);
          dragging.current = false;
          if (state === "drag") {
            setDrag(null);
            const zone = cancelled ? null : zoneAt(ev.clientX, ev.clientY);
            if (zone) dropRef.current(id, zone);
          } else if (state === "pending" && !cancelled) onTap();
        };
        const onUp = (ev: PointerEvent) => finish(ev, false);
        const onCancel = (ev: PointerEvent) => finish(ev, true);
        if (touch) timer = window.setTimeout(() => { if (state === "pending") begin(x0, y0); }, 250);
        addEventListener("pointermove", onMove);
        addEventListener("pointerup", onUp);
        addEventListener("pointercancel", onCancel);
      },
    };
  }
  const over = drag?.over ?? null;
  const dragged = drag ? byId.get(drag.id) : undefined;
  const hot = (zone: string) => (over === zone ? "ring-2 ring-accent ring-offset-2 ring-offset-surface rounded-xl" : "");

  function toggleSuggestion() {
    if (suggested) {
      setModule(suggested.module);
      setStarters(suggested.starters);
      setBench(suggested.bench);
      setCaptain(suggested.captain);
      setVice(suggested.vice);
      setMessage(suggested.message);
      setSuggested(null);
      setAction(null);
      setPicking(null);
      return;
    }
    const sug = suggestLineup(scored, cfg);
    if (!sug) { setMessage({ ok: false, text: "Non ci sono abbastanza giocatori per una formazione valida." }); return; }
    const same = sug.module === module && sug.starters.every((p) => starters.includes(p.id));
    setSuggested({ module, starters, bench, captain, vice, message });
    setModule(sug.module);
    setStarters(sug.starters.map((p) => p.id));
    setBench(sug.bench.map((p) => p.id));
    setCaptain(sug.captain);
    setVice(sug.vice);
    setMessage({
      ok: true,
      text: (same
        ? `La formazione consigliata (${sug.module.split("").join("-")}) coincide con quella in campo.${unmatched === scored.length ? " Senza abbinamento alla fonte dati la stima si basa solo sui crediti d'asta." : ""}`
        : `Formazione consigliata applicata (${sug.module.split("").join("-")}): controlla e salva.`) + " Ripremi «Consigliata» per tornare a quella di partenza.",
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
    setSuggested(null);
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

  /**
   * Scelta per uno slot vuoto, come in Leghe Fantacalcio. Slot del campo: una riserva entra in campo oppure un
   * panchinaro dello stesso ruolo diventa titolare. Posto in panchina: una riserva va in panchina oppure un titolare
   * passa dal campo alla panchina (il suo slot in campo resta libero).
   */
  function pick(id: string) {
    if (!picking) return;
    if (picking.replace) {
      // Il titolare toccato esce al posto del giocatore scelto: se quello era in panchina, i due si scambiano.
      const p = byId.get(id);
      if (p) { toField(p, picking.replace); setPicking(null); return; }
    }
    if (picking.target === "starters") {
      setStarters([...starters, id]);
      setBench(bench.filter((x) => x !== id));
    } else {
      if (starters.includes(id)) { setStarters(starters.filter((x) => x !== id)); clearRoles(id); }
      setBench([...bench.filter((x) => x !== id), id].slice(0, cfg.benchCount));
    }
    setPicking(null);
    setMessage(null);
  }

  const candidatesOf = (p: Row): Candidate[] => {
    try { return (JSON.parse(p.info.candidates ?? "[]") as { id: number; name: string; teamName?: string }[]).map((c) => ({ id: c.id, name: c.name, team_name: c.teamName ?? "" })); } catch { return []; }
  };
  async function assignMatch(p: Row, extId: number, label: string) {
    setMatching(true);
    try {
      await api(`/league/roster/${teamId}/${p.info.slot}`, { method: "PUT", body: { extId } });
      await qc.invalidateQueries({ queryKey: ["league"] });
      await qc.invalidateQueries({ queryKey: ["outlook"] });
      setAction(null); setMatchFound(null); setMatchQuery("");
      setMessage({ ok: true, text: `${p.name} abbinato a ${label}: titolarità e dati della fonte sono ora disponibili.` });
    } catch (e) { setMessage({ ok: false, text: (e as Error).message }); } finally { setMatching(false); }
  }
  async function searchMatch(text: string) {
    if (text.trim().length < 3) return;
    try { setMatchFound(await api<Candidate[]>(`/league/players?q=${encodeURIComponent(text.trim())}`)); } catch (e) { setMessage({ ok: false, text: (e as Error).message }); }
  }
  const canMatch = !proxyName || admin;

  async function save(forced = false) {
    setSaving(true);
    setMessage(null);
    try {
      await api(`/league/lineups/${round}/${teamId}`, { method: "PUT", body: { module, starters: starters.map(Number), bench: bench.map(Number), captain: captainOn && captain ? Number(captain) : null, vice: captainOn && vice ? Number(vice) : null, forced: forced || !!proxyName } });
      const text = proxyName ? `Formazione di ${proxyName} inserita: risulterà inserita da te.` : forced ? "Formazione modificata a giornata iniziata: la modifica è visibile a tutta la lega." : "Formazione salvata.";
      onSaved(text);
      setConfirmForce(false);
      await qc.invalidateQueries({ queryKey: ["lineups"] });
      // Salvata: si torna alla Home, dove il tabellone conferma «Formazione inserita».
      navigate("/", { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.body?.needsForce) setConfirmForce(true);
      else setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const rows = [4, 3, 2, 1].map((role) => ({ role, players: startersOf(role), empty: Math.max(0, want[role] - startersOf(role).length) }));
  const byRoleScore = (a: Row, b: Row) => a.role - b.role || b.score - a.score;
  const replacing = picking?.replace ? byId.get(picking.replace) : undefined;
  const pickGroups: { title: string; hint: string; players: Row[] }[] = !picking ? [] : picking.replace
    ? [
      { title: "In panchina", hint: "Entra al posto suo, lui va in panchina", players: benchRows.filter((p) => p.role === picking.role).sort(byRoleScore) },
      { title: "Riserve", hint: "Entra al posto suo, lui torna tra le riserve", players: free.filter((p) => p.role === picking.role).sort(byRoleScore) },
    ]
    : picking.target === "starters"
    ? [
      { title: "Riserve", hint: "Entra in campo", players: free.filter((p) => p.role === picking.role).sort(byRoleScore) },
      { title: "In panchina", hint: "Da panchinaro a titolare", players: benchRows.filter((p) => p.role === picking.role).sort(byRoleScore) },
    ]
    : [
      { title: "Riserve", hint: "Va in panchina", players: free.filter((p) => benchRoomFor(p.role)).sort(byRoleScore) },
      { title: "Titolari", hint: "Dal campo alla panchina: il suo slot resta libero", players: starterRows.filter((p) => benchRoomFor(p.role)).sort(byRoleScore) },
    ];
  const acting = action ? byId.get(action) : undefined;
  const badgeOf = (id: string) => (captainOn ? (id === captain ? "C" : id === vice ? "VC" : null) : null);
  const stateOf = (id: string) => (starters.includes(id) ? "Titolare" : bench.includes(id) ? `Panchina ${bench.indexOf(id) + 1}` : null);

  const where = (id: string) => (starters.includes(id) ? "field" : bench.includes(id) ? "bench" : "reserve");
  const deadlineText = new Date(deadline).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  /** Intestazione grigia di sezione, come nelle liste di Leghe Fantacalcio. */
  const sectionHead = (title: string, right?: React.ReactNode) => (
    <div className="flex items-center justify-between border-y border-line bg-surface-2 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-muted">
      <span>{title}</span>{right && <span className="font-semibold normal-case tracking-normal">{right}</span>}
    </div>
  );
  /** Riga di giocatore nelle liste (panchina, riserve): maglietta, nome, squadra e avversario, titolarità. */
  const playerRow = (p: Row, lead?: React.ReactNode) => (
    <>
      {lead}
      <button {...grab(p.id, () => openSheet(p.id))} className="draggable flex min-w-0 flex-1 cursor-grab items-center gap-3 text-left" aria-label={`${p.name}: tocca per le opzioni, trascina per spostarlo`}>
        <Figurine name={p.name} role={p.role} team={p.info.ext_team} size={36} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 truncate text-[15px] font-bold">
            <RoleTag role={p.role} size={16} />{p.name}
            {badgeOf(p.id) && <span className="rounded bg-card px-1 text-[10px] font-extrabold text-card-ink">{badgeOf(p.id)}</span>}
          </span>
          <span className="block truncate text-xs text-muted">{[prettyTeam(p.info.ext_team), statusText(p.outlook)].filter(Boolean).join(" · ")}</span>
        </span>
      </button>
      {!p.info.ext_id && canMatch ? <MatchButton name={p.name} onClick={() => openSheet(p.id)} /> : <StarterPercent percent={p.starterPercent} />}
    </>
  );
  const now = useNow();

  return (
    <div className="-mx-3 -mt-4 flex flex-col">
      <section className="bg-brand-2 px-4 pt-3 pb-3 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="scoreboard truncate text-xl leading-tight">{proxyName ? `Formazione di ${proxyName}` : "Inserisci formazione"}</h1>
            <p className="text-xs text-white/75">{round}ª giornata · {started ? "giornata iniziata" : `consegna entro ${deadlineText}`}</p>
          </div>
          <div className="shrink-0 text-right">
            {!started && <div className="mb-0.5 inline-block rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold tabular">− {formatCountdown(deadline - now)}</div>}
            <div className="text-[11px] text-white/70">Punteggio atteso <b className="scoreboard tabular text-base text-white">{fmt(expected)}</b></div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Link to="/live" className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/50 px-2 py-2 text-sm font-bold hover:bg-white/10">
            {liveLabel === "Live" && <span className="size-2 animate-pulse rounded-full bg-danger" aria-hidden />}{liveLabel}
          </Link>
          <button onClick={() => { setPasting(true); setPasteError(null); }} className="flex-1 rounded-full border border-white/50 px-2 py-2 text-sm font-bold hover:bg-white/10">Importa rosa</button>
          <button type="button" aria-pressed={!!suggested} onClick={toggleSuggestion}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border px-2 py-2 text-sm font-bold transition ${suggested ? "border-card bg-card text-card-ink" : "border-white/50 hover:bg-white/10"}`}>
            <svg viewBox="0 0 24 24" className="size-4" fill={suggested ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} aria-hidden><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg>
            {suggested ? "Consigliata ✓" : "Consigliata"}
          </button>
        </div>
      </section>

      <div className="flex items-center gap-2 overflow-x-auto border-b border-line bg-surface px-3 py-2" role="radiogroup" aria-label="Modulo">
        <span className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-muted">Modulo</span>
        {cfg.modules.map((m) => (
          <button key={m} role="radio" aria-checked={m === module} onClick={() => changeModule(m)}
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-extrabold tabular transition ${m === module ? "bg-brand text-brand-ink dark:bg-accent dark:text-accent-ink" : "border border-line text-muted"}`}>
            {m.split("").join("-")}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 px-3 pt-3 empty:hidden">
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
            {admin ? <> Controlla lo stato in <Link to="/admin" className="underline">Gestione lega → Abbinamenti</Link>.</> : " L'abbinamento avviene da solo dopo la prima sincronizzazione."}
          </div>
        )}
      </div>

      <div className={`pitch mt-3 flex flex-col gap-3 px-1 pt-4 pb-6 ${suggested ? "outline-4 -outline-offset-4 outline-card" : ""}`}>
        {suggested && (
          <div className="-mt-1 flex justify-center">
            <span className="rounded-full bg-card px-3 py-0.5 text-xs font-bold text-card-ink shadow">★ Formazione consigliata</span>
          </div>
        )}
        {rows.map((r) => (
          <div key={r.role} className="flex justify-center gap-1">
            {r.players.map((p) => (
              <PitchPlayer key={p.id} p={p} badge={badgeOf(p.id)} hot={over === `s:${p.id}`} lifted={drag?.id === p.id} handlers={grab(p.id, () => setPicking({ role: p.role, target: "starters", replace: p.id }))} />
            ))}
            {Array.from({ length: r.empty }, (_, i) => (
              <EmptySlot key={`e${i}`} role={r.role} hot={over === `slot:${r.role}`} onClick={() => setPicking({ role: r.role, target: "starters" })} />
            ))}
          </div>
        ))}
      </div>
      <p className="px-4 pt-1.5 pb-3 text-[11px] text-muted">Tocca un titolare per sostituirlo con un panchinaro o una riserva, uno slot vuoto per scegliere chi schierare; puoi anche trascinare un giocatore sul posto di un altro.</p>

      <div className="flex flex-col gap-3 px-3 pb-3 empty:hidden">
        {captainOn && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            {([["Capitano", captain, setCaptain], ["Vice capitano", vice, setVice]] as const).map(([label, value, setter]) => (
              <label key={label} className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted">{label}</span>
                <select className="rounded-xl border border-line bg-surface px-3 py-2.5 font-semibold" value={value ?? ""} onChange={(e) => setter(e.target.value || null)}>
                  <option value="">Scegli…</option>
                  {starterRows.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
        {errors.length > 0 && <div className="rounded-xl border border-warn/40 bg-card/20 p-3 text-sm">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
        {message && <div className={`rounded-xl border-l-4 p-3 text-sm font-medium ${message.ok ? "border-accent bg-accent/10 text-ink" : "border-danger bg-danger/10 text-danger"}`}>{message.text}</div>}
      </div>

      <section data-zone="bench" className={`bg-surface ${hot("bench")}`}>
        {sectionHead("In panchina", `${bench.length}/${cfg.benchCount}${cfg.benchPerRole ? ` · ${cfg.benchPerRole.map((n, i) => `${n}${["P", "D", "C", "A"][i]}`).join(" ")}` : ""} · l'ordine conta`)}
        <ol className="flex flex-col divide-y divide-line">
          {benchRows.map((p, i) => (
            <li key={p.id} data-zone={`b:${i}`} className={`flex items-center gap-2 px-4 py-2 ${hot(`b:${i}`)} ${drag?.id === p.id ? "opacity-40" : ""}`}>
              {playerRow(p, <span className="w-4 shrink-0 text-center text-sm font-extrabold text-muted tabular">{i + 1}</span>)}
            </li>
          ))}
          {Array.from({ length: Math.max(0, cfg.benchCount - bench.length) }, (_, i) => (
            <li key={`b${i}`}>
              <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-muted hover:bg-surface-2" onClick={() => setPicking({ role: 0, target: "bench" })}>
                <span className="w-4 shrink-0 text-center text-sm font-extrabold tabular">{bench.length + i + 1}</span>
                <span className="flex size-9 items-center justify-center rounded-full border-2 border-dashed border-line text-lg font-bold">+</span>
                <span>Aggiungi panchinaro</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section data-zone="reserve" className={`mt-3 bg-surface ${hot("reserve")}`}>
        {sectionHead("Riserve", `${free.length} non schierati`)}
        {unmatched > 0 && unmatched < scored.length && canMatch && (
          <p className="mx-4 mt-2 rounded-lg border border-warn/40 bg-card/20 p-2 text-[11px]">
            {unmatched === 1 ? "1 giocatore non è abbinato" : `${unmatched} giocatori non sono abbinati`} alla fonte dati (senza titolarità): l'automatico non ha potuto decidere da solo. Tocca «Abbina» per scegliere tra i candidati.
          </p>
        )}
        {!free.length && <Empty>Tutti i giocatori della rosa sono schierati.</Empty>}
        {ROLES.map((role) => {
          const list = free.filter((p) => p.role === role).sort((a, b) => b.score - a.score || (b.cost ?? 0) - (a.cost ?? 0));
          if (!list.length) return null;
          return (
            <div key={role}>
              <div className="flex items-center justify-between px-4 pt-3 pb-1 text-xs text-muted"><span className="text-[13px] font-extrabold text-ink">{ROLE_NAME[role]}</span><span>{startersOf(role).length}/{want[role]} in campo</span></div>
              <ul className="flex flex-col divide-y divide-line">
                {list.map((p) => (
                  <li key={p.id} className={`flex items-center gap-2 px-4 py-2 ${drag?.id === p.id ? "opacity-40" : ""}`}>{playerRow(p)}</li>
                ))}
              </ul>
            </div>
          );
        })}
        <div className="h-3" />
      </section>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 px-3 pt-3">
        <Button variant={started && !proxyName ? "danger" : "card"} className="w-full py-3 text-base shadow-lg" disabled={saving || errors.length > 0} onClick={() => save(false)}>
          {saving ? "Salvataggio…" : proxyName ? `Inserisci per ${proxyName}` : started ? "Salva modifica forzata" : "Salva formazione"}
        </Button>
      </div>

      {drag && dragged && (
        <div className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-1/2" style={{ left: drag.x, top: drag.y }} aria-hidden>
          <Figurine name={dragged.name} role={dragged.role} team={dragged.info.ext_team} size={56} />
        </div>
      )}

      <Sheet open={!!acting} onClose={closeSheet} title={acting?.name ?? ""}>
        {acting && (() => {
          const at = where(acting.id);
          const full = choose === "field" ? starterRows.filter((x) => x.role === acting.role) : choose === "bench" ? benchRows.filter((x) => benchSwapOk(acting, x)) : [];
          const option = (label: string, sub: string, icon: React.ReactNode, onClick: () => void, active = false) => (
            <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left ${active ? "border-accent bg-accent/10" : "border-line bg-surface-2 hover:border-accent"}`}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-white dark:bg-accent dark:text-accent-ink">{icon}</span>
              <span className="min-w-0 flex-1"><span className="block font-bold">{label}</span><span className="block text-xs text-muted">{sub}</span></span>
              <span className="text-muted" aria-hidden>›</span>
            </button>
          );
          const goField = () => (fieldRoom(acting) ? toField(acting) : setChoose(choose === "field" ? null : "field"));
          const goBench = () => (at === "field" ? benchRoomFor(acting.role) : bench.length < cfg.benchCount && benchRoomFor(acting.role)) ? toBenchSpot(acting) : setChoose(choose === "bench" ? null : "bench");
          const fieldSub = fieldRoom(acting) ? `Nello slot libero dei ${ROLE_NAME[acting.role].toLowerCase()}` : `I ${ROLE_NAME[acting.role].toLowerCase()} sono al completo: scegli chi sostituire`;
          const benchSub = bench.length < cfg.benchCount && benchRoomFor(acting.role) ? `Al posto ${bench.length + 1} della panchina` : "Panchina piena: scegli al posto di chi";
          const icons = {
            field: <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 12h16" /><circle cx="12" cy="12" r="2.5" /></svg>,
            bench: <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M3 11h18M5 11v7M19 11v7M4 7h16" /></svg>,
            reserve: <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12l7 7 7-7" /></svg>,
          };
          return (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Figurine name={acting.name} role={acting.role} team={acting.info.ext_team} size={52} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">{[SINGULAR[acting.role][0].toUpperCase() + SINGULAR[acting.role].slice(1), prettyTeam(acting.info.ext_team)].filter(Boolean).join(" · ")}</p>
                  <p className="text-xs text-muted">{[statusText(acting.outlook), `FM stimata ${fmt(acting.expectedFantavote, 2)}`].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs"><span className="rounded-full bg-surface-2 px-2 py-0.5 font-bold">{at === "field" ? "Titolare" : at === "bench" ? `In panchina (${bench.indexOf(acting.id) + 1})` : "Riserva"}</span><StarterPercent percent={acting.starterPercent} /></p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {at !== "field" && option("Titolare in campo", fieldSub, icons.field, goField, choose === "field")}
                {at !== "bench" && option("In panchina", benchSub, icons.bench, goBench, choose === "bench")}
                {at !== "reserve" && option("Tra le riserve", "Non schierato in questa giornata", icons.reserve, () => toReserves(acting))}
              </div>

              {choose && (
                <div className="rounded-xl border border-line p-2">
                  <p className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wide text-muted">Al posto di</p>
                  {!full.length && <p className="px-1 text-sm text-muted">Nessun giocatore sostituibile.</p>}
                  <ul className="flex flex-col gap-1">
                    {full.map((x) => (
                      <li key={x.id}>
                        <button onClick={() => (choose === "field" ? toField(acting, x.id) : toBenchSpot(acting, x.id))} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2">
                          <Figurine name={x.name} role={x.role} team={x.info.ext_team} size={32} />
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{x.name}</span><span className="block truncate text-xs text-muted">{choose === "bench" ? `Panchina ${bench.indexOf(x.id) + 1} · ` : ""}{prettyTeam(x.info.ext_team)}</span></span>
                          <StarterPercent percent={x.starterPercent} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!acting.info.ext_id && canMatch && (
                <div className="rounded-xl border border-warn/40 bg-card/10 p-3">
                  <p className="mb-2 text-sm font-semibold">Abbina alla fonte dati</p>
                  <p className="mb-2 text-xs text-muted">{candidatesOf(acting).length ? "L'automatico non ha potuto decidere tra questi giocatori: scegli quello giusto." : "Nessun candidato trovato con questo cognome: cerca il giocatore per nome."}</p>
                  <div className="flex flex-wrap gap-1">
                    {(matchFound ?? candidatesOf(acting)).map((c) => (
                      <button key={c.id} disabled={matching} onClick={() => assignMatch(acting, c.id, c.name)} className="rounded-lg border border-line bg-surface px-2 py-1 text-xs hover:border-accent disabled:opacity-50">
                        {c.name} <span className="text-muted">{c.team_name}{c.role ? ` · ${["", "P", "D", "C", "A"][c.role]}` : ""}</span>
                      </button>
                    ))}
                    {matchFound && matchFound.length === 0 && <span className="text-xs text-muted">Nessun giocatore trovato.</span>}
                  </div>
                  <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); searchMatch(matchQuery); }}>
                    <input value={matchQuery} onChange={(e) => setMatchQuery(e.target.value)} placeholder="Cerca per nome…" className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1 text-sm" aria-label="Cerca nella fonte dati" />
                    <Button type="submit" variant="ghost" className="px-3 py-1">Cerca</Button>
                  </form>
                </div>
              )}
              <a href={newsSearchUrl(acting.info.ext_name ?? acting.name)} target="_blank" rel="noreferrer" className="text-center text-xs text-accent underline">Notizie su {acting.name}</a>
            </div>
          );
        })()}
      </Sheet>

      <Sheet open={!!picking} onClose={() => setPicking(null)} title={replacing ? `Sostituisci ${replacing.name}` : picking?.target === "bench" ? `Posto ${bench.length + 1} in panchina` : `Slot ${picking ? SINGULAR[picking.role] ?? "" : ""}`}>
        {replacing && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
            <Figurine name={replacing.name} role={replacing.role} team={replacing.info.ext_team} size={40} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-semibold">{[SINGULAR[replacing.role][0].toUpperCase() + SINGULAR[replacing.role].slice(1), prettyTeam(replacing.info.ext_team), statusText(replacing.outlook)].filter(Boolean).join(" · ")}</p>
              <p className="mt-1 flex flex-wrap gap-2 text-xs">
                <button className="rounded-full border border-line px-2 py-0.5 font-semibold" onClick={() => { setPicking(null); benchRoomFor(replacing.role) ? toBenchSpot(replacing) : openSheet(replacing.id); }}>In panchina</button>
                <button className="rounded-full border border-line px-2 py-0.5 font-semibold" onClick={() => { setPicking(null); toReserves(replacing); }}>Tra le riserve</button>
                {!replacing.info.ext_id && canMatch && <button className="rounded-full border border-warn/60 bg-card/20 px-2 py-0.5 font-semibold" onClick={() => { setPicking(null); openSheet(replacing.id); }}>Abbina alla fonte</button>}
              </p>
            </div>
            <StarterPercent percent={replacing.starterPercent} />
          </div>
        )}
        {pickGroups.every((g) => !g.players.length) && <Empty>{replacing ? "Nessun panchinaro o riserva di questo ruolo." : "Nessun giocatore disponibile per questo slot."}</Empty>}
        {pickGroups.filter((g) => g.players.length).map((g) => (
          <section key={g.title} className="mb-3">
            <h3 className="mb-1.5 flex items-baseline justify-between text-xs font-bold uppercase tracking-wide text-muted">{g.title}<span className="font-semibold normal-case tracking-normal">{g.hint}</span></h3>
            <ul className="flex flex-col gap-1">
              {g.players.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <button onClick={() => pick(p.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2 text-left hover:border-accent">
                    <Figurine name={p.name} role={p.role} team={p.info.ext_team} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
                        {p.name}
                        {stateOf(p.id) && <span className="rounded bg-line px-1 text-[10px] font-bold text-muted">{stateOf(p.id)}</span>}
                      </div>
                      <div className="truncate text-xs text-muted">{[prettyTeam(p.info.ext_team), statusText(p.outlook), `FM ${fmt(p.expectedFantavote, 2)}`].filter(Boolean).join(" · ")}</div>
                    </div>
                    <StarterPercent percent={p.starterPercent} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Sheet>

      <Sheet open={pasting} onClose={() => setPasting(false)} title="Importa rosa">
        <p className="mb-3 text-sm">Puoi incollare qui la tua formazione come testo, per esempio quella condivisa da Leghe Fantacalcio o scritta in chat: FootballLite riconosce modulo, titolari, panchina, capitano e vice e li abbina ai giocatori della tua rosa.</p>
        <details className="mb-3 rounded-xl border border-line bg-surface-2 p-3 text-sm" open={!pasteText}>
          <summary className="cursor-pointer font-bold">Formato da incollare</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-xs text-muted">
            <li>Prima riga: nome della squadra con il modulo tra parentesi, es. <b className="text-ink">(3-4-3)</b>.</li>
            <li>Poi gli 11 titolari, uno per riga, dal portiere agli attaccanti.</li>
            <li>Una riga di trattini <b className="text-ink">----------</b> separa i titolari dalla panchina.</li>
            <li>Sotto, i panchinari nell'ordine delle sostituzioni.</li>
            <li><b className="text-ink">(C)</b> e <b className="text-ink">(VC)</b> dopo il nome indicano capitano e vice.</li>
            <li>Basta il cognome come nella rosa; se è ambiguo aggiungi l'iniziale (es. «Martinez L.»).</li>
          </ul>
          <div className="mt-3 flex flex-col gap-2">
            <div>
              <p className="mb-1 text-[11px] font-bold text-muted">Esempio</p>
              <pre className="overflow-x-auto rounded-lg border border-line bg-surface p-2 font-mono text-[11px] leading-4 text-ink">{EXAMPLE_LINEUP}</pre>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold text-muted">Oppure con i ruoli</p>
              <pre className="overflow-x-auto rounded-lg border border-line bg-surface p-2 font-mono text-[11px] leading-4 text-ink">{EXAMPLE_ROLES}</pre>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted">Senza riga di trattini né «Titolari»/«Panchina», i titolari sono i primi giocatori per ruolo secondo il modulo, oppure i primi 11.</p>
        </details>
        <textarea className="h-44 w-full rounded-xl border border-line bg-surface p-3 font-mono text-sm outline-none focus:border-accent" value={pasteText} onChange={(e) => setPasteText(e.target.value)}
          placeholder="Incolla qui la formazione…" aria-label="Testo della formazione" />
        {pasteError && <p className="mt-2 text-sm text-danger">{pasteError}</p>}
        <div className="mt-3 flex gap-2">
          {typeof navigator !== "undefined" && !!navigator.clipboard?.readText && <Button variant="ghost" className="flex-1" onClick={pasteFromClipboard}>Incolla dagli appunti</Button>}
          <Button variant="card" className="flex-1" disabled={!pasteText.trim()} onClick={applyPasted}>Importa</Button>
        </div>
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

function PitchPlayer({ p, badge, hot, lifted, handlers }: { p: Row; badge: "C" | "VC" | null; hot: boolean; lifted: boolean; handlers: Grab }) {
  const low = !Number.isNaN(p.starterPercent) && p.starterPercent < 70;
  return (
    <button {...handlers} data-zone={`s:${p.id}`} aria-label={`${p.name}: tocca per le opzioni, trascina per spostarlo`}
      className={`draggable flex w-[74px] cursor-grab flex-col items-center text-center transition ${hot ? "rounded-xl bg-white/25 ring-2 ring-card" : ""} ${lifted ? "opacity-40" : ""}`}>
      <span className="relative rounded-full bg-white/20 p-0.5">
        <Figurine name={p.name} role={p.role} team={p.info.ext_team} size={58} />
        {badge && <span className="absolute -right-1.5 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-card px-1 text-[10px] font-extrabold text-card-ink shadow">{badge}</span>}
        {low && <span className="absolute -left-1 -top-1 size-3 rounded-full border-2 border-white bg-danger" title="Titolarità sotto il 70%" />}
      </span>
      <span className="-mt-0.5 w-full truncate rounded bg-white px-1 text-[11px] font-extrabold leading-[18px] text-[#13203b] shadow">{p.name}</span>
      <span className="mt-0.5 flex items-center text-[10px] font-semibold leading-3 text-white">
        <StarterPercent percent={p.starterPercent} />
      </span>
    </button>
  );
}

/** Slot del modulo ancora vuoto: un tocco apre la scelta del giocatore per quel ruolo. */
function EmptySlot({ role, hot, onClick }: { role: number; hot: boolean; onClick: () => void }) {
  const letter = ["", "P", "D", "C", "A"][role];
  return (
    <button onClick={onClick} data-zone={`slot:${role}`} className={`flex w-[74px] flex-col items-center text-center text-white transition ${hot ? "rounded-xl bg-white/25 ring-2 ring-card" : ""}`} aria-label={`Slot vuoto ${ROLE_NAME[role]}: scegli`}>
      <Figurine role={role} size={58} empty />
      <span className="-mt-0.5 w-full rounded bg-black/30 px-1 text-[11px] font-extrabold leading-[18px]">{letter} · Scegli</span>
    </button>
  );
}

/** Abbinamento alla fonte dati (giocatori su cui l'automatico non ha potuto decidere). */
function MatchButton({ name, onClick }: { name: string; onClick: () => void }) {
  return <button onClick={onClick} className="shrink-0 rounded-full border border-warn/60 bg-card/20 px-2 text-[11px] font-bold leading-4" aria-label={`Abbina ${name} alla fonte dati`}>Abbina</button>;
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const out = [...arr];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}
