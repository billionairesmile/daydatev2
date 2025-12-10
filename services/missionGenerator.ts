import OpenAI from 'openai';
import type { Mission, MissionDifficulty, MissionCategory } from '@/types';
import type { OnboardingData } from '@/stores/onboardingStore';
import type { MissionGenerationAnswers } from '@/stores/missionStore';
import { getRandomImageFromAll } from '@/constants/missionImages';

// Initialize OpenAI client
const getOpenAIClient = () => {
  // Read API key from .env file (EXPO_PUBLIC_ prefix for Expo)
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OpenAI API key not found. Please check .env file and ensure EXPO_PUBLIC_OPENAI_API_KEY is set');
  }

  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true, // Required for React Native
  });
};

interface MissionGenerationInput {
  userAPreferences?: OnboardingData;
  userBPreferences?: OnboardingData;
  todayAnswers: MissionGenerationAnswers;
}

interface GeneratedMissionData {
  title: string;
  description: string;
  category: string;
  difficulty: number;
  locationType: 'indoor' | 'outdoor';
  tags: string[];
  icon: string;
}

// Calculate age from birth date
function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

export async function generateMissionsWithAI(input: MissionGenerationInput): Promise<Mission[]> {
  const openai = getOpenAIClient();

  // Check if any user is under 19 years old
  let isAnyUserUnder19 = false;
  if (input.userAPreferences?.birthDate) {
    const ageA = calculateAge(new Date(input.userAPreferences.birthDate));
    if (ageA < 19) isAnyUserUnder19 = true;
  }
  if (input.userBPreferences?.birthDate) {
    const ageB = calculateAge(new Date(input.userBPreferences.birthDate));
    if (ageB < 19) isAnyUserUnder19 = true;
  }

  // Build context from user preferences
  const contextParts: string[] = [];

  // 🚨 제약사항 - 가장 먼저 확인해야 할 필수 조건
  const allConstraints: string[] = [];
  if (input.userAPreferences?.constraints) {
    allConstraints.push(...input.userAPreferences.constraints);
  }
  if (input.userBPreferences?.constraints) {
    allConstraints.push(...input.userBPreferences.constraints);
  }
  // 중복 제거
  const uniqueConstraints = [...new Set(allConstraints)].filter(c => c !== 'none');

  contextParts.push('=== 🚨 제약사항 (최우선 필수 조건!) ===');
  if (uniqueConstraints.length > 0) {
    contextParts.push(`적용 제약사항: ${uniqueConstraints.join(', ')}`);
    // 제약사항별 상세 설명 추가
    const constraintDescriptions: Record<string, string> = {
      pet: '🐾 반려동물 있음 → 반려동물 동반 가능한 실내나 야외에서 할 수 있는 활동 추천',
      child: '👶 아이 있음 → 아이와 함께할 수 있는 가족 친화적 활동 추천',
      long_distance: '✈️ 장거리 연애 → 온라인/영상통화로 할 수 있는 활동 또는 만났을 때 특별한 활동 추천',
      far_distance: '🚗 거리가 멂 → 만나기 어려우므로 온라인 활동 또는 만났을 때 가치 있는 활동 추천',
      no_car: '🚘 차/면허 없음 → 대중교통 접근 가능하거나 도보 가능한 장소, 또는 실내 활동 추천',
      no_alcohol: '🍻 술 안함 → 주류 관련 활동 절대 제외, 카페/디저트/논알콜 음료 추천',
      avoid_crowd: '👥 인파 피함 → 한적한 장소, 예약제 공간, 집에서 하는 활동 추천',
    };
    uniqueConstraints.forEach(constraint => {
      if (constraintDescriptions[constraint]) {
        contextParts.push(constraintDescriptions[constraint]);
      }
    });
  } else {
    contextParts.push('제약사항 없음');
  }

  // 🎯 MBTI - 두 번째로 중요한 정보
  contextParts.push('\n=== 📌 MBTI 정보 ===');
  if (input.userAPreferences?.mbti) {
    contextParts.push(`사용자 A MBTI: ${input.userAPreferences.mbti}`);
  }
  if (input.userBPreferences?.mbti) {
    contextParts.push(`사용자 B (파트너) MBTI: ${input.userBPreferences.mbti}`);
  }
  if (!input.userAPreferences?.mbti && !input.userBPreferences?.mbti) {
    contextParts.push('MBTI 정보 없음 - 다른 선호도를 바탕으로 추천');
  }

  // User A preferences
  if (input.userAPreferences) {
    const prefs = input.userAPreferences;
    contextParts.push('\n=== 사용자 A 선호도 ===');
    if (prefs.activityTypes.length > 0) contextParts.push(`선호 활동: ${prefs.activityTypes.join(', ')}`);
    if (prefs.dateWorries.length > 0) contextParts.push(`데이트 고민: ${prefs.dateWorries.join(', ')}`);
  }

  // User B preferences (if available, for paired users)
  if (input.userBPreferences) {
    const prefs = input.userBPreferences;
    contextParts.push('\n=== 사용자 B (파트너) 선호도 ===');
    if (prefs.activityTypes.length > 0) contextParts.push(`선호 활동: ${prefs.activityTypes.join(', ')}`);
    if (prefs.dateWorries.length > 0) contextParts.push(`데이트 고민: ${prefs.dateWorries.join(', ')}`);
  }

  // Today's answers
  const { canMeetToday, todayMoods } = input.todayAnswers;

  // Convert mood IDs to Korean labels for better AI understanding
  const moodLabels: Record<string, string> = {
    fun: '웃고 싶어요',
    deep_talk: '대화가 필요해',
    active: '활동·에너지',
    healing: '휴식·힐링',
    culture: '문화·감성',
    adventure: '새로운 도전',
    romantic: '로맨틱',
  };

  const moodKorean = todayMoods.map(mood => moodLabels[mood] || mood).join(', ');

  contextParts.push('\n=== 오늘의 상황 ===');
  contextParts.push(`오늘 만날 수 있나요: ${canMeetToday ? '네' : '아니오'}`);
  contextParts.push(`오늘 원하는 분위기: ${moodKorean}`);

  // Add age restriction info
  if (isAnyUserUnder19) {
    contextParts.push('\n⚠️ 연령 제한: 사용자 중 한 명 이상이 만 19세 미만입니다.');
  }

  const contextString = contextParts.join('\n');

  const systemPrompt = `당신은 커플을 위한 특별한 데이트 미션을 추천하는 AI 어시스턴트입니다.
사용자의 제약사항, MBTI, 선호도, 오늘의 상황을 고려하여 두 사람의 기억에 오래 남을 특별한 데이트 미션 3개를 생성해주세요.

🎯 핵심 원칙:
1. **🚨 제약사항 최우선 (절대 위반 금지!)**:
   사용자가 선택한 제약사항은 반드시 모든 미션에 적용해야 합니다. 제약사항을 위반하는 미션은 절대 생성하지 마세요.
   - 🐾 반려동물 있음: 반려동물 동반 가능한 장소 또는 집에서 할 수 있는 활동만 추천
   - 👶 아이 있음: 아이와 함께할 수 있는 가족 친화적인 활동만 추천
   - ✈️ 장거리 연애: 온라인/영상통화로 할 수 있는 활동 또는 만났을 때 특별한 활동 추천
   - 🚗 거리가 멂: 만나기 어려우므로 온라인 활동 또는 만났을 때 가치 있는 활동 추천
   - 🚘 차/면허 없음: 대중교통 접근 가능하거나 도보 가능한 장소, 드라이브 관련 미션 제외
   - 🍻 술 안함: 주류 관련 활동 절대 제외 (바, 펍, 와인바, 칵테일, 술집 등 금지), 카페/디저트/논알콜 음료만 추천
   - 👥 인파 피함: 한적한 장소, 예약제 공간, 집에서 하는 활동 추천

2. **MBTI 고려**: 두 사람의 MBTI 성향을 고려하여 그들에게 맞는 활동을 추천하세요
   - E/I: 에너지 충전 방식 (사람들과의 활동 vs 조용한 활동)
   - N/S: 정보 수집 방식 (창의적/상상력 vs 현실적/구체적)
   - T/F: 의사결정 방식 (논리적/분석 vs 감정적/공감)
   - J/P: 생활양식 (계획적/체계적 vs 유연한/즉흥적)

3. **특별하고 기억에 남는 경험**:
   ❌ 피해야 할 뻔한 미션: "카페에서 얘기하기", "공원 산책하기", "영화 보기"
   ✅ 추천하는 특별한 미션: "카페에서 서로의 버킷리스트 교환하고 하나씩 실천 약속하기", "공원에서 공용 자전거 타고 숨겨진 포토존 찾기", "눈 오는 날 눈사람 콘테스트하기"

4. **구체적인 활동 제시**: 단순히 "가기"가 아니라 "무엇을 하기"까지 구체적으로 제시하세요
   - 각 미션은 단순한 활동이 아니라 실행 방법, 감정, 목적, 기억 포인트(사진/대화/행동)를 포함해 제안하세요.

5. **📸 사진으로 남길 수 있는 미션 (중요!)**:
   - 미션을 완료하려면 사진을 찍어야 합니다. 반드시 사진으로 기록할 수 있는 활동을 추천하세요.
   - ❌ 피해야 할 미션: 영상통화하기, 전화로 대화하기, 사진 공유하기, 메시지 보내기 등 사진 촬영이 불가능한 활동
   - ✅ 좋은 미션: 함께 찍은 셀카, 음식 사진, 장소 인증, 활동 중 사진 등 시각적 증거를 남길 수 있는 활동
   - canMeetToday가 false인 경우에도: 홈데이트 인증샷, 같은 음식 각자 먹고 인증, 화상통화 중 같은 포즈 캡처 등 사진을 남길 수 있는 방식으로 제안

6. **상황 맞춤화**:
   - 오늘의 분위기(mood)를 반영하세요
   - canMeetToday가 false면 온라인/집에서 할 수 있는 창의적인 미션 추천 (단, 사진 촬영 가능해야 함)
   - 계절, 날씨, 시간대를 고려한 활동 추천

7. **한국 문화 반영**: 한국의 데이트 문화와 실정에 맞는 실행 가능한 미션

8. **연령 제한 준수 (중요!)**:
   ⚠️ 사용자 정보에 "연령 제한: 사용자 중 한 명 이상이 만 19세 미만입니다"라고 명시된 경우:
   - 절대로 'drink' 카테고리 미션을 생성하지 마세요
   - 바, 펍, 와인바, 칵테일, 술집 등 주류 관련 장소는 제외하세요
   - 대신 카페, 디저트 카페, 주스바, 논알콜 음료 카페 등을 추천하세요

📝 **글자 수 제한 (필수!)**:
- 미션명(title): 공백 포함 15자 이내
- 미션 설명(description): 공백 포함 80자 이내

응답 형식은 반드시 다음 JSON 객체 형식이어야 합니다:
{
  "missions": [
    {
      "title": "미션 제목 (공백 포함 15자 이내, 간략하고 명확하게)",
      "description": "미션 설명 (공백 포함 80자 이내, 실행 방법/감정/목적/기억 포인트 포함)",
    "category": "다음 카테고리 중 하나를 선택하세요:

      🍴 Food & Drink:
      - cafe: 카페에서 커피/음료/디저트 즐기기
      - restaurant: 레스토랑, 맛집 탐방, 외식
      - streetfood: 맛집투어, 포장마차, 길거리 음식
      - dessert: 디저트 카페, 빵집 순례, 케이크
      - cooking: 함께 요리하기, 베이킹, 쿠킹 클래스
      - drink: 바, 펍, 와인바, 칵테일
      - brunch: 브런치 카페, 아침 데이트

      🏞️ Place & Environment:
      - outdoor: 공원, 산책, 피크닉, 야외 활동
      - home: 홈데이트, 집에서 즐기기
      - travel: 여행, 여행지 탐방
      - daytrip: 당일치기, 근교 나들이
      - drive: 드라이브, 차로 떠나기
      - night: 야경, 야간 데이트, 밤 산책
      - nature: 등산, 바다, 캠핑, 자연 속 데이트

      🎯 Activities:
      - culture: 전시회, 공연, 뮤지컬, 박물관, 갤러리
      - movie: 영화관, 영화 보기
      - sports: 볼링, 탁구, 배드민턴, 스포츠 활동
      - fitness: 헬스, 필라테스, 요가, 러닝
      - wellness: 스파, 찜질방, 마사지, 명상, 힐링
      - creative: 만들기, 공방, 원데이 클래스, 도예
      - game: 보드게임, 방탈출, PC방, 게임
      - shopping: 쇼핑, 마켓 탐방
      - photo: 사진, 인생네컷, 셀프 스튜디오
      - learning: 함께 배우기, 언어, 악기, 취미

      💝 Special & Romantic:
      - romantic: 로맨틱 서프라이즈, 꽃선물, 이벤트
      - anniversary: 기념일 데이트, 특별한 날
      - surprise: 깜짝 이벤트, 서프라이즈
      - memory: 추억 만들기, 타임캡슐, 편지쓰기

      🌐 Online:
      - online: 영상통화, 넷플릭스 파티, 온라인 데이트
      - challenge: 커플 챌린지, 함께하는 챌린지",
      "difficulty": 1-3 사이의 숫자,
      "locationType": "indoor 또는 outdoor",
      "tags": ["태그1", "태그2", "태그3"] (최대 3개, 한글로 작성),
      "icon": "이모지 하나"
    }
  ]
}`;

  const userPrompt = `다음 정보를 바탕으로 오늘의 데이트 미션 3개를 생성해주세요:

${contextString}

반드시 JSON 배열 형식으로만 응답해주세요. 다른 설명이나 텍스트 없이 순수한 JSON만 반환하세요.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.85,
      max_tokens: 2000,
      presence_penalty: 0.6,
      frequency_penalty: 0.3,
      response_format: { type: 'json_object' },
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('OpenAI API returned empty response');
    }

    // Parse response
    const parsedResponse = JSON.parse(responseContent);

    // Handle various response formats
    let missionsData: GeneratedMissionData[] = [];
    if (Array.isArray(parsedResponse)) {
      missionsData = parsedResponse;
    } else if (parsedResponse.missions && Array.isArray(parsedResponse.missions)) {
      missionsData = parsedResponse.missions;
    } else if (parsedResponse.data && Array.isArray(parsedResponse.data)) {
      missionsData = parsedResponse.data;
    } else {
      // Try to find any array in the response
      const keys = Object.keys(parsedResponse);
      for (const key of keys) {
        if (Array.isArray(parsedResponse[key]) && parsedResponse[key].length > 0) {
          missionsData = parsedResponse[key];
          break;
        }
      }
    }

    if (missionsData.length === 0) {
      throw new Error('No missions generated');
    }

    // Convert to Mission format
    const missions: Mission[] = missionsData.slice(0, 3).map((data, index) => {
      // Validate and normalize difficulty
      let difficulty: MissionDifficulty = 1;
      if (data.difficulty === 1 || data.difficulty === 2 || data.difficulty === 3) {
        difficulty = data.difficulty;
      }

      return {
        id: `ai-${Date.now()}-${index}`,
        title: data.title,
        description: data.description,
        category: data.category as MissionCategory,
        difficulty,
        locationType: data.locationType,
        tags: data.tags,
        icon: data.icon,
        imageUrl: getRandomImageFromAll(), // Use sample image for now
        isPremium: false,
        moodTags: todayMoods,
      };
    });

    return missions;
  } catch (error) {
    throw error;
  }
}

// Fallback function for when AI generation fails
export function generateMissionsFallback(todayMoods: string[]): Mission[] {
  const fallbackMissions: Mission[] = [
    {
      id: `fallback-${Date.now()}-1`,
      title: '카페에서 함께 커피 한잔',
      description: '분위기 좋은 카페에서 따뜻한 커피 한잔과 함께 서로의 이야기를 나눠보세요.',
      category: 'cafe',
      difficulty: 1,
      locationType: 'indoor',
      tags: ['카페', '대화', '여유'],
      icon: '☕',
      imageUrl: 'https://images.unsplash.com/photo-1548051072-b34898021f8b?w=800',
      isPremium: false,
      moodTags: todayMoods as any,
    },
    {
      id: `fallback-${Date.now()}-2`,
      title: '일몰 보며 산책하기',
      description: '해 질 녘, 손을 잡고 함께 걸어보세요. 하루의 끝을 함께 마무리하는 특별한 시간이 될 거예요.',
      category: 'outdoor',
      difficulty: 1,
      locationType: 'outdoor',
      tags: ['산책', '일몰', '로맨틱'],
      icon: '🌅',
      imageUrl: 'https://images.unsplash.com/photo-1693852512019-cb0eccc97e8f?w=800',
      isPremium: false,
      moodTags: todayMoods as any,
    },
    {
      id: `fallback-${Date.now()}-3`,
      title: '함께 요리하기',
      description: '오늘은 집에서 함께 요리해보는 건 어떨까요? 서로 도우며 만드는 음식은 더욱 맛있답니다.',
      category: 'cooking',
      difficulty: 2,
      locationType: 'indoor',
      tags: ['요리', '홈데이트', '협력'],
      icon: '👨‍🍳',
      imageUrl: 'https://images.unsplash.com/photo-1758522489456-96afe24741dc?w=800',
      isPremium: false,
      moodTags: todayMoods as any,
    },
  ];

  return fallbackMissions;
}
