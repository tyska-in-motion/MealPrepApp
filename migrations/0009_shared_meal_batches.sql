CREATE TABLE IF NOT EXISTS shared_meal_batches (
  id serial PRIMARY KEY,
  recipe_id integer NOT NULL,
  total_servings real NOT NULL DEFAULT 1,
  note text,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now()
);

ALTER TABLE meal_entries ADD COLUMN IF NOT EXISTS cooked_batch_id integer;
