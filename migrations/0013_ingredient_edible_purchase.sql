ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS edible_percentage real NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS increase_purchase_for_waste boolean NOT NULL DEFAULT false;

UPDATE ingredients
SET edible_percentage = 100
WHERE edible_percentage IS NULL OR edible_percentage <= 0;
