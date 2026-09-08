ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS meal_prep boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meal_prep_max_days_before integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS meal_prep_notes text;
