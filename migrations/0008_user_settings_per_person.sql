ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "person" text NOT NULL DEFAULT 'A';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "user_settings"
    WHERE "person" = 'B'
  ) THEN
    INSERT INTO "user_settings" ("person", "target_calories", "target_protein", "target_carbs", "target_fat")
    SELECT 'B', "target_calories", "target_protein", "target_carbs", "target_fat"
    FROM "user_settings"
    WHERE "person" = 'A'
    ORDER BY "id"
    LIMIT 1;
  END IF;
END
$$;
