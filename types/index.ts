// Daydate Type Definitions

// User & Authentication
export interface User {
  id: string;
  email: string;
  nickname: string;
  avatarUrl?: string;
  inviteCode: string;
  coupleId?: string;
  preferences: UserPreferences;
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
  anniversaryDate: Date;
  anniversaryType: AnniversaryType;
  status: CoupleStatus;
  createdAt: Date;
}

export type AnniversaryType = '연애 시작일' | '결혼 기념일' | '첫 만남' | '아이 출생일';
export type CoupleStatus = 'pending' | 'active';

// Mission
export interface Mission {
  id: string;
  title: string;
  description: string;
  category: MissionCategory;
  difficulty: MissionDifficulty;
  duration: string;
  locationType: LocationType;
  tags: string[];
  icon: string;
  imageUrl: string;
  isPremium: boolean;
  estimatedTime?: number;
}

export type MissionCategory = 'romance' | 'outdoor' | 'food' | 'entertainment' | 'home' | 'special';
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

export interface MissionState {
  dailyMission: DailyMission | null;
  missionHistory: DailyMission[];
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
