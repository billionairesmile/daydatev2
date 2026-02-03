import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { File as ExpoFile } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { formatDateToLocal, formatDateInTimezone } from './dateUtils';
import * as ImageManipulator from 'expo-image-manipulator';

// Note: useTimezoneStore is imported dynamically to avoid require cycle
// supabase.ts <-> timezoneStore.ts

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
// Static check: true if Supabase is not configured
export const isDemoMode = !supabase;

// Dynamic test mode check function - checks user-selected test mode from authStore
// Import authStore dynamically to avoid circular dependencies
export const isInTestMode = (): boolean => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAuthStore } = require('@/stores/authStore');
    return isDemoMode || useAuthStore.getState().isTestMode;
  } catch {
    return isDemoMode;
  }
};

// Helper to get supabase client with null check
function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase client is not initialized. Check your environment variables.');
  }
  return supabase;
}

// Helper to extract storage path from public URL
// URL format: https://{project}.supabase.co/storage/v1/object/public/memories/{path}
function extractStoragePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const marker = '/storage/v1/object/public/memories/';
    const index = url.indexOf(marker);
    if (index === -1) return null;
    return url.substring(index + marker.length);
  } catch {
    return null;
  }
}

// Helper to delete a file from storage
async function deleteFromStorage(path: string | null): Promise<void> {
  if (!path) return;
  try {
    const client = getSupabase();
    const { error } = await client.storage.from('memories').remove([path]);
    if (error) {
      console.warn('[Storage] Failed to delete file:', path, error.message);
    } else {
      console.log('[Storage] Deleted file:', path);
    }
  } catch (e) {
    console.warn('[Storage] Delete error:', e);
  }
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
    // Uses maybeSingle() to avoid PGRST116 error when code doesn't exist
    async findByCode(code: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('pairing_codes')
        .select('*')
        .eq('code', code)
        .eq('status', 'pending')
        .maybeSingle();
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
    // Uses maybeSingle() to avoid PGRST116 error when no codes exist
    async getByCreatorId(creatorId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('pairing_codes')
        .select('*')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { data, error };
    },

    // Delete pending pairing codes by creator ID (cleanup old codes before creating new)
    async deleteByCreatorId(creatorId: string) {
      const client = getSupabase();
      const { error } = await client
        .from('pairing_codes')
        .delete()
        .eq('creator_id', creatorId)
        .eq('status', 'pending');
      return { error };
    },

    // Get valid pending pairing code (not expired, within 24 hours)
    // Prioritizes codes with couple_id set (fully initialized) over orphaned codes
    // Uses maybeSingle() to avoid PGRST116 error when no valid code exists
    async getValidPendingCode(creatorId: string) {
      const client = getSupabase();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // First, try to find a code with couple_id set (properly linked code)
      const { data: linkedCode, error: linkedError } = await client
        .from('pairing_codes')
        .select('*')
        .eq('creator_id', creatorId)
        .eq('status', 'pending')
        .not('couple_id', 'is', null)
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (linkedCode) {
        // Clean up any orphaned codes (codes without couple_id) for this user
        await client
          .from('pairing_codes')
          .delete()
          .eq('creator_id', creatorId)
          .eq('status', 'pending')
          .is('couple_id', null);

        return { data: linkedCode, error: linkedError };
      }

      // If no linked code found, return the most recent code (might be orphaned)
      const { data, error } = await client
        .from('pairing_codes')
        .select('*')
        .eq('creator_id', creatorId)
        .eq('status', 'pending')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return { data, error };
    },

    // Clean up orphaned pairing codes (codes without couple_id) for a user
    async cleanupOrphanedCodes(creatorId: string) {
      const client = getSupabase();
      const { error } = await client
        .from('pairing_codes')
        .delete()
        .eq('creator_id', creatorId)
        .eq('status', 'pending')
        .is('couple_id', null);
      return { error };
    },

    // Subscribe to pairing code changes (for creator to know when joiner connects)
    subscribeToCode(code: string, callback: (payload: { status: string; joiner_id: string | null; joiner_proceeded_at: string | null; couple_id: string | null }) => void) {
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
            const newRecord = payload.new as { status: string; joiner_id: string | null; joiner_proceeded_at: string | null; couple_id: string | null };
            callback({ status: newRecord.status, joiner_id: newRecord.joiner_id, joiner_proceeded_at: newRecord.joiner_proceeded_at, couple_id: newRecord.couple_id });
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
    // Uses maybeSingle() to avoid error if code was already deleted/expired
    async setCoupleId(code: string, coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('pairing_codes')
        .update({ couple_id: coupleId })
        .eq('code', code)
        .select()
        .maybeSingle();
      return { data, error };
    },

    // Get pairing code with couple info (for joiner to get couple_id)
    // Only returns pending codes - connected codes are considered "already used"
    // Uses maybeSingle() to avoid PGRST116 error when code doesn't exist
    async getWithCouple(code: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('pairing_codes')
        .select('*, couple_id')
        .eq('code', code)
        .eq('status', 'pending')
        .maybeSingle();
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
        .maybeSingle();
      return { data, error };
    },

    async upsert(profile: {
      id: string;
      nickname?: string;
      email?: string;
      auth_provider?: string;
      preferences?: Record<string, unknown>;
      birth_date?: string;
      location_latitude?: number;
      location_longitude?: number;
      location_city?: string;
      location_district?: string;
      couple_id?: string;
      is_onboarding_complete?: boolean;
      age_verified?: boolean;
      terms_agreed?: boolean;
      location_terms_agreed?: boolean;
      privacy_agreed?: boolean;
      marketing_agreed?: boolean;
      consent_given_at?: string;
    }) {
      const client = getSupabase();
      const { data, error } = await client
        .from('profiles')
        .upsert(profile)
        .select()
        .single();
      return { data, error };
    },

    /**
     * Update user's device timezone for mismatch detection
     */
    async updateDeviceTimezone(userId: string, deviceTimezone: string) {
      const client = getSupabase();
      const { error } = await client
        .from('profiles')
        .update({ device_timezone: deviceTimezone })
        .eq('id', userId);
      return { error };
    },

    /**
     * Get both partner profiles' device timezones for a couple
     */
    async getCoupleDeviceTimezones(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('profiles')
        .select('id, device_timezone')
        .eq('couple_id', coupleId);
      return { data, error };
    },

    // Subscribe to profile changes (for partner nickname/birthday sync)
    subscribeToProfile(
      userId: string,
      callback: (payload: {
        id: string;
        nickname: string;
        birth_date: string | null;
        preferences: Record<string, unknown> | null;
      }) => void
    ) {
      const client = getSupabase();
      const channel = client
        .channel(`profile:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${userId}`,
          },
          (payload) => {
            const newData = payload.new as {
              id: string;
              nickname: string;
              birth_date: string | null;
              preferences: Record<string, unknown> | null;
            };
            callback(newData);
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

  // Couples
  couples: {
    async get(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couples')
        .select('*')
        .eq('id', coupleId)
        .maybeSingle();
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
      timezone?: string; // IANA timezone string from creator's device (e.g., 'Asia/Seoul')
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

    // Update timezone for a couple
    async updateTimezone(coupleId: string, timezone: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couples')
        .update({ timezone })
        .eq('id', coupleId)
        .select()
        .single();
      return { data, error };
    },

    // Update heart liked status (for real-time sync between partners)
    async updateHeartLiked(coupleId: string, userId: string | null) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couples')
        .update({ heart_liked_by: userId })
        .eq('id', coupleId)
        .select()
        .single();
      return { data, error };
    },

    // Subscribe to couple updates (for timezone sync, status changes, heart liked, etc.)
    subscribeToCoupleUpdates(
      coupleId: string,
      callback: (payload: { timezone: string | null; status: string; heart_liked_by: string | null }) => void
    ) {
      const client = getSupabase();
      const channel = client
        .channel(`couple_updates:${coupleId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'couples',
            filter: `id=eq.${coupleId}`,
          },
          (payload) => {
            const record = payload.new as { timezone: string | null; status: string; heart_liked_by: string | null };
            callback({ timezone: record.timezone, status: record.status, heart_liked_by: record.heart_liked_by });
          }
        )
        .subscribe();
      return channel;
    },

    unsubscribeFromCoupleUpdates(channel: ReturnType<SupabaseClient['channel']>) {
      const client = getSupabase();
      client.removeChannel(channel);
    },

    // Soft delete - disconnect couple (30-day recovery period)
    // reason: 'unpaired' (manual disconnect) or 'account_deleted' (user deleted account)
    async disconnect(coupleId: string, userId: string, reason: 'unpaired' | 'account_deleted' = 'unpaired') {
      const client = getSupabase();
      // Don't use .select().single() to avoid PGRST116 error when 0 rows match
      const { error } = await client
        .from('couples')
        .update({
          status: 'disconnected',
          disconnected_at: new Date().toISOString(),
          disconnected_by: userId,
          disconnect_reason: reason,
        })
        .eq('id', coupleId)
        .neq('status', 'disconnected'); // Only update if not already disconnected
      return { data: null, error };
    },

    // Find disconnected couple for recovery (within 30 days, same user pair)
    // Only finds couples that were disconnected by unpair (not account deletion)
    async findDisconnectedCouple(userId1: string, userId2: string) {
      const client = getSupabase();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Check both combinations (user1+user2 or user2+user1)
      // Exclude couples where disconnect_reason is 'account_deleted' (no reconnection allowed)
      const { data, error } = await client
        .from('couples')
        .select('*')
        .eq('status', 'disconnected')
        .gte('disconnected_at', thirtyDaysAgo.toISOString())
        .or('disconnect_reason.is.null,disconnect_reason.eq.unpaired') // Only allow reconnection for unpaired couples
        .or(
          `and(user1_id.eq.${userId1},user2_id.eq.${userId2}),and(user1_id.eq.${userId2},user2_id.eq.${userId1})`
        )
        .order('disconnected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { data, error };
    },

    // Restore a disconnected couple
    // Note: disconnect_reason is NOT cleared here - it's used as a flag for reconnection detection
    // The creator's realtime handler will clear it after detecting the reconnection
    async restoreCouple(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couples')
        .update({
          status: 'active',
          disconnected_at: null,
          disconnected_by: null,
          // Don't clear disconnect_reason - needed for reconnection detection
        })
        .eq('id', coupleId)
        .select()
        .single();
      return { data, error };
    },

    // Find active couple between two specific users (for reconnection detection)
    // This is used by the pairing code creator to find if there's a restored couple
    async findActiveCoupleBetweenUsers(userId1: string, userId2: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couples')
        .select('*')
        .eq('status', 'active')
        .or(
          `and(user1_id.eq.${userId1},user2_id.eq.${userId2}),and(user1_id.eq.${userId2},user2_id.eq.${userId1})`
        )
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { data, error };
    },

    // Get active couple by user ID (excludes disconnected, prioritizes fully paired)
    async getActiveByUserId(userId: string) {
      const client = getSupabase();

      // First, try to find a fully paired active couple (both user1_id and user2_id set)
      // This handles the case where user has multiple couples (pending + active)
      const { data: pairedCouple, error: pairedError } = await client
        .from('couples')
        .select('*')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .eq('status', 'active')
        .not('user2_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pairedCouple) {
        console.log('[DB] getActiveByUserId: Found fully paired couple:', pairedCouple.id);
        return { data: pairedCouple, error: null };
      }

      // Fallback: return any non-disconnected couple (including pending)
      const { data, error } = await client
        .from('couples')
        .select('*')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .neq('status', 'disconnected')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        console.log('[DB] getActiveByUserId: Found couple (fallback):', data.id, 'status:', data.status, 'user2_id:', data.user2_id);
      }
      return { data, error: error || pairedError };
    },

    // Get disconnected couple by user ID (within 30 days, for reconnection)
    async getDisconnectedByUserId(userId: string) {
      const client = getSupabase();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await client
        .from('couples')
        .select('*')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .eq('status', 'disconnected')
        .gte('disconnected_at', thirtyDaysAgo.toISOString())
        .order('disconnected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { data, error };
    },

    // Cleanup orphaned pending couples for a user
    // Call this when user successfully connects to a new couple
    // This function handles FK constraints by nullifying pairing_codes first
    async cleanupPendingCouples(userId: string, excludeCoupleId?: string) {
      const client = getSupabase();

      // Step 1: Find all pending couples to delete (for logging and FK handling)
      let findQuery = client
        .from('couples')
        .select('id')
        .eq('user1_id', userId)
        .eq('status', 'pending')
        .is('user2_id', null);

      if (excludeCoupleId) {
        findQuery = findQuery.neq('id', excludeCoupleId);
      }

      const { data: pendingCouples, error: findError } = await findQuery;

      if (findError) {
        console.warn('[couples.cleanupPendingCouples] Error finding pending couples:', findError.message);
        return { error: findError };
      }

      if (!pendingCouples || pendingCouples.length === 0) {
        console.log('[couples.cleanupPendingCouples] No pending couples to clean up for user:', userId);
        return { error: null };
      }

      const coupleIds = pendingCouples.map(c => c.id);
      console.log('[couples.cleanupPendingCouples] Found pending couples to delete:', coupleIds);

      // Step 2: Nullify couple_id in pairing_codes that reference these pending couples
      // This prevents FK constraint violations when deleting couples
      const { error: nullifyError } = await client
        .from('pairing_codes')
        .update({ couple_id: null })
        .in('couple_id', coupleIds);

      if (nullifyError) {
        console.warn('[couples.cleanupPendingCouples] Error nullifying pairing_codes:', nullifyError.message);
        // Continue anyway - the couple delete might still work if no codes reference it
      } else {
        console.log('[couples.cleanupPendingCouples] Nullified pairing_codes referencing pending couples');
      }

      // Step 3: Delete the pending couples
      const { error: deleteError } = await client
        .from('couples')
        .delete()
        .in('id', coupleIds);

      if (deleteError) {
        console.warn('[couples.cleanupPendingCouples] Error deleting pending couples:', deleteError.message);
      } else {
        console.log('[couples.cleanupPendingCouples] Successfully deleted pending couples for user:', userId);
      }

      return { error: deleteError };
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

    // Get mission history summary for deduplication (hybrid approach)
    // Returns recent titles and category counts - optimized for token efficiency
    async getMissionHistorySummary(coupleId: string, limit: number = 30): Promise<{
      recentTitles: string[];
      categoryStats: Record<string, number>;
      totalCompleted: number;
    }> {
      const client = getSupabase();

      // Get recent missions (last N missions)
      const { data, error } = await client
        .from('completed_missions')
        .select('mission_data, completed_at')
        .eq('couple_id', coupleId)
        .order('completed_at', { ascending: false })
        .limit(limit);

      if (error || !data) {
        console.error('[getMissionHistorySummary] Error:', error);
        return { recentTitles: [], categoryStats: {}, totalCompleted: 0 };
      }

      // Extract titles and count categories
      const recentTitles: string[] = [];
      const categoryStats: Record<string, number> = {};

      for (const mission of data) {
        const missionData = mission.mission_data as { title?: string; category?: string } | null;
        if (missionData) {
          // Add title (if exists)
          if (missionData.title) {
            recentTitles.push(missionData.title);
          }
          // Count category
          if (missionData.category) {
            categoryStats[missionData.category] = (categoryStats[missionData.category] || 0) + 1;
          }
        }
      }

      return {
        recentTitles,
        categoryStats,
        totalCompleted: data.length,
      };
    },

    // Get all completed mission IDs (for filtering out already completed missions)
    async getCompletedMissionIds(coupleId: string): Promise<{ data: string[] | null; error: Error | null }> {
      const client = getSupabase();
      try {
        const { data, error } = await client
          .from('completed_missions')
          .select('mission_data')
          .eq('couple_id', coupleId);

        if (error) {
          return { data: null, error };
        }

        // Extract mission IDs from mission_data
        const missionIds: string[] = [];
        for (const row of data || []) {
          const missionData = row.mission_data as { id?: string } | null;
          if (missionData?.id) {
            missionIds.push(missionData.id);
          }
        }

        return { data: missionIds, error: null };
      } catch (err) {
        return { data: null, error: err as Error };
      }
    },

    // Subscribe to completed missions changes for real-time sync
    subscribeToCompletedMissions(
      coupleId: string,
      callback: (payload: { eventType: string; memory: unknown }) => void
    ) {
      const client = getSupabase();
      console.log('[Supabase] Creating completed_missions subscription for couple:', coupleId);
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
            console.log('[Supabase] completed_missions event received:', payload.eventType, 'id:', (payload.new as Record<string, unknown>)?.id || (payload.old as Record<string, unknown>)?.id);
            callback({
              eventType: payload.eventType,
              memory: payload.eventType === 'DELETE' ? payload.old : payload.new,
            });
          }
        )
        .subscribe((status) => {
          console.log('[Supabase] completed_missions subscription status:', status);
        });
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
      icon?: string;
      bg_color?: string;
      gradient_colors?: string[];
    }) {
      const client = getSupabase();
      const { data, error } = await client
        .from('anniversaries')
        .insert(anniversary)
        .select()
        .single();
      return { data, error };
    },

    async update(id: string, updates: {
      title?: string;
      date?: string;
      is_recurring?: boolean;
      icon?: string;
      bg_color?: string;
      gradient_colors?: string[];
    }) {
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

    subscribeToAnniversaries(
      coupleId: string,
      callback: (payload: { eventType: string; anniversary: unknown }) => void
    ) {
      const client = getSupabase();
      const channel = client
        .channel(`anniversaries:${coupleId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'anniversaries',
            filter: `couple_id=eq.${coupleId}`,
          },
          (payload) => {
            callback({
              eventType: payload.eventType,
              anniversary: payload.eventType === 'DELETE' ? payload.old : payload.new,
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
      // Use effective timezone for date comparison
      // Dynamic import to avoid require cycle (supabase.ts <-> timezoneStore.ts)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useTimezoneStore } = require('@/stores/timezoneStore');
      const effectiveTimezone = useTimezoneStore.getState().getEffectiveTimezone();
      const today = formatDateInTimezone(new Date(), effectiveTimezone);

      // Fetch all active featured missions first, then filter by date in JS
      // This avoids issues with chaining multiple .or() calls in Supabase
      const { data: allData, error } = await client
        .from('featured_missions')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (error || !allData) {
        return { data: null, error };
      }

      // Filter by date range in JavaScript for reliable NULL handling
      const filteredData = allData.filter(mission => {
        const startOk = !mission.start_date || mission.start_date <= today;
        const endOk = !mission.end_date || mission.end_date >= today;
        return startOk && endOk;
      }); // 개수 제한 없음

      return { data: filteredData, error: null };
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

    async getActiveByLanguage(language: 'ko' | 'en' | 'es' | 'zh-TW' | 'ja') {
      const client = getSupabase();
      const { data, error } = await client
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .eq('language', language)
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
    // Get server time to prevent client time manipulation
    async getServerTime(): Promise<Date> {
      const client = getSupabase();
      const { data, error } = await client.rpc('get_server_time');
      if (error || !data) {
        // Fallback to client time if RPC fails (function may not exist yet)
        console.warn('[Supabase] Failed to get server time, using client time:', error?.message);
        return new Date();
      }
      return new Date(data);
    },

    async getToday(coupleId: string) {
      const client = getSupabase();
      // Use server time to prevent client time manipulation
      const serverTime = await this.getServerTime();
      serverTime.setHours(0, 0, 0, 0);

      // Use .gt() (greater than) instead of .gte() to correctly exclude
      // missions that expire at exactly midnight today
      // e.g., mission created Dec 24 expires at Dec 25 00:00:00
      // On Dec 25, this mission should NOT be returned
      const { data, error } = await client
        .from('couple_missions')
        .select('*')
        .eq('couple_id', coupleId)
        .eq('status', 'active')
        .gt('expires_at', serverTime.toISOString())
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { data, error };
    },

    async create(
      coupleId: string,
      missions: unknown[],
      answers: unknown,
      userId: string,
      expiresAtISO?: string // Optional: timezone-aware expiration time in ISO format
    ) {
      const client = getSupabase();

      // Use provided expiration time or fallback to device local time
      let expiresAtString: string;
      if (expiresAtISO) {
        expiresAtString = expiresAtISO;
      } else {
        // Fallback: Set expiration to next midnight in device local time
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 1);
        expiresAt.setHours(0, 0, 0, 0);
        expiresAtString = expiresAt.toISOString();
      }

      const { data, error } = await client
        .from('couple_missions')
        .insert({
          couple_id: coupleId,
          missions,
          generation_answers: answers,
          generated_by: userId,
          expires_at: expiresAtString,
          status: 'active',
          missions_ready: false, // A will set to true after loading images
        })
        .select()
        .single();
      return { data, error };
    },

    async expireOld(coupleId: string) {
      const client = getSupabase();
      // Use server time to prevent client time manipulation
      const serverTime = await this.getServerTime();
      const { error } = await client
        .from('couple_missions')
        .update({ status: 'expired' })
        .eq('couple_id', coupleId)
        .eq('status', 'active')
        .lt('expires_at', serverTime.toISOString());
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

    // Delete all expired missions for a couple (cleanup old data)
    // This prevents data bloat - expired missions are no longer needed
    // Note: couple_bookmarks is independent and won't be affected
    async deleteExpired(coupleId: string) {
      const client = getSupabase();
      const { error } = await client
        .from('couple_missions')
        .delete()
        .eq('couple_id', coupleId)
        .eq('status', 'expired');
      return { error };
    },

    // Mark missions as refreshed (syncs refresh status between users)
    async setRefreshed(coupleId: string) {
      const client = getSupabase();
      const { error } = await client
        .from('couple_missions')
        .update({ refreshed_at: new Date().toISOString() })
        .eq('couple_id', coupleId)
        .eq('status', 'active');
      return { error };
    },

    subscribeToMissions(
      coupleId: string,
      callback: (payload: { missions: unknown[]; generated_by: string; generated_at: string; eventType: 'INSERT' | 'DELETE' | 'UPDATE'; refreshed_at?: string | null; missions_ready?: boolean }) => void
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
            const record = payload.new as { missions: unknown[]; generated_by: string; generated_at: string; refreshed_at?: string | null; missions_ready?: boolean };
            callback({ missions: record.missions, generated_by: record.generated_by, generated_at: record.generated_at, eventType: 'INSERT', refreshed_at: record.refreshed_at, missions_ready: record.missions_ready });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'couple_missions',
            filter: `couple_id=eq.${coupleId}`,
          },
          (payload) => {
            // When missions are updated (e.g., refreshed_at or missions_ready is set), sync the state
            const record = payload.new as { missions: unknown[]; generated_by: string; generated_at: string; refreshed_at?: string | null; missions_ready?: boolean };
            console.log('[Supabase] couple_missions UPDATE event received, refreshed_at:', record.refreshed_at, 'missions_ready:', record.missions_ready);
            callback({ missions: record.missions, generated_by: record.generated_by, generated_at: record.generated_at, eventType: 'UPDATE', refreshed_at: record.refreshed_at, missions_ready: record.missions_ready });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'couple_missions',
            filter: `couple_id=eq.${coupleId}`,
          },
          (payload) => {
            // When missions are deleted, notify with empty array
            console.log('[Supabase] couple_missions DELETE event received');
            callback({ missions: [], generated_by: '', generated_at: '', eventType: 'DELETE' });
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
        // If already generating or watching ad by someone else, fail
        if (
          (existing.status === 'generating' || existing.status === 'ad_watching') &&
          existing.locked_by !== userId
        ) {
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
          pending_missions: null,
          pending_answers: null,
        })
        .eq('couple_id', coupleId);
      return { error };
    },

    // Update lock with pending missions during ad viewing
    async updatePending(
      coupleId: string,
      missions: unknown[],
      answers: unknown,
      userId: string
    ) {
      const client = getSupabase();
      const { error } = await client
        .from('mission_generation_lock')
        .update({
          status: 'ad_watching',
          pending_missions: missions,
          pending_answers: answers,
          locked_by: userId,
          locked_at: new Date().toISOString(),
        })
        .eq('couple_id', coupleId);
      return { error };
    },

    // Clear pending data (on commit or rollback)
    async clearPending(coupleId: string) {
      const client = getSupabase();
      const { error } = await client
        .from('mission_generation_lock')
        .update({
          pending_missions: null,
          pending_answers: null,
        })
        .eq('couple_id', coupleId);
      return { error };
    },

    // Update lock status only (for ad_watching state - no pending missions)
    async updateStatus(
      coupleId: string,
      status: string,
      userId: string
    ) {
      const client = getSupabase();
      const { error } = await client
        .from('mission_generation_lock')
        .update({
          status,
          locked_by: userId,
          locked_at: new Date().toISOString(),
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

    // Mark a bookmark as completed (instead of removing immediately)
    async markCompleted(coupleId: string, missionId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_bookmarks')
        .update({ completed_at: new Date().toISOString() })
        .eq('couple_id', coupleId)
        .eq('mission_id', missionId)
        .select()
        .single();
      return { data, error };
    },

    // Cleanup completed bookmarks that have passed the noon threshold
    async cleanupCompleted(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .rpc('cleanup_couple_completed_bookmarks', { p_couple_id: coupleId });
      return { data, error };
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

    async updateText(todoId: string, text: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('couple_todos')
        .update({ text })
        .eq('id', todoId)
        .select()
        .single();
      return { data, error };
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

      // Auto-cleanup: Delete old background image from storage if changing
      if (settings.background_image_url !== undefined) {
        const { data: currentSettings } = await client
          .from('couple_settings')
          .select('background_image_url')
          .eq('couple_id', coupleId)
          .maybeSingle();

        const oldUrl = currentSettings?.background_image_url;
        const newUrl = settings.background_image_url;

        // Delete old file if URL is changing (new upload or removal)
        if (oldUrl && oldUrl !== newUrl) {
          const oldPath = extractStoragePathFromUrl(oldUrl);
          await deleteFromStorage(oldPath);
        }
      }

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
        .order('started_at', { ascending: true });
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
        .order('started_at', { ascending: true })
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
    // Also deletes associated photos from storage to prevent orphaned files
    async deleteNonLockedMissions(coupleId: string) {
      const client = getSupabase();
      const today = formatDateToLocal(new Date());

      // First, get all non-locked missions to retrieve their photo URLs
      const { data: nonLockedMissions, error: fetchError } = await client
        .from('mission_progress')
        .select('id, photo_url')
        .eq('couple_id', coupleId)
        .eq('date', today)
        .eq('is_message_locked', false);

      if (fetchError) {
        console.error('[MissionProgress] Error fetching non-locked missions:', fetchError);
        return { error: fetchError };
      }

      // Delete photos from storage if they exist
      if (nonLockedMissions && nonLockedMissions.length > 0) {
        const photoUrls = nonLockedMissions
          .map(m => m.photo_url)
          .filter((url): url is string => !!url);

        if (photoUrls.length > 0) {
          // Extract storage paths from URLs and delete
          const storagePaths = photoUrls
            .map(url => extractStoragePathFromUrl(url))
            .filter((path): path is string => !!path);

          if (storagePaths.length > 0) {
            const { error: storageError } = await client.storage
              .from('memories')
              .remove(storagePaths);

            if (storageError) {
              console.warn('[MissionProgress] Error deleting photos from storage:', storageError);
              // Continue with DB deletion even if storage deletion fails
            } else {
              console.log('[MissionProgress] Deleted', storagePaths.length, 'orphaned photos from storage');
            }
          }
        }
      }

      // Delete the mission progress records
      const { error } = await client
        .from('mission_progress')
        .delete()
        .eq('couple_id', coupleId)
        .eq('date', today)
        .eq('is_message_locked', false);

      return { error };
    },

    // Delete all expired (past date) mission progress that wasn't completed
    // Also deletes associated photos from storage to prevent orphaned files
    async deleteExpiredIncomplete(coupleId: string) {
      const client = getSupabase();
      const today = formatDateToLocal(new Date());

      // First, get all incomplete missions from past dates to retrieve their photo URLs
      const { data: expiredMissions, error: fetchError } = await client
        .from('mission_progress')
        .select('id, photo_url')
        .eq('couple_id', coupleId)
        .lt('date', today)
        .neq('status', 'completed');

      if (fetchError) {
        console.error('[MissionProgress] Error fetching expired incomplete missions:', fetchError);
        return { error: fetchError };
      }

      // Delete photos from storage if they exist
      if (expiredMissions && expiredMissions.length > 0) {
        const photoUrls = expiredMissions
          .map(m => m.photo_url)
          .filter((url): url is string => !!url);

        if (photoUrls.length > 0) {
          const storagePaths = photoUrls
            .map(url => extractStoragePathFromUrl(url))
            .filter((path): path is string => !!path);

          if (storagePaths.length > 0) {
            const { error: storageError } = await client.storage
              .from('memories')
              .remove(storagePaths);

            if (storageError) {
              console.warn('[MissionProgress] Error deleting expired photos from storage:', storageError);
            } else {
              console.log('[MissionProgress] Deleted', storagePaths.length, 'expired mission photos from storage');
            }
          }
        }
      }

      // Delete the expired incomplete mission progress records
      const { error } = await client
        .from('mission_progress')
        .delete()
        .eq('couple_id', coupleId)
        .lt('date', today)
        .neq('status', 'completed');

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
        title_color?: string;
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
        title_color?: string;
      }
    ) {
      const client = getSupabase();

      // Auto-cleanup: Delete old cover image from storage if changing
      if (updates.cover_photo_url !== undefined) {
        const { data: currentAlbum } = await client
          .from('couple_albums')
          .select('cover_photo_url')
          .eq('id', albumId)
          .single();

        const oldUrl = currentAlbum?.cover_photo_url;
        const newUrl = updates.cover_photo_url;

        // Delete old file if URL is changing (new upload or removal)
        if (oldUrl && oldUrl !== newUrl) {
          const oldPath = extractStoragePathFromUrl(oldUrl);
          await deleteFromStorage(oldPath);
        }
      }

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
      console.log('[Album Delete] Starting deletion for album:', albumId);

      // Auto-cleanup: Get album data first to delete cover from storage
      const { data: album, error: fetchError } = await client
        .from('couple_albums')
        .select('cover_photo_url')
        .eq('id', albumId)
        .single();

      if (fetchError) {
        console.warn('[Album Delete] Failed to fetch album data:', fetchError.message);
      } else {
        console.log('[Album Delete] Album cover URL:', album?.cover_photo_url);
      }

      // Store cover URL before deletion (in case we need it after DB delete)
      const coverUrl = album?.cover_photo_url;
      const coverPath = coverUrl ? extractStoragePathFromUrl(coverUrl) : null;
      console.log('[Album Delete] Will delete storage path:', coverPath);

      // Delete album record from database
      const { error } = await client
        .from('couple_albums')
        .delete()
        .eq('id', albumId);

      if (error) {
        console.error('[Album Delete] DB delete error:', error.message);
        return { error };
      }

      console.log('[Album Delete] DB record deleted successfully');

      // Delete cover image from storage if exists (after successful DB delete)
      if (coverPath) {
        try {
          const { error: storageError } = await client.storage
            .from('memories')
            .remove([coverPath]);

          if (storageError) {
            console.error('[Album Delete] Storage delete FAILED:', storageError.message, 'Path:', coverPath);
          } else {
            console.log('[Album Delete] Storage file deleted successfully:', coverPath);
          }
        } catch (e) {
          console.error('[Album Delete] Storage delete exception:', e, 'Path:', coverPath);
        }
      } else {
        console.log('[Album Delete] No cover photo to delete (no valid path)');
      }

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
      console.log('[db.albumPhotos.add] Inserting:', { albumId, memoryId, userId });

      // First verify the memory exists in completed_missions
      const { data: memoryCheck, error: memoryCheckError } = await client
        .from('completed_missions')
        .select('id')
        .eq('id', memoryId)
        .single();

      if (memoryCheckError || !memoryCheck) {
        console.error('[db.albumPhotos.add] Memory not found in completed_missions:', memoryId);
        console.error('[db.albumPhotos.add] Error:', memoryCheckError);
        return { data: null, error: memoryCheckError || new Error('Memory not found in database') };
      }

      console.log('[db.albumPhotos.add] Memory exists, proceeding with insert');

      const { data, error } = await client
        .from('album_photos')
        .insert({
          album_id: albumId,
          memory_id: memoryId,
          added_by: userId,
        })
        .select()
        .single();

      // Handle duplicate key error (23505) - photo already exists in album
      if (error && error.code === '23505') {
        console.log('[db.albumPhotos.add] Photo already exists in album, fetching existing record');
        // Fetch the existing record instead - treat as success
        const { data: existingData, error: fetchError } = await client
          .from('album_photos')
          .select()
          .eq('album_id', albumId)
          .eq('memory_id', memoryId)
          .single();

        if (fetchError) {
          console.error('[db.albumPhotos.add] Failed to fetch existing record:', fetchError);
          return { data: null, error: fetchError };
        }

        console.log('[db.albumPhotos.add] Returning existing record:', existingData);
        return { data: existingData, error: null };
      }

      if (error) {
        console.error('[db.albumPhotos.add] Insert error:', error);
        console.error('[db.albumPhotos.add] Error details:', JSON.stringify(error, null, 2));
      } else {
        console.log('[db.albumPhotos.add] Insert successful:', data);

        // Touch the album's updated_at to trigger real-time sync for partners
        // This is necessary because album_photos table doesn't have couple_id,
        // so we use the album update event (which has couple_id filter) to notify partners
        const { error: touchError } = await client
          .from('couple_albums')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', albumId);

        if (touchError) {
          console.warn('[db.albumPhotos.add] Failed to touch album updated_at:', touchError);
        } else {
          console.log('[db.albumPhotos.add] Album updated_at touched for sync');
        }
      }

      return { data, error };
    },

    async remove(albumId: string, memoryId: string) {
      const client = getSupabase();
      console.log('[db.albumPhotos.remove] Deleting:', { albumId, memoryId });

      const { error } = await client
        .from('album_photos')
        .delete()
        .eq('album_id', albumId)
        .eq('memory_id', memoryId);

      if (error) {
        console.error('[db.albumPhotos.remove] Delete error:', error);
      } else {
        console.log('[db.albumPhotos.remove] Delete successful');

        // Touch the album's updated_at to trigger real-time sync for partners
        const { error: touchError } = await client
          .from('couple_albums')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', albumId);

        if (touchError) {
          console.warn('[db.albumPhotos.remove] Failed to touch album updated_at:', touchError);
        } else {
          console.log('[db.albumPhotos.remove] Album updated_at touched for sync');
        }
      }

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
      console.log('[db.albumPhotos.subscribeToAlbumPhotos] Setting up subscription for couple:', coupleId);
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
            console.log('[db.albumPhotos.subscribeToAlbumPhotos] Received realtime event:', payload.eventType);
            console.log('[db.albumPhotos.subscribeToAlbumPhotos] Payload:', JSON.stringify(payload.new || payload.old, null, 2));
            callback({
              eventType: payload.eventType,
              albumPhoto: payload.eventType === 'DELETE' ? payload.old : payload.new,
            });
          }
        )
        .subscribe((status) => {
          console.log('[db.albumPhotos.subscribeToAlbumPhotos] Subscription status:', status);
        });
      return channel;
    },

    unsubscribe(channel: ReturnType<SupabaseClient['channel']>) {
      const client = getSupabase();
      client.removeChannel(channel);
    },
  },

  // Storage
  storage: {
    async uploadPhoto(coupleId: string, uri: string, previousPhotoUrl?: string): Promise<string | null> {
      try {
        const client = getSupabase();

        // Delete previous photo if exists (prevents orphan files when retaking photos)
        if (previousPhotoUrl && previousPhotoUrl.startsWith('http')) {
          const previousPath = extractStoragePathFromUrl(previousPhotoUrl);
          if (previousPath) {
            console.log('[Storage] Deleting previous photo before upload:', previousPath);
            await deleteFromStorage(previousPath);
          }
        }

        // Photo is already processed locally in mission/[id].tsx (1500px, 0.85 quality)
        // No additional compression needed - upload as-is to preserve quality
        // This avoids double compression which degrades image quality significantly
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

        // Resize image for faster upload (max 1080x1440 for 3:4 aspect ratio)
        // This dramatically reduces file size while maintaining good quality
        const manipulatedImage = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1080 } }], // Resize to 1080px width, height auto-calculated
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );

        // Read resized file as base64
        const file = new ExpoFile(manipulatedImage.uri);
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
        // Get session first (needed for Edge Function call later)
        const { data: sessionData } = await client.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        console.log('[Account Delete] Starting deletion, has session:', !!accessToken);

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

        // 6. Delete albums and album photos for the couple
        if (coupleId) {
          // First delete album photos
          const { data: albums } = await client
            .from('couple_albums')
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
            .from('couple_albums')
            .delete()
            .eq('couple_id', coupleId);
          if (albumError) errors.push(`couple_albums: ${albumError.message}`);
        }

        // 7. Delete pairing codes created by this user
        const { error: pcError } = await client
          .from('pairing_codes')
          .delete()
          .eq('creator_id', userId);
        if (pcError) errors.push(`pairing_codes: ${pcError.message}`);

        // 8. Delete onboarding answers
        const { error: oaError } = await client
          .from('onboarding_answers')
          .delete()
          .eq('user_id', userId);
        if (oaError) errors.push(`onboarding_answers: ${oaError.message}`);

        // 9. Delete the couple record
        if (coupleId) {
          const { error: coupleError } = await client
            .from('couples')
            .delete()
            .eq('id', coupleId);
          if (coupleError) errors.push(`couples: ${coupleError.message}`);
        }

        // 10. Delete user profile
        const { error: profileError } = await client
          .from('profiles')
          .delete()
          .eq('id', userId);
        if (profileError) errors.push(`profiles: ${profileError.message}`);

        // 11. Delete from auth.users via Edge Function (AFTER all public data is deleted)
        // This must be done while session is still valid
        if (accessToken) {
          try {
            console.log('[Account Delete] Step 11: Deleting from auth.users (after public data cleanup)');
            const edgeFunctionUrl = `${supabaseUrl}/functions/v1/delete-user-account`;

            const response = await fetch(edgeFunctionUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            });

            console.log('[Account Delete] Edge Function response status:', response.status);

            if (!response.ok) {
              const errorData = await response.json();
              console.error('[Account Delete] Edge function error:', errorData);
              errors.push(`auth.users: ${errorData.error || 'Failed to delete auth user'}`);
            } else {
              const successData = await response.json();
              console.log('[Account Delete] Successfully deleted from auth.users:', successData);
            }
          } catch (authDeleteError) {
            console.error('[Account Delete] Auth user deletion error:', authDeleteError);
            errors.push(`auth.users: ${String(authDeleteError)}`);
          }
        } else {
          console.warn('[Account Delete] No access token - cannot delete from auth.users');
          errors.push('auth.users: No session available for deletion');
        }

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

        // 13. Sign out from Supabase Auth
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
     * Clear Zustand store data from AsyncStorage
     * Note: We only clear our app's Zustand store keys, NOT everything
     * Clearing everything (AsyncStorage.clear()) corrupts expo-router's navigation state
     * which causes "Page not found" errors on Android after account deletion
     */
    async clearLocalStorage() {
      try {
        // Only clear our Zustand store keys, preserve expo-router and other system data
        // Note: Some stores use 'daydate-' prefix, others don't - must match exact key names
        const zustandKeys = [
          'daydate-auth-storage',
          'daydate-subscription-storage',
          'daydate-onboarding-storage',
          'daydate-mission-storage',
          'daydate-memory-storage',
          'daydate-couple-sync-storage',
          'language-storage',  // No daydate- prefix
          'timezone-storage',  // No daydate- prefix
        ];

        // Also clear any other app-specific keys
        const otherAppKeys = [
          'hasSeenHomeTutorial',
          'hasRequestedInitialPermissions',
          // Anniversary-related keys
          'anniversaries_local',
          'anniversaries_pending_sync',
          'anniversaries_last_sync',
          // Offline queue
          '@daydate_offline_queue',
          // Background image
          '@daydate_background_image',
          // Read announcements state
          '@daydate/read_announcements',
          // Test pairing codes (dev)
          'test_pairing_codes',
        ];

        const allKeysToRemove = [...zustandKeys, ...otherAppKeys];
        await AsyncStorage.multiRemove(allKeysToRemove);

        console.log('[Account Delete] Cleared app storage keys:', allKeysToRemove.length);
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
     * Also cleans up storage files for each couple before DB deletion
     * @param trigger - Source of cleanup: 'manual' or 'user_request'
     */
    async runCleanup(trigger: 'manual' | 'user_request' = 'manual') {
      const client = getSupabase();

      // First, get list of couples that will be deleted
      const { data: previewData } = await client.rpc('preview_cleanup_disconnected_couples');

      // Clean up storage for each couple that will be deleted (30+ days disconnected)
      if (previewData && Array.isArray(previewData)) {
        const couplesToDelete = previewData.filter(
          (c: { days_since_disconnect: number }) => c.days_since_disconnect >= 30
        );

        for (const couple of couplesToDelete) {
          console.log('[Cleanup] Cleaning storage for couple:', couple.couple_id);
          await this.cleanupCoupleStorage(couple.couple_id);
        }
      }

      // Then run DB cleanup (CASCADE deletes related records)
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