-- ============================================
-- Daydate DB Structure Validation Queries
-- Supabase SQL Editor에서 실행
-- ============================================

-- ============================================
-- 1. 테이블 존재 여부 확인
-- ============================================
SELECT '=== 1. TABLE EXISTENCE CHECK ===' as section;

SELECT
  table_name,
  CASE
    WHEN table_name IS NOT NULL THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    -- Core tables
    'profiles', 'couples', 'completed_missions',
    -- Phase 1 sync tables
    'couple_missions', 'mission_generation_lock', 'couple_bookmarks',
    'couple_todos', 'menstrual_settings',
    -- Phase 2 extended sync tables
    'couple_settings', 'mission_progress', 'couple_albums', 'album_photos',
    -- Other
    'featured_missions', 'missions'
  )
ORDER BY table_name;

-- 누락된 테이블 확인
SELECT '=== MISSING TABLES ===' as section;
SELECT unnest(ARRAY[
  'profiles', 'couples', 'completed_missions',
  'couple_missions', 'mission_generation_lock', 'couple_bookmarks',
  'couple_todos', 'menstrual_settings',
  'couple_settings', 'mission_progress', 'couple_albums', 'album_photos'
]) as expected_table
EXCEPT
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- ============================================
-- 2. 컬럼 구조 확인
-- ============================================
SELECT '=== 2. COLUMN STRUCTURE CHECK ===' as section;

-- couple_settings 컬럼
SELECT
  'couple_settings' as table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'couple_settings'
ORDER BY ordinal_position;

-- mission_progress 컬럼
SELECT
  'mission_progress' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'mission_progress'
ORDER BY ordinal_position;

-- couple_albums 컬럼
SELECT
  'couple_albums' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'couple_albums'
ORDER BY ordinal_position;

-- album_photos 컬럼
SELECT
  'album_photos' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'album_photos'
ORDER BY ordinal_position;

-- ============================================
-- 3. FOREIGN KEY 관계 확인
-- ============================================
SELECT '=== 3. FOREIGN KEY RELATIONSHIPS ===' as section;

SELECT
  tc.table_name as from_table,
  kcu.column_name as from_column,
  ccu.table_name as to_table,
  ccu.column_name as to_column,
  '✅' as status
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'couple_settings', 'mission_progress', 'couple_albums', 'album_photos',
    'couple_missions', 'couple_bookmarks', 'couple_todos', 'menstrual_settings'
  )
ORDER BY tc.table_name, kcu.column_name;

-- ============================================
-- 4. 인덱스 확인
-- ============================================
SELECT '=== 4. INDEX CHECK ===' as section;

SELECT
  tablename as table_name,
  indexname as index_name,
  indexdef as definition
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'couple_settings', 'mission_progress', 'couple_albums', 'album_photos',
    'couple_missions', 'couple_bookmarks', 'couple_todos', 'menstrual_settings'
  )
ORDER BY tablename, indexname;

-- ============================================
-- 5. RLS 정책 확인
-- ============================================
SELECT '=== 5. RLS POLICIES CHECK ===' as section;

-- RLS 활성화 여부
SELECT
  relname as table_name,
  CASE WHEN relrowsecurity THEN '✅ ENABLED' ELSE '❌ DISABLED' END as rls_status
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN (
    'couple_settings', 'mission_progress', 'couple_albums', 'album_photos',
    'couple_missions', 'couple_bookmarks', 'couple_todos', 'menstrual_settings'
  )
ORDER BY relname;

-- 정책 목록
SELECT
  schemaname,
  tablename as table_name,
  policyname as policy_name,
  cmd as operation,
  '✅' as status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'couple_settings', 'mission_progress', 'couple_albums', 'album_photos',
    'couple_missions', 'couple_bookmarks', 'couple_todos', 'menstrual_settings'
  )
ORDER BY tablename, cmd;

-- ============================================
-- 6. REALTIME 구독 확인
-- ============================================
SELECT '=== 6. REALTIME SUBSCRIPTION CHECK ===' as section;

SELECT
  schemaname,
  tablename,
  '✅ REALTIME ENABLED' as status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN (
    'couple_settings', 'mission_progress', 'couple_albums', 'album_photos',
    'couple_missions', 'couple_bookmarks', 'couple_todos', 'menstrual_settings'
  )
ORDER BY tablename;

-- Realtime 누락 테이블
SELECT '=== MISSING REALTIME TABLES ===' as section;
SELECT unnest(ARRAY[
  'couple_settings', 'mission_progress', 'couple_albums', 'album_photos',
  'couple_missions', 'couple_bookmarks', 'couple_todos', 'menstrual_settings'
]) as expected_table
EXCEPT
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- ============================================
-- 7. 트리거 확인
-- ============================================
SELECT '=== 7. TRIGGER CHECK ===' as section;

SELECT
  event_object_table as table_name,
  trigger_name,
  event_manipulation as event,
  action_timing as timing,
  '✅' as status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN (
    'couple_settings', 'mission_progress', 'couple_albums', 'album_photos',
    'couple_todos', 'menstrual_settings', 'mission_generation_lock'
  )
ORDER BY event_object_table;

-- ============================================
-- 8. UNIQUE 제약 조건 확인
-- ============================================
SELECT '=== 8. UNIQUE CONSTRAINTS CHECK ===' as section;

SELECT
  tc.table_name,
  tc.constraint_name,
  string_agg(kcu.column_name, ', ') as columns,
  '✅' as status
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'couple_settings', 'mission_progress', 'couple_albums', 'album_photos',
    'couple_missions', 'couple_bookmarks', 'couple_todos', 'menstrual_settings'
  )
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name;

-- ============================================
-- 9. CHECK 제약 조건 확인
-- ============================================
SELECT '=== 9. CHECK CONSTRAINTS ===' as section;

SELECT
  tc.table_name,
  tc.constraint_name,
  cc.check_clause,
  '✅' as status
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.constraint_type = 'CHECK'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'mission_progress', 'mission_generation_lock', 'couple_missions'
  )
ORDER BY tc.table_name;

-- ============================================
-- 10. 요약 리포트
-- ============================================
SELECT '=== 10. SUMMARY REPORT ===' as section;

WITH table_check AS (
  SELECT COUNT(*) as cnt FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('couple_settings', 'mission_progress', 'couple_albums', 'album_photos',
                     'couple_missions', 'couple_bookmarks', 'couple_todos', 'menstrual_settings')
),
rls_check AS (
  SELECT COUNT(*) as cnt FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
  AND relrowsecurity = true
  AND relname IN ('couple_settings', 'mission_progress', 'couple_albums', 'album_photos',
                  'couple_missions', 'couple_bookmarks', 'couple_todos', 'menstrual_settings')
),
realtime_check AS (
  SELECT COUNT(*) as cnt FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
  AND tablename IN ('couple_settings', 'mission_progress', 'couple_albums', 'album_photos',
                    'couple_missions', 'couple_bookmarks', 'couple_todos', 'menstrual_settings')
),
policy_check AS (
  SELECT COUNT(DISTINCT tablename) as cnt FROM pg_policies
  WHERE schemaname = 'public'
  AND tablename IN ('couple_settings', 'mission_progress', 'couple_albums', 'album_photos',
                    'couple_missions', 'couple_bookmarks', 'couple_todos', 'menstrual_settings')
)
SELECT
  'Tables Created' as check_item,
  t.cnt || ' / 8' as result,
  CASE WHEN t.cnt = 8 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM table_check t
UNION ALL
SELECT
  'RLS Enabled',
  r.cnt || ' / 8',
  CASE WHEN r.cnt = 8 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM rls_check r
UNION ALL
SELECT
  'Realtime Enabled',
  rt.cnt || ' / 8',
  CASE WHEN rt.cnt = 8 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM realtime_check rt
UNION ALL
SELECT
  'RLS Policies',
  p.cnt || ' / 8 tables',
  CASE WHEN p.cnt = 8 THEN '✅ PASS' ELSE '⚠️ CHECK' END
FROM policy_check p;

-- ============================================
-- 11. 샘플 데이터 테스트 (선택적)
-- ============================================
-- 아래 쿼리는 실제 couple_id가 있을 때만 실행
-- 테스트 후 롤백 권장

/*
-- 테스트용 INSERT (트랜잭션으로 감싸서 롤백)
BEGIN;

-- couple_settings 테스트
INSERT INTO couple_settings (couple_id, background_image_url)
VALUES ('YOUR_COUPLE_ID_HERE', 'https://test.com/image.jpg')
ON CONFLICT (couple_id) DO UPDATE SET background_image_url = EXCLUDED.background_image_url;

-- 확인
SELECT * FROM couple_settings WHERE couple_id = 'YOUR_COUPLE_ID_HERE';

-- 롤백
ROLLBACK;
*/
