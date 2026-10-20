import { useState } from "react";
import { regenerateInvite, savedInviteCode } from "../lib/api";
import { Button } from "./ui";

/** Link di invito: apre l'app sulla pagina di accesso con il codice già inserito. */
export const inviteLink = (code: string) => `${location.origin}/accesso?nuova&codice=${encodeURIComponent(code)}`;
const inviteText = (leagueName: string, code: string) => `Entra nella mia lega «${leagueName}» su FootballLite: ${inviteLink(code)}\nCodice invito: ${code}`;

/**
 * Invito dei partecipanti: link e codice da condividere con WhatsApp, Telegram, la condivisione del telefono o copiandoli.
 * Il codice è noto solo sul dispositivo che ha creato la lega o vi è entrato; l'admin può generarne uno nuovo.
 */
export function InviteShare({ leagueId, leagueName, admin, initialCode }: { leagueId: string; leagueName: string; admin: boolean; initialCode?: string }) {
  const [code, setCode] = useState<string | null>(initialCode ?? savedInviteCode(leagueId));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const text = code ? inviteText(leagueName, code) : "";
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  async function share() {
    try { await navigator.share({ title: `Lega ${leagueName}`, text, url: inviteLink(code!) }); } catch { /* annullato */ }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(text); setMsg("Invito copiato: incollalo dove vuoi."); } catch { setMsg("Non riesco a copiare: seleziona il testo qui sopra."); }
  }
  async function regenerate() {
    if (!confirm("Generare un nuovo codice invito? Quello precedente smette di valere (chi è già entrato resta nella lega).")) return;
    setBusy(true); setMsg(null);
    try { setCode(await regenerateInvite(leagueId)); setMsg("Nuovo codice invito generato."); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-3">
      {code ? (
        <>
          <div className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Codice invito</p>
            <p className="font-mono text-2xl font-extrabold tracking-widest">{code}</p>
            <p className="mt-1 break-all text-xs text-muted">{inviteLink(code)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a className="rounded-xl bg-[#25D366] px-3 py-2.5 text-center text-sm font-bold text-white" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">WhatsApp</a>
            <a className="rounded-xl bg-[#229ED9] px-3 py-2.5 text-center text-sm font-bold text-white" href={`https://t.me/share/url?url=${encodeURIComponent(inviteLink(code))}&text=${encodeURIComponent(`Entra nella mia lega «${leagueName}» su FootballLite. Codice invito: ${code}`)}`} target="_blank" rel="noreferrer">Telegram</a>
            {canShare && <Button variant="card" onClick={share}>Condividi…</Button>}
            <Button variant="ghost" onClick={copy}>Copia invito</Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">Il codice invito non è salvato su questo dispositivo{admin ? ": generane uno nuovo da condividere." : ": chiedilo all'admin della lega."}</p>
      )}
      {admin && <Button variant="ghost" disabled={busy} onClick={regenerate}>{code ? "Nuovo codice invito" : "Genera codice invito"}</Button>}
      {msg && <p className="text-xs text-accent">{msg}</p>}
      <p className="text-[11px] text-muted">Chi apre il link trova il codice già inserito: gli basta accettare le condizioni, creare il profilo e collegare la sua rosa.</p>
    </div>
  );
}
