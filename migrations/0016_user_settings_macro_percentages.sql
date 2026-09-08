ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "target_protein_percentage" integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "target_carbs_percentage" integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS "target_fat_percentage" integer NOT NULL DEFAULT 30;

UPDATE "user_settings"
SET
  "target_protein_percentage" = CASE
    WHEN "target_calories" > 0 THEN ROUND(("target_protein" * 4.0 / "target_calories") * 100)::integer
    ELSE 0
  END,
  "target_carbs_percentage" = CASE
    WHEN "target_calories" > 0 THEN ROUND(("target_carbs" * 4.0 / "target_calories") * 100)::integer
    ELSE 0
  END,
  "target_fat_percentage" = CASE
    WHEN "target_calories" > 0 THEN ROUND(("target_fat" * 9.0 / "target_calories") * 100)::integer
    ELSE 0
  END
WHERE
  "target_protein_percentage" = 30
  AND "target_carbs_percentage" = 40
  AND "target_fat_percentage" = 30;
