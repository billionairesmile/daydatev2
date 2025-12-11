import OpenAI from 'openai';
import type { Mission, MissionCategory } from '@/types';
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
  tags: string[];
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

// Calculate upcoming anniversaries for context
function getUpcomingAnniversaries(
  relationshipType: string | undefined,
  anniversaryDate: Date | string | null | undefined
): string[] {
  if (!anniversaryDate) return [];

  const today = new Date();
  const annDate = new Date(anniversaryDate);
  const upcomingAnniversaries: string[] = [];

  // Calculate days since anniversary
  const daysPassed = Math.floor((today.getTime() - annDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  // Check for upcoming day milestones (within 14 days)
  if (relationshipType === 'dating') {
    const milestones = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1500, 2000];
    for (const milestone of milestones) {
      const daysUntil = milestone - daysPassed;
      if (daysUntil > 0 && daysUntil <= 14) {
        upcomingAnniversaries.push(`${milestone}일 (D-${daysUntil})`);
      }
    }
  }

  // Check for upcoming yearly anniversary (within 30 days)
  for (let year = 1; year <= 50; year++) {
    const yearlyDate = new Date(annDate);
    yearlyDate.setFullYear(annDate.getFullYear() + year);

    if (yearlyDate > today) {
      const daysUntil = Math.ceil((yearlyDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      if (daysUntil <= 30) {
        const label = relationshipType === 'married' ? `결혼 ${year}주년` : `연애 ${year}주년`;
        upcomingAnniversaries.push(`${label} (D-${daysUntil})`);
      }
      break;
    }
  }

  return upcomingAnniversaries;
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

  // === 압축된 컨텍스트 빌드 ===
  const { canMeetToday, availableTime, todayMoods } = input.todayAnswers;

  // 간결한 매핑
  const moodMap: Record<string, string> = {
    fun: '웃음', deep_talk: '대화', active: '활동', healing: '힐링',
    culture: '문화', adventure: '도전', romantic: '로맨틱',
  };
  const timeMap: Record<string, string> = {
    '30min': '30분', '1hour': '1시간', '2hour': '2시간+', 'allday': '하루종일',
  };

  // 핵심 상황 (한 줄로 압축)
  contextParts.push(`[상황] 만남:${canMeetToday ? 'O' : 'X'} | 시간:${timeMap[availableTime]} | 분위기:${todayMoods.map(m => moodMap[m] || m).join(',')}`);

  // 제약사항 (있을 때만)
  if (uniqueConstraints.length > 0) {
    const constraintMap: Record<string, string> = {
      pet: '반려동물O', child: '아이O', long_distance: '장거리',
      far_distance: '원거리', no_car: '차X', no_alcohol: '술X', avoid_crowd: '인파X',
    };
    contextParts.push(`[제약] ${uniqueConstraints.map(c => constraintMap[c] || c).join(', ')}`);
  }

  // MBTI (있을 때만)
  const mbtiA = input.userAPreferences?.mbti;
  const mbtiB = input.userBPreferences?.mbti;
  if (mbtiA || mbtiB) {
    contextParts.push(`[MBTI] ${mbtiA || '?'}/${mbtiB || '?'}`);
  }

  // 선호 활동 (합쳐서 중복 제거)
  const allActivities = [
    ...(input.userAPreferences?.activityTypes || []),
    ...(input.userBPreferences?.activityTypes || []),
  ];
  if (allActivities.length > 0) {
    contextParts.push(`[선호] ${[...new Set(allActivities)].join(', ')}`);
  }

  // 기념일 (있을 때만)
  const upcomingAnniversaries = getUpcomingAnniversaries(
    input.userAPreferences?.relationshipType,
    input.userAPreferences?.anniversaryDate
  );
  if (upcomingAnniversaries.length > 0) {
    contextParts.push(`[기념일] ${upcomingAnniversaries.join(', ')}`);
  }

  // 미성년자 플래그
  if (isAnyUserUnder19) {
    contextParts.push('[미성년자포함]');
  }

  const contextString = contextParts.join('\n');

  // === 최적화된 시스템 프롬프트 ===
  const systemPrompt = `커플 데이트 미션 3개를 JSON으로 생성하세요.

■ 필수규칙
1. 제약조건 준수: 반려동물O→동반가능장소, 아이O→가족친화, 장거리/원거리→온라인활동, 차X→대중교통/도보, 술X→카페/디저트만, 인파X→한적한곳
2. 시간맞춤: 30분→간단히, 1시간→여유롭게, 2시간+→깊이있게, 하루종일→풍성하게
3. 사진필수: 모든 미션은 사진인증 가능해야함 (셀카, 음식, 장소, 활동사진)
4. 만남X시: 홈데이트 인증샷, 같은음식 각자인증 등 사진가능한 방식으로
5. 미성년자포함시: drink카테고리 제외
6. 기념일근접시: 1개 이상 기념일 관련 미션 포함
7. MBTI반영: E→사교활동, I→조용한활동, N→창의적, S→현실적, F→감성적, T→분석적

■ 미션품질
- 구체적 활동 제시 (X: 카페가기 → O: 카페에서 버킷리스트 교환하기)
- title 15자이내, description 80자이내
- 한국 데이트 문화 반영

■ 카테고리
Food: cafe, restaurant, streetfood, dessert, cooking, drink, brunch
Place: outdoor, home, travel, daytrip, drive, night, nature
Activity: culture, movie, sports, fitness, wellness, creative, game, shopping, photo, learning
Special: romantic, anniversary, surprise, memory
Online: online, challenge

■ JSON형식
{"missions":[{"title":"","description":"","category":"","tags":["","",""]}]}`;

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
      return {
        id: `ai-${Date.now()}-${index}`,
        title: data.title,
        description: data.description,
        category: data.category as MissionCategory,
        tags: data.tags,
        imageUrl: getRandomImageFromAll(),
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
      tags: ['카페', '대화', '여유'],
      imageUrl: 'https://images.unsplash.com/photo-1548051072-b34898021f8b?w=800',
      isPremium: false,
      moodTags: todayMoods as any,
    },
    {
      id: `fallback-${Date.now()}-2`,
      title: '일몰 보며 산책하기',
      description: '해 질 녘, 손을 잡고 함께 걸어보세요. 하루의 끝을 함께 마무리하는 특별한 시간이 될 거예요.',
      category: 'outdoor',
      tags: ['산책', '일몰', '로맨틱'],
      imageUrl: 'https://images.unsplash.com/photo-1693852512019-cb0eccc97e8f?w=800',
      isPremium: false,
      moodTags: todayMoods as any,
    },
    {
      id: `fallback-${Date.now()}-3`,
      title: '함께 요리하기',
      description: '오늘은 집에서 함께 요리해보는 건 어떨까요? 서로 도우며 만드는 음식은 더욱 맛있답니다.',
      category: 'cooking',
      tags: ['요리', '홈데이트', '협력'],
      imageUrl: 'https://images.unsplash.com/photo-1758522489456-96afe24741dc?w=800',
      isPremium: false,
      moodTags: todayMoods as any,
    },
  ];

  return fallbackMissions;
}
