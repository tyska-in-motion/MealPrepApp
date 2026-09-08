ALTER TABLE shopping_list_checks
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date;

UPDATE shopping_list_checks
SET period_start = CURRENT_DATE,
    period_end = CURRENT_DATE
WHERE period_start IS NULL OR period_end IS NULL;

ALTER TABLE shopping_list_checks
  ALTER COLUMN period_start SET NOT NULL,
  ALTER COLUMN period_end SET NOT NULL;

ALTER TABLE shopping_list_checks DROP CONSTRAINT IF EXISTS shopping_list_checks_pkey;
ALTER TABLE shopping_list_checks
  ADD CONSTRAINT shopping_list_checks_pkey PRIMARY KEY (ingredient_id, period_start, period_end);

ALTER TABLE shopping_list_extras
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date;

UPDATE shopping_list_extras
SET period_start = CURRENT_DATE,
    period_end = CURRENT_DATE
WHERE period_start IS NULL OR period_end IS NULL;

ALTER TABLE shopping_list_extras
  ALTER COLUMN period_start SET NOT NULL,
  ALTER COLUMN period_end SET NOT NULL;

ALTER TABLE shopping_list_excluded_items
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date;

UPDATE shopping_list_excluded_items
SET period_start = CURRENT_DATE,
    period_end = CURRENT_DATE
WHERE period_start IS NULL OR period_end IS NULL;

ALTER TABLE shopping_list_excluded_items
  ALTER COLUMN period_start SET NOT NULL,
  ALTER COLUMN period_end SET NOT NULL;

ALTER TABLE shopping_list_excluded_items DROP CONSTRAINT IF EXISTS shopping_list_excluded_items_pkey;
ALTER TABLE shopping_list_excluded_items
  ADD CONSTRAINT shopping_list_excluded_items_pkey PRIMARY KEY (ingredient_id, period_start, period_end);
