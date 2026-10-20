// Tema chiaro/scuro: all'inizio segue il sistema, poi resta quello scelto con l'interruttore del menu.

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const KEY = "footballlite.theme";
/** Colore della barra del browser/di sistema per tema (come l'intestazione dell'app). */
const BAR: Record<Theme, string> = { light: "#0f2350", dark: "#161a21" };
const listeners = new Set<() => void>();
const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch { return null; }
}

export function currentTheme(): Theme {
  return stored() ?? (media?.matches ? "dark" : "light");
}

export function applyTheme(): void {
  const t = currentTheme();
  document.documentElement.classList.toggle("dark", t === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR[t]);
  listeners.forEach((l) => l());
}

export function setTheme(t: Theme): void {
  try { localStorage.setItem(KEY, t); } catch { /* resta per questa sessione */ }
  applyTheme();
}

export function toggleTheme(): void {
  setTheme(currentTheme() === "dark" ? "light" : "dark");
}

// Senza una scelta salvata si segue il cambio di tema del sistema.
media?.addEventListener?.("change", () => { if (!stored()) applyTheme(); });

export function useTheme(): Theme {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, currentTheme, () => "light");
}
