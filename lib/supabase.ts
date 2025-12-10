import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Supabase 클라이언트를 조건부로 생성 (환경변수 없으면 null)
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

// 개발 모드에서 Supabase 없이도 앱 테스트 가능
export const isDemoMode = !supabase;

// Helper to get supabase client with null check
function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase client is not initialized. Check your environment variables.');
  }
  return supabase;
}

// Database helper functions
export const db = {
  // Profiles
  profiles: {
    async get(userId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      return { data, error };
    },

    async create(profile: {
      id: string;
      nickname: string;
      invite_code: string;
      preferences?: Record<string, unknown>;
      birth_date?: string; // ISO date string
      location_latitude?: number;
      location_longitude?: number;
      location_city?: string;
      location_district?: string;
    }) {
      const client = getSupabase();
      const { data, error } = await client
        .from('profiles')
        .insert(profile)
        .select()
        .single();
      return { data, error };
    },

    async update(userId: string, updates: Record<string, unknown>) {
      const client = getSupabase();
      const { data, error } = await client
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
      return { data, error };
    },

    async findByInviteCode(code: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('invite_code', code)
        .single();
      return { data, error };
    },
  },

  // Couples
  couples: {
    async get(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couples')
        .select('*')
        .eq('id', coupleId)
        .single();
      return { data, error };
    },

    async getByUserId(userId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couples')
        .select('*')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .single();
      return { data, error };
    },

    async create(couple: {
      user1_id: string;
      anniversary_date?: string;
      anniversary_type?: string;
      dating_start_date?: string; // ISO date string - when they started dating
      wedding_date?: string; // ISO date string - wedding anniversary (if married)
    }) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couples')
        .insert(couple)
        .select()
        .single();
      return { data, error };
    },

    async joinCouple(coupleId: string, userId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couples')
        .update({ user2_id: userId, status: 'active' })
        .eq('id', coupleId)
        .select()
        .single();
      return { data, error };
    },

    async update(coupleId: string, updates: Record<string, unknown>) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couples')
        .update(updates)
        .eq('id', coupleId)
        .select()
        .single();
      return { data, error };
    },
  },

  // Missions
  missions: {
    async getAll() {
      const client = getSupabase();
      const { data, error } = await client
        .from('missions')
        .select('*')
        .order('created_at', { ascending: false });
      return { data, error };
    },

    async getByCategory(category: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('missions')
        .select('*')
        .eq('category', category);
      return { data, error };
    },

    async getRandom(limit = 5) {
      const client = getSupabase();
      const { data, error } = await client
        .from('missions')
        .select('*')
        .limit(limit);
      return { data, error };
    },
  },

  // Daily Missions
  dailyMissions: {
    async getToday(coupleId: string) {
      const client = getSupabase();
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await client
        .from('daily_missions')
        .select('*, mission:missions(*)')
        .eq('couple_id', coupleId)
        .eq('assigned_date', today)
        .single();
      return { data, error };
    },

    async create(dailyMission: {
      couple_id: string;
      mission_id: string;
      ai_reason: string;
      assigned_date: string;
    }) {
      const client = getSupabase();
      const { data, error } = await client
        .from('daily_missions')
        .insert(dailyMission)
        .select('*, mission:missions(*)')
        .single();
      return { data, error };
    },

    async updateStatus(id: string, status: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('daily_missions')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },

    async getHistory(coupleId: string, limit = 30) {
      const client = getSupabase();
      const { data, error } = await client
        .from('daily_missions')
        .select('*, mission:missions(*)')
        .eq('couple_id', coupleId)
        .order('assigned_date', { ascending: false })
        .limit(limit);
      return { data, error };
    },
  },

  // Completed Missions (Memories)
  completedMissions: {
    async getAll(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('completed_missions')
        .select('*')
        .eq('couple_id', coupleId)
        .order('completed_at', { ascending: false });
      return { data, error };
    },

    async getByMonth(coupleId: string, year: number, month: number) {
      const client = getSupabase();
      const startDate = new Date(year, month, 1).toISOString();
      const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

      const { data, error } = await client
        .from('completed_missions')
        .select('*')
        .eq('couple_id', coupleId)
        .gte('completed_at', startDate)
        .lte('completed_at', endDate)
        .order('completed_at', { ascending: false });
      return { data, error };
    },

    // Create memory for AI-generated missions (no mission_id FK)
    async create(memory: {
      couple_id: string;
      photo_url: string;
      user1_message: string;
      user2_message?: string;
      location?: string;
      mission_data: {
        id: string;
        title: string;
        description: string;
        category: string;
        icon: string;
        imageUrl?: string;
        difficulty?: number;
        tags?: string[];
      };
    }) {
      const client = getSupabase();
      const { data, error } = await client
        .from('completed_missions')
        .insert({
          couple_id: memory.couple_id,
          photo_url: memory.photo_url,
          user1_message: memory.user1_message,
          user2_message: memory.user2_message || '',
          location: memory.location || '',
          mission_data: memory.mission_data,
          // mission_id is null for AI-generated missions
        })
        .select()
        .single();
      return { data, error };
    },

    // Get single memory by ID
    async getById(id: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('completed_missions')
        .select('*')
        .eq('id', id)
        .single();
      return { data, error };
    },

    // Update memory (e.g., add partner's message)
    async update(id: string, updates: Record<string, unknown>) {
      const client = getSupabase();
      const { data, error } = await client
        .from('completed_missions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },

    // Delete memory
    async delete(id: string) {
      const client = getSupabase();
      const { error } = await client
        .from('completed_missions')
        .delete()
        .eq('id', id);
      return { error };
    },
  },

  // Onboarding Answers
  onboardingAnswers: {
    async get(userId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('onboarding_answers')
        .select('*')
        .eq('user_id', userId)
        .single();
      return { data, error };
    },

    async upsert(userId: string, answers: Record<string, unknown>) {
      const client = getSupabase();
      const { data, error } = await client
        .from('onboarding_answers')
        .upsert({ user_id: userId, answers })
        .select()
        .single();
      return { data, error };
    },
  },

  // Anniversaries
  anniversaries: {
    async getAll(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('anniversaries')
        .select('*')
        .eq('couple_id', coupleId)
        .order('date', { ascending: true });
      return { data, error };
    },

    async create(anniversary: {
      couple_id: string;
      title: string;
      date: string;
      is_recurring?: boolean;
    }) {
      const client = getSupabase();
      const { data, error } = await client
        .from('anniversaries')
        .insert(anniversary)
        .select()
        .single();
      return { data, error };
    },

    async update(id: string, updates: Record<string, unknown>) {
      const client = getSupabase();
      const { data, error } = await client
        .from('anniversaries')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },

    async delete(id: string) {
      const client = getSupabase();
      const { error } = await client
        .from('anniversaries')
        .delete()
        .eq('id', id);
      return { error };
    },
  },

  // Todos
  todos: {
    async getAll(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('todos')
        .select('*')
        .eq('couple_id', coupleId)
        .order('date', { ascending: true });
      return { data, error };
    },

    async getByDate(coupleId: string, date: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('todos')
        .select('*')
        .eq('couple_id', coupleId)
        .eq('date', date)
        .order('created_at', { ascending: true });
      return { data, error };
    },

    async create(todo: {
      couple_id: string;
      title: string;
      date?: string;
      created_by?: string;
    }) {
      const client = getSupabase();
      const { data, error } = await client
        .from('todos')
        .insert(todo)
        .select()
        .single();
      return { data, error };
    },

    async toggleComplete(id: string, completed: boolean, completedBy?: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('todos')
        .update({
          completed,
          completed_by: completed ? completedBy : null,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },

    async delete(id: string) {
      const client = getSupabase();
      const { error } = await client
        .from('todos')
        .delete()
        .eq('id', id);
      return { error };
    },
  },

  // Mission Completions (per-user)
  missionCompletions: {
    async getByMission(dailyMissionId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('mission_completions')
        .select('*')
        .eq('daily_mission_id', dailyMissionId);
      return { data, error };
    },

    async create(completion: {
      daily_mission_id: string;
      user_id: string;
      photo_url?: string;
      message?: string;
    }) {
      const client = getSupabase();
      const { data, error } = await client
        .from('mission_completions')
        .insert(completion)
        .select()
        .single();
      return { data, error };
    },

    async update(id: string, updates: Record<string, unknown>) {
      const client = getSupabase();
      const { data, error } = await client
        .from('mission_completions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },
  },

  // Featured Missions (Admin-created special missions)
  featuredMissions: {
    async getActiveForToday() {
      const client = getSupabase();
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await client
        .from('featured_missions')
        .select('*')
        .eq('is_active', true)
        .or(`start_date.is.null,start_date.lte.${today}`)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('priority', { ascending: false })
        .limit(2); // 최대 2개

      return { data, error };
    },

    async getAll() {
      const client = getSupabase();
      const { data, error } = await client
        .from('featured_missions')
        .select('*')
        .order('priority', { ascending: false });
      return { data, error };
    },

    async getById(id: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('featured_missions')
        .select('*')
        .eq('id', id)
        .single();
      return { data, error };
    },

    async create(mission: {
      mission_id?: string;
      title: string;
      description: string;
      category: string;
      difficulty: number;
      duration: string;
      location_type: string;
      tags: string[];
      icon: string;
      image_url: string;
      estimated_time: number;
      start_date?: string;
      end_date?: string;
      priority?: number;
      target_audience?: string;
    }) {
      const client = getSupabase();
      const { data, error } = await client
        .from('featured_missions')
        .insert(mission)
        .select()
        .single();
      return { data, error };
    },

    async update(id: string, updates: Record<string, unknown>) {
      const client = getSupabase();
      const { data, error } = await client
        .from('featured_missions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },

    async delete(id: string) {
      const client = getSupabase();
      const { error } = await client
        .from('featured_missions')
        .delete()
        .eq('id', id);
      return { error };
    },
  },

  // Announcements
  announcements: {
    async getActive() {
      const client = getSupabase();
      const { data, error } = await client
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      return { data, error };
    },

    async getAll() {
      const client = getSupabase();
      const { data, error } = await client
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });
      return { data, error };
    },

    async getById(id: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('announcements')
        .select('*')
        .eq('id', id)
        .single();
      return { data, error };
    },

    async create(announcement: {
      title: string;
      date: string;
      is_new?: boolean;
      content?: string;
      is_active?: boolean;
    }) {
      const client = getSupabase();
      const { data, error } = await client
        .from('announcements')
        .insert(announcement)
        .select()
        .single();
      return { data, error };
    },

    async update(id: string, updates: Record<string, unknown>) {
      const client = getSupabase();
      const { data, error } = await client
        .from('announcements')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },

    async delete(id: string) {
      const client = getSupabase();
      const { error } = await client
        .from('announcements')
        .delete()
        .eq('id', id);
      return { error };
    },
  },

  // FAQ Items
  faqItems: {
    async getActive() {
      const client = getSupabase();
      const { data, error } = await client
        .from('faq_items')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      return { data, error };
    },

    async getAll() {
      const client = getSupabase();
      const { data, error } = await client
        .from('faq_items')
        .select('*')
        .order('display_order', { ascending: true });
      return { data, error };
    },

    async getByCategory(category: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('faq_items')
        .select('*')
        .eq('category', category)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      return { data, error };
    },

    async getById(id: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('faq_items')
        .select('*')
        .eq('id', id)
        .single();
      return { data, error };
    },

    async create(faqItem: {
      question: string;
      answer: string;
      category?: string;
      display_order?: number;
      is_active?: boolean;
    }) {
      const client = getSupabase();
      const { data, error } = await client
        .from('faq_items')
        .insert(faqItem)
        .select()
        .single();
      return { data, error };
    },

    async update(id: string, updates: Record<string, unknown>) {
      const client = getSupabase();
      const { data, error } = await client
        .from('faq_items')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },

    async delete(id: string) {
      const client = getSupabase();
      const { error } = await client
        .from('faq_items')
        .delete()
        .eq('id', id);
      return { error };
    },
  },

  // Mission Categories
  missionCategories: {
    async getAll() {
      const client = getSupabase();
      const { data, error } = await client
        .from('mission_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      return { data, error };
    },

    async getByCategory(category: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('mission_categories')
        .select('*')
        .eq('category', category)
        .eq('is_active', true)
        .single();
      return { data, error };
    },

    async getByGroup(groupName: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('mission_categories')
        .select('*')
        .eq('group_name', groupName)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      return { data, error };
    },
  },

  // Storage
  storage: {
    async uploadPhoto(coupleId: string, uri: string): Promise<string | null> {
      try {
        const client = getSupabase();
        const response = await fetch(uri);
        const blob = await response.blob();
        const fileName = `${coupleId}/${Date.now()}.jpg`;

        const { data, error } = await client.storage
          .from('memories')
          .upload(fileName, blob, {
            contentType: 'image/jpeg',
          });

        if (error) {
          console.error('Upload error:', error);
          return null;
        }

        const { data: urlData } = client.storage
          .from('memories')
          .getPublicUrl(data.path);

        return urlData.publicUrl;
      } catch (error) {
        console.error('Upload error:', error);
        return null;
      }
    },
  },
};

export default supabase;
