import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { File as ExpoFile } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

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
  // Server Time (general utility)
  async getServerTime(): Promise<Date> {
    const client = getSupabase();
    const { data, error } = await client.rpc('get_server_time');
    if (error || !data) {
      console.warn('[Supabase] Failed to get server time, using client time:', error?.message);
      return new Date();
    }
    return new Date(data);
  },

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
      callback: (payload: { eventType: string; anniversary: unknown }) => void,
      subscriberId?: string
    ) {
      const client = getSupabase();
      const channelName = subscriberId
        ? `anniversaries:${coupleId}:${subscriberId}`
        : `anniversaries:${coupleId}:${Date.now()}`;
      const channel = client
        .channel(channelName)
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

  // ============================================
  // FEED (Date idea content)
  // ============================================

  feedPosts: {
    async getPublished(options?: { category?: string; limit?: number; offset?: number }) {
      const client = getSupabase();
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      let query = client
        .from('feed_posts')
        .select('*')
        .eq('is_published', true)
        .or(`event_end_date.is.null,event_end_date.gte.${today}`)
        .order('priority', { ascending: false })
        .order('publish_date', { ascending: false });

      if (options?.category && options.category !== 'all') {
        query = query.eq('category', options.category);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options?.limit || 20) - 1);
      }

      const { data, error } = await query;
      return { data, error };
    },

    async getPersonalized(options: {
      userId: string;
      coupleId: string;
      category?: string;
      limit?: number;
      offset?: number;
    }) {
      const client = getSupabase();
      const { data, error } = await client.rpc('get_personalized_feed', {
        p_user_id: options.userId,
        p_couple_id: options.coupleId,
        p_category: options.category && options.category !== 'all' ? options.category : null,
        p_limit: options.limit || 20,
        p_offset: options.offset || 0,
      });
      return { data, error };
    },

    async getById(id: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('feed_posts')
        .select('*')
        .eq('id', id)
        .single();
      return { data, error };
    },

    async search(searchTerm: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('feed_posts')
        .select('*')
        .eq('is_published', true)
        .or(`title.ilike.%${searchTerm}%,caption.ilike.%${searchTerm}%`)
        .order('priority', { ascending: false })
        .limit(20);
      return { data, error };
    },
  },

  feedSaves: {
    async getByUser(userId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('feed_saves')
        .select('*, feed_posts(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      return { data, error };
    },

    async toggle(userId: string, feedPostId: string) {
      const client = getSupabase();
      // Check if already saved
      const { data: existing } = await client
        .from('feed_saves')
        .select('id')
        .eq('user_id', userId)
        .eq('feed_post_id', feedPostId)
        .maybeSingle();

      if (existing) {
        // Unsave
        const { error } = await client
          .from('feed_saves')
          .delete()
          .eq('id', existing.id);
        return { saved: false, error };
      } else {
        // Save
        const { error } = await client
          .from('feed_saves')
          .insert({ user_id: userId, feed_post_id: feedPostId });
        return { saved: true, error };
      }
    },

    async isSaved(userId: string, feedPostId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('feed_saves')
        .select('id')
        .eq('user_id', userId)
        .eq('feed_post_id', feedPostId)
        .maybeSingle();
      return { isSaved: !!data, error };
    },

    async getSavedPostIds(userId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('feed_saves')
        .select('feed_post_id')
        .eq('user_id', userId);
      return { data: data?.map(d => d.feed_post_id) || [], error };
    },
  },

  // Plans
  plans: {
    async add(planData: {
      couple_id: string;
      added_by: string;
      feed_post_id?: string;
      title: string;
      description?: string;
      image_url?: string;
      location_name?: string;
      latitude?: number;
      longitude?: number;
      event_date: string;
      ticket_open_date?: string;
      external_link?: string;
      affiliate_link?: string;
      price?: string;
      memo?: string;
    }) {
      const client = getSupabase();
      return client
        .from('plans')
        .insert(planData)
        .select()
        .single();
    },

    async update(planId: string, data: Record<string, unknown>) {
      const client = getSupabase();
      return client
        .from('plans')
        .update(data)
        .eq('id', planId);
    },

    async updateStatus(planId: string, status: string, extra?: Record<string, unknown>) {
      const client = getSupabase();
      return client
        .from('plans')
        .update({ status, ...extra })
        .eq('id', planId);
    },

    async getByCoupleId(coupleId: string) {
      const client = getSupabase();
      return client
        .from('plans')
        .select('*')
        .eq('couple_id', coupleId)
        .neq('status', 'cancelled')
        .order('event_date', { ascending: true });
    },

    async getForCalendar(coupleId: string, startDate: string, endDate: string) {
      const client = getSupabase();
      return client
        .from('plans')
        .select('id, title, image_url, event_date, status, location_name')
        .eq('couple_id', coupleId)
        .in('status', ['booked', 'completed'])
        .gte('event_date', startDate)
        .lte('event_date', endDate);
    },

    async getInterested(coupleId: string) {
      const client = getSupabase();
      const today = new Date().toISOString().split('T')[0];

      const [activeResult, expiredResult] = await Promise.all([
        client
          .from('plans')
          .select('*')
          .eq('couple_id', coupleId)
          .eq('status', 'interested')
          .gte('event_date', today)
          .order('event_date', { ascending: true }),
        client
          .from('plans')
          .select('*')
          .eq('couple_id', coupleId)
          .eq('status', 'interested')
          .lt('event_date', today)
          .order('event_date', { ascending: false })
          .limit(10),
      ]);

      return {
        active: activeResult.data || [],
        expired: expiredResult.data || [],
      };
    },

    async getBooked(coupleId: string) {
      const client = getSupabase();
      return client
        .from('plans')
        .select('*')
        .eq('couple_id', coupleId)
        .eq('status', 'booked')
        .order('event_date', { ascending: true });
    },

    async isAlreadyAdded(coupleId: string, feedPostId: string) {
      const client = getSupabase();
      const { data } = await client
        .from('plans')
        .select('id')
        .eq('couple_id', coupleId)
        .eq('feed_post_id', feedPostId)
        .neq('status', 'cancelled')
        .maybeSingle();
      return !!data;
    },

    async delete(planId: string) {
      const client = getSupabase();
      return client
        .from('plans')
        .delete()
        .eq('id', planId);
    },
  },

  // Plan Notifications
  planNotifications: {
    async createBatch(notifications: {
      plan_id: string;
      type: string;
      scheduled_at: string;
      include_affiliate_link?: boolean;
      message_title?: string;
      message_body?: string;
    }[]) {
      const client = getSupabase();
      return client
        .from('plan_notifications')
        .insert(notifications);
    },

    async cancelAllForPlan(planId: string) {
      const client = getSupabase();
      return client
        .from('plan_notifications')
        .update({ is_cancelled: true })
        .eq('plan_id', planId)
        .is('sent_at', null);
    },

    async cancelByTypes(planId: string, types: string[]) {
      const client = getSupabase();
      return client
        .from('plan_notifications')
        .update({ is_cancelled: true })
        .eq('plan_id', planId)
        .in('type', types)
        .is('sent_at', null);
    },

    async removeAffiliateLinks(planId: string) {
      const client = getSupabase();
      return client
        .from('plan_notifications')
        .update({ include_affiliate_link: false })
        .eq('plan_id', planId)
        .is('sent_at', null);
    },

    async restoreForPlan(planId: string) {
      const client = getSupabase();
      const now = new Date().toISOString();
      return client
        .from('plan_notifications')
        .update({ is_cancelled: false, include_affiliate_link: true })
        .eq('plan_id', planId)
        .is('sent_at', null)
        .gt('scheduled_at', now);
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

  // ============================================
  // COUPLE SYNC HELPERS (Real-time sync between paired users)
  // ============================================

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
        todo_enabled?: boolean;
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
      callback: (payload: { background_image_url: string | null; todo_enabled: boolean }) => void
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
            const record = payload.new as { background_image_url: string | null; todo_enabled: boolean };
            callback({ background_image_url: record.background_image_url, todo_enabled: record.todo_enabled });
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

  // Albums (Phase 2 — direct photo albums)
  albums: {
    async getAll(coupleId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('albums')
        .select('*')
        .eq('couple_id', coupleId)
        .order('created_at', { ascending: false });
      return { data, error };
    },

    async getById(albumId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('albums')
        .select('*')
        .eq('id', albumId)
        .single();
      return { data, error };
    },

    async create(
      coupleId: string,
      album: {
        title: string;
        cover_image_url?: string;
      }
    ) {
      const client = getSupabase();
      const { data, error } = await client
        .from('albums')
        .insert({
          couple_id: coupleId,
          ...album,
        })
        .select()
        .single();
      return { data, error };
    },

    async update(
      albumId: string,
      updates: {
        title?: string;
        cover_image_url?: string | null;
        total_spending?: number;
      }
    ) {
      const client = getSupabase();

      if (updates.cover_image_url !== undefined) {
        const { data: currentAlbum } = await client
          .from('albums')
          .select('cover_image_url')
          .eq('id', albumId)
          .single();

        const oldUrl = currentAlbum?.cover_image_url;
        const newUrl = updates.cover_image_url;

        if (oldUrl && oldUrl !== newUrl) {
          const oldPath = extractStoragePathFromUrl(oldUrl);
          await deleteFromStorage(oldPath);
        }
      }

      const { data, error } = await client
        .from('albums')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', albumId)
        .select()
        .single();
      return { data, error };
    },

    async delete(albumId: string) {
      const client = getSupabase();

      const { data: album } = await client
        .from('albums')
        .select('cover_image_url')
        .eq('id', albumId)
        .single();

      const coverUrl = album?.cover_image_url;
      const coverPath = coverUrl ? extractStoragePathFromUrl(coverUrl) : null;

      // Delete all photo files from storage
      const { data: photos } = await client
        .from('photos')
        .select('image_url')
        .eq('album_id', albumId);

      const { error } = await client
        .from('albums')
        .delete()
        .eq('id', albumId);

      if (!error) {
        // Cleanup storage files
        const paths: string[] = [];
        if (coverPath) paths.push(coverPath);
        if (photos) {
          for (const p of photos) {
            if (p.image_url) {
              const path = extractStoragePathFromUrl(p.image_url);
              if (path) paths.push(path);
            }
          }
        }
        if (paths.length > 0) {
          await client.storage.from('memories').remove(paths).catch(() => {});
        }
      }

      return { error };
    },

    subscribeToAlbums(
      coupleId: string,
      callback: (payload: { eventType: string; album: unknown }) => void
    ) {
      const client = getSupabase();
      const channel = client
        .channel(`albums:${coupleId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'albums',
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

  // Photos (direct photo storage in albums)
  photos: {
    async getByAlbum(albumId: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('photos')
        .select('*')
        .eq('album_id', albumId)
        .order('taken_at', { ascending: false, nullsFirst: false });
      return { data, error };
    },

    async getByCouple(coupleId: string, options?: { limit?: number; offset?: number }) {
      const client = getSupabase();
      let query = client
        .from('photos')
        .select('*')
        .eq('couple_id', coupleId)
        .order('taken_at', { ascending: false, nullsFirst: false });
      if (options?.limit) query = query.limit(options.limit);
      if (options?.offset) query = query.range(options.offset, options.offset + (options?.limit || 20) - 1);
      const { data, error } = await query;
      return { data, error };
    },

    async add(photo: {
      album_id: string;
      couple_id: string;
      uploaded_by: string;
      image_url: string;
      taken_at?: string | null;
      taken_location_name?: string | null;
      taken_latitude?: number | null;
      taken_longitude?: number | null;
    }) {
      const client = getSupabase();
      const { data, error } = await client
        .from('photos')
        .insert(photo)
        .select()
        .single();

      if (!error && data) {
        // Update album photo_count and cover
        try {
          await client.rpc('update_album_stats', { p_album_id: photo.album_id });
        } catch {
          // Fallback: manual update
          await client
            .from('albums')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', photo.album_id);
        }
        // Touch album for realtime sync
        await client
          .from('albums')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', photo.album_id);
      }

      return { data, error };
    },

    async addBatch(photos: {
      album_id: string;
      couple_id: string;
      uploaded_by: string;
      image_url: string;
      taken_at?: string | null;
      taken_location_name?: string | null;
      taken_latitude?: number | null;
      taken_longitude?: number | null;
    }[]) {
      const client = getSupabase();
      const { data, error } = await client
        .from('photos')
        .insert(photos)
        .select();

      if (!error && photos.length > 0) {
        const albumId = photos[0].album_id;
        // Update count
        const { count } = await client
          .from('photos')
          .select('*', { count: 'exact', head: true })
          .eq('album_id', albumId);
        await client
          .from('albums')
          .update({
            photo_count: count || 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', albumId);
      }

      return { data, error };
    },

    async updateMessage(photoId: string, message: string) {
      const client = getSupabase();
      const { data, error } = await client
        .from('photos')
        .update({ message, message_updated_at: new Date().toISOString() })
        .eq('id', photoId)
        .select()
        .single();
      return { data, error };
    },

    async updateSpending(photoId: string, spendingAmount: number) {
      const client = getSupabase();
      const { data, error } = await client
        .from('photos')
        .update({ spending_amount: spendingAmount })
        .eq('id', photoId)
        .select()
        .single();

      if (!error && data) {
        // Recalculate album total_spending
        const { data: albumPhotos } = await client
          .from('photos')
          .select('spending_amount')
          .eq('album_id', data.album_id);
        const total = (albumPhotos || []).reduce((sum: number, p: any) => sum + (p.spending_amount || 0), 0);
        await client
          .from('albums')
          .update({ total_spending: total })
          .eq('id', data.album_id);
      }

      return { data, error };
    },

    async updateRecord(photoId: string, record: { title?: string; location?: string; message?: string; spending?: number; messageSlot?: 'message' | 'message2'; userId?: string }) {
      const client = getSupabase();
      const updates: Record<string, any> = {};
      if (record.title !== undefined) updates.title = record.title;
      if (record.location !== undefined) updates.taken_location_name = record.location;
      if (record.message !== undefined) {
        const slot = record.messageSlot || 'message';
        if (slot === 'message2') {
          updates.message2 = record.message;
          updates.message2_by = record.userId || null;
          updates.message2_updated_at = new Date().toISOString();
        } else {
          updates.message = record.message;
          updates.message_by = record.userId || null;
          updates.message_updated_at = new Date().toISOString();
        }
      }
      if (record.spending !== undefined) updates.spending_amount = record.spending;

      const { data, error } = await client
        .from('photos')
        .update(updates)
        .eq('id', photoId)
        .select()
        .single();

      // Recalculate album total_spending if spending changed
      if (!error && data && record.spending !== undefined) {
        const { data: albumPhotos } = await client
          .from('photos')
          .select('spending_amount')
          .eq('album_id', data.album_id);
        const total = (albumPhotos || []).reduce((sum: number, p: any) => sum + (p.spending_amount || 0), 0);
        await client
          .from('albums')
          .update({ total_spending: total })
          .eq('id', data.album_id);
      }

      return { data, error };
    },

    async remove(photoId: string) {
      const client = getSupabase();

      // Get photo data first for cleanup
      const { data: photo } = await client
        .from('photos')
        .select('image_url, album_id')
        .eq('id', photoId)
        .single();

      const { error } = await client
        .from('photos')
        .delete()
        .eq('id', photoId);

      if (!error && photo) {
        // Delete from storage
        const path = extractStoragePathFromUrl(photo.image_url);
        if (path) {
          await client.storage.from('memories').remove([path]).catch(() => {});
        }
        // Update album stats
        const { count } = await client
          .from('photos')
          .select('*', { count: 'exact', head: true })
          .eq('album_id', photo.album_id);
        const { data: albumPhotos } = await client
          .from('photos')
          .select('spending_amount')
          .eq('album_id', photo.album_id);
        const totalSpending = (albumPhotos || []).reduce((sum: number, p: any) => sum + (p.spending_amount || 0), 0);
        await client
          .from('albums')
          .update({
            photo_count: count || 0,
            total_spending: totalSpending,
            updated_at: new Date().toISOString(),
          })
          .eq('id', photo.album_id);
      }

      return { error };
    },

    async removeBatch(photoIds: string[]) {
      const client = getSupabase();

      // Get photos for cleanup
      const { data: photos } = await client
        .from('photos')
        .select('id, image_url, album_id')
        .in('id', photoIds);

      const { error } = await client
        .from('photos')
        .delete()
        .in('id', photoIds);

      if (!error && photos && photos.length > 0) {
        const paths = photos.map(p => extractStoragePathFromUrl(p.image_url)).filter(Boolean);
        if (paths.length > 0) {
          await client.storage.from('memories').remove(paths as string[]).catch(() => {});
        }
        // Update album stats for affected albums
        const albumIds = [...new Set(photos.map(p => p.album_id))];
        for (const albumId of albumIds) {
          const { count } = await client
            .from('photos')
            .select('*', { count: 'exact', head: true })
            .eq('album_id', albumId);
          const { data: albumPhotos } = await client
            .from('photos')
            .select('spending_amount')
            .eq('album_id', albumId);
          const totalSpending = (albumPhotos || []).reduce((sum: number, p: any) => sum + (p.spending_amount || 0), 0);
          await client
            .from('albums')
            .update({
              photo_count: count || 0,
              total_spending: totalSpending,
              updated_at: new Date().toISOString(),
            })
            .eq('id', albumId);
        }
      }

      return { error };
    },

    subscribeToPhotos(
      coupleId: string,
      callback: (payload: { eventType: string; photo: unknown }) => void
    ) {
      const client = getSupabase();
      const channel = client
        .channel(`photos:${coupleId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'photos',
            filter: `couple_id=eq.${coupleId}`,
          },
          (payload) => {
            callback({
              eventType: payload.eventType,
              photo: payload.eventType === 'DELETE' ? payload.old : payload.new,
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
    async uploadBackground(coupleId: string, uri: string): Promise<string | null> {
      try {
        const client = getSupabase();

        // Resize image for faster upload (max 1080x1440 for 3:4 aspect ratio)
        // This dramatically reduces file size while maintaining good quality
        const manipulatedImage = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1080 } }], // Resize to 1080px width, height auto-calculated
          { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
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

    async uploadAlbumPhoto(coupleId: string, uri: string): Promise<string | null> {
      try {
        const client = getSupabase();

        // Resize to max 1500px width for good quality + reasonable file size
        const manipulatedImage = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1500 } }],
          { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );

        const file = new ExpoFile(manipulatedImage.uri);
        const base64 = await file.base64();

        const fileName = `album-photos/${coupleId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;

        const { data, error } = await client.storage
          .from('memories')
          .upload(fileName, decode(base64), {
            contentType: 'image/jpeg',
          });

        if (error) {
          console.error('Album photo upload error:', error);
          return null;
        }

        const { data: urlData } = client.storage
          .from('memories')
          .getPublicUrl(data.path);

        return urlData.publicUrl;
      } catch (error) {
        console.error('Album photo upload error:', error);
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

        // 1. Delete plan notifications (depends on plans)
        if (coupleId) {
          const { data: planIds } = await client
            .from('plans')
            .select('id')
            .eq('couple_id', coupleId);
          if (planIds && planIds.length > 0) {
            const ids = planIds.map(p => p.id);
            const { error: pnError } = await client
              .from('plan_notifications')
              .delete()
              .in('plan_id', ids);
            if (pnError) errors.push(`plan_notifications: ${pnError.message}`);
          }
        }

        // 2. Delete plans for the couple
        if (coupleId) {
          const { error: planError } = await client
            .from('plans')
            .delete()
            .eq('couple_id', coupleId);
          if (planError) errors.push(`plans: ${planError.message}`);
        }

        // 3. Delete feed saves for the user
        const { error: fsError } = await client
          .from('feed_saves')
          .delete()
          .eq('user_id', userId);
        if (fsError) errors.push(`feed_saves: ${fsError.message}`);

        // 4. Delete couple_todos for the couple
        if (coupleId) {
          const { error: todoError } = await client
            .from('couple_todos')
            .delete()
            .eq('couple_id', coupleId);
          if (todoError) errors.push(`couple_todos: ${todoError.message}`);
        }

        // 5. Delete anniversaries for the couple
        if (coupleId) {
          const { error: annError } = await client
            .from('anniversaries')
            .delete()
            .eq('couple_id', coupleId);
          if (annError) errors.push(`anniversaries: ${annError.message}`);
        }

        // 6. Delete menstrual_settings for the couple
        if (coupleId) {
          const { error: msError } = await client
            .from('menstrual_settings')
            .delete()
            .eq('couple_id', coupleId);
          if (msError) errors.push(`menstrual_settings: ${msError.message}`);
        }

        // 7. Delete couple_settings for the couple
        if (coupleId) {
          const { error: csError } = await client
            .from('couple_settings')
            .delete()
            .eq('couple_id', coupleId);
          if (csError) errors.push(`couple_settings: ${csError.message}`);
        }

        // 8. Delete albums and photos for the couple (cascade handles photos)
        if (coupleId) {
          // Photos are cascade-deleted when albums are deleted
          const { error: albumError } = await client
            .from('albums')
            .delete()
            .eq('couple_id', coupleId);
          if (albumError) errors.push(`albums: ${albumError.message}`);
        }

        // 9. Delete pairing codes created by this user
        const { error: pcError } = await client
          .from('pairing_codes')
          .delete()
          .eq('creator_id', userId);
        if (pcError) errors.push(`pairing_codes: ${pcError.message}`);

        // 10. Delete onboarding answers
        const { error: oaError } = await client
          .from('onboarding_answers')
          .delete()
          .eq('user_id', userId);
        if (oaError) errors.push(`onboarding_answers: ${oaError.message}`);

        // 11. Delete the couple record
        if (coupleId) {
          const { error: coupleError } = await client
            .from('couples')
            .delete()
            .eq('id', coupleId);
          if (coupleError) errors.push(`couples: ${coupleError.message}`);
        }

        // 12. Delete user profile
        const { error: profileError } = await client
          .from('profiles')
          .delete()
          .eq('id', userId);
        if (profileError) errors.push(`profiles: ${profileError.message}`);

        // 13. Delete from auth.users via Edge Function (AFTER all public data is deleted)
        // This must be done while session is still valid
        if (accessToken) {
          try {
            console.log('[Account Delete] Step 13: Deleting from auth.users (after public data cleanup)');
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

        // 14. Delete storage files (photos, backgrounds, etc.)
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

        // 15. Sign out from Supabase Auth
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