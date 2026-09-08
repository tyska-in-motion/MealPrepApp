ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS package_size real DEFAULT 100,
  ADD COLUMN IF NOT EXISTS package_price real DEFAULT 0;

UPDATE ingredients
SET package_size = 100
WHERE package_size IS NULL OR package_size <= 0;

UPDATE ingredients
SET package_price = COALESCE(price, 0)
WHERE package_price IS NULL OR package_price <= 0;

UPDATE ingredients
SET price = ROUND(((package_price / NULLIF(package_size, 0)) * 100)::numeric, 4)::real
WHERE package_size > 0;

ALTER TABLE ingredients
  ALTER COLUMN package_size SET NOT NULL,
  ALTER COLUMN package_size SET DEFAULT 100,
  ALTER COLUMN package_price SET NOT NULL,
  ALTER COLUMN package_price SET DEFAULT 0;
