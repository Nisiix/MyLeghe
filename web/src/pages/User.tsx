import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, ErrorBox } from "../components/ui";
import { unlinkTeam } from "../lib/api";
import { useLeague } from "../lib/data";
import { session, useSession } from "../lib/session";

/** Impostazioni utente: dati del profilo, squadra collegata e uscita da questo dispositivo. */
export function UserPage() {
  const s = useSession();
  const league = useLeague();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const names = new Map(league.data?.teams.map((t) => [t.id, t.name]));

  /** Scollega la squadra della rosa dal profilo: alla prossima apertura si sceglie di nuovo la squadra. */
  async function unlink() {
    const team = s?.myTeamId ? names.get(s.myTeamId) ?? "la squadra" : "la squadra";
    if (!confirm(`Scollegare ${team} dal tuo profilo? Potrai collegare di nuovo una squadra libera.`)) return;
    setError(null);
    try { await unlinkTeam(); navigate("/accesso"); } catch (e) { setError(e); }
  }

  const row = "flex items-center justify-between gap-3 py-2";
  return (
    <div className="flex flex-col gap-4">
      <h1 className="px-1 text-2xl font-extrabold leading-none">Impostazioni utente</h1>

      <Card title="I tuoi dati">
        <dl className="mb-3 flex flex-col divide-y divide-line text-sm">
          <div className={row}><dt className="text-muted">Utente</dt><dd className="font-bold">{s?.username ? `@${s.username}` : "Nessun profilo"}</dd></div>
          <div className={row}><dt className="text-muted">Squadra</dt><dd className="font-bold">{s?.myTeamId ? names.get(s.myTeamId) ?? "—" : "Nessuna squadra collegata"}</dd></div>
          <div className={row}><dt className="text-muted">Lega</dt><dd className="font-bold">{s?.league.name ?? "—"}</dd></div>
          <div className={row}><dt className="text-muted">Ruolo</dt><dd className="font-bold">{s?.admin ? "Admin della lega" : "Utente"}</dd></div>
        </dl>
        {s?.userId ? (
          <>
            <p className="mb-3 text-xs text-muted">La squadra collegata non si cambia: puoi scollegarla e poi collegare una squadra libera. L'accesso resta memorizzato su questo dispositivo fino al prossimo login da un altro dispositivo.</p>
            <div className="flex flex-wrap gap-2">
              {s.myTeamId && <Button variant="ghost" onClick={unlink}>Scollega utente da rosa</Button>}
              {!s.myTeamId && <Button variant="ghost" onClick={() => navigate("/accesso")}>Collega una squadra</Button>}
              <Button variant="ghost" onClick={() => { session.leaveProfile(); navigate("/accesso"); }}>Esci dal profilo</Button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm">Nessun profilo collegato: puoi solo guardare.</p>
            <Button variant="ghost" onClick={() => navigate("/accesso")}>Entra con il tuo profilo</Button>
          </>
        )}
        {!!error && <div className="mt-3"><ErrorBox error={error} /></div>}
      </Card>

      <Card title="Questo dispositivo">
        <p className="mb-3 text-xs text-muted">Esci dalla lega su questo dispositivo: per rientrare serviranno il codice invito e il tuo profilo.</p>
        <Button variant="danger" className="w-full" onClick={() => { session.logout(); navigate("/accesso", { replace: true }); }}>Esci da questo dispositivo</Button>
      </Card>
    </div>
  );
}
