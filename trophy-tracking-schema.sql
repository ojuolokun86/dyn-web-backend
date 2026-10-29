CREATE TABLE IF NOT EXISTS trophy_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  points NUMERIC NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO trophy_categories (name, points)
SELECT DISTINCT league, 0
FROM hall_of_fame_web
WHERE league IS NOT NULL AND trim(league) <> ''
ON CONFLICT (name) DO NOTHING;

ALTER TABLE hall_of_fame_web
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE hall_of_fame_web
  ADD COLUMN IF NOT EXISTS awarded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE hall_of_fame_web
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES contender_profiles(id);

UPDATE hall_of_fame_web
SET awarded_at = created_at
WHERE awarded_at IS NULL;

UPDATE events
SET ended_at = updated_at
WHERE ended_at IS NULL
  AND status IN ('closed', 'winner_announced');

ALTER TABLE point_tables
  ADD COLUMN IF NOT EXISTS trophy_category_id UUID REFERENCES trophy_categories(id) ON DELETE SET NULL;
ALTER TABLE contender_point_records
  ADD COLUMN IF NOT EXISTS hall_of_fame_entry_id UUID REFERENCES hall_of_fame_web(id) ON DELETE CASCADE;

ALTER TABLE point_tables
  ALTER COLUMN default_points TYPE NUMERIC USING default_points::numeric;
ALTER TABLE contender_vote_records
  ALTER COLUMN points_awarded TYPE NUMERIC USING points_awarded::numeric;
ALTER TABLE contender_point_records
  ALTER COLUMN points_awarded TYPE NUMERIC USING points_awarded::numeric;
ALTER TABLE contenders
  ADD COLUMN IF NOT EXISTS total_points NUMERIC DEFAULT 0;
ALTER TABLE contenders
  ALTER COLUMN total_points TYPE NUMERIC USING COALESCE(total_points, 0)::numeric;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contender_point_records_hof_entry
  ON contender_point_records(hall_of_fame_entry_id)
  WHERE hall_of_fame_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hall_of_fame_web_event ON hall_of_fame_web(event_id);
CREATE INDEX IF NOT EXISTS idx_hall_of_fame_web_awarded_at ON hall_of_fame_web(awarded_at);
