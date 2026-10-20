-- Dispositivi che ricevono notifiche push.
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Tabella della prima versione, rimossa dalla migrazione 0002.
CREATE TABLE league_watch (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  league_id INTEGER NOT NULL,
  league_name TEXT NOT NULL,
  team_id INTEGER NOT NULL,
  division TEXT NOT NULL,
  enc_jwt TEXT NOT NULL,
  jwt_exp INTEGER NOT NULL,
  prefs TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, league_id)
);

-- Ultima rilevazione della titolarità (per individuare i cali sotto soglia).
CREATE TABLE starter_snapshot (
  player_id INTEGER PRIMARY KEY,
  percent INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
