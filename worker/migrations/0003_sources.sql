-- Fonti: football-data.org (calendario e classifica Serie A) e BSD (giocatori, indisponibili, formazioni, eventi).
-- API-Football non copre gratis la stagione corrente: tabelle rimosse.
DROP TABLE IF EXISTS af_player_stats;
DROP TABLE IF EXISTS af_injuries;
DROP TABLE IF EXISTS af_fixtures;
DROP TABLE IF EXISTS af_players;
DROP TABLE IF EXISTS af_teams;
DROP TABLE IF EXISTS roster;

ALTER TABLE teams ADD COLUMN code_hash TEXT;

-- Rosa importata: ext_id è l'id del giocatore nella fonte dati (abbinamento automatico o manuale).
CREATE TABLE roster (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  name TEXT NOT NULL,
  role INTEGER NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0,
  ext_id INTEGER,
  confidence REAL NOT NULL DEFAULT 0,
  candidates TEXT,
  PRIMARY KEY (team_id, slot)
);

-- Partite di Serie A (football-data.org), con l'id evento BSD quando abbinato.
CREATE TABLE sa_matches (
  id INTEGER PRIMARY KEY,
  matchday INTEGER NOT NULL,
  kickoff INTEGER NOT NULL,
  status TEXT NOT NULL,
  home_id INTEGER NOT NULL,
  away_id INTEGER NOT NULL,
  home_name TEXT NOT NULL,
  away_name TEXT NOT NULL,
  home_tla TEXT,
  away_tla TEXT,
  score_home INTEGER,
  score_away INTEGER,
  ext_event_id INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX sa_matches_md ON sa_matches (matchday);

CREATE TABLE sa_standings (
  team_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  tla TEXT,
  position INTEGER NOT NULL,
  points INTEGER NOT NULL,
  played INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Giocatori di Serie A dalla fonte dati (per l'abbinamento delle rose).
CREATE TABLE players (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  role INTEGER,
  team_name TEXT,
  team_ext_id INTEGER,
  updated_at INTEGER NOT NULL
);

-- Stato del giocatore per una giornata: indisponibile, in dubbio, undici probabile/ufficiale.
CREATE TABLE player_status (
  player_id INTEGER NOT NULL,
  matchday INTEGER NOT NULL,
  unavailable TEXT,
  doubtful INTEGER NOT NULL DEFAULT 0,
  predicted TEXT,
  confirmed INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, matchday)
);

-- Eventi per giocatore e partita (titolarità recente e calcolo live).
CREATE TABLE player_match (
  event_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  matchday INTEGER NOT NULL,
  started INTEGER NOT NULL DEFAULT 0,
  minutes INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  yellow INTEGER NOT NULL DEFAULT 0,
  red INTEGER NOT NULL DEFAULT 0,
  pen_scored INTEGER NOT NULL DEFAULT 0,
  pen_missed INTEGER NOT NULL DEFAULT 0,
  pen_saved INTEGER NOT NULL DEFAULT 0,
  own_goals INTEGER NOT NULL DEFAULT 0,
  conceded INTEGER NOT NULL DEFAULT 0,
  rating REAL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, player_id)
);
CREATE INDEX player_match_player ON player_match (player_id, matchday);
