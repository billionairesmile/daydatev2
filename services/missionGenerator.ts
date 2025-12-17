import OpenAI from 'openai';
import type { Mission, MissionCategory } from '@/types';
import type { OnboardingData, DateWorry } from '@/stores/onboardingStore';
import type { MissionGenerationAnswers } from '@/stores/missionStore';
import { getRandomImage } from '@/constants/missionImages';

// ============================================
// Types
// ============================================

export interface WeatherContext {
  temperature: number;
  condition: string;
  season: 'spring' | 'summer' | 'fall' | 'winter';
  isOutdoorFriendly: boolean;
}

interface MissionGenerationInput {
  userAPreferences?: OnboardingData;
  userBPreferences?: OnboardingData;
  todayAnswers: MissionGenerationAnswers;
  location?: { latitude: number; longitude: number };
}

interface GeneratedMissionData {
  title: string;
  description: string;
  category: string;
  tags: string[];
}

// ============================================
// OpenAI Client
// ============================================

const getOpenAIClient = () => {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key not found. Please check .env file.');
  }
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
};

// ============================================
// Weather API (OpenWeatherMap)
// ============================================

async function fetchWeather(latitude: number, longitude: number): Promise<WeatherContext> {
  const apiKey = process.env.EXPO_PUBLIC_WEATHER_API_KEY;

  // Fallback to season-based default if no API key
  if (!apiKey) {
    console.log('[Weather] No API key, using season fallback');
    return getSeasonFallback();
  }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric&lang=kr`
    );

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();

    const temp = Math.round(data.main.temp);
    const weatherId = data.weather[0]?.id || 800;
    const weatherMain = data.weather[0]?.main || 'Clear';

    // Determine condition in Korean
    const condition = getKoreanCondition(weatherId, weatherMain);

    // Determine season
    const season = getCurrentSeason();

    // Determine if outdoor-friendly
    const isOutdoorFriendly = checkOutdoorFriendly(weatherId, temp);

    return { temperature: temp, condition, season, isOutdoorFriendly };
  } catch (error) {
    console.error('[Weather] API fetch failed:', error);
    return getSeasonFallback();
  }
}

function getKoreanCondition(weatherId: number, weatherMain: string): string {
  // Weather condition codes: https://openweathermap.org/weather-conditions
  if (weatherId >= 200 && weatherId < 300) return '천둥번개';
  if (weatherId >= 300 && weatherId < 400) return '이슬비';
  if (weatherId >= 500 && weatherId < 600) return '비';
  if (weatherId >= 600 && weatherId < 700) return '눈';
  if (weatherId >= 700 && weatherId < 800) return '안개';
  if (weatherId === 800) return '맑음';
  if (weatherId > 800) return '흐림';
  return weatherMain;
}

function getCurrentSeason(): 'spring' | 'summer' | 'fall' | 'winter' {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

function checkOutdoorFriendly(weatherId: number, temp: number): boolean {
  // Bad weather conditions
  if (weatherId >= 200 && weatherId < 700) return false; // Rain, snow, thunderstorm
  if (weatherId >= 700 && weatherId < 800) return false; // Fog, mist
  // Extreme temperatures
  if (temp < -5 || temp > 33) return false;
  return true;
}

function getSeasonFallback(): WeatherContext {
  const season = getCurrentSeason();
  const seasonDefaults: Record<string, { temp: number; condition: string; outdoor: boolean }> = {
    spring: { temp: 15, condition: '맑음', outdoor: true },
    summer: { temp: 28, condition: '맑음', outdoor: true },
    fall: { temp: 18, condition: '맑음', outdoor: true },
    winter: { temp: 2, condition: '맑음', outdoor: false },
  };
  const defaults = seasonDefaults[season];
  return {
    temperature: defaults.temp,
    condition: defaults.condition,
    season,
    isOutdoorFriendly: defaults.outdoor,
  };
}

// ============================================
// Helper Functions
// ============================================

function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

interface AnniversaryInfo {
  upcoming: string[];
  isToday: boolean;
  todayLabel: string | null;
}

function getAnniversaryInfo(
  relationshipType: string | undefined,
  anniversaryDate: Date | string | null | undefined
): AnniversaryInfo {
  if (!anniversaryDate) return { upcoming: [], isToday: false, todayLabel: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const annDate = new Date(anniversaryDate);
  annDate.setHours(0, 0, 0, 0);

  const upcomingAnniversaries: string[] = [];
  let isToday = false;
  let todayLabel: string | null = null;

  const daysPassed = Math.floor((today.getTime() - annDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  // Check day milestones (100일, 200일, etc.)
  if (relationshipType === 'dating') {
    const milestones = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1500, 2000];
    for (const milestone of milestones) {
      const daysUntil = milestone - daysPassed;
      if (daysUntil === 0) {
        // Today is the milestone!
        isToday = true;
        todayLabel = `${milestone}일`;
      } else if (daysUntil > 0 && daysUntil <= 14) {
        upcomingAnniversaries.push(`${milestone}일 (D-${daysUntil})`);
      }
    }
  }

  // Check yearly anniversaries
  for (let year = 1; year <= 50; year++) {
    const yearlyDate = new Date(annDate);
    yearlyDate.setFullYear(annDate.getFullYear() + year);
    yearlyDate.setHours(0, 0, 0, 0);

    const daysUntil = Math.ceil((yearlyDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    if (daysUntil === 0) {
      // Today is the yearly anniversary!
      isToday = true;
      todayLabel = relationshipType === 'married' ? `결혼 ${year}주년` : `연애 ${year}주년`;
      break;
    } else if (daysUntil > 0 && daysUntil <= 30) {
      const label = relationshipType === 'married' ? `결혼 ${year}주년` : `연애 ${year}주년`;
      upcomingAnniversaries.push(`${label} (D-${daysUntil})`);
      break;
    } else if (daysUntil > 30) {
      break;
    }
  }

  return { upcoming: upcomingAnniversaries, isToday, todayLabel };
}

// ============================================
// Context Builder (Priority-based)
// ============================================

function buildContext(
  input: MissionGenerationInput,
  weather: WeatherContext,
  combinedDateWorries: { shared: DateWorry[]; userAOnly: DateWorry[]; userBOnly: DateWorry[] }
): string {
  const parts: string[] = [];
  const { canMeetToday, availableTime, todayMoods } = input.todayAnswers;

  // === 1순위: 제약사항 (MUST HAVE) ===
  const allConstraints: string[] = [];
  if (input.userAPreferences?.constraints) {
    allConstraints.push(...input.userAPreferences.constraints);
  }
  if (input.userBPreferences?.constraints) {
    allConstraints.push(...input.userBPreferences.constraints);
  }
  const uniqueConstraints = [...new Set(allConstraints)].filter(c => c !== 'none');

  if (uniqueConstraints.length > 0) {
    const constraintDescriptions: Record<string, string> = {
      pet: '반려동물 동반 → 펫 프렌들리 장소만',
      child: '아이 동반 → 가족친화 장소/활동',
      long_distance: '장거리 연애 → 온라인/비대면 활동 위주',
      far_distance: '원거리 연애 → 온라인/비대면 활동 위주',
      no_car: '차 없음 → 대중교통/도보 접근 가능한 곳만',
      no_alcohol: '술 안함 → 카페/디저트/비주류 장소만',
      avoid_crowd: '인파 기피 → 한적한 장소, 비인기 시간대, 예약제',
    };
    const constraintList = uniqueConstraints.map(c => constraintDescriptions[c] || c).join('\n  - ');
    parts.push(`🚨 [필수 제약 - 위반 시 미션 무효]\n  - ${constraintList}`);
  }

  // === 2순위: MBTI 조합 (25%) ===
  const mbtiA = input.userAPreferences?.mbti;
  const mbtiB = input.userBPreferences?.mbti;
  if (mbtiA || mbtiB) {
    const mbtiContext = analyzeMBTICombination(mbtiA, mbtiB);
    parts.push(`[MBTI] ${mbtiA || '?'} + ${mbtiB || '?'} → ${mbtiContext}`);
  }

  // === 3순위: 데이트 고민 (25%) - 양쪽 고민 종합 ===
  const worryDescriptions: Record<DateWorry, { emoji: string; short: string; detail: string }> = {
    'no_idea': { emoji: '🤷', short: '뭐할지 모름', detail: '쉬운 입문용~특별한 경험 다양하게' },
    'same_pattern': { emoji: '🔄', short: '맨날 똑같음', detail: '새롭고 신선한 경험, 트렌드/핫플/이색 데이트' },
    'budget': { emoji: '💵', short: '돈 부담', detail: '무료~저예산 활동, 집/공원/동네 활용' },
    'time': { emoji: '⏰', short: '시간 부족', detail: '30분~1시간 완료, 이동 최소화' },
    'talk': { emoji: '💬', short: '대화 필요', detail: '자연스럽게 대화 유도, 서로 알아가는 활동' },
    'none': { emoji: '✨', short: '그냥 재밌게', detail: 'FUN 최우선, 활동적이고 신나는 미션' },
  };

  // 공통 고민 (둘 다 같은 고민)
  if (combinedDateWorries.shared.length > 0) {
    const sharedList = combinedDateWorries.shared
      .map(w => `${worryDescriptions[w].emoji} ${worryDescriptions[w].short}`)
      .join(', ');
    parts.push(`\n🎯 [둘 다 공통 고민 - 최우선 반영!]`);
    parts.push(`  ${sharedList}`);
    combinedDateWorries.shared.forEach(w => {
      parts.push(`  → ${worryDescriptions[w].detail}`);
    });
  }

  // 한쪽만 있는 고민 (보조 반영)
  const oneSideWorries = [...combinedDateWorries.userAOnly, ...combinedDateWorries.userBOnly];
  if (oneSideWorries.length > 0) {
    const uniqueOneSide = [...new Set(oneSideWorries)];
    const oneSideList = uniqueOneSide
      .map(w => `${worryDescriptions[w].emoji} ${worryDescriptions[w].short}`)
      .join(', ');
    parts.push(`\n💭 [한쪽 고민 - 가능하면 반영]`);
    parts.push(`  ${oneSideList}`);
  }

  // 고민이 없으면 기본 전략
  if (combinedDateWorries.shared.length === 0 && oneSideWorries.length === 0) {
    parts.push(`\n💡 특별한 고민 없음 → FUN 최우선! 웃음 포인트 필수, 활동적이고 신나는 미션`);
  }

  // === 4순위: 오늘 기분 + 만남여부 + 시간 (15%) ===
  const moodMap: Record<string, string> = {
    fun: '웃음가득', deep_talk: '깊은대화', active: '활동적',
    healing: '힐링', culture: '문화감성', adventure: '모험도전', romantic: '로맨틱',
  };
  const timeMap: Record<string, string> = {
    '30min': '30분', '1hour': '1시간', '2hour': '2시간+', 'allday': '하루종일',
  };
  const moodStr = todayMoods.map(m => moodMap[m] || m).join(', ');
  parts.push(`\n[오늘 상황]`);
  parts.push(`  - 만남: ${canMeetToday ? '⭕ 만날 수 있음' : '❌ 못 만남 (한 명이 현장 인증)'}`);
  parts.push(`  - 시간: ${timeMap[availableTime]}`);
  parts.push(`  - 기분: ${moodStr}`);

  // === 5순위: 날씨/계절 (10%) ===
  const seasonEmoji: Record<string, string> = {
    spring: '🌸', summer: '☀️', fall: '🍂', winter: '❄️',
  };
  const seasonKor: Record<string, string> = {
    spring: '봄', summer: '여름', fall: '가을', winter: '겨울',
  };
  parts.push(`\n[날씨] ${seasonEmoji[weather.season]} ${seasonKor[weather.season]} | ${weather.condition} ${weather.temperature}°C | 야외활동: ${weather.isOutdoorFriendly ? '적합' : '부적합'}`);

  // === 6순위: 선호 활동 (5%) ===
  const allActivities = [
    ...(input.userAPreferences?.activityTypes || []),
    ...(input.userBPreferences?.activityTypes || []),
  ];
  if (allActivities.length > 0) {
    const uniqueActivities = [...new Set(allActivities)];
    parts.push(`[선호 활동] ${uniqueActivities.join(', ')}`);
  }

  // === 기념일 (있으면 반영) ===
  const anniversaryInfo = getAnniversaryInfo(
    input.userAPreferences?.relationshipType,
    input.userAPreferences?.anniversaryDate
  );

  if (anniversaryInfo.isToday && anniversaryInfo.todayLabel) {
    // 기념일 당일! 3개 모두 기념일 관련 미션
    parts.push(`\n🎊🎊🎊 [오늘은 ${anniversaryInfo.todayLabel}!!!] 🎊🎊🎊`);
    parts.push(`→ 오늘은 특별한 날! 3개 미션 전부 기념일/특별한 날 테마로 생성!`);
    parts.push(`→ 로맨틱하고 기억에 남을 특별한 데이트 미션만!`);
    parts.push(`→ 카테고리: romantic, anniversary, surprise, memory 위주`);
  } else if (anniversaryInfo.upcoming.length > 0) {
    parts.push(`\n🎉 [다가오는 기념일] ${anniversaryInfo.upcoming.join(', ')} → 기념일 관련 미션 1개 이상 포함!`);
  }

  // === 미성년자 체크 ===
  let isAnyUserUnder19 = false;
  if (input.userAPreferences?.birthDate) {
    if (calculateAge(new Date(input.userAPreferences.birthDate)) < 19) isAnyUserUnder19 = true;
  }
  if (input.userBPreferences?.birthDate) {
    if (calculateAge(new Date(input.userBPreferences.birthDate)) < 19) isAnyUserUnder19 = true;
  }
  if (isAnyUserUnder19) {
    parts.push(`\n⚠️ [미성년자 포함] drink 카테고리 절대 금지`);
  }

  return parts.join('\n');
}

function analyzeMBTICombination(mbtiA?: string, mbtiB?: string): string {
  if (!mbtiA && !mbtiB) return '';

  const hints: string[] = [];
  const a = mbtiA || '';
  const b = mbtiB || '';

  // E/I 분석
  const eCount = (a.includes('E') ? 1 : 0) + (b.includes('E') ? 1 : 0);
  if (eCount === 2) hints.push('활발한 사교활동 OK');
  else if (eCount === 0) hints.push('조용하고 프라이빗한 공간 선호');
  else hints.push('둘만의 시간 + 약간의 외부 자극');

  // N/S 분석
  const nCount = (a.includes('N') ? 1 : 0) + (b.includes('N') ? 1 : 0);
  if (nCount === 2) hints.push('창의적/예술적 활동');
  else if (nCount === 0) hints.push('현실적/맛집탐방');

  // F/T 분석
  const fCount = (a.includes('F') ? 1 : 0) + (b.includes('F') ? 1 : 0);
  if (fCount === 2) hints.push('감성/로맨틱');
  else if (fCount === 0) hints.push('게임/퀴즈/분석적');

  // J/P 분석
  const jCount = (a.includes('J') ? 1 : 0) + (b.includes('J') ? 1 : 0);
  if (jCount === 2) hints.push('계획적 데이트, 예약 필수');
  else if (jCount === 0) hints.push('즉흥적/자유로운 동선');

  return hints.join(', ');
}

// ============================================
// System Prompt
// ============================================

const SYSTEM_PROMPT = `당신은 한국 2030 커플의 데이트 플래너입니다.
인스타그램, 유튜브, 틱톡 트렌드에 밝고, 소소하지만 특별한 순간을 만드는 데 탁월합니다.

## 미션 설계 철학
1. "이거 해보고 싶다!" 설렘을 주는 아이디어
2. 자연스럽게 사진 찍고 싶어지는 순간 설계
3. 완료 후 "우리만의 추억"이 남는 경험
4. 대화가 자연스럽게 이어지는 상황

## 한국 데이트 문화 반영
- 핫플레이스: 성수, 연남, 을지로, 익선동, 망원, 한남, 삼청동, 가로수길
- 트렌드: 팝업스토어, 전시회, 원데이클래스, 플리마켓, 북카페
- 소확행: 편의점 데이트, 다이소 쇼핑, 네컷사진, 스티커사진
- 계절: 벚꽃/단풍 명소, 한강 피크닉, 눈 오는 날 데이트
- 야경: 드라이브, 루프탑, 야경 맛집, 한강 야경
- 활동: 방탈출, 보드게임카페, PC방, 코인노래방, VR게임
- 먹거리: 전통시장 투어, 길거리 음식, 맛집 웨이팅

## 미션 작성 규칙
1. title: 감성적이고 시적인 문구로 작성 (15~25자)
   - 좋은 예: "반짝이는 트리 아래, 우리의 겨울", "함께 외치는 응원의 순간", "우리, 그리고 반려견과의 하루"
   - 나쁜 예: "카페 가기", "방탈출 하기", "맛집 탐방" (너무 직접적이고 평범함)
   - 미션명만으로도 어떤 활동인지 유추 가능해야 함 (구체적인 내용은 description에서 보충)
   - 단어가 중간에 끊기지 않도록 작성 (한 단어가 줄에 다 안 들어가면 그 단어 전체를 다음 줄에 작성)
2. description: 80자 이내, 미션이 무엇인지 구체적으로 설명
   - 미션명이 감성적인 만큼 description은 명확하게 "무엇을 하는 미션인지" 설명
   - 예: title "반짝이는 트리 아래, 우리의 겨울" → description "크리스마스 트리 명소에서 함께 사진 찍기"
3. 금액 언급 절대 금지 (X: "3000원으로", "무료로")
4. "후기 나누기", "이야기 나누기" 같은 부가 설명 금지
5. 사진 인증이 자연스러운 활동으로 구성

## 만나지 못할 때 미션 규칙 (중요!)
- 커플 중 한 명만 현장에서 직접 사진 촬영하여 인증
- 앨범에서 기존 사진 업로드 불가능
- "둘이 같은 걸 각자 하고, 한 명이 인증" 구조
- 예시:
  - 같은 책 읽기 → 읽고 있는 페이지 인증
  - 같은 요리 만들기 → 결과물 인증
  - 손편지 쓰기 → 편지 사진 인증
  - 같은 영화 보기 → 보는 중 화면 인증

## 미션 역할 분담 (3개 생성 시)
- 미션1 (메인): 사용자 고민과 기분에 가장 적합한 추천
- 미션2 (대안): 비슷하지만 살짝 다른 방향의 옵션
- 미션3 (서프라이즈): 예상 못한 신선한 제안, 약간의 도전

※ 세 미션의 카테고리는 서로 겹치지 않게!

## 카테고리 목록 (반드시 이 중 하나만 사용!)
Food: cafe, restaurant, streetfood, dessert, cooking, drink, brunch
Place: outdoor, home, travel, daytrip, drive, night, nature
Activity: culture, movie, sports, fitness, wellness, creative, game, shopping, photo, learning
Special: romantic, anniversary, surprise, memory
Online: online, challenge

### 카테고리 상세 설명 (중요!)
- creative: DIY, 공예, 원데이클래스, 캔들/향수/비누 만들기, 도자기, 그림, 꽃꽂이, 가죽공예, 뜨개질, 레진아트, 네일아트 등 모든 만들기/체험 활동
- culture: 전시회, 미술관, 박물관, 공연, 콘서트, 연극 등 문화생활
- learning: 언어교환, 스터디, 강연, 세미나 등 학습 활동
- wellness: 스파, 마사지, 온천, 명상, 요가 등 힐링 활동

⚠️ 위 목록에 없는 카테고리(diy, craft, workshop, class 등)는 절대 사용 금지!

## JSON 출력 형식
{"missions":[{"title":"","description":"","category":"","tags":["","",""]}]}`;

// ============================================
// Few-shot Examples
// ============================================

const FEW_SHOT_EXAMPLES = `
## 좋은 미션 예시 (만났을 때) - 감성적인 title + 구체적인 description

[감성/로맨틱]
{"title":"반짝이는 트리 아래, 우리의 겨울","description":"올해 뜨는 크리스마스 트리 명소에서 함께 인증샷 남기기","category":"romantic","tags":["크리스마스","트리","핫플"]}
{"title":"고즈넉한 처마 아래, 차 한 잔","description":"한옥카페에서 따뜻한 전통차 마시며 겨울 풍경 감상하기","category":"cafe","tags":["한옥","카페","감성"]}
{"title":"도시의 밤, 너와 건배","description":"야경이 보이는 루프탑바에서 시그니처 칵테일 즐기기","category":"drink","tags":["루프탑","야경","칵테일"]}
{"title":"찰칵, 우리의 순간들","description":"요즘 뜨는 포토부스 돌면서 네컷사진 컬렉션 만들기","category":"photo","tags":["포토부스","네컷","투어"]}

[액티비티]
{"title":"함께 풀어가는 비밀의 방","description":"둘이서 머리 맞대고 방탈출 게임 클리어하기","category":"game","tags":["방탈출","협동","게임"]}
{"title":"현실을 넘어, 가상의 모험","description":"VR 게임존에서 가상현실 속 데이트 즐기기","category":"game","tags":["VR","게임","체험"]}
{"title":"우리가 만든 한 끼의 행복","description":"원데이 쿠킹클래스에서 함께 요리 배우기","category":"cooking","tags":["쿠킹클래스","요리","체험"]}
{"title":"진지한 승부, 웃긴 결말","description":"오락실에서 다트, 볼링, 사격 대결하기. 진 사람이 다음 데이트 계획!","category":"game","tags":["오락실","대결","볼링"]}
{"title":"함께 외치는 응원의 순간","description":"야구장이나 경기장에서 같이 응원하며 열정 폭발하기","category":"sports","tags":["경기관람","응원","스포츠"]}

[먹거리]
{"title":"골목 사이로 번지는 추억의 맛","description":"전통시장 돌아다니며 길거리 음식 먹방 투어하기","category":"streetfood","tags":["전통시장","먹방","투어"]}
{"title":"우리만의 레시피, 편의점 에디션","description":"편의점에서 각자 조합 메뉴 만들어서 맛 평가 대결하기","category":"streetfood","tags":["편의점","조합","대결"]}
{"title":"아무도 모르는 우리만의 맛집","description":"리뷰 10개 미만의 숨은 로컬 맛집 탐방하기","category":"restaurant","tags":["맛집","로컬","탐방"]}

[이색/신선]
{"title":"쓸데없지만 웃긴, 그게 우리야","description":"다이소에서 서로에게 쓸데없지만 웃긴 선물 골라주기","category":"shopping","tags":["다이소","선물","웃음"]}
{"title":"운명에 맡긴 오늘의 음료","description":"카페에서 눈 감고 메뉴판 짚어서 나온 거 마시기","category":"cafe","tags":["랜덤","도전","카페"]}
{"title":"7가지 표정, 하나의 네컷","description":"인생네컷에서 7가지 다른 포즈 챌린지 도전하기","category":"photo","tags":["인생네컷","챌린지","사진"]}
{"title":"종점까지, 우리의 즉흥 여행","description":"먼저 오는 버스 타고 종점까지 떠나보기","category":"daytrip","tags":["즉흥","버스","모험"]}
{"title":"우리, 그리고 반려견과의 하루","description":"반려동물과 함께 펫프렌들리 카페나 공원 나들이하기","category":"outdoor","tags":["반려동물","산책","힐링"]}

[힐링]
{"title":"따뜻한 물 속, 흘러가는 시간","description":"온천이나 스파에서 따뜻하게 릴랙스하기","category":"wellness","tags":["스파","온천","힐링"]}
{"title":"같은 페이지를 넘기는 우리","description":"북카페에서 같이 책 읽다가 좋은 구절 공유하기","category":"cafe","tags":["북카페","독서","감성"]}
{"title":"너를 담은 향기 한 병","description":"향수 공방에서 서로에게 어울리는 향수 직접 만들어주기","category":"creative","tags":["향수","공방","선물"]}

[기념일 당일 특별 미션]
{"title":"오늘을 영원히 담아두는 법","description":"오늘 찍은 사진들로 포토북 주문해두기","category":"anniversary","tags":["기념일","포토북","추억"]}
{"title":"달콤한 축하, 촛불 앞의 소원","description":"레터링 케이크 앞에서 함께 촛불 끄고 소원 빌기","category":"anniversary","tags":["케이크","기념일","로맨틱"]}
{"title":"손끝에 새기는 우리의 약속","description":"기념일 기념 커플링이나 팔찌 함께 고르러 가기","category":"anniversary","tags":["커플링","선물","기념일"]}
{"title":"그날의 우리로 돌아가는 시간","description":"처음 만났던 그 장소 다시 가서 추억 회상하기","category":"memory","tags":["첫만남","추억","회상"]}
{"title":"미래의 우리에게 보내는 편지","description":"서로에게 편지 써서 1년 뒤 열어보기로 약속하기","category":"romantic","tags":["타임캡슐","편지","약속"]}
{"title":"밤하늘 아래, 속삭이는 소원","description":"야경 좋은 곳에서 별 보며 서로 소원 말해주기","category":"romantic","tags":["별","야경","로맨틱"]}
{"title":"오늘 밤은 우리만의 만찬","description":"분위기 좋은 레스토랑에서 코스요리 즐기기","category":"anniversary","tags":["디너","레스토랑","기념일"]}
{"title":"흘러간 시간 속 우리의 발자취","description":"지금까지 찍은 사진들 보며 그때 이야기 나누기","category":"memory","tags":["추억","사진","대화"]}
{"title":"손끝으로 전하는 마음 한 줄","description":"미리 준비한 손편지 서로 읽어주기","category":"romantic","tags":["손편지","감동","사랑"]}

---
## 만나지 못할 때 미션 예시 (한 명이 현장에서 직접 촬영하여 인증)

{"title":"내년의 우리를 그리며","description":"내년에 함께 하고 싶은 버킷리스트 적어서 사진 찍기","category":"online","tags":["버킷리스트","계획","사진"]}
{"title":"같은 페이지, 다른 공간","description":"같은 책 정해서 각자 읽고 읽는 중인 페이지 인증하기","category":"online","tags":["독서","책","인증"]}
{"title":"펜 끝에서 전해지는 마음","description":"손으로 직접 편지 써서 사진 찍어 보내기","category":"online","tags":["손편지","감동","아날로그"]}
{"title":"같은 장면, 다른 소파","description":"같은 영화 동시에 틀어놓고 보는 중 화면 인증하기","category":"online","tags":["영화","동시시청","인증"]}
{"title":"떨어져 있어도 같은 맛","description":"같은 레시피로 각자 요리해서 결과물 인증하기","category":"online","tags":["요리","챌린지","인증"]}
{"title":"너를 위해 고른 멜로디","description":"상대방을 위한 플레이리스트 만들어서 캡처 공유하기","category":"online","tags":["음악","플리","선물"]}
{"title":"100일 뒤의 우리에게","description":"100일 뒤에 열어볼 편지 써서 사진으로 인증하기","category":"online","tags":["편지","미래","약속"]}
{"title":"오늘의 나, 너에게 보여줄게","description":"오늘 입은 전신 코디 사진 서로 공유하기","category":"online","tags":["패션","일상","공유"]}
`;

// ============================================
// Main Generation Function
// ============================================

export async function generateMissionsWithAI(input: MissionGenerationInput): Promise<Mission[]> {
  const openai = getOpenAIClient();
  const { todayMoods } = input.todayAnswers;

  // Get weather (with fallback)
  let weather: WeatherContext;
  if (input.location) {
    weather = await fetchWeather(input.location.latitude, input.location.longitude);
  } else {
    weather = getSeasonFallback();
  }

  // Combine dateWorries from both users
  const userAWorries = (input.userAPreferences?.dateWorries || []) as DateWorry[];
  const userBWorries = (input.userBPreferences?.dateWorries || []) as DateWorry[];

  // Find shared worries (both users have) and unique worries
  const shared = userAWorries.filter(w => userBWorries.includes(w) && w !== 'none');
  const userAOnly = userAWorries.filter(w => !userBWorries.includes(w) && w !== 'none');
  const userBOnly = userBWorries.filter(w => !userAWorries.includes(w) && w !== 'none');

  const combinedDateWorries = { shared, userAOnly, userBOnly };

  // Build context with priority
  const contextString = buildContext(input, weather, combinedDateWorries);

  // Build user prompt
  const userPrompt = `다음 상황의 커플을 위한 데이트 미션 3개를 생성해주세요.

${contextString}

---
💡 [미션 다양성 유지]
매번 새롭고 다양한 미션을 생성해주세요:
- 비슷한 패턴의 미션 반복 금지
- 창의적이고 신선한 아이디어 우선
- 다양한 카테고리와 활동 유형을 골고루 활용

---
참고할 좋은 예시들:
${FEW_SHOT_EXAMPLES}

---
위 정보를 바탕으로 이 커플에게 딱 맞는 미션 3개를 JSON으로 생성해주세요.
반드시 JSON 형식으로만 응답하세요.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.9,
      max_tokens: 2500,
      presence_penalty: 0.7,
      frequency_penalty: 0.4,
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
    const missions: Mission[] = missionsData.slice(0, 3).map((data, index) => ({
      id: `ai-${Date.now()}-${index}`,
      title: data.title,
      description: data.description,
      category: data.category as MissionCategory,
      tags: data.tags,
      imageUrl: getRandomImage(data.category as MissionCategory),
      isPremium: false,
      moodTags: todayMoods,
    }));

    return missions;
  } catch (error) {
    console.error('[MissionGenerator] Error:', error);
    throw error;
  }
}

// ============================================
// Fallback Function (계절 무관)
// ============================================

export function generateMissionsFallback(todayMoods: string[]): Mission[] {
  // 계절에 상관없이 언제든 할 수 있는 미션들
  const fallbackMissions: Mission[] = [
    {
      id: `fallback-${Date.now()}-1`,
      title: '네컷사진 챌린지',
      description: '포토부스에서 다양한 포즈로 네컷사진 찍기',
      category: 'photo' as MissionCategory,
      tags: ['네컷사진', '포토부스', '추억'],
      imageUrl: getRandomImage('photo'),
      isPremium: false,
      moodTags: todayMoods as any,
    },
    {
      id: `fallback-${Date.now()}-2`,
      title: '방탈출 카페 도전',
      description: '협동해서 방탈출 게임 클리어하기',
      category: 'game' as MissionCategory,
      tags: ['방탈출', '게임', '협동'],
      imageUrl: getRandomImage('game'),
      isPremium: false,
      moodTags: todayMoods as any,
    },
    {
      id: `fallback-${Date.now()}-3`,
      title: '분위기 좋은 카페 탐방',
      description: '인스타 감성 카페에서 음료 마시며 수다 떨기',
      category: 'cafe' as MissionCategory,
      tags: ['카페', '감성', '데이트'],
      imageUrl: getRandomImage('cafe'),
      isPremium: false,
      moodTags: todayMoods as any,
    },
  ];

  return fallbackMissions;
}
