ALTER TABLE "ingredients"
  ADD COLUMN IF NOT EXISTS "use_soon" boolean NOT NULL DEFAULT false;
