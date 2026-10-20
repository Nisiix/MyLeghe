import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, ErrorBox, TeamBadge } from "../components/ui";
import { acceptAppTerms, accessTeams, ApiError, appTermsAccepted, createLeague, enterLeague, linkTeam, loginProfile, registerProfile, savedLeagueCode, type AccessTeam, type LeagueAccess } from "../lib/api";
import { session, useLeagues, useSession } from "../lib/session";
import { InviteShare } from "../components/Invite";

const codeInput = "rounded-xl border border-line bg-surface px-3 py-3 uppercase tracking-widest outline-none focus:border-accent";
const textInput = "rounded-xl border border-line bg-surface px-3 py-3 outline-none focus:border-accent";

/**
 * Accesso: si entra in una lega con il codice invito, poi con username e password del proprio profilo;
 * la prima volta si collega la squadra della rosa (poi il profilo entra direttamente con quella).
 * Oppure si crea una nuova lega. Le leghe già usate su questo dispositivo si riaprono in automatico.
 */
export function Access() {
  const s = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const saved = useLeagues();
  const [access, setAccess] = useState<LeagueAccess | null>(null);
  const [mode, setMode] = useState<"choose" | "join" | "create">(params.has("crea") ? "create" : params.has("nuova") ? "join" : "choose");
  // Arrivo dal salvataggio del regolamento: si spiega il passo successivo (profilo e rosa da collegare).
  const afterSettings = params.has("rosa");

  // Profilo collegato ma senza squadra (prima volta o dopo lo scollegamento): elenco delle squadre.
  // Non durante la creazione di una lega: la scheda con i codici deve restare visibile.
  const pending = useQuery({
    queryKey: ["access-teams", s?.league.id],
    enabled: !!s?.userId && !s.myTeamId && mode !== "create",
    queryFn: accessTeams,
  });
  const teams = mode === "create" ? null : pending.data ?? null;

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-10">
      <div className="hero -mx-6 -mt-10 mb-8 rounded-b-[2rem] px-6 pt-12 pb-8 text-white">
        <img src="/icon.svg" alt="" className="mb-4 size-16 rounded-2xl shadow-lg" />
        <h1 className="text-4xl font-extrabold leading-none">FootballLite</h1>
        <p className="mt-2 text-sm text-white/75">La tua lega, la tua formazione, il live della giornata.</p>
      </div>
      {s && mode !== "create" && !s.userId ? (
        <ProfileLogin leagueName={s.league.name} admin={s.admin} notice={s.notice ?? (afterSettings ? "Impostazioni salvate. Ora entra con il tuo profilo, o crealo, per collegare la tua rosa." : null)} />
      ) : s && teams ? (
        <ChooseTeam teams={teams} admin={s.admin} notice={afterSettings ? "Impostazioni salvate. Scegli la rosa da collegare al tuo profilo." : null} />
      ) : s && pending.error ? (
        <ErrorBox error={pending.error} onRetry={() => pending.refetch()} />
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
  const [params] = useSearchParams();
  // Dal link di invito il codice arriva già compilato.
  const [leagueCode, setLeagueCode] = useState(params.get("codice")?.toUpperCase() ?? savedLeagueCode());
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
          <li>Sul dispositivo vengono salvati il codice della lega e la sessione; sul server i nomi delle squadre e dei giocatori importati dall'admin, l'username e l'hash della password del tuo utente e, se attivi le notifiche, l'indirizzo push del browser.</li>
          <li>L'accesso con username e password resta attivo solo sull'ultimo dispositivo da cui sei entrato. La squadra collegata al profilo si cambia solo scollegandola dalle impostazioni.</li>
        </ul>
      </details>
      <label className="mt-2 flex items-start gap-2">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} required />
        <span>Ho letto e accetto le condizioni d'uso.</span>
      </label>
    </div>
  );
}

/**
 * Login del profilo con username e password (o creazione del profilo). Dopo il login, se il profilo ha già
 * la squadra collegata si entra direttamente; altrimenti si sceglie la squadra (una sola volta).
 * L'accesso resta valido solo sull'ultimo dispositivo usato.
 */
function ProfileLogin({ leagueName, admin, notice }: { leagueName: string; admin: boolean; notice: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isNew, setIsNew] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isNew && password !== confirm) { setError(new Error("Le due password non coincidono.")); return; }
    setBusy(true); setError(null);
    try {
      const r = isNew ? await registerProfile(username.trim(), password) : await loginProfile(username.trim(), password);
      qc.invalidateQueries();
      // Squadra già collegata: si entra direttamente. Altrimenti resta la scelta della squadra.
      if (r.teamId) navigate("/", { replace: true });
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h2 className="scoreboard text-2xl">{isNew ? "Crea il tuo profilo" : "Il tuo profilo"}</h2>
      <p className="-mt-2 text-sm text-muted">{leagueName}: {isNew ? "scegli username e password. Poi collegherai la tua squadra." : "entra con username e password."}</p>
      {notice && <div role="alert" className="rounded-xl border border-card bg-card/25 p-3 text-sm">{notice}</div>}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Username</span>
        <input className={textInput} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="off" minLength={3} maxLength={24} required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Password</span>
        <input type="password" className={textInput} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isNew ? "new-password" : "current-password"} minLength={isNew ? 6 : 1} required />
      </label>
      {isNew && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Ripeti la password</span>
          <input type="password" className={textInput} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </label>
      )}
      {!!error && <ErrorBox error={error} />}
      <Button type="submit" variant="card" disabled={busy} className="mt-2 py-3 text-base">{busy ? "Verifica…" : isNew ? "Crea profilo" : "Entra"}</Button>
      <button type="button" className="text-xs font-semibold text-accent underline" onClick={() => { setIsNew(!isNew); setError(null); }}>{isNew ? "Ho già un profilo" : "Non ho ancora un profilo: crealo"}</button>
      <p className="text-[11px] text-muted">L'accesso resta memorizzato su questo dispositivo: entrando da un altro dispositivo, qui servirà di nuovo la password.{!isNew && " Password dimenticata? Chiedi all'admin di eliminare il tuo profilo."}</p>
      {admin && <button type="button" className="text-xs text-muted underline" onClick={() => { session.update({ notice: null }); navigate("/admin"); }}>Vai alla gestione della lega</button>}
      <button type="button" className="text-xs text-muted underline" onClick={() => session.logout()}>Esci da questa lega</button>
    </form>
  );
}

/** Collegamento della squadra della rosa al profilo: si sceglie una sola volta (poi si può scollegare dalle impostazioni). */
function ChooseTeam({ teams, admin, notice }: { teams: AccessTeam[]; admin: boolean; notice?: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function pick(t: AccessTeam) {
    if (!confirm(`Collegare il tuo profilo alla squadra ${t.name}? Potrai cambiarla solo scollegandola dalle impostazioni.`)) return;
    setBusy(true); setError(null);
    try { await linkTeam(t.id); qc.invalidateQueries(); navigate("/", { replace: true }); } catch (e) { setError(e); } finally { setBusy(false); }
  }
  const free = teams.filter((t) => !t.username);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="scoreboard text-2xl">Qual è la tua squadra?</h2>
      <p className="-mt-2 text-sm text-muted">Collega al tuo profilo la squadra della rosa: da ora in poi entrerai direttamente con questa.</p>
      {notice && <div role="alert" className="rounded-xl border border-card bg-card/25 p-3 text-sm">{notice}</div>}
      {teams.length === 0 && (
        <p className="rounded-xl border border-line bg-surface p-3 text-sm text-muted">
          Nessuna squadra disponibile: {admin ? <>importa le rose dalla <Link to="/admin" className="underline">gestione della lega</Link>.</> : "l'admin deve ancora importare le rose."}
        </p>
      )}
      {teams.length > 0 && free.length === 0 && <p className="rounded-xl border border-line bg-surface p-3 text-sm text-muted">Tutte le squadre sono già collegate a un profilo: chiedi all'admin.</p>}
      <ul className="flex flex-col gap-2">
        {teams.map((t) => (
          <li key={t.id}>
            <button onClick={() => pick(t)} disabled={busy || !!t.username} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left hover:border-accent disabled:opacity-50 disabled:hover:border-line">
              <TeamBadge id={t.id} name={t.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t.name}</span>
                <span className="block text-xs text-muted">{t.username ? `Collegata a @${t.username}` : "Libera"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!!error && <ErrorBox error={error} />}
      {admin && <button className="text-xs text-muted underline" onClick={() => navigate("/admin")}>Vai alla gestione della lega</button>}
      <button className="text-xs text-muted underline" onClick={() => { session.leaveProfile(); }}>Esci dal profilo</button>
    </div>
  );
}

function CreateLeague({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const s = useSession();
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
        <p className="mb-4 text-xs text-muted">Il codice admin serve a te (o a un altro admin) per gestire la lega da un altro dispositivo. Ora importa rose, calendario e regolamento: senza rose e calendario la lega non è utilizzabile dagli altri.</p>
        {s && <div className="mb-4"><p className="mb-2 text-sm font-bold">Invita i partecipanti</p><InviteShare leagueId={s.league.id} leagueName={s.league.name} admin initialCode={codes.leagueCode} /></div>}
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
