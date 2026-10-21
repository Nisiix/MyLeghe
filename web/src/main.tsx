import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmHost } from "./components/Confirm";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { Layout } from "./components/Layout";
import { useSession } from "./lib/session";
import { Access } from "./pages/Access";
import { AdminPage } from "./pages/Admin";
import { Dashboard } from "./pages/Dashboard";
import { LineupPage } from "./pages/Lineup";
import { LivePage } from "./pages/Live";
import { InfoPage } from "./pages/Info";
import { NotificationsPage } from "./pages/Notifications";
import { RostersPage } from "./pages/Rosters";
import { UserPage } from "./pages/User";
import { applyTheme } from "./lib/theme";
import "./styles.css";

applyTheme();

// Aggiornamento dell'app: oltre al controllo all'apertura, si ricontrolla quando l'app torna in primo piano
// e ogni ora, così dopo un deploy la versione nuova arriva anche a chi tiene l'app sempre aperta.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => { if (document.visibilityState === "visible") registration.update().catch(() => {}); };
    document.addEventListener("visibilitychange", check);
    setInterval(check, 60 * 60 * 1000);
  },
});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

/**
 * Serve il codice della lega e la scelta dell'utente (l'admin può entrare anche senza utente, per l'import).
 * Con un avviso in sospeso (accesso fatto da un altro dispositivo) si torna alla scelta dell'utente.
 */
function Guard({ children }: { children: ReactNode }) {
  const s = useSession();
  return s && (s.myTeamId || s.admin) && !s.notice ? <>{children}</> : <Navigate to="/accesso" replace />;
}

function App() {
  const s = useSession();
  return (
    <Routes>
      <Route path="/accesso" element={s?.myTeamId && !s.notice ? <Navigate to="/" replace /> : <Access />} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route index element={<Dashboard />} />
        <Route path="formazione" element={<LineupPage />} />
        <Route path="live" element={<LivePage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="rose" element={<RostersPage />} />
        <Route path="utente" element={<UserPage />} />
        <Route path="notifiche" element={<NotificationsPage />} />
        <Route path="informazioni" element={<InfoPage />} />
        <Route path="impostazioni" element={<Navigate to="/utente" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <ConfirmHost />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
