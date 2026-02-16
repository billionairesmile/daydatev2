import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { db, isInTestMode, supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTimezoneStore, type TimezoneId } from './timezoneStore';
import { offlineQueue, OfflineOperationType } from '@/lib/offlineQueue';
import { getIsOnline } from '@/lib/useNetwork';
import { useSubscriptionStore } from './subscriptionStore';

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
  updated_by: string | null;
  updated_at: string;
}

export interface CoupleAlbum {
  id: string;
  couple_id: string;
  name: string;
  cover_photo_url: string | null;
  name_position: { x: number; y: number };
  text_scale: number;
  font_style: string;
  title_color: string;
  ransom_seed: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AlbumPhoto {
  id: string;
  album_id: string;
  memory_id: string;
  added_by: string;
  added_at: string;
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

  // Extended sync - Background
  updateBackgroundImage: (imageUrl: string | null) => Promise<void>;
  loadCoupleSettings: () => Promise<void>;
  setBackgroundImageUrl: (url: string | null) => void;

  // Extended sync - Albums
  createAlbum: (
    name: string,
    coverPhotoUrl?: string | null,
    namePosition?: { x: number; y: number },
    textScale?: number,
    fontStyle?: string,
    ransomSeed?: number,
    titleColor?: string
  ) => Promise<CoupleAlbum | null>;
  updateAlbum: (albumId: string, updates: Partial<CoupleAlbum>) => Promise<void>;
  deleteAlbum: (albumId: string) => Promise<void>;
  loadAlbums: () => Promise<void>;
  addPhotoToAlbum: (albumId: string, memoryId: string) => Promise<void>;
  addPhotosToAlbum: (albumId: string, memoryIds: string[]) => Promise<void>;
  removePhotoFromAlbum: (albumId: string, memoryId: string) => Promise<void>;
  removePhotosFromAlbum: (albumId: string, memoryIds: string[]) => Promise<void>;
  loadAlbumPhotos: (albumId: string) => Promise<void>;

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

    // 3. Couple settings subscription (background image)
    settingsChannel = db.coupleSettings.subscribeToSettings(coupleId, (payload) => {
      set({
        backgroundImageUrl: payload.background_image_url,
        coupleSettings: {
          ...get().coupleSettings,
          background_image_url: payload.background_image_url,
        } as CoupleSettings,
      });
    });

    // 4. Albums subscription
    albumsChannel = db.coupleAlbums.subscribeToAlbums(coupleId, async (payload) => {
      const album = payload.album as CoupleAlbum;

      if (payload.eventType === 'INSERT') {
        // Check if album already exists (prevents duplicates from optimistic updates)
        const { coupleAlbums } = get();
        const albumExists = coupleAlbums.some(a => a.id === album.id);

        if (!albumExists) {
          set((state) => ({
            coupleAlbums: [album, ...state.coupleAlbums],
          }));
          // Load photos for the new album
          const { data: photosData } = await db.albumPhotos.getByAlbum(album.id);
          if (photosData) {
            set((state) => ({
              albumPhotosMap: {
                ...state.albumPhotosMap,
                [album.id]: photosData as AlbumPhoto[],
              },
            }));
          }
        } else {
          console.log('[Albums Realtime] INSERT: Album already exists, skipping duplicate:', album.id);
        }
      } else if (payload.eventType === 'UPDATE') {
        console.log('[Albums Realtime] UPDATE received for album:', album.id, album.name);
        set((state) => ({
          coupleAlbums: state.coupleAlbums.map((a) => (a.id === album.id ? album : a)),
        }));
        // Reload photos for this album - this is triggered when a photo is added/removed
        // because we touch the album's updated_at to notify partners
        console.log('[Albums Realtime] Reloading photos for updated album:', album.id);
        const { data: photosData, error: photosError } = await db.albumPhotos.getByAlbum(album.id);
        if (!photosError && photosData) {
          console.log('[Albums Realtime] Loaded', photosData.length, 'photos for album:', album.id);
          set((state) => ({
            albumPhotosMap: {
              ...state.albumPhotosMap,
              [album.id]: photosData as AlbumPhoto[],
            },
          }));
        } else if (photosError) {
          console.error('[Albums Realtime] Failed to load photos:', photosError);
        }
      } else if (payload.eventType === 'DELETE') {
        set((state) => ({
          coupleAlbums: state.coupleAlbums.filter((a) => a.id !== album.id),
        }));
      }
    });

    // 5. Album photos subscription
    // Track processed events to prevent duplicates
    const processedAlbumPhotoEvents = new Set<string>();

    console.log('[CoupleSyncStore] Setting up album photos subscription for coupleId:', coupleId);
    albumPhotosChannel = db.albumPhotos.subscribeToAlbumPhotos(coupleId, async (payload) => {
      console.log('[AlbumPhotos Realtime] Received event:', payload.eventType);
      console.log('[AlbumPhotos Realtime] Album photo data:', JSON.stringify(payload.albumPhoto, null, 2));

      const albumPhoto = payload.albumPhoto as AlbumPhoto;
      let { coupleAlbums, albumPhotosMap } = get();

      // Deduplicate events using event id + type
      const eventKey = `${payload.eventType}-${albumPhoto.id}`;
      if (processedAlbumPhotoEvents.has(eventKey)) {
        console.log('[AlbumPhotos Realtime] Duplicate event, skipping:', eventKey);
        return;
      }
      processedAlbumPhotoEvents.add(eventKey);
      // Clean up old entries after 5 seconds
      setTimeout(() => processedAlbumPhotoEvents.delete(eventKey), 5000);

      // Handle DELETE - with REPLICA IDENTITY FULL, album_id is available in payload.old
      if (payload.eventType === 'DELETE') {
        const photoId = albumPhoto.id;
        const memoryId = albumPhoto.memory_id;

        // Use album_id from payload.old directly (available with REPLICA IDENTITY FULL)
        let targetAlbumId: string | undefined = albumPhoto.album_id;

        // Fallback: search through all albums if album_id not in payload
        if (!targetAlbumId) {
          for (const [albumId, photos] of Object.entries(albumPhotosMap)) {
            const matchingPhoto = photos.find(p => p.id === photoId || p.memory_id === memoryId);
            if (matchingPhoto) {
              targetAlbumId = albumId;
              break;
            }
          }
        }

        if (!targetAlbumId) {
          console.log('[AlbumPhotos Realtime] DELETE: Photo not found in any album, skipping');
          return;
        }

        // Verify album belongs to this couple before removing
        const albumBelongsToCouple = coupleAlbums.some(album => album.id === targetAlbumId);
        if (!albumBelongsToCouple) {
          console.log('[AlbumPhotos Realtime] DELETE: Album does not belong to this couple, skipping');
          return;
        }

        console.log('[AlbumPhotos Realtime] DELETE: Removing photo', { photoId, memoryId, albumId: targetAlbumId });

        set((state) => ({
          albumPhotosMap: {
            ...state.albumPhotosMap,
            [targetAlbumId!]: (state.albumPhotosMap[targetAlbumId!] || []).filter(
              (p) => p.id !== photoId && p.memory_id !== memoryId
            ),
          },
        }));
        return;
      }

      // For INSERT events, check album ownership
      console.log('[AlbumPhotos Realtime] INSERT: Checking album ownership for album_id:', albumPhoto.album_id);
      let albumBelongsToCouple = coupleAlbums.some(album => album.id === albumPhoto.album_id);

      // Race condition fix: if album not found locally, try to fetch it from database
      if (!albumBelongsToCouple && albumPhoto.album_id) {
        console.log('[AlbumPhotos Realtime] INSERT: Album not found locally, fetching from database');
        const { data: fetchedAlbum } = await db.coupleAlbums.getById(albumPhoto.album_id);

        if (fetchedAlbum && (fetchedAlbum as CoupleAlbum).couple_id === coupleId) {
          const album = fetchedAlbum as CoupleAlbum;
          console.log('[AlbumPhotos Realtime] INSERT: Album fetched and belongs to couple');
          set((state) => ({
            coupleAlbums: [album, ...state.coupleAlbums.filter(a => a.id !== album.id)],
          }));
          albumBelongsToCouple = true;
          albumPhotosMap = get().albumPhotosMap;
        }
      }

      if (!albumBelongsToCouple) {
        console.log('[AlbumPhotos Realtime] INSERT: Album does not belong to this couple, skipping');
        return;
      }

      if (payload.eventType === 'INSERT') {
        // Check if photo already exists (avoid duplicates from optimistic update)
        const existingPhotos = albumPhotosMap[albumPhoto.album_id] || [];
        const alreadyExists = existingPhotos.some(p =>
          p.id === albumPhoto.id ||
          (p.memory_id === albumPhoto.memory_id && p.id.startsWith('temp-'))
        );

        console.log('[AlbumPhotos Realtime] INSERT: Photo already exists?', alreadyExists);

        if (alreadyExists) {
          // Replace temp photo with real one from server
          console.log('[AlbumPhotos Realtime] INSERT: Replacing temp photo with real one');
          set((state) => ({
            albumPhotosMap: {
              ...state.albumPhotosMap,
              [albumPhoto.album_id]: state.albumPhotosMap[albumPhoto.album_id]?.map(p =>
                (p.memory_id === albumPhoto.memory_id && p.id.startsWith('temp-')) ? albumPhoto : p
              ) || [albumPhoto],
            },
          }));
        } else {
          console.log('[AlbumPhotos Realtime] INSERT: Adding new photo to album:', albumPhoto.album_id);
          set((state) => ({
            albumPhotosMap: {
              ...state.albumPhotosMap,
              [albumPhoto.album_id]: [albumPhoto, ...(state.albumPhotosMap[albumPhoto.album_id] || [])],
            },
          }));
        }
        console.log('[AlbumPhotos Realtime] INSERT: Photo added successfully');
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
      db.coupleAlbums.unsubscribe(albumsChannel);
      albumsChannel = null;
    }
    if (albumPhotosChannel) {
      db.albumPhotos.unsubscribe(albumPhotosChannel);
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

  createAlbum: async (
    name: string,
    coverPhotoUrl?: string | null,
    namePosition?: { x: number; y: number },
    textScale?: number,
    fontStyle?: string,
    ransomSeed?: number,
    titleColor?: string
  ) => {
    const { coupleId, userId, coupleAlbums } = get();

    // Check subscription limit for album creation
    const { canCreateAlbum } = useSubscriptionStore.getState();
    if (!canCreateAlbum(coupleAlbums.length)) {
      console.log('[Albums] Album creation limit reached');
      return null;
    }

    const finalRansomSeed = ransomSeed ?? Math.floor(Math.random() * 1000000);

    if (!coupleId || !userId || isInTestMode()) {
      // Demo mode: create locally
      const album: CoupleAlbum = {
        id: `local-${Date.now()}`,
        couple_id: coupleId || 'demo',
        name,
        cover_photo_url: coverPhotoUrl || null,
        name_position: namePosition || { x: 0.5, y: 0.5 },
        text_scale: textScale ?? 1.0,
        font_style: fontStyle || 'basic',
        title_color: titleColor || 'white',
        ransom_seed: finalRansomSeed,
        created_by: userId || 'demo',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      set({ coupleAlbums: [album, ...coupleAlbums] });
      return album;
    }

    const { data, error } = await db.coupleAlbums.create(
      coupleId,
      {
        name,
        cover_photo_url: coverPhotoUrl ?? undefined,
        name_position: namePosition || { x: 0.5, y: 0.5 },
        text_scale: textScale ?? 1.0,
        font_style: fontStyle || 'basic',
        title_color: titleColor || 'white',
        ransom_seed: finalRansomSeed,
      },
      userId
    );

    if (!error && data) {
      const album = data as CoupleAlbum;
      // Optimistic update: add to local state immediately for instant UI feedback
      // The subscription will handle sync, but this prevents UI lag
      set((state) => ({
        coupleAlbums: [album, ...state.coupleAlbums],
      }));
      return album;
    }
    return null;
  },

  updateAlbum: async (albumId: string, updates: Partial<CoupleAlbum>) => {
    const { coupleAlbums } = get();

    // Check subscription limit for album editing
    const albumIndex = coupleAlbums.findIndex((a) => a.id === albumId);
    if (albumIndex !== -1) {
      const { canEditAlbum } = useSubscriptionStore.getState();
      if (!canEditAlbum(albumIndex, coupleAlbums.length)) {
        console.log('[Albums] Album edit not allowed for this index');
        return;
      }
    }

    if (isInTestMode()) {
      // Demo mode: update locally
      set({
        coupleAlbums: coupleAlbums.map((a) =>
          a.id === albumId ? { ...a, ...updates, updated_at: new Date().toISOString() } : a
        ),
      });
      return;
    }

    await db.coupleAlbums.update(albumId, {
      name: updates.name,
      cover_photo_url: updates.cover_photo_url,
      name_position: updates.name_position,
      text_scale: updates.text_scale,
      font_style: updates.font_style,
      ransom_seed: updates.ransom_seed ?? undefined,
      title_color: updates.title_color,
    });

    // Update local state for immediate UI update
    set({
      coupleAlbums: coupleAlbums.map((a) =>
        a.id === albumId ? { ...a, ...updates, updated_at: new Date().toISOString() } : a
      ),
    });
  },

  deleteAlbum: async (albumId: string) => {
    const { coupleAlbums, albumPhotosMap } = get();

    if (isInTestMode()) {
      // Demo mode: delete locally
      const newPhotosMap = { ...albumPhotosMap };
      delete newPhotosMap[albumId];
      set({
        coupleAlbums: coupleAlbums.filter((a) => a.id !== albumId),
        albumPhotosMap: newPhotosMap,
      });
      return;
    }

    console.log('[SyncStore] Deleting album:', albumId);
    const { error } = await db.coupleAlbums.delete(albumId);

    if (error) {
      console.error('[SyncStore] Album delete error:', error);
      return;
    }

    // Update local state after successful deletion
    const newPhotosMap = { ...albumPhotosMap };
    delete newPhotosMap[albumId];
    set({
      coupleAlbums: coupleAlbums.filter((a) => a.id !== albumId),
      albumPhotosMap: newPhotosMap,
    });
    console.log('[SyncStore] Album deleted successfully, state updated');
  },

  loadAlbums: async () => {
    const { coupleId } = get();
    if (!coupleId || isInTestMode()) return;

    set({ isLoadingAlbums: true });
    const { data, error } = await db.coupleAlbums.getAll(coupleId);
    set({ isLoadingAlbums: false });

    if (!error && data) {
      const albums = data as CoupleAlbum[];
      set({ coupleAlbums: albums });

      // Load photos for all albums
      const photosMap: { [albumId: string]: AlbumPhoto[] } = {};
      await Promise.all(
        albums.map(async (album) => {
          const { data: photosData } = await db.albumPhotos.getByAlbum(album.id);
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

  addPhotoToAlbum: async (albumId: string, memoryId: string) => {
    const { userId, albumPhotosMap, coupleId } = get();

    console.log('[addPhotoToAlbum] ========== ADD START ==========');
    console.log('[addPhotoToAlbum] Parameters:', { albumId, memoryId, userId, coupleId });

    // UUID validation regex
    const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    // Check if memoryId is a valid UUID (sample memories have non-UUID IDs like '1', '2', etc.)
    const isSampleMemory = !isValidUUID(memoryId);
    console.log('[addPhotoToAlbum] UUID validation:', { isValidAlbumId: isValidUUID(albumId), isValidMemoryId: isValidUUID(memoryId), isSampleMemory });

    if (!userId || isInTestMode() || isSampleMemory) {
      // Demo mode or sample memory: add locally only
      console.log('[addPhotoToAlbum] Demo mode or sample memory - adding locally only');
      const newPhoto: AlbumPhoto = {
        id: `local-${Date.now()}`,
        album_id: albumId,
        memory_id: memoryId,
        added_by: userId || 'demo',
        added_at: new Date().toISOString(),
      };
      const existingPhotos = albumPhotosMap[albumId] || [];
      set({
        albumPhotosMap: {
          ...albumPhotosMap,
          [albumId]: [newPhoto, ...existingPhotos],
        },
      });
      console.log('[addPhotoToAlbum] Local add complete');
      return;
    }

    // Check if photo already exists in album
    const existingPhotos = albumPhotosMap[albumId] || [];
    const alreadyExists = existingPhotos.some(p => p.memory_id === memoryId);
    if (alreadyExists) {
      console.log('[addPhotoToAlbum] Photo already exists in album, skipping');
      return;
    }

    // Optimistic update: add to local state immediately
    const optimisticPhoto: AlbumPhoto = {
      id: `temp-${Date.now()}`,
      album_id: albumId,
      memory_id: memoryId,
      added_by: userId,
      added_at: new Date().toISOString(),
    };
    set({
      albumPhotosMap: {
        ...albumPhotosMap,
        [albumId]: [optimisticPhoto, ...existingPhotos],
      },
    });
    console.log('[addPhotoToAlbum] Optimistic update applied');

    // Perform database insert
    console.log('[addPhotoToAlbum] Calling database insert...');
    const { data, error } = await db.albumPhotos.add(albumId, memoryId, userId);

    if (error) {
      console.error('[addPhotoToAlbum] Database error:', error);
      console.error('[addPhotoToAlbum] Error details:', JSON.stringify(error, null, 2));
      // Rollback optimistic update on error
      set((state) => ({
        albumPhotosMap: {
          ...state.albumPhotosMap,
          [albumId]: (state.albumPhotosMap[albumId] || []).filter(p => p.id !== optimisticPhoto.id),
        },
      }));
      console.log('[addPhotoToAlbum] Rolled back optimistic update');
      return;
    }

    console.log('[addPhotoToAlbum] Database insert successful:', data);

    // Replace optimistic photo with real data from server
    if (data) {
      set((state) => ({
        albumPhotosMap: {
          ...state.albumPhotosMap,
          [albumId]: (state.albumPhotosMap[albumId] || []).map(p =>
            p.id === optimisticPhoto.id ? (data as AlbumPhoto) : p
          ),
        },
      }));
      console.log('[addPhotoToAlbum] Replaced optimistic photo with server data');
    }
    console.log('[addPhotoToAlbum] ========== ADD COMPLETE ==========');
  },

  addPhotosToAlbum: async (albumId: string, memoryIds: string[]) => {
    const { userId, albumPhotosMap } = get();

    console.log('[addPhotosToAlbum] ========== BATCH ADD START ==========');
    console.log('[addPhotosToAlbum] Parameters:', { albumId, count: memoryIds.length });

    if (!userId || isInTestMode() || memoryIds.length === 0) {
      console.log('[addPhotosToAlbum] Skipping - no userId, test mode, or empty list');
      return;
    }

    // Filter out duplicates and non-UUID memoryIds
    const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const existingPhotos = albumPhotosMap[albumId] || [];
    const newMemoryIds = memoryIds.filter(
      id => isValidUUID(id) && !existingPhotos.some(p => p.memory_id === id)
    );

    if (newMemoryIds.length === 0) {
      console.log('[addPhotosToAlbum] No new photos to add after filtering');
      return;
    }

    // Single optimistic update for ALL photos
    const now = Date.now();
    const optimisticPhotos: AlbumPhoto[] = newMemoryIds.map((memoryId, i) => ({
      id: `temp-${now}-${i}`,
      album_id: albumId,
      memory_id: memoryId,
      added_by: userId,
      added_at: new Date().toISOString(),
    }));

    set((state) => ({
      albumPhotosMap: {
        ...state.albumPhotosMap,
        [albumId]: [...optimisticPhotos, ...(state.albumPhotosMap[albumId] || [])],
      },
    }));
    console.log('[addPhotosToAlbum] Optimistic update applied for', optimisticPhotos.length, 'photos');

    // Single DB batch insert
    const { data, error } = await db.albumPhotos.addBatch(albumId, newMemoryIds, userId);

    if (error) {
      console.error('[addPhotosToAlbum] Batch insert error:', error);
      // Rollback all optimistic photos
      const tempIds = new Set(optimisticPhotos.map(p => p.id));
      set((state) => ({
        albumPhotosMap: {
          ...state.albumPhotosMap,
          [albumId]: (state.albumPhotosMap[albumId] || []).filter(p => !tempIds.has(p.id)),
        },
      }));
      console.log('[addPhotosToAlbum] Rolled back optimistic update');
      return;
    }

    // Replace temp photos with real server data
    if (data && Array.isArray(data)) {
      set((state) => ({
        albumPhotosMap: {
          ...state.albumPhotosMap,
          [albumId]: (state.albumPhotosMap[albumId] || []).map(p => {
            if (p.id.startsWith('temp-')) {
              const realPhoto = (data as AlbumPhoto[]).find(d => d.memory_id === p.memory_id);
              return realPhoto || p;
            }
            return p;
          }),
        },
      }));
      console.log('[addPhotosToAlbum] Replaced temp photos with server data');
    }
    console.log('[addPhotosToAlbum] ========== BATCH ADD COMPLETE ==========');
  },

  removePhotoFromAlbum: async (albumId: string, memoryId: string) => {
    const { albumPhotosMap, isInitialized, coupleId } = get();

    console.log('[removePhotoFromAlbum] ========== REMOVAL START ==========');
    console.log('[removePhotoFromAlbum] Parameters:', { albumId, memoryId });
    console.log('[removePhotoFromAlbum] Store state:', { isInitialized, coupleId, isTestMode: isInTestMode() });
    console.log('[removePhotoFromAlbum] All album IDs in map:', Object.keys(albumPhotosMap));

    const existingPhotos = albumPhotosMap[albumId] || [];
    console.log('[removePhotoFromAlbum] Existing photos for this album:', existingPhotos.length);
    console.log('[removePhotoFromAlbum] Existing photo memory_ids:', existingPhotos.map(p => p.memory_id));

    // Check if the memoryId exists in the photos
    const photoToRemove = existingPhotos.find(p => p.memory_id === memoryId);
    console.log('[removePhotoFromAlbum] Photo to remove found?:', !!photoToRemove);
    if (photoToRemove) {
      console.log('[removePhotoFromAlbum] Photo details:', { id: photoToRemove.id, memory_id: photoToRemove.memory_id, album_id: photoToRemove.album_id });
    }

    // Optimistic update: remove from local state immediately
    const filteredPhotos = existingPhotos.filter((p) => p.memory_id !== memoryId);
    console.log('[removePhotoFromAlbum] After filter - photos remaining:', filteredPhotos.length);

    set({
      albumPhotosMap: {
        ...albumPhotosMap,
        [albumId]: filteredPhotos,
      },
    });

    // Verify state was updated
    const updatedState = get();
    console.log('[removePhotoFromAlbum] State updated - new count for album:', (updatedState.albumPhotosMap[albumId] || []).length);
    console.log('[removePhotoFromAlbum] ========== OPTIMISTIC UPDATE DONE ==========');

    if (isInTestMode()) {
      console.log('[removePhotoFromAlbum] Demo mode - skipping DB delete');
      return;
    }

    // Perform database delete
    console.log('[removePhotoFromAlbum] Calling DB delete with:', { albumId, memoryId });
    const { error } = await db.albumPhotos.remove(albumId, memoryId);
    if (error) {
      console.error('[removePhotoFromAlbum] DB delete error:', error);
      console.error('[removePhotoFromAlbum] Error details:', JSON.stringify(error, null, 2));
      // Rollback optimistic update on error
      set({
        albumPhotosMap: {
          ...get().albumPhotosMap,
          [albumId]: existingPhotos,
        },
      });
      console.log('[removePhotoFromAlbum] Rolled back to previous state');
    } else {
      console.log('[removePhotoFromAlbum] DB delete successful');
      console.log('[removePhotoFromAlbum] ========== REMOVAL COMPLETE ==========');
    }
  },

  removePhotosFromAlbum: async (albumId: string, memoryIds: string[]) => {
    const { albumPhotosMap } = get();

    console.log('[removePhotosFromAlbum] ========== BATCH REMOVAL START ==========');
    console.log('[removePhotosFromAlbum] Parameters:', { albumId, count: memoryIds.length });

    if (isInTestMode() || memoryIds.length === 0) {
      console.log('[removePhotosFromAlbum] Skipping - test mode or empty list');
      return;
    }

    const memoryIdSet = new Set(memoryIds);
    const existingPhotos = albumPhotosMap[albumId] || [];

    // Single optimistic removal for ALL photos
    set((state) => ({
      albumPhotosMap: {
        ...state.albumPhotosMap,
        [albumId]: (state.albumPhotosMap[albumId] || []).filter(
          p => !memoryIdSet.has(p.memory_id)
        ),
      },
    }));
    console.log('[removePhotosFromAlbum] Optimistic removal applied for', memoryIds.length, 'photos');

    // Single DB batch delete
    const { error } = await db.albumPhotos.removeBatch(albumId, memoryIds);

    if (error) {
      console.error('[removePhotosFromAlbum] Batch delete error:', error);
      // Rollback to previous state
      set((state) => ({
        albumPhotosMap: {
          ...state.albumPhotosMap,
          [albumId]: existingPhotos,
        },
      }));
      console.log('[removePhotosFromAlbum] Rolled back to previous state');
    } else {
      console.log('[removePhotosFromAlbum] ========== BATCH REMOVAL COMPLETE ==========');
    }
  },

  loadAlbumPhotos: async (albumId: string) => {
    if (isInTestMode()) return;

    const { data, error } = await db.albumPhotos.getByAlbum(albumId);
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
      backgroundImageUrl: state.backgroundImageUrl,
      menstrualSettings: state.menstrualSettings,
    }),
  }
));

export default useCoupleSyncStore;
