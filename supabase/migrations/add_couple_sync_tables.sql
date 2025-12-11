-- Migration: Add couple sync tables
-- Description: Tables for real-time sync between paired couples
-- Date: 2025-12-11

-- 1. Couple shared missions (stores generated missions for both users)
CREATE TABLE IF NOT EXISTS couple_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  missions JSONB NOT NULL,  -- Array of 3 generated missions
  generation_answers JSONB, -- Answers used for generation (canMeetToday, availableTime, moods)
  generated_by UUID NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,  -- Next midnight
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup by couple and date
CREATE INDEX IF NOT EXISTS idx_couple_missions_couple_id ON couple_missions(couple_id);
CREATE INDEX IF NOT EXISTS idx_couple_missions_expires_at ON couple_missions(expires_at);

-- 2. Mission generation lock (prevents simultaneous generation)
CREATE TABLE IF NOT EXISTS mission_generation_lock (
  couple_id UUID PRIMARY KEY REFERENCES couples(id) ON DELETE CASCADE,
  locked_by UUID,
  locked_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'generating', 'completed')),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Couple shared bookmarks
CREATE TABLE IF NOT EXISTS couple_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL,  -- Original mission ID
  mission_data JSONB NOT NULL,  -- Full mission object
  bookmarked_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(couple_id, mission_id)  -- Prevent duplicate bookmarks
);

CREATE INDEX IF NOT EXISTS idx_couple_bookmarks_couple_id ON couple_bookmarks(couple_id);

-- 4. Couple shared todos
CREATE TABLE IF NOT EXISTS couple_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_by UUID NOT NULL,
  completed_by UUID,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_couple_todos_couple_id ON couple_todos(couple_id);
CREATE INDEX IF NOT EXISTS idx_couple_todos_date ON couple_todos(couple_id, date);

-- 5. Menstrual calendar settings
CREATE TABLE IF NOT EXISTS menstrual_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID UNIQUE NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT FALSE,
  last_period_date DATE,
  cycle_length INTEGER DEFAULT 28,
  period_length INTEGER DEFAULT 5,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Auto-update updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_couple_todos_updated_at
  BEFORE UPDATE ON couple_todos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menstrual_settings_updated_at
  BEFORE UPDATE ON menstrual_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mission_generation_lock_updated_at
  BEFORE UPDATE ON mission_generation_lock
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies (Row Level Security)
ALTER TABLE couple_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_generation_lock ENABLE ROW LEVEL SECURITY;
ALTER TABLE couple_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE couple_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE menstrual_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own couple's data
-- couple_missions policies
CREATE POLICY "Users can view their couple's missions"
  ON couple_missions FOR SELECT
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert missions for their couple"
  ON couple_missions FOR INSERT
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their couple's missions"
  ON couple_missions FOR UPDATE
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

-- mission_generation_lock policies
CREATE POLICY "Users can view their couple's lock"
  ON mission_generation_lock FOR SELECT
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert lock for their couple"
  ON mission_generation_lock FOR INSERT
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their couple's lock"
  ON mission_generation_lock FOR UPDATE
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

-- couple_bookmarks policies
CREATE POLICY "Users can view their couple's bookmarks"
  ON couple_bookmarks FOR SELECT
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert bookmarks for their couple"
  ON couple_bookmarks FOR INSERT
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their couple's bookmarks"
  ON couple_bookmarks FOR DELETE
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

-- couple_todos policies
CREATE POLICY "Users can view their couple's todos"
  ON couple_todos FOR SELECT
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert todos for their couple"
  ON couple_todos FOR INSERT
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their couple's todos"
  ON couple_todos FOR UPDATE
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their couple's todos"
  ON couple_todos FOR DELETE
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

-- menstrual_settings policies
CREATE POLICY "Users can view their couple's menstrual settings"
  ON menstrual_settings FOR SELECT
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert menstrual settings for their couple"
  ON menstrual_settings FOR INSERT
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their couple's menstrual settings"
  ON menstrual_settings FOR UPDATE
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

-- Enable realtime for all sync tables
ALTER PUBLICATION supabase_realtime ADD TABLE couple_missions;
ALTER PUBLICATION supabase_realtime ADD TABLE mission_generation_lock;
ALTER PUBLICATION supabase_realtime ADD TABLE couple_bookmarks;
ALTER PUBLICATION supabase_realtime ADD TABLE couple_todos;
ALTER PUBLICATION supabase_realtime ADD TABLE menstrual_settings;
