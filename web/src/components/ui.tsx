import { useEffect, useState, type ReactNode } from "react";
import { initials } from "../lib/api";

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-surface border border-line p-4 ${className}`}>
      {(title || action) && (
        <header className="flex items-baseline justify-between mb-3 gap-2">
          {title && <h2 className="scoreboard text-xl leading-tight">{title}</h2>}
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
    <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-red-200 flex items-center justify-between gap-3">
      <span>{msg}</span>
      {onRetry && <button className="shrink-0 underline" onClick={onRetry}>Riprova</button>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted text-center py-6">{children}</p>;
}

const COLORS = ["#22c55e", "#38bdf8", "#f59e0b", "#a78bfa", "#f472b6", "#f87171", "#34d399", "#fb923c", "#60a5fa", "#facc15"];

export function TeamBadge({ id, name, size = 32 }: { id: number; name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold text-bg shrink-0"
      style={{ width: size, height: size, background: COLORS[id % COLORS.length], fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Avatar a iniziali al posto delle foto: nessuna immagine protetta da diritti. */
export function PlayerAvatar({ name, role, size = 44 }: { name: string; role?: number; size?: number }) {
  const ring: Record<number, string> = { 1: "#f59e0b", 2: "#10b981", 3: "#0ea5e9", 4: "#f43f5e" };
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-bold text-ink"
      style={{ width: size, height: size, fontSize: size * 0.34, boxShadow: role ? `inset 0 0 0 2px ${ring[role]}` : undefined }}
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

export function RoleTag({ role }: { role: number }) {
  const map: Record<number, [string, string]> = {
    1: ["P", "bg-amber-500"], 2: ["D", "bg-emerald-500"], 3: ["C", "bg-sky-500"], 4: ["A", "bg-rose-500"],
  };
  const [l, c] = map[role] ?? ["?", "bg-slate-500"];
  return <span className={`inline-flex size-5 items-center justify-center rounded text-[11px] font-bold text-black ${c}`}>{l}</span>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface p-1 border border-line" role="tablist">
      {items.map((i) => (
        <button
          key={i.value}
          role="tab"
          aria-selected={value === i.value}
          onClick={() => onChange(i.value)}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${value === i.value ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
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
        <h2 className="mb-3 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** "card" è il cartellino giallo: solo per l'azione chiave della schermata. */
export function Button({ children, variant = "primary", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "card" }) {
  const styles = {
    primary: "bg-accent text-accent-ink hover:brightness-110",
    ghost: "bg-surface-2 text-ink border border-line hover:bg-line",
    danger: "bg-danger text-white hover:brightness-110",
    card: "bg-card text-card-ink shadow-[3px_3px_0_var(--color-ink)] -rotate-1 hover:rotate-0",
  }[variant];
  return (
    <button className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${styles} ${className}`} {...rest}>
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
