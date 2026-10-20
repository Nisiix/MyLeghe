import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLeague } from "../lib/data";
import { session, useLeagues, useSession } from "../lib/session";
import { Sheet, TeamBadge } from "./ui";

/** Elenco delle leghe del dispositivo, ingresso in un'altra lega e creazione di una nuova. */
function LeagueMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSession();
  const leagues = useLeagues();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const go = (search: string) => { onClose(); session.detach(); navigate(`/accesso?${search}`); };
  return (
    <Sheet open={open} onClose={onClose} title="Le tue leghe">
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

const ICONS: Record<string, ReactNode> = {
  home: <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" />,
  lineup: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 12h16M12 3v3M9 21v-3h6v3" /><circle cx="12" cy="12" r="2.5" /></>,
  live: <><circle cx="12" cy="12" r="9" /><path d="M10 8.5l5.5 3.5-5.5 3.5z" /></>,
  more: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
};

/** Barra in basso come nelle app di lega: Home, Formazione, Live, Altro. */
function TabBar() {
  const items = [
    { to: "/", label: "Home", icon: "home", end: true },
    { to: "/formazione", label: "Formazione", icon: "lineup" },
    { to: "/live", label: "Live", icon: "live" },
    { to: "/impostazioni", label: "Altro", icon: "more" },
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
                  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={isActive ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[i.icon]}</svg>
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

/** Intestazione blu con lega e squadra, barra delle sezioni in basso. */
export function Layout() {
  const s = useSession();
  const league = useLeague();
  const navigate = useNavigate();
  const loc = useLocation();
  const myTeam = league.data?.teams.find((t) => t.id === s?.myTeamId);
  const root = ["/", "/formazione", "/live", "/impostazioni"].includes(loc.pathname);
  const [menu, setMenu] = useState(false);
  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-brand px-4 py-3 text-brand-ink shadow-md safe-top">
        {!root && (
          <button onClick={() => navigate(-1)} aria-label="Indietro" className="rounded-full p-1 text-white/80 hover:text-white">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        {myTeam ? <TeamBadge id={myTeam.id} name={myTeam.name} size={36} /> : null}
        <button onClick={() => setMenu(true)} className="min-w-0 flex-1 text-left" aria-label="Cambia lega">
          <div className="truncate text-base font-extrabold leading-tight">{s?.league.name ?? "FootballLite"} <span className="text-white/60">▾</span></div>
          <div className="truncate text-xs text-white/70">{myTeam ? myTeam.name : s?.admin ? "Admin" : "Solo visualizzazione"}</div>
        </button>
        {s?.admin && (
          <Link to="/admin" className="rounded-full border border-white/40 px-3 py-1 text-xs font-bold text-white hover:bg-white/10">Admin</Link>
        )}
      </header>
      <main className="flex-1 px-3 pt-4 pb-28">
        <Outlet />
      </main>
      <TabBar />
      <LeagueMenu open={menu} onClose={() => setMenu(false)} />
    </div>
  );
}
