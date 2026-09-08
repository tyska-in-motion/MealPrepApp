CREATE TABLE IF NOT EXISTS recipe_prep_tasks (
  id serial PRIMARY KEY,
  recipe_id integer NOT NULL,
  title text NOT NULL,
  ingredient_id integer,
  ingredient_source text NOT NULL DEFAULT 'ingredient',
  max_days_before integer NOT NULL DEFAULT 1,
  group_key text,
  notes text,
  created_at timestamp DEFAULT now()
);

ALTER TABLE recipe_prep_tasks ADD COLUMN IF NOT EXISTS ingredient_id integer;
ALTER TABLE recipe_prep_tasks ADD COLUMN IF NOT EXISTS ingredient_source text DEFAULT 'ingredient';
ALTER TABLE recipe_prep_tasks ADD COLUMN IF NOT EXISTS max_days_before integer DEFAULT 1;
ALTER TABLE recipe_prep_tasks ADD COLUMN IF NOT EXISTS group_key text;
ALTER TABLE recipe_prep_tasks ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE recipe_prep_tasks ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();

UPDATE recipe_prep_tasks SET ingredient_source = 'ingredient' WHERE ingredient_source IS NULL;
UPDATE recipe_prep_tasks SET max_days_before = 1 WHERE max_days_before IS NULL OR max_days_before < 1;

ALTER TABLE recipe_prep_tasks ALTER COLUMN ingredient_source SET NOT NULL;
ALTER TABLE recipe_prep_tasks ALTER COLUMN ingredient_source SET DEFAULT 'ingredient';
ALTER TABLE recipe_prep_tasks ALTER COLUMN max_days_before SET NOT NULL;
ALTER TABLE recipe_prep_tasks ALTER COLUMN max_days_before SET DEFAULT 1;

CREATE INDEX IF NOT EXISTS recipe_prep_tasks_recipe_id_idx ON recipe_prep_tasks(recipe_id);
CREATE INDEX IF NOT EXISTS recipe_prep_tasks_ingredient_id_idx ON recipe_prep_tasks(ingredient_id);
