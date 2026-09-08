ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS default_servings_a real NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS default_servings_b real NOT NULL DEFAULT 1.5;
