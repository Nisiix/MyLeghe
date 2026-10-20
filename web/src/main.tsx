import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { SettingsPage } from "./pages/Settings";
import "./styles.css";

registerSW({ immediate: true });

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

/** Serve il codice della lega e la scelta dell'utente (l'admin può entrare anche senza utente, per l'import). */
function Guard({ children }: { children: ReactNode }) {
  const s = useSession();
  return s && (s.myTeamId || s.admin) ? <>{children}</> : <Navigate to="/accesso" replace />;
}

function App() {
  const s = useSession();
  return (
    <Routes>
      <Route path="/accesso" element={s?.myTeamId ? <Navigate to="/" replace /> : <Access />} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route index element={<Dashboard />} />
        <Route path="formazione" element={<LineupPage />} />
        <Route path="live" element={<LivePage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="impostazioni" element={<SettingsPage />} />
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
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
