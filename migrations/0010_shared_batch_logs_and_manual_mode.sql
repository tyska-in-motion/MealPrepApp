ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS shared_batches_manual_only boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS shared_meal_batch_logs (
  id serial PRIMARY KEY,
  batch_id integer NOT NULL,
  action text NOT NULL,
  payload jsonb,
  created_at timestamp DEFAULT now()
);
