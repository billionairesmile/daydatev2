-- =====================================================
-- FIX ALL TABLES - Remove auth.users FK and add permissive RLS
-- Run this in Supabase SQL Editor
-- =====================================================

-- ============ 1. CREATE MISSING TABLES ============

-- couple_settings (배경화면)
CREATE TABLE IF NOT EXISTS couple_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID UNIQUE NOT NULL,
  background_image_url TEXT,
  updated_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- couple_albums (앨범)
CREATE TABLE IF NOT EXISTS couple_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL,
  name TEXT NOT NULL,
  cover_photo_url TEXT,
  name_position JSONB DEFAULT '{"x": 0.5, "y": 0.5}',
  text_scale REAL DEFAULT 1.0,
  font_style TEXT DEFAULT 'basic',
  ransom_seed INTEGER,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- album_photos (앨범 사진)
CREATE TABLE IF NOT EXISTS album_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  added_by UUID NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- mission_progress (미션 진행)
CREATE TABLE IF NOT EXISTS mission_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL,
  mission_id TEXT NOT NULL,
  mission_data JSONB NOT NULL,
  photo_url TEXT,
  user1_id UUID NOT NULL,
  user1_message TEXT,
  user1_message_at TIMESTAMP WITH TIME ZONE,
  user2_id UUID,
  user2_message TEXT,
  user2_message_at TIMESTAMP WITH TIME ZONE,
  started_by UUID NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'photo_pending',
  location TEXT,
  date DATE DEFAULT CURRENT_DATE
);

-- couple_missions (커플 미션)
CREATE TABLE IF NOT EXISTS couple_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL,
  missions JSONB NOT NULL,
  generation_answers JSONB,
  generated_by UUID NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- mission_generation_lock
CREATE TABLE IF NOT EXISTS mission_generation_lock (
  couple_id UUID PRIMARY KEY,
  locked_by UUID,
  locked_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'idle',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- couple_bookmarks
CREATE TABLE IF NOT EXISTS couple_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL,
  mission_id TEXT NOT NULL,
  mission_data JSONB NOT NULL,
  bookmarked_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- couple_todos
CREATE TABLE IF NOT EXISTS couple_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL,
  date DATE NOT NULL,
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_by UUID NOT NULL,
  completed_by UUID,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- menstrual_settings
CREATE TABLE IF NOT EXISTS menstrual_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT FALSE,
  last_period_date DATE,
  cycle_length INTEGER DEFAULT 28,
  period_length INTEGER DEFAULT 5,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- completed_missions (추억)
CREATE TABLE IF NOT EXISTS completed_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL,
  mission_id UUID,
  mission_data JSONB,
  photo_url TEXT,
  user1_message TEXT,
  user2_message TEXT,
  location TEXT,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============ 2. REMOVE ALL FK CONSTRAINTS ============
-- (These may fail if constraint doesn't exist - that's OK)

ALTER TABLE couple_settings DROP CONSTRAINT IF EXISTS couple_settings_updated_by_fkey;
ALTER TABLE couple_settings DROP CONSTRAINT IF EXISTS couple_settings_couple_id_fkey;
ALTER TABLE couple_albums DROP CONSTRAINT IF EXISTS couple_albums_created_by_fkey;
ALTER TABLE couple_albums DROP CONSTRAINT IF EXISTS couple_albums_couple_id_fkey;
ALTER TABLE album_photos DROP CONSTRAINT IF EXISTS album_photos_added_by_fkey;
ALTER TABLE album_photos DROP CONSTRAINT IF EXISTS album_photos_album_id_fkey;
ALTER TABLE album_photos DROP CONSTRAINT IF EXISTS album_photos_memory_id_fkey;
ALTER TABLE mission_progress DROP CONSTRAINT IF EXISTS mission_progress_user1_id_fkey;
ALTER TABLE mission_progress DROP CONSTRAINT IF EXISTS mission_progress_user2_id_fkey;
ALTER TABLE mission_progress DROP CONSTRAINT IF EXISTS mission_progress_started_by_fkey;
ALTER TABLE mission_progress DROP CONSTRAINT IF EXISTS mission_progress_couple_id_fkey;
ALTER TABLE couple_missions DROP CONSTRAINT IF EXISTS couple_missions_couple_id_fkey;
ALTER TABLE mission_generation_lock DROP CONSTRAINT IF EXISTS mission_generation_lock_couple_id_fkey;
ALTER TABLE couple_bookmarks DROP CONSTRAINT IF EXISTS couple_bookmarks_couple_id_fkey;
ALTER TABLE couple_todos DROP CONSTRAINT IF EXISTS couple_todos_couple_id_fkey;
ALTER TABLE menstrual_settings DROP CONSTRAINT IF EXISTS menstrual_settings_couple_id_fkey;
ALTER TABLE completed_missions DROP CONSTRAINT IF EXISTS completed_missions_couple_id_fkey;
ALTER TABLE completed_missions DROP CONSTRAINT IF EXISTS completed_missions_mission_id_fkey;

-- ============ 3. ENABLE RLS AND DROP OLD POLICIES ============

ALTER TABLE couple_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE couple_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE couple_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_generation_lock ENABLE ROW LEVEL SECURITY;
ALTER TABLE couple_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE couple_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE menstrual_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE completed_missions ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies (ignore errors if they don't exist)
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop policies for couple_settings
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'couple_settings' LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON couple_settings';
    END LOOP;
    -- Drop policies for couple_albums
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'couple_albums' LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON couple_albums';
    END LOOP;
    -- Drop policies for album_photos
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'album_photos' LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON album_photos';
    END LOOP;
    -- Drop policies for mission_progress
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'mission_progress' LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON mission_progress';
    END LOOP;
    -- Drop policies for couple_missions
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'couple_missions' LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON couple_missions';
    END LOOP;
    -- Drop policies for mission_generation_lock
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'mission_generation_lock' LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON mission_generation_lock';
    END LOOP;
    -- Drop policies for couple_bookmarks
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'couple_bookmarks' LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON couple_bookmarks';
    END LOOP;
    -- Drop policies for couple_todos
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'couple_todos' LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON couple_todos';
    END LOOP;
    -- Drop policies for menstrual_settings
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'menstrual_settings' LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON menstrual_settings';
    END LOOP;
    -- Drop policies for completed_missions
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'completed_missions' LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON completed_missions';
    END LOOP;
END $$;

-- ============ 4. CREATE PERMISSIVE POLICIES FOR ALL TABLES ============

-- couple_settings
CREATE POLICY "anon_all_couple_settings" ON couple_settings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_couple_settings" ON couple_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- couple_albums
CREATE POLICY "anon_all_couple_albums" ON couple_albums FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_couple_albums" ON couple_albums FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- album_photos
CREATE POLICY "anon_all_album_photos" ON album_photos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_album_photos" ON album_photos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- mission_progress
CREATE POLICY "anon_all_mission_progress" ON mission_progress FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_mission_progress" ON mission_progress FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- couple_missions
CREATE POLICY "anon_all_couple_missions" ON couple_missions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_couple_missions" ON couple_missions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- mission_generation_lock
CREATE POLICY "anon_all_mission_generation_lock" ON mission_generation_lock FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_mission_generation_lock" ON mission_generation_lock FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- couple_bookmarks
CREATE POLICY "anon_all_couple_bookmarks" ON couple_bookmarks FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_couple_bookmarks" ON couple_bookmarks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- couple_todos
CREATE POLICY "anon_all_couple_todos" ON couple_todos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_couple_todos" ON couple_todos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- menstrual_settings
CREATE POLICY "anon_all_menstrual_settings" ON menstrual_settings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_menstrual_settings" ON menstrual_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- completed_missions
CREATE POLICY "anon_all_completed_missions" ON completed_missions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_completed_missions" ON completed_missions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ 5. CREATE INDEXES ============

CREATE INDEX IF NOT EXISTS idx_couple_settings_couple ON couple_settings(couple_id);
CREATE INDEX IF NOT EXISTS idx_couple_albums_couple ON couple_albums(couple_id);
CREATE INDEX IF NOT EXISTS idx_album_photos_album ON album_photos(album_id);
CREATE INDEX IF NOT EXISTS idx_couple_todos_couple_date ON couple_todos(couple_id, date);
CREATE INDEX IF NOT EXISTS idx_menstrual_settings_couple ON menstrual_settings(couple_id);
CREATE INDEX IF NOT EXISTS idx_completed_missions_couple ON completed_missions(couple_id);
CREATE INDEX IF NOT EXISTS idx_couple_missions_couple ON couple_missions(couple_id);

-- ============ 6. STORAGE BUCKETS ============

INSERT INTO storage.buckets (id, name, public)
VALUES ('memories', 'memories', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('backgrounds', 'backgrounds', true)
ON CONFLICT (id) DO UPDATE SET public = true;
