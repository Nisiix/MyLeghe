-- Dettaglio dell'indisponibilità dalla fonte dati: motivo e rientro previsto (quando la fonte li fornisce).
ALTER TABLE player_status ADD COLUMN reason TEXT;
ALTER TABLE player_status ADD COLUMN expected_return TEXT;
