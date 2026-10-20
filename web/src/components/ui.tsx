import { useEffect, useState, type ReactNode } from "react";
import { initials } from "../lib/api";

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`shadow-card rounded-2xl bg-surface p-4 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="scoreboard text-[17px] leading-tight text-ink">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Spinner({ label = "Caricamento…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-muted" role="status">
      <span className="size-5 rounded-full border-2 border-line border-t-accent animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error ?? "Errore");
  return (
    <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger flex items-center justify-between gap-3">
      <span>{msg}</span>
      {onRetry && <button className="shrink-0 underline" onClick={onRetry}>Riprova</button>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted text-center py-6">{children}</p>;
}

/** Colori delle maglie di squadra: tinte piene, testo bianco. */
const COLORS = ["#1c7ed6", "#e0322e", "#27a148", "#7b4bd6", "#f08c00", "#0b7285", "#c2255c", "#495057", "#1a3570", "#2b8a3e"];

export function TeamBadge({ id, name, size = 32 }: { id: number; name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-white ring-2 ring-white/80"
      style={{ width: size, height: size, background: COLORS[id % COLORS.length], fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Avatar a iniziali al posto delle foto: nessuna immagine protetta da diritti. */
export function PlayerAvatar({ name, role, size = 44 }: { name: string; role?: number; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-white font-extrabold text-brand"
      style={{ width: size, height: size, fontSize: size * 0.34, boxShadow: role ? `inset 0 0 0 ${Math.max(2, Math.round(size / 14))}px ${ROLE_COLOR[role]}, 0 1px 3px rgba(0,0,0,.25)` : "0 1px 3px rgba(0,0,0,.25)" }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/** Titolarità stimata da FootballLite, con colore per fascia. */
export function StarterPercent({ percent, threshold = 70 }: { percent: number | null | undefined; threshold?: number }) {
  if (percent === null || percent === undefined || Number.isNaN(percent)) return <span className="text-[10px] text-muted" title="Giocatore non abbinato alla fonte dati">n.d.</span>;
  const tone = percent >= threshold ? "bg-accent text-accent-ink" : percent >= 50 ? "bg-card text-card-ink" : "bg-danger text-white";
  return <span className={`tabular text-[11px] font-bold rounded-full px-1.5 leading-4 ${tone}`}>{percent}%</span>;
}

/** Colori di ruolo come nelle app di lega: P arancio, D verde, C blu, A rosso. */
export const ROLE_COLOR: Record<number, string> = { 1: "var(--color-role-p)", 2: "var(--color-role-d)", 3: "var(--color-role-c)", 4: "var(--color-role-a)" };

export function RoleTag({ role, size = 20 }: { role: number; size?: number }) {
  const letter = ["?", "P", "D", "C", "A"][role] ?? "?";
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-md font-extrabold text-white"
      style={{ width: size, height: size, fontSize: size * 0.55, background: ROLE_COLOR[role] ?? "#868e96" }}>{letter}</span>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div className="shadow-card flex gap-1 overflow-x-auto rounded-full bg-surface p-1" role="tablist">
      {items.map((i) => (
        <button
          key={i.value}
          role="tab"
          aria-selected={value === i.value}
          onClick={() => onChange(i.value)}
          className={`flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold transition ${value === i.value ? "bg-brand text-brand-ink dark:bg-accent dark:text-accent-ink" : "text-muted hover:text-ink"}`}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl bg-surface border-t border-line p-4 safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h2 className="mb-3 text-lg font-extrabold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Pannello laterale da destra (menu dell'app), chiuso con Esc o toccando fuori. */
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className="safe-top flex h-full w-[min(20rem,86vw)] flex-col overflow-y-auto border-l border-line bg-surface p-4 safe-bottom"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button onClick={onClose} aria-label="Chiudi il menu" className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Interruttore acceso/spento (role="switch"). */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-accent" : "bg-line"}`}>
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

/**
 * "card" è l'azione chiave della schermata (verde pieno, come «Inserisci formazione»); "outline" il pulsante
 * secondario bordato di blu; "ghost" il neutro.
 */
export function Button({ children, variant = "primary", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "card" | "outline" }) {
  const styles = {
    primary: "bg-brand text-brand-ink hover:bg-brand-2",
    ghost: "bg-surface-2 text-ink border border-line hover:bg-line",
    outline: "bg-surface text-brand border-2 border-brand hover:bg-brand/5 dark:text-ink dark:border-line",
    danger: "bg-danger text-white hover:brightness-110",
    card: "bg-accent text-accent-ink shadow-[0_2px_0_rgba(0,0,0,0.18)] hover:brightness-105 active:translate-y-px",
  }[variant];
  return (
    <button className={`rounded-full px-4 py-2.5 text-[15px] font-bold transition disabled:opacity-50 ${styles} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "scaduta";
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d > 0) return `${d}g ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

export const fmt = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || Number.isNaN(n) ? "–" : n.toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
