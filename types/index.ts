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

// Date Record Types (legacy memories stored in local AsyncStorage)
export interface DateRecord {
  id: string;
  coupleId: string;
  missionId: string;
  mission: {
    id: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
    imageUrl: string;
    isPremium: boolean;
  };
  photoUrl: string;
  user1Message: string;
  user2Message: string;
  location: string;
  completedAt: Date;
}

export interface MemoryState {
  memories: DateRecord[];
  selectedMemory: DateRecord | null;
  isLoading: boolean;
  error: string | null;
}

// Feed Types
export type FeedCategory = 'all' | 'festival' | 'show' | 'restaurant' | 'activity' | 'spot' | 'pet';

export interface FeedPost {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  caption: string;
  sourceType: string;
  images: string[];
  sourceId?: string;
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

// Plan Types
export type PlanStatus = 'interested' | 'booked' | 'completed' | 'cancelled';

export interface Plan {
  id: string;
  createdAt: string;
  updatedAt: string;
  coupleId: string;
  addedBy: string;
  feedPostId: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  eventDate: string;
  ticketOpenDate: string | null;
  externalLink: string | null;
  affiliateLink: string | null;
  price: string | null;
  status: PlanStatus;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  memo: string | null;
}

export interface PlanNotification {
  id: string;
  planId: string;
  type: string;
  scheduledAt: string;
  sentAt: string | null;
  includeAffiliateLink: boolean;
  messageTitle: string | null;
  messageBody: string | null;
  isCancelled: boolean;
}

// DB row (snake_case) to App type (camelCase) converters
export function planFromRow(row: Record<string, unknown>): Plan {
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    coupleId: row.couple_id as string,
    addedBy: row.added_by as string,
    feedPostId: (row.feed_post_id as string) || null,
    title: row.title as string,
    description: (row.description as string) || null,
    imageUrl: (row.image_url as string) || null,
    locationName: (row.location_name as string) || null,
    latitude: (row.latitude as number) || null,
    longitude: (row.longitude as number) || null,
    eventDate: row.event_date as string,
    ticketOpenDate: (row.ticket_open_date as string) || null,
    externalLink: (row.external_link as string) || null,
    affiliateLink: (row.affiliate_link as string) || null,
    price: (row.price as string) || null,
    status: row.status as PlanStatus,
    cancelledAt: (row.cancelled_at as string) || null,
    cancelledBy: (row.cancelled_by as string) || null,
    cancelReason: (row.cancel_reason as string) || null,
    memo: (row.memo as string) || null,
  };
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
