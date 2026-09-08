ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "target_protein_percentage_min" integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "target_protein_percentage_max" integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "target_carbs_percentage_min" integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS "target_carbs_percentage_max" integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS "target_fat_percentage_min" integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "target_fat_percentage_max" integer NOT NULL DEFAULT 30;

UPDATE "user_settings"
SET
  "target_protein_percentage_min" = "target_protein_percentage",
  "target_protein_percentage_max" = "target_protein_percentage",
  "target_carbs_percentage_min" = "target_carbs_percentage",
  "target_carbs_percentage_max" = "target_carbs_percentage",
  "target_fat_percentage_min" = "target_fat_percentage",
  "target_fat_percentage_max" = "target_fat_percentage";

ALTER TABLE "user_settings_history"
  ADD COLUMN IF NOT EXISTS "target_protein_percentage_min" integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "target_protein_percentage_max" integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "target_carbs_percentage_min" integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS "target_carbs_percentage_max" integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS "target_fat_percentage_min" integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "target_fat_percentage_max" integer NOT NULL DEFAULT 30;

UPDATE "user_settings_history"
SET
  "target_protein_percentage_min" = "target_protein_percentage",
  "target_protein_percentage_max" = "target_protein_percentage",
  "target_carbs_percentage_min" = "target_carbs_percentage",
  "target_carbs_percentage_max" = "target_carbs_percentage",
  "target_fat_percentage_min" = "target_fat_percentage",
  "target_fat_percentage_max" = "target_fat_percentage";
