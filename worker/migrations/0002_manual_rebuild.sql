-- Versione conforme: niente LegheFC. Rose importate da file, dati esterni da API con licenza.
DROP TABLE IF EXISTS league_watch;
DROP TABLE IF EXISTS starter_snapshot;

CREATE TABLE leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  admin_hash TEXT NOT NULL,
  settings TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  spent INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE roster (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  name TEXT NOT NULL,
  role INTEGER NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0,
  af_player_id INTEGER,
  match_state TEXT NOT NULL DEFAULT 'pending',
  candidates TEXT,
  PRIMARY KEY (team_id, slot)
);

CREATE TABLE lineups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  module TEXT NOT NULL,
  starters TEXT NOT NULL,
  bench TEXT NOT NULL,
  forced INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX lineups_team_round ON lineups (team_id, round, id);

CREATE TABLE af_teams (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  squad_updated_at INTEGER
);

CREATE TABLE af_players (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  team_id INTEGER NOT NULL,
  position TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE af_fixtures (
  id INTEGER PRIMARY KEY,
  round INTEGER NOT NULL,
  date INTEGER NOT NULL,
  status TEXT NOT NULL,
  home_id INTEGER NOT NULL,
  away_id INTEGER NOT NULL,
  goals_home INTEGER,
  goals_away INTEGER,
  stats_fetched_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX af_fixtures_round ON af_fixtures (round);

CREATE TABLE af_player_stats (
  fixture_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  minutes INTEGER,
  started INTEGER NOT NULL DEFAULT 0,
  rating REAL,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  conceded INTEGER NOT NULL DEFAULT 0,
  yellow INTEGER NOT NULL DEFAULT 0,
  red INTEGER NOT NULL DEFAULT 0,
  pen_scored INTEGER NOT NULL DEFAULT 0,
  pen_missed INTEGER NOT NULL DEFAULT 0,
  pen_saved INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (fixture_id, player_id)
);

CREATE TABLE af_injuries (
  player_id INTEGER NOT NULL,
  fixture_id INTEGER NOT NULL,
  type TEXT,
  reason TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, fixture_id)
);

CREATE TABLE quota (
  day TEXT PRIMARY KEY,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE notify (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  prefs TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (device_id, league_id)
);
