-- The 2s: 2-Man Team Modified Stableford Tournament
-- SHARED DATABASE — all tables prefixed with the2s_ to avoid collisions
-- Run this in the existing Supabase SQL editor (same project as Masters pool)

-- Config (single row)
CREATE TABLE the2s_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pool_locked boolean NOT NULL DEFAULT false,
  live_scoring boolean NOT NULL DEFAULT false,
  double_hole integer NOT NULL DEFAULT 0,
  course_name text NOT NULL DEFAULT '',
  tournament_name text NOT NULL DEFAULT 'The 2s'
);

INSERT INTO the2s_config (id) VALUES (1);

-- Teams
CREATE TABLE the2s_teams (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Users (players)
CREATE TABLE the2s_users (
  id text PRIMARY KEY,
  name text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL UNIQUE,
  admin boolean NOT NULL DEFAULT false,
  paid boolean NOT NULL DEFAULT false,
  pops integer NOT NULL DEFAULT 0 CHECK (pops >= 0 AND pops <= 36),
  team_id text REFERENCES the2s_teams(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Holes (18 holes)
CREATE TABLE the2s_holes (
  number integer PRIMARY KEY CHECK (number >= 1 AND number <= 18),
  par integer NOT NULL DEFAULT 4 CHECK (par >= 3 AND par <= 5),
  handicap integer NOT NULL UNIQUE CHECK (handicap >= 1 AND handicap <= 18)
);

-- Seed 18 holes with default pars and handicaps
INSERT INTO the2s_holes (number, par, handicap) VALUES
  (1, 4, 7),
  (2, 5, 11),
  (3, 4, 3),
  (4, 3, 15),
  (5, 4, 1),
  (6, 4, 9),
  (7, 4, 5),
  (8, 3, 17),
  (9, 4, 13),
  (10, 4, 8),
  (11, 4, 2),
  (12, 3, 16),
  (13, 5, 6),
  (14, 4, 4),
  (15, 5, 10),
  (16, 3, 18),
  (17, 4, 14),
  (18, 4, 12);

-- Scores (player scores per hole)
CREATE TABLE the2s_scores (
  user_id text NOT NULL REFERENCES the2s_users(id) ON DELETE CASCADE,
  hole_number integer NOT NULL REFERENCES the2s_holes(number),
  gross_score integer NOT NULL CHECK (gross_score >= 1 AND gross_score <= 15),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hole_number)
);

CREATE INDEX idx_the2s_scores_user ON the2s_scores(user_id);
CREATE INDEX idx_the2s_scores_hole ON the2s_scores(hole_number);

-- RLS policies (allow all via anon key)
ALTER TABLE the2s_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE the2s_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE the2s_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE the2s_holes ENABLE ROW LEVEL SECURITY;
ALTER TABLE the2s_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON the2s_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON the2s_teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON the2s_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON the2s_holes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON the2s_scores FOR ALL USING (true) WITH CHECK (true);
