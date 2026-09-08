CREATE TABLE IF NOT EXISTS body_measurements (
  id serial PRIMARY KEY,
  person text NOT NULL,
  date date NOT NULL,
  weight real NOT NULL,
  waist real,
  chest real,
  arm real,
  thigh real,
  calf real,
  hips real,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS body_measurements_person_date_idx
  ON body_measurements (person, date);
