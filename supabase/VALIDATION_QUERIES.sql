-- ========================================
-- Daydate Database Validation Queries
-- ========================================

-- ========================================
-- 1. 전체 테이블 목록 확인
-- ========================================
SELECT
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 예상 결과:
-- profiles, couples, missions, daily_missions, completed_missions,
-- onboarding_answers, anniversaries, todos, mission_completions,
-- kept_missions, featured_missions (총 11개 테이블)


-- ========================================
-- 2. profiles 테이블 검증
-- ========================================

-- 2-1. 컬럼 구조 확인
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;

-- 예상 결과:
-- id (uuid, NO)
-- nickname (text, YES)
-- invite_code (text, YES)
-- preferences (jsonb, YES)
-- birth_date (date, YES) ← 새로 추가
-- location_latitude (double precision, YES) ← 새로 추가
-- location_longitude (double precision, YES) ← 새로 추가
-- location_city (text, YES) ← 새로 추가
-- location_district (text, YES) ← 새로 추가
-- created_at (timestamp with time zone, YES)
-- updated_at (timestamp with time zone, YES)

-- 2-2. 인덱스 확인
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'profiles';

-- 예상 결과:
-- profiles_pkey: PRIMARY KEY (id)
-- idx_profiles_location: btree (location_latitude, location_longitude)


-- ========================================
-- 3. couples 테이블 검증
-- ========================================

-- 3-1. 컬럼 구조 확인
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'couples'
ORDER BY ordinal_position;

-- 예상 결과:
-- id (uuid, NO)
-- user1_id (uuid, YES)
-- user2_id (uuid, YES)
-- anniversary_date (text, YES) ← Legacy
-- anniversary_type (text, YES) ← Legacy
-- dating_start_date (date, YES) ← 새로 추가
-- wedding_date (date, YES) ← 새로 추가
-- status (text, YES)
-- created_at (timestamp with time zone, YES)
-- updated_at (timestamp with time zone, YES)

-- 3-2. 인덱스 확인
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'couples';

-- 예상 결과:
-- couples_pkey: PRIMARY KEY (id)
-- idx_couples_dates: btree (dating_start_date, wedding_date)


-- ========================================
-- 4. featured_missions 테이블 검증
-- ========================================

-- 4-1. 컬럼 구조 확인
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'featured_missions'
ORDER BY ordinal_position;

-- 예상 결과:
-- id (uuid, NO, gen_random_uuid())
-- mission_id (uuid, YES)
-- title (text, YES)
-- description (text, YES)
-- category (text, YES)
-- difficulty (integer, YES)
-- duration (text, YES)
-- location_type (text, YES)
-- tags (ARRAY, YES)
-- icon (text, YES)
-- image_url (text, YES)
-- estimated_time (integer, YES)
-- start_date (date, YES)
-- end_date (date, YES)
-- is_active (boolean, YES, true)
-- priority (integer, YES, 0)
-- target_audience (text, YES, 'all')
-- created_at (timestamp with time zone, YES, now())
-- updated_at (timestamp with time zone, YES, now())

-- 4-2. 인덱스 확인
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'featured_missions';

-- 예상 결과:
-- featured_missions_pkey: PRIMARY KEY (id)
-- idx_featured_missions_dates: btree (start_date, end_date, is_active, priority DESC)
-- idx_featured_missions_active: btree (is_active, priority DESC) WHERE is_active = true


-- ========================================
-- 5. Foreign Key 관계 확인
-- ========================================
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- 예상 결과:
-- featured_missions.mission_id → missions.id (ON DELETE CASCADE)
-- daily_missions.couple_id → couples.id
-- daily_missions.mission_id → missions.id
-- completed_missions.couple_id → couples.id
-- completed_missions.mission_id → missions.id
-- mission_completions.daily_mission_id → daily_missions.id
-- etc.


-- ========================================
-- 6. RLS (Row Level Security) 정책 확인
-- ========================================
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 예상 결과 (featured_missions):
-- "Anyone can view active featured missions" (SELECT)
-- "Service role can manage featured missions" (ALL)


-- ========================================
-- 7. 트리거 확인
-- ========================================
SELECT
    event_object_table AS table_name,
    trigger_name,
    event_manipulation AS event,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 예상 결과:
-- featured_missions: featured_missions_updated_at (BEFORE UPDATE)


-- ========================================
-- 8. 데이터 무결성 검증
-- ========================================

-- 8-1. Profiles에 중복 invite_code 없는지 확인
SELECT
    invite_code,
    COUNT(*) as count
FROM profiles
GROUP BY invite_code
HAVING COUNT(*) > 1;

-- 예상 결과: 0 rows (중복 없음)

-- 8-2. Couples에서 user1_id와 user2_id가 같은 경우 없는지 확인
SELECT
    id,
    user1_id,
    user2_id
FROM couples
WHERE user1_id = user2_id;

-- 예상 결과: 0 rows (자기 자신과 페어링 없음)

-- 8-3. Featured missions에서 활성화된 미션 확인
SELECT
    title,
    start_date,
    end_date,
    is_active,
    priority
FROM featured_missions
WHERE is_active = true
ORDER BY priority DESC;

-- 예상 결과:
-- 활성화된 특별 미션 목록 (priority 높은 순)


-- ========================================
-- 9. 쿼리 성능 검증 (실제 사용될 쿼리)
-- ========================================

-- 9-1. 오늘 노출될 특별 미션 조회 (앱에서 실제 사용)
EXPLAIN ANALYZE
SELECT *
FROM featured_missions
WHERE is_active = true
  AND (start_date IS NULL OR start_date <= CURRENT_DATE)
  AND (end_date IS NULL OR end_date >= CURRENT_DATE)
ORDER BY priority DESC
LIMIT 2;

-- 예상 결과:
-- Index Scan using idx_featured_missions_active
-- Execution time: < 5ms

-- 9-2. 커플 정보 조회 (user_id로)
EXPLAIN ANALYZE
SELECT *
FROM couples
WHERE user1_id = 'sample-uuid' OR user2_id = 'sample-uuid'
LIMIT 1;

-- 예상 결과:
-- Seq Scan (인덱스 없음 - 필요시 추가 고려)
-- Execution time: < 10ms


-- ========================================
-- 10. 데이터 타입 검증
-- ========================================

-- 10-1. DATE 타입 필드에 올바른 형식 확인
SELECT
    'profiles.birth_date' as field,
    birth_date,
    birth_date::text as date_string
FROM profiles
WHERE birth_date IS NOT NULL
LIMIT 5;

SELECT
    'couples.dating_start_date' as field,
    dating_start_date,
    dating_start_date::text as date_string
FROM couples
WHERE dating_start_date IS NOT NULL
LIMIT 5;

-- 예상 결과: YYYY-MM-DD 형식

-- 10-2. ARRAY 타입 필드 확인
SELECT
    title,
    tags,
    array_length(tags, 1) as tag_count
FROM featured_missions
WHERE tags IS NOT NULL
LIMIT 5;

-- 예상 결과: tags는 TEXT[] 배열


-- ========================================
-- 11. 종합 상태 체크 (대시보드용)
-- ========================================
SELECT
    'Total Tables' as metric,
    COUNT(*)::text as value
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'

UNION ALL

SELECT
    'Total Indexes' as metric,
    COUNT(*)::text as value
FROM pg_indexes
WHERE schemaname = 'public'

UNION ALL

SELECT
    'Total Foreign Keys' as metric,
    COUNT(*)::text as value
FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY'
    AND table_schema = 'public'

UNION ALL

SELECT
    'Total RLS Policies' as metric,
    COUNT(*)::text as value
FROM pg_policies
WHERE schemaname = 'public'

UNION ALL

SELECT
    'Total Triggers' as metric,
    COUNT(*)::text as value
FROM information_schema.triggers
WHERE trigger_schema = 'public'

UNION ALL

SELECT
    'Featured Missions (Active)' as metric,
    COUNT(*)::text as value
FROM featured_missions
WHERE is_active = true

UNION ALL

SELECT
    'Profiles Count' as metric,
    COUNT(*)::text as value
FROM profiles

UNION ALL

SELECT
    'Couples Count' as metric,
    COUNT(*)::text as value
FROM couples;

-- 예상 결과:
-- Total Tables: 11
-- Total Indexes: 15+ (각 테이블마다 primary key + custom indexes)
-- Total Foreign Keys: 10+
-- Total RLS Policies: 2+ (featured_missions 정책)
-- Total Triggers: 1+ (featured_missions_updated_at)
-- Featured Missions (Active): 샘플 데이터 개수
-- Profiles Count: 실제 사용자 수
-- Couples Count: 실제 커플 수


-- ========================================
-- 12. 마이그레이션 검증 체크리스트
-- ========================================

-- 체크리스트 쿼리 (모든 필수 컬럼 존재 확인)
SELECT
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'profiles' AND column_name = 'birth_date'
        ) THEN '✅ profiles.birth_date exists'
        ELSE '❌ profiles.birth_date missing'
    END as status

UNION ALL

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'profiles' AND column_name = 'location_latitude'
        ) THEN '✅ profiles.location_latitude exists'
        ELSE '❌ profiles.location_latitude missing'
    END

UNION ALL

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'couples' AND column_name = 'dating_start_date'
        ) THEN '✅ couples.dating_start_date exists'
        ELSE '❌ couples.dating_start_date missing'
    END

UNION ALL

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'couples' AND column_name = 'wedding_date'
        ) THEN '✅ couples.wedding_date exists'
        ELSE '❌ couples.wedding_date missing'
    END

UNION ALL

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'featured_missions'
        ) THEN '✅ featured_missions table exists'
        ELSE '❌ featured_missions table missing'
    END

UNION ALL

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'profiles' AND indexname = 'idx_profiles_location'
        ) THEN '✅ idx_profiles_location exists'
        ELSE '❌ idx_profiles_location missing'
    END

UNION ALL

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'couples' AND indexname = 'idx_couples_dates'
        ) THEN '✅ idx_couples_dates exists'
        ELSE '❌ idx_couples_dates missing'
    END

UNION ALL

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'featured_missions' AND indexname = 'idx_featured_missions_dates'
        ) THEN '✅ idx_featured_missions_dates exists'
        ELSE '❌ idx_featured_missions_dates missing'
    END;

-- 예상 결과: 모두 ✅ (체크표시)


-- ========================================
-- 실행 순서
-- ========================================
-- 1. 섹션 1-4: 기본 테이블 구조 확인
-- 2. 섹션 5-7: 관계 및 보안 정책 확인
-- 3. 섹션 8-10: 데이터 무결성 및 타입 검증
-- 4. 섹션 11: 종합 상태 대시보드
-- 5. 섹션 12: 마이그레이션 완료 확인 (가장 중요!)
