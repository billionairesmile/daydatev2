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
  birthDate?: Date;
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
export type TabRoute = 'memories' | 'home' | 'calendar' | 'more';

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

// Legacy Memory Types (kept for Phase 2 album migration — completed_missions table still exists)
export type MissionCategory = 'home' | 'outdoor' | 'food' | 'creative' | 'adventure' | 'romantic';

export interface Mission {
  id: string;
  title: string;
  description: string;
  category: MissionCategory;
  tags: string[];
  imageUrl: string;
  isPremium: boolean;
}

export interface CompletedMission {
  id: string;
  coupleId: string;
  missionId: string;
  mission: Mission;
  photoUrl: string;
  user1Message: string;
  user2Message: string;
  location: string;
  completedAt: Date;
}

export interface MemoryState {
  memories: CompletedMission[];
  selectedMemory: CompletedMission | null;
  isLoading: boolean;
  error: string | null;
}

// Feed Types
export type FeedCategory = 'all' | 'festival' | 'performance' | 'restaurant' | 'activity' | 'spot';

export interface FeedPost {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  caption: string;
  sourceType: string;
  images: string[];
  locationName?: string;
  latitude?: number;
  longitude?: number;
  price?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  externalLink?: string;
  affiliateLink?: string;
  category: FeedCategory;
  tags: string[];
  isPublished: boolean;
  publishDate?: string;
  priority: number;
  saveCount: number;
}

export interface FeedSave {
  id: string;
  userId: string;
  feedPostId: string;
  createdAt: string;
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
