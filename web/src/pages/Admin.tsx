import {
  DEFAULT_CONFIG, normalizeConfig, parseCalendarGrid, parseRosterGrid, ROLE_LABEL,
  type BonusTable, type CalendarImport, type ImportResult, type LeagueConfig,
} from "@footballlite/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
      <SettingsForm config={league.data.league.config} />
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
      const r = await api<{ days: number; matches: number }>("/league/admin/calendar", { method: "POST", body: { days: preview.days } });
      setDone(`Calendario importato: ${r.days} giornate, ${r.matches} partite.`);
      setPreview(null);
      await qc.invalidateQueries({ queryKey: ["calendar"] });
    } catch (e) { setError(e); }
  }

  return (
    <Card title="Calendario">
      <p className="mb-3 text-sm text-muted">File del calendario esportato da Leghe Fantacalcio. Definisce gli avversari di ogni giornata; i risultati già presenti nel file vengono mostrati nella dashboard. Importa prima le rose.</p>
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
    </Card>
  );
}

interface UnmatchedRow { team_id: number; slot: number; name: string; role: number; team: string; candidates: { id: number; name: string; teamName?: string; score: number }[] }

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
  async function rematch() {
    await api("/league/admin/rematch", { method: "POST", body: {} });
    await qc.invalidateQueries({ queryKey: ["unmatched"] });
  }

  return (
    <Card title="Abbinamenti da verificare" action={<button className="text-sm font-semibold text-accent" onClick={rematch}>Riprova automatico</button>}>
      <p className="mb-3 text-sm text-muted">Giocatori del file non abbinati con certezza ai giocatori di Serie A della fonte dati: senza abbinamento non hanno titolarità né voti stimati.</p>
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

const BONUS_LABEL: Record<keyof BonusTable, string> = {
  goal: "Gol", assist: "Assist", yellow: "Ammonizione", red: "Espulsione", penaltyScored: "Rigore segnato",
  penaltyMissed: "Rigore sbagliato", penaltySaved: "Rigore parato", ownGoal: "Autogol", goalConceded: "Gol subito", cleanSheet: "Porta inviolata",
};

function SettingsForm({ config }: { config: LeagueConfig }) {
  const qc = useQueryClient();
  const [c, setC] = useState<LeagueConfig>(config);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const numIn = "w-16 rounded-lg border border-line bg-surface px-2 py-1 text-right tabular";

  async function save() {
    setMsg(null);
    try {
      await api("/league/admin/settings", { method: "PUT", body: normalizeConfig(c) });
      await qc.invalidateQueries({ queryKey: ["league"] });
      setMsg({ ok: true, text: "Regolamento salvato." });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }
  const setBonus = (k: keyof BonusTable, i: number, v: number) => setC({ ...c, bonus: { ...c.bonus, [k]: c.bonus[k].map((x, j) => (j === i ? v : x)) } });
  const allModules = [...new Set([...DEFAULT_CONFIG.modules, ...c.modules])];

  return (
    <Card title="Regolamento">
      <div className="flex flex-col gap-4 text-sm">
        <fieldset>
          <legend className="mb-1 font-semibold">Giocatori per ruolo nel file delle rose</legend>
          <div className="flex gap-3">
            {c.rosterScheme.map((n, i) => (
              <label key={i} className="flex items-center gap-1">{ROLE_LABEL[i + 1]}
                <input type="number" min={0} max={15} className={numIn} value={n} onChange={(e) => setC({ ...c, rosterScheme: c.rosterScheme.map((x, j) => (j === i ? Number(e.target.value) : x)) as LeagueConfig["rosterScheme"] })} />
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 font-semibold">Moduli ammessi</legend>
          <div className="flex flex-wrap gap-2">
            {allModules.map((m) => (
              <label key={m} className="flex items-center gap-1 tabular">
                <input type="checkbox" className="accent-[var(--color-accent)]" checked={c.modules.includes(m)} onChange={(e) => setC({ ...c, modules: e.target.checked ? [...c.modules, m] : c.modules.filter((x) => x !== m) })} />
                {m.split("").join("-")}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center justify-between gap-2">Panchinari <input type="number" min={0} max={20} className={numIn} value={c.benchCount} onChange={(e) => setC({ ...c, benchCount: Number(e.target.value) })} /></label>
          <label className="flex items-center justify-between gap-2">Sostituzioni <input type="number" min={0} max={11} className={numIn} value={c.maxSubstitutions} onChange={(e) => setC({ ...c, maxSubstitutions: Number(e.target.value) })} /></label>
          <label className="flex items-center justify-between gap-2">Prima soglia gol <input type="number" step={0.5} className={numIn} value={c.goalFirst} onChange={(e) => setC({ ...c, goalFirst: Number(e.target.value) })} /></label>
          <label className="flex items-center justify-between gap-2">Ampiezza soglie <input type="number" step={0.5} min={0.5} className={numIn} value={c.goalSteps[0]} onChange={(e) => setC({ ...c, goalSteps: [Number(e.target.value)] })} /></label>
          <label className="flex items-center justify-between gap-2">Voto base <input type="number" step={0.5} className={numIn} value={c.baseVote} onChange={(e) => setC({ ...c, baseVote: Number(e.target.value) })} /></label>
        </div>
        <label className="flex items-center justify-between gap-3">Stima il voto dal rating della fonte dati (altrimenti voto base a tutti)
          <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={c.voteFromRating} onChange={(e) => setC({ ...c, voteFromRating: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between gap-3">Consenti la modifica della formazione a giornata iniziata
          <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={c.allowForcedEdit} onChange={(e) => setC({ ...c, allowForcedEdit: e.target.checked })} />
        </label>
        <fieldset>
          <legend className="mb-1 font-semibold">Bonus e malus per ruolo</legend>
          <table className="w-full text-xs tabular">
            <thead><tr><th className="text-left font-normal text-muted" />{[1, 2, 3, 4].map((r) => <th key={r} className="font-normal text-muted">{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody>
              {(Object.keys(BONUS_LABEL) as (keyof BonusTable)[]).map((k) => (
                <tr key={k}>
                  <td className="py-0.5 pr-2">{BONUS_LABEL[k]}</td>
                  {c.bonus[k].map((v, i) => <td key={i} className="py-0.5"><input type="number" step={0.5} className="w-14 rounded border border-line bg-surface px-1 text-right" value={v} onChange={(e) => setBonus(k, i, Number(e.target.value))} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
        <Button onClick={save}>Salva regolamento</Button>
        {msg && <p className={`text-xs ${msg.ok ? "text-accent" : "text-danger"}`}>{msg.text}</p>}
      </div>
    </Card>
  );
}
