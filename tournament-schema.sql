-- Additive Phase 2 schema. Existing events and voting tables are unchanged.

CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  registration_opens_at TIMESTAMP WITH TIME ZONE,
  registration_closes_at TIMESTAMP WITH TIME ZONE,
  starts_at TIMESTAMP WITH TIME ZONE,
  ends_at TIMESTAMP WITH TIME ZONE,
  participant_limit INT NOT NULL CHECK (participant_limit >= 2),
  tournament_type TEXT NOT NULL DEFAULT 'single_elimination' CHECK (tournament_type IN ('single_elimination')),
  prize_info TEXT,
  rules TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'registration', 'draw', 'in_progress', 'completed', 'cancelled')),
  winner_participant_id UUID,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournament_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  participant_name TEXT NOT NULL,
  email TEXT NOT NULL,
  team_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tournament_id, email)
);

CREATE TABLE IF NOT EXISTS tournament_rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('knockout', 'quarter-final', 'semi-final', 'final')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed')),
  UNIQUE (tournament_id, round_number)
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES tournament_rounds(id) ON DELETE CASCADE,
  match_number INT NOT NULL,
  participant_a_id UUID REFERENCES tournament_registrations(id) ON DELETE SET NULL,
  participant_b_id UUID REFERENCES tournament_registrations(id) ON DELETE SET NULL,
  winner_id UUID REFERENCES tournament_registrations(id) ON DELETE SET NULL,
  next_match_id UUID REFERENCES tournament_matches(id) ON DELETE SET NULL,
  next_slot TEXT CHECK (next_slot IN ('a', 'b')),
  score_a INT CHECK (score_a IS NULL OR score_a >= 0),
  score_b INT CHECK (score_b IS NULL OR score_b >= 0),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'disputed')),
  deadline TIMESTAMP WITH TIME ZONE,
  dispute_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (round_id, match_number)
);

CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_tournament ON tournament_registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(round_id);

-- Keep existing installations aligned with the website approval workflow.
ALTER TABLE tournament_registrations ALTER COLUMN status SET DEFAULT 'pending';
