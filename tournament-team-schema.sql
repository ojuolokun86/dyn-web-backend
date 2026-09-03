-- Additive team/category model for Phase 3. Legacy tournament tables remain intact.

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

ALTER TABLE tournament_registrations
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_team ON tournament_registrations(team_id);

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'custom' CHECK (source_type IN ('league_category', 'custom')),
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES league_categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tournaments_category ON tournaments(category_id);
