-- Extended Couple Sync Tables
-- Enables real-time sync for: background images, mission progress, custom albums

-- ============================================
-- 1. COUPLE SETTINGS (Background image sync)
-- ============================================
CREATE TABLE IF NOT EXISTS couple_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID UNIQUE NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  background_image_url TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for couple_settings
ALTER TABLE couple_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their couple settings"
  ON couple_settings FOR SELECT
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their couple settings"
  ON couple_settings FOR INSERT
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their couple settings"
  ON couple_settings FOR UPDATE
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

-- ============================================
-- 2. MISSION PROGRESS (Real-time mission sync)
-- ============================================
CREATE TABLE IF NOT EXISTS mission_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL,
  mission_data JSONB NOT NULL,
  photo_url TEXT,

  -- User 1 (started the mission)
  user1_id UUID NOT NULL REFERENCES auth.users(id),
  user1_message TEXT,
  user1_message_at TIMESTAMP WITH TIME ZONE,

  -- User 2 (partner)
  user2_id UUID REFERENCES auth.users(id),
  user2_message TEXT,
  user2_message_at TIMESTAMP WITH TIME ZONE,

  -- Mission state
  started_by UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'photo_pending' CHECK (status IN ('photo_pending', 'message_pending', 'waiting_partner', 'completed')),

  -- Additional data
  location TEXT,
  date DATE DEFAULT CURRENT_DATE,

  -- One active mission per couple per day
  UNIQUE(couple_id, date)
);

-- RLS for mission_progress
ALTER TABLE mission_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their couple mission progress"
  ON mission_progress FOR SELECT
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert mission progress"
  ON mission_progress FOR INSERT
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their couple mission progress"
  ON mission_progress FOR UPDATE
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their couple mission progress"
  ON mission_progress FOR DELETE
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

-- Index for efficient queries
CREATE INDEX idx_mission_progress_couple_date ON mission_progress(couple_id, date);
CREATE INDEX idx_mission_progress_status ON mission_progress(status);

-- ============================================
-- 3. COUPLE ALBUMS (User-created albums)
-- ============================================
CREATE TABLE IF NOT EXISTS couple_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cover_photo_url TEXT,
  name_position JSONB DEFAULT '{"x": 0.5, "y": 0.5}',
  text_scale REAL DEFAULT 1.0,
  font_style TEXT DEFAULT 'basic',
  ransom_seed INTEGER,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for couple_albums
ALTER TABLE couple_albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their couple albums"
  ON couple_albums FOR SELECT
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert albums"
  ON couple_albums FOR INSERT
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their couple albums"
  ON couple_albums FOR UPDATE
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their couple albums"
  ON couple_albums FOR DELETE
  USING (
    couple_id IN (
      SELECT id FROM couples
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

-- Index for efficient queries
CREATE INDEX idx_couple_albums_couple ON couple_albums(couple_id);

-- ============================================
-- 4. ALBUM PHOTOS (Junction table)
-- ============================================
CREATE TABLE IF NOT EXISTS album_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES couple_albums(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES completed_missions(id) ON DELETE CASCADE,
  added_by UUID NOT NULL REFERENCES auth.users(id),
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(album_id, memory_id)
);

-- RLS for album_photos
ALTER TABLE album_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view album photos"
  ON album_photos FOR SELECT
  USING (
    album_id IN (
      SELECT id FROM couple_albums WHERE couple_id IN (
        SELECT id FROM couples
        WHERE user1_id = auth.uid() OR user2_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert album photos"
  ON album_photos FOR INSERT
  WITH CHECK (
    album_id IN (
      SELECT id FROM couple_albums WHERE couple_id IN (
        SELECT id FROM couples
        WHERE user1_id = auth.uid() OR user2_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete album photos"
  ON album_photos FOR DELETE
  USING (
    album_id IN (
      SELECT id FROM couple_albums WHERE couple_id IN (
        SELECT id FROM couples
        WHERE user1_id = auth.uid() OR user2_id = auth.uid()
      )
    )
  );

-- Index for efficient queries
CREATE INDEX idx_album_photos_album ON album_photos(album_id);
CREATE INDEX idx_album_photos_memory ON album_photos(memory_id);

-- ============================================
-- 5. ENABLE REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE couple_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE mission_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE couple_albums;
ALTER PUBLICATION supabase_realtime ADD TABLE album_photos;

-- ============================================
-- 6. UPDATED_AT TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_couple_settings_updated_at
  BEFORE UPDATE ON couple_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_couple_albums_updated_at
  BEFORE UPDATE ON couple_albums
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
