// Notifiche push: promemoria formazione e cali di titolarità, disattivabili dall'utente.

import { DEFAULT_NOTIFY, dueReminder, EVENT_TEXT, newEvents, starterDrops, type EventCounts, type EventKind, type LeagueConfig, type NotifyPrefs, type Role } from "@footballlite/core";
import { loadConfig, opponentOf } from "./league";
import { Hono } from "hono";
import { requireSession, type AppEnv } from "./auth";
import type { Env } from "./env";
import { computeOutlook } from "./outlook";
import { sendPush } from "./push";
import { activeRound } from "./schedule";

export const notify = new Hono<AppEnv>();

notify.get("/push/vapid", (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY }));

notify.post("/push/register", async (c) => {
  const { deviceId, subscription } = await c.req.json<{ deviceId?: string; subscription: { endpoint: string; keys: { p256dh: string; auth: string } } }>();
  if (!subscription?.endpoint?.startsWith("https://") || !subscription.keys?.p256dh) return c.json({ error: "Iscrizione push non valida" }, 400);
  const existing = await c.env.DB.prepare("SELECT id FROM devices WHERE endpoint = ?").bind(subscription.endpoint).first<{ id: string }>();
  const id = existing?.id ?? deviceId ?? crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO devices (id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth`,
  ).bind(id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, Date.now()).run();
  return c.json({ deviceId: id });
});

notify.use("/league/notify", requireSession);

notify.get("/league/notify", async (c) => {
  const s = c.get("session");
  const deviceId = c.req.query("deviceId") ?? "";
  const row = await c.env.DB.prepare("SELECT team_id, enabled, prefs FROM notify WHERE device_id = ? AND league_id = ?").bind(deviceId, s.lid).first<{ team_id: number; enabled: number; prefs: string }>();
  return c.json(row ? { teamId: row.team_id, prefs: { ...DEFAULT_NOTIFY, ...JSON.parse(row.prefs), enabled: !!row.enabled } } : null);
});

notify.put("/league/notify", async (c) => {
  const s = c.get("session");
  const b = await c.req.json<{ deviceId: string; teamId: number; prefs: Partial<NotifyPrefs> }>();
  if (!s.tids.includes(b.teamId)) return c.json({ error: "Serve il codice di questa squadra" }, 403);
  const dev = await c.env.DB.prepare("SELECT 1 FROM devices WHERE id = ?").bind(b.deviceId).first();
  if (!dev) return c.json({ error: "Dispositivo non registrato per le notifiche" }, 404);
  const prefs = { ...DEFAULT_NOTIFY, ...b.prefs };
  await c.env.DB.prepare(
    `INSERT INTO notify (device_id, league_id, team_id, enabled, prefs, state) VALUES (?, ?, ?, ?, ?, '{}')
     ON CONFLICT(device_id, league_id) DO UPDATE SET team_id = excluded.team_id, enabled = excluded.enabled, prefs = excluded.prefs`,
  ).bind(b.deviceId, s.lid, b.teamId, prefs.enabled ? 1 : 0, JSON.stringify(prefs)).run();
  return c.json({ prefs });
});

notify.delete("/league/notify", async (c) => {
  const s = c.get("session");
  const { deviceId } = await c.req.json<{ deviceId: string }>();
  await c.env.DB.prepare("DELETE FROM notify WHERE device_id = ? AND league_id = ?").bind(deviceId, s.lid).run();
  return c.json({ ok: true });
});

interface NotifyRow { device_id: string; league_id: string; team_id: number; prefs: string; state: string; endpoint: string; p256dh: string; auth: string; team_name: string }
interface NotifyState { round?: number; lastReminder?: number | null; lastStarters?: Record<string, number>; alerted?: string[]; events?: Record<string, EventCounts> }

/** Controllo periodico: promemoria se manca la formazione, avviso se un titolare scende sotto soglia. */
export async function runNotifications(env: Env): Promise<void> {
  const rows = (await env.DB.prepare(
    `SELECT n.*, d.endpoint, d.p256dh, d.auth, t.name AS team_name FROM notify n
     JOIN devices d ON d.id = n.device_id JOIN teams t ON t.id = n.team_id WHERE n.enabled = 1`,
  ).all<NotifyRow>()).results ?? [];
  if (!rows.length) return;
  const info = await activeRound(env);
  if (!info.deadline) return;
  const now = Date.now();
  const outlooks = new Map<string, Awaited<ReturnType<typeof computeOutlook>>>();

  for (const r of rows) {
    try {
      const prefs: NotifyPrefs = { ...DEFAULT_NOTIFY, ...JSON.parse(r.prefs) };
      let state: NotifyState = JSON.parse(r.state || "{}");
      if (state.round !== info.matchday) state = { round: info.matchday };
      const device = { id: r.device_id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth };

      const lineup = await env.DB.prepare("SELECT starters FROM lineups WHERE team_id = ? AND round = ? ORDER BY id DESC LIMIT 1")
        .bind(r.team_id, info.matchday).first<{ starters: string }>();
      if (info.phase !== "upcoming") {
        await liveEventAlerts(env, r, prefs, state, info.matchday, device);
      } else if (!lineup) {
        const h = dueReminder(info.deadline, now, prefs.reminderHours, state.lastReminder ?? null);
        if (h !== null) {
          await sendPush(env, device, { title: `${r.team_name}: formazione mancante`, body: `Giornata ${info.matchday}: mancano meno di ${h} ${h === 1 ? "ora" : "ore"} al primo calcio d'inizio.`, url: "/", tag: `rem-${r.league_id}` });
          state.lastReminder = h;
        }
      } else if (prefs.starterAlerts && info.deadline - now < 48 * 3600_000) {
        if (!outlooks.has(r.league_id)) outlooks.set(r.league_id, await computeOutlook(env, r.league_id));
        const out = outlooks.get(r.league_id)!;
        const slots: number[] = JSON.parse(lineup.starters);
        const roster = await env.DB.prepare(`SELECT slot, name, ext_id FROM roster WHERE team_id = ? AND slot IN (${slots.join(",") || "-1"})`).bind(r.team_id).all<{ slot: number; name: string; ext_id: number | null }>();
        const current: Record<string, number> = {};
        const names: Record<string, string> = {};
        for (const p of roster.results ?? []) {
          if (!p.ext_id || !out.players[p.ext_id]) continue;
          current[p.ext_id] = out.players[p.ext_id].starterPercent;
          names[p.ext_id] = p.name;
        }
        const drops = starterDrops(state.lastStarters ?? {}, current, Object.keys(current), prefs.starterThreshold)
          .filter((id) => !(state.alerted ?? []).includes(id));
        if (drops.length) {
          const text = drops.map((id) => `${names[id]} ${state.lastStarters?.[id]}% → ${current[id]}%`).join(", ");
          await sendPush(env, device, { title: `${r.team_name}: titolarità in calo`, body: text, url: "/", tag: `tit-${r.league_id}` });
          state.alerted = [...(state.alerted ?? []), ...drops];
        }
        state.lastStarters = current;
      }
      await env.DB.prepare("UPDATE notify SET state = ? WHERE device_id = ? AND league_id = ?").bind(JSON.stringify(state), r.device_id, r.league_id).run();
    } catch (e) {
      console.error("notifica", r.league_id, (e as Error).message);
    }
  }
}

const BONUS_KEY: Record<EventKind, keyof LeagueConfig["bonus"]> = {
  goal: "goal", assist: "assist", yellow: "yellow", red: "red", penaltyScored: "penaltyScored",
  penaltyMissed: "penaltyMissed", penaltySaved: "penaltySaved", ownGoal: "ownGoal",
};

/** Titolari (ed eventuali panchinari) di una squadra per la giornata, con l'id del giocatore nella fonte dati. */
async function fieldedPlayers(env: Env, teamId: number, round: number): Promise<{ ext_id: number; name: string; role: Role }[]> {
  const l = await env.DB.prepare("SELECT starters, bench FROM lineups WHERE team_id = ? AND round = ? ORDER BY id DESC LIMIT 1").bind(teamId, round).first<{ starters: string; bench: string }>();
  if (!l) return [];
  const slots = [...JSON.parse(l.starters), ...JSON.parse(l.bench)] as number[];
  const rows = await env.DB.prepare(`SELECT name, role, ext_id FROM roster WHERE team_id = ? AND ext_id IS NOT NULL AND slot IN (${slots.join(",") || "-1"})`).bind(teamId).all<{ ext_id: number; name: string; role: Role }>();
  return rows.results ?? [];
}

/** Durante la giornata: bonus e malus nuovi dei giocatori schierati da me e dall'avversario scelto. */
async function liveEventAlerts(env: Env, r: NotifyRow, prefs: NotifyPrefs, state: NotifyState, round: number, device: { id: string; endpoint: string; p256dh: string; auth: string }) {
  if (!prefs.myEventAlerts && !prefs.opponentEventAlerts) return;
  const cfg = await loadConfig(env.DB, r.league_id);
  const groups: { label: string; players: { ext_id: number; name: string; role: Role }[] }[] = [];
  if (prefs.myEventAlerts) groups.push({ label: r.team_name, players: await fieldedPlayers(env, r.team_id, round) });
  if (prefs.opponentEventAlerts) {
    // L'avversario arriva dal calendario importato (giornata di lega abbinata alla giornata di Serie A).
    const opp = await opponentOf(env.DB, r.league_id, r.team_id, round);
    if (opp) groups.push({ label: `${opp.name} (avversario)`, players: await fieldedPlayers(env, opp.id, round) });
  }
  const ids = groups.flatMap((g) => g.players.map((p) => p.ext_id));
  if (!ids.length) return;
  const rows = await env.DB.prepare(`SELECT player_id, goals, assists, yellow, red, pen_scored, pen_missed, pen_saved, own_goals FROM player_match WHERE matchday = ? AND player_id IN (${ids.join(",")})`).bind(round).all<any>();
  const byId = new Map((rows.results ?? []).map((x) => [x.player_id as number, x]));
  const seen = state.events ?? {};
  const lines: string[] = [];
  for (const g of groups) {
    for (const p of g.players) {
      const x = byId.get(p.ext_id);
      if (!x) continue;
      const now: EventCounts = { goal: x.goals, assist: x.assists, yellow: x.yellow, red: x.red, penaltyScored: x.pen_scored, penaltyMissed: x.pen_missed, penaltySaved: x.pen_saved, ownGoal: x.own_goals };
      const key = String(p.ext_id);
      // Al primo controllo della giornata si registra lo stato senza notificare eventi già vecchi.
      if (seen[key]) {
        for (const k of newEvents(seen[key], now)) {
          const v = cfg.bonus[BONUS_KEY[k]][p.role - 1];
          lines.push(`${EVENT_TEXT[k]}: ${p.name} (${g.label}) ${v > 0 ? "+" : ""}${v}`);
        }
      }
      seen[key] = now;
    }
  }
  state.events = seen;
  if (lines.length) {
    const body = lines.slice(0, 6).join(" · ") + (lines.length > 6 ? ` · e altri ${lines.length - 6}` : "");
    await sendPush(env, device, { title: `Giornata ${round}: bonus e malus`, body, url: "/live", tag: `ev-${r.league_id}-${Date.now()}` });
  }
}
