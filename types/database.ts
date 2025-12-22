/**
 * Supabase Database Type Definitions
 * Auto-generated types for database schema
 */

export interface Profile {
  id: string;
  nickname: string;
  preferences?: Record<string, unknown>;
  birth_date?: string; // ISO date string
  location_latitude?: number;
  location_longitude?: number;
  location_city?: string;
  location_district?: string;
  // User consent fields
  age_verified?: boolean;
  terms_agreed?: boolean;
  location_terms_agreed?: boolean;
  privacy_agreed?: boolean;
  marketing_agreed?: boolean;
  consent_given_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Couple {
  id: string;
  user1_id: string;
  user2_id?: string;
  anniversary_date?: string; // Legacy field
  anniversary_type?: string; // Legacy field
  dating_start_date?: string; // ISO date string - when they started dating
  wedding_date?: string; // ISO date string - wedding anniversary
  status?: string; // 'pending' | 'active' | 'disconnected'
  disconnected_at?: string; // ISO date string - when disconnected (for 30-day recovery)
  disconnected_by?: string; // user_id who initiated disconnect
  created_at?: string;
  updated_at?: string;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: number;
  duration: string;
  location_type: 'indoor' | 'outdoor';
  tags: string[];
  icon: string;
  image_url?: string;
  is_premium: boolean;
  estimated_time: number;
  created_at?: string;
}

export interface DailyMission {
  id: string;
  couple_id: string;
  mission_id: string;
  ai_reason: string;
  assigned_date: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  created_at?: string;
  updated_at?: string;
}

export interface CompletedMission {
  id: string;
  couple_id: string;
  mission_id: string;
  photo_url: string;
  user1_message: string;
  user2_message: string;
  location: string;
  completed_at: string;
  created_at?: string;
}

export interface OnboardingAnswers {
  id: string;
  user_id: string;
  answers: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface Anniversary {
  id: string;
  couple_id: string;
  title: string;
  date: string;
  is_recurring: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Todo {
  id: string;
  couple_id: string;
  title: string;
  date?: string;
  created_by?: string;
  completed: boolean;
  completed_by?: string;
  completed_at?: string;
  created_at?: string;
}

export interface MissionCompletion {
  id: string;
  daily_mission_id: string;
  user_id: string;
  photo_url?: string;
  message?: string;
  created_at?: string;
}

export interface FeaturedMission {
  id: string;
  mission_id?: string;
  title: string;
  description: string;
  // i18n fields for English (optional, falls back to Korean title/description if null)
  title_en?: string;
  description_en?: string;
  category: string;
  difficulty: number;
  duration: string;
  location_type: 'indoor' | 'outdoor' | 'any';
  tags: string[];
  icon: string;
  image_url: string;
  estimated_time: number;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  priority: number;
  target_audience: string;
  created_at?: string;
  updated_at?: string;
}

// Database response types
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;
      };
      couples: {
        Row: Couple;
        Insert: Omit<Couple, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Couple, 'id' | 'created_at' | 'updated_at'>>;
      };
      missions: {
        Row: Mission;
        Insert: Omit<Mission, 'id' | 'created_at'>;
        Update: Partial<Omit<Mission, 'id' | 'created_at'>>;
      };
      daily_missions: {
        Row: DailyMission;
        Insert: Omit<DailyMission, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DailyMission, 'id' | 'created_at' | 'updated_at'>>;
      };
      completed_missions: {
        Row: CompletedMission;
        Insert: Omit<CompletedMission, 'id' | 'created_at'>;
        Update: Partial<Omit<CompletedMission, 'id' | 'created_at'>>;
      };
      onboarding_answers: {
        Row: OnboardingAnswers;
        Insert: Omit<OnboardingAnswers, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<OnboardingAnswers, 'id' | 'created_at' | 'updated_at'>>;
      };
      anniversaries: {
        Row: Anniversary;
        Insert: Omit<Anniversary, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Anniversary, 'id' | 'created_at' | 'updated_at'>>;
      };
      todos: {
        Row: Todo;
        Insert: Omit<Todo, 'id' | 'created_at'>;
        Update: Partial<Omit<Todo, 'id' | 'created_at'>>;
      };
      mission_completions: {
        Row: MissionCompletion;
        Insert: Omit<MissionCompletion, 'id' | 'created_at'>;
        Update: Partial<Omit<MissionCompletion, 'id' | 'created_at'>>;
      };
      featured_missions: {
        Row: FeaturedMission;
        Insert: Omit<FeaturedMission, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<FeaturedMission, 'id' | 'created_at' | 'updated_at'>>;
      };
    };
  };
};
