import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, ErrorBox, TeamBadge } from "../components/ui";
import { acceptAppTerms, api, ApiError, appTermsAccepted, chooseTeam, createLeague, enterLeague, savedLeagueCode, type LeagueAccess } from "../lib/api";
import { session, useLeagues, useSession } from "../lib/session";

const codeInput = "rounded-xl border border-line bg-surface px-3 py-3 uppercase tracking-widest outline-none focus:border-accent";

/**
 * Accesso: si entra in una lega con il codice invito (poi si sceglie il proprio utente) oppure se ne crea una nuova.
 * Le leghe già usate su questo dispositivo si riaprono in automatico.
 */
export function Access() {
  const s = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const saved = useLeagues();
  const [access, setAccess] = useState<LeagueAccess | null>(null);
  const [mode, setMode] = useState<"choose" | "join" | "create">(params.has("crea") ? "create" : params.has("nuova") ? "join" : "choose");

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
      {s && teams ? (
        <ChooseUser teams={teams} admin={s.admin} />
      ) : mode === "create" ? (
        <CreateLeague onBack={() => setMode("choose")} />
      ) : mode === "join" ? (
        <EnterCode onEntered={setAccess} onBack={() => setMode("choose")} />
      ) : (
        <div className="flex flex-col gap-3">
          {saved.length > 0 && (
            <div className="mb-2">
              <p className="mb-2 text-sm font-semibold">Le tue leghe</p>
              <ul className="flex flex-col gap-2">
                {saved.map((l) => (
                  <li key={l.id}>
                    <button onClick={() => { session.switchTo(l.id); navigate("/", { replace: true }); }} className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-left font-semibold hover:border-accent">{l.name}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button variant="card" className="py-3 text-base" onClick={() => setMode("join")}>Entra in una lega</Button>
          <Button variant="ghost" className="py-3" onClick={() => setMode("create")}>Crea una lega</Button>
          <p className="text-xs text-muted">Per entrare ti serve il codice invito che ti ha dato l'admin della lega. Chi crea una lega ne diventa admin e importa rose, calendario e regolamento.</p>
        </div>
      )}
      <p className="mt-8 text-[11px] text-muted">
        FootballLite non è affiliata a Leghe Fantacalcio® né a Fantacalcio S.r.l. Rose e calendario sono importati dall'admin della lega; i dati di Serie A arrivano da fonti con licenza.
      </p>
    </div>
  );
}

function EnterCode({ onEntered, onBack }: { onEntered: (a: LeagueAccess) => void; onBack: () => void }) {
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
        <span className="font-semibold">Codice invito della lega</span>
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
      <button type="button" className="mt-2 text-xs text-muted underline" onClick={onBack}>Indietro</button>
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
      <button className="text-xs text-muted underline" onClick={() => session.logout()}>Esci da questa lega</button>
    </div>
  );
}

function CreateLeague({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [terms, setTerms] = useState(appTermsAccepted());
  const [error, setError] = useState<unknown>(null);
  const [codes, setCodes] = useState<{ leagueCode: string; adminCode: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!terms) return;
    acceptAppTerms();
    setError(null);
    try { setCodes(await createLeague(name.trim())); } catch (err) { setError(err); }
  }

  if (codes) {
    return (
      <Card title="Lega creata">
        <p className="mb-3 text-sm">Salva questi codici: vengono mostrati <b>una sola volta</b>.</p>
        <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted">Codice invito</dt><dd className="font-mono font-bold tracking-widest">{codes.leagueCode}</dd>
          <dt className="text-muted">Codice admin</dt><dd className="font-mono font-bold tracking-widest">{codes.adminCode}</dd>
        </dl>
        <p className="mb-4 text-xs text-muted">Il codice invito lo condividi con i partecipanti. Il codice admin serve a te (o a un altro admin) per gestire la lega da un altro dispositivo. Ora importa rose, calendario e regolamento: senza rose e calendario la lega non è utilizzabile dagli altri.</p>
        <Button variant="card" className="w-full" onClick={() => navigate("/admin", { replace: true })}>Vai alla gestione della lega</Button>
      </Card>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Nome della lega</span>
        <input className="rounded-xl border border-line bg-surface px-3 py-3 outline-none focus:border-accent" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <AppTerms checked={terms} onChange={setTerms} />
      {!!error && <ErrorBox error={error} />}
      <Button type="submit" variant="card" className="mt-2 py-3 text-base" disabled={!terms || !name.trim()}>Crea lega</Button>
      <button type="button" className="text-xs text-muted underline" onClick={onBack}>Indietro</button>
    </form>
  );
}
