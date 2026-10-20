import { DEFAULT_NOTIFY, type NotifyPrefs } from "@footballlite/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Empty } from "../components/ui";
import { deviceId, enablePush, getNotify, pushSupported, saveNotify } from "../lib/push";
import { useSession } from "../lib/session";

export function NotificationsPage() {
  const s = useSession();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="px-1 text-2xl font-extrabold leading-none">Notifiche</h1>
      {s?.myTeamId
        ? <NotifyCard teamId={s.myTeamId} />
        : <Card><Empty>Le notifiche riguardano la tua squadra: collegala dalle <Link to="/utente" className="underline">impostazioni utente</Link>.</Empty></Card>}
    </div>
  );
}

function NotifyCard({ teamId }: { teamId: number }) {
  const current = useQuery({ queryKey: ["notify", teamId], queryFn: getNotify, enabled: !!deviceId() });
  const [prefs, setPrefs] = useState<NotifyPrefs>({ ...DEFAULT_NOTIFY, enabled: false });
  const [hours, setHours] = useState(DEFAULT_NOTIFY.reminderHours.join(", "));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (current.data) { setPrefs(current.data.prefs); setHours(current.data.prefs.reminderHours.join(", ")); }
  }, [current.data]);

  async function save(next: NotifyPrefs) {
    setMsg(null);
    try {
      if (next.enabled && !deviceId()) await enablePush();
      await saveNotify(teamId, next);
      setPrefs(next);
      setMsg({ ok: true, text: next.enabled ? "Notifiche attive." : "Notifiche disattivate." });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }
  const toggle = (k: keyof NotifyPrefs) => (e: React.ChangeEvent<HTMLInputElement>) => setPrefs({ ...prefs, [k]: e.target.checked });
  const row = "flex items-center justify-between gap-3";
  const box = "size-5 accent-[var(--color-accent)]";

  if (!pushSupported()) return <Card title="Notifiche"><p className="text-sm text-muted">Questo browser non supporta le notifiche push. Su iPhone aggiungi FootballLite alla schermata Home e aprila da lì.</p></Card>;
  return (
    <Card title="Notifiche push" action={
      <label className="flex items-center gap-2 text-sm">Attive <input type="checkbox" className={box} checked={prefs.enabled} onChange={(e) => save({ ...prefs, enabled: e.target.checked })} /></label>
    }>
      <div className={`flex flex-col gap-3 text-sm ${prefs.enabled ? "" : "opacity-60"}`}>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Promemoria se manca la formazione (ore prima del primo calcio d'inizio)</span>
          <input className="rounded-lg border border-line bg-surface px-3 py-2" value={hours} onChange={(e) => setHours(e.target.value)}
            onBlur={() => setPrefs({ ...prefs, reminderHours: hours.split(/[,\s]+/).map(Number).filter((n) => n > 0 && n <= 168) })} />
        </label>
        <label className={row}>Avviso se un tuo titolare scende sotto il {prefs.starterThreshold}% di titolarità stimata <input type="checkbox" className={box} checked={prefs.starterAlerts} onChange={toggle("starterAlerts")} /></label>
        <label className={row}>Bonus e malus dei tuoi giocatori durante la giornata <input type="checkbox" className={box} checked={prefs.myEventAlerts} onChange={toggle("myEventAlerts")} /></label>
        <label className={row}>Bonus e malus dei giocatori schierati dal tuo avversario (dal calendario) <input type="checkbox" className={box} checked={prefs.opponentEventAlerts} onChange={toggle("opponentEventAlerts")} /></label>
        <Button onClick={() => save({ ...prefs, enabled: true })}>Salva preferenze</Button>
        {msg && <p className={`text-xs ${msg.ok ? "text-accent" : "text-danger"}`}>{msg.text}</p>}
        <p className="text-[11px] text-muted">Gli eventi arrivano con qualche minuto di ritardo (durante le partite si aggiorna ogni 5 minuti).</p>
      </div>
    </Card>
  );
}
