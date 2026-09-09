-- Recipes describe a neutral base recipe; allocation between people belongs to meal plans.
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS preparation_type text NOT NULL DEFAULT 'INDIVIDUAL';
UPDATE recipes SET preparation_type = 'INDIVIDUAL'
WHERE preparation_type IS NULL OR preparation_type NOT IN ('INDIVIDUAL', 'BATCH');
ALTER TABLE recipes ALTER COLUMN preparation_type SET DEFAULT 'INDIVIDUAL';
