CREATE TABLE IF NOT EXISTS user_settings_history (
  id serial PRIMARY KEY,
  person text NOT NULL,
  effective_date date NOT NULL,
  target_calories integer NOT NULL,
  target_protein integer NOT NULL,
  target_carbs integer NOT NULL,
  target_fat integer NOT NULL,
  target_protein_percentage integer NOT NULL DEFAULT 30,
  target_carbs_percentage integer NOT NULL DEFAULT 40,
  target_fat_percentage integer NOT NULL DEFAULT 30,
  created_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_settings_history_person_effective_date_idx
  ON user_settings_history (person, effective_date);
