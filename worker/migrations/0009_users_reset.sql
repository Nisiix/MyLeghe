-- Pulizia dei dati delle leghe (leghe, squadre, rose, formazioni, calendari, notifiche e dispositivi).
-- I dati di Serie A scaricati dalle fonti restano: si aggiornano da soli con la sincronizzazione.
DELETE FROM notify;
DELETE FROM devices;
DELETE FROM lineups;
DELETE FROM league_calendar;
DELETE FROM roster;
DELETE FROM teams;
DELETE FROM leagues;
DELETE FROM kv WHERE key LIKE 'calendar:%' OR key LIKE 'calib:%' OR key LIKE 'notify:%';

-- Due leghe non possono avere lo stesso nome (senza distinzione tra maiuscole e minuscole).
CREATE UNIQUE INDEX leagues_name ON leagues (name COLLATE NOCASE);

-- Profilo utente di ogni squadra della lega: username e password (nel database solo l'hash).
-- session_id è l'accesso attivo: resta valido solo sul dispositivo dell'ultimo login.
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  session_id TEXT,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX users_league_username ON users (league_id, username COLLATE NOCASE);
