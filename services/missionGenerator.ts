import OpenAI from 'openai';
import type { Mission, MissionCategory } from '@/types';
import type { OnboardingData, DateWorry } from '@/stores/onboardingStore';
import type { MissionGenerationAnswers } from '@/stores/missionStore';
import { getRandomImage } from '@/constants/missionImages';
import { useLanguageStore } from '@/stores';
import type { SupportedLanguage, CountryCode } from '@/stores';

// ============================================
// Types
// ============================================

export interface WeatherContext {
  temperature: number;
  condition: string;
  season: 'spring' | 'summer' | 'fall' | 'winter';
  isOutdoorFriendly: boolean;
  countryCode: CountryCode;
}

// Mission history summary for deduplication (hybrid approach)
export interface MissionHistorySummary {
  recentTitles: string[];       // Last 30 mission titles
  categoryStats: Record<string, number>;  // Category counts
  totalCompleted: number;
}

interface MissionGenerationInput {
  userAPreferences?: OnboardingData;
  userBPreferences?: OnboardingData;
  todayAnswers: MissionGenerationAnswers;
  location?: { latitude: number; longitude: number };
  missionHistory?: MissionHistorySummary;  // For deduplication
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
// Weather API (OpenWeatherMap) + Country Detection
// ============================================

// Detect country from coordinates using OpenWeatherMap reverse geocoding
async function detectCountryFromCoordinates(latitude: number, longitude: number): Promise<CountryCode> {
  const apiKey = process.env.EXPO_PUBLIC_WEATHER_API_KEY;
  if (!apiKey) return 'DEFAULT';

  try {
    const response = await fetch(
      `https://api.openweathermap.org/geo/1.0/reverse?lat=${latitude}&lon=${longitude}&limit=1&appid=${apiKey}`
    );

    if (!response.ok) return 'DEFAULT';

    const data = await response.json();
    if (data && data.length > 0) {
      const country = data[0].country;
      // Map to supported country codes
      if (country === 'KR') return 'KR';
      if (country === 'US') return 'US';
      if (country === 'GB') return 'GB';
      if (country === 'AU') return 'AU';
      if (country === 'CA') return 'CA';
    }
    return 'DEFAULT';
  } catch (error) {
    console.error('[Country Detection] Failed:', error);
    return 'DEFAULT';
  }
}

async function fetchWeather(latitude: number, longitude: number): Promise<WeatherContext> {
  const apiKey = process.env.EXPO_PUBLIC_WEATHER_API_KEY;

  // Fallback to season-based default if no API key
  if (!apiKey) {
    console.log('[Weather] No API key, using season fallback');
    return getSeasonFallback();
  }

  try {
    // Fetch weather and country in parallel
    const [weatherResponse, countryCode] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`),
      detectCountryFromCoordinates(latitude, longitude),
    ]);

    if (!weatherResponse.ok) {
      throw new Error(`Weather API error: ${weatherResponse.status}`);
    }

    const data = await weatherResponse.json();

    const temp = Math.round(data.main.temp);
    const weatherId = data.weather[0]?.id || 800;
    const weatherMain = data.weather[0]?.main || 'Clear';

    // Determine condition based on country
    const condition = getWeatherCondition(weatherId, weatherMain, countryCode);

    // Determine season
    const season = getCurrentSeason();

    // Determine if outdoor-friendly
    const isOutdoorFriendly = checkOutdoorFriendly(weatherId, temp);

    // Update detected country in store
    useLanguageStore.getState().setDetectedCountry(countryCode);

    return { temperature: temp, condition, season, isOutdoorFriendly, countryCode };
  } catch (error) {
    console.error('[Weather] API fetch failed:', error);
    return getSeasonFallback();
  }
}

function getWeatherCondition(weatherId: number, weatherMain: string, countryCode: CountryCode): string {
  // Weather condition codes: https://openweathermap.org/weather-conditions
  const isKorean = countryCode === 'KR';

  if (weatherId >= 200 && weatherId < 300) return isKorean ? '천둥번개' : 'Thunderstorm';
  if (weatherId >= 300 && weatherId < 400) return isKorean ? '이슬비' : 'Drizzle';
  if (weatherId >= 500 && weatherId < 600) return isKorean ? '비' : 'Rain';
  if (weatherId >= 600 && weatherId < 700) return isKorean ? '눈' : 'Snow';
  if (weatherId >= 700 && weatherId < 800) return isKorean ? '안개' : 'Fog';
  if (weatherId === 800) return isKorean ? '맑음' : 'Clear';
  if (weatherId > 800) return isKorean ? '흐림' : 'Cloudy';
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

function getSeasonFallback(countryCode: CountryCode = 'DEFAULT'): WeatherContext {
  const season = getCurrentSeason();
  const language = useLanguageStore.getState().language;
  const isKorean = language === 'ko';

  const seasonDefaults: Record<string, { temp: number; conditionKo: string; conditionEn: string; outdoor: boolean }> = {
    spring: { temp: 15, conditionKo: '맑음', conditionEn: 'Clear', outdoor: true },
    summer: { temp: 28, conditionKo: '맑음', conditionEn: 'Clear', outdoor: true },
    fall: { temp: 18, conditionKo: '맑음', conditionEn: 'Clear', outdoor: true },
    winter: { temp: 2, conditionKo: '맑음', conditionEn: 'Clear', outdoor: false },
  };
  const defaults = seasonDefaults[season];
  return {
    temperature: defaults.temp,
    condition: isKorean ? defaults.conditionKo : defaults.conditionEn,
    season,
    isOutdoorFriendly: defaults.outdoor,
    countryCode,
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
// Deduplication Context Builder (Token-Efficient)
// ============================================

function buildDeduplicationContext(history: MissionHistorySummary | undefined, language: SupportedLanguage): string {
  if (!history || history.totalCompleted === 0) {
    return '';
  }

  const parts: string[] = [];

  // 1. Recent titles (max 20 for token efficiency, ~100-200 tokens)
  if (history.recentTitles.length > 0) {
    const titlesToInclude = history.recentTitles.slice(0, 20);
    if (language === 'ko') {
      parts.push(`\n🚫 [최근 완료한 미션 - 중복 금지!]`);
      parts.push(`  ${titlesToInclude.join(', ')}`);
    } else {
      parts.push(`\n🚫 [Recently Completed Missions - Avoid Duplicates!]`);
      parts.push(`  ${titlesToInclude.join(', ')}`);
    }
  }

  // 2. Category statistics (very token efficient, ~30-50 tokens)
  if (Object.keys(history.categoryStats).length > 0) {
    // Sort by count (descending) to show most used categories
    const sortedCategories = Object.entries(history.categoryStats)
      .sort((a, b) => b[1] - a[1]);

    // Find underutilized categories
    const allCategories = ['cafe', 'restaurant', 'outdoor', 'home', 'game', 'creative', 'culture', 'photo', 'romantic', 'online'];
    const underusedCategories = allCategories.filter(cat =>
      !history.categoryStats[cat] || history.categoryStats[cat] <= 1
    );

    if (language === 'ko') {
      const statsStr = sortedCategories.map(([cat, count]) => `${cat}(${count})`).join(', ');
      parts.push(`\n📊 [카테고리별 완료 현황]`);
      parts.push(`  ${statsStr}`);

      if (underusedCategories.length > 0) {
        parts.push(`  💡 덜 해본 카테고리: ${underusedCategories.slice(0, 5).join(', ')} → 우선 추천!`);
      }
    } else {
      const statsStr = sortedCategories.map(([cat, count]) => `${cat}(${count})`).join(', ');
      parts.push(`\n📊 [Category Completion Stats]`);
      parts.push(`  ${statsStr}`);

      if (underusedCategories.length > 0) {
        parts.push(`  💡 Less explored: ${underusedCategories.slice(0, 5).join(', ')} → Prioritize these!`);
      }
    }
  }

  return parts.join('\n');
}

// ============================================
// Culture-Specific Prompts
// ============================================

const CULTURE_PROMPTS: Record<string, { culture: string; trends: string; activities: string; food: string; smallJoys: string; seasonal: string; nightViews: string }> = {
  KR: {
    culture: '한국',
    trends: '팝업스토어, 전시회, 원데이클래스, 플리마켓, 북카페, 빈티지샵, 레코드샵, 독립서점, 루프탑바, 야외 영화관, 한강 피크닉, 감성카페 투어',
    activities: '방탈출, 보드게임카페, PC방, 코인노래방, VR게임, 스크린골프, 볼링, 다트바, 오락실, 롤러스케이트장, 클라이밍, 드로잉카페, 도자기공방, 향수공방, 캔들공방, 가죽공예, 꽃꽂이, 쿠킹클래스, 와인클래스',
    food: '전통시장 투어, 길거리 음식, 맛집 웨이팅, 횟집, 고기집, 이자카야, 포장마차, 야시장, 디저트카페, 베이커리 투어, 브런치 맛집, 오마카세, 파인다이닝',
    smallJoys: '편의점 데이트, 다이소 쇼핑, 네컷사진, 스티커사진',
    seasonal: '벚꽃/단풍 명소, 한강 피크닉, 눈 오는 날 데이트',
    nightViews: '드라이브, 루프탑, 야경 맛집, 한강 야경',
  },
  US: {
    culture: 'American',
    trends: 'Pop-up events, art exhibitions, wine tastings, farmers markets, flea markets, vintage shops, record stores, indie bookstores, rooftop bars, outdoor movies, picnics, coffee shop hopping, thrift shopping',
    activities: 'Escape rooms, bowling, mini golf, arcade bars, karaoke nights, trivia nights, axe throwing, go-karting, roller skating, rock climbing, pottery classes, painting classes, cooking classes, wine tasting classes, dance classes, yoga sessions',
    food: 'Brunch spots, food halls, local diners, taco trucks, pizza joints, BBQ joints, ice cream shops, dessert bars, bakery tours, food truck festivals, farm-to-table restaurants, speakeasy bars, rooftop dining',
    smallJoys: 'Dollar store dates, Target runs, photo booth stops, convenience store snack runs',
    seasonal: 'Fall foliage drives, beach days, holiday light displays, spring picnics',
    nightViews: 'Night drives, rooftop bars, city skyline views, stargazing spots',
  },
  DEFAULT: {
    culture: 'local',
    trends: 'pop-up events, exhibitions, workshops, local festivals, vintage shops, bookstores',
    activities: 'escape rooms, game cafes, outdoor activities, cultural experiences, cooking classes, art workshops',
    food: 'local restaurants, street food, cafes, food markets, brunch spots, dessert shops',
    smallJoys: 'convenience store dates, photo booths, window shopping',
    seasonal: 'seasonal festivals, outdoor picnics, weather-appropriate activities',
    nightViews: 'night drives, rooftop spots, scenic viewpoints',
  },
};

// ============================================
// System Prompt Generator (Hybrid: EN headers + localized content)
// ============================================

function getSystemPrompt(countryCode: CountryCode, language: SupportedLanguage): string {
  const cultureData = CULTURE_PROMPTS[countryCode] || CULTURE_PROMPTS.DEFAULT;
  const isKo = language === 'ko';

  // Language-specific content
  const L = isKo ? {
    role: `당신은 ${cultureData.culture} 2030 커플의 데이트 플래너입니다. 인스타그램, 유튜브, 틱톡 트렌드에 밝고, 소소하지만 특별한 순간을 만드는 데 탁월합니다.`,
    philosophy: [
      '"이거 해보고 싶다!" 설렘을 주는 아이디어',
      '자연스럽게 사진 찍고 싶어지는 순간 설계',
      '완료 후 "우리만의 추억"이 남는 경험',
      '대화가 자연스럽게 이어지는 상황',
    ],
    titleRule: 'title: 감성적이고 시적인 문구 (15~25자)',
    titleGood: '"반짝이는 트리 아래, 우리의 겨울", "함께 외치는 응원의 순간"',
    titleBad: '"카페 가기", "방탈출 하기" (너무 직접적)',
    titleHint: '미션명만으로 활동 유추 가능, 구체적 내용은 description에서',
    descRule: 'description: 80자 이내, 구체적으로 "무엇을 하는 미션인지" 설명',
    descExample: '"반짝이는 트리 아래, 우리의 겨울" → "크리스마스 트리 명소에서 함께 사진 찍기"',
    noPrice: '금액 언급 금지 (X: "3000원으로")',
    noFiller: '"후기 나누기", "이야기 나누기" 금지',
    photoNatural: '사진 인증이 자연스러운 활동으로 구성',
    remoteIntro: '커플 중 한 명만 현장에서 직접 사진 촬영하여 인증. 앨범 업로드 불가.',
    remoteStructure: '"둘이 같은 걸 각자 하고, 한 명이 인증" 구조',
    remoteExamples: '같은 책 읽기→페이지 인증, 같은 요리→결과물 인증, 손편지→사진 인증',
    roleMain: '미션1 (메인): 사용자 고민/기분에 가장 적합',
    roleAlt: '미션2 (대안): 비슷하지만 살짝 다른 방향',
    roleSurprise: '미션3 (서프라이즈): 예상 못한 신선한 제안',
    categoryNote: '세 미션의 카테고리는 서로 겹치지 않게!',
    categoryDetails: [
      'creative: DIY, 공예, 원데이클래스, 캔들/향수 만들기, 도자기, 그림, 가죽공예 등',
      'culture: 전시회, 미술관, 박물관, 공연, 콘서트, 연극',
      'learning: 언어교환, 스터디, 강연, 세미나',
      'wellness: 스파, 마사지, 온천, 명상, 요가',
    ],
    categoryWarning: '위 목록에 없는 카테고리(diy, craft, workshop 등) 절대 금지!',
    respond: '반드시 한국어로 응답하세요.',
  } : {
    role: `You are a date planner for couples in their 20s-30s familiar with ${cultureData.culture} culture. You excel at creating small but special moments, keeping up with Instagram, YouTube, and TikTok trends.`,
    philosophy: [
      'Ideas that spark excitement: "I want to try this!"',
      'Design moments that naturally make couples want to take photos',
      'Experiences that create "our special memories" after completion',
      'Situations where conversation flows naturally',
    ],
    titleRule: 'title: Emotional, poetic phrase (8-15 words)',
    titleGood: '"Under the Sparkling Lights, Our Winter Story", "Cheering Together, Hearts United"',
    titleBad: '"Go to a cafe", "Do escape room" (too direct)',
    titleHint: 'Title alone should hint at activity, details go in description',
    descRule: 'description: Under 80 chars, clearly explain "what the mission is"',
    descExample: '"Under the Sparkling Lights, Our Winter Story" → "Take photos together at a popular Christmas tree spot"',
    noPrice: 'Never mention prices (X: "for $5")',
    noFiller: 'No filler phrases like "share thoughts"',
    photoNatural: 'Activities should naturally lend themselves to photo verification',
    remoteIntro: 'Only one partner takes a photo on-site for verification. No album uploads.',
    remoteStructure: 'Structure: "Both do the same thing separately, one verifies"',
    remoteExamples: 'Same book→verify page, Same recipe→verify result, Handwritten letter→photo',
    roleMain: 'Mission 1 (Main): Best match for user concerns/mood',
    roleAlt: 'Mission 2 (Alternative): Similar but slightly different',
    roleSurprise: 'Mission 3 (Surprise): Unexpected fresh suggestion',
    categoryNote: 'Three missions should have different categories!',
    categoryDetails: [
      'creative: DIY, crafts, one-day classes, candle/perfume making, pottery, painting, leather crafts',
      'culture: Exhibitions, art museums, museums, performances, concerts, theater',
      'learning: Language exchange, study sessions, lectures, seminars',
      'wellness: Spa, massage, hot springs, meditation, yoga',
    ],
    categoryWarning: 'Categories not in list (diy, craft, workshop, etc.) strictly prohibited!',
    respond: 'Respond in English.',
  };

  return `${L.role}

## Mission Design Philosophy
1. ${L.philosophy[0]}
2. ${L.philosophy[1]}
3. ${L.philosophy[2]}
4. ${L.philosophy[3]}

## ${cultureData.culture} Date Culture
- Trends: ${cultureData.trends}
- Small joys: ${cultureData.smallJoys}
- Seasonal: ${cultureData.seasonal}
- Night views: ${cultureData.nightViews}
- Activities: ${cultureData.activities}
- Food: ${cultureData.food}

## Mission Writing Rules
1. ${L.titleRule}
   - Good: ${L.titleGood}
   - Bad: ${L.titleBad}
   - ${L.titleHint}
2. ${L.descRule}
   - Example: ${L.descExample}
3. ${L.noPrice}
4. ${L.noFiller}
5. ${L.photoNatural}

## Remote Mission Rules (Important!)
- ${L.remoteIntro}
- ${L.remoteStructure}
- Examples: ${L.remoteExamples}

## Mission Role Distribution
- ${L.roleMain}
- ${L.roleAlt}
- ${L.roleSurprise}
※ ${L.categoryNote}

## Category List (Must use one!)
Food: cafe, restaurant, streetfood, dessert, cooking, drink, brunch
Place: outdoor, home, travel, daytrip, drive, night, nature
Activity: culture, movie, sports, fitness, wellness, creative, game, shopping, photo, learning
Special: romantic, anniversary, surprise, memory
Online: online, challenge

### Category Details
- ${L.categoryDetails[0]}
- ${L.categoryDetails[1]}
- ${L.categoryDetails[2]}
- ${L.categoryDetails[3]}
⚠️ ${L.categoryWarning}

## JSON Output Format
{"missions":[{"title":"","description":"","category":"","tags":["","",""]}]}

${L.respond}`;
}

// ============================================
// Few-shot Examples (Language-specific)
// ============================================

function getFewShotExamples(_language: SupportedLanguage): string {
  // Note: Korean cultural nuances are provided via CULTURE_PROMPTS.KR
  // English examples are sufficient for teaching JSON format structure
  return `
## Good Mission Examples (When Meeting) - Emotional title + Specific description

[Romantic/Emotional]
{"title":"Under the Sparkling Lights, Our Winter Story","description":"Take photos together at a popular Christmas tree spot","category":"romantic","tags":["Christmas","lights","hotspot"]}
{"title":"Cozy Corner, Warm Sips","description":"Enjoy specialty drinks at a cozy cafe while watching the winter scenery","category":"cafe","tags":["cozy","cafe","winter"]}
{"title":"City Nights, Cheers to Us","description":"Sip signature cocktails at a rooftop bar with a view","category":"drink","tags":["rooftop","nightview","cocktails"]}
{"title":"Click, Our Moments Captured","description":"Tour trendy photo booths and create a photo strip collection","category":"photo","tags":["photobooth","photos","fun"]}

[Activities]
{"title":"Solving Mysteries, Side by Side","description":"Team up to conquer an escape room challenge together","category":"game","tags":["escaperoom","teamwork","game"]}
{"title":"Beyond Reality, Into Adventure","description":"Experience a virtual reality date at a VR gaming zone","category":"game","tags":["VR","gaming","experience"]}
{"title":"Our Recipe for Happiness","description":"Learn to cook together at a one-day cooking class","category":"cooking","tags":["cooking","class","experience"]}
{"title":"Serious Competition, Hilarious Ending","description":"Challenge each other at an arcade - loser plans the next date!","category":"game","tags":["arcade","competition","fun"]}
{"title":"Cheering Together, Hearts United","description":"Watch a live game and cheer passionately together","category":"sports","tags":["sports","cheering","excitement"]}

[Food Adventures]
{"title":"Flavors Down Every Alley","description":"Explore a local market sampling street food together","category":"streetfood","tags":["market","streetfood","tour"]}
{"title":"Our Secret Recipe, Store Edition","description":"Create custom combo meals at a convenience store and rate them","category":"streetfood","tags":["convenience","combo","challenge"]}
{"title":"Our Hidden Gem Discovery","description":"Find and try a hidden local restaurant with few reviews","category":"restaurant","tags":["hidden","local","discovery"]}

[Unique/Fresh]
{"title":"Silly but Fun, That's Just Us","description":"Pick useless but hilarious gifts for each other at a dollar store","category":"shopping","tags":["shopping","gifts","laughter"]}
{"title":"Destiny Picks Our Drinks","description":"Close your eyes and randomly point at the cafe menu","category":"cafe","tags":["random","challenge","cafe"]}
{"title":"Seven Poses, One Perfect Strip","description":"Challenge yourselves to 7 different poses at a photo booth","category":"photo","tags":["photobooth","challenge","photos"]}
{"title":"To the End of the Line, Our Spontaneous Trip","description":"Hop on the first bus that arrives and ride to the last stop","category":"daytrip","tags":["spontaneous","adventure","trip"]}
{"title":"A Day with You and Our Furry Friend","description":"Visit a pet-friendly cafe or park with your pet","category":"outdoor","tags":["pet","walk","relaxing"]}

[Relaxation]
{"title":"Warm Waters, Timeless Moments","description":"Relax and unwind at a spa or hot springs together","category":"wellness","tags":["spa","relaxation","wellness"]}
{"title":"Turning Pages Together","description":"Read books at a book cafe and share favorite passages","category":"cafe","tags":["bookcafe","reading","cozy"]}
{"title":"A Scent That's Uniquely You","description":"Create custom perfumes for each other at a fragrance workshop","category":"creative","tags":["perfume","workshop","gift"]}

[Anniversary Special Missions]
{"title":"Preserving Today, Forever","description":"Order a photo book with today's pictures","category":"anniversary","tags":["anniversary","photobook","memories"]}
{"title":"Sweet Celebration, Wishes Made","description":"Blow out candles on a custom cake and make wishes together","category":"anniversary","tags":["cake","anniversary","romantic"]}
{"title":"A Promise Sealed, Together","description":"Pick out matching couple rings or bracelets together","category":"anniversary","tags":["rings","gift","anniversary"]}
{"title":"Letters to Our Future Selves","description":"Write letters to each other to open in one year","category":"romantic","tags":["timecapsule","letter","promise"]}
{"title":"Whispered Wishes Under the Stars","description":"Watch the night sky and share wishes with each other","category":"romantic","tags":["stars","nightview","romantic"]}

---
## Missions When You Can't Meet (One person takes photo on-site for verification)

{"title":"Dreams for Our Tomorrow","description":"Write a bucket list of things to do together next year","category":"online","tags":["bucketlist","planning","photo"]}
{"title":"Same Page, Different Places","description":"Read the same book and verify with page photos","category":"online","tags":["reading","book","verification"]}
{"title":"Words from the Heart, Ink on Paper","description":"Write a handwritten letter and share a photo","category":"online","tags":["letter","heartfelt","analog"]}
{"title":"Same Scene, Different Couches","description":"Watch the same movie simultaneously and verify with screen photos","category":"online","tags":["movie","watching","verification"]}
{"title":"Same Taste, Miles Apart","description":"Cook the same recipe separately and share result photos","category":"online","tags":["cooking","challenge","verification"]}
`;
}

// ============================================
// User Prompt Generator (Language-specific)
// ============================================

function getUserPrompt(
  contextString: string,
  fewShotExamples: string,
  language: SupportedLanguage,
  deduplicationContext: string
): string {
  if (language === 'ko') {
    return `다음 상황의 커플을 위한 데이트 미션 3개를 생성해주세요.

${contextString}
${deduplicationContext}

---
💡 [미션 다양성 유지 - 중요!]
- 🚫 위 "최근 완료한 미션"과 비슷한 미션 절대 금지
- 💡 "덜 해본 카테고리" 위주로 새로운 경험 추천
- 창의적이고 신선한 아이디어 우선
- 같은 장소/활동 유형 반복 금지

---
참고할 좋은 예시들:
${fewShotExamples}

---
위 정보를 바탕으로 이 커플에게 딱 맞는 미션 3개를 JSON으로 생성해주세요.
반드시 JSON 형식으로만 응답하세요.`;
  }

  // English prompt
  return `Please generate 3 date missions for the following couple's situation.

${contextString}
${deduplicationContext}

---
💡 [Mission Diversity - Important!]
- 🚫 NEVER suggest missions similar to "Recently Completed" above
- 💡 Prioritize "Less explored" categories for new experiences
- Focus on creative and fresh ideas
- Avoid repeating same places/activity types

---
Reference examples:
${fewShotExamples}

---
Based on the above information, generate 3 perfectly matched missions for this couple in JSON format.
Respond only in JSON format.`;
}

// ============================================
// Main Generation Function
// ============================================

export async function generateMissionsWithAI(input: MissionGenerationInput): Promise<Mission[]> {
  const openai = getOpenAIClient();
  const { todayMoods } = input.todayAnswers;

  // Get user's language preference
  const language = useLanguageStore.getState().language;

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

  // Build deduplication context from mission history (token-efficient)
  const deduplicationContext = buildDeduplicationContext(input.missionHistory, language);

  // Get language-specific prompts
  const systemPrompt = getSystemPrompt(weather.countryCode, language);
  const fewShotExamples = getFewShotExamples(language);
  const userPrompt = getUserPrompt(contextString, fewShotExamples, language, deduplicationContext);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
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
// Fallback Function (Language-aware)
// ============================================

export function generateMissionsFallback(todayMoods: string[]): Mission[] {
  const language = useLanguageStore.getState().language;

  // Language-specific fallback missions
  const fallbackMissions: Mission[] = language === 'ko'
    ? [
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
      ]
    : [
        {
          id: `fallback-${Date.now()}-1`,
          title: 'Photo Booth Adventure',
          description: 'Strike fun poses at a photo booth and collect memories',
          category: 'photo' as MissionCategory,
          tags: ['photobooth', 'photos', 'memories'],
          imageUrl: getRandomImage('photo'),
          isPremium: false,
          moodTags: todayMoods as any,
        },
        {
          id: `fallback-${Date.now()}-2`,
          title: 'Escape Room Challenge',
          description: 'Team up to solve puzzles and escape together',
          category: 'game' as MissionCategory,
          tags: ['escaperoom', 'game', 'teamwork'],
          imageUrl: getRandomImage('game'),
          isPremium: false,
          moodTags: todayMoods as any,
        },
        {
          id: `fallback-${Date.now()}-3`,
          title: 'Cozy Cafe Exploration',
          description: 'Find a charming cafe and enjoy drinks together',
          category: 'cafe' as MissionCategory,
          tags: ['cafe', 'cozy', 'date'],
          imageUrl: getRandomImage('cafe'),
          isPremium: false,
          moodTags: todayMoods as any,
        },
      ];

  return fallbackMissions;
}
