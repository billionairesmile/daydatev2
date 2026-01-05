import OpenAI from 'openai';
import type { Mission, MissionCategory } from '@/types';
import type { OnboardingData, DateWorry } from '@/stores/onboardingStore';
import type { MissionGenerationAnswers } from '@/stores/missionStore';
import { getRandomImage, getUniqueRandomImages } from '@/constants/missionImages';
// Import directly from individual store files to avoid require cycle
import { useLanguageStore, type SupportedLanguage, type CountryCode } from '@/stores/languageStore';
import { useSubscriptionStore, SUBSCRIPTION_LIMITS } from '@/stores/subscriptionStore';

// ============================================
// Types
// ============================================

// 6 Region Classification (v3)
export type RegionCode =
  | 'EAST_ASIA'       // Korea, Japan, Taiwan, Hong Kong, China
  | 'SOUTHEAST_ASIA'  // Thailand, Vietnam, Indonesia, Philippines, Singapore, Malaysia
  | 'NORTH_AMERICA'   // USA, Canada
  | 'EUROPE'          // European countries
  | 'LATIN_AMERICA'   // South & Central America
  | 'DEFAULT';        // Others (India, Middle East, Africa, Oceania, etc.)

// Season types for different climate zones
export type SeasonType =
  | 'spring' | 'summer' | 'fall' | 'winter'  // 4 seasons (temperate)
  | 'dry' | 'rainy'                           // Dry/Rainy (tropical)
  | 'mild';                                   // Year-round mild (equatorial)

export interface WeatherContext {
  temperature: number;
  condition: string;
  season: SeasonType;
  seasonLabel: string;
  isOutdoorFriendly: boolean;
  countryCode: CountryCode;
  regionCode: RegionCode;
}

// Mission history summary for deduplication (hybrid approach)
export interface MissionHistorySummary {
  recentTitles: string[];       // Last 30 mission titles
  categoryStats: Record<string, number>;  // Category counts
  totalCompleted: number;
}

// Excluded mission info for refresh (to avoid duplicates)
export interface ExcludedMission {
  title: string;
  category: string;
}

// Custom anniversary type for mission generation
export interface CustomAnniversaryForMission {
  label: string;
  targetDate: Date;
  isYearly?: boolean;
}

interface MissionGenerationInput {
  userAPreferences?: OnboardingData;
  userBPreferences?: OnboardingData;
  todayAnswers: MissionGenerationAnswers;
  location?: { latitude: number; longitude: number };
  missionHistory?: MissionHistorySummary;  // For deduplication
  excludedMissions?: ExcludedMission[];  // Missions to exclude (for refresh - original missions)
  customAnniversaries?: CustomAnniversaryForMission[];  // User-created anniversaries
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
async function detectCountryFromCoordinates(latitude: number, longitude: number): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
  if (!apiKey) return 'DEFAULT';

  try {
    const response = await fetch(
      `https://api.openweathermap.org/geo/1.0/reverse?lat=${latitude}&lon=${longitude}&limit=1&appid=${apiKey}`
    );

    if (!response.ok) return 'DEFAULT';

    const data = await response.json();
    if (data && data.length > 0) {
      return data[0].country || 'DEFAULT';
    }
    return 'DEFAULT';
  } catch (error) {
    console.error('[Country Detection] Failed:', error);
    return 'DEFAULT';
  }
}

// ============================================
// Region Code Mapping (6 Regions - v3)
// ============================================

function getRegionCode(countryCode: string): RegionCode {
  const regionMap: Record<string, RegionCode> = {
    // ===== East Asia (Anniversary culture, cafes, photo spots) =====
    'KR': 'EAST_ASIA',  // Korea
    'JP': 'EAST_ASIA',  // Japan
    'TW': 'EAST_ASIA',  // Taiwan
    'HK': 'EAST_ASIA',  // Hong Kong
    'CN': 'EAST_ASIA',  // China
    'MO': 'EAST_ASIA',  // Macau

    // ===== Southeast Asia (Night markets, tropical, food-centric) =====
    'TH': 'SOUTHEAST_ASIA',  // Thailand
    'VN': 'SOUTHEAST_ASIA',  // Vietnam
    'ID': 'SOUTHEAST_ASIA',  // Indonesia
    'PH': 'SOUTHEAST_ASIA',  // Philippines
    'SG': 'SOUTHEAST_ASIA',  // Singapore
    'MY': 'SOUTHEAST_ASIA',  // Malaysia
    'MM': 'SOUTHEAST_ASIA',  // Myanmar
    'KH': 'SOUTHEAST_ASIA',  // Cambodia
    'LA': 'SOUTHEAST_ASIA',  // Laos

    // ===== North America (Casual, outdoor, sports) =====
    'US': 'NORTH_AMERICA',  // USA
    'CA': 'NORTH_AMERICA',  // Canada

    // ===== Europe (Independence, natural flow, wine/terrace) =====
    'GB': 'EUROPE',  // UK
    'FR': 'EUROPE',  // France
    'DE': 'EUROPE',  // Germany
    'IT': 'EUROPE',  // Italy
    'ES': 'EUROPE',  // Spain
    'NL': 'EUROPE',  // Netherlands
    'PT': 'EUROPE',  // Portugal
    'BE': 'EUROPE',  // Belgium
    'CH': 'EUROPE',  // Switzerland
    'AT': 'EUROPE',  // Austria
    'SE': 'EUROPE',  // Sweden
    'NO': 'EUROPE',  // Norway
    'DK': 'EUROPE',  // Denmark
    'FI': 'EUROPE',  // Finland
    'IE': 'EUROPE',  // Ireland
    'PL': 'EUROPE',  // Poland
    'CZ': 'EUROPE',  // Czech Republic
    'GR': 'EUROPE',  // Greece
    'HU': 'EUROPE',  // Hungary
    'RO': 'EUROPE',  // Romania

    // ===== Latin America (Passionate, family OK, dance/music) =====
    'BR': 'LATIN_AMERICA',  // Brazil
    'MX': 'LATIN_AMERICA',  // Mexico
    'AR': 'LATIN_AMERICA',  // Argentina
    'CO': 'LATIN_AMERICA',  // Colombia
    'CL': 'LATIN_AMERICA',  // Chile
    'PE': 'LATIN_AMERICA',  // Peru
    'VE': 'LATIN_AMERICA',  // Venezuela
    'EC': 'LATIN_AMERICA',  // Ecuador
    'GT': 'LATIN_AMERICA',  // Guatemala
    'CU': 'LATIN_AMERICA',  // Cuba
    'DO': 'LATIN_AMERICA',  // Dominican Republic
    'CR': 'LATIN_AMERICA',  // Costa Rica
    'PA': 'LATIN_AMERICA',  // Panama
    'UY': 'LATIN_AMERICA',  // Uruguay
    'PR': 'LATIN_AMERICA',  // Puerto Rico
  };

  return regionMap[countryCode] || 'DEFAULT';
}

// ============================================
// Season Detection (Tropical/Southern Hemisphere)
// ============================================

function getSeason(
  regionCode: RegionCode,
  countryCode: string,
  month: number
): { season: SeasonType; label: string } {
  // ===== Southeast Asia: Dry/Rainy season =====
  if (regionCode === 'SOUTHEAST_ASIA') {
    // Roughly: Rainy May-Oct, Dry Nov-Apr (varies by country)
    if (month >= 5 && month <= 10) {
      return { season: 'rainy', label: 'Rainy Season' };
    }
    return { season: 'dry', label: 'Dry Season' };
  }

  // ===== Southern Hemisphere: Reversed seasons =====
  const southernCountries = ['AU', 'NZ', 'AR', 'CL', 'UY', 'ZA', 'BR'];
  if (southernCountries.includes(countryCode)) {
    if (month >= 3 && month <= 5) return { season: 'fall', label: 'Fall' };
    if (month >= 6 && month <= 8) return { season: 'winter', label: 'Winter' };
    if (month >= 9 && month <= 11) return { season: 'spring', label: 'Spring' };
    return { season: 'summer', label: 'Summer' };
  }

  // ===== Equatorial (Year-round warm): Mild =====
  const equatorialCountries = ['SG', 'EC', 'CO', 'KE', 'ID'];
  if (equatorialCountries.includes(countryCode)) {
    return { season: 'mild', label: 'Year-round Warm' };
  }

  // ===== Northern Hemisphere default (4 seasons) =====
  if (month >= 3 && month <= 5) return { season: 'spring', label: 'Spring' };
  if (month >= 6 && month <= 8) return { season: 'summer', label: 'Summer' };
  if (month >= 9 && month <= 11) return { season: 'fall', label: 'Fall' };
  return { season: 'winter', label: 'Winter' };
}

async function fetchWeather(latitude: number, longitude: number): Promise<WeatherContext> {
  const apiKey = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;

  // Fallback to season-based default if no API key
  if (!apiKey) {
    console.log('[Weather] No API key (EXPO_PUBLIC_OPENWEATHER_API_KEY), using season fallback');
    return getSeasonFallback();
  }

  try {
    // Fetch weather and country in parallel
    const [weatherResponse, rawCountryCode] = await Promise.all([
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

    // Get region code from country
    const regionCode = getRegionCode(rawCountryCode);

    // Determine condition based on language preference
    const language = useLanguageStore.getState().language;
    const condition = getWeatherCondition(weatherId, weatherMain, language);

    // Determine season based on region and hemisphere
    const month = new Date().getMonth() + 1;
    const { season, label: seasonLabel } = getSeason(regionCode, rawCountryCode, month);

    // Determine if outdoor-friendly
    const isOutdoorFriendly = checkOutdoorFriendly(weatherId, temp);

    // Update detected country in store (map to CountryCode type)
    const countryCode = mapToCountryCode(rawCountryCode);
    useLanguageStore.getState().setDetectedCountry(countryCode);

    return { temperature: temp, condition, season, seasonLabel, isOutdoorFriendly, countryCode, regionCode };
  } catch (error) {
    console.error('[Weather] API fetch failed:', error);
    return getSeasonFallback();
  }
}

// Map raw country code to supported CountryCode type
function mapToCountryCode(rawCode: string): CountryCode {
  const supportedCodes: CountryCode[] = ['KR', 'US', 'GB', 'AU', 'CA', 'DEFAULT'];
  return supportedCodes.includes(rawCode as CountryCode) ? (rawCode as CountryCode) : 'DEFAULT';
}

function getWeatherCondition(weatherId: number, weatherMain: string, language: SupportedLanguage): string {
  // Weather condition codes: https://openweathermap.org/weather-conditions
  const isKorean = language === 'ko';

  if (weatherId >= 200 && weatherId < 300) return isKorean ? '천둥번개' : 'Thunderstorm';
  if (weatherId >= 300 && weatherId < 400) return isKorean ? '이슬비' : 'Drizzle';
  if (weatherId >= 500 && weatherId < 600) return isKorean ? '비' : 'Rain';
  if (weatherId >= 600 && weatherId < 700) return isKorean ? '눈' : 'Snow';
  if (weatherId >= 700 && weatherId < 800) return isKorean ? '안개' : 'Fog';
  if (weatherId === 800) return isKorean ? '맑음' : 'Clear';
  if (weatherId > 800) return isKorean ? '흐림' : 'Cloudy';
  return weatherMain;
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
  const language = useLanguageStore.getState().language;
  const isKorean = language === 'ko';
  const regionCode = getRegionCode(countryCode);
  const month = new Date().getMonth() + 1;
  const { season, label: seasonLabel } = getSeason(regionCode, countryCode, month);

  // Get temperature based on season type
  const tempDefaults: Record<string, number> = {
    spring: 15, summer: 28, fall: 18, winter: 2,
    dry: 30, rainy: 28, mild: 27,
  };
  const outdoorDefaults: Record<string, boolean> = {
    spring: true, summer: true, fall: true, winter: false,
    dry: true, rainy: false, mild: true,
  };

  return {
    temperature: tempDefaults[season] || 20,
    condition: isKorean ? '맑음' : 'Clear',
    season,
    seasonLabel,
    isOutdoorFriendly: outdoorDefaults[season] ?? true,
    countryCode,
    regionCode,
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

// Parse date string as local date (not UTC) to avoid timezone issues
// Handles both simple date strings and ISO timestamps
function parseDateAsLocal(dateString: string | Date): Date {
  if (dateString instanceof Date) {
    return new Date(dateString.getFullYear(), dateString.getMonth(), dateString.getDate());
  }

  // If it's an ISO timestamp (contains T), parse as Date first to get correct local time
  // e.g., "1990-01-02T15:00:00.000Z" represents Jan 3 00:00 in KST (UTC+9)
  if (dateString.includes('T')) {
    const d = new Date(dateString);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // If it's a simple date string like "1990-01-03", parse as local
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getAnniversaryInfo(
  relationshipType: string | undefined,
  anniversaryDate: Date | string | null | undefined
): AnniversaryInfo {
  if (!anniversaryDate) return { upcoming: [], isToday: false, todayLabel: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const annDate = parseDateAsLocal(anniversaryDate);
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

    // Use Math.round for accurate day calculation (avoids floating-point issues)
    const daysUntil = Math.round((yearlyDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

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

// Check custom (user-created) anniversaries within D-7
function getCustomAnniversaryInfo(
  customAnniversaries?: CustomAnniversaryForMission[]
): AnniversaryInfo {
  if (!customAnniversaries || customAnniversaries.length === 0) {
    return { upcoming: [], isToday: false, todayLabel: null };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingAnniversaries: string[] = [];
  let isToday = false;
  let todayLabel: string | null = null;

  for (const anniversary of customAnniversaries) {
    let targetDate = new Date(anniversary.targetDate);
    targetDate.setHours(0, 0, 0, 0);

    // For yearly anniversaries, find the next occurrence
    if (anniversary.isYearly) {
      const thisYear = today.getFullYear();
      targetDate.setFullYear(thisYear);

      // If the date has passed this year, check next year
      if (targetDate < today) {
        targetDate.setFullYear(thisYear + 1);
      }
    }

    const daysUntil = Math.ceil((targetDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    if (daysUntil === 0) {
      // Today is the anniversary!
      isToday = true;
      todayLabel = anniversary.label;
    } else if (daysUntil > 0 && daysUntil <= 7) {
      // Within D-7
      upcomingAnniversaries.push(`${anniversary.label} (D-${daysUntil})`);
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

  // Check custom anniversaries (user-created) within D-7
  const customAnniversaryInfo = getCustomAnniversaryInfo(input.customAnniversaries);

  // Combine all anniversary information
  const allUpcoming = [...anniversaryInfo.upcoming, ...customAnniversaryInfo.upcoming];
  const isAnyAnniversaryToday = anniversaryInfo.isToday || customAnniversaryInfo.isToday;
  const todayLabels = [anniversaryInfo.todayLabel, customAnniversaryInfo.todayLabel].filter(Boolean);

  if (isAnyAnniversaryToday && todayLabels.length > 0) {
    // 기념일 당일! 3개 모두 기념일 관련 미션
    parts.push(`\n🎊🎊🎊 [오늘은 ${todayLabels.join(', ')}!!!] 🎊🎊🎊`);
    parts.push(`→ 오늘은 특별한 날! 3개 미션 전부 기념일/특별한 날 테마로 생성!`);
    parts.push(`→ 로맨틱하고 기억에 남을 특별한 데이트 미션만!`);
    parts.push(`→ 카테고리: romantic, anniversary, surprise, memory 위주`);
  } else if (allUpcoming.length > 0) {
    parts.push(`\n🎉 [다가오는 기념일] ${allUpcoming.join(', ')} → 기념일 관련 미션 1개 이상 반드시 포함!`);
    parts.push(`→ 기념일 준비를 위한 미션 (선물 준비, 데이트 계획, 서프라이즈 등) 필수!`);
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
// Keyword Extraction for Deduplication (v4)
// ============================================

// Common activity/theme keywords to extract and blacklist
const ACTIVITY_KEYWORDS = {
  // Activity types (EN)
  activities_en: [
    'stroll', 'walk', 'hike', 'hiking', 'explore', 'exploring', 'visit', 'watch', 'watching',
    'photography', 'photo', 'photos', 'picture', 'pictures', 'shoot', 'shooting',
    'workshop', 'class', 'lesson', 'cooking', 'baking', 'crafting', 'making',
    'market', 'shopping', 'hunt', 'hunting', 'tour', 'touring', 'adventure',
    'picnic', 'brunch', 'dinner', 'lunch', 'breakfast', 'tasting', 'sampling',
    'game', 'games', 'puzzle', 'escape', 'challenge', 'competition',
    'movie', 'film', 'cinema', 'marathon', 'binge',
    'yoga', 'meditation', 'spa', 'massage', 'wellness', 'relaxation',
    'running', 'jogging', 'cycling', 'biking', 'swimming', 'workout',
    'dance', 'dancing', 'singing', 'karaoke', 'concert', 'performance',
    'reading', 'book', 'books', 'study', 'learning', 'museum', 'gallery', 'exhibition',
    'drive', 'driving', 'road trip', 'stargazing', 'sunrise', 'sunset',
  ],
  // Place/theme keywords (EN)
  places_en: [
    'park', 'beach', 'mountain', 'hill', 'river', 'lake', 'ocean', 'sea', 'forest', 'garden',
    'cafe', 'coffee', 'bakery', 'restaurant', 'bar', 'pub', 'rooftop',
    'street', 'alley', 'neighborhood', 'downtown', 'old town', 'plaza',
    'night', 'evening', 'morning', 'dawn', 'dusk', 'golden hour',
    'winter', 'summer', 'spring', 'fall', 'autumn', 'seasonal', 'holiday',
    'art', 'artisan', 'craft', 'diy', 'handmade', 'creative',
    'lights', 'illumination', 'lantern', 'candle', 'bonfire',
    'temple', 'shrine', 'church', 'cathedral', 'palace', 'castle',
    'local', 'hidden', 'secret', 'cozy', 'vintage', 'retro',
  ],
  // Activity types (KO)
  activities_ko: [
    '산책', '걷기', '하이킹', '등산', '탐방', '탐험', '방문', '구경', '감상',
    '사진', '촬영', '포토', '스냅', '찍기',
    '워크샵', '클래스', '수업', '요리', '베이킹', '만들기', '공예', 'DIY',
    '시장', '마켓', '장보기', '쇼핑', '투어', '어드벤처', '모험',
    '피크닉', '브런치', '저녁', '점심', '아침', '맛집', '먹방', '시식',
    '게임', '퍼즐', '방탈출', '챌린지', '대결', '시합',
    '영화', '넷플릭스', '시네마', '마라톤', '정주행',
    '요가', '명상', '스파', '마사지', '힐링', '휴식',
    '러닝', '조깅', '자전거', '수영', '운동', '헬스',
    '춤', '댄스', '노래', '노래방', '콘서트', '공연',
    '독서', '책', '공부', '학습', '미술관', '갤러리', '전시',
    '드라이브', '별보기', '일출', '일몰', '노을',
  ],
  // Place/theme keywords (KO)
  places_ko: [
    '공원', '해변', '바다', '산', '강', '호수', '숲', '정원', '뷰',
    '카페', '커피', '빵집', '레스토랑', '맛집', '바', '루프탑',
    '거리', '골목', '동네', '시내', '구시가', '광장',
    '밤', '야경', '저녁', '아침', '새벽', '황혼',
    '겨울', '여름', '봄', '가을', '계절', '명절',
    '예술', '아트', '공예', '수공예', '핸드메이드', '창작',
    '조명', '불빛', '등불', '캔들', '모닥불',
    '절', '성당', '교회', '사찰', '궁', '성',
    '로컬', '숨은', '비밀', '아늑한', '빈티지', '레트로',
    '야시장', '푸드', '스트릿',
  ],
};

/**
 * Extract keywords from recent mission titles and descriptions
 * These keywords will be blacklisted to prevent similar missions
 */
function extractKeywordsFromHistory(
  titles: string[],
  descriptions: string[] = []
): { activityKeywords: string[]; themeKeywords: string[] } {
  const allText = [...titles, ...descriptions].join(' ').toLowerCase();

  const activityKeywords = new Set<string>();
  const themeKeywords = new Set<string>();

  // Extract activity keywords
  [...ACTIVITY_KEYWORDS.activities_en, ...ACTIVITY_KEYWORDS.activities_ko].forEach(keyword => {
    if (allText.includes(keyword.toLowerCase())) {
      activityKeywords.add(keyword);
    }
  });

  // Extract theme/place keywords
  [...ACTIVITY_KEYWORDS.places_en, ...ACTIVITY_KEYWORDS.places_ko].forEach(keyword => {
    if (allText.includes(keyword.toLowerCase())) {
      themeKeywords.add(keyword);
    }
  });

  return {
    activityKeywords: Array.from(activityKeywords).slice(0, 15), // Limit to prevent token bloat
    themeKeywords: Array.from(themeKeywords).slice(0, 15),
  };
}

// ============================================
// Deduplication Context Builder (Token-Efficient)
// ============================================

function buildDeduplicationContext(history: MissionHistorySummary | undefined): string {
  if (!history || history.totalCompleted === 0) {
    return '';
  }

  const parts: string[] = [];

  // 1. Recent titles (max 15 for token efficiency)
  if (history.recentTitles.length > 0) {
    const titlesToInclude = history.recentTitles.slice(0, 15);
    parts.push(`RECENT (avoid): ${titlesToInclude.join(', ')}`);
  }

  // 2. Extract and blacklist keywords (combined, max 10)
  if (history.recentTitles.length > 0) {
    const { activityKeywords, themeKeywords } = extractKeywordsFromHistory(history.recentTitles);
    const allKeywords = [...activityKeywords, ...themeKeywords].slice(0, 10);
    if (allKeywords.length > 0) {
      parts.push(`FORBIDDEN: ${allKeywords.join(', ')}`);
    }
  }

  // 3. Category guidance (overused/underused)
  if (Object.keys(history.categoryStats).length > 0) {
    const sortedCategories = Object.entries(history.categoryStats)
      .sort((a, b) => b[1] - a[1]);

    const overusedCategories = sortedCategories
      .filter(([_, count]) => count >= 3)
      .map(([cat]) => cat);

    const allCategories = [
      'cafe', 'restaurant', 'outdoor', 'home', 'game', 'creative', 'culture',
      'photo', 'romantic', 'online', 'fitness', 'sports', 'wellness',
      'learning', 'cooking', 'challenge', 'movie', 'night', 'nature'
    ];
    const underusedCategories = allCategories.filter(cat =>
      !history.categoryStats[cat] || history.categoryStats[cat] <= 1
    );

    if (overusedCategories.length > 0) {
      parts.push(`OVERUSED: ${overusedCategories.join(', ')}`);
    }
    if (underusedCategories.length > 0) {
      parts.push(`PRIORITIZE: ${underusedCategories.slice(0, 5).join(', ')}`);
    }
  }

  return parts.length > 0 ? `\n[HISTORY]\n${parts.join('\n')}` : '';
}

// ============================================
// Excluded Missions Context (for Refresh - CRITICAL)
// ============================================

function buildExcludedMissionsContext(excludedMissions: ExcludedMission[] | undefined, language: SupportedLanguage): string {
  if (!excludedMissions || excludedMissions.length === 0) {
    return '';
  }

  const parts: string[] = [];
  const titles = excludedMissions.map(m => m.title);
  const categories = [...new Set(excludedMissions.map(m => m.category))];

  if (language === 'ko') {
    parts.push(`\n🚨🚨🚨 [절대 금지 - 오늘 이미 받은 미션! 100% 다른 미션 생성 필수!] 🚨🚨🚨`);
    parts.push(`❌ 금지된 미션 제목: ${titles.join(' | ')}`);
    parts.push(`❌ 금지된 카테고리: ${categories.join(', ')} - 이 카테고리들은 사용 금지!`);
    parts.push(`\n⚠️ 위 미션들과 유사하거나 같은 활동, 같은 장소 유형도 금지!`);
    parts.push(`✅ 완전히 다른 카테고리, 완전히 새로운 활동만 생성하세요!`);
    parts.push(`✅ 예: 카페→야외활동, 게임→문화체험, 사진→요리 등 완전히 다른 방향으로!`);
  } else {
    parts.push(`\n🚨🚨🚨 [STRICTLY FORBIDDEN - Already received today! MUST generate 100% different missions!] 🚨🚨🚨`);
    parts.push(`❌ Forbidden mission titles: ${titles.join(' | ')}`);
    parts.push(`❌ Forbidden categories: ${categories.join(', ')} - DO NOT use these categories!`);
    parts.push(`\n⚠️ Similar activities, same activity types, and same place types are also FORBIDDEN!`);
    parts.push(`✅ Generate COMPLETELY different categories and ENTIRELY new activities!`);
    parts.push(`✅ Example: cafe→outdoor, game→culture, photo→cooking - completely different direction!`);
  }

  return parts.join('\n');
}

// ============================================
// Culture-Specific Prompts (6 Regions - v3)
// ============================================

interface CulturePrompt {
  toneGuide: string;
  trends: string;
  freeActivities: string[];
  paidActivities: string;
  food: string;
  seasonal: Record<string, string>;
  coupleStyle: string;
  anniversaryStyle: string;
}

const CULTURE_PROMPTS: Record<RegionCode, CulturePrompt> = {
  EAST_ASIA: {
    toneGuide: '감성적, 로맨틱, 기념일 강조, 포토스팟 중심, 섬세한 표현',
    trends: '팝업스토어, 전시회, 플리마켓, 감성카페, 야경명소, 네컷사진',
    freeActivities: [
      '한강/강변 자전거',
      '공원 피크닉',
      '야경 드라이브',
      '일출/일몰 산책',
      '동네 산책',
      '편의점 데이트',
      '집에서 영화',
      '별 보기',
      '무료 전시회',
      '야시장 구경',
    ],
    paidActivities: '방탈출, 보드게임카페, 원데이클래스, VR게임, 볼링, 노래방',
    food: '맛집투어, 카페투어, 야시장, 포장마차, 디저트카페, 브런치',
    seasonal: {
      spring: '벚꽃/매화, 피크닉, 꽃구경',
      summer: '물놀이, 야외페스티벌, 빙수, 야경',
      fall: '단풍, 코스모스, 갈대밭, 억새',
      winter: '일루미네이션, 온천, 눈 데이트, 크리스마스',
    },
    coupleStyle: '100일 기념일 중요, 커플템, SNS 공유 활발, 스킨십 중간',
    anniversaryStyle: '100일, 200일, 300일... 일수 기념일 중요시',
  },
  SOUTHEAST_ASIA: {
    toneGuide: 'Casual, food-centric, night market culture, tropical vibes, temple/nature mix',
    trends: 'Night markets, street food tours, temple visits, beach trips, cafe hopping, rooftop bars',
    freeActivities: [
      'Night market strolls',
      'Beach walks',
      'Temple visits',
      'Street food hopping',
      'Park walks (evening)',
      'Motorbike sunset rides',
      'Watching sunset at beach',
      'Home cooking together',
      'Free cultural events',
      'River/canal walks',
    ],
    paidActivities: 'Spa/massage, cooking classes, island hopping, cafe hopping, rooftop bars',
    food: 'Street food, night markets, local cafes, seafood spots, tropical fruits',
    seasonal: {
      dry: 'Beach trips, island hopping, outdoor temples, night markets, outdoor dining',
      rainy: 'Indoor cafes, shopping malls, spa/massage, cooking classes, museum visits',
    },
    coupleStyle: 'Family-oriented, moderate PDA, food dates very important, relaxed vibe',
    anniversaryStyle: 'Yearly anniversaries, less focus on day counts',
  },
  NORTH_AMERICA: {
    toneGuide: 'Casual, fun, activity-focused, spontaneous, direct expression',
    trends: 'Farmers markets, food trucks, craft breweries, hiking trails, sports events, road trips',
    freeActivities: [
      'Hiking/trail walks',
      'Beach walks',
      'Park picnics',
      'Stargazing',
      'City bike rides',
      'Window shopping',
      'Home movie night',
      'Sunrise/sunset watching',
      'Free outdoor concerts',
      'Neighborhood exploration',
    ],
    paidActivities: 'Escape rooms, bowling, mini golf, axe throwing, go-karting, sports games',
    food: 'Brunch spots, food halls, diners, BBQ, ice cream shops, craft breweries',
    seasonal: {
      spring: 'Cherry blossoms, outdoor picnics, hiking',
      summer: 'Beach days, outdoor concerts, BBQ, road trips',
      fall: 'Fall foliage drives, pumpkin patches, apple picking',
      winter: 'Holiday lights, ice skating, cozy cafes, ski trips',
    },
    coupleStyle: 'Anniversary > day counts, dutch pay common, direct expressions, casual PDA',
    anniversaryStyle: 'Yearly anniversaries only, monthly not common',
  },
  EUROPE: {
    toneGuide: 'Relaxed, independent, natural flow, less emphasis on milestones, quality time',
    trends: 'Cafe terraces, wine bars, walking tours, museums, vintage markets, local bistros',
    freeActivities: [
      'River/canal walks',
      'Park strolls',
      'City cycling',
      'Sunset watching',
      'Window shopping old town',
      'Home cooking together',
      'Picnic in plaza',
      'Free museum days',
      'Street performer watching',
      'Architecture walks',
    ],
    paidActivities: 'Wine tasting, cooking classes, boat tours, theater, gallery visits, spa',
    food: 'Cafe terraces, wine bars, local bistros, street markets, bakeries, cheese shops',
    seasonal: {
      spring: 'Outdoor terraces, flower markets, canal walks',
      summer: 'Beach towns, festivals, rooftop bars, outdoor dining',
      fall: 'Wine harvest, cozy pubs, autumn walks, harvest festivals',
      winter: 'Christmas markets, mulled wine, cozy cafes, winter walks',
    },
    coupleStyle: 'Independence valued, less anniversary focus, natural progression, PDA normal',
    anniversaryStyle: 'Less emphasis on anniversaries, Valentine\'s seen as commercial',
  },
  LATIN_AMERICA: {
    toneGuide: 'Passionate, expressive, family-friendly OK, music/dance welcome, romantic gestures big',
    trends: 'Dancing spots, beach clubs, street food tours, live music, family gatherings, festivals',
    freeActivities: [
      'Beach walks',
      'Plaza strolls',
      'Dancing in the park',
      'Street food hopping',
      'Sunset at the beach',
      'Home cooking together',
      'Walking the malecon',
      'Free concerts/events',
      'People watching at plaza',
      'Neighborhood festivals',
    ],
    paidActivities: 'Salsa/tango classes, beach clubs, live music venues, boat trips, wine tours',
    food: 'Street tacos, ceviche spots, local markets, beach restaurants, churros, empanadas',
    seasonal: {
      spring: 'Beach season starts, outdoor festivals, flower markets',
      summer: 'Beach life, night markets, outdoor dancing, carnival prep',
      fall: 'Dia de los Muertos, harvest festivals, wine tasting',
      winter: 'Holiday celebrations, cozy cafes, indoor dancing, wine regions',
    },
    coupleStyle: 'Very expressive, family approval matters, traditional gender roles common, passionate PDA',
    anniversaryStyle: 'Monthly anniversaries (mesiversarios) common, romantic gestures important',
  },
  DEFAULT: {
    toneGuide: 'Universal, flexible, balanced between indoor and outdoor, culturally neutral',
    trends: 'Local cafes, parks, shopping areas, cultural sites, restaurants',
    freeActivities: [
      'Park walks',
      'Sunset watching',
      'Home movie night',
      'Cooking together',
      'Window shopping',
      'Neighborhood strolls',
      'Free local events',
      'Stargazing',
      'Picnic in park',
      'Photo walks',
    ],
    paidActivities: 'Cafes, restaurants, movies, bowling, local attractions',
    food: 'Local restaurants, cafes, street food, dessert shops',
    seasonal: {
      mild: 'Outdoor walks, picnics, sightseeing',
      hot: 'Indoor activities, evening outings, water-related activities',
      cool: 'Cozy cafes, indoor activities, warm food dates',
    },
    coupleStyle: 'Balanced, respectful of local norms, flexible expression',
    anniversaryStyle: 'Yearly anniversaries',
  },
};

// ============================================
// System Prompt Generator (Region-based v3)
// ============================================

function getSystemPrompt(
  regionCode: RegionCode,
  language: SupportedLanguage,
  season: SeasonType
): string {
  const culture = CULTURE_PROMPTS[regionCode];
  const seasonalActivities = culture.seasonal[season] || culture.seasonal['mild'] || '';

  // Language mapping for output
  const languageNames: Record<SupportedLanguage, string> = {
    ko: 'Korean', en: 'English', es: 'Spanish', 'zh-TW': 'Traditional Chinese', ja: 'Japanese'
  };

  // Optimized system prompt - focused on role/tone/format only
  return `Couple date mission generator. Respond in JSON format.

OUTPUT: {"missions":[{title, description(<80chars), category, difficulty:1-3, tags:[]}]}
LANGUAGE: ${languageNames[language] || 'English'} - All output MUST be in this language
CATEGORIES: cafe,restaurant,streetfood,dessert,cooking,drink,brunch,outdoor,home,travel,daytrip,drive,night,nature,culture,movie,sports,fitness,wellness,creative,game,shopping,photo,learning,romantic,anniversary,surprise,memory,online,challenge
DIFFICULTY: 1=FREE 2=LOW(<$10) 3=PAID($10+)

STYLE:
- title: Poetic/emotional phrase (not literal like "Go to cafe")
- description: Specific action under 80 characters
- Each mission MUST have different category
- At least 1 difficulty:1 (free) mission required

CONTEXT (${regionCode}, ${season}):
Tone: ${culture.toneGuide}
Season activities: ${seasonalActivities}
Free options: ${culture.freeActivities.slice(0, 5).join(', ')}`;
}

// ============================================
// Few-shot Examples Generator (Simplified)
// ============================================

function getFewShotExamples(language: SupportedLanguage): string {
  // Select only 3 examples based on language (reduced from 19)
  const examples = language === 'ko'
    ? [
        {"title":"퍼즐 한 조각씩, 완성되는 우리","description":"1000피스 직소 퍼즐을 함께 맞추며 대화하기","category":"game","difficulty":1},
        {"title":"새로운 레시피 도전기","description":"한 번도 안 만들어본 요리 함께 도전","category":"cooking","difficulty":2},
        {"title":"우리동네 사진관","description":"스마트폰으로 동네 숨은 명소 10곳 촬영","category":"photo","difficulty":1}
      ]
    : [
        {"title":"Puzzle Night In","description":"Work on a 500+ piece puzzle together over snacks","category":"game","difficulty":1},
        {"title":"Recipe Challenge","description":"Each pick an ingredient, create a dish using both","category":"cooking","difficulty":1},
        {"title":"Photo Walk Challenge","description":"Take 15 photos each on a theme, compare favorites","category":"photo","difficulty":1}
      ];

  return `STYLE EXAMPLES (reference only, do NOT copy):
${examples.map(e => JSON.stringify(e)).join('\n')}`;
}

// ============================================
// User Prompt Generator (Language-specific)
// ============================================

function getUserPrompt(
  contextString: string,
  fewShotExamples: string,
  language: SupportedLanguage,
  deduplicationContext: string,
  excludedMissionsContext: string,
  missionCount: number = 3
): string {
  // Build constraints section (only if there are exclusions)
  const constraints: string[] = [];
  if (excludedMissionsContext) {
    constraints.push(excludedMissionsContext);
  }
  if (deduplicationContext) {
    constraints.push(deduplicationContext);
  }
  const constraintsSection = constraints.length > 0 ? constraints.join('\n') : '';

  // Simplified prompt - rules already in system prompt, only context-specific here
  const creativityHint = language === 'ko'
    ? '창의적이고 독특한 활동 우선'
    : 'Prioritize creative, unique activities';

  return `Generate ${missionCount} missions:

${contextString}
${constraintsSection}

${creativityHint}

${fewShotExamples}`;
}

// ============================================
// Category Validation (Fallback to valid category)
// ============================================

const VALID_CATEGORIES: MissionCategory[] = [
  'cafe', 'restaurant', 'streetfood', 'dessert', 'cooking', 'drink', 'brunch',
  'outdoor', 'home', 'travel', 'daytrip', 'drive', 'night', 'nature',
  'culture', 'movie', 'sports', 'fitness', 'wellness', 'creative', 'game', 'shopping', 'photo', 'learning',
  'romantic', 'anniversary', 'surprise', 'memory',
  'online', 'challenge'
];

// Map invalid categories to valid ones
const CATEGORY_FALLBACK_MAP: Record<string, MissionCategory> = {
  'food': 'streetfood',
  'activity': 'culture',
  'entertainment': 'game',
  'sport': 'sports',
  'art': 'creative',
  'music': 'culture',
  'education': 'learning',
  'exercise': 'fitness',
  'relaxation': 'wellness',
  'date': 'romantic',
  'special': 'romantic',
  'trip': 'travel',
  'walk': 'outdoor',
  'park': 'outdoor',
  'beach': 'nature',
  'bar': 'drink',
  'pub': 'drink',
  'club': 'night',
};

function validateCategory(category: string): MissionCategory {
  // Check if it's already a valid category
  if (VALID_CATEGORIES.includes(category as MissionCategory)) {
    return category as MissionCategory;
  }

  // Try to map to a valid category
  const lowercaseCategory = category.toLowerCase();
  if (CATEGORY_FALLBACK_MAP[lowercaseCategory]) {
    console.log(`[MissionGenerator] Mapping invalid category "${category}" to "${CATEGORY_FALLBACK_MAP[lowercaseCategory]}"`);
    return CATEGORY_FALLBACK_MAP[lowercaseCategory];
  }

  // Default fallback based on common patterns
  if (lowercaseCategory.includes('food') || lowercaseCategory.includes('eat') || lowercaseCategory.includes('meal')) {
    return 'restaurant';
  }
  if (lowercaseCategory.includes('drink') || lowercaseCategory.includes('bar') || lowercaseCategory.includes('wine')) {
    return 'drink';
  }
  if (lowercaseCategory.includes('outdoor') || lowercaseCategory.includes('walk') || lowercaseCategory.includes('park')) {
    return 'outdoor';
  }
  if (lowercaseCategory.includes('game') || lowercaseCategory.includes('play') || lowercaseCategory.includes('fun')) {
    return 'game';
  }

  // Ultimate fallback: use 'outdoor' as it has many images
  console.warn(`[MissionGenerator] Unknown category "${category}", defaulting to "outdoor"`);
  return 'outdoor';
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
  const deduplicationContext = buildDeduplicationContext(input.missionHistory);

  // Build excluded missions context for refresh (CRITICAL - avoid duplicates)
  const excludedMissionsContext = buildExcludedMissionsContext(input.excludedMissions, language);

  // Log if we're in refresh mode
  if (input.excludedMissions && input.excludedMissions.length > 0) {
    console.log(`[MissionGenerator] Refresh mode - excluding ${input.excludedMissions.length} original missions:`,
      input.excludedMissions.map(m => m.title).join(', '));
  }

  // Determine mission count based on subscription status
  const subscriptionState = useSubscriptionStore.getState();
  const isCouplePremium = subscriptionState.isPremium || subscriptionState.partnerIsPremium;
  const missionCount = isCouplePremium
    ? SUBSCRIPTION_LIMITS.premium.missionsPerGeneration
    : SUBSCRIPTION_LIMITS.free.missionsPerGeneration;

  // Get region and language-specific prompts
  const systemPrompt = getSystemPrompt(weather.regionCode, language, weather.season);
  const fewShotExamples = getFewShotExamples(language);
  const userPrompt = getUserPrompt(contextString, fewShotExamples, language, deduplicationContext, excludedMissionsContext, missionCount);

  try {
    // Reduced max_tokens due to optimized prompts (40% smaller)
    const maxTokens = missionCount > 3 ? 3000 : 1500;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.75,  // Reduced from 0.9 for better JSON stability
      max_tokens: maxTokens,
      presence_penalty: 0.5,  // Reduced from 0.7
      frequency_penalty: 0.3,  // Reduced from 0.4
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

    // Convert to Mission format with category validation
    const slicedData = missionsData.slice(0, missionCount);

    // First, collect all validated categories
    const validatedCategories = slicedData.map((data) => validateCategory(data.category));

    // Get unique images for all missions at once (prevents duplicates)
    const uniqueImages = getUniqueRandomImages(validatedCategories);

    const missions: Mission[] = slicedData.map((data, index) => {
      return {
        id: `ai-${Date.now()}-${index}`,
        title: data.title,
        description: data.description,
        category: validatedCategories[index],
        tags: data.tags || [],
        imageUrl: uniqueImages[index],
        isPremium: false,
        moodTags: todayMoods,
      };
    });

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

  // Determine mission count based on subscription status
  const subscriptionState = useSubscriptionStore.getState();
  const isCouplePremium = subscriptionState.isPremium || subscriptionState.partnerIsPremium;
  const missionCount = isCouplePremium
    ? SUBSCRIPTION_LIMITS.premium.missionsPerGeneration
    : SUBSCRIPTION_LIMITS.free.missionsPerGeneration;

  // Define fallback mission data (without images - images assigned later to prevent duplicates)
  const fallbackMissionsKo = [
    { title: '네컷사진 챌린지', description: '포토부스에서 다양한 포즈로 네컷사진 찍기', category: 'photo' as MissionCategory, tags: ['네컷사진', '포토부스', '추억'] },
    { title: '방탈출 카페 도전', description: '협동해서 방탈출 게임 클리어하기', category: 'game' as MissionCategory, tags: ['방탈출', '게임', '협동'] },
    { title: '분위기 좋은 카페 탐방', description: '인스타 감성 카페에서 음료 마시며 수다 떨기', category: 'cafe' as MissionCategory, tags: ['카페', '감성', '데이트'] },
    { title: '야경 드라이브', description: '밤에 예쁜 야경 보며 드라이브하기', category: 'outdoor' as MissionCategory, tags: ['드라이브', '야경', '로맨틱'] },
    { title: '함께 요리하기', description: '새로운 레시피로 함께 요리 만들어보기', category: 'home' as MissionCategory, tags: ['요리', '홈쿠킹', '협동'] },
    { title: '영화관 데이트', description: '최신 영화 보고 감상 나누기', category: 'movie' as MissionCategory, tags: ['영화', '데이트', '문화'] },
  ];

  const fallbackMissionsEn = [
    { title: 'Photo Booth Adventure', description: 'Strike fun poses at a photo booth and collect memories', category: 'photo' as MissionCategory, tags: ['photobooth', 'photos', 'memories'] },
    { title: 'Escape Room Challenge', description: 'Team up to solve puzzles and escape together', category: 'game' as MissionCategory, tags: ['escaperoom', 'game', 'teamwork'] },
    { title: 'Cozy Cafe Exploration', description: 'Find a charming cafe and enjoy drinks together', category: 'cafe' as MissionCategory, tags: ['cafe', 'cozy', 'date'] },
    { title: 'Night Drive Adventure', description: 'Take a scenic night drive and enjoy the city lights', category: 'outdoor' as MissionCategory, tags: ['drive', 'nightview', 'romantic'] },
    { title: 'Cook Together', description: 'Try a new recipe and cook a meal together', category: 'home' as MissionCategory, tags: ['cooking', 'homemade', 'teamwork'] },
    { title: 'Movie Date Night', description: 'Watch a new movie and share your thoughts', category: 'movie' as MissionCategory, tags: ['movie', 'date', 'culture'] },
  ];

  const fallbackData = language === 'ko' ? fallbackMissionsKo : fallbackMissionsEn;
  const slicedData = fallbackData.slice(0, missionCount);

  // Get unique images for all missions at once (prevents duplicates)
  const categories = slicedData.map((m) => m.category);
  const uniqueImages = getUniqueRandomImages(categories);

  // Build missions with unique images
  const allFallbackMissions: Mission[] = slicedData.map((data, index) => ({
    id: `fallback-${Date.now()}-${index + 1}`,
    title: data.title,
    description: data.description,
    category: data.category,
    tags: data.tags,
    imageUrl: uniqueImages[index],
    isPremium: false,
    moodTags: todayMoods as any,
  }));

  return allFallbackMissions;
}
