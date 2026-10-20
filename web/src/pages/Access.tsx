import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, ErrorBox, TeamBadge } from "../components/ui";
import { acceptAppTerms, api, ApiError, appTermsAccepted, chooseTeam, enterLeague, savedLeagueCode, type LeagueAccess } from "../lib/api";
import { session, useSession } from "../lib/session";

const codeInput = "rounded-xl border border-line bg-surface px-3 py-3 uppercase tracking-widest outline-none focus:border-accent";

/** Accesso in due passi: codice condiviso della lega, poi scelta del proprio utente. */
export function Access() {
  const s = useSession();
  const [access, setAccess] = useState<LeagueAccess | null>(null);
  const [create, setCreate] = useState(false);

  // Sessione già aperta ma utente non scelto (es. dopo "Cambia utente"): si ricarica l'elenco.
  const pending = useQuery({
    queryKey: ["access-teams", s?.league.id],
    enabled: !!s && !s.myTeamId && !access,
    queryFn: async () => {
      const r = await api<{ teams: { id: number; name: string }[]; roster: { team_id: number }[] }>("/league");
      const withRoster = new Set(r.roster.map((p) => p.team_id));
      return { teams: r.teams.filter((t) => withRoster.has(t.id)) };
    },
  });
  const teams = access?.teams ?? pending.data?.teams ?? null;

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8">
        <img src="/icon.svg" alt="" className="mb-4 size-16" />
        <h1 className="scoreboard text-5xl leading-none">FootballLite</h1>
        <p className="mt-2 text-sm text-muted">La tua lega, la tua formazione, il live della giornata.</p>
      </div>
      {create ? (
        <CreateLeague onBack={() => setCreate(false)} />
      ) : s && teams ? (
        <ChooseUser teams={teams} admin={s.admin} />
      ) : (
        <EnterCode onEntered={setAccess} onCreate={() => setCreate(true)} />
      )}
      <p className="mt-8 text-[11px] text-muted">
        FootballLite non è affiliata a Leghe Fantacalcio® né a Fantacalcio S.r.l. Rose e calendario sono importati dall'admin della lega; i dati di Serie A arrivano da fonti con licenza.
      </p>
    </div>
  );
}

function EnterCode({ onEntered, onCreate }: { onEntered: (a: LeagueAccess) => void; onCreate: () => void }) {
  const navigate = useNavigate();
  const [leagueCode, setLeagueCode] = useState(savedLeagueCode());
  const [adminCode, setAdminCode] = useState("");
  const [terms, setTerms] = useState(appTermsAccepted());
  const [error, setError] = useState<unknown>(null);
  const [notReady, setNotReady] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!terms) return;
    acceptAppTerms();
    setBusy(true); setError(null); setNotReady(null);
    try {
      const a = await enterLeague(leagueCode, adminCode);
      // L'admin di una lega non ancora pronta va direttamente all'import di rose e calendario.
      if (!a.ready && a.admin) { navigate("/admin", { replace: true }); return; }
      onEntered(a);
    } catch (err) {
      if (err instanceof ApiError && err.body?.notReady) setNotReady(err.message);
      else setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Codice della lega</span>
        <input className={codeInput} value={leagueCode} onChange={(e) => setLeagueCode(e.target.value)} autoComplete="off" required />
      </label>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Sono l'admin della lega</summary>
        <input className={`${codeInput} mt-2 w-full`} placeholder="Codice admin" value={adminCode} onChange={(e) => setAdminCode(e.target.value)} autoComplete="off" />
      </details>
      <AppTerms checked={terms} onChange={setTerms} />
      {notReady && (
        <div role="alert" className="rounded-xl border border-card bg-card/25 p-3 text-sm">
          <b>Lega non ancora pronta.</b> {notReady} Riprova quando l'admin avrà completato l'import.
        </div>
      )}
      {!!error && <ErrorBox error={error} />}
      <Button type="submit" variant="card" disabled={busy || !terms} className="mt-2 py-3 text-base">{busy ? "Verifica…" : "Entra"}</Button>
      <button type="button" className="mt-4 text-xs text-muted underline" onClick={onCreate}>Crea una nuova lega</button>
    </form>
  );
}

function AppTerms({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3 text-xs">
      <details>
        <summary className="cursor-pointer font-semibold">Condizioni d'uso</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
          <li>FootballLite è uno strumento per uso personale tra i partecipanti della lega, non affiliato a Leghe Fantacalcio® né a Fantacalcio S.r.l.</li>
          <li>Titolarità, formazione consigliata e punteggi live sono <b>stime</b> calcolate su dati di football-data.org e BSD: non sono voti o risultati ufficiali.</li>
          <li>Le formazioni inserite qui restano in FootballLite: non vengono inviate a nessun'altra piattaforma.</li>
          <li>Sul dispositivo vengono salvati il codice della lega e la sessione; sul server i nomi delle squadre e dei giocatori importati dall'admin e, se attivi le notifiche, l'indirizzo push del browser.</li>
        </ul>
      </details>
      <label className="mt-2 flex items-start gap-2">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} required />
        <span>Ho letto e accetto le condizioni d'uso.</span>
      </label>
    </div>
  );
}

function ChooseUser({ teams, admin }: { teams: { id: number; name: string }[]; admin: boolean }) {
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  async function pick(id: number) {
    setError(null);
    try { await chooseTeam(id); navigate("/", { replace: true }); } catch (e) { setError(e); }
  }
  return (
    <div className="flex flex-col gap-3">
      <h2 className="scoreboard text-2xl">Chi sei?</h2>
      <p className="-mt-2 text-sm text-muted">Scegli la tua squadra: potrai schierarne la formazione.</p>
      <ul className="flex flex-col gap-2">
        {teams.map((t) => (
          <li key={t.id}>
            <button onClick={() => pick(t.id)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left hover:border-accent">
              <TeamBadge id={t.id} name={t.name} size={36} />
              <span className="font-semibold">{t.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {!!error && <ErrorBox error={error} />}
      {admin && <button className="text-xs text-muted underline" onClick={() => navigate("/admin")}>Vai alla gestione della lega</button>}
      <button className="text-xs text-muted underline" onClick={() => session.logout()}>Usa un altro codice</button>
    </div>
  );
}

interface SourceTerms { terms: { version: string; sources: { name: string; url: string; note: string }[] }; accepted: boolean }

function CreateLeague({ onBack }: { onBack: () => void }) {
  const t = useQuery({ queryKey: ["source-terms"], queryFn: () => api<SourceTerms>("/setup/terms") });
  const [setupCode, setSetupCode] = useState("");
  const [name, setName] = useState("");
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [codes, setCodes] = useState<{ leagueCode: string; adminCode: string } | null>(null);
  const needsTerms = !t.data?.accepted;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setCodes(await api<{ leagueCode: string; adminCode: string }>("/setup/league", { method: "POST", body: { setupCode, name, acceptSourcesTerms: accept } }));
    } catch (err) { setError(err); }
  }

  if (codes) {
    return (
      <Card title="Lega creata">
        <p className="mb-3 text-sm">Salva questi codici: vengono mostrati <b>una sola volta</b>.</p>
        <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted">Codice lega</dt><dd className="font-mono font-bold tracking-widest">{codes.leagueCode}</dd>
          <dt className="text-muted">Codice admin</dt><dd className="font-mono font-bold tracking-widest">{codes.adminCode}</dd>
        </dl>
        <p className="mb-4 text-xs text-muted">Il codice lega lo condividi con i partecipanti. Il codice admin serve a te per importare rose e calendario: senza quei file la lega non è utilizzabile.</p>
        <Button className="w-full" onClick={onBack}>Ho salvato i codici</Button>
      </Card>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Nome della lega</span>
        <input className="rounded-xl border border-line bg-surface px-3 py-3 outline-none focus:border-accent" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Codice di setup dell'installazione</span>
        <input className="rounded-xl border border-line bg-surface px-3 py-3 outline-none focus:border-accent" value={setupCode} onChange={(e) => setSetupCode(e.target.value)} autoComplete="off" required />
      </label>
      {needsTerms && t.data && (
        <div className="rounded-xl border border-line bg-surface p-3 text-xs">
          <p className="mb-2 font-semibold">Termini delle fonti dati</p>
          <p className="mb-2 text-muted">Chi gestisce l'installazione è titolare degli account delle fonti e ne accetta i termini d'uso. Finché non li accetti, FootballLite non scarica dati.</p>
          <ul className="mb-2 flex flex-col gap-1">
            {t.data.terms.sources.map((src) => (
              <li key={src.name}><a href={src.url} target="_blank" rel="noreferrer" className="font-semibold text-accent underline">{src.name}</a>: {src.note}</li>
            ))}
          </ul>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-accent)]" checked={accept} onChange={(e) => setAccept(e.target.checked)} required />
            <span>Ho letto e accetto i termini d'uso di queste fonti e ho almeno 16 anni.</span>
          </label>
        </div>
      )}
      {!!error && <ErrorBox error={error} />}
      <Button type="submit" className="mt-2 py-3" disabled={needsTerms && !accept}>Crea lega</Button>
      <button type="button" className="text-xs text-muted underline" onClick={onBack}>Annulla</button>
    </form>
  );
}
