-- Profilo utente indipendente dalla squadra: si entra con username e password, poi si collega la squadra
-- della rosa (una sola volta; si può scollegare dalle impostazioni). team_id è null finché non è collegata.
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id INTEGER UNIQUE REFERENCES teams(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  session_id TEXT,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX users_league_username ON users (league_id, username COLLATE NOCASE);
