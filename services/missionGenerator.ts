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

  // === Priority 1: Constraints (MUST HAVE) ===
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
      pet: 'With pet -> pet-friendly places only',
      child: 'With child -> family-friendly places/activities',
      long_distance: 'Long distance -> online/remote activities',
      far_distance: 'Far distance -> online/remote activities',
      no_car: 'No car -> public transit/walking accessible only',
      no_alcohol: 'No alcohol -> cafes/desserts/non-alcoholic venues only',
      avoid_crowd: 'Avoid crowds -> quiet places, off-peak hours, reservations',
    };
    const constraintList = uniqueConstraints.map(c => constraintDescriptions[c] || c).join(', ');
    parts.push(`### CONSTRAINTS (Violation = Invalid Mission)\n${constraintList}`);
  }

  // === Priority 2: MBTI Combination ===
  const mbtiA = input.userAPreferences?.mbti;
  const mbtiB = input.userBPreferences?.mbti;
  if (mbtiA || mbtiB) {
    const mbtiContext = analyzeMBTICombination(mbtiA, mbtiB);
    parts.push(`\n[MBTI] ${mbtiA || '?'} + ${mbtiB || '?'} -> ${mbtiContext}`);
  }

  // === Priority 3: Date Worries ===
  const worryDescriptions: Record<DateWorry, { short: string; detail: string }> = {
    'no_idea': { short: 'No ideas', detail: 'Mix of easy and special experiences' },
    'same_pattern': { short: 'Same routine', detail: 'Fresh, trendy, unique date ideas' },
    'budget': { short: 'Budget concerns', detail: 'Free or low-cost activities, home/park/neighborhood' },
    'time': { short: 'Limited time', detail: '30min-1hour activities, minimal travel' },
    'talk': { short: 'Need conversation', detail: 'Activities that naturally encourage talking' },
    'none': { short: 'Just fun', detail: 'FUN first! Active and exciting missions' },
  };

  // Shared worries (both have same concern)
  if (combinedDateWorries.shared.length > 0) {
    const sharedList = combinedDateWorries.shared.map(w => worryDescriptions[w].short).join(', ');
    parts.push(`\n### SHARED CONCERNS (Top Priority)`);
    parts.push(`${sharedList}`);
    combinedDateWorries.shared.forEach(w => {
      parts.push(`-> ${worryDescriptions[w].detail}`);
    });
  }

  // One-side worries
  const oneSideWorries = [...combinedDateWorries.userAOnly, ...combinedDateWorries.userBOnly];
  if (oneSideWorries.length > 0) {
    const uniqueOneSide = [...new Set(oneSideWorries)];
    const oneSideList = uniqueOneSide.map(w => worryDescriptions[w].short).join(', ');
    parts.push(`\n[One-side concerns] ${oneSideList}`);
  }

  // No worries = fun first
  if (combinedDateWorries.shared.length === 0 && oneSideWorries.length === 0) {
    parts.push(`\n[No specific concerns] -> FUN first! Active and exciting missions`);
  }

  // === Priority 4: Today's Situation ===
  const moodMap: Record<string, string> = {
    fun: 'Fun', deep_talk: 'Deep talk', active: 'Active',
    healing: 'Healing', culture: 'Culture', adventure: 'Adventure', romantic: 'Romantic',
  };
  const timeMap: Record<string, string> = {
    '30min': '30min', '1hour': '1hour', '2hour': '2hours+', 'allday': 'All day',
  };
  const moodStr = todayMoods.map(m => moodMap[m] || m).join(', ');
  parts.push(`\n[TODAY]`);
  parts.push(`- Meeting: ${canMeetToday ? 'Yes' : 'No (one person does mission alone)'}`);
  parts.push(`- Time: ${timeMap[availableTime]}`);
  parts.push(`- Mood: ${moodStr}`);

  // === Priority 5: Weather/Season ===
  parts.push(`\n[WEATHER] ${weather.seasonLabel} | ${weather.condition} ${weather.temperature}C | Outdoor: ${weather.isOutdoorFriendly ? 'OK' : 'Not ideal'}`);

  // === Priority 6: Preferred Activities ===
  const allActivities = [
    ...(input.userAPreferences?.activityTypes || []),
    ...(input.userBPreferences?.activityTypes || []),
  ];
  if (allActivities.length > 0) {
    const uniqueActivities = [...new Set(allActivities)];
    parts.push(`[Preferred activities] ${uniqueActivities.join(', ')}`);
  }

  // === Anniversary ===
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
    // Anniversary TODAY! All missions should be anniversary-themed
    parts.push(`\n### TODAY IS ${todayLabels.join(', ')}!`);
    parts.push(`-> ALL missions must be anniversary/celebration themed!`);
    parts.push(`-> Categories: romantic, anniversary, surprise, memory`);
  } else if (allUpcoming.length > 0) {
    parts.push(`\n[Upcoming anniversary] ${allUpcoming.join(', ')} -> Include at least 1 anniversary-prep mission!`);
  }

  // === Minor Check ===
  let isAnyUserUnder19 = false;
  if (input.userAPreferences?.birthDate) {
    if (calculateAge(new Date(input.userAPreferences.birthDate)) < 19) isAnyUserUnder19 = true;
  }
  if (input.userBPreferences?.birthDate) {
    if (calculateAge(new Date(input.userBPreferences.birthDate)) < 19) isAnyUserUnder19 = true;
  }
  if (isAnyUserUnder19) {
    parts.push(`\n[MINOR PRESENT] drink category FORBIDDEN`);
  }

  return parts.join('\n');
}

function analyzeMBTICombination(mbtiA?: string, mbtiB?: string): string {
  if (!mbtiA && !mbtiB) return '';

  const hints: string[] = [];
  const a = mbtiA || '';
  const b = mbtiB || '';

  // E/I analysis
  const eCount = (a.includes('E') ? 1 : 0) + (b.includes('E') ? 1 : 0);
  if (eCount === 2) hints.push('Social activities OK');
  else if (eCount === 0) hints.push('Quiet, private spaces preferred');
  else hints.push('Mix of private time + some social');

  // N/S analysis
  const nCount = (a.includes('N') ? 1 : 0) + (b.includes('N') ? 1 : 0);
  if (nCount === 2) hints.push('Creative/artistic activities');
  else if (nCount === 0) hints.push('Practical/food exploration');

  // F/T analysis
  const fCount = (a.includes('F') ? 1 : 0) + (b.includes('F') ? 1 : 0);
  if (fCount === 2) hints.push('Emotional/romantic');
  else if (fCount === 0) hints.push('Games/puzzles/analytical');

  // J/P analysis
  const jCount = (a.includes('J') ? 1 : 0) + (b.includes('J') ? 1 : 0);
  if (jCount === 2) hints.push('Planned dates, reservations');
  else if (jCount === 0) hints.push('Spontaneous/flexible');

  return hints.join(', ');
}

// ============================================
// Deduplication Context Builder (Token-Efficient)
// GPT understands all languages - no keyword mapping needed
// ============================================

function buildDeduplicationContext(history: MissionHistorySummary | undefined, _language: SupportedLanguage): string {
  if (!history || history.totalCompleted === 0) {
    return '';
  }

  const parts: string[] = [];

  // 1. Recent titles - GPT understands all languages and can avoid similar activities
  if (history.recentTitles.length > 0) {
    const titlesToInclude = history.recentTitles.slice(0, 20);
    parts.push(`\n### RECENTLY COMPLETED MISSIONS (Avoid similar activities)`);
    parts.push(`${titlesToInclude.join(' | ')}`);
    parts.push(`Generate COMPLETELY different activities from the above.`);
  }

  // 2. Category statistics (very token efficient, ~30-50 tokens)
  if (Object.keys(history.categoryStats).length > 0) {
    const sortedCategories = Object.entries(history.categoryStats)
      .sort((a, b) => b[1] - a[1]);

    // Find overused categories (3+ times)
    const overusedCategories = sortedCategories
      .filter(([_, count]) => count >= 3)
      .map(([cat]) => cat);

    // Find underutilized categories
    const allCategories = [
      'cafe', 'restaurant', 'outdoor', 'home', 'game', 'creative', 'culture',
      'photo', 'romantic', 'online', 'fitness', 'sports', 'wellness',
      'learning', 'cooking', 'challenge', 'movie', 'night', 'nature'
    ];
    const underusedCategories = allCategories.filter(cat =>
      !history.categoryStats[cat] || history.categoryStats[cat] <= 1
    );

    const statsStr = sortedCategories.map(([cat, count]) => `${cat}(${count})`).join(', ');
    parts.push(`\n### CATEGORY STATS`);
    parts.push(`Completed: ${statsStr}`);

    if (overusedCategories.length > 0) {
      parts.push(`AVOID (overused): ${overusedCategories.join(', ')}`);
    }

    if (underusedCategories.length > 0) {
      parts.push(`PRIORITIZE (underused): ${underusedCategories.slice(0, 7).join(', ')}`);
    }
  }

  return parts.join('\n');
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

  // Language-agnostic format for token efficiency
  parts.push(`\n### EXCLUDED MISSIONS (DO NOT USE)`);
  parts.push(`Forbidden titles: ${titles.join(' | ')}`);
  parts.push(`Forbidden categories: ${categories.join(', ')}`);
  parts.push(`Generate COMPLETELY different categories and activities.`);

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
  season: SeasonType,
  _missionCount: number,
  canMeetToday: boolean = true
): string {
  const culture = CULTURE_PROMPTS[regionCode];
  const seasonalActivities = culture.seasonal[season] || culture.seasonal['mild'] || '';
  const languageNames: Record<SupportedLanguage, string> = {
    ko: 'Korean',
    en: 'English',
    es: 'Spanish',
    'zh-TW': 'Traditional Chinese',
    ja: 'Japanese',
  };

  // CRITICAL: Meeting constraint is the TOP PRIORITY
  const meetingConstraint = canMeetToday
    ? ''
    : `
### CRITICAL: COUPLE CANNOT MEET TODAY ###
This is the HIGHEST PRIORITY rule. ALL missions MUST be:
- Activities each person can do ALONE at their own home/location
- OR online/remote activities together (video call, same movie, same game)
- NEVER suggest going somewhere together or meeting in person
- Description must NOT imply meeting (no "together at", "go to", "visit")

ALLOWED categories ONLY: online, home, creative, game, photo, learning, challenge, cooking, movie
FORBIDDEN categories: cafe, restaurant, streetfood, outdoor, travel, daytrip, drive, nature, sports, fitness, night, brunch, dessert, drink, shopping, wellness
`;

  // Filter categories based on meeting status
  const categories = canMeetToday
    ? 'cafe,restaurant,streetfood,dessert,cooking,drink,brunch,outdoor,home,travel,daytrip,drive,night,nature,culture,movie,sports,fitness,wellness,creative,game,shopping,photo,learning,romantic,anniversary,surprise,memory,online,challenge'
    : 'online,home,creative,game,photo,learning,challenge,cooking,movie,romantic,anniversary,surprise,memory';

  return `Couple date mission generator. Respond ONLY in valid JSON.
${meetingConstraint}
OUTPUT: {"missions":[{"title":"string","description":"string(50-80chars)","category":"string","difficulty":1|2|3,"tags":["string"]}]}

LANGUAGE: ${languageNames[language]} - ALL output MUST be in this language

CATEGORIES (EXACTLY one per mission):
${categories}

DIFFICULTY (MUST include at least 1 free mission):
1 = FREE: ${canMeetToday ? 'walks, cycling, parks, stargazing, home activities, sunrise/sunset' : 'home activities, online games, video calls, same recipe cooking'}
2 = LOW (<$10): ${canMeetToday ? 'photo booth, street food, convenience store date, takeout picnic' : 'online movie rental, delivery food while on video call'}
3 = PAID ($10+): ${canMeetToday ? 'restaurants, cafes, classes, entertainment' : 'online classes together, subscription services'}

STYLE:
- title: Emotional, poetic phrase (not direct like "Go to cafe")
  Good: "Under the Sparkling Lights, Our Winter Story"
  Bad: "Visit a cafe", "Do escape room"
- description: Specific action, MUST be 50-80 chars (not shorter, not longer)${canMeetToday ? '' : '\n- description: Must NOT imply physical meeting'}
- Never mention prices
- Activities should naturally lend themselves to photo verification
- Each mission: DIFFERENT category

CONTEXT (${regionCode}, ${season}):
Tone: ${culture.toneGuide}
Season: ${seasonalActivities}
${canMeetToday ? `Free: ${culture.freeActivities.slice(0, 5).join(', ')}
Paid: ${culture.paidActivities}` : `Remote activities: Video call dates, same movie watch party, online games, cooking same recipe apart, photo challenges`}`;
}

// ============================================
// Region-specific Few-shot Examples (Cultural context)
// ============================================

// Reduced to 3-4 examples per region (style reference only, not for copying)
const REGION_FEW_SHOTS: Record<RegionCode, string> = {
  EAST_ASIA: `[
  {"title":"퍼즐 한 조각씩, 완성되는 우리","description":"1000피스 직소 퍼즐을 함께 맞추며 대화하기","category":"game","difficulty":1},
  {"title":"땀 흘린 후의 달콤함","description":"30분 같이 조깅하고 근처 맛집에서 보상 식사","category":"fitness","difficulty":2},
  {"title":"새로운 레시피 도전기","description":"한 번도 안 만들어본 요리 함께 도전","category":"cooking","difficulty":2}
]`,

  SOUTHEAST_ASIA: `[
  {"title":"Couple's Yoga Morning","description":"Follow a beginner yoga video together and stretch","category":"fitness","difficulty":1},
  {"title":"Recipe Roulette","description":"Pick a random local recipe and cook it together","category":"cooking","difficulty":2},
  {"title":"Photo Scavenger Hunt","description":"Take 10 creative photos based on a theme you choose","category":"photo","difficulty":1}
]`,

  NORTH_AMERICA: `[
  {"title":"Puzzle Night In","description":"Work on a 500+ piece puzzle together over snacks","category":"game","difficulty":1},
  {"title":"Recipe Challenge","description":"Each pick an ingredient, create a dish using both","category":"cooking","difficulty":2},
  {"title":"Photo Walk Challenge","description":"Take 15 photos each on a theme, compare favorites","category":"photo","difficulty":1}
]`,

  EUROPE: `[
  {"title":"Puzzle & Wine Evening","description":"Work on a puzzle while sharing a bottle of wine","category":"game","difficulty":2},
  {"title":"Recipe from Scratch","description":"Cook a traditional dish neither has made before","category":"cooking","difficulty":2},
  {"title":"Photo Journal","description":"Document your day in photos and create a mini album","category":"photo","difficulty":1}
]`,

  LATIN_AMERICA: `[
  {"title":"Salsa at Home","description":"Learn basic salsa steps from YouTube in your living room","category":"fitness","difficulty":1},
  {"title":"Recipe Adventure","description":"Cook a dish from a country neither has visited","category":"cooking","difficulty":2},
  {"title":"Photo Story","description":"Create a photo story of your neighborhood together","category":"photo","difficulty":1}
]`,

  DEFAULT: `[
  {"title":"Puzzle Time","description":"Start a jigsaw puzzle together and chat","category":"game","difficulty":1},
  {"title":"Cooking Challenge","description":"Each choose an ingredient, cook something with both","category":"cooking","difficulty":2},
  {"title":"Photo Mission","description":"Take 10 creative photos around your area","category":"photo","difficulty":1}
]`,
};

// ============================================
// Few-shot Examples Generator (Region + Online)
// ============================================

function getFewShotExamples(regionCode: RegionCode, _language: SupportedLanguage, canMeetToday: boolean = true): string {
  // If couple can't meet, ONLY show remote/solo examples
  if (!canMeetToday) {
    return `
### REMOTE-ONLY Examples (couple CANNOT meet today)
[
  {"title":"같은 영화, 다른 공간에서","description":"각자 집에서 영상통화 켜놓고 같은 영화 동시 재생하며 실시간 리액션 공유하기","category":"online","difficulty":1},
  {"title":"우리만의 요리 대결","description":"똑같은 레시피 골라서 각자 집에서 요리 완성 후 사진 찍어 결과물 비교하고 점수 매기기","category":"cooking","difficulty":2},
  {"title":"Dreams for Tomorrow","description":"Video call and write a shared bucket list of activities to do when you finally meet again","category":"online","difficulty":1},
  {"title":"Photo Theme Challenge","description":"Pick a theme together then each take 5 creative photos at your own location and compare results","category":"photo","difficulty":1},
  {"title":"Online Game Night","description":"Choose an online multiplayer game and compete against each other while chatting on video call","category":"game","difficulty":1}
]

CRITICAL REMINDER: All missions must be doable WITHOUT meeting in person.
`;
  }

  const regionExamples = REGION_FEW_SHOTS[regionCode] || REGION_FEW_SHOTS.DEFAULT;

  return `
### Style Reference (DO NOT copy - style only)
${regionExamples}

### Online Examples (when can't meet)
[{"title":"Dreams for Tomorrow","description":"Write bucket list of things to do next year","category":"online","difficulty":1},{"title":"Same Taste Apart","description":"Cook same recipe separately, share photos","category":"online","difficulty":1}]
`;
}

// ============================================
// User Prompt Generator (Language-specific)
// ============================================

function getUserPrompt(
  contextString: string,
  fewShotExamples: string,
  _language: SupportedLanguage,
  deduplicationContext: string,
  excludedMissionsContext: string,
  missionCount: number = 3,
  canMeetToday: boolean = true
): string {
  // Build forbidden rules based on available context
  const forbiddenRules: string[] = [];
  if (excludedMissionsContext) {
    forbiddenRules.push('- Missions listed in EXCLUDED MISSIONS above');
  }
  if (deduplicationContext) {
    forbiddenRules.push('- Activities similar to RECENTLY COMPLETED MISSIONS');
  }
  forbiddenRules.push('- Repeating same patterns (walks, cafes, markets)');

  // CRITICAL: Add remote-only rules when couple can't meet today
  let remoteOnlyRules = '';
  if (!canMeetToday) {
    forbiddenRules.push('- ANY activity requiring physical meeting (cafes, restaurants, outdoor dates, walks, drives)');
    remoteOnlyRules = `
### IMPORTANT: COUPLE CANNOT MEET TODAY
ALL missions MUST be doable ALONE or REMOTELY:
- Online activities (video call, watch party, online games)
- Solo activities to share later (cooking same recipe, photo challenges)
- Home activities each person does separately
- Categories allowed: online, home, creative, game, photo, learning, challenge
- Categories FORBIDDEN: cafe, restaurant, streetfood, outdoor, travel, daytrip, drive, nature, sports, fitness
`;
  }

  return `Generate ${missionCount} date missions for this couple.

${contextString}
${excludedMissionsContext}
${deduplicationContext}
${remoteOnlyRules}

### RULES
FORBIDDEN:
${forbiddenRules.join('\n')}

REQUIRED:
- All ${missionCount} missions: DIFFERENT activity types
- At least 1 FREE mission (difficulty:1)
- Unique, creative ideas (not generic "walk/cafe/restaurant")
${canMeetToday ? '- Examples: puzzle challenge, workout+brunch, flea market, cooking together' : '- Examples: video call game night, same recipe cooking apart, online movie watch party'}

${fewShotExamples}

Generate ${missionCount} missions in JSON format only.`;
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
  const { todayMoods, canMeetToday } = input.todayAnswers;

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

  // Get region and language-specific prompts (canMeetToday is TOP PRIORITY)
  const systemPrompt = getSystemPrompt(weather.regionCode, language, weather.season, missionCount, canMeetToday);
  const fewShotExamples = getFewShotExamples(weather.regionCode, language, canMeetToday);
  const userPrompt = getUserPrompt(contextString, fewShotExamples, language, deduplicationContext, excludedMissionsContext, missionCount, canMeetToday);

  try {
    // Increase max_tokens for premium users (6 missions need more tokens)
    const maxTokens = missionCount > 3 ? 4500 : 2500;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: maxTokens,
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
