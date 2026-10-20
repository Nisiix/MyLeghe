import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLeague } from "../lib/data";
import { session, useLeagues, useSession } from "../lib/session";
import { setTheme, useTheme } from "../lib/theme";
import { DataStatusBanner } from "./DataStatus";
import { Drawer, Sheet, Switch, TeamBadge } from "./ui";

const ICONS: Record<string, ReactNode> = {
  home: <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" />,
  lineup: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 12h16M12 3v3M9 21v-3h6v3" /><circle cx="12" cy="12" r="2.5" /></>,
  rosters: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.6" /><path d="M16 14.2c2.8-.4 5 1.8 5 4.8" /></>,
  live: <><circle cx="12" cy="12" r="9" /><path d="M10 8.5l5.5 3.5-5.5 3.5z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>,
  bell: <><path d="M6 16V11a6 6 0 1112 0v5l2 2H4z" /><path d="M10 20a2 2 0 004 0" /></>,
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  moon: <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />,
};

const Icon = ({ name, className = "size-6", strokeWidth = 1.8 }: { name: string; className?: string; strokeWidth?: number }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[name]}</svg>
);

/** Menu della lega (in alto a sinistra): gestione della lega per l'admin, leghe del dispositivo, altra lega o nuova lega. */
function LeagueMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSession();
  const leagues = useLeagues();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const go = (search: string) => { onClose(); session.detach(); navigate(`/accesso?${search}`); };
  return (
    <Sheet open={open} onClose={onClose} title={s?.league.name ?? "Lega"}>
      {s?.admin && (
        <button onClick={() => { onClose(); navigate("/admin"); }}
          className="mb-4 flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-3 text-left font-bold">
          <Icon name="shield" className="size-5 text-muted" />
          <span className="flex-1">Gestione lega<span className="block text-xs font-normal text-muted">Rose, calendario, regolamento, utenti e abbinamenti</span></span>
          <span className="text-muted" aria-hidden>›</span>
        </button>
      )}
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Le tue leghe</h3>
      <ul className="mb-4 flex flex-col gap-2">
        {leagues.map((l) => (
          <li key={l.id}>
            <button
              onClick={() => { session.switchTo(l.id); qc.clear(); onClose(); navigate("/"); }}
              className={`w-full rounded-xl border px-3 py-2.5 text-left ${l.id === s?.league.id ? "border-brand bg-brand/10 font-bold" : "border-line bg-surface-2"}`}
            >
              {l.name}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <button className="rounded-xl border border-line px-3 py-2.5 text-left text-sm" onClick={() => go("nuova")}>Entra in un'altra lega (codice invito)</button>
        <button className="rounded-xl border border-line px-3 py-2.5 text-left text-sm" onClick={() => go("crea")}>Crea nuova lega (ne diventi admin)</button>
      </div>
    </Sheet>
  );
}

/** Barra in basso come nelle app di lega: Home, Formazione, Rose, Live. */
function TabBar() {
  const items = [
    { to: "/", label: "Home", icon: "home", end: true },
    { to: "/formazione", label: "Formazione", icon: "lineup" },
    { to: "/rose", label: "Rose", icon: "rosters" },
    { to: "/live", label: "Live", icon: "live" },
  ];
  return (
    <nav aria-label="Sezioni" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface safe-nav">
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {items.map((i) => (
          <li key={i.to}>
            <NavLink to={i.to} end={i.end}
              className={({ isActive }) => `relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-bold ${isActive ? "text-brand dark:text-accent" : "text-muted"}`}>
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute inset-x-6 top-0 h-[3px] rounded-b-full bg-accent" />}
                  <Icon name={i.icon} strokeWidth={isActive ? 2.2 : 1.8} />
                  {i.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Menu dell'app (pulsante con le tre linee): utente, notifiche, informazioni e tema chiaro/scuro. */
function MainMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSession();
  const theme = useTheme();
  const items = [
    { to: "/utente", label: "Impostazioni utente", icon: "user" },
    { to: "/notifiche", label: "Notifiche", icon: "bell" },
    { to: "/informazioni", label: "Informazioni", icon: "info" },
  ];
  return (
    <Drawer open={open} onClose={onClose} title="Menu">
      {s?.username && <p className="mb-3 truncate text-sm text-muted">@{s.username} · {s.league.name}</p>}
      <ul className="flex flex-col gap-1">
        {items.map((i) => (
          <li key={i.to}>
            <NavLink to={i.to} onClick={onClose}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold ${isActive ? "bg-surface-2 text-ink" : "text-ink hover:bg-surface-2"}`}>
              <Icon name={i.icon} className="size-5 text-muted" />{i.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-3 border-t border-line px-3 pt-4">
        <Icon name="moon" className="size-5 text-muted" />
        <span className="flex-1 font-semibold">Tema scuro</span>
        <Switch checked={theme === "dark"} onChange={(on) => setTheme(on ? "dark" : "light")} label="Tema scuro" />
      </div>
    </Drawer>
  );
}

/** Intestazione con lega e squadra e pulsante del menu, barra delle sezioni in basso. */
export function Layout() {
  const s = useSession();
  const league = useLeague();
  const navigate = useNavigate();
  const loc = useLocation();
  const myTeam = league.data?.teams.find((t) => t.id === s?.myTeamId);
  const root = ["/", "/formazione", "/rose", "/live"].includes(loc.pathname);
  const [leagues, setLeagues] = useState(false);
  const [menu, setMenu] = useState(false);
  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-brand px-4 py-3 text-brand-ink shadow-md safe-top dark:shadow-none">
        {!root && (
          <button onClick={() => navigate(-1)} aria-label="Indietro" className="rounded-full p-1 text-white/80 hover:text-white">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        {myTeam ? <TeamBadge id={myTeam.id} name={myTeam.name} size={36} /> : null}
        <button onClick={() => setLeagues(true)} className="min-w-0 flex-1 text-left" aria-label={s?.admin ? "Menu della lega: gestione lega e cambio lega" : "Cambia lega"}>
          <div className="truncate text-base font-extrabold leading-tight">{s?.league.name ?? "FootballLite"} <span className="text-white/60">▾</span></div>
          <div className="truncate text-xs text-white/70">{myTeam ? myTeam.name : s?.admin ? "Admin" : "Solo visualizzazione"}</div>
        </button>
        <button onClick={() => setMenu(true)} aria-label="Apri il menu" aria-expanded={menu} className="rounded-full p-1.5 text-white hover:bg-white/10">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </header>
      <main className="flex-1 px-3 pt-4 pb-28">
        <DataStatusBanner />
        <Outlet />
      </main>
      <TabBar />
      <LeagueMenu open={leagues} onClose={() => setLeagues(false)} />
      <MainMenu open={menu} onClose={() => setMenu(false)} />
    </div>
  );
}
