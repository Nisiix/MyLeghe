-- Capitano e vice della formazione (slot della rosa), per il modificatore capitano del regolamento.
ALTER TABLE lineups ADD COLUMN captain INTEGER;
ALTER TABLE lineups ADD COLUMN vice INTEGER;
