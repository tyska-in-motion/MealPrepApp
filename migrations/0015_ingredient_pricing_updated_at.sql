ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS pricing_updated_at timestamp DEFAULT NOW();

UPDATE ingredients
SET pricing_updated_at = NOW()
WHERE pricing_updated_at IS NULL;

ALTER TABLE ingredients
  ALTER COLUMN pricing_updated_at SET NOT NULL,
  ALTER COLUMN pricing_updated_at SET DEFAULT NOW();
