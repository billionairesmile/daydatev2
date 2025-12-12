-- =====================================================
-- COMPREHENSIVE RLS POLICIES FOR ALL TABLES
-- Run this in Supabase SQL Editor
-- =====================================================

-- ============ COUPLE_SETTINGS (배경화면 동기화) ============
ALTER TABLE IF EXISTS couple_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all couple_settings" ON couple_settings;
DROP POLICY IF EXISTS "Allow authenticated all couple_settings" ON couple_settings;

CREATE POLICY "Allow anon all couple_settings" ON couple_settings
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated all couple_settings" ON couple_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ COUPLE_TODOS (투두리스트) ============
ALTER TABLE IF EXISTS couple_todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all couple_todos" ON couple_todos;
DROP POLICY IF EXISTS "Allow authenticated all couple_todos" ON couple_todos;

CREATE POLICY "Allow anon all couple_todos" ON couple_todos
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated all couple_todos" ON couple_todos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ TODOS (기존 투두) ============
ALTER TABLE IF EXISTS todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all todos" ON todos;
DROP POLICY IF EXISTS "Allow authenticated all todos" ON todos;

CREATE POLICY "Allow anon all todos" ON todos
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated all todos" ON todos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ MENSTRUAL_SETTINGS (월경 캘린더) ============
ALTER TABLE IF EXISTS menstrual_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all menstrual_settings" ON menstrual_settings;
DROP POLICY IF EXISTS "Allow authenticated all menstrual_settings" ON menstrual_settings;

CREATE POLICY "Allow anon all menstrual_settings" ON menstrual_settings
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated all menstrual_settings" ON menstrual_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ COUPLE_ALBUMS (앨범) ============
ALTER TABLE IF EXISTS couple_albums ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all couple_albums" ON couple_albums;
DROP POLICY IF EXISTS "Allow authenticated all couple_albums" ON couple_albums;

CREATE POLICY "Allow anon all couple_albums" ON couple_albums
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated all couple_albums" ON couple_albums
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ ALBUM_PHOTOS (앨범 사진) ============
ALTER TABLE IF EXISTS album_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all album_photos" ON album_photos;
DROP POLICY IF EXISTS "Allow authenticated all album_photos" ON album_photos;

CREATE POLICY "Allow anon all album_photos" ON album_photos
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated all album_photos" ON album_photos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ COMPLETED_MISSIONS (추억/완료된 미션) ============
ALTER TABLE IF EXISTS completed_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all completed_missions" ON completed_missions;
DROP POLICY IF EXISTS "Allow authenticated all completed_missions" ON completed_missions;

CREATE POLICY "Allow anon all completed_missions" ON completed_missions
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated all completed_missions" ON completed_missions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ COUPLE_MISSIONS (커플 미션) ============
ALTER TABLE IF EXISTS couple_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all couple_missions" ON couple_missions;
DROP POLICY IF EXISTS "Allow authenticated all couple_missions" ON couple_missions;

CREATE POLICY "Allow anon all couple_missions" ON couple_missions
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated all couple_missions" ON couple_missions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ COUPLE_BOOKMARKS (북마크) ============
ALTER TABLE IF EXISTS couple_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all couple_bookmarks" ON couple_bookmarks;
DROP POLICY IF EXISTS "Allow authenticated all couple_bookmarks" ON couple_bookmarks;

CREATE POLICY "Allow anon all couple_bookmarks" ON couple_bookmarks
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated all couple_bookmarks" ON couple_bookmarks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ MISSION_PROGRESS (미션 진행) ============
ALTER TABLE IF EXISTS mission_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all mission_progress" ON mission_progress;
DROP POLICY IF EXISTS "Allow authenticated all mission_progress" ON mission_progress;

CREATE POLICY "Allow anon all mission_progress" ON mission_progress
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated all mission_progress" ON mission_progress
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ MISSION_GENERATION_LOCK (미션 생성 잠금) ============
ALTER TABLE IF EXISTS mission_generation_lock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all mission_generation_lock" ON mission_generation_lock;
DROP POLICY IF EXISTS "Allow authenticated all mission_generation_lock" ON mission_generation_lock;

CREATE POLICY "Allow anon all mission_generation_lock" ON mission_generation_lock
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated all mission_generation_lock" ON mission_generation_lock
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ ANNIVERSARIES (기념일) ============
ALTER TABLE IF EXISTS anniversaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all anniversaries" ON anniversaries;
DROP POLICY IF EXISTS "Allow authenticated all anniversaries" ON anniversaries;

CREATE POLICY "Allow anon all anniversaries" ON anniversaries
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated all anniversaries" ON anniversaries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ DAILY_MISSIONS ============
ALTER TABLE IF EXISTS daily_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all daily_missions" ON daily_missions;
DROP POLICY IF EXISTS "Allow authenticated all daily_missions" ON daily_missions;

CREATE POLICY "Allow anon all daily_missions" ON daily_missions
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated all daily_missions" ON daily_missions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ MISSION_COMPLETIONS ============
ALTER TABLE IF EXISTS mission_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all mission_completions" ON mission_completions;
DROP POLICY IF EXISTS "Allow authenticated all mission_completions" ON mission_completions;

CREATE POLICY "Allow anon all mission_completions" ON mission_completions
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated all mission_completions" ON mission_completions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ ONBOARDING_ANSWERS ============
ALTER TABLE IF EXISTS onboarding_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all onboarding_answers" ON onboarding_answers;
DROP POLICY IF EXISTS "Allow authenticated all onboarding_answers" ON onboarding_answers;

CREATE POLICY "Allow anon all onboarding_answers" ON onboarding_answers
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated all onboarding_answers" ON onboarding_answers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ STORAGE BUCKET POLICIES (이미지 업로드) ============
-- Note: Run these separately if the bucket exists

-- For memories bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('memories', 'memories', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- For backgrounds bucket (if exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('backgrounds', 'backgrounds', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policies for memories bucket
DROP POLICY IF EXISTS "Allow public read memories" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon upload memories" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon update memories" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon delete memories" ON storage.objects;

CREATE POLICY "Allow public read memories" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'memories');

CREATE POLICY "Allow anon upload memories" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id IN ('memories', 'backgrounds'));

CREATE POLICY "Allow anon update memories" ON storage.objects
  FOR UPDATE TO anon USING (bucket_id IN ('memories', 'backgrounds'));

CREATE POLICY "Allow anon delete memories" ON storage.objects
  FOR DELETE TO anon USING (bucket_id IN ('memories', 'backgrounds'));

-- Storage policies for authenticated users
CREATE POLICY "Allow authenticated upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('memories', 'backgrounds'));

CREATE POLICY "Allow authenticated update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id IN ('memories', 'backgrounds'));

CREATE POLICY "Allow authenticated delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id IN ('memories', 'backgrounds'));
