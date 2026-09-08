ALTER TABLE recipe_frequent_addons
  ADD COLUMN IF NOT EXISTS base_amount real,
  ADD COLUMN IF NOT EXISTS alternative_amount real,
  ADD COLUMN IF NOT EXISTS alternative_unit text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS scaling_type ingredient_scaling_type,
  ADD COLUMN IF NOT EXISTS scaling_formula text,
  ADD COLUMN IF NOT EXISTS step_thresholds jsonb;

UPDATE recipe_frequent_addons
SET base_amount = amount
WHERE base_amount IS NULL;

UPDATE recipe_frequent_addons
SET unit = 'g'
WHERE unit IS NULL;

UPDATE recipe_frequent_addons
SET scaling_type = 'LINEAR'
WHERE scaling_type IS NULL;

ALTER TABLE recipe_frequent_addons
  ALTER COLUMN base_amount SET NOT NULL,
  ALTER COLUMN unit SET NOT NULL,
  ALTER COLUMN scaling_type SET NOT NULL,
  ALTER COLUMN scaling_type SET DEFAULT 'LINEAR';
