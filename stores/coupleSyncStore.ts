import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { db, isInTestMode, supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTimezoneStore, type TimezoneId } from './timezoneStore';
import { offlineQueue, OfflineOperationType } from '@/lib/offlineQueue';
import { getIsOnline } from '@/lib/useNetwork';

// Types
export interface SyncedTodo {
  id: string;
  couple_id: string;
  date: string;
  text: string;
  completed: boolean;
  created_by: string;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MenstrualSettings {
  id: string;
  couple_id: string;
  enabled: boolean;
  last_period_date: string | null;
  cycle_length: number;
  period_length: number;
  updated_by: string | null;
  updated_at: string;
}

// Extended sync types
export interface CoupleSettings {
  id: string;
  couple_id: string;
  background_image_url: string | null;
  todo_enabled: boolean;
  updated_by: string | null;
  updated_at: string;
}

export interface CoupleAlbum {
  id: string;
  couple_id: string;
  title: string;
  cover_image_url: string | null;
  photo_count: number;
  total_spending: number;
  created_at: string;
  updated_at: string;
}

export interface AlbumPhoto {
  id: string;
  album_id: string;
  couple_id: string;
  uploaded_by: string;
  image_url: string;
  title: string | null;
  taken_at: string | null;
  taken_location_name: string | null;
  taken_latitude: number | null;
  taken_longitude: number | null;
  message: string | null;
  message_by: string | null;
  message_updated_at: string | null;
  message2: string | null;
  message2_by: string | null;
  message2_updated_at: string | null;
  spending_amount: number | null;
  created_at: string;
}

interface CoupleSyncState {
  // Connection
  isInitialized: boolean;
  coupleId: string | null;
  userId: string | null;

  // Todo sync
  sharedTodos: SyncedTodo[];

  // Menstrual sync
  menstrualSettings: MenstrualSettings | null;

  // Extended sync - Background
  coupleSettings: CoupleSettings | null;
  backgroundImageUrl: string | null;

  // Extended sync - Albums
  coupleAlbums: CoupleAlbum[];
  albumPhotosMap: Record<string, AlbumPhoto[]>; // album_id -> photos
  allCouplePhotos: AlbumPhoto[];

  // Loading states
  isLoadingTodos: boolean;
  isLoadingMenstrual: boolean;
  isLoadingSettings: boolean;
  isLoadingAlbums: boolean;

  // Timezone mismatch detection
  hasTimezoneMismatch: boolean; // True if couple members have different device timezones and no shared timezone is set
  partnerDeviceTimezone: string | null; // Partner's device timezone for display

  // Heart liked state (for real-time sync)
  heartLikedBy: string | null; // User ID who liked the heart
}

interface CoupleSyncActions {
  // Initialization
  initializeSync: (coupleId: string, userId: string) => Promise<void>;
  cleanup: () => void;

  // Todo sync
  addTodo: (date: string, text: string) => Promise<SyncedTodo | null>;
  toggleTodo: (todoId: string, completed: boolean) => Promise<void>;
  updateTodo: (todoId: string, text: string) => Promise<void>;
  deleteTodo: (todoId: string) => Promise<void>;
  loadTodos: () => Promise<void>;
  getTodosByDate: (date: string) => SyncedTodo[];

  // Menstrual sync
  updateMenstrualSettings: (settings: Partial<MenstrualSettings>) => Promise<void>;
  loadMenstrualSettings: () => Promise<void>;

  // Extended sync - Background & Settings
  updateBackgroundImage: (imageUrl: string | null) => Promise<void>;
  updateTodoEnabled: (enabled: boolean) => Promise<void>;
  loadCoupleSettings: () => Promise<void>;
  setBackgroundImageUrl: (url: string | null) => void;

  // Extended sync - Albums
  loadAlbums: () => Promise<void>;
  addPhoto: (albumId: string, photoData: {
    image_url: string;
    taken_at?: string | null;
    taken_location_name?: string | null;
    taken_latitude?: number | null;
    taken_longitude?: number | null;
  }) => Promise<AlbumPhoto | null>;
  addPhotos: (albumId: string, photos: {
    image_url: string;
    taken_at?: string | null;
    taken_location_name?: string | null;
    taken_latitude?: number | null;
    taken_longitude?: number | null;
  }[]) => Promise<void>;
  removePhoto: (photoId: string) => Promise<void>;
  removePhotos: (photoIds: string[]) => Promise<void>;
  updatePhotoMessage: (photoId: string, message: string) => Promise<void>;
  updatePhotoSpending: (photoId: string, amount: number) => Promise<void>;
  updatePhotoRecord: (photoId: string, record: { title?: string; location?: string; message?: string; spending?: number; messageSlot?: 'message' | 'message2'; userId?: string }) => Promise<void>;
  loadAlbumPhotos: (albumId: string) => Promise<void>;
  getOrCreateDefaultAlbum: () => Promise<string | null>;
  loadAllPhotos: () => Promise<void>;

  // Offline sync
  processPendingOperations: () => Promise<void>;

  // Timezone mismatch detection
  updateDeviceTimezoneAndCheckMismatch: () => Promise<void>;
  dismissTimezoneMismatch: () => void;

  // Heart liked sync
  updateHeartLiked: (liked: boolean) => Promise<void>;
}

// Store channels for cleanup
let todoChannel: ReturnType<SupabaseClient['channel']> | null = null;
let menstrualChannel: ReturnType<SupabaseClient['channel']> | null = null;
// Extended sync channels
let settingsChannel: ReturnType<SupabaseClient['channel']> | null = null;
let albumsChannel: ReturnType<SupabaseClient['channel']> | null = null;
let albumPhotosChannel: ReturnType<SupabaseClient['channel']> | null = null;
let coupleUpdatesChannel: ReturnType<SupabaseClient['channel']> | null = null;

const initialState: CoupleSyncState = {
  isInitialized: false,
  coupleId: null,
  userId: null,
  sharedTodos: [],
  menstrualSettings: null,
  // Extended sync
  coupleSettings: null,
  backgroundImageUrl: null,
  coupleAlbums: [],
  albumPhotosMap: {},
  allCouplePhotos: [],
  // Loading states
  isLoadingTodos: false,
  isLoadingMenstrual: false,
  isLoadingSettings: false,
  isLoadingAlbums: false,

  // Timezone mismatch detection
  hasTimezoneMismatch: false,
  partnerDeviceTimezone: null,

  // Heart liked state
  heartLikedBy: null,
};

export const useCoupleSyncStore = create<CoupleSyncState & CoupleSyncActions>()(
  persist(
    (set, get) => ({
  ...initialState,

  // ============================================
  // INITIALIZATION
  // ============================================

  initializeSync: async (coupleId: string, userId: string) => {
    if (isInTestMode() || !supabase) {
      set({ isInitialized: true, coupleId, userId });
      return;
    }

    set({ coupleId, userId });

    // Load couple data and sync timezone FIRST (before loading other data)
    // This ensures timezone is set correctly for all subsequent date operations
    const { data: coupleData } = await db.couples.get(coupleId);
    if (coupleData?.timezone) {
      // MIGRATION: Convert legacy 'auto' timezone to actual device timezone
      if (coupleData.timezone === 'auto') {
        console.log('[CoupleSyncStore] Migrating legacy "auto" timezone to device timezone');
        const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        console.log('[CoupleSyncStore] Device timezone:', deviceTimezone);

        // Update couple table with actual timezone
        await db.couples.updateTimezone(coupleId, deviceTimezone as TimezoneId);

        // Sync to local store
        useTimezoneStore.getState().syncFromCouple(deviceTimezone);
      } else {
        console.log('[CoupleSyncStore] Syncing couple timezone on initialization:', coupleData.timezone);
        useTimezoneStore.getState().syncFromCouple(coupleData.timezone);
      }
    }

    // Load initial data
    await Promise.all([
      get().loadTodos(),
      get().loadMenstrualSettings(),
      // Extended sync
      get().loadCoupleSettings(),
      get().loadAlbums(),
    ]);

    // Update device timezone and check for mismatch
    get().updateDeviceTimezoneAndCheckMismatch();

    // Setup real-time subscriptions

    // 1. Todo subscription
    todoChannel = db.coupleTodos.subscribeToTodos(coupleId, (payload) => {
      const todo = payload.todo as SyncedTodo;

      if (payload.eventType === 'INSERT') {
        set((state) => {
          // Check if todo already exists (prevent duplicate from realtime + direct add)
          if (state.sharedTodos.some(t => t.id === todo.id)) {
            return state;
          }
          return {
            sharedTodos: [...state.sharedTodos, todo].sort(
              (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
            ),
          };
        });
      } else if (payload.eventType === 'UPDATE') {
        set((state) => ({
          sharedTodos: state.sharedTodos.map((t) => (t.id === todo.id ? todo : t)),
        }));
      } else if (payload.eventType === 'DELETE') {
        // For DELETE, payload.old might only contain id if REPLICA IDENTITY is not FULL
        const todoId = todo?.id;
        if (todoId) {
          set((state) => ({
            sharedTodos: state.sharedTodos.filter((t) => t.id !== todoId),
          }));
        }
      }
    });

    // 2. Menstrual settings subscription
    menstrualChannel = db.menstrualSettings.subscribeToSettings(coupleId, (payload) => {
      set({ menstrualSettings: payload as MenstrualSettings });
    });

    // ============================================
    // EXTENDED SYNC SUBSCRIPTIONS
    // ============================================

    // 3. Couple settings subscription (background image, todo_enabled)
    settingsChannel = db.coupleSettings.subscribeToSettings(coupleId, (payload) => {
      set({
        backgroundImageUrl: payload.background_image_url,
        coupleSettings: {
          ...get().coupleSettings,
          background_image_url: payload.background_image_url,
          todo_enabled: payload.todo_enabled ?? true,
        } as CoupleSettings,
      });
    });

    // 4. Albums subscription
    albumsChannel = db.albums.subscribeToAlbums(coupleId, async (payload) => {
      const album = payload.album as CoupleAlbum;

      if (payload.eventType === 'INSERT') {
        const { coupleAlbums } = get();
        const albumExists = coupleAlbums.some(a => a.id === album.id);

        if (!albumExists) {
          set((state) => ({
            coupleAlbums: [album, ...state.coupleAlbums],
          }));
          const { data: photosData } = await db.photos.getByAlbum(album.id);
          if (photosData) {
            set((state) => ({
              albumPhotosMap: {
                ...state.albumPhotosMap,
                [album.id]: photosData as AlbumPhoto[],
              },
            }));
          }
        }
      } else if (payload.eventType === 'UPDATE') {
        set((state) => ({
          coupleAlbums: state.coupleAlbums.map((a) => (a.id === album.id ? album : a)),
        }));
        // Reload photos when album is touched (photo add/remove triggers album update)
        const { data: photosData } = await db.photos.getByAlbum(album.id);
        if (photosData) {
          set((state) => ({
            albumPhotosMap: {
              ...state.albumPhotosMap,
              [album.id]: photosData as AlbumPhoto[],
            },
          }));
        }
      } else if (payload.eventType === 'DELETE') {
        set((state) => ({
          coupleAlbums: state.coupleAlbums.filter((a) => a.id !== album.id),
        }));
      }
    });

    // 5. Photos subscription
    const processedPhotoEvents = new Set<string>();

    albumPhotosChannel = db.photos.subscribeToPhotos(coupleId, async (payload) => {
      const photo = payload.photo as AlbumPhoto;
      const { coupleAlbums, albumPhotosMap } = get();

      const eventKey = `${payload.eventType}-${photo.id}`;
      if (processedPhotoEvents.has(eventKey)) return;
      processedPhotoEvents.add(eventKey);
      setTimeout(() => processedPhotoEvents.delete(eventKey), 5000);

      if (payload.eventType === 'DELETE') {
        const targetAlbumId = photo.album_id;
        if (!targetAlbumId) return;

        const albumBelongsToCouple = coupleAlbums.some(a => a.id === targetAlbumId);
        if (!albumBelongsToCouple) return;

        set((state) => ({
          albumPhotosMap: {
            ...state.albumPhotosMap,
            [targetAlbumId]: (state.albumPhotosMap[targetAlbumId] || []).filter(
              (p) => p.id !== photo.id
            ),
          },
          allCouplePhotos: state.allCouplePhotos.filter((p) => p.id !== photo.id),
        }));
        return;
      }

      if (payload.eventType === 'INSERT') {
        let albumBelongsToCouple = coupleAlbums.some(a => a.id === photo.album_id);

        if (!albumBelongsToCouple && photo.album_id) {
          const { data: fetchedAlbum } = await db.albums.getById(photo.album_id);
          if (fetchedAlbum && (fetchedAlbum as CoupleAlbum).couple_id === coupleId) {
            set((state) => ({
              coupleAlbums: [fetchedAlbum as CoupleAlbum, ...state.coupleAlbums.filter(a => a.id !== (fetchedAlbum as CoupleAlbum).id)],
            }));
            albumBelongsToCouple = true;
          }
        }

        if (!albumBelongsToCouple) return;

        const existingPhotos = get().albumPhotosMap[photo.album_id] || [];
        const alreadyExists = existingPhotos.some(p =>
          p.id === photo.id || (p.image_url === photo.image_url && p.id.startsWith('temp-'))
        );

        if (alreadyExists) {
          set((state) => ({
            albumPhotosMap: {
              ...state.albumPhotosMap,
              [photo.album_id]: state.albumPhotosMap[photo.album_id]?.map(p =>
                (p.image_url === photo.image_url && p.id.startsWith('temp-')) ? photo : p
              ) || [photo],
            },
            allCouplePhotos: state.allCouplePhotos.map(p =>
              (p.image_url === photo.image_url && p.id.startsWith('temp-')) ? photo : p
            ),
          }));
        } else {
          set((state) => ({
            albumPhotosMap: {
              ...state.albumPhotosMap,
              [photo.album_id]: [photo, ...(state.albumPhotosMap[photo.album_id] || [])],
            },
            allCouplePhotos: [photo, ...state.allCouplePhotos],
          }));
        }
      }

      if (payload.eventType === 'UPDATE') {
        const targetAlbumId = photo.album_id;
        if (!targetAlbumId) return;
        set((state) => ({
          albumPhotosMap: {
            ...state.albumPhotosMap,
            [targetAlbumId]: (state.albumPhotosMap[targetAlbumId] || []).map(
              (p) => p.id === photo.id ? photo : p
            ),
          },
          allCouplePhotos: state.allCouplePhotos.map(
            (p) => p.id === photo.id ? photo : p
          ),
        }));
      }
    });

    // 6. Couple updates subscription (for timezone sync, disconnection detection, and heart liked sync)
    coupleUpdatesChannel = db.couples.subscribeToCoupleUpdates(coupleId, (payload) => {
      console.log('[CoupleSyncStore] Received couple update - status:', payload.status, 'timezone:', payload.timezone, 'heart_liked_by:', payload.heart_liked_by);

      // Check if couple was disconnected (partner deleted account or unpaired)
      if (payload.status === 'disconnected') {
        // IMPORTANT: DO NOT modify authStore (couple, partner, isOnboardingComplete) here!
        // The _layout.tsx realtime handler will:
        // 1. Show the Alert to the user
        // 2. On confirm, clear couple/partner and set isOnboardingComplete to false
        // If we modify authStore here, it causes a race condition where _layout.tsx
        // subscription gets cleaned up before it can show the Alert
        console.log('[CoupleSyncStore] Couple disconnected - letting _layout.tsx handle navigation');

        // Only clear profile couple_id in DB (doesn't affect local state)
        const currentUserId = get().userId;
        if (currentUserId) {
          console.log('[CoupleSyncStore] Clearing profile couple_id for user:', currentUserId);
          db.profiles.update(currentUserId, { couple_id: null }).catch((err) => {
            console.error('[CoupleSyncStore] Failed to clear profile couple_id:', err);
          });
        }

        // DO NOT call get().cleanup() here - it would remove subscriptions before
        // _layout.tsx can show the Alert. The cleanup will be called by _layout.tsx
        // in handleDisconnectConfirm after user confirms the Alert.
        return;
      }

      // Sync timezone to timezoneStore when partner changes it
      useTimezoneStore.getState().syncFromCouple(payload.timezone);

      // Sync heart liked state
      set({ heartLikedBy: payload.heart_liked_by });
    });

    set({ isInitialized: true });
  },

  cleanup: () => {
    // Unsubscribe from all channels
    if (todoChannel) {
      db.coupleTodos.unsubscribe(todoChannel);
      todoChannel = null;
    }
    if (menstrualChannel) {
      db.menstrualSettings.unsubscribe(menstrualChannel);
      menstrualChannel = null;
    }
    // Extended sync cleanup
    if (settingsChannel) {
      db.coupleSettings.unsubscribe(settingsChannel);
      settingsChannel = null;
    }
    if (albumsChannel) {
      db.albums.unsubscribe(albumsChannel);
      albumsChannel = null;
    }
    if (albumPhotosChannel) {
      db.photos.unsubscribe(albumPhotosChannel);
      albumPhotosChannel = null;
    }
    if (coupleUpdatesChannel) {
      db.couples.unsubscribeFromCoupleUpdates(coupleUpdatesChannel);
      coupleUpdatesChannel = null;
    }

    set(initialState);
  },

  // ============================================
  // TODO SYNC
  // ============================================

  addTodo: async (date: string, text: string) => {
    const { coupleId, userId, sharedTodos } = get();

    // Create local todo first (optimistic update)
    // Use timestamp + random string to ensure unique ID even with rapid clicks
    const newTodo: SyncedTodo = {
      id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      couple_id: coupleId || 'demo',
      date,
      text,
      completed: false,
      created_by: userId || 'demo',
      completed_by: null,
      completed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Always add to local state first
    set({
      sharedTodos: [...sharedTodos, newTodo].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
    });

    if (!coupleId || !userId || isInTestMode()) {
      // Demo mode: local only
      return newTodo;
    }

    // Check if online
    const isOnline = getIsOnline();
    if (!isOnline) {
      // Offline: Queue for later sync
      console.log('[CoupleSyncStore] Offline - queueing todo for later sync');
      await offlineQueue.add('ADD_TODO', { date, text, localId: newTodo.id, coupleId, userId });
      return newTodo;
    }

    // Online: Try to sync to server
    try {
      const { data, error } = await db.coupleTodos.create(coupleId, date, text, userId);
      if (!error && data) {
        // Replace local todo with server todo
        const serverTodo = data as SyncedTodo;
        set({
          sharedTodos: get().sharedTodos.map(t =>
            t.id === newTodo.id ? serverTodo : t
          ),
        });
        return serverTodo;
      } else {
        // Server error - queue for later
        console.log('[CoupleSyncStore] Server error - queueing todo for later sync');
        await offlineQueue.add('ADD_TODO', { date, text, localId: newTodo.id, coupleId, userId });
        return newTodo;
      }
    } catch (error) {
      // Network error - queue for later
      console.log('[CoupleSyncStore] Network error - queueing todo for later sync');
      await offlineQueue.add('ADD_TODO', { date, text, localId: newTodo.id, coupleId, userId });
      return newTodo;
    }
  },

  toggleTodo: async (todoId: string, completed: boolean) => {
    const { userId, sharedTodos, coupleId } = get();

    // Optimistic update: update locally first
    set({
      sharedTodos: sharedTodos.map((t) =>
        t.id === todoId
          ? {
              ...t,
              completed,
              completed_by: completed ? (userId || 'demo') : null,
              completed_at: completed ? new Date().toISOString() : null,
            }
          : t
      ),
    });

    if (isInTestMode()) {
      return;
    }

    // Check if online
    const isOnline = getIsOnline();
    if (!isOnline) {
      console.log('[CoupleSyncStore] Offline - queueing toggle for later sync');
      await offlineQueue.add('TOGGLE_TODO', { todoId, completed, userId, coupleId });
      return;
    }

    try {
      await db.coupleTodos.toggleComplete(todoId, completed, userId || '');
    } catch (error) {
      console.log('[CoupleSyncStore] Network error - queueing toggle for later sync');
      await offlineQueue.add('TOGGLE_TODO', { todoId, completed, userId, coupleId });
    }
  },

  deleteTodo: async (todoId: string) => {
    const { sharedTodos, coupleId, userId } = get();

    // Optimistic delete - update local state immediately
    set({
      sharedTodos: sharedTodos.filter((t) => t.id !== todoId),
    });

    if (isInTestMode()) {
      return;
    }

    // Check if online
    const isOnline = getIsOnline();
    if (!isOnline) {
      console.log('[CoupleSyncStore] Offline - queueing delete for later sync');
      await offlineQueue.add('DELETE_TODO', { todoId, coupleId, userId });
      return;
    }

    try {
      await db.coupleTodos.delete(todoId);
    } catch (error) {
      console.log('[CoupleSyncStore] Network error - queueing delete for later sync');
      await offlineQueue.add('DELETE_TODO', { todoId, coupleId, userId });
    }
  },

  updateTodo: async (todoId: string, text: string) => {
    const { sharedTodos, coupleId, userId } = get();

    // Optimistic update - update local state immediately
    set({
      sharedTodos: sharedTodos.map((t) =>
        t.id === todoId ? { ...t, text } : t
      ),
    });

    if (isInTestMode()) {
      return;
    }

    // Check if online
    const isOnline = getIsOnline();
    if (!isOnline) {
      console.log('[CoupleSyncStore] Offline - queueing update for later sync');
      await offlineQueue.add('UPDATE_TODO', { todoId, text, coupleId, userId });
      return;
    }

    try {
      await db.coupleTodos.updateText(todoId, text);
    } catch (error) {
      console.log('[CoupleSyncStore] Network error - queueing update for later sync');
      await offlineQueue.add('UPDATE_TODO', { todoId, text, coupleId, userId });
    }
  },

  loadTodos: async () => {
    const { coupleId } = get();
    if (!coupleId || isInTestMode()) return;

    set({ isLoadingTodos: true });
    const { data, error } = await db.coupleTodos.getAll(coupleId);
    set({ isLoadingTodos: false });

    if (!error && data) {
      set({ sharedTodos: data as SyncedTodo[] });
    }
  },

  getTodosByDate: (date: string) => {
    return get().sharedTodos.filter((todo) => todo.date === date);
  },

  // ============================================
  // MENSTRUAL SYNC
  // ============================================

  updateMenstrualSettings: async (settings: Partial<MenstrualSettings>) => {
    const { coupleId, userId, menstrualSettings } = get();

    if (!coupleId || !userId || isInTestMode()) {
      // Demo mode: update locally
      const updated = {
        id: menstrualSettings?.id || `local-${Date.now()}`,
        couple_id: coupleId || 'demo',
        enabled: settings.enabled ?? menstrualSettings?.enabled ?? false,
        last_period_date: settings.last_period_date ?? menstrualSettings?.last_period_date ?? null,
        cycle_length: settings.cycle_length ?? menstrualSettings?.cycle_length ?? 28,
        period_length: settings.period_length ?? menstrualSettings?.period_length ?? 5,
        updated_by: userId || 'demo',
        updated_at: new Date().toISOString(),
      } as MenstrualSettings;
      set({ menstrualSettings: updated });
      return;
    }

    await db.menstrualSettings.upsert(
      coupleId,
      {
        enabled: settings.enabled ?? menstrualSettings?.enabled ?? false,
        last_period_date: settings.last_period_date ?? menstrualSettings?.last_period_date ?? undefined,
        cycle_length: settings.cycle_length ?? menstrualSettings?.cycle_length ?? 28,
        period_length: settings.period_length ?? menstrualSettings?.period_length ?? 5,
      },
      userId
    );
  },

  loadMenstrualSettings: async () => {
    const { coupleId } = get();
    if (!coupleId || isInTestMode()) return;

    set({ isLoadingMenstrual: true });
    const { data, error } = await db.menstrualSettings.get(coupleId);
    set({ isLoadingMenstrual: false });

    if (!error && data) {
      set({ menstrualSettings: data as MenstrualSettings });
    }
  },

  // ============================================
  // EXTENDED SYNC - BACKGROUND
  // ============================================

  updateBackgroundImage: async (imageUrl: string | null) => {
    const { coupleId, userId } = get();

    if (!coupleId || !userId || isInTestMode()) {
      // Demo mode: update locally only
      set({ backgroundImageUrl: imageUrl });
      return;
    }

    const { error } = await db.coupleSettings.upsert(coupleId, { background_image_url: imageUrl }, userId);
    if (!error) {
      set({ backgroundImageUrl: imageUrl });
    }
  },

  updateTodoEnabled: async (enabled: boolean) => {
    const { coupleId, userId, coupleSettings } = get();

    if (!coupleId || !userId || isInTestMode()) {
      set({ coupleSettings: { ...coupleSettings, todo_enabled: enabled } as CoupleSettings });
      return;
    }

    const { error } = await db.coupleSettings.upsert(coupleId, { todo_enabled: enabled }, userId);
    if (!error) {
      set({ coupleSettings: { ...coupleSettings, todo_enabled: enabled } as CoupleSettings });
    }
  },

  loadCoupleSettings: async () => {
    const { coupleId } = get();
    if (!coupleId || isInTestMode()) return;

    set({ isLoadingSettings: true });
    const { data, error } = await db.coupleSettings.get(coupleId);
    set({ isLoadingSettings: false });

    if (!error && data) {
      set({
        coupleSettings: data as CoupleSettings,
        backgroundImageUrl: data.background_image_url,
      });
    }
  },

  setBackgroundImageUrl: (url: string | null) => {
    set({ backgroundImageUrl: url });
  },

  // ============================================
  // EXTENDED SYNC - ALBUMS
  // ============================================

  loadAlbums: async () => {
    const { coupleId } = get();
    if (!coupleId || isInTestMode()) return;

    set({ isLoadingAlbums: true });
    const { data, error } = await db.albums.getAll(coupleId);
    set({ isLoadingAlbums: false });

    if (!error && data) {
      const albums = data as CoupleAlbum[];
      set({ coupleAlbums: albums });

      const photosMap: { [albumId: string]: AlbumPhoto[] } = {};
      await Promise.all(
        albums.map(async (album) => {
          const { data: photosData } = await db.photos.getByAlbum(album.id);
          if (photosData) {
            photosMap[album.id] = photosData as AlbumPhoto[];
          }
        })
      );
      set((state) => ({
        albumPhotosMap: { ...state.albumPhotosMap, ...photosMap },
      }));
    }
  },

  getOrCreateDefaultAlbum: async () => {
    const { coupleId, userId, coupleAlbums } = get();
    if (!coupleId || !userId) return null;

    const existing = coupleAlbums.find((a) => a.title === '__default__');
    if (existing) return existing.id;

    const { data, error } = await db.albums.create(coupleId, { title: '__default__' });
    if (!error && data) {
      const album = data as CoupleAlbum;
      set((state) => ({ coupleAlbums: [album, ...state.coupleAlbums] }));
      return album.id;
    }
    return null;
  },

  loadAllPhotos: async () => {
    const { coupleId } = get();
    if (!coupleId || isInTestMode()) return;
    const { data, error } = await db.photos.getByCouple(coupleId);
    if (!error && data) {
      set({ allCouplePhotos: data as AlbumPhoto[] });
    }
  },

  addPhoto: async (albumId: string, photoData: {
    image_url: string;
    taken_at?: string | null;
    taken_location_name?: string | null;
    taken_latitude?: number | null;
    taken_longitude?: number | null;
  }) => {
    const { userId, coupleId, albumPhotosMap } = get();
    if (!userId || !coupleId) return null;

    if (isInTestMode()) {
      const newPhoto: AlbumPhoto = {
        id: `local-${Date.now()}`,
        album_id: albumId,
        couple_id: coupleId,
        uploaded_by: userId,
        image_url: photoData.image_url,
        taken_at: photoData.taken_at || null,
        taken_location_name: photoData.taken_location_name || null,
        taken_latitude: photoData.taken_latitude || null,
        taken_longitude: photoData.taken_longitude || null,
        message: null,
        message_by: null,
        message_updated_at: null,
        message2: null,
        message2_by: null,
        message2_updated_at: null,
        spending_amount: null,
        title: null,
        created_at: new Date().toISOString(),
      };
      set((state) => ({
        albumPhotosMap: {
          ...state.albumPhotosMap,
          [albumId]: [newPhoto, ...(state.albumPhotosMap[albumId] || [])],
        },
      }));
      return newPhoto;
    }

    // Optimistic update
    const optimisticPhoto: AlbumPhoto = {
      id: `temp-${Date.now()}`,
      album_id: albumId,
      couple_id: coupleId,
      uploaded_by: userId,
      image_url: photoData.image_url,
      taken_at: photoData.taken_at || null,
      taken_location_name: photoData.taken_location_name || null,
      taken_latitude: photoData.taken_latitude || null,
      taken_longitude: photoData.taken_longitude || null,
      message: null,
      message_by: null,
      message_updated_at: null,
      message2: null,
      message2_by: null,
      message2_updated_at: null,
      spending_amount: null,
      title: null,
      created_at: new Date().toISOString(),
    };
    set((state) => ({
      albumPhotosMap: {
        ...state.albumPhotosMap,
        [albumId]: [optimisticPhoto, ...(state.albumPhotosMap[albumId] || [])],
      },
    }));

    const { data, error } = await db.photos.add({
      album_id: albumId,
      couple_id: coupleId,
      uploaded_by: userId,
      image_url: photoData.image_url,
      taken_at: photoData.taken_at,
      taken_location_name: photoData.taken_location_name,
      taken_latitude: photoData.taken_latitude,
      taken_longitude: photoData.taken_longitude,
    });

    if (error) {
      // Rollback
      set((state) => ({
        albumPhotosMap: {
          ...state.albumPhotosMap,
          [albumId]: (state.albumPhotosMap[albumId] || []).filter(p => p.id !== optimisticPhoto.id),
        },
      }));
      return null;
    }

    if (data) {
      set((state) => ({
        albumPhotosMap: {
          ...state.albumPhotosMap,
          [albumId]: (state.albumPhotosMap[albumId] || []).map(p =>
            p.id === optimisticPhoto.id ? (data as AlbumPhoto) : p
          ),
        },
      }));
      return data as AlbumPhoto;
    }
    return null;
  },

  addPhotos: async (albumId: string, photos: {
    image_url: string;
    taken_at?: string | null;
    taken_location_name?: string | null;
    taken_latitude?: number | null;
    taken_longitude?: number | null;
  }[]) => {
    const { userId, coupleId } = get();
    if (!userId || !coupleId || isInTestMode() || photos.length === 0) return;

    const now = Date.now();
    const optimisticPhotos: AlbumPhoto[] = photos.map((p, i) => ({
      id: `temp-${now}-${i}`,
      album_id: albumId,
      couple_id: coupleId,
      uploaded_by: userId,
      image_url: p.image_url,
      taken_at: p.taken_at || null,
      taken_location_name: p.taken_location_name || null,
      taken_latitude: p.taken_latitude || null,
      taken_longitude: p.taken_longitude || null,
      message: null,
      message_by: null,
      message_updated_at: null,
      message2: null,
      message2_by: null,
      message2_updated_at: null,
      spending_amount: null,
      title: null,
      created_at: new Date().toISOString(),
    }));

    set((state) => ({
      albumPhotosMap: {
        ...state.albumPhotosMap,
        [albumId]: [...optimisticPhotos, ...(state.albumPhotosMap[albumId] || [])],
      },
    }));

    const { data, error } = await db.photos.addBatch(
      photos.map(p => ({
        album_id: albumId,
        couple_id: coupleId,
        uploaded_by: userId,
        image_url: p.image_url,
        taken_at: p.taken_at,
        taken_location_name: p.taken_location_name,
        taken_latitude: p.taken_latitude,
        taken_longitude: p.taken_longitude,
      }))
    );

    if (error) {
      const tempIds = new Set(optimisticPhotos.map(p => p.id));
      set((state) => ({
        albumPhotosMap: {
          ...state.albumPhotosMap,
          [albumId]: (state.albumPhotosMap[albumId] || []).filter(p => !tempIds.has(p.id)),
        },
      }));
      return;
    }

    if (data && Array.isArray(data)) {
      set((state) => ({
        albumPhotosMap: {
          ...state.albumPhotosMap,
          [albumId]: (state.albumPhotosMap[albumId] || []).map(p => {
            if (p.id.startsWith('temp-')) {
              const realPhoto = (data as AlbumPhoto[]).find(d => d.image_url === p.image_url);
              return realPhoto || p;
            }
            return p;
          }),
        },
      }));
    }
  },

  removePhoto: async (photoId: string) => {
    const { albumPhotosMap } = get();

    // Find which album contains this photo
    let targetAlbumId: string | null = null;
    let photoToRemove: AlbumPhoto | null = null;
    for (const [albumId, photos] of Object.entries(albumPhotosMap)) {
      const found = photos.find(p => p.id === photoId);
      if (found) {
        targetAlbumId = albumId;
        photoToRemove = found;
        break;
      }
    }

    if (!targetAlbumId || !photoToRemove) return;

    // Optimistic removal
    const existingPhotos = albumPhotosMap[targetAlbumId] || [];
    set((state) => ({
      albumPhotosMap: {
        ...state.albumPhotosMap,
        [targetAlbumId!]: (state.albumPhotosMap[targetAlbumId!] || []).filter(p => p.id !== photoId),
      },
    }));

    if (isInTestMode()) return;

    const { error } = await db.photos.remove(photoId);
    if (error) {
      // Rollback
      set((state) => ({
        albumPhotosMap: {
          ...state.albumPhotosMap,
          [targetAlbumId!]: existingPhotos,
        },
      }));
    }
  },

  removePhotos: async (photoIds: string[]) => {
    if (isInTestMode() || photoIds.length === 0) return;

    const { albumPhotosMap } = get();
    const photoIdSet = new Set(photoIds);

    // Track affected albums for rollback
    const affectedAlbums: Record<string, AlbumPhoto[]> = {};
    for (const [albumId, photos] of Object.entries(albumPhotosMap)) {
      const hasAffectedPhotos = photos.some(p => photoIdSet.has(p.id));
      if (hasAffectedPhotos) {
        affectedAlbums[albumId] = photos;
      }
    }

    // Optimistic removal
    set((state) => {
      const newMap = { ...state.albumPhotosMap };
      for (const albumId of Object.keys(affectedAlbums)) {
        newMap[albumId] = (newMap[albumId] || []).filter(p => !photoIdSet.has(p.id));
      }
      return { albumPhotosMap: newMap };
    });

    const { error } = await db.photos.removeBatch(photoIds);
    if (error) {
      // Rollback
      set((state) => ({
        albumPhotosMap: { ...state.albumPhotosMap, ...affectedAlbums },
      }));
    }
  },

  updatePhotoMessage: async (photoId: string, message: string) => {
    const { albumPhotosMap } = get();

    // Optimistic update
    set((state) => {
      const newMap = { ...state.albumPhotosMap };
      for (const albumId of Object.keys(newMap)) {
        newMap[albumId] = newMap[albumId].map(p =>
          p.id === photoId ? { ...p, message, message_updated_at: new Date().toISOString() } : p
        );
      }
      return { albumPhotosMap: newMap };
    });

    if (isInTestMode()) return;

    const { error } = await db.photos.updateMessage(photoId, message);
    if (error) {
      // Rollback
      set({ albumPhotosMap });
    }
  },

  updatePhotoSpending: async (photoId: string, amount: number) => {
    const { albumPhotosMap } = get();

    // Optimistic update
    set((state) => {
      const newMap = { ...state.albumPhotosMap };
      for (const albumId of Object.keys(newMap)) {
        newMap[albumId] = newMap[albumId].map(p =>
          p.id === photoId ? { ...p, spending_amount: amount } : p
        );
      }
      return { albumPhotosMap: newMap };
    });

    if (isInTestMode()) return;

    const { error } = await db.photos.updateSpending(photoId, amount);
    if (error) {
      // Rollback
      set({ albumPhotosMap });
    }
  },

  updatePhotoRecord: async (photoId: string, record: { title?: string; location?: string; message?: string; spending?: number; messageSlot?: 'message' | 'message2'; userId?: string }) => {
    const { albumPhotosMap } = get();
    const now = new Date().toISOString();

    // Optimistic update - update both albumPhotosMap and allCouplePhotos
    const applyUpdate = (p: AlbumPhoto) => {
      if (p.id !== photoId) return p;
      const updated = { ...p };
      if (record.title !== undefined) updated.title = record.title;
      if (record.location !== undefined) updated.taken_location_name = record.location;
      if (record.message !== undefined) {
        const slot = record.messageSlot || 'message';
        if (slot === 'message2') {
          updated.message2 = record.message;
          updated.message2_by = record.userId || null;
          updated.message2_updated_at = now;
        } else {
          updated.message = record.message;
          updated.message_by = record.userId || null;
          updated.message_updated_at = now;
        }
      }
      if (record.spending !== undefined) updated.spending_amount = record.spending;
      return updated;
    };

    set((state) => {
      const newMap = { ...state.albumPhotosMap };
      for (const albumId of Object.keys(newMap)) {
        newMap[albumId] = newMap[albumId].map(applyUpdate);
      }
      return {
        albumPhotosMap: newMap,
        allCouplePhotos: state.allCouplePhotos.map(applyUpdate),
      };
    });

    if (isInTestMode()) return;

    const { error } = await db.photos.updateRecord(photoId, record);
    if (error) {
      set({ albumPhotosMap });
    }
  },

  loadAlbumPhotos: async (albumId: string) => {
    if (isInTestMode()) return;

    const { data, error } = await db.photos.getByAlbum(albumId);
    if (!error && data) {
      set((state) => ({
        albumPhotosMap: {
          ...state.albumPhotosMap,
          [albumId]: data as AlbumPhoto[],
        },
      }));
    }
  },

  // ============================================
  // OFFLINE SYNC PROCESSING
  // ============================================

  processPendingOperations: async () => {
    const queue = offlineQueue.getQueue();
    if (queue.length === 0) {
      console.log('[CoupleSyncStore] No pending operations to process');
      return;
    }

    console.log('[CoupleSyncStore] Processing', queue.length, 'pending operations');
    offlineQueue.setProcessing(true);

    for (const operation of queue) {
      try {
        const { type, payload } = operation;
        let success = false;

        switch (type) {
          case 'ADD_TODO': {
            const { date, text, localId, coupleId, userId } = payload as {
              date: string;
              text: string;
              localId: string;
              coupleId: string;
              userId: string;
            };
            const { data, error } = await db.coupleTodos.create(coupleId, date, text, userId);
            if (!error && data) {
              // Replace local todo with server todo
              const serverTodo = data as SyncedTodo;
              set({
                sharedTodos: get().sharedTodos.map(t =>
                  t.id === localId ? serverTodo : t
                ),
              });
              success = true;
            }
            break;
          }
          case 'TOGGLE_TODO': {
            const { todoId, completed, userId } = payload as {
              todoId: string;
              completed: boolean;
              userId: string;
            };
            // Skip local-only todos
            if (todoId.startsWith('local-')) {
              success = true;
              break;
            }
            await db.coupleTodos.toggleComplete(todoId, completed, userId);
            success = true;
            break;
          }
          case 'DELETE_TODO': {
            const { todoId } = payload as { todoId: string };
            // Skip local-only todos
            if (todoId.startsWith('local-')) {
              success = true;
              break;
            }
            await db.coupleTodos.delete(todoId);
            success = true;
            break;
          }
          default:
            console.log('[CoupleSyncStore] Unknown operation type:', type);
            success = true; // Remove unknown operations
        }

        if (success) {
          await offlineQueue.remove(operation.id);
          console.log('[CoupleSyncStore] Processed operation:', type);
        } else {
          await offlineQueue.incrementRetry(operation.id);
          if (operation.retryCount >= 3) {
            console.log('[CoupleSyncStore] Max retries reached, removing operation:', type);
            await offlineQueue.remove(operation.id);
          }
        }
      } catch (error) {
        console.error('[CoupleSyncStore] Error processing operation:', error);
        await offlineQueue.incrementRetry(operation.id);
        if (operation.retryCount >= 3) {
          await offlineQueue.remove(operation.id);
        }
      }
    }

    offlineQueue.setProcessing(false);
    console.log('[CoupleSyncStore] Finished processing pending operations');
  },

  // ============================================
  // TIMEZONE MISMATCH DETECTION
  // ============================================

  updateDeviceTimezoneAndCheckMismatch: async () => {
    const { coupleId, userId } = get();
    if (!coupleId || !userId || isInTestMode()) return;

    try {
      // Get device timezone
      let deviceTimezone = 'Asia/Seoul'; // fallback
      try {
        const calendars = Localization.getCalendars();
        if (calendars && calendars.length > 0 && calendars[0].timeZone) {
          deviceTimezone = calendars[0].timeZone;
        } else {
          deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        }
      } catch {
        deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }

      console.log('[CoupleSyncStore] Device timezone:', deviceTimezone);

      // Update device timezone in profile
      await db.profiles.updateDeviceTimezone(userId, deviceTimezone);

      // Check if couple has a manually set timezone
      const coupleTimezone = useTimezoneStore.getState().timezone;

      // If timezone is manually set (not 'auto'), no need to check for mismatch
      if (coupleTimezone !== 'auto') {
        set({ hasTimezoneMismatch: false, partnerDeviceTimezone: null });
        return;
      }

      // Get both members' device timezones
      const { data: profiles, error } = await db.profiles.getCoupleDeviceTimezones(coupleId);
      if (error || !profiles || profiles.length < 2) {
        // Only one member or error - no mismatch to detect
        set({ hasTimezoneMismatch: false, partnerDeviceTimezone: null });
        return;
      }

      // Find partner's device timezone
      const partnerProfile = profiles.find(p => p.id !== userId);
      const partnerTimezone = partnerProfile?.device_timezone;

      // Check if timezones are different
      if (partnerTimezone && partnerTimezone !== deviceTimezone) {
        console.log('[CoupleSyncStore] Timezone mismatch detected:', deviceTimezone, 'vs', partnerTimezone);
        set({ hasTimezoneMismatch: true, partnerDeviceTimezone: partnerTimezone });
      } else {
        set({ hasTimezoneMismatch: false, partnerDeviceTimezone: null });
      }
    } catch (error) {
      console.error('[CoupleSyncStore] Error checking timezone mismatch:', error);
    }
  },

  dismissTimezoneMismatch: () => {
    set({ hasTimezoneMismatch: false });
  },

  // Heart liked sync
  updateHeartLiked: async (liked: boolean) => {
    const { coupleId, userId } = get();
    if (!coupleId || !userId) {
      console.warn('[CoupleSyncStore] Cannot update heart liked - not initialized');
      return;
    }

    const newHeartLikedBy = liked ? userId : null;
    console.log('[CoupleSyncStore] Updating heart liked:', newHeartLikedBy);

    // Optimistically update local state
    set({ heartLikedBy: newHeartLikedBy });

    // Update in database
    const { error } = await db.couples.updateHeartLiked(coupleId, newHeartLikedBy);
    if (error) {
      console.error('[CoupleSyncStore] Failed to update heart liked:', error);
      // Revert on error
      set({ heartLikedBy: liked ? null : userId });
    }
  },
}),
  {
    name: 'daydate-couple-sync-storage',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (state) => ({
      // Only persist essential local data
      sharedTodos: state.sharedTodos,
      coupleAlbums: state.coupleAlbums,
      albumPhotosMap: state.albumPhotosMap,
      allCouplePhotos: state.allCouplePhotos,
      backgroundImageUrl: state.backgroundImageUrl,
      menstrualSettings: state.menstrualSettings,
    }),
  }
));

export default useCoupleSyncStore;
