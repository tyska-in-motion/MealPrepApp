ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS always_at_home boolean NOT NULL DEFAULT false;
