-- Old entries keep their historical recipe scaling semantics.
ALTER TABLE meal_entries ADD COLUMN IF NOT EXISTS portion_mode text NOT NULL DEFAULT 'SCALED';
ALTER TABLE meal_entries ADD COLUMN IF NOT EXISTS allocation_percentage real;
ALTER TABLE meal_entry_ingredients ADD COLUMN IF NOT EXISTS override_amount real;
ALTER TABLE meal_entry_ingredients ALTER COLUMN amount TYPE real USING amount::real;
