-- ========================================
-- 빠른 DB 검증 쿼리 (5분 완성)
-- ========================================
-- Supabase Dashboard → SQL Editor에서 실행

-- ========================================
-- 1. 마이그레이션 체크리스트 (가장 중요!)
-- ========================================
SELECT
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'profiles' AND column_name = 'birth_date'
        ) THEN '✅'
        ELSE '❌'
    END || ' profiles.birth_date' as status

UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'location_latitude') THEN '✅' ELSE '❌' END || ' profiles.location_latitude'
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'location_longitude') THEN '✅' ELSE '❌' END || ' profiles.location_longitude'
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'location_city') THEN '✅' ELSE '❌' END || ' profiles.location_city'
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'location_district') THEN '✅' ELSE '❌' END || ' profiles.location_district'
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'couples' AND column_name = 'dating_start_date') THEN '✅' ELSE '❌' END || ' couples.dating_start_date'
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'couples' AND column_name = 'wedding_date') THEN '✅' ELSE '❌' END || ' couples.wedding_date'
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'featured_missions') THEN '✅' ELSE '❌' END || ' featured_missions table'
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'profiles' AND indexname = 'idx_profiles_location') THEN '✅' ELSE '❌' END || ' idx_profiles_location'
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'couples' AND indexname = 'idx_couples_dates') THEN '✅' ELSE '❌' END || ' idx_couples_dates'
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'featured_missions' AND indexname = 'idx_featured_missions_dates') THEN '✅' ELSE '❌' END || ' idx_featured_missions_dates'
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'featured_missions' AND indexname = 'idx_featured_missions_active') THEN '✅' ELSE '❌' END || ' idx_featured_missions_active';

-- 🎯 예상 결과: 모든 항목이 ✅ 체크 표시


-- ========================================
-- 2. 전체 테이블 목록
-- ========================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 🎯 예상 결과 (11개):
-- anniversaries
-- completed_missions
-- couples
-- daily_missions
-- featured_missions ← 새로 추가
-- kept_missions
-- mission_completions
-- missions
-- onboarding_answers
-- profiles
-- todos


-- ========================================
-- 3. profiles 테이블 컬럼 확인
-- ========================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;

-- 🎯 예상 결과:
-- id                    | uuid                     | NO
-- nickname              | text                     | YES
-- invite_code           | text                     | YES
-- preferences           | jsonb                    | YES
-- birth_date            | date                     | YES  ← 새로 추가
-- location_latitude     | double precision         | YES  ← 새로 추가
-- location_longitude    | double precision         | YES  ← 새로 추가
-- location_city         | text                     | YES  ← 새로 추가
-- location_district     | text                     | YES  ← 새로 추가
-- created_at            | timestamp with time zone | YES
-- updated_at            | timestamp with time zone | YES


-- ========================================
-- 4. couples 테이블 컬럼 확인
-- ========================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'couples'
ORDER BY ordinal_position;

-- 🎯 예상 결과:
-- id                    | uuid                     | NO
-- user1_id              | uuid                     | YES
-- user2_id              | uuid                     | YES
-- anniversary_date      | text                     | YES  (Legacy)
-- anniversary_type      | text                     | YES  (Legacy)
-- dating_start_date     | date                     | YES  ← 새로 추가
-- wedding_date          | date                     | YES  ← 새로 추가
-- status                | text                     | YES
-- created_at            | timestamp with time zone | YES
-- updated_at            | timestamp with time zone | YES


-- ========================================
-- 5. featured_missions 테이블 컬럼 확인
-- ========================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'featured_missions'
ORDER BY ordinal_position;

-- 🎯 예상 결과:
-- id                | uuid                     | NO  | gen_random_uuid()
-- mission_id        | uuid                     | YES | NULL
-- title             | text                     | YES | NULL
-- description       | text                     | YES | NULL
-- category          | text                     | YES | NULL
-- difficulty        | integer                  | YES | NULL
-- duration          | text                     | YES | NULL
-- location_type     | text                     | YES | NULL
-- tags              | ARRAY                    | YES | NULL
-- icon              | text                     | YES | NULL
-- image_url         | text                     | YES | NULL
-- estimated_time    | integer                  | YES | NULL
-- start_date        | date                     | YES | NULL
-- end_date          | date                     | YES | NULL
-- is_active         | boolean                  | YES | true
-- priority          | integer                  | YES | 0
-- target_audience   | text                     | YES | 'all'::text
-- created_at        | timestamp with time zone | YES | now()
-- updated_at        | timestamp with time zone | YES | now()


-- ========================================
-- 6. 인덱스 확인
-- ========================================
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND tablename IN ('profiles', 'couples', 'featured_missions')
ORDER BY tablename, indexname;

-- 🎯 예상 결과:
-- couples           | couples_pkey             | PRIMARY KEY (id)
-- couples           | idx_couples_dates        | btree (dating_start_date, wedding_date)
-- featured_missions | featured_missions_pkey   | PRIMARY KEY (id)
-- featured_missions | idx_featured_missions_active | btree (is_active, priority DESC) WHERE is_active = true
-- featured_missions | idx_featured_missions_dates  | btree (start_date, end_date, is_active, priority DESC)
-- profiles          | profiles_pkey            | PRIMARY KEY (id)
-- profiles          | idx_profiles_location    | btree (location_latitude, location_longitude)


-- ========================================
-- 7. 활성 특별 미션 확인
-- ========================================
SELECT
    title,
    category,
    start_date,
    end_date,
    is_active,
    priority
FROM featured_missions
WHERE is_active = true
ORDER BY priority DESC;

-- 🎯 예상 결과:
-- 크리스마스 특별 데이트 | special | 2024-12-20 | 2024-12-26 | true | 90
-- (샘플 데이터가 있다면 표시됨)


-- ========================================
-- 8. RLS 정책 확인
-- ========================================
SELECT
    tablename,
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
    AND tablename = 'featured_missions'
ORDER BY policyname;

-- 🎯 예상 결과:
-- featured_missions | Anyone can view active featured missions | SELECT | (is_active = true)
-- featured_missions | Service role can manage featured missions | ALL | (auth.role() = 'service_role'::text)


-- ========================================
-- 9. 트리거 확인
-- ========================================
SELECT
    event_object_table,
    trigger_name,
    event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
    AND event_object_table = 'featured_missions'
ORDER BY trigger_name;

-- 🎯 예상 결과:
-- featured_missions | featured_missions_updated_at | UPDATE


-- ========================================
-- 10. 종합 상태 대시보드
-- ========================================
SELECT 'DB Tables' as category, COUNT(*)::text as count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'

UNION ALL SELECT 'Indexes', COUNT(*)::text
FROM pg_indexes WHERE schemaname = 'public'

UNION ALL SELECT 'Foreign Keys', COUNT(*)::text
FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public'

UNION ALL SELECT 'RLS Policies', COUNT(*)::text
FROM pg_policies WHERE schemaname = 'public'

UNION ALL SELECT 'Active Featured Missions', COUNT(*)::text
FROM featured_missions WHERE is_active = true

UNION ALL SELECT 'Total Profiles', COUNT(*)::text FROM profiles
UNION ALL SELECT 'Total Couples', COUNT(*)::text FROM couples;

-- 🎯 예상 결과:
-- DB Tables               | 11
-- Indexes                 | 15+
-- Foreign Keys            | 10+
-- RLS Policies            | 2+
-- Active Featured Missions| 1 (샘플 데이터)
-- Total Profiles          | (실제 사용자 수)
-- Total Couples           | (실제 커플 수)


-- ========================================
-- ✅ 모든 항목이 예상 결과와 일치하면 DB 준비 완료!
-- ========================================
