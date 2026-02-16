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
  // Device timezone for mismatch detection
  device_timezone?: string; // IANA timezone format (e.g., 'Asia/Seoul')
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
      feed_posts: {
        Row: FeedPostRow;
        Insert: Omit<FeedPostRow, 'id' | 'created_at' | 'updated_at' | 'save_count'>;
        Update: Partial<Omit<FeedPostRow, 'id' | 'created_at'>>;
      };
      feed_saves: {
        Row: FeedSaveRow;
        Insert: Omit<FeedSaveRow, 'id' | 'created_at'>;
        Update: never;
      };
    };
  };
};

// Feed Posts (DB row format)
export interface FeedPostRow {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  caption: string;
  source_type: string;
  images: string[];
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  price: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
  external_link: string | null;
  affiliate_link: string | null;
  category: string;
  tags: string[];
  is_published: boolean;
  publish_date: string | null;
  priority: number;
  save_count: number;
}

// Feed Saves (DB row format)
export interface FeedSaveRow {
  id: string;
  user_id: string;
  feed_post_id: string;
  created_at: string;
}
