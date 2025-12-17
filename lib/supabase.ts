import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { File as ExpoFile } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { formatDateToLocal } from './dateUtils';

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
  // Pairing Codes
  pairingCodes: {
    // Create a new pairing code
    async create(code: string, creatorId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('pairing_codes')
        .insert({
          code,
          creator_id: creatorId,
          status: 'pending',
        })
        .select()
        .single();
      return { data, error };
    },

    // Find pairing code by code string
    async findByCode(code: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('pairing_codes')
        .select('*')
        .eq('code', code)
        .eq('status', 'pending')
        .single();
      return { data, error };
    },

    // Join a pairing code (joiner enters the code)
    async join(code: string, joinerId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('pairing_codes')
        .update({
          joiner_id: joinerId,
          status: 'connected',
          connected_at: new Date().toISOString(),
        })
        .eq('code', code)
        .eq('status', 'pending')
        .select()
        .single();
      return { data, error };
    },

    // Get pairing status by creator ID
    async getByCreatorId(creatorId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('pairing_codes')
        .select('*')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return { data, error };
    },

    // Subscribe to pairing code changes (for creator to know when joiner connects)
    subscribeToCode(code: string, callback: (payload: { status: string; joiner_id: string | null; joiner_proceeded_at: string | null }) => void) {
      const client = getSupabase();
      const channel = client
        .channel(`pairing:${code}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'pairing_codes',
            filter: `code=eq.${code}`,
          },
          (payload) => {
            const newRecord = payload.new as { status: string; joiner_id: string | null; joiner_proceeded_at: string | null };
            callback({ status: newRecord.status, joiner_id: newRecord.joiner_id, joiner_proceeded_at: newRecord.joiner_proceeded_at });
          }
        )
        .subscribe();
      return channel;
    },

    // Unsubscribe from pairing code changes
    unsubscribe(channel: ReturnType<SupabaseClient['channel']>) {
      const client = getSupabase();
      client.removeChannel(channel);
    },

    // Delete expired or used pairing codes
    async cleanup(creatorId: string) {
      const client = getSupabase();
      const { error } = await client
        .from('pairing_codes')
        .delete()
        .eq('creator_id', creatorId);
      return { error };
    },

    // Update couple_id on pairing code (called after creator creates couple)
    async setCoupleId(code: string, coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('pairing_codes')
        .update({ couple_id: coupleId })
        .eq('code', code)
        .select()
        .single();
      return { data, error };
    },

    // Get pairing code with couple info (for joiner to get couple_id)
    async getWithCouple(code: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('pairing_codes')
        .select('*, couple_id')
        .eq('code', code)
        .single();
      return { data, error };
    },

    // Mark that joiner has proceeded to next screen
    async markJoinerProceeded(code: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('pairing_codes')
        .update({ joiner_proceeded_at: new Date().toISOString() })
        .eq('code', code)
        .select()
        .single();
      return { data, error };
    },
  },

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
      email?: string;
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

    async upsert(profile: {
      id: string;
      nickname?: string;
      invite_code?: string;
      email?: string;
      preferences?: Record<string, unknown>;
      birth_date?: string;
      location_latitude?: number;
      location_longitude?: number;
      location_city?: string;
      location_district?: string;
    }) {
      const client = getSupabase();
      const { data, error } = await client
        .from('profiles')
        .upsert(profile)
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

    // Soft delete - disconnect couple (30-day recovery period)
    async disconnect(coupleId: string, userId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couples')
        .update({
          status: 'disconnected',
          disconnected_at: new Date().toISOString(),
          disconnected_by: userId,
        })
        .eq('id', coupleId)
        .select()
        .single();
      return { data, error };
    },

    // Find disconnected couple for recovery (within 30 days, same user pair)
    async findDisconnectedCouple(userId1: string, userId2: string) {
      const client = getSupabase();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Check both combinations (user1+user2 or user2+user1)
      const { data, error } = await client
        .from('couples')
        .select('*')
        .eq('status', 'disconnected')
        .gte('disconnected_at', thirtyDaysAgo.toISOString())
        .or(
          `and(user1_id.eq.${userId1},user2_id.eq.${userId2}),and(user1_id.eq.${userId2},user2_id.eq.${userId1})`
        )
        .order('disconnected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { data, error };
    },

    // Restore a disconnected couple
    async restoreCouple(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couples')
        .update({
          status: 'active',
          disconnected_at: null,
          disconnected_by: null,
        })
        .eq('id', coupleId)
        .select()
        .single();
      return { data, error };
    },

    // Get active couple by user ID (excludes disconnected)
    async getActiveByUserId(userId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couples')
        .select('*')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .neq('status', 'disconnected')
        .maybeSingle();
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
      const today = formatDateToLocal(new Date());
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
        icon?: string;
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

    // Subscribe to completed missions changes for real-time sync
    subscribeToCompletedMissions(
      coupleId: string,
      callback: (payload: { eventType: string; memory: unknown }) => void
    ) {
      const client = getSupabase();
      const channel = client
        .channel(`completed_missions:${coupleId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'completed_missions',
            filter: `couple_id=eq.${coupleId}`,
          },
          (payload) => {
            callback({
              eventType: payload.eventType,
              memory: payload.eventType === 'DELETE' ? payload.old : payload.new,
            });
          }
        )
        .subscribe();
      return channel;
    },

    unsubscribeFromCompletedMissions(channel: ReturnType<SupabaseClient['channel']>) {
      const client = getSupabase();
      client.removeChannel(channel);
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

    // Check if user has completed preference survey (has onboarding answers)
    async hasAnswers(userId: string): Promise<boolean> {
      const client = getSupabase();
      const { data, error } = await client
        .from('onboarding_answers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('[onboardingAnswers.hasAnswers] Error:', error);
        return false;
      }
      return data !== null;
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
      const today = formatDateToLocal(new Date());

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

  // ============================================
  // COUPLE SYNC HELPERS (Real-time sync between paired users)
  // ============================================

  // Couple Missions (shared generated missions)
  coupleMissions: {
    async getToday(coupleId: string) {
      const client = getSupabase();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await client
        .from('couple_missions')
        .select('*')
        .eq('couple_id', coupleId)
        .eq('status', 'active')
        .gte('expires_at', today.toISOString())
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { data, error };
    },

    async create(
      coupleId: string,
      missions: unknown[],
      answers: unknown,
      userId: string
    ) {
      const client = getSupabase();
      // Set expiration to next midnight
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1);
      expiresAt.setHours(0, 0, 0, 0);

      const { data, error } = await client
        .from('couple_missions')
        .insert({
          couple_id: coupleId,
          missions,
          generation_answers: answers,
          generated_by: userId,
          expires_at: expiresAt.toISOString(),
          status: 'active',
        })
        .select()
        .single();
      return { data, error };
    },

    async expireOld(coupleId: string) {
      const client = getSupabase();
      const { error } = await client
        .from('couple_missions')
        .update({ status: 'expired' })
        .eq('couple_id', coupleId)
        .eq('status', 'active')
        .lt('expires_at', new Date().toISOString());
      return { error };
    },

    // Delete all active missions for a couple (for reset)
    async deleteActive(coupleId: string) {
      const client = getSupabase();
      const { error } = await client
        .from('couple_missions')
        .delete()
        .eq('couple_id', coupleId)
        .eq('status', 'active');
      return { error };
    },

    subscribeToMissions(
      coupleId: string,
      callback: (payload: { missions: unknown[]; generated_by: string }) => void
    ) {
      const client = getSupabase();
      const channel = client
        .channel(`couple_missions:${coupleId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'couple_missions',
            filter: `couple_id=eq.${coupleId}`,
          },
          (payload) => {
            const record = payload.new as { missions: unknown[]; generated_by: string };
            callback({ missions: record.missions, generated_by: record.generated_by });
          }
        )
        .subscribe();
      return channel;
    },

    unsubscribe(channel: ReturnType<SupabaseClient['channel']>) {
      const client = getSupabase();
      client.removeChannel(channel);
    },
  },

  // Mission Generation Lock (prevents simultaneous generation)
  missionLock: {
    async getStatus(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('mission_generation_lock')
        .select('*')
        .eq('couple_id', coupleId)
        .maybeSingle();
      return { data, error };
    },

    async acquire(coupleId: string, userId: string): Promise<boolean> {
      const client = getSupabase();

      // First check if lock exists
      const { data: existing } = await client
        .from('mission_generation_lock')
        .select('*')
        .eq('couple_id', coupleId)
        .maybeSingle();

      if (existing) {
        // If already generating by someone else, fail
        if (existing.status === 'generating' && existing.locked_by !== userId) {
          // Check if lock is stale (older than 2 minutes)
          const lockTime = new Date(existing.locked_at).getTime();
          const now = Date.now();
          if (now - lockTime < 120000) {
            // Lock is fresh, cannot acquire
            return false;
          }
          // Lock is stale, proceed to update
        }

        // Update existing lock
        const { error } = await client
          .from('mission_generation_lock')
          .update({
            locked_by: userId,
            locked_at: new Date().toISOString(),
            status: 'generating',
          })
          .eq('couple_id', coupleId);

        return !error;
      } else {
        // Create new lock
        const { error } = await client
          .from('mission_generation_lock')
          .insert({
            couple_id: coupleId,
            locked_by: userId,
            locked_at: new Date().toISOString(),
            status: 'generating',
          });

        return !error;
      }
    },

    async release(coupleId: string, status: 'completed' | 'idle' = 'completed') {
      const client = getSupabase();
      const { error } = await client
        .from('mission_generation_lock')
        .update({
          status,
          locked_by: null,
          locked_at: null,
        })
        .eq('couple_id', coupleId);
      return { error };
    },

    subscribeToLock(
      coupleId: string,
      callback: (payload: { status: string; locked_by: string | null }) => void
    ) {
      const client = getSupabase();
      const channel = client
        .channel(`mission_lock:${coupleId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'mission_generation_lock',
            filter: `couple_id=eq.${coupleId}`,
          },
          (payload) => {
            const record = payload.new as { status: string; locked_by: string | null };
            callback({ status: record.status, locked_by: record.locked_by });
          }
        )
        .subscribe();
      return channel;
    },

    unsubscribe(channel: ReturnType<SupabaseClient['channel']>) {
      const client = getSupabase();
      client.removeChannel(channel);
    },
  },

  // Couple Bookmarks (shared bookmarked missions)
  coupleBookmarks: {
    async getAll(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_bookmarks')
        .select('*')
        .eq('couple_id', coupleId)
        .order('created_at', { ascending: false });
      return { data, error };
    },

    async add(coupleId: string, missionId: string, missionData: unknown, userId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_bookmarks')
        .insert({
          couple_id: coupleId,
          mission_id: missionId,
          mission_data: missionData,
          bookmarked_by: userId,
        })
        .select()
        .single();
      return { data, error };
    },

    async remove(coupleId: string, missionId: string) {
      const client = getSupabase();
      const { error } = await client
        .from('couple_bookmarks')
        .delete()
        .eq('couple_id', coupleId)
        .eq('mission_id', missionId);
      return { error };
    },

    async exists(coupleId: string, missionId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_bookmarks')
        .select('id')
        .eq('couple_id', coupleId)
        .eq('mission_id', missionId)
        .maybeSingle();
      return { exists: !!data, error };
    },

    subscribeToBookmarks(
      coupleId: string,
      callback: (payload: { eventType: string; bookmark: unknown }) => void
    ) {
      const client = getSupabase();
      const channel = client
        .channel(`couple_bookmarks:${coupleId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'couple_bookmarks',
            filter: `couple_id=eq.${coupleId}`,
          },
          (payload) => {
            callback({
              eventType: payload.eventType,
              bookmark: payload.eventType === 'DELETE' ? payload.old : payload.new,
            });
          }
        )
        .subscribe();
      return channel;
    },

    unsubscribe(channel: ReturnType<SupabaseClient['channel']>) {
      const client = getSupabase();
      client.removeChannel(channel);
    },
  },

  // Couple Todos (shared todo list - different from the existing todos table)
  coupleTodos: {
    async getAll(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_todos')
        .select('*')
        .eq('couple_id', coupleId)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });
      return { data, error };
    },

    async getByDate(coupleId: string, date: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_todos')
        .select('*')
        .eq('couple_id', coupleId)
        .eq('date', date)
        .order('created_at', { ascending: true });
      return { data, error };
    },

    async create(coupleId: string, date: string, text: string, userId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_todos')
        .insert({
          couple_id: coupleId,
          date,
          text,
          created_by: userId,
        })
        .select()
        .single();
      return { data, error };
    },

    async toggleComplete(todoId: string, completed: boolean, userId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_todos')
        .update({
          completed,
          completed_by: completed ? userId : null,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq('id', todoId)
        .select()
        .single();
      return { data, error };
    },

    async delete(todoId: string) {
      const client = getSupabase();
      const { error } = await client
        .from('couple_todos')
        .delete()
        .eq('id', todoId);
      return { error };
    },

    subscribeToTodos(
      coupleId: string,
      callback: (payload: { eventType: string; todo: unknown }) => void
    ) {
      const client = getSupabase();
      const channel = client
        .channel(`couple_todos:${coupleId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'couple_todos',
            filter: `couple_id=eq.${coupleId}`,
          },
          (payload) => {
            callback({
              eventType: payload.eventType,
              todo: payload.eventType === 'DELETE' ? payload.old : payload.new,
            });
          }
        )
        .subscribe();
      return channel;
    },

    unsubscribe(channel: ReturnType<SupabaseClient['channel']>) {
      const client = getSupabase();
      client.removeChannel(channel);
    },
  },

  // Menstrual Settings (shared menstrual calendar settings)
  menstrualSettings: {
    async get(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('menstrual_settings')
        .select('*')
        .eq('couple_id', coupleId)
        .maybeSingle();
      return { data, error };
    },

    async upsert(
      coupleId: string,
      settings: {
        enabled?: boolean;
        last_period_date?: string;
        cycle_length?: number;
        period_length?: number;
      },
      userId: string
    ) {
      const client = getSupabase();
      const { data, error } = await client
        .from('menstrual_settings')
        .upsert(
          {
            couple_id: coupleId,
            enabled: settings.enabled ?? true, // Default to true when saving period data
            ...settings,
            updated_by: userId,
          },
          { onConflict: 'couple_id' }
        )
        .select()
        .single();
      return { data, error };
    },

    subscribeToSettings(
      coupleId: string,
      callback: (payload: unknown) => void
    ) {
      const client = getSupabase();
      const channel = client
        .channel(`menstrual:${coupleId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'menstrual_settings',
            filter: `couple_id=eq.${coupleId}`,
          },
          (payload) => {
            callback(payload.new);
          }
        )
        .subscribe();
      return channel;
    },

    unsubscribe(channel: ReturnType<SupabaseClient['channel']>) {
      const client = getSupabase();
      client.removeChannel(channel);
    },
  },

  // ============================================
  // EXTENDED SYNC HELPERS (Background, Mission Progress, Albums)
  // ============================================

  // Couple Settings (background image sync)
  coupleSettings: {
    async get(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_settings')
        .select('*')
        .eq('couple_id', coupleId)
        .maybeSingle();
      return { data, error };
    },

    async upsert(
      coupleId: string,
      settings: {
        background_image_url?: string | null;
      },
      userId: string
    ) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_settings')
        .upsert(
          {
            couple_id: coupleId,
            ...settings,
            updated_by: userId,
          },
          { onConflict: 'couple_id' }
        )
        .select()
        .single();
      return { data, error };
    },

    subscribeToSettings(
      coupleId: string,
      callback: (payload: { background_image_url: string | null }) => void
    ) {
      const client = getSupabase();
      const channel = client
        .channel(`couple_settings:${coupleId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'couple_settings',
            filter: `couple_id=eq.${coupleId}`,
          },
          (payload) => {
            const record = payload.new as { background_image_url: string | null };
            callback({ background_image_url: record.background_image_url });
          }
        )
        .subscribe();
      return channel;
    },

    unsubscribe(channel: ReturnType<SupabaseClient['channel']>) {
      const client = getSupabase();
      client.removeChannel(channel);
    },
  },

  // Mission Progress (real-time mission sync with both user messages)
  missionProgress: {
    // Get all mission progress records for today (supports multiple missions per day)
    async getTodayAll(coupleId: string) {
      const client = getSupabase();
      const today = formatDateToLocal(new Date());
      const { data, error } = await client
        .from('mission_progress')
        .select('*')
        .eq('couple_id', coupleId)
        .eq('date', today)
        .order('created_at', { ascending: true });
      return { data: data || [], error };
    },

    // Get the locked mission for today (the one where first message was written)
    async getLockedMission(coupleId: string) {
      const client = getSupabase();
      const today = formatDateToLocal(new Date());
      const { data, error } = await client
        .from('mission_progress')
        .select('*')
        .eq('couple_id', coupleId)
        .eq('date', today)
        .eq('is_message_locked', true)
        .maybeSingle();
      return { data, error };
    },

    // Get progress for a specific mission today
    async getByMissionIdToday(coupleId: string, missionId: string) {
      const client = getSupabase();
      const today = formatDateToLocal(new Date());
      const { data, error } = await client
        .from('mission_progress')
        .select('*')
        .eq('couple_id', coupleId)
        .eq('date', today)
        .eq('mission_id', missionId)
        .maybeSingle();
      return { data, error };
    },

    // Legacy: Get single mission (first one or locked one) - for backwards compatibility
    async getToday(coupleId: string) {
      const client = getSupabase();
      const today = formatDateToLocal(new Date());
      // First try to get locked mission
      const { data: locked, error: lockedError } = await client
        .from('mission_progress')
        .select('*')
        .eq('couple_id', coupleId)
        .eq('date', today)
        .eq('is_message_locked', true)
        .maybeSingle();

      if (locked) return { data: locked, error: null };

      // If no locked mission, get any mission progress
      const { data, error } = await client
        .from('mission_progress')
        .select('*')
        .eq('couple_id', coupleId)
        .eq('date', today)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      return { data, error: lockedError || error };
    },

    async getById(progressId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('mission_progress')
        .select('*')
        .eq('id', progressId)
        .single();
      return { data, error };
    },

    async start(
      coupleId: string,
      missionId: string,
      missionData: unknown,
      userId: string
    ) {
      const client = getSupabase();
      const today = formatDateToLocal(new Date());
      const { data, error } = await client
        .from('mission_progress')
        .insert({
          couple_id: coupleId,
          mission_id: missionId,
          mission_data: missionData,
          user1_id: userId,
          started_by: userId,
          date: today,
          status: 'photo_pending',
        })
        .select()
        .single();
      return { data, error };
    },

    async uploadPhoto(progressId: string, photoUrl: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('mission_progress')
        .update({
          photo_url: photoUrl,
          status: 'message_pending',
        })
        .eq('id', progressId)
        .select()
        .single();
      return { data, error };
    },

    async submitMessage(
      progressId: string,
      userId: string,
      message: string,
      isUser1: boolean
    ) {
      const client = getSupabase();
      const now = new Date().toISOString();

      const updateData: Record<string, unknown> = isUser1
        ? { user1_message: message, user1_message_at: now }
        : { user2_id: userId, user2_message: message, user2_message_at: now };

      // First get current state to check if both messages are now complete
      const { data: current } = await client
        .from('mission_progress')
        .select('user1_message, user2_message, status, couple_id, date, is_message_locked')
        .eq('id', progressId)
        .single();

      // Determine new status and lock state
      if (current) {
        const hasUser1Message = isUser1 ? true : !!current.user1_message;
        const hasUser2Message = isUser1 ? !!current.user2_message : true;

        if (hasUser1Message && hasUser2Message) {
          updateData.status = 'completed';
          updateData.completed_at = now;
        } else {
          updateData.status = 'waiting_partner';
        }

        // If this is the first message for this mission and no other mission is locked,
        // lock this mission for the day
        if (!current.is_message_locked) {
          // Check if any other mission is already locked for today
          const { data: existingLocked } = await client
            .from('mission_progress')
            .select('id')
            .eq('couple_id', current.couple_id)
            .eq('date', current.date)
            .eq('is_message_locked', true)
            .maybeSingle();

          if (!existingLocked) {
            // No other mission is locked, so lock this one
            updateData.is_message_locked = true;
          }
        }
      }

      const { data, error } = await client
        .from('mission_progress')
        .update(updateData)
        .eq('id', progressId)
        .select()
        .single();
      return { data, error };
    },

    async updateLocation(progressId: string, location: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('mission_progress')
        .update({ location })
        .eq('id', progressId)
        .select()
        .single();
      return { data, error };
    },

    async delete(progressId: string) {
      const client = getSupabase();
      const { error } = await client
        .from('mission_progress')
        .delete()
        .eq('id', progressId);
      return { error };
    },

    // Delete all mission progress for today (for reset)
    async deleteToday(coupleId: string) {
      const client = getSupabase();
      const today = formatDateToLocal(new Date());
      const { error } = await client
        .from('mission_progress')
        .delete()
        .eq('couple_id', coupleId)
        .eq('date', today);
      return { error };
    },

    // Delete all non-locked missions for today (cleanup after locked mission completes)
    async deleteNonLockedMissions(coupleId: string) {
      const client = getSupabase();
      const today = formatDateToLocal(new Date());
      const { error } = await client
        .from('mission_progress')
        .delete()
        .eq('couple_id', coupleId)
        .eq('date', today)
        .eq('is_message_locked', false);
      return { error };
    },

    subscribeToProgress(
      coupleId: string,
      callback: (payload: { eventType: string; progress: unknown }) => void
    ) {
      const client = getSupabase();
      const channel = client
        .channel(`mission_progress:${coupleId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'mission_progress',
            filter: `couple_id=eq.${coupleId}`,
          },
          (payload) => {
            callback({
              eventType: payload.eventType,
              progress: payload.eventType === 'DELETE' ? payload.old : payload.new,
            });
          }
        )
        .subscribe();
      return channel;
    },

    unsubscribe(channel: ReturnType<SupabaseClient['channel']>) {
      const client = getSupabase();
      client.removeChannel(channel);
    },
  },

  // Couple Albums (user-created albums sync)
  coupleAlbums: {
    async getAll(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_albums')
        .select('*')
        .eq('couple_id', coupleId)
        .order('created_at', { ascending: false });
      return { data, error };
    },

    async getById(albumId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_albums')
        .select('*')
        .eq('id', albumId)
        .single();
      return { data, error };
    },

    async create(
      coupleId: string,
      album: {
        name: string;
        cover_photo_url?: string;
        name_position?: { x: number; y: number };
        text_scale?: number;
        font_style?: string;
        ransom_seed?: number;
      },
      userId: string
    ) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_albums')
        .insert({
          couple_id: coupleId,
          ...album,
          created_by: userId,
        })
        .select()
        .single();
      return { data, error };
    },

    async update(
      albumId: string,
      updates: {
        name?: string;
        cover_photo_url?: string | null;
        name_position?: { x: number; y: number };
        text_scale?: number;
        font_style?: string;
        ransom_seed?: number;
      }
    ) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_albums')
        .update(updates)
        .eq('id', albumId)
        .select()
        .single();
      return { data, error };
    },

    async delete(albumId: string) {
      const client = getSupabase();
      const { error } = await client
        .from('couple_albums')
        .delete()
        .eq('id', albumId);
      return { error };
    },

    subscribeToAlbums(
      coupleId: string,
      callback: (payload: { eventType: string; album: unknown }) => void
    ) {
      const client = getSupabase();
      const channel = client
        .channel(`couple_albums:${coupleId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'couple_albums',
            filter: `couple_id=eq.${coupleId}`,
          },
          (payload) => {
            callback({
              eventType: payload.eventType,
              album: payload.eventType === 'DELETE' ? payload.old : payload.new,
            });
          }
        )
        .subscribe();
      return channel;
    },

    unsubscribe(channel: ReturnType<SupabaseClient['channel']>) {
      const client = getSupabase();
      client.removeChannel(channel);
    },
  },

  // Album Photos (junction table for album-photo relationships)
  albumPhotos: {
    async getByAlbum(albumId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('album_photos')
        .select('*, memory:completed_missions(*)')
        .eq('album_id', albumId)
        .order('added_at', { ascending: false });
      return { data, error };
    },

    async add(albumId: string, memoryId: string, userId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('album_photos')
        .insert({
          album_id: albumId,
          memory_id: memoryId,
          added_by: userId,
        })
        .select()
        .single();
      return { data, error };
    },

    async remove(albumId: string, memoryId: string) {
      const client = getSupabase();
      const { error } = await client
        .from('album_photos')
        .delete()
        .eq('album_id', albumId)
        .eq('memory_id', memoryId);
      return { error };
    },

    async getAlbumsForMemory(memoryId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('album_photos')
        .select('album_id')
        .eq('memory_id', memoryId);
      return { data, error };
    },

    subscribeToAlbumPhotos(
      coupleId: string,
      callback: (payload: { eventType: string; albumPhoto: unknown }) => void
    ) {
      const client = getSupabase();
      // Subscribe to all album_photos changes for albums belonging to this couple
      // Note: Filtered at application level since we can't filter by couple_id directly
      const channel = client
        .channel(`album_photos:${coupleId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'album_photos',
          },
          (payload) => {
            callback({
              eventType: payload.eventType,
              albumPhoto: payload.eventType === 'DELETE' ? payload.old : payload.new,
            });
          }
        )
        .subscribe();
      return channel;
    },

    unsubscribe(channel: ReturnType<SupabaseClient['channel']>) {
      const client = getSupabase();
      client.removeChannel(channel);
    },
  },

  // Storage
  storage: {
    async uploadPhoto(coupleId: string, uri: string): Promise<string | null> {
      try {
        const client = getSupabase();

        // Read file as base64 using expo-file-system API (React Native compatible)
        const file = new ExpoFile(uri);
        const base64 = await file.base64();

        const fileName = `${coupleId}/${Date.now()}.jpg`;

        const { data, error } = await client.storage
          .from('memories')
          .upload(fileName, decode(base64), {
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

    async uploadBackground(coupleId: string, uri: string): Promise<string | null> {
      try {
        const client = getSupabase();

        // Read file as base64 using new expo-file-system API
        const file = new ExpoFile(uri);
        const base64 = await file.base64();

        const fileName = `backgrounds/${coupleId}/${Date.now()}.jpg`;

        const { data, error } = await client.storage
          .from('memories')
          .upload(fileName, decode(base64), {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (error) {
          console.error('Background upload error:', error);
          return null;
        }

        const { data: urlData } = client.storage
          .from('memories')
          .getPublicUrl(data.path);

        return urlData.publicUrl;
      } catch (error) {
        console.error('Background upload error:', error);
        return null;
      }
    },

    async uploadAlbumCover(coupleId: string, uri: string): Promise<string | null> {
      try {
        const client = getSupabase();

        // Read file as base64 using new expo-file-system API
        const file = new ExpoFile(uri);
        const base64 = await file.base64();

        const fileName = `album-covers/${coupleId}/${Date.now()}.jpg`;

        const { data, error } = await client.storage
          .from('memories')
          .upload(fileName, decode(base64), {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (error) {
          console.error('Album cover upload error:', error);
          return null;
        }

        const { data: urlData } = client.storage
          .from('memories')
          .getPublicUrl(data.path);

        return urlData.publicUrl;
      } catch (error) {
        console.error('Album cover upload error:', error);
        return null;
      }
    },
  },

  // Account Management
  account: {
    /**
     * Completely delete a user's account and all associated data
     * This is a hard delete - data cannot be recovered
     */
    async deleteAccount(userId: string, coupleId: string | null) {
      const client = getSupabase();
      const errors: string[] = [];

      try {
        // 1. Delete mission completions (depends on daily_missions)
        if (coupleId) {
          const { error: mcError } = await client
            .from('mission_completions')
            .delete()
            .eq('user_id', userId);
          if (mcError) errors.push(`mission_completions: ${mcError.message}`);
        }

        // 2. Delete daily missions for the couple
        if (coupleId) {
          const { error: dmError } = await client
            .from('daily_missions')
            .delete()
            .eq('couple_id', coupleId);
          if (dmError) errors.push(`daily_missions: ${dmError.message}`);
        }

        // 3. Delete completed missions for the couple
        if (coupleId) {
          const { error: cmError } = await client
            .from('completed_missions')
            .delete()
            .eq('couple_id', coupleId);
          if (cmError) errors.push(`completed_missions: ${cmError.message}`);
        }

        // 4. Delete anniversaries for the couple
        if (coupleId) {
          const { error: annError } = await client
            .from('anniversaries')
            .delete()
            .eq('couple_id', coupleId);
          if (annError) errors.push(`anniversaries: ${annError.message}`);
        }

        // 5. Delete todos for the couple
        if (coupleId) {
          const { error: todoError } = await client
            .from('todos')
            .delete()
            .eq('couple_id', coupleId);
          if (todoError) errors.push(`todos: ${todoError.message}`);
        }

        // 6. Delete couple sync data
        if (coupleId) {
          const { error: syncError } = await client
            .from('couple_sync')
            .delete()
            .eq('couple_id', coupleId);
          if (syncError) errors.push(`couple_sync: ${syncError.message}`);
        }

        // 7. Delete albums and album photos for the couple
        if (coupleId) {
          // First delete album photos
          const { data: albums } = await client
            .from('albums')
            .select('id')
            .eq('couple_id', coupleId);

          if (albums && albums.length > 0) {
            const albumIds = albums.map(a => a.id);
            const { error: photoError } = await client
              .from('album_photos')
              .delete()
              .in('album_id', albumIds);
            if (photoError) errors.push(`album_photos: ${photoError.message}`);
          }

          // Then delete albums
          const { error: albumError } = await client
            .from('albums')
            .delete()
            .eq('couple_id', coupleId);
          if (albumError) errors.push(`albums: ${albumError.message}`);
        }

        // 8. Delete pairing codes created by this user
        const { error: pcError } = await client
          .from('pairing_codes')
          .delete()
          .eq('creator_id', userId);
        if (pcError) errors.push(`pairing_codes: ${pcError.message}`);

        // 9. Delete onboarding answers
        const { error: oaError } = await client
          .from('onboarding_answers')
          .delete()
          .eq('user_id', userId);
        if (oaError) errors.push(`onboarding_answers: ${oaError.message}`);

        // 10. Delete the couple record
        if (coupleId) {
          const { error: coupleError } = await client
            .from('couples')
            .delete()
            .eq('id', coupleId);
          if (coupleError) errors.push(`couples: ${coupleError.message}`);
        }

        // 11. Delete user profile
        const { error: profileError } = await client
          .from('profiles')
          .delete()
          .eq('id', userId);
        if (profileError) errors.push(`profiles: ${profileError.message}`);

        // 12. Delete storage files (photos, backgrounds, etc.)
        if (coupleId) {
          try {
            // Delete memories folder
            const { data: memoryFiles } = await client.storage
              .from('memories')
              .list(`${coupleId}`);
            if (memoryFiles && memoryFiles.length > 0) {
              const filePaths = memoryFiles.map(f => `${coupleId}/${f.name}`);
              await client.storage.from('memories').remove(filePaths);
            }

            // Delete backgrounds folder
            const { data: bgFiles } = await client.storage
              .from('memories')
              .list(`backgrounds/${coupleId}`);
            if (bgFiles && bgFiles.length > 0) {
              const bgPaths = bgFiles.map(f => `backgrounds/${coupleId}/${f.name}`);
              await client.storage.from('memories').remove(bgPaths);
            }

            // Delete album covers folder
            const { data: coverFiles } = await client.storage
              .from('memories')
              .list(`album-covers/${coupleId}`);
            if (coverFiles && coverFiles.length > 0) {
              const coverPaths = coverFiles.map(f => `album-covers/${coupleId}/${f.name}`);
              await client.storage.from('memories').remove(coverPaths);
            }
          } catch (storageError) {
            console.error('Storage cleanup error:', storageError);
            errors.push(`storage: ${String(storageError)}`);
          }
        }

        // 13. Sign out from Supabase Auth (this invalidates the session)
        const { error: signOutError } = await client.auth.signOut();
        if (signOutError) errors.push(`auth.signOut: ${signOutError.message}`);

        // Return result
        if (errors.length > 0) {
          console.error('[Account Delete] Partial errors:', errors);
          return { success: true, errors }; // Still consider success if main data deleted
        }

        return { success: true, errors: [] };
      } catch (error) {
        console.error('[Account Delete] Fatal error:', error);
        return { success: false, errors: [String(error)] };
      }
    },

    /**
     * Clear all AsyncStorage data
     */
    async clearLocalStorage() {
      try {
        await AsyncStorage.clear();
        return { success: true };
      } catch (error) {
        console.error('[Account Delete] AsyncStorage clear error:', error);
        return { success: false, error: String(error) };
      }
    },
  },

  // ============================================
  // Admin - Couple Cleanup Operations
  // ============================================
  admin: {
    /**
     * Preview disconnected couples that would be cleaned up
     * Shows couples that have been disconnected for any period
     */
    async previewCleanup() {
      const client = getSupabase();
      const { data, error } = await client.rpc('preview_cleanup_disconnected_couples');
      return { data, error };
    },

    /**
     * Run cleanup manually (deletes couples disconnected > 30 days)
     * @param trigger - Source of cleanup: 'manual' or 'user_request'
     */
    async runCleanup(trigger: 'manual' | 'user_request' = 'manual') {
      const client = getSupabase();
      const { data, error } = await client.rpc('cleanup_disconnected_couples_with_log', {
        p_trigger: trigger,
      });
      return { data, error };
    },

    /**
     * Get cleanup history/audit log
     * @param limit - Number of records to fetch
     */
    async getCleanupLog(limit: number = 50) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_cleanup_log')
        .select('*')
        .order('cleaned_up_at', { ascending: false })
        .limit(limit);
      return { data, error };
    },

    /**
     * Get all disconnected couples (for admin dashboard)
     */
    async getDisconnectedCouples() {
      const client = getSupabase();
      const { data, error } = await client
        .from('couples')
        .select(`
          id,
          user1_id,
          user2_id,
          status,
          disconnected_at,
          disconnected_by,
          created_at
        `)
        .eq('status', 'disconnected')
        .order('disconnected_at', { ascending: true });
      return { data, error };
    },

    /**
     * Clean up storage files for a specific couple
     * Call this before or after deleting couple data
     */
    async cleanupCoupleStorage(coupleId: string) {
      const client = getSupabase();
      const errors: string[] = [];

      try {
        // Delete memories folder
        const { data: memoryFiles } = await client.storage
          .from('memories')
          .list(`${coupleId}`);
        if (memoryFiles && memoryFiles.length > 0) {
          const filePaths = memoryFiles.map(f => `${coupleId}/${f.name}`);
          const { error } = await client.storage.from('memories').remove(filePaths);
          if (error) errors.push(`memories: ${error.message}`);
        }

        // Delete backgrounds folder
        const { data: bgFiles } = await client.storage
          .from('memories')
          .list(`backgrounds/${coupleId}`);
        if (bgFiles && bgFiles.length > 0) {
          const bgPaths = bgFiles.map(f => `backgrounds/${coupleId}/${f.name}`);
          const { error } = await client.storage.from('memories').remove(bgPaths);
          if (error) errors.push(`backgrounds: ${error.message}`);
        }

        // Delete album covers folder
        const { data: coverFiles } = await client.storage
          .from('memories')
          .list(`album-covers/${coupleId}`);
        if (coverFiles && coverFiles.length > 0) {
          const coverPaths = coverFiles.map(f => `album-covers/${coupleId}/${f.name}`);
          const { error } = await client.storage.from('memories').remove(coverPaths);
          if (error) errors.push(`album-covers: ${error.message}`);
        }

        return {
          success: errors.length === 0,
          errors,
        };
      } catch (error) {
        return {
          success: false,
          errors: [...errors, String(error)],
        };
      }
    },

    /**
     * Run full cleanup via Edge Function (includes Storage cleanup)
     * @param dryRun - If true, only preview without deleting
     */
    async runFullCleanup(dryRun: boolean = false) {
      const client = getSupabase();
      const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

      if (!projectUrl) {
        return {
          success: false,
          error: 'Supabase URL not configured',
        };
      }

      try {
        const { data, error } = await client.functions.invoke('cleanup-couples', {
          body: {
            trigger: 'manual',
            dry_run: dryRun,
          },
        });

        if (error) {
          return { success: false, error: error.message, data: null };
        }

        return { success: true, error: null, data };
      } catch (error) {
        return { success: false, error: String(error), data: null };
      }
    },

    /**
     * Preview cleanup (dry run) - shows what would be deleted
     */
    async previewFullCleanup() {
      return this.runFullCleanup(true);
    },
  },
};

export default supabase;
