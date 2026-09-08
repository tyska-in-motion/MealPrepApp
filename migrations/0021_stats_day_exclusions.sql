CREATE TABLE IF NOT EXISTS stats_day_exclusions (
  date date PRIMARY KEY,
  reason text NOT NULL,
  updated_at timestamp DEFAULT now()
);
