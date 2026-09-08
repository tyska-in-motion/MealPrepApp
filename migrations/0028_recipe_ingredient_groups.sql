ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS group_name text;
