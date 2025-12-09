# Supabase 데이터베이스 마이그레이션 가이드

## 개요

AI 미션 생성 기능을 위해 다음 필드들이 추가되었습니다:

### 1. profiles 테이블
- `birth_date` (DATE): 사용자 생년월일 - 나이대별 미션 추천
- `location_latitude` (DOUBLE PRECISION): 위도
- `location_longitude` (DOUBLE PRECISION): 경도
- `location_city` (TEXT): 도시명 (예: 서울특별시)
- `location_district` (TEXT): 구/군 (예: 강남구)

### 2. couples 테이블
- `dating_start_date` (DATE): 사귀기 시작한 날짜 (100일 기념일 계산용)
- `wedding_date` (DATE, nullable): 결혼기념일 (매년 같은 날짜)

## 마이그레이션 실행 방법

### 방법 1: Supabase Dashboard에서 실행 (권장)

1. Supabase Dashboard 접속: https://app.supabase.com
2. 프로젝트 선택
3. 왼쪽 메뉴에서 **SQL Editor** 클릭
4. `migrations/add_mission_generation_fields.sql` 파일 내용 복사
5. SQL Editor에 붙여넣기
6. **Run** 버튼 클릭

### 방법 2: Supabase CLI 사용 (로컬 개발 환경)

```bash
# Supabase CLI 설치 (없는 경우)
npm install -g supabase

# 프로젝트 링크
supabase link --project-ref your-project-ref

# 마이그레이션 적용
supabase db push
```

## 마이그레이션 검증

실행 후 다음 쿼리로 컬럼이 정상 추가되었는지 확인:

```sql
-- profiles 테이블 구조 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;

-- couples 테이블 구조 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'couples'
ORDER BY ordinal_position;
```

예상 결과:
```
profiles 테이블:
- birth_date (date, YES)
- location_latitude (double precision, YES)
- location_longitude (double precision, YES)
- location_city (text, YES)
- location_district (text, YES)

couples 테이블:
- dating_start_date (date, YES)
- wedding_date (date, YES)
```

## 데이터 입력 예시

### 프로필 생성 시 위치 및 생년월일 추가

```typescript
import { db } from '@/lib/supabase';

// 회원가입 시
await db.profiles.create({
  id: userId,
  nickname: '홍길동',
  invite_code: 'ABC123',
  birth_date: '1995-03-15', // ISO date string
  location_latitude: 37.5665,
  location_longitude: 126.9780,
  location_city: '서울특별시',
  location_district: '중구',
});

// 위치 정보 업데이트
await db.profiles.update(userId, {
  location_latitude: 37.5172,
  location_longitude: 127.0473,
  location_city: '서울특별시',
  location_district: '강남구',
});
```

### 커플 생성 시 기념일 추가

```typescript
// 페어링 시
await db.couples.create({
  user1_id: 'user1-uuid',
  dating_start_date: '2023-01-14', // 사귄 날짜
  wedding_date: null, // 미혼인 경우
});

// 결혼 후 결혼기념일 추가
await db.couples.update(coupleId, {
  wedding_date: '2024-05-20',
});
```

## AI 미션 생성에서 사용

```typescript
import { generateMissionsWithAI } from '@/services/missionGenerator';
import * as Location from 'expo-location';

// 현재 위치 가져오기
const location = await Location.getCurrentPositionAsync({});

// 미션 생성
const missions = await generateMissionsWithAI({
  userAProfile: {
    birthDate: new Date('1995-03-15'),
    location: {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    },
  },
  userBProfile: {
    birthDate: new Date('1997-08-22'),
    location: {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    },
  },
  coupleAnniversary: {
    startDate: new Date('2023-01-14'),
    weddingDate: undefined, // 미혼
  },
  todayAnswers: {
    canMeetToday: true,
    todayMoods: ['romantic', 'fun'],
  },
});
```

## 롤백 (필요 시)

마이그레이션을 되돌리려면:

```sql
-- profiles 테이블에서 추가된 컬럼 제거
ALTER TABLE profiles
DROP COLUMN IF EXISTS birth_date,
DROP COLUMN IF EXISTS location_latitude,
DROP COLUMN IF EXISTS location_longitude,
DROP COLUMN IF EXISTS location_city,
DROP COLUMN IF EXISTS location_district;

-- couples 테이블에서 추가된 컬럼 제거
ALTER TABLE couples
DROP COLUMN IF EXISTS dating_start_date,
DROP COLUMN IF EXISTS wedding_date;

-- 인덱스 제거
DROP INDEX IF EXISTS idx_profiles_location;
DROP INDEX IF EXISTS idx_couples_dates;
```

## 주의사항

1. **데이터 마이그레이션**: 기존 `anniversary_date`를 사용 중이었다면, `dating_start_date`로 데이터 복사가 필요할 수 있습니다.
2. **NULL 허용**: 모든 새 컬럼은 NULL을 허용하므로 기존 데이터에 영향 없습니다.
3. **위치 권한**: 앱에서 위치 정보 수집 시 사용자 동의 필요 (이미 구현됨).
4. **개인정보**: 생년월일 및 위치 정보는 민감 정보이므로 GDPR/개인정보보호법 준수 필요.

## 다음 단계

1. ✅ 마이그레이션 실행
2. ✅ TypeScript 타입 업데이트 완료
3. 📝 온보딩 플로우에 생년월일 입력 추가
4. 📝 위치 정보 수집 및 저장 로직 구현
5. 📝 AI 미션 생성 활성화 테스트

## 참고 파일

- Migration SQL: `/supabase/migrations/add_mission_generation_fields.sql`
- TypeScript Types: `/types/database.ts`
- Supabase Helper: `/lib/supabase.ts`
- Mission Generator: `/services/missionGenerator.ts`
