# Featured Missions (특별 미션) 가이드

## 개요

특별 미션은 관리자가 직접 만들어 모든 사용자에게 제공하는 이벤트/시즌 미션입니다.
AI가 생성한 3개의 개인화 미션 외에 최대 2개의 특별 미션이 추가로 표시됩니다.

## 데이터베이스 구조

### featured_missions 테이블

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| id | UUID | 기본 키 |
| mission_id | UUID | (선택) 기존 missions 테이블 참조 |
| title | TEXT | 미션 제목 |
| description | TEXT | 미션 설명 |
| category | TEXT | 카테고리 (romance, outdoor, food, etc.) |
| difficulty | INTEGER | 난이도 (1-3) |
| duration | TEXT | 소요 시간 (예: "2-3시간") |
| location_type | TEXT | 장소 타입 (indoor, outdoor, any) |
| tags | TEXT[] | 태그 배열 |
| icon | TEXT | 이모지 아이콘 |
| image_url | TEXT | 미션 이미지 URL |
| estimated_time | INTEGER | 예상 소요 시간 (분) |
| start_date | DATE | (선택) 노출 시작 날짜 |
| end_date | DATE | (선택) 노출 종료 날짜 |
| is_active | BOOLEAN | 활성화 상태 (기본값: true) |
| priority | INTEGER | 우선순위 (0-100, 높을수록 먼저 표시) |
| target_audience | TEXT | 타겟 사용자 (기본값: 'all') |

## 마이그레이션 실행

### 방법 1: Supabase Dashboard

1. Supabase Dashboard 접속: https://app.supabase.com
2. 프로젝트 선택
3. 왼쪽 메뉴에서 **SQL Editor** 클릭
4. `migrations/add_featured_missions.sql` 파일 내용 복사
5. SQL Editor에 붙여넣기
6. **Run** 버튼 클릭

### 방법 2: Supabase CLI

```bash
# 프로젝트 링크
supabase link --project-ref your-project-ref

# 마이그레이션 적용
supabase db push
```

## 특별 미션 추가 방법

### Supabase Dashboard에서 추가

1. Supabase Dashboard → **Table Editor** → `featured_missions` 테이블
2. **Insert row** 클릭
3. 필수 필드 입력:
   - title: 미션 제목
   - description: 미션 설명
   - category: 카테고리 선택
   - difficulty: 난이도 (1, 2, 3)
   - duration: 소요 시간
   - location_type: 장소 타입
   - tags: 태그 배열 (예: `{"romantic", "seasonal"}`)
   - icon: 이모지
   - image_url: Unsplash 이미지 URL
   - estimated_time: 분 단위 시간
4. 선택 필드:
   - start_date: 노출 시작일 (비워두면 즉시 노출)
   - end_date: 노출 종료일 (비워두면 계속 노출)
   - priority: 우선순위 (높을수록 먼저 표시, 기본값 0)
5. **Save** 클릭

### SQL로 추가

```sql
INSERT INTO featured_missions (
  title,
  description,
  category,
  difficulty,
  duration,
  location_type,
  tags,
  icon,
  image_url,
  estimated_time,
  start_date,
  end_date,
  is_active,
  priority
) VALUES (
  '크리스마스 특별 데이트',
  '크리스마스를 맞아 특별한 추억을 만들어보세요! 함께 트리를 보러 가거나 캐럴을 들으며 산책해보세요.',
  'special',
  2,
  '2-3시간',
  'outdoor',
  ARRAY['christmas', 'romantic', 'seasonal'],
  '🎄',
  'https://images.unsplash.com/photo-1512389142860-9c449e58a543',
  150,
  '2024-12-20',
  '2024-12-26',
  true,
  90
);
```

## 이미지 URL 가져오기

### Unsplash 무료 이미지

1. [Unsplash](https://unsplash.com) 접속
2. 원하는 이미지 검색
3. 이미지 클릭 → 우클릭 → "이미지 주소 복사"
4. URL 형식: `https://images.unsplash.com/photo-xxxxx`

### 카테고리별 추천 검색어

- 로맨틱: "couple", "romantic", "date night", "love"
- 야외: "outdoor", "nature", "park", "hiking"
- 음식: "food", "restaurant", "cooking", "cafe"
- 문화: "museum", "art", "concert", "theater"
- 홈: "home", "cozy", "indoor", "together"
- 특별: "celebration", "special", "event", "festival"

## 노출 로직

### 자동 노출 조건

특별 미션이 사용자에게 표시되는 조건:
1. `is_active = true` (활성화 상태)
2. `start_date`가 NULL이거나 오늘 이전/오늘
3. `end_date`가 NULL이거나 오늘 이후/오늘
4. 최대 2개까지만 표시 (priority 높은 순)

### Priority 가이드

- **100**: 긴급/중요 이벤트 (예: 발렌타인데이, 크리스마스)
- **90**: 시즌 이벤트 (예: 여름 휴가, 가을 단풍)
- **50**: 일반 특별 미션
- **0**: 기본 priority

## 예제 미션

### 시즌 미션

```sql
-- 여름 휴가 시즌
INSERT INTO featured_missions (
  title, description, category, difficulty, duration, location_type,
  tags, icon, image_url, estimated_time,
  start_date, end_date, is_active, priority
) VALUES (
  '여름 해변 데이트',
  '시원한 바다를 배경으로 특별한 추억을 만들어보세요.',
  'outdoor', 2, '반나절', 'outdoor',
  ARRAY['summer', 'beach', 'vacation'], '🏖️',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e',
  240,
  '2025-07-01', '2025-08-31', true, 85
);
```

### 기념일 미션

```sql
-- 발렌타인데이
INSERT INTO featured_missions (
  title, description, category, difficulty, duration, location_type,
  tags, icon, image_url, estimated_time,
  start_date, end_date, is_active, priority
) VALUES (
  '발렌타인데이 스페셜',
  '서로에게 사랑을 표현하는 특별한 시간을 가져보세요.',
  'romance', 1, '1-2시간', 'any',
  ARRAY['valentine', 'romantic', 'sweet'], '💝',
  'https://images.unsplash.com/photo-1518199266791-5375a83190b7',
  90,
  '2025-02-10', '2025-02-15', true, 95
);
```

### 상시 운영 미션

```sql
-- 날짜 제한 없이 계속 표시
INSERT INTO featured_missions (
  title, description, category, difficulty, duration, location_type,
  tags, icon, image_url, estimated_time,
  is_active, priority
) VALUES (
  '우리 동네 카페 탐방',
  '새로운 카페를 찾아 특별한 시간을 보내보세요.',
  'food', 1, '1-2시간', 'indoor',
  ARRAY['cafe', 'coffee', 'local'], '☕',
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085',
  90,
  true, 50
);
```

## 관리 작업

### 특별 미션 활성화/비활성화

```sql
-- 비활성화
UPDATE featured_missions
SET is_active = false
WHERE id = 'mission-uuid';

-- 활성화
UPDATE featured_missions
SET is_active = true
WHERE id = 'mission-uuid';
```

### 노출 기간 수정

```sql
UPDATE featured_missions
SET start_date = '2025-12-20',
    end_date = '2025-12-26'
WHERE id = 'mission-uuid';
```

### 우선순위 변경

```sql
UPDATE featured_missions
SET priority = 100
WHERE id = 'mission-uuid';
```

### 특별 미션 삭제

```sql
DELETE FROM featured_missions
WHERE id = 'mission-uuid';
```

## 현재 활성 미션 확인

```sql
-- 오늘 노출되는 특별 미션 확인
SELECT title, priority, start_date, end_date, is_active
FROM featured_missions
WHERE is_active = true
  AND (start_date IS NULL OR start_date <= CURRENT_DATE)
  AND (end_date IS NULL OR end_date >= CURRENT_DATE)
ORDER BY priority DESC
LIMIT 2;
```

## 앱에서의 표시

### 미션 순서

1. **AI 생성 미션 3개** (개인화된 추천)
2. **특별 미션 1-2개** (관리자 제작)

총 **4-5개의 미션**이 캐러셀로 표시됩니다.

### 사용자 경험

- 특별 미션은 일반 미션과 동일한 UI로 표시
- Keep(보관) 기능 사용 가능
- 미션 시작/완료 플로우 동일

## 주의사항

1. **이미지 저작권**: Unsplash 이미지 사용 시 저작권 확인
2. **노출 기간**: 이벤트 종료 후 `is_active = false`로 변경
3. **최대 개수**: 너무 많은 특별 미션은 개인화 경험 저해 (최대 2개 권장)
4. **테스트**: 프로덕션 배포 전 개발 환경에서 충분히 테스트

## 다음 단계

1. ✅ 마이그레이션 실행
2. ✅ TypeScript 타입 업데이트 완료
3. ✅ 미션 페이지 통합 완료
4. 📝 관리자 대시보드 개발 (선택)
5. 📝 특별 미션 스케줄링 자동화 (선택)

## 참고 파일

- Migration SQL: `/supabase/migrations/add_featured_missions.sql`
- TypeScript Types: `/types/database.ts`, `/types/index.ts`
- Supabase Helper: `/lib/supabase.ts`
- Mission Screen: `/app/(tabs)/mission.tsx`
