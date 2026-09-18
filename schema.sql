CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  telegram_user_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  goal TEXT NOT NULL,
  training_location TEXT NOT NULL,
  experience TEXT NOT NULL,
  program_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_goal_idx ON leads(goal);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads(created_at DESC);