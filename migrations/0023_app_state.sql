CREATE TABLE IF NOT EXISTS app_state (
  key text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp DEFAULT now()
);
