# 데이터베이스 검증 가이드

## 빠른 검증 (5분)

### 1. Supabase Dashboard에서 실행

1. [Supabase Dashboard](https://app.supabase.com) 접속
2. 프로젝트 선택
3. 왼쪽 메뉴 → **SQL Editor**
4. **QUICK_VALIDATION.sql** 파일 내용 복사
5. 붙여넣고 **Run** 클릭

### 2. 핵심 체크리스트

```sql
-- 섹션 1: 마이그레이션 체크리스트 실행
-- 모든 항목이 ✅ 로 표시되어야 함
```

**예상 결과:**
```
✅ profiles.birth_date
✅ profiles.location_latitude
✅ profiles.location_longitude
✅ profiles.location_city
✅ profiles.location_district
✅ couples.dating_start_date
✅ couples.wedding_date
✅ featured_missions table
✅ idx_profiles_location
✅ idx_couples_dates
✅ idx_featured_missions_dates
✅ idx_featured_missions_active
```

만약 ❌ 표시가 있다면 → 해당 마이그레이션 다시 실행

## 상세 검증 (개발자용)

### VALIDATION_QUERIES.sql 사용

전체 검증이 필요한 경우:

1. **테이블 구조 검증**
   - 섹션 1-4 실행
   - 컬럼 타입, nullable, default 값 확인

2. **관계 및 보안 검증**
   - 섹션 5-7 실행
   - Foreign Key, RLS 정책, 트리거 확인

3. **데이터 무결성 검증**
   - 섹션 8-10 실행
   - 중복 데이터, 타입 오류 확인

4. **성능 검증**
   - 섹션 9 실행
   - 쿼리 실행 계획 및 인덱스 사용 확인

## 검증 결과 해석

### ✅ 정상

모든 마이그레이션이 성공적으로 적용됨:
- profiles 테이블에 5개 새 컬럼 추가 완료
- couples 테이블에 2개 새 컬럼 추가 완료
- featured_missions 테이블 생성 완료
- 인덱스 3개 생성 완료
- RLS 정책 2개 설정 완료
- 트리거 1개 설정 완료

### ❌ 문제 발생 시

**1. 컬럼이 없는 경우**
```
❌ profiles.birth_date
```
→ `add_mission_generation_fields.sql` 마이그레이션 재실행

**2. 테이블이 없는 경우**
```
❌ featured_missions table
```
→ `add_featured_missions.sql` 마이그레이션 재실행

**3. 인덱스가 없는 경우**
```
❌ idx_profiles_location
```
→ 마이그레이션 파일에서 인덱스 생성 부분만 재실행

## 필수 마이그레이션 목록

### 1. 미션 생성 필드 추가
**파일**: `add_mission_generation_fields.sql`

**추가 내용**:
- profiles: birth_date, location_latitude, location_longitude, location_city, location_district
- couples: dating_start_date, wedding_date
- 인덱스: idx_profiles_location, idx_couples_dates

**검증 쿼리**:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name IN (
  'birth_date', 'location_latitude', 'location_longitude',
  'location_city', 'location_district'
);
-- 예상: 5 rows
```

### 2. 특별 미션 테이블 추가
**파일**: `add_featured_missions.sql`

**추가 내용**:
- featured_missions 테이블 생성
- 인덱스: idx_featured_missions_dates, idx_featured_missions_active
- RLS 정책 2개
- updated_at 트리거

**검증 쿼리**:
```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_name = 'featured_missions';
-- 예상: 1
```

## 데이터 검증

### 1. 샘플 데이터 확인

```sql
-- 특별 미션 샘플 데이터
SELECT title, is_active FROM featured_missions;
```

**예상 결과**:
- 크리스마스 특별 데이트 (active: true)
- 발렌타인데이 스페셜 (active: false)

### 2. 데이터 타입 검증

```sql
-- DATE 필드가 올바른 형식인지 확인
SELECT
  birth_date,
  birth_date::text
FROM profiles
WHERE birth_date IS NOT NULL
LIMIT 1;
```

**예상 형식**: `YYYY-MM-DD` (예: 2025-03-15)

### 3. ARRAY 타입 검증

```sql
-- tags 배열이 제대로 저장되는지 확인
SELECT
  title,
  tags,
  array_length(tags, 1) as tag_count
FROM featured_missions
LIMIT 1;
```

**예상 결과**: tags는 TEXT[] 배열 (예: {christmas, romantic, seasonal})

## 성능 체크

### 쿼리 실행 시간 확인

```sql
-- 특별 미션 조회 성능 (앱에서 실제 사용)
EXPLAIN ANALYZE
SELECT *
FROM featured_missions
WHERE is_active = true
  AND (start_date IS NULL OR start_date <= CURRENT_DATE)
  AND (end_date IS NULL OR end_date >= CURRENT_DATE)
ORDER BY priority DESC
LIMIT 2;
```

**기대 성능**:
- Execution time: < 5ms
- Index Scan 사용 (Seq Scan이면 인덱스 문제)

## 문제 해결

### 마이그레이션 순서 오류

```sql
-- 테이블 의존성 확인
SELECT
  tc.table_name,
  ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.constraint_column_usage AS ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'featured_missions';
```

**예상**: featured_missions.mission_id → missions.id

만약 에러 발생 → missions 테이블이 먼저 존재해야 함

### RLS 정책 충돌

```sql
-- RLS 정책 확인
SELECT policyname, qual
FROM pg_policies
WHERE tablename = 'featured_missions';
```

정책이 중복되면 → 기존 정책 삭제 후 재생성

### 트리거 오작동

```sql
-- 트리거 테스트
UPDATE featured_missions
SET title = 'Test Update'
WHERE id = (SELECT id FROM featured_missions LIMIT 1);

-- updated_at이 자동으로 갱신되었는지 확인
SELECT updated_at FROM featured_missions
WHERE id = (SELECT id FROM featured_missions LIMIT 1);
```

updated_at이 변경되지 않으면 → 트리거 재생성

## 체크리스트

마이그레이션 완료 후 확인:

- [ ] QUICK_VALIDATION.sql 섹션 1 실행 → 모두 ✅
- [ ] 테이블 11개 존재 확인
- [ ] profiles 테이블 컬럼 11개 (5개 추가)
- [ ] couples 테이블 컬럼 10개 (2개 추가)
- [ ] featured_missions 테이블 컬럼 18개
- [ ] 인덱스 3개 추가 (profiles, couples, featured_missions)
- [ ] RLS 정책 2개 설정 (featured_missions)
- [ ] 트리거 1개 설정 (featured_missions)
- [ ] 샘플 데이터 2개 존재 (featured_missions)
- [ ] 성능 테스트 통과 (< 5ms)

모든 항목 완료 → ✅ **데이터베이스 준비 완료!**

## 다음 단계

1. ✅ 데이터베이스 검증 완료
2. 📝 앱에서 미션 생성 테스트
3. 📝 특별 미션 노출 확인
4. 📝 프로덕션 배포 전 최종 체크

## 참고 파일

- 빠른 검증: [QUICK_VALIDATION.sql](./QUICK_VALIDATION.sql)
- 상세 검증: [VALIDATION_QUERIES.sql](./VALIDATION_QUERIES.sql)
- 마이그레이션: [add_mission_generation_fields.sql](./migrations/add_mission_generation_fields.sql), [add_featured_missions.sql](./migrations/add_featured_missions.sql)
