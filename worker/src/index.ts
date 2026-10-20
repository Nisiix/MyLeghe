// FootballLite: solo rose importate dalla lega e fonti con licenza (football-data.org, BSD).
// Nessun accesso a LegheFC o a fantacalcio.it.

import { Hono } from "hono";
import { kvSet } from "./schedule";
import type { AppEnv } from "./auth";
import type { Env } from "./env";
import { league } from "./league";
import { notify, runNotifications } from "./notify";
import { outlook } from "./outlook";
import { SourceError } from "./sources";
import { runSync } from "./sync";

const app = new Hono<AppEnv>().basePath("/api");

app.onError((err, c) => {
  const status = err instanceof SourceError ? 502 : 500;
  console.error(err.message);
  return c.json({ error: err.message }, status);
});

app.get("/health", (c) => c.json({ ok: true }));
app.route("/", league);
app.route("/", outlook);
app.route("/", notify);

/** Sincronizzazione manuale (solo con il codice di setup), utile al primo avvio. */
app.post("/setup/sync", async (c) => {
  if (!c.env.SETUP_CODE || c.req.header("x-setup-code") !== c.env.SETUP_CODE) return c.json({ error: "Non autorizzato" }, 401);
  return c.json(await runSync(c.env));
});

/** Pulizia dei dati delle leghe (solo con il codice di setup): restano i dati di Serie A delle fonti. */
app.post("/setup/reset", async (c) => {
  if (!c.env.SETUP_CODE || c.req.header("x-setup-code") !== c.env.SETUP_CODE) return c.json({ error: "Non autorizzato" }, 401);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM users"),
    c.env.DB.prepare("DELETE FROM notify"),
    c.env.DB.prepare("DELETE FROM devices"),
    c.env.DB.prepare("DELETE FROM lineups"),
    c.env.DB.prepare("DELETE FROM league_calendar"),
    c.env.DB.prepare("DELETE FROM roster"),
    c.env.DB.prepare("DELETE FROM teams"),
    c.env.DB.prepare("DELETE FROM leagues"),
    c.env.DB.prepare("DELETE FROM kv WHERE key LIKE 'calendar:%' OR key LIKE 'calib:%' OR key LIKE 'notify:%'"),
  ]);
  return c.json({ reset: true });
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      // Esito dell'ultima sincronizzazione, visibile all'admin nella pagina di gestione (stato della fonte dati).
      try {
        const r = await runSync(env);
        await kvSet(env, "sync:last", { ok: true, ...r });
      } catch (e) {
        console.error("sync", (e as Error).message);
        await kvSet(env, "sync:last", { ok: false, error: (e as Error).message }).catch(() => {});
      }
      try { await runNotifications(env); } catch (e) { console.error("notifiche", (e as Error).message); }
    })());
  },
} satisfies ExportedHandler<Env>;
