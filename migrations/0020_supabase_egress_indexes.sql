-- Indexes for paginated/filterable list endpoints to avoid full table scans and frontend-side filtering.
CREATE INDEX IF NOT EXISTS recipes_created_at_idx ON recipes (created_at DESC);
CREATE INDEX IF NOT EXISTS recipes_name_lower_idx ON recipes (LOWER(name));
CREATE INDEX IF NOT EXISTS ingredients_name_lower_idx ON ingredients (LOWER(name));
CREATE INDEX IF NOT EXISTS ingredients_category_lower_idx ON ingredients (LOWER(category));
CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe_id_idx ON recipe_ingredients (recipe_id);
CREATE INDEX IF NOT EXISTS recipe_ingredients_ingredient_id_idx ON recipe_ingredients (ingredient_id);
CREATE INDEX IF NOT EXISTS recipe_frequent_addons_recipe_id_idx ON recipe_frequent_addons (recipe_id);
CREATE INDEX IF NOT EXISTS meal_entries_recipe_event_idx ON meal_entries (recipe_id, cooked_batch_id, date) WHERE recipe_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS meal_entries_date_idx ON meal_entries (date);
