ALTER TABLE meal_entries ADD COLUMN IF NOT EXISTS recipe_snapshot jsonb;
ALTER TABLE shared_meal_batches ADD COLUMN IF NOT EXISTS recipe_snapshot jsonb;
