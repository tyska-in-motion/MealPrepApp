ALTER TABLE recipes
ADD COLUMN IF NOT EXISTS instruction_steps jsonb;
