-- Additive Phase 3 schema. Existing Phase 2 tables and legacy event tables remain intact.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS format_config JSONB NOT NULL DEFAULT '{"format":"knockout"}'::jsonb;

ALTER TABLE tournament_fixtures
  DROP CONSTRAINT IF EXISTS tournament_fixtures_stage_check;
ALTER TABLE tournament_fixtures
  ADD CONSTRAINT tournament_fixtures_stage_check
  CHECK (stage IN ('group', 'league', 'league_phase', 'playoff'));

CREATE TABLE IF NOT EXISTS tournament_formats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL UNIQUE REFERENCES tournaments(id) ON DELETE CASCADE,
  format_type TEXT NOT NULL CHECK (format_type IN ('knockout', 'league', 'group_knockout', 'league_phase_knockout')),
  participant_count INT NOT NULL CHECK (participant_count >= 2),
  group_count INT CHECK (group_count IS NULL OR group_count >= 1),
  teams_per_group INT CHECK (teams_per_group IS NULL OR teams_per_group >= 2),
  matches_per_team INT CHECK (matches_per_team IS NULL OR matches_per_team >= 1),
  home_away BOOLEAN NOT NULL DEFAULT FALSE,
  seeded_pots INT CHECK (seeded_pots IS NULL OR seeded_pots >= 1),
  teams_per_pot INT CHECK (teams_per_pot IS NULL OR teams_per_pot >= 1),
  direct_qualifiers INT NOT NULL DEFAULT 0 CHECK (direct_qualifiers >= 0),
  playoff_qualifiers INT NOT NULL DEFAULT 0 CHECK (playoff_qualifiers >= 0),
  qualification_bands JSONB NOT NULL DEFAULT '[]'::jsonb,
  tie_breakers JSONB NOT NULL DEFAULT '["points", "goal_difference", "goals_for", "participant_id"]'::jsonb,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournament_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  group_number INT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('group', 'league_phase')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed')),
  UNIQUE (tournament_id, group_number)
);

CREATE TABLE IF NOT EXISTS tournament_group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES tournament_groups(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES tournament_registrations(id) ON DELETE CASCADE,
  seed INT,
  pot INT,
  UNIQUE (group_id, registration_id),
  UNIQUE (group_id, seed)
);

CREATE TABLE IF NOT EXISTS tournament_fixtures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  group_id UUID REFERENCES tournament_groups(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('group', 'league', 'league_phase', 'playoff')),
  round_number INT NOT NULL,
  home_registration_id UUID NOT NULL REFERENCES tournament_registrations(id) ON DELETE CASCADE,
  away_registration_id UUID NOT NULL REFERENCES tournament_registrations(id) ON DELETE CASCADE,
  home_score INT CHECK (home_score IS NULL OR home_score >= 0),
  away_score INT CHECK (away_score IS NULL OR away_score >= 0),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'disputed')),
  deadline TIMESTAMP WITH TIME ZONE,
  dispute_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CHECK (home_registration_id <> away_registration_id)
);

CREATE TABLE IF NOT EXISTS tournament_standings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  group_id UUID REFERENCES tournament_groups(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES tournament_registrations(id) ON DELETE CASCADE,
  played INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  draws INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  goals_for INT NOT NULL DEFAULT 0,
  goals_against INT NOT NULL DEFAULT 0,
  goal_difference INT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  rank INT,
  qualification_status TEXT,
  tie_break_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tournament_id, group_id, registration_id)
);

CREATE TABLE IF NOT EXISTS tournament_qualifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES tournament_registrations(id) ON DELETE CASCADE,
  source_group_id UUID REFERENCES tournament_groups(id) ON DELETE SET NULL,
  source_position INT NOT NULL,
  qualification_band TEXT NOT NULL,
  destination_stage TEXT,
  destination_slot TEXT,
  status TEXT NOT NULL DEFAULT 'qualified' CHECK (status IN ('qualified', 'playoff', 'eliminated')),
  UNIQUE (tournament_id, registration_id, source_group_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_formats_tournament ON tournament_formats(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_groups_tournament ON tournament_groups(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_fixtures_tournament ON tournament_fixtures(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_standings_tournament ON tournament_standings(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_qualifications_tournament ON tournament_qualifications(tournament_id);

-- Stable admin-managed team catalog and reusable competition relationships.
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  logo_url TEXT NOT NULL,
  email TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_name_ci ON teams (lower(name));

CREATE TABLE IF NOT EXISTS league_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_league_categories_name_ci ON league_categories (lower(name));

CREATE TABLE IF NOT EXISTS league_category_teams (
  category_id UUID NOT NULL REFERENCES league_categories(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  seed INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (category_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_category_teams_team ON league_category_teams(team_id);

CREATE TABLE IF NOT EXISTS tournament_teams (
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  seed INT,
  status TEXT NOT NULL DEFAULT 'selected' CHECK (status IN ('selected', 'approved', 'withdrawn')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_tournament_teams_team ON tournament_teams(team_id);

ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_team ON tournament_registrations(team_id);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'custom' CHECK (source_type IN ('league_category', 'custom'));
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES league_categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tournaments_category ON tournaments(category_id);
