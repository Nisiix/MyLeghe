import { MIN_CALIBRATION_SAMPLES, parseCalendarGrid, parseRosterGrid, type CalendarImport, type Calibration, type ImportResult, type LeagueConfig } from "@footballlite/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RulesEditor } from "../components/RulesEditor";
import { Button, Card, Empty, ErrorBox, RoleTag, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { readGrid } from "../lib/files";
import { useLeague } from "../lib/data";

export function AdminPage() {
  const league = useLeague();
  if (league.isLoading) return <Spinner />;
  if (league.error) return <ErrorBox error={league.error} />;
  if (!league.data?.me.admin) return <Card title="Admin"><Empty>Serve il codice admin della lega: aggiungilo dalla pagina di accesso.</Empty></Card>;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="scoreboard text-3xl leading-none">Gestione lega</h1>
      <SourceTermsCard />
      <RosterImport config={league.data.league.config} />
      <CalendarImportCard />
      <Unmatched />
      <UsersCard />
      <RulesEditor config={league.data.league.config} />
    </div>
  );
}

interface SourceTerms { terms: { sources: { name: string; url: string; note: string }[] }; accepted: boolean }

/** Se i termini delle fonti non sono accettati, la sincronizzazione dei dati di Serie A resta ferma. */
function SourceTermsCard() {
  const qc = useQueryClient();
  const t = useQuery({ queryKey: ["source-terms"], queryFn: () => api<SourceTerms>("/setup/terms") });
  const [setupCode, setSetupCode] = useState("");
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!t.data || t.data.accepted) return null;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/setup/terms", { method: "POST", body: { setupCode, accept } });
      await qc.invalidateQueries({ queryKey: ["source-terms"] });
    } catch (err) { setError(err); }
  }
  return (
    <form onSubmit={submit} className="rounded-xl border border-card bg-card/20 p-4 text-sm">
      <p className="mb-2 font-semibold">Dati di Serie A non attivi</p>
      <p className="mb-2 text-muted">Chi gestisce l'installazione deve accettare i termini d'uso delle fonti:</p>
      <ul className="mb-3 flex flex-col gap-1 text-xs">
        {t.data.terms.sources.map((src) => <li key={src.name}><a href={src.url} target="_blank" rel="noreferrer" className="font-semibold text-accent underline">{src.name}</a>: {src.note}</li>)}
      </ul>
      <input className="mb-2 w-full rounded-lg border border-line bg-surface px-3 py-2" placeholder="Codice di setup" value={setupCode} onChange={(e) => setSetupCode(e.target.value)} required />
      <label className="mb-3 flex items-start gap-2 text-xs">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-accent)]" checked={accept} onChange={(e) => setAccept(e.target.checked)} required />
        Ho letto e accetto i termini d'uso di queste fonti e ho almeno 16 anni.
      </label>
      {!!error && <ErrorBox error={error} />}
      <Button type="submit" disabled={!accept}>Accetta e attiva</Button>
    </form>
  );
}

function FileField({ label, onFile }: { label: string; onFile: (f: File) => void }) {
  return (
    <label className="block cursor-pointer rounded-xl border-2 border-dashed border-line p-4 text-center text-sm text-muted hover:border-accent">
      {label}
      <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </label>
  );
}

function RosterImport({ config }: { config: LeagueConfig }) {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function load(file: File) {
    setError(null); setDone(null);
    try { setPreview(parseRosterGrid(await readGrid(file), config.rosterScheme)); } catch (e) { setError(e); }
  }
  async function upload() {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await api<{ imported: number; poolSize: number }>("/league/admin/import", { method: "POST", body: { teams: preview.teams } });
      setDone(`Rose importate: ${r.imported} squadre.${r.poolSize ? "" : " I giocatori verranno abbinati alla fonte dati dopo la prima sincronizzazione (usa «Riprova automatico»)."}`);
      setPreview(null);
      await qc.invalidateQueries({ queryKey: ["league"] });
      await qc.invalidateQueries({ queryKey: ["unmatched"] });
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <Card title="Rose">
      <p className="mb-3 text-sm text-muted">File esportato da «Gestione rose» di Leghe Fantacalcio o dalla tua app d'asta (.xlsx o .csv). Il file viene letto su questo dispositivo; i ruoli seguono lo schema {config.rosterScheme.join("-")} impostato nel regolamento.</p>
      <FileField label="Scegli il file delle rose" onFile={load} />
      {!!error && <div className="mt-3"><ErrorBox error={error} /></div>}
      {preview && (
        <div className="mt-3">
          <ul className="mb-3 divide-y divide-line text-sm">
            {preview.teams.map((t) => <li key={t.name} className="flex justify-between py-1.5"><span>{t.name}</span><span className="text-muted tabular">{t.players.length} giocatori, {t.spent} crediti</span></li>)}
          </ul>
          {preview.warnings.map((w) => <p key={w} className="mb-1 text-xs text-danger">{w}</p>)}
          <Button className="w-full" disabled={busy || !preview.teams.length} onClick={upload}>{busy ? "Importazione…" : `Importa ${preview.teams.length} squadre`}</Button>
        </div>
      )}
      {done && <p className="mt-3 text-sm text-accent">{done}</p>}
    </Card>
  );
}

function CalendarImportCard() {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<CalendarImport | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);

  async function load(file: File) {
    setError(null); setDone(null);
    try { setPreview(parseCalendarGrid(await readGrid(file))); } catch (e) { setError(e); }
  }
  async function upload() {
    if (!preview) return;
    try {
      const r = await api<{ days: number; matches: number; officialMatches: number }>("/league/admin/calendar", { method: "POST", body: { days: preview.days } });
      setDone(`Calendario importato: ${r.days} giornate, ${r.matches} partite, ${r.officialMatches} risultati ufficiali.`);
      setPreview(null);
      await qc.invalidateQueries({ queryKey: ["calendar"] });
      await qc.invalidateQueries({ queryKey: ["calibration"] });
    } catch (e) { setError(e); }
  }

  return (
    <Card title="Calendario">
      <p className="mb-3 text-sm text-muted">File del calendario esportato da Leghe Fantacalcio. Definisce gli avversari di ogni giornata e porta i <b>risultati ufficiali</b> delle giornate calcolate: reimportalo dopo ogni giornata per aggiornarli (l'app mostra l'ora dell'ultimo import). Importa prima le rose.</p>
      <FileField label="Scegli il file del calendario" onFile={load} />
      {!!error && <div className="mt-3"><ErrorBox error={error} /></div>}
      {preview && (
        <div className="mt-3 text-sm">
          <p className="mb-2">{preview.title ?? "Calendario"}: {preview.days.length} giornate, squadre {preview.teams.join(", ")}.</p>
          {preview.warnings.map((w) => <p key={w} className="mb-1 text-xs text-danger">{w}</p>)}
          <Button className="w-full" disabled={!preview.days.length} onClick={upload}>Importa calendario</Button>
        </div>
      )}
      {done && <p className="mt-3 text-sm text-accent">{done}</p>}
      <CalibrationNote />
    </Card>
  );
}

/** Stato della calibrazione del voto statistico sui risultati ufficiali della lega. */
function CalibrationNote() {
  const q = useQuery({ queryKey: ["calibration"], queryFn: () => api<(Calibration & { updatedAt: number }) | null>("/league/calibration") });
  const c = q.data;
  const fmt = (x: number) => x.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <p className="mt-3 text-xs text-muted">
      {c
        ? <>Voto statistico calibrato su {c.samples} punteggi ufficiali della lega: scarto medio per squadra da {fmt(c.maeBefore)} a {fmt(c.maeAfter)} punti (correzione: media {c.offset >= 0 ? "+" : ""}{fmt(c.offset)}, dispersione ×{fmt(c.scale)}).</>
        : <>Calibrazione del voto statistico: servono almeno {MIN_CALIBRATION_SAMPLES} punteggi ufficiali di squadre che hanno inserito la formazione in FootballLite. Si aggiorna a ogni import del calendario.</>}
    </p>
  );
}

interface UserRow { id: number; username: string; last_login_at: number | null; team_id: number | null; team: string | null }

/** Profili utente della lega con la squadra collegata: l'admin può eliminarne uno (password dimenticata) perché venga creato di nuovo. */
function UsersCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => api<UserRow[]>("/league/admin/users") });
  const [error, setError] = useState<unknown>(null);
  async function reset(u: UserRow) {
    if (!confirm(`Eliminare il profilo @${u.username}? L'utente dovrà creare di nuovo username e password${u.team ? ` e la squadra ${u.team} tornerà libera` : ""}.`)) return;
    setError(null);
    try {
      await api(`/league/admin/users/${u.id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
      await qc.invalidateQueries({ queryKey: ["access-teams"] });
    } catch (e) { setError(e); }
  }
  return (
    <Card title="Utenti">
      <p className="mb-3 text-sm text-muted">Ogni partecipante crea un profilo con username e password e collega una volta la sua squadra della rosa (può scollegarla dalle impostazioni). L'accesso resta attivo solo sull'ultimo dispositivo usato.</p>
      {q.isLoading ? <Spinner /> : !q.data?.length ? <Empty>Nessun profilo ancora creato.</Empty> : (
        <ul className="divide-y divide-line text-sm">
          {q.data.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block font-semibold">@{u.username}</span>
                <span className="block text-xs text-muted">{u.team ?? "Nessuna squadra collegata"}{u.last_login_at ? ` · ultimo accesso ${new Date(u.last_login_at).toLocaleDateString("it-IT")}` : ""}</span>
              </span>
              <button className="shrink-0 text-xs font-semibold text-danger" onClick={() => reset(u)}>Elimina</button>
            </li>
          ))}
        </ul>
      )}
      {!!error && <div className="mt-3"><ErrorBox error={error} /></div>}
    </Card>
  );
}

interface UnmatchedRow { team_id: number; slot: number; name: string; role: number; team: string; candidates: { id: number; name: string; teamName?: string; score: number }[] }

interface SourcesState {
  accepted: boolean; poolSize: number; playersUpdatedAt: number | null; bsdUsedToday: number; bsdBudget: number;
  lastSync: { at: number; ok: boolean; error?: string; used?: number; calls?: number; skipped?: string } | null; unmatched: number; rosterSize: number;
}

/** Stato della fonte dati: spiega perché i giocatori non sono abbinati (fonte vuota, termini non accettati, errore del cron). */
function SourcesNote() {
  const q = useQuery({ queryKey: ["sources"], queryFn: () => api<SourcesState>("/league/admin/sources"), refetchInterval: 60_000 });
  const d = q.data;
  if (!d) return null;
  const when = (t: number) => new Date(t).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="mb-3 rounded-xl border border-line bg-surface-2 p-3 text-xs">
      {d.poolSize === 0 ? (
        <p className="text-danger">
          <b>Nessun giocatore di Serie A scaricato dalla fonte dati</b>: senza di loro nessuna rosa può essere abbinata e la titolarità non è disponibile.{" "}
          {!d.accepted ? "Serve prima l'accettazione dei termini delle fonti (riquadro in alto)." : d.lastSync?.error ? `Ultima sincronizzazione fallita (${when(d.lastSync.at)}): ${d.lastSync.error}` : d.lastSync ? `Ultima sincronizzazione ${when(d.lastSync.at)}: i giocatori vengono scaricati a blocchi, riprova tra qualche minuto.` : "La sincronizzazione non è ancora partita: il cron gira ogni 5 minuti."}
        </p>
      ) : (
        <p className="text-muted">
          Fonte dati: <b>{d.poolSize}</b> giocatori di Serie A{d.playersUpdatedAt ? `, aggiornati il ${when(d.playersUpdatedAt)}` : ""}. Rosa della lega: {d.rosterSize - d.unmatched}/{d.rosterSize} abbinati.
          {d.lastSync && !d.lastSync.ok && <> Ultima sincronizzazione fallita ({when(d.lastSync.at)}): {d.lastSync.error}.</>}
          {" "}Richieste BSD oggi: {d.bsdUsedToday}/{d.bsdBudget}.
        </p>
      )}
    </div>
  );
}

function Unmatched() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["unmatched"], queryFn: () => api<UnmatchedRow[]>("/league/admin/unmatched") });
  const [search, setSearch] = useState<Record<string, { id: number; name: string; team_name: string }[]>>({});

  async function assign(r: UnmatchedRow, extId: number) {
    await api(`/league/admin/roster/${r.team_id}/${r.slot}`, { method: "PUT", body: { extId } });
    await qc.invalidateQueries({ queryKey: ["unmatched"] });
    await qc.invalidateQueries({ queryKey: ["league"] });
  }
  async function find(r: UnmatchedRow, text: string) {
    if (text.trim().length < 3) return;
    const res = await api<{ id: number; name: string; team_name: string }[]>(`/league/admin/players?q=${encodeURIComponent(text.trim())}`);
    setSearch((s) => ({ ...s, [`${r.team_id}-${r.slot}`]: res }));
  }
  const [rematchMsg, setRematchMsg] = useState<string | null>(null);
  async function rematch() {
    setRematchMsg(null);
    try {
      const r = await api<{ checked: number; matched: number }>("/league/admin/rematch", { method: "POST", body: {} });
      setRematchMsg(r.checked ? `Controllati ${r.checked} giocatori, abbinati ${r.matched}.` : "Nessun giocatore da riabbinare.");
      await qc.invalidateQueries({ queryKey: ["unmatched"] });
      await qc.invalidateQueries({ queryKey: ["sources"] });
      await qc.invalidateQueries({ queryKey: ["league"] });
      await qc.invalidateQueries({ queryKey: ["outlook"] });
    } catch (e) { setRematchMsg((e as Error).message); }
  }

  return (
    <Card title="Abbinamenti" action={<button className="text-sm font-semibold text-accent" onClick={rematch}>Riprova automatico</button>}>
      <SourcesNote />
      <p className="mb-3 text-sm text-muted">Giocatori del file non abbinati con certezza ai giocatori di Serie A della fonte dati: senza abbinamento non hanno titolarità né voti stimati. L'automatico abbina per cognome e, tra omonimi, per iniziale del nome e ruolo; qui scegli tu nei casi in cui non ha potuto decidere. Riparte da solo a ogni aggiornamento giornaliero dei giocatori; ogni utente può abbinare i propri dalla pagina Formazione.</p>
      {rematchMsg && <p className="mb-3 text-xs text-accent">{rematchMsg}</p>}
      {q.isLoading ? <Spinner /> : !q.data?.length ? <Empty>Tutti i giocatori sono abbinati.</Empty> : (
        <ul className="flex flex-col divide-y divide-line">
          {q.data.map((r) => {
            const key = `${r.team_id}-${r.slot}`;
            const options = search[key] ?? r.candidates.map((c) => ({ id: c.id, name: c.name, team_name: c.teamName ?? "" }));
            return (
              <li key={key} className="py-2">
                <div className="mb-1 flex items-center gap-2 text-sm"><RoleTag role={r.role} /><b>{r.name}</b><span className="text-xs text-muted">{r.team}</span></div>
                <div className="flex flex-wrap gap-1">
                  {options.map((o) => (
                    <button key={o.id} onClick={() => assign(r, o.id)} className="rounded-lg border border-line px-2 py-1 text-xs hover:border-accent">{o.name} <span className="text-muted">{o.team_name}</span></button>
                  ))}
                  <input placeholder="Cerca…" className="w-28 rounded-lg border border-line bg-surface px-2 py-1 text-xs" onKeyDown={(e) => e.key === "Enter" && find(r, (e.target as HTMLInputElement).value)} onBlur={(e) => find(r, e.target.value)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
