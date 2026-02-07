// Daydate Type Definitions

// User & Authentication
export interface User {
  id: string;
  email: string;
  nickname: string;
  avatarUrl?: string;
  inviteCode?: string; // Deprecated - no longer used
  coupleId?: string;
  preferences: UserPreferences;
  birthDate?: Date; // For age-based mission recommendations
  birthDateCalendarType?: 'solar' | 'lunar'; // Solar or Lunar calendar for birthdate
  locationLatitude?: number;
  locationLongitude?: number;
  locationCity?: string;
  locationDistrict?: string;
  createdAt: Date;
}

export interface UserPreferences {
  weekendActivity: string;
  dateEnergy: string;
  dateTypes: string[];
  adventureLevel: string;
  photoPreference: string;
  dateStyle: string;
  planningStyle: string;
  foodStyles: string[];
  preferredTimes: string[];
  budgetStyle: string;
}

// Couple
export interface Couple {
  id: string;
  user1Id: string;
  user2Id?: string;
  anniversaryDate?: Date; // Legacy field (optional - set when user inputs dating start date)
  anniversaryType: string; // Legacy field (now accepts i18n translated strings)
  datingStartDate?: Date; // For 100-day anniversary calculation
  weddingDate?: Date; // For wedding anniversary (if married)
  relationshipType?: 'dating' | 'married'; // Relationship type for anniversary display
  timezone?: string; // Shared timezone for the couple ('auto' or IANA timezone string)
  status: CoupleStatus;
  disconnectedAt?: Date; // For 30-day recovery period
  disconnectedBy?: string; // user_id who initiated disconnect
  createdAt: Date;
}

export type AnniversaryType = '연애 시작일' | '결혼 기념일' | '첫 만남' | '아이 출생일';
export type CoupleStatus = 'pending' | 'active' | 'disconnected';

// Mission
export interface Mission {
  id: string;
  title: string;
  description: string;
  category: MissionCategory;
  tags: string[];
  imageUrl: string;
  isPremium: boolean;
  moodTags?: ('cozy' | 'foodie' | 'romantic' | 'healing' | 'adventure' | 'active' | 'culture')[];
}

export type MissionCategory =
  // 🍴 Food & Drink
  | 'cafe'           // ☕ 카페
  | 'restaurant'     // 🍽️ 레스토랑
  | 'streetfood'     // 🍜 맛집투어/포장마차
  | 'dessert'        // 🍰 디저트/빵지순례
  | 'cooking'        // 👨‍🍳 함께 요리
  | 'drink'          // 🍷 바/펍/와인바
  | 'brunch'         // 🥐 브런치

  // 🏞️ Place & Environment
  | 'outdoor'        // 🌳 야외 (공원, 산책, 피크닉)
  | 'home'           // 🏠 홈데이트
  | 'travel'         // ✈️ 여행
  | 'daytrip'        // 🚗 당일치기/근교
  | 'drive'          // 🛣️ 드라이브
  | 'night'          // 🌙 야경/야간
  | 'nature'         // ⛰️ 자연 (등산, 바다, 캠핑)

  // 🎯 Activities
  | 'culture'        // 🎭 전시/공연/뮤지컬
  | 'movie'          // 🎬 영화
  | 'sports'         // ⚽ 스포츠 (볼링, 탁구, 배드민턴)
  | 'fitness'        // 💪 운동 (헬스, 필라테스, 러닝)
  | 'wellness'       // 🧘 힐링 (스파, 찜질방, 명상)
  | 'creative'       // 🎨 만들기 (공방, 원데이클래스)
  | 'game'           // 🎮 게임 (보드게임, 방탈출, PC방)
  | 'shopping'       // 🛍️ 쇼핑
  | 'photo'          // 📸 사진 (인생네컷, 셀프스튜디오)
  | 'learning'       // 📚 함께 배우기 (언어, 악기)

  // 💝 Special & Romantic
  | 'romantic'       // 💕 로맨틱 서프라이즈
  | 'anniversary'    // 🎉 기념일
  | 'surprise'       // 🎁 깜짝 이벤트
  | 'memory'         // 📖 추억 만들기 (타임캡슐, 편지)

  // 🌐 Online (못 만나는 날)
  | 'online'         // 💻 온라인 (영통, 넷플릭스 파티)
  | 'challenge';     // 🔥 챌린지 (커플 챌린지)
export type MissionDifficulty = 1 | 2 | 3;
export type LocationType = 'indoor' | 'outdoor' | 'any';

// Memory (for UI components)
export interface Memory {
  id: string;
  coupleId: string;
  missionId: string;
  missionTitle: string;
  photoUrl: string;
  myMessage?: string;
  partnerMessage?: string;
  location?: string;
  completedAt: Date;
  isLiked?: boolean;
}

// Daily Mission
export interface DailyMission {
  id: string;
  coupleId: string;
  missionId: string;
  mission: Mission;
  aiReason: string;
  assignedDate: Date;
  status: DailyMissionStatus;
}

export type DailyMissionStatus = 'active' | 'completed' | 'skipped';

// Completed Mission (Memory)
export interface CompletedMission {
  id: string;
  coupleId: string;
  missionId: string;
  mission?: Mission;
  photoUrl: string;
  user1Message: string;
  user2Message: string;
  location: string;
  completedAt: Date;
}

// Kept Mission (Bookmarked)
export interface KeptMission extends Mission {
  keptId: string;
  keptDate: Date;
}

// Target audience structure
export interface TargetAudience {
  type: 'all' | 'country' | 'location' | 'custom';
  country?: string;
  center?: { lat: number; lng: number };
  radiusKm?: number;
  [key: string]: unknown;
}

// Featured Mission (Admin-created special missions)
export interface FeaturedMission {
  id: string;
  missionId?: string;
  title: string;
  description: string;
  // i18n fields for English (optional, falls back to Korean title/description if null)
  titleEn?: string;
  descriptionEn?: string;
  category: MissionCategory;
  tags: string[];
  tagsEn?: string[]; // English tags for i18n
  imageUrl: string;
  startDate?: Date;
  endDate?: Date;
  isActive: boolean;
  priority: number;
  // Targeting fields
  targetAudience: TargetAudience;
  targetCountry?: string;
  targetCenterLat?: number;
  targetCenterLng?: number;
  targetRadiusKm?: number;
  // Additional promotional content (affiliate links, 1-2 sentences)
  additionalContent?: string;
  additionalContentEn?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Onboarding
export interface OnboardingQuestion {
  id: number;
  question: string;
  type: 'single' | 'multiple';
  options: string[];
}

export interface OnboardingSlide {
  title: string;
  description: string;
  imageUrl: string;
  icon: string;
}

// Navigation
export type TabRoute = 'mission' | 'memories' | 'home' | 'calendar' | 'more';

export interface TabItem {
  id: TabRoute;
  label: string;
  icon: string;
}

// UI State
export interface ModalState {
  isVisible: boolean;
  type?: 'anniversary' | 'message' | 'photo' | 'settings';
  data?: unknown;
}

// Calendar
export interface CalendarDay {
  date: Date;
  hasMemory: boolean;
  memoryId?: string;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}

// Store Types
export interface AuthState {
  user: User | null;
  couple: Couple | null;
  partner: User | null;
  isAuthenticated: boolean;
  isOnboardingComplete: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface TodayCompletedMission {
  date: string; // YYYY-MM-DD format
  missionId: string;
}

export interface MissionState {
  dailyMission: DailyMission | null;
  missionHistory: DailyMission[];
  keptMissions: KeptMission[];
  todayCompletedMission: TodayCompletedMission | null;
  isLoading: boolean;
  error: string | null;
}

export interface MemoryState {
  memories: CompletedMission[];
  selectedMemory: CompletedMission | null;
  isLoading: boolean;
  error: string | null;
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
