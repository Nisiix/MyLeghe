import { Link } from "react-router-dom";
import { useDataStatus } from "../lib/data";

const when = (t: number) => new Date(t).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Avviso in cima alle pagine quando i dati non sono ottenibili da Cloudflare: server non raggiungibile
 * oppure sincronizzazione delle fonti ferma o fallita, con il motivo.
 */
export function DataStatusBanner() {
  const q = useDataStatus();
  const problems = q.error ? [(q.error as Error).message] : q.data?.issues ?? [];
  if (!problems.length) return null;
  return (
    <div role="status" className="mb-4 rounded-xl border border-warn/50 bg-warn/10 p-3 text-sm">
      <p className="mb-1 font-bold">Dati non aggiornati</p>
      <ul className="flex flex-col gap-1 text-[13px]">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
      <div className="mt-2 flex gap-3 text-xs font-semibold">
        <button className="underline" onClick={() => q.refetch()}>Riprova</button>
        <Link to="/informazioni" className="underline">Dettagli</Link>
      </div>
    </div>
  );
}

/** Stato completo dei dati (pagina Informazioni). */
export function DataStatusDetails() {
  const q = useDataStatus();
  if (q.isLoading) return <p className="text-sm text-muted">Controllo lo stato dei dati…</p>;
  if (q.error) return <p className="text-sm text-danger">{(q.error as Error).message}</p>;
  const d = q.data!;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className={`font-bold ${d.ok ? "text-accent" : "text-warn"}`}>{d.ok ? "Dati aggiornati regolarmente." : "Alcuni dati non sono ottenibili in questo momento."}</p>
      {d.issues.length > 0 && <ul className="flex list-disc flex-col gap-1 pl-5">{d.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted">
        <dt>Ultima sincronizzazione</dt><dd className="text-ink">{d.lastSync ? `${when(d.lastSync.at)} · ${d.lastSync.ok ? "riuscita" : "non riuscita"}` : "mai"}</dd>
        <dt>Giocatori di Serie A</dt><dd className="text-ink">{d.players}{d.playersUpdatedAt ? ` · aggiornati il ${when(d.playersUpdatedAt)}` : ""}</dd>
        {d.myRoster && <><dt>La tua rosa</dt><dd className="text-ink">{d.myRoster.total - d.myRoster.unmatched}/{d.myRoster.total} giocatori abbinati</dd></>}
        <dt>Richieste di oggi</dt><dd className="text-ink">{d.requestsToday}/{d.requestsBudget}</dd>
      </dl>
    </div>
  );
}
