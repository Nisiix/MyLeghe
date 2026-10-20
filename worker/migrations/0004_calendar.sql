-- Calendario della lega importato dal file esportato da LegheFC: definisce gli avversari di ogni giornata.
CREATE TABLE league_calendar (
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  league_day INTEGER NOT NULL,
  serie_a_day INTEGER NOT NULL,
  home_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  home_points REAL,
  away_points REAL,
  home_goals INTEGER,
  away_goals INTEGER,
  PRIMARY KEY (league_id, league_day, home_team_id)
);
CREATE INDEX league_calendar_sa ON league_calendar (league_id, serie_a_day);
