DO $$ BEGIN
  CREATE TYPE ingredient_scaling_type AS ENUM ('LINEAR', 'FIXED', 'STEP', 'FORMULA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS base_amount real,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS scaling_type ingredient_scaling_type,
  ADD COLUMN IF NOT EXISTS scaling_formula text,
  ADD COLUMN IF NOT EXISTS step_thresholds jsonb;

UPDATE recipe_ingredients
SET base_amount = amount
WHERE base_amount IS NULL;

UPDATE recipe_ingredients
SET unit = 'g'
WHERE unit IS NULL;

UPDATE recipe_ingredients
SET scaling_type = 'LINEAR'
WHERE scaling_type IS NULL;

ALTER TABLE recipe_ingredients
  ALTER COLUMN base_amount SET NOT NULL,
  ALTER COLUMN unit SET NOT NULL,
  ALTER COLUMN scaling_type SET NOT NULL,
  ALTER COLUMN scaling_type SET DEFAULT 'LINEAR';
