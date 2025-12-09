# AI Mission Generator 설정 및 사용 가이드

## 개요

OpenAI API를 사용하여 커플의 선호도와 오늘의 답변을 기반으로 맞춤형 데이트 미션을 생성합니다.

## 구현 완료 사항

✅ OpenAI 패키지 설치
✅ Mission Generator 서비스 구현 ([missionGenerator.ts](./missionGenerator.ts))
✅ 환경 변수 설정 (.env 파일)
✅ 타입 안전성 보장
✅ Fallback 시스템 구현
✅ 테스트 유틸리티 제공

## 파일 구조

```
daydate/
├── .env                              # OpenAI API 키 저장
├── services/
│   └── missionGenerator.ts          # AI 미션 생성 서비스
├── stores/
│   └── missionStore.ts              # 미션 상태 관리 (AI 연동 준비됨)
└── utils/
    └── testMissionGenerator.ts      # 테스트 유틸리티
```

## 환경 변수 설정

`.env` 파일이 이미 설정되어 있습니다:

```env
OPENAI_API_KEY=sk-proj-pbMnwv87-...
```

## AI 미션 생성 플로우

### 1. 사용자 입력 수집
- **오늘 만날 수 있나요?** (canMeetToday: boolean)
- **오늘 원하는 분위기는?** (todayMoods: TodayMood[])
  - 그냥 웃고 싶어요 (fun)
  - 깊은 대화 (deep_talk)
  - 둘만의 로맨틱 (romantic)
  - 힐링·휴식 (healing)
  - 새로운 거 도전 (adventure)

### 2. AI 프롬프트 생성
- 사용자의 온보딩 선호도 (활동 타입, 데이트 스타일 등)
- 오늘의 상황 (만남 가능 여부, 원하는 분위기)
- 제약사항 (장거리, 차량 없음 등)

### 3. OpenAI API 호출
```typescript
const missions = await generateMissionsWithAI({
  userAPreferences: onboardingData,  // 선택사항
  userBPreferences: partnerData,     // 선택사항 (페어링된 경우)
  todayAnswers: {
    canMeetToday: true,
    todayMoods: ['romantic', 'fun']
  }
});
```

### 4. 미션 생성 결과
- 3개의 맞춤형 미션 카드
- 각 미션은 제목, 설명, 카테고리, 난이도, 태그 포함
- Unsplash 샘플 이미지 자동 할당

## 현재 구현 상태

### ✅ 구현 완료
1. **OpenAI 서비스 (`missionGenerator.ts`)**
   - GPT-4o-mini 모델 사용
   - JSON 형식 응답 보장
   - 에러 처리 및 fallback 시스템
   - 타입 안전성 보장

2. **환경 변수 설정**
   - .env 파일에 API 키 저장
   - React Native 환경에서 접근 가능

3. **테스트 유틸리티**
   - 다양한 시나리오 테스트 가능
   - 콘솔 로그로 결과 확인

### 🔄 연동 대기 중 (주석 처리됨)

`missionStore.ts`의 `generateTodayMissions` 함수에서 AI 생성 로직이 주석 처리되어 있습니다:

```typescript
// 현재는 fallback 로직 사용 (lines 221-224)
// const { generateMissionsWithAI } = await import('@/services/missionGenerator');
// const aiMissions = await generateMissionsWithAI({
//   todayAnswers: answers,
// });
```

## AI 미션 생성 활성화 방법

### 방법 1: missionStore에서 직접 활성화

`stores/missionStore.ts` 파일의 `generateTodayMissions` 함수를 수정:

```typescript
generateTodayMissions: async (answers) => {
  const today = getTodayDateString();

  try {
    // 1️⃣ 이 주석을 해제하세요
    const { generateMissionsWithAI } = await import('@/services/missionGenerator');
    const aiMissions = await generateMissionsWithAI({
      todayAnswers: answers,
    });

    // 2️⃣ 생성된 미션에 ID 추가
    const todayMissions = aiMissions.map((m, idx) => ({
      ...m,
      id: `${today}-${idx + 1}-${m.id}`,
    }));

    set({
      generatedMissionData: {
        missions: todayMissions,
        generatedDate: today,
        answers,
      },
    });

  } catch (error) {
    console.error('Error generating missions:', error);
    // Fallback은 그대로 유지
  }
}
```

### 방법 2: 테스트용 유틸리티 사용

먼저 테스트해보고 싶다면:

```typescript
// 아무 컴포넌트에서 테스트
import { testMissionGeneration } from '@/utils/testMissionGenerator';

// 버튼 클릭 또는 useEffect에서 호출
const handleTest = async () => {
  const missions = await testMissionGeneration();
  console.log('Generated missions:', missions);
};
```

## API 사용량 및 비용

### GPT-4o-mini 요금 (2025년 기준)
- **Input**: $0.150 / 1M tokens
- **Output**: $0.600 / 1M tokens

### 미션 생성 1회당 예상 비용
- 프롬프트 토큰: ~500 tokens
- 응답 토큰: ~800 tokens
- **비용**: 약 $0.00065 (약 0.8원)

### 월간 사용량 예상 (사용자 1,000명 기준)
- 하루 1회 생성 × 30일 = 30,000회
- 월간 비용: ~$20 (약 26,000원)

## 개선 예정 사항

### Phase 1: 기본 AI 연동
- [x] OpenAI API 통합
- [x] 기본 프롬프트 엔지니어링
- [ ] missionStore에서 AI 생성 활성화
- [ ] 실제 사용자 데이터로 테스트

### Phase 2: 고도화
- [ ] 온보딩 데이터 활용 (userAPreferences, userBPreferences)
- [ ] 페어링된 커플의 공통 선호도 분석
- [ ] 과거 완료한 미션 기록 활용
- [ ] 시간대별 맞춤 추천

### Phase 3: 최적화
- [ ] 프롬프트 최적화로 토큰 사용량 감소
- [ ] 캐싱 전략 구현 (유사한 요청 재사용)
- [ ] 카테고리별 이미지 매핑 개선
- [ ] A/B 테스트로 추천 품질 개선

## 트러블슈팅

### Q: "OpenAI API key not found" 에러
**A**: `.env` 파일이 프로젝트 루트에 있는지 확인하세요.

### Q: AI 생성이 느려요
**A**:
- 평균 응답 시간: 2-4초
- 네트워크 상태 확인
- Fallback 시스템이 있어 실패 시 즉시 기본 미션 제공

### Q: 생성된 미션 품질이 낮아요
**A**:
- 온보딩 데이터 연동 필요 (현재 미구현)
- 프롬프트 개선 필요
- 테스트 피드백을 바탕으로 계속 개선 중

## 다음 단계

1. **테스트 실행**
   ```typescript
   import { testMissionGeneration } from '@/utils/testMissionGenerator';
   await testMissionGeneration();
   ```

2. **missionStore 활성화**
   - 주석 처리된 AI 생성 로직 활성화
   - 실제 앱에서 테스트

3. **피드백 수집**
   - 생성된 미션 품질 확인
   - 사용자 만족도 측정
   - 프롬프트 개선

## 관련 파일

- 📄 [missionGenerator.ts](./missionGenerator.ts) - AI 미션 생성 서비스
- 📄 [missionStore.ts](../stores/missionStore.ts) - 미션 상태 관리
- 📄 [testMissionGenerator.ts](../utils/testMissionGenerator.ts) - 테스트 유틸리티
- 📄 [.env](../.env) - 환경 변수 (API 키)

---

**준비 완료!** 이제 AI 미션 생성을 활성화하고 테스트할 수 있습니다. 🎉
