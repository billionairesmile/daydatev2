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

// Database helper functions
export const db = {
  // Profiles
  profiles: {
    async get(userId: string) {
      const { data, error } = await supabase
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
    }) {
      const { data, error } = await supabase
        .from('profiles')
        .insert(profile)
        .select()
        .single();
      return { data, error };
    },

    async update(userId: string, updates: Record<string, unknown>) {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
      return { data, error };
    },

    async findByInviteCode(code: string) {
      const { data, error } = await supabase
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
      const { data, error } = await supabase
        .from('couples')
        .select('*')
        .eq('id', coupleId)
        .single();
      return { data, error };
    },

    async create(couple: {
      user1_id: string;
      anniversary_date?: string;
      anniversary_type?: string;
    }) {
      const { data, error } = await supabase
        .from('couples')
        .insert(couple)
        .select()
        .single();
      return { data, error };
    },

    async joinCouple(coupleId: string, userId: string) {
      const { data, error } = await supabase
        .from('couples')
        .update({ user2_id: userId, status: 'active' })
        .eq('id', coupleId)
        .select()
        .single();
      return { data, error };
    },
  },

  // Missions
  missions: {
    async getAll() {
      const { data, error } = await supabase
        .from('missions')
        .select('*')
        .order('created_at', { ascending: false });
      return { data, error };
    },

    async getByCategory(category: string) {
      const { data, error } = await supabase
        .from('missions')
        .select('*')
        .eq('category', category);
      return { data, error };
    },

    async getRandom(limit = 5) {
      const { data, error } = await supabase
        .from('missions')
        .select('*')
        .limit(limit);
      return { data, error };
    },
  },

  // Daily Missions
  dailyMissions: {
    async getToday(coupleId: string) {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
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
      const { data, error } = await supabase
        .from('daily_missions')
        .insert(dailyMission)
        .select('*, mission:missions(*)')
        .single();
      return { data, error };
    },

    async updateStatus(id: string, status: string) {
      const { data, error } = await supabase
        .from('daily_missions')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },

    async getHistory(coupleId: string, limit = 30) {
      const { data, error } = await supabase
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
      const { data, error } = await supabase
        .from('completed_missions')
        .select('*, mission:missions(*)')
        .eq('couple_id', coupleId)
        .order('completed_at', { ascending: false });
      return { data, error };
    },

    async getByMonth(coupleId: string, year: number, month: number) {
      const startDate = new Date(year, month, 1).toISOString();
      const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

      const { data, error } = await supabase
        .from('completed_missions')
        .select('*, mission:missions(*)')
        .eq('couple_id', coupleId)
        .gte('completed_at', startDate)
        .lte('completed_at', endDate)
        .order('completed_at', { ascending: false });
      return { data, error };
    },

    async create(memory: {
      couple_id: string;
      mission_id: string;
      photo_url: string;
      user1_message: string;
      user2_message: string;
      location: string;
    }) {
      const { data, error } = await supabase
        .from('completed_missions')
        .insert(memory)
        .select('*, mission:missions(*)')
        .single();
      return { data, error };
    },
  },

  // Storage
  storage: {
    async uploadPhoto(coupleId: string, uri: string): Promise<string | null> {
      try {
        const response = await fetch(uri);
        const blob = await response.blob();
        const fileName = `${coupleId}/${Date.now()}.jpg`;

        const { data, error } = await supabase.storage
          .from('memories')
          .upload(fileName, blob, {
            contentType: 'image/jpeg',
          });

        if (error) {
          console.error('Upload error:', error);
          return null;
        }

        const { data: urlData } = supabase.storage
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
