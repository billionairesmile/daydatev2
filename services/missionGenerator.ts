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
  city?: string;
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
  bookmarkSummary?: {
    categories: Record<string, number>;
    titles: string[];
    total: number;
  } | null;
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

// Detect country and city from coordinates using OpenWeatherMap reverse geocoding
async function detectLocationFromCoordinates(latitude: number, longitude: number): Promise<{ country: string; city: string }> {
  const apiKey = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
  if (!apiKey) return { country: 'DEFAULT', city: '' };

  try {
    const response = await fetch(
      `https://api.openweathermap.org/geo/1.0/reverse?lat=${latitude}&lon=${longitude}&limit=1&appid=${apiKey}`
    );

    if (!response.ok) return { country: 'DEFAULT', city: '' };

    const data = await response.json();
    if (data && data.length > 0) {
      return {
        country: data[0].country || 'DEFAULT',
        city: data[0].name || '',
      };
    }
    return { country: 'DEFAULT', city: '' };
  } catch (error) {
    console.error('[Location Detection] Failed:', error);
    return { country: 'DEFAULT', city: '' };
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
    // Fetch weather and location in parallel
    const [weatherResponse, locationInfo] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`),
      detectLocationFromCoordinates(latitude, longitude),
    ]);
    const rawCountryCode = locationInfo.country;

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

    return { temperature: temp, condition, season, seasonLabel, isOutdoorFriendly, countryCode, regionCode, city: locationInfo.city };
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

// Calculate relationship duration and phase
function getRelationshipDuration(
  anniversaryDate: Date | string | null | undefined
): { years: number; months: number; totalMonths: number; phase: string } | null {
  if (!anniversaryDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const annDate = parseDateAsLocal(anniversaryDate);
  annDate.setHours(0, 0, 0, 0);

  const totalMonths =
    (today.getFullYear() - annDate.getFullYear()) * 12 +
    (today.getMonth() - annDate.getMonth());
  if (totalMonths < 0) return null;

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  let phase: string;
  if (totalMonths < 6) phase = 'honeymoon';         // ~6개월 미만
  else if (totalMonths < 24) phase = 'building';     // 6개월~2년
  else if (totalMonths < 60) phase = 'established';  // 2~5년
  else if (totalMonths < 120) phase = 'mature';      // 5~10년
  else phase = 'deep';                               // 10년+

  return { years, months, totalMonths, phase };
}

interface AnniversaryInfo {
  upcoming: string[];
  isToday: boolean;
  todayLabel: string | null;
  anniversaryType: 'wedding' | 'dating' | null;  // Type of anniversary for clear context
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
  if (!anniversaryDate) return { upcoming: [], isToday: false, todayLabel: null, anniversaryType: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const annDate = parseDateAsLocal(anniversaryDate);
  annDate.setHours(0, 0, 0, 0);

  const upcomingAnniversaries: string[] = [];
  let isToday = false;
  let todayLabel: string | null = null;
  // Track anniversary type: 'wedding' for married couples, 'dating' for dating couples
  const anniversaryType: 'wedding' | 'dating' | null = relationshipType === 'married' ? 'wedding' : relationshipType === 'dating' ? 'dating' : null;

  const daysPassed = Math.floor((today.getTime() - annDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  // Check day milestones (100일, 200일, etc.) - only for dating couples
  if (relationshipType === 'dating') {
    const milestones = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1500, 2000];
    for (const milestone of milestones) {
      const daysUntil = milestone - daysPassed;
      if (daysUntil === 0) {
        // Today is the milestone!
        isToday = true;
        todayLabel = `${milestone}일`;
      } else if (daysUntil > 0 && daysUntil <= 7) {
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
    } else if (daysUntil > 0 && daysUntil <= 7) {
      const label = relationshipType === 'married' ? `결혼 ${year}주년` : `연애 ${year}주년`;
      upcomingAnniversaries.push(`${label} (D-${daysUntil})`);
      break;
    } else if (daysUntil > 7) {
      break;
    }
  }

  return { upcoming: upcomingAnniversaries, isToday, todayLabel, anniversaryType };
}

// Check custom (user-created) anniversaries within D-7
function getCustomAnniversaryInfo(
  customAnniversaries?: CustomAnniversaryForMission[]
): AnniversaryInfo {
  if (!customAnniversaries || customAnniversaries.length === 0) {
    return { upcoming: [], isToday: false, todayLabel: null, anniversaryType: null };
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

  // Custom anniversaries don't have wedding/dating type distinction
  return { upcoming: upcomingAnniversaries, isToday, todayLabel, anniversaryType: null };
}

// Birthday info type
interface BirthdayInfo {
  upcoming: string[];
  isToday: boolean;
  todayLabel: string | null;
}

// Check if any birthday (user or partner) is coming up within D-3
// Both users' birthdays are checked - birthday dates are great for special couple missions
function getBirthdayInfo(
  userABirthDate?: Date | string | null,
  userBBirthDate?: Date | string | null
): BirthdayInfo {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingBirthdays: string[] = [];
  let isToday = false;
  let todayLabel: string | null = null;

  const checkBirthday = (birthDate: Date | string | null | undefined) => {
    if (!birthDate) return;

    const bDate = parseDateAsLocal(birthDate);
    // Set to this year's birthday
    const thisYearBirthday = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate());
    thisYearBirthday.setHours(0, 0, 0, 0);

    // If birthday has passed this year, check next year
    let targetBirthday = thisYearBirthday;
    if (thisYearBirthday < today) {
      targetBirthday = new Date(today.getFullYear() + 1, bDate.getMonth(), bDate.getDate());
      targetBirthday.setHours(0, 0, 0, 0);
    }

    const daysUntil = Math.round((targetBirthday.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    if (daysUntil === 0) {
      // Today is the birthday!
      isToday = true;
      todayLabel = 'Birthday';
    } else if (daysUntil > 0 && daysUntil <= 3) {
      // Within D-3
      upcomingBirthdays.push(`Birthday (D-${daysUntil})`);
    }
  };

  // Check both users' birthdays - either one's birthday is a reason for special date missions
  checkBirthday(userABirthDate);
  checkBirthday(userBBirthDate);

  // Remove duplicates if both birthdays fall on the same day
  const uniqueUpcoming = [...new Set(upcomingBirthdays)];

  return { upcoming: uniqueUpcoming, isToday, todayLabel };
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

  // =============================================
  // Priority 1: Constraints + Worries (제약/고민)
  // =============================================
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

  // Date Worries
  const worryDescriptions: Record<DateWorry, { short: string; detail: string }> = {
    'no_idea': { short: 'No ideas', detail: 'Mix of easy and special experiences' },
    'same_pattern': { short: 'Same routine', detail: 'Fresh, trendy, unique date ideas' },
    'budget': { short: 'Budget concerns', detail: 'Free or low-cost activities, home/park/neighborhood' },
    'time': { short: 'Limited time', detail: '30min-1hour activities, minimal travel' },
    'talk': { short: 'Need conversation', detail: 'Activities that naturally encourage talking' },
    'none': { short: 'Just fun', detail: 'FUN first! Active and exciting missions' },
  };

  if (combinedDateWorries.shared.length > 0) {
    const sharedList = combinedDateWorries.shared.map(w => worryDescriptions[w].short).join(', ');
    parts.push(`\n### SHARED CONCERNS (Top Priority)`);
    parts.push(`${sharedList}`);
    combinedDateWorries.shared.forEach(w => {
      parts.push(`-> ${worryDescriptions[w].detail}`);
    });
  }

  const oneSideWorries = [...combinedDateWorries.userAOnly, ...combinedDateWorries.userBOnly];
  if (oneSideWorries.length > 0) {
    const uniqueOneSide = [...new Set(oneSideWorries)];
    const oneSideList = uniqueOneSide.map(w => worryDescriptions[w].short).join(', ');
    parts.push(`\n[One-side concerns] ${oneSideList}`);
  }

  if (combinedDateWorries.shared.length === 0 && oneSideWorries.length === 0) {
    parts.push(`\n[No specific concerns] -> FUN first! Active and exciting missions`);
  }

  // Worry-Constraint Cross-Reference
  const hasBudgetWorry = combinedDateWorries.shared.includes('budget') ||
    oneSideWorries.some(w => w === 'budget');
  const hasTimeWorry = combinedDateWorries.shared.includes('time') ||
    oneSideWorries.some(w => w === 'time');
  const hasNoCar = uniqueConstraints.includes('no_car');
  const hasLongDistance = uniqueConstraints.includes('long_distance') || uniqueConstraints.includes('far_distance');

  const crossHints: string[] = [];
  if (hasBudgetWorry && hasNoCar) {
    crossHints.push('Budget + No car: Prioritize WALKABLE low-cost activities (neighborhood cafes, parks, local markets, home dates). Include both free AND affordable options.');
  }
  if (hasBudgetWorry && hasTimeWorry) {
    crossHints.push('Budget + Time: QUICK & affordable missions (30min neighborhood walks, nearby cafe, home activities, convenience store snack date)');
  }
  if (hasTimeWorry && hasLongDistance) {
    crossHints.push('Time + Long distance: SHORT ONLINE activities (15min video call game, quick photo exchange challenge)');
  }
  if (crossHints.length > 0) {
    parts.push(`\n[SMART CONSTRAINTS] ${crossHints.join(' | ')}`);
  }

  // =============================================
  // Priority 2: Meeting Status (만남 여부)
  // =============================================
  parts.push(`\n[MEETING] ${canMeetToday ? 'Yes - couple can meet today' : 'No - one person does mission alone (online/remote only)'}`);

  // =============================================
  // Priority 3: Date Category + Time (데이트 카테고리/시간)
  // =============================================
  const moodMap: Record<string, string> = {
    cozy: 'Cozy/Home date', foodie: 'Food/Restaurant', active: 'Active',
    healing: 'Healing', culture: 'Culture', adventure: 'Adventure', romantic: 'Romantic',
  };
  const timeMap: Record<string, string> = {
    '30min': '30min', '1hour': '1hour', '2hour': '2hours+', 'allday': 'All day',
  };
  const distanceMap: Record<string, string> = {
    '30min': '1km radius (home date OK)',
    '1hour': '5km radius',
    '2hour': '10km radius',
    'allday': 'No distance limit',
  };
  const moodStr = todayMoods.map(m => moodMap[m] || m).join(', ');
  parts.push(`\n[DATE CATEGORY] ${moodStr}`);
  parts.push(`[TIME] ${timeMap[availableTime]} | Distance: ${distanceMap[availableTime]} -> Suggest places within this range`);

  // Category-specific constraints
  if (todayMoods.includes('cozy')) {
    parts.push(`-> COZY MOOD RULE: ALL missions MUST be home-based or indoor at home. NO outdoor activities, NO restaurants, NO parks, NO walks outside. Only: home cooking, movie at home, board games, puzzles, crafts at home, reading together, home spa, etc.`);
  }
  if (todayMoods.includes('foodie')) {
    parts.push(`-> FOODIE MOOD RULE: ALL missions MUST involve food/dining.
  - PRIORITY: Going OUT to eat > cooking at home. At least 2/3 of missions should be about visiting actual food spots.
  - GO-OUT examples: hidden gem restaurants, trending cafes, street food alleys, food markets, bakery hopping, brunch spots, dessert cafes, local diners, food truck parks, night food streets
  - COOKING examples (max 1 mission): recipe challenge, cooking class, making a specific cuisine
  - VARIETY: Each mission must feature a DIFFERENT type of food experience. Never repeat similar concepts (e.g., don't have 2 cafe missions).`);
  }

  // =============================================
  // Priority 4: Weather + Location (날씨/위치)
  // =============================================
  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();
  parts.push(`\n[DATE] ${todayMonth}/${todayDay} | ${weather.seasonLabel} | ${weather.condition} ${weather.temperature}C | Outdoor: ${weather.isOutdoorFriendly ? 'OK' : 'Not ideal'}`)
  parts.push(`-> STRICT HOLIDAY RULE: ONLY reference a holiday if today (${todayMonth}/${todayDay}) falls within its PREP~DAY period below. NEVER after the day itself.
  * Christmas/크리스마스: Dec 15~25 (prep from Dec 15, ENDS Dec 25. Dec 26+ = FORBIDDEN)
  * Valentine's Day/발렌타인: Feb 7~14 (prep from Feb 7, ENDS Feb 14. Feb 15+ = FORBIDDEN)
  * Halloween/할로윈: Oct 24~31 (prep from Oct 24, ENDS Oct 31. Nov 1+ = FORBIDDEN)
  * New Year/새해: Dec 28~Jan 1 (prep from Dec 28, ENDS Jan 1. Jan 2+ = FORBIDDEN)
  * White Day/화이트데이: Mar 7~14 (prep from Mar 7, ENDS Mar 14. Mar 15+ = FORBIDDEN)
  * Pepero Day/빼빼로데이: Nov 7~11 (prep from Nov 7, ENDS Nov 11. Nov 12+ = FORBIDDEN)
  If today is BEFORE the prep period or AFTER the holiday, do NOT reference it at all. "Winter" ≠ "Christmas".`);

  // Weather-Creative Hints
  if (weather.temperature !== undefined) {
    const temp = weather.temperature;
    let weatherCreative = '';
    if (temp <= 0) {
      weatherCreative = '-> COLD WEATHER IDEAS: Warm drink spot hopping, hot spring, heated outdoor terrace, winter sports, frost photography';
    } else if (temp <= 10) {
      weatherCreative = '-> COOL WEATHER IDEAS: Layered outfit coordination date, warm bakery crawl, bookstore browsing, autumn/winter scenic walks';
    } else if (temp >= 30) {
      weatherCreative = '-> HOT WEATHER IDEAS: Water activities, shaved ice tour, air-conditioned cultural spots, evening/night dates, rooftop with breeze';
    } else if (temp >= 20) {
      weatherCreative = '-> NICE WEATHER IDEAS: Outdoor terrace dining, cycling, park dates, sunset spots, open-air markets';
    }
    if (weatherCreative) parts.push(weatherCreative);

    if (weather.condition?.includes('rain') || weather.condition?.includes('Rain') || weather.condition?.includes('비')) {
      parts.push('-> RAIN SPECIAL: Indoor markets, rainy cafe window seats, umbrella sharing walk (short), indoor cooking, museum/gallery day');
    }
    if (weather.condition?.includes('snow') || weather.condition?.includes('Snow') || weather.condition?.includes('눈')) {
      parts.push('-> SNOW SPECIAL: First snow walk, snowman building, snow cafe, warm noodle date, snow photography');
    }
  }

  // City-Level Location Context
  if (weather.city) {
    parts.push(`[LOCATION] City: ${weather.city} -> Suggest activities and spots that are LOCALLY relevant to ${weather.city}. Reference local landmarks, neighborhoods, popular areas, or regional specialties when possible.`);
  }

  // =============================================
  // Priority 5: Preferences (취향 분석 - Chemistry + MBTI)
  // =============================================
  const activitiesA = input.userAPreferences?.activityTypes || [];
  const activitiesB = input.userBPreferences?.activityTypes || [];

  if (activitiesA.length > 0 || activitiesB.length > 0) {
    const setA = new Set(activitiesA);
    const setB = new Set(activitiesB);
    const shared = activitiesA.filter(a => setB.has(a));
    const onlyA = activitiesA.filter(a => !setB.has(a));
    const onlyB = activitiesB.filter(b => !setA.has(b));

    let chemistryPrompt = '\n[COUPLE CHEMISTRY]';
    if (shared.length > 0) {
      chemistryPrompt += `\n- SHARED loves (both enjoy): ${shared.join(', ')} -> At least 1 mission from shared interests`;
    }
    if (onlyA.length > 0 && onlyB.length > 0) {
      chemistryPrompt += `\n- Partner A uniquely likes: ${onlyA.join(', ')}`;
      chemistryPrompt += `\n- Partner B uniquely likes: ${onlyB.join(', ')}`;
      chemistryPrompt += `\n-> Include 1 mission that BRIDGES different interests (combine elements from both)`;
    } else if (onlyA.length > 0 || onlyB.length > 0) {
      const unique = onlyA.length > 0 ? onlyA : onlyB;
      chemistryPrompt += `\n- One partner also likes: ${unique.join(', ')} -> Mix into missions as secondary element`;
    }
    if (shared.length === 0 && (onlyA.length > 0 && onlyB.length > 0)) {
      chemistryPrompt += `\n-> No shared preferences! Create BRIDGE activities: combine A's and B's interests creatively`;
    }
    parts.push(chemistryPrompt);
  }

  // Mood-Preference Fusion (connects P3 date category with P5 preferences)
  const allActivitiesForFusion = [
    ...(input.userAPreferences?.activityTypes || []),
    ...(input.userBPreferences?.activityTypes || []),
  ];
  if (todayMoods.length > 0 && allActivitiesForFusion.length > 0) {
    const moodActivityMap: Record<string, string[]> = {
      active: ['sports', 'fitness', 'outdoor', 'hiking', 'cycling'],
      healing: ['wellness', 'nature', 'cafe', 'spa'],
      culture: ['museum', 'gallery', 'concert', 'theater', 'exhibition'],
      adventure: ['travel', 'new_places', 'extreme', 'exploration'],
      romantic: ['dinner', 'sunset', 'wine', 'stargazing'],
      foodie: ['restaurant', 'cooking', 'cafe', 'baking', 'food_tour'],
      cozy: ['home', 'movie', 'game', 'reading', 'cooking'],
    };

    const fusionHints: string[] = [];
    for (const mood of todayMoods) {
      const relatedActivities = moodActivityMap[mood] || [];
      const matchingPrefs = allActivitiesForFusion.filter(a =>
        relatedActivities.some(r => a.toLowerCase().includes(r))
      );
      if (matchingPrefs.length > 0) {
        fusionHints.push(`${mood} mood + ${matchingPrefs.join('/')} preference`);
      }
    }
    if (fusionHints.length > 0) {
      parts.push(`\n[MOOD-PREFERENCE MATCH] ${fusionHints.join(', ')} -> Prioritize activities at this intersection!`);
    }
  }

  // MBTI Combination
  const mbtiA = input.userAPreferences?.mbti;
  const mbtiB = input.userBPreferences?.mbti;
  if (mbtiA || mbtiB) {
    const mbtiGuidance = getMBTIGuidance(mbtiA, mbtiB);
    if (mbtiGuidance) parts.push(mbtiGuidance);
  }

  // =============================================
  // Priority 6: Relationship Stage (연애단계)
  // =============================================
  const relationshipType = input.userAPreferences?.relationshipType;
  const duration = getRelationshipDuration(input.userAPreferences?.anniversaryDate);
  if (relationshipType || duration) {
    const typeLabel = relationshipType === 'married' ? 'Married' : relationshipType === 'dating' ? 'Dating' : null;
    const phaseGuide: Record<string, string> = {
      honeymoon: `New couple (<6mo):
  - DO: First-time-together activities (first trip, first cooking, matching items)
  - DO: Discovery dates (each other's favorite spots, childhood neighborhoods, playlist exchange)
  - DO: Playful competition (arcade, sports, cooking battles)
  - AVOID: Heavy commitment activities, routine-feeling dates`,
      building: `Growing couple (6mo-2yr):
  - DO: Skill-building together (classes, workshops, new hobby)
  - DO: Day trips to new places, double dates, meeting each other's friends
  - DO: Creating shared traditions (weekly date spot, monthly challenge)
  - AVOID: Overly simple/basic dates that feel like early dating`,
      established: `Established couple (2-5yr):
  - DO: Surprise elements (blindfolded date, mystery destination, role reversal day)
  - DO: Bucket list items, challenging activities, learning something neither knows
  - DO: Revisiting first-date spot with a twist, recreating old photos
  - AVOID: Same-old dinner-and-movie pattern`,
      mature: `Mature couple (5-10yr):
  - DO: Meaningful rituals (annual photo project, letters to future selves, memory book)
  - DO: Appreciation dates (partner's choice day, gratitude walk, love map update)
  - DO: New shared experiences to grow together (travel, volunteering, creating together)
  - AVOID: Assuming preferences haven't changed`,
      deep: `Long-term couple (10yr+):
  - DO: Bucket list adventures (dream destinations, skydiving, concert of lifetime)
  - DO: Legacy activities (planting a tree, charity together, teaching each other skills)
  - DO: Comfort + surprise combo (favorite restaurant + unexpected dessert spot after)
  - AVOID: Only comfortable/routine activities`,
    };
    let relationshipContext = '\n[RELATIONSHIP]';
    if (typeLabel) relationshipContext += ` ${typeLabel}`;
    if (duration) {
      const durationStr = duration.years > 0
        ? `${duration.years}yr ${duration.months}mo`
        : `${duration.months}mo`;
      relationshipContext += ` | Together: ${durationStr}`;
      relationshipContext += `\n-> ${phaseGuide[duration.phase] || phaseGuide.established}`;
    }
    parts.push(relationshipContext);
  }

  // =============================================
  // Priority 7: Bookmark Behavior (북마크)
  // =============================================
  if (input.bookmarkSummary && input.bookmarkSummary.total > 0) {
    const bm = input.bookmarkSummary;
    const topCategories = Object.entries(bm.categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, count]) => `${cat}(${count})`);

    let bookmarkPrompt = `\n[BOOKMARKED FAVORITES] User saved ${bm.total} missions`;
    bookmarkPrompt += `\n- Most saved categories: ${topCategories.join(', ')}`;
    bookmarkPrompt += `\n-> These categories = PROVEN interest. Include at least 1 mission from top saved category.`;

    if (bm.titles.length > 0) {
      bookmarkPrompt += `\n- Recent saved titles: ${bm.titles.slice(0, 5).join(' | ')}`;
      bookmarkPrompt += `\n-> Generate missions with SIMILAR vibe but DIFFERENT specific activities.`;
    }
    parts.push(bookmarkPrompt);
  }

  // =============================================
  // Special Events (Anniversary / Birthday / Minor)
  // =============================================

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

  // Get the explicit anniversary type for clearer prompt context
  const anniversaryTypeLabel = anniversaryInfo.anniversaryType === 'wedding'
    ? 'WEDDING ANNIVERSARY (결혼 기념일)'
    : anniversaryInfo.anniversaryType === 'dating'
    ? 'DATING ANNIVERSARY (연애 기념일)'
    : null;

  if (isAnyAnniversaryToday && todayLabels.length > 0) {
    const annLanguage = useLanguageStore.getState().language;
    // Anniversary/Event TODAY! ALL missions MUST be themed — this is the #1 priority
    parts.push(`\n### 🎉 TODAY IS ${todayLabels.join(', ')}! — THIS OVERRIDES ALL OTHER RULES ###`);

    // Case 1: Regular anniversary (dating/wedding) is today
    if (anniversaryInfo.isToday && anniversaryTypeLabel) {
      parts.push(`### CRITICAL: This is a ${anniversaryTypeLabel}, NOT ${anniversaryInfo.anniversaryType === 'wedding' ? 'dating anniversary' : 'wedding anniversary'}!`);
      parts.push(`-> When mentioning anniversary in mission titles, use "${anniversaryInfo.anniversaryType === 'wedding' ? '결혼 기념일/Wedding Anniversary' : '연애 기념일/Dating Anniversary'}" terminology`);
    }

    // Case 2: Custom anniversary is today (e.g., child's birthday, special day)
    if (customAnniversaryInfo.isToday && customAnniversaryInfo.todayLabel) {
      const customLabel = customAnniversaryInfo.todayLabel;
      parts.push(`### CUSTOM EVENT: "${customLabel}" — Use this EXACT name in mission titles and descriptions.`);
      parts.push(`-> This is NOT a couple anniversary. This is "${customLabel}".`);
      parts.push(`-> DO NOT use "연애 기념일", "결혼 기념일", or "dating/wedding anniversary" — those are WRONG for this event.`);
      parts.push(`-> Missions must be themed around celebrating "${customLabel}" TOGETHER as a couple.`);
      parts.push(`-> Example themes: party planning, gift preparation, special meal, celebration outing, photo session for "${customLabel}"`);
    }

    parts.push(`-> EVERY SINGLE mission (100%) MUST celebrate this event. Not just 1 or 2 — ALL of them.`);
    parts.push(`-> Each mission must be a DIFFERENT way to celebrate.`);
    parts.push(`-> Titles should feel festive and celebratory, referencing "${todayLabels.join(', ')}" naturally`);
    parts.push(`-> Categories MUST be from: romantic, anniversary, surprise, memory`);
    // Reinforce title style in override context
    if (annLanguage === 'ko') {
      parts.push(`-> TITLE STYLE: 명사형 종결만! "~하기" "~쓰기" "~촬영하기" 절대 금지. "~의 시간", "~한 기록", "~, 우리" 같은 감성 명사형으로.`);
    } else {
      parts.push(`-> TITLE STYLE: Noun-phrase endings ONLY! No "~ing" verb forms. Use evocative titles like "A Letter for Us", "Golden Hour Celebration".`);
    }
  } else if (allUpcoming.length > 0) {
    // Upcoming anniversary - add type context
    let upcomingContext = `\n[Upcoming anniversary] ${allUpcoming.join(', ')}`;
    if (anniversaryTypeLabel) {
      upcomingContext += ` (Type: ${anniversaryTypeLabel})`;
    }
    upcomingContext += ` -> Include at least 1 anniversary-prep mission!`;
    parts.push(upcomingContext);
  }

  // === Birthday ===
  const birthdayInfo = getBirthdayInfo(
    input.userAPreferences?.birthDate,
    input.userBPreferences?.birthDate
  );

  if (birthdayInfo.isToday && birthdayInfo.todayLabel) {
    const bdLanguage = useLanguageStore.getState().language;
    // Birthday TODAY! ALL missions MUST be birthday-themed
    parts.push(`\n### 🎂 TODAY IS ${birthdayInfo.todayLabel}! — THIS OVERRIDES ALL OTHER RULES ###`);
    parts.push(`-> EVERY SINGLE mission (100%) MUST be birthday-themed. Not just 1 or 2 — ALL of them.`);
    parts.push(`-> Each mission must be a DIFFERENT birthday celebration: e.g., surprise party planning, special birthday dinner, gift hunting, birthday cake making/buying, photo shoot, birthday letter writing, wish list date, birthday dessert crawl`);
    parts.push(`-> Titles should feel festive and celebratory, referencing the birthday naturally`);
    parts.push(`-> Categories MUST be from: romantic, anniversary, surprise, memory`);
    // Reinforce title style in birthday override context
    if (bdLanguage === 'ko') {
      parts.push(`-> TITLE STYLE: 명사형 종결만! "~하기" "~쓰기" "~만들기" 절대 금지. "~의 시간", "~한 기록", "~, 우리" 같은 감성 명사형으로.`);
    } else {
      parts.push(`-> TITLE STYLE: Noun-phrase endings ONLY! No "~ing" verb forms. Use evocative titles like "Birthday Cake and Us", "A Wish for You".`);
    }
  } else if (birthdayInfo.upcoming.length > 0) {
    parts.push(`\n[Upcoming birthday] ${birthdayInfo.upcoming.join(', ')} -> Include at least 1 birthday-prep mission! (gift ideas, party planning, surprise preparation, reservation)`);
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

function getMBTIGuidance(mbtiA?: string, mbtiB?: string): string {
  if (!mbtiA && !mbtiB) return '';
  const a = mbtiA || '?';
  const b = mbtiB || '?';

  const tensions: string[] = [];

  if (a !== '?' && b !== '?') {
    const hasEI = a.includes('E') !== b.includes('E');
    if (hasEI) tensions.push('E/I: one needs stimulation, other needs recharge → activities with BOTH social AND quiet moments (e.g., cafe + board game, gallery + dinner)');

    const hasJP = a.includes('J') !== b.includes('J');
    if (hasJP) tensions.push('J/P: one plans, other is spontaneous → semi-structured activities (reservation + flexible content)');

    const hasNS = a.includes('N') !== b.includes('N');
    if (hasNS) tensions.push('N/S: one abstract, other practical → activities combining creativity WITH tangible results (cooking, crafts, photo projects)');

    const hasFT = a.includes('F') !== b.includes('F');
    if (hasFT) tensions.push('F/T: one emotional, other analytical → friendly competition with emotional stakes (bet on games, challenge with prizes)');
  }

  // Tone personalization based on MBTI dimensions
  let toneGuide = '';
  const types = [a, b].filter(t => t !== '?');
  const hasF = types.some(t => t.includes('F'));
  const hasT = types.some(t => t.includes('T'));
  const hasN = types.some(t => t.includes('N'));
  const hasS = types.some(t => t.includes('S'));

  if (hasF && !hasT) {
    toneGuide = '\n-> Description tone: Warm, emotionally engaging. Focus on feelings and connection.';
  } else if (hasT && !hasF) {
    toneGuide = '\n-> Description tone: Clear, action-oriented. Focus on what to do and why it\'s fun.';
  } else if (hasN && !hasS) {
    toneGuide = '\n-> Description tone: Creative, imaginative. Use metaphors and paint a vision.';
  } else if (hasS && !hasN) {
    toneGuide = '\n-> Description tone: Specific, practical. Include concrete details and steps.';
  }

  if (tensions.length === 0) {
    return `\n[MBTI] ${a} + ${b} -> Compatible types. Leverage shared strengths. Avoid stereotypical MBTI suggestions.${toneGuide}`;
  }

  return `\n[MBTI] ${a} + ${b}\n-> Tensions to RESOLVE through activity choice (NOT stereotypical MBTI suggestions):\n  ${tensions.join('\n  ')}${toneGuide}`;
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

  // 3. Activity pattern staleness detection
  if (history.recentTitles.length >= 5) {
    const recentFive = history.recentTitles.slice(0, 5);
    parts.push(`\n-> STALENESS CHECK: Last 5 missions were: ${recentFive.join(' | ')}`);
    parts.push(`-> If these feel repetitive, FORCE a completely different vibe:`);
    parts.push(`   * If all were calm → suggest 1 HIGH-ENERGY mission`);
    parts.push(`   * If all were outdoor → suggest 1 INDOOR/HOME mission`);
    parts.push(`   * If all were food-related → suggest 1 NON-FOOD mission`);
    parts.push(`   * If all were free → suggest 1 PAID experience`);
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
      winter: '일루미네이션, 온천, 겨울 야경 산책, 따뜻한 국물 맛집, 붕어빵/호떡 길거리 간식, 겨울 바다 드라이브',
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
      winter: 'Ice skating, winter hikes, ski trips, warm soup spots, holiday light walks',
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
      winter: 'Mulled wine, winter walks, outdoor markets, warm bakeries, canal strolls',
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
      winter: 'Cozy cafes, live music venues, wine regions, local food markets',
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
      cool: 'Cozy cafes, evening walks, warm food dates, outdoor markets',
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
${language === 'ko' ? `- TITLE: 인스타그램 캡션 스타일 (5~15자 내외).
  - 핵심 규칙: '명사형 종결'을 주로 사용 (~하는 시간, ~한 기록, ~의 밤).
  - 톤앤매너: 힙하고 미니멀한 잡지 제목이나 전시회 포스팅 느낌.
  - 주의사항: 이모지는 절대 사용하지 말 것. 오직 텍스트로만 감성을 전달함.
  - Good: "노을 맛집 카페, 우리", "취향 가득 채운 플레이리스트", "오늘의 메뉴: 직접 만든 파스타", "보드게임 한 판 승부", "하온이를 위한 케이크 한 조각", "기념일, 우리만의 앨범"
  - Bad: "카페에 방문하기", "소중한 추억을 만들어보세요", "즐거운 보드게임 시간", "편지 쓰기", "사진 촬영하기", "케이크 만들기"
  - FORBIDDEN endings: "~하기", "~쓰기", "~촬영하기", "~만들기", "~보내기" (동사형 종결 절대 금지. 제목은 반드시 명사형으로 끝나야 함)
  - FORBIDDEN words: "속삭임", "메아리", "여정", "오아시스", "찬란한", "영원한", "하모니"
- DESCRIPTION: 친구에게 카톡으로 제안하듯 아주 담백하고 짧게.
  - 핵심 규칙: '~해보세요' 대신 '~하기', '~하면 어때?', '~하기로 해' 같은 구어체 사용.
  - 지침: AI 티가 나는 수식어(특별한, 소중한, 잊지 못할)를 전부 빼고 '구체적인 행동'만 남길 것.
  - Good: "좋아하는 노래 크게 틀어놓고 같이 요리하기", "근처 코인노래방 가서 서로 최애곡 불러주기"
  - Bad: "요리를 하며 서로의 유대감을 깊게 쌓아보세요", "노래방에서 즐거운 시간을 가져보시는 건 어떨까요?"
  - FORBIDDEN: "탐험", "발견", "유대감", "추억을 쌓다", "시간을 보내다", "매력에 빠지다"` : `- TITLE: Instagram-ready caption (short, punchy, 2-5 words).
  - Rule: Use noun-ending phrases or mood-focused snippets.
  - Note: DO NOT use any emojis. Keep it clean and text-only.
  - Good: "Golden Hour and Us", "Our Recipe Log", "Puzzle Masters", "Winter Night Walk", "A Cake for Haon", "Our Anniversary Album"
  - Bad: "Go to a cafe", "Making a wonderful memory", "A journey for love", "Writing a letter", "Taking photos", "Making a cake"
  - FORBIDDEN endings: Verb-form titles like "Writing ~", "Making ~", "Taking ~", "Going to ~" (titles must end with nouns/phrases)
  - FORBIDDEN words: "Whispers", "Echoes", "Symphony", "Tapestry", "Embark", "Oasis"
- DESCRIPTION: Casual DM style, like a close friend. Action-oriented.
  - Rule: Avoid "Discover", "Explore", "Bond over". Just tell them what to do.
  - Good: "Grab a coffee and hit the park for people-watching.", "Try a 500-piece puzzle with some lo-fi beats."
  - Bad: "Embark on a puzzle journey to discover the joy of teamwork."
  - FORBIDDEN: "Take time to", "Immerse yourselves", "Uncover the magic", "Special moments", "Strengthen your bond"`}
  Use VARIED opening words: verbs, nouns, adjectives, questions, metaphors
- description: Specific action, MUST be 50-80 chars (not shorter, not longer)${canMeetToday ? '' : '\n- description: Must NOT imply physical meeting'}
- Never mention prices
- Activities should naturally lend themselves to photo verification
- Each mission: DIFFERENT category
- IMPRACTICAL COMBOS TO AVOID:
  * Indoor activities outdoors (puzzles/board games at park, cooking outside)
  * Activities needing equipment in wrong setting (stargazing + activities needing light)
  * Weather-dependent activities without shelter backup
  * Activities requiring extensive prep for casual dates
- ITEM DIVERSITY: NEVER repeat the same specific food, drink, or activity item across multiple missions. If one mission mentions a specific drink (e.g., hot chocolate), NO other mission can reference it. Each mission must feel completely distinct.
- FORBIDDEN THEMES: NEVER reference Christmas, Halloween, Valentine's, New Year, or any holiday UNLESS the user context [DATE] falls within that holiday's PREP~DAY window. Holiday missions are OK during prep period (for preparation/planning) and on the day itself, but ABSOLUTELY FORBIDDEN after the holiday has passed. "Winter" ≠ "Christmas".

RELATIONSHIP STAGE GUIDE:
- New couple (<6mo): First experiences together, playful/exciting dates, getting-to-know activities
- Growing couple (6mo-2yr): Deeper bonding, trying new hobbies together, relationship milestones
- Established couple (2-5yr): Break routine with fresh surprises, new challenges, rediscover each other
- Mature couple (5-10yr): Meaningful quality time, revisit favorite memories, appreciation gestures
- Long-term couple (10yr+): Bucket list adventures, comfortable but special, celebrating the journey
- Married couples: Can include domestic/home-building activities, family planning dates, deeper commitment themes
- Dating couples: Focus on excitement, discovery, romantic gestures, building memories
-> Match mission tone and activity type to the couple's [RELATIONSHIP] info in the user context

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
  {"title":"Puzzle & Snack Evening","description":"Work on a puzzle while sharing your favorite snacks","category":"game","difficulty":2},
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
- DISTANCE LIMIT: STRICTLY follow the Distance constraint in [TODAY] section. Do NOT suggest places beyond the specified radius (e.g., don't suggest Han River for someone in Ansan with 5km limit)
- PRACTICALITY: Missions must be realistically doable. Ask yourself: "Would a real couple actually do this?"
  * Bad: "Stargazing while doing puzzles outdoors" (impractical - puzzles need light/table)
  * Bad: "Cook gourmet meal at park" (no kitchen outdoors)
  * Good: "Stargazing with hot chocolate" (simple, romantic, doable)
  * Good: "Puzzle night at home with candles" (cozy, practical)
- APPEAL: Missions should sound fun and inviting, not like homework or chores
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
      presence_penalty: 1.0,
      frequency_penalty: 0.5,
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
