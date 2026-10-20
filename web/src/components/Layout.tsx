import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLeague } from "../lib/data";
import { useSession } from "../lib/session";

/** Intestazione con lega e squadra; niente menu in basso: tutto parte dalla Dashboard. */
export function Layout() {
  const s = useSession();
  const league = useLeague();
  const navigate = useNavigate();
  const loc = useLocation();
  const myTeam = league.data?.teams.find((t) => t.id === s?.myTeamId);
  const home = loc.pathname === "/";
  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur safe-top">
        {!home && (
          <button onClick={() => navigate(-1)} aria-label="Indietro" className="rounded-full p-1 text-muted hover:text-ink">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        <Link to="/" className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-tight">{s?.league.name ?? "FootballLite"}</div>
          <div className="truncate text-xs text-muted">{myTeam ? myTeam.name : s?.admin ? "Admin" : "Solo visualizzazione"}</div>
        </Link>
        {s?.admin && (
          <Link to="/admin" className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:text-ink">Admin</Link>
        )}
        <Link to="/impostazioni" aria-label="Impostazioni" className="rounded-full p-2 text-muted hover:text-ink">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>
        </Link>
      </header>
      <main className="flex-1 px-4 pt-4 pb-24 safe-bottom">
        <Outlet />
      </main>
    </div>
  );
}
