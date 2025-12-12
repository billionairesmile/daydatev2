import { create } from 'zustand';
import { db, isDemoMode, supabase } from '@/lib/supabase';
import type { Mission } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

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

export interface SyncedBookmark {
  id: string;
  couple_id: string;
  mission_id: string;
  mission_data: Mission;
  bookmarked_by: string;
  created_at: string;
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

export type MissionProgressStatus = 'photo_pending' | 'message_pending' | 'waiting_partner' | 'completed';

export interface MissionProgress {
  id: string;
  couple_id: string;
  mission_id: string;
  mission_data: Mission;
  photo_url: string | null;
  user1_id: string;
  user1_message: string | null;
  user1_message_at: string | null;
  user2_id: string | null;
  user2_message: string | null;
  user2_message_at: string | null;
  started_by: string;
  started_at: string;
  completed_at: string | null;
  status: MissionProgressStatus;
  location: string | null;
  date: string;
}

export interface CoupleAlbum {
  id: string;
  couple_id: string;
  name: string;
  cover_photo_url: string | null;
  name_position: { x: number; y: number };
  text_scale: number;
  font_style: string;
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

export interface SharedMissionData {
  id: string;
  couple_id: string;
  missions: Mission[];
  generation_answers: unknown;
  generated_by: string;
  generated_at: string;
  expires_at: string;
  status: string;
}

type MissionGenerationStatus = 'idle' | 'generating' | 'completed';

interface CoupleSyncState {
  // Connection
  isInitialized: boolean;
  coupleId: string | null;
  userId: string | null;

  // Mission sync
  sharedMissions: Mission[];
  missionGenerationStatus: MissionGenerationStatus;
  generatingUserId: string | null;
  lastMissionUpdate: Date | null;

  // Bookmark sync
  sharedBookmarks: SyncedBookmark[];

  // Todo sync
  sharedTodos: SyncedTodo[];

  // Menstrual sync
  menstrualSettings: MenstrualSettings | null;

  // Extended sync - Background
  coupleSettings: CoupleSettings | null;
  backgroundImageUrl: string | null;

  // Extended sync - Mission Progress
  activeMissionProgress: MissionProgress | null;

  // Extended sync - Albums
  coupleAlbums: CoupleAlbum[];
  albumPhotosMap: Record<string, AlbumPhoto[]>; // album_id -> photos

  // Loading states
  isLoadingMissions: boolean;
  isLoadingBookmarks: boolean;
  isLoadingTodos: boolean;
  isLoadingMenstrual: boolean;
  isLoadingSettings: boolean;
  isLoadingProgress: boolean;
  isLoadingAlbums: boolean;
}

interface CoupleSyncActions {
  // Initialization
  initializeSync: (coupleId: string, userId: string) => Promise<void>;
  cleanup: () => void;

  // Mission sync
  acquireMissionLock: () => Promise<boolean>;
  releaseMissionLock: (status?: 'completed' | 'idle') => Promise<void>;
  saveSharedMissions: (missions: Mission[], answers: unknown) => Promise<void>;
  loadSharedMissions: () => Promise<Mission[] | null>;

  // Bookmark sync
  addBookmark: (mission: Mission) => Promise<boolean>;
  removeBookmark: (missionId: string) => Promise<boolean>;
  loadBookmarks: () => Promise<void>;
  isBookmarked: (missionId: string) => boolean;

  // Todo sync
  addTodo: (date: string, text: string) => Promise<SyncedTodo | null>;
  toggleTodo: (todoId: string, completed: boolean) => Promise<void>;
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

  // Extended sync - Mission Progress
  startMissionProgress: (missionId: string, missionData: Mission) => Promise<MissionProgress | null>;
  uploadMissionPhoto: (photoUrl: string) => Promise<void>;
  submitMissionMessage: (message: string) => Promise<void>;
  updateMissionLocation: (location: string) => Promise<void>;
  loadMissionProgress: () => Promise<void>;
  cancelMissionProgress: () => Promise<void>;
  isUserMessage1Submitter: () => boolean;
  hasUserSubmittedMessage: () => boolean;
  hasPartnerSubmittedMessage: () => boolean;

  // Extended sync - Albums
  createAlbum: (
    name: string,
    coverPhotoUrl?: string | null,
    namePosition?: { x: number; y: number },
    textScale?: number,
    fontStyle?: string,
    ransomSeed?: number
  ) => Promise<CoupleAlbum | null>;
  updateAlbum: (albumId: string, updates: Partial<CoupleAlbum>) => Promise<void>;
  deleteAlbum: (albumId: string) => Promise<void>;
  loadAlbums: () => Promise<void>;
  addPhotoToAlbum: (albumId: string, memoryId: string) => Promise<void>;
  removePhotoFromAlbum: (albumId: string, memoryId: string) => Promise<void>;
  loadAlbumPhotos: (albumId: string) => Promise<void>;

  // State setters (for internal use)
  setSharedMissions: (missions: Mission[]) => void;
  setMissionGenerationStatus: (status: MissionGenerationStatus, userId?: string | null) => void;
}

// Store channels for cleanup
let missionChannel: ReturnType<SupabaseClient['channel']> | null = null;
let lockChannel: ReturnType<SupabaseClient['channel']> | null = null;
let bookmarkChannel: ReturnType<SupabaseClient['channel']> | null = null;
let todoChannel: ReturnType<SupabaseClient['channel']> | null = null;
let menstrualChannel: ReturnType<SupabaseClient['channel']> | null = null;
// Extended sync channels
let settingsChannel: ReturnType<SupabaseClient['channel']> | null = null;
let progressChannel: ReturnType<SupabaseClient['channel']> | null = null;
let albumsChannel: ReturnType<SupabaseClient['channel']> | null = null;
let albumPhotosChannel: ReturnType<SupabaseClient['channel']> | null = null;

const initialState: CoupleSyncState = {
  isInitialized: false,
  coupleId: null,
  userId: null,
  sharedMissions: [],
  missionGenerationStatus: 'idle',
  generatingUserId: null,
  lastMissionUpdate: null,
  sharedBookmarks: [],
  sharedTodos: [],
  menstrualSettings: null,
  // Extended sync
  coupleSettings: null,
  backgroundImageUrl: null,
  activeMissionProgress: null,
  coupleAlbums: [],
  albumPhotosMap: {},
  // Loading states
  isLoadingMissions: false,
  isLoadingBookmarks: false,
  isLoadingTodos: false,
  isLoadingMenstrual: false,
  isLoadingSettings: false,
  isLoadingProgress: false,
  isLoadingAlbums: false,
};

export const useCoupleSyncStore = create<CoupleSyncState & CoupleSyncActions>()((set, get) => ({
  ...initialState,

  // ============================================
  // INITIALIZATION
  // ============================================

  initializeSync: async (coupleId: string, userId: string) => {
    if (isDemoMode || !supabase) {
      set({ isInitialized: true, coupleId, userId });
      return;
    }

    set({ coupleId, userId });

    // Load initial data
    await Promise.all([
      get().loadSharedMissions(),
      get().loadBookmarks(),
      get().loadTodos(),
      get().loadMenstrualSettings(),
      // Extended sync
      get().loadCoupleSettings(),
      get().loadMissionProgress(),
      get().loadAlbums(),
    ]);

    // Setup real-time subscriptions
    // 1. Mission subscription
    missionChannel = db.coupleMissions.subscribeToMissions(coupleId, (payload) => {
      const missions = payload.missions as Mission[];
      set({
        sharedMissions: missions,
        lastMissionUpdate: new Date(),
        missionGenerationStatus: 'completed',
        generatingUserId: payload.generated_by,
      });
    });

    // 2. Lock subscription
    lockChannel = db.missionLock.subscribeToLock(coupleId, (payload) => {
      set({
        missionGenerationStatus: payload.status as MissionGenerationStatus,
        generatingUserId: payload.locked_by,
      });
    });

    // 3. Bookmark subscription
    bookmarkChannel = db.coupleBookmarks.subscribeToBookmarks(coupleId, (payload) => {
      const bookmark = payload.bookmark as SyncedBookmark;

      if (payload.eventType === 'INSERT') {
        set((state) => ({
          sharedBookmarks: [bookmark, ...state.sharedBookmarks],
        }));
      } else if (payload.eventType === 'DELETE') {
        set((state) => ({
          sharedBookmarks: state.sharedBookmarks.filter((b) => b.id !== bookmark.id),
        }));
      }
    });

    // 4. Todo subscription
    todoChannel = db.coupleTodos.subscribeToTodos(coupleId, (payload) => {
      const todo = payload.todo as SyncedTodo;

      console.log('[Todo Realtime]', payload.eventType, 'todo:', todo);

      if (payload.eventType === 'INSERT') {
        set((state) => ({
          sharedTodos: [...state.sharedTodos, todo].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          ),
        }));
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

    // 5. Menstrual settings subscription
    menstrualChannel = db.menstrualSettings.subscribeToSettings(coupleId, (payload) => {
      set({ menstrualSettings: payload as MenstrualSettings });
    });

    // ============================================
    // EXTENDED SYNC SUBSCRIPTIONS
    // ============================================

    // 6. Couple settings subscription (background image)
    settingsChannel = db.coupleSettings.subscribeToSettings(coupleId, (payload) => {
      set({
        backgroundImageUrl: payload.background_image_url,
        coupleSettings: {
          ...get().coupleSettings,
          background_image_url: payload.background_image_url,
        } as CoupleSettings,
      });
    });

    // 7. Mission progress subscription
    progressChannel = db.missionProgress.subscribeToProgress(coupleId, (payload) => {
      const progress = payload.progress as MissionProgress;

      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        set({ activeMissionProgress: progress });
      } else if (payload.eventType === 'DELETE') {
        set({ activeMissionProgress: null });
      }
    });

    // 8. Albums subscription
    albumsChannel = db.coupleAlbums.subscribeToAlbums(coupleId, (payload) => {
      const album = payload.album as CoupleAlbum;

      if (payload.eventType === 'INSERT') {
        set((state) => ({
          coupleAlbums: [album, ...state.coupleAlbums],
        }));
      } else if (payload.eventType === 'UPDATE') {
        set((state) => ({
          coupleAlbums: state.coupleAlbums.map((a) => (a.id === album.id ? album : a)),
        }));
      } else if (payload.eventType === 'DELETE') {
        set((state) => ({
          coupleAlbums: state.coupleAlbums.filter((a) => a.id !== album.id),
        }));
      }
    });

    // 9. Album photos subscription
    albumPhotosChannel = db.albumPhotos.subscribeToAlbumPhotos(coupleId, (payload) => {
      const albumPhoto = payload.albumPhoto as AlbumPhoto;

      if (payload.eventType === 'INSERT') {
        set((state) => {
          const albumId = albumPhoto.album_id;
          const existingPhotos = state.albumPhotosMap[albumId] || [];
          return {
            albumPhotosMap: {
              ...state.albumPhotosMap,
              [albumId]: [albumPhoto, ...existingPhotos],
            },
          };
        });
      } else if (payload.eventType === 'DELETE') {
        set((state) => {
          const albumId = albumPhoto.album_id;
          const existingPhotos = state.albumPhotosMap[albumId] || [];
          return {
            albumPhotosMap: {
              ...state.albumPhotosMap,
              [albumId]: existingPhotos.filter((p) => p.id !== albumPhoto.id),
            },
          };
        });
      }
    });

    set({ isInitialized: true });
  },

  cleanup: () => {
    // Unsubscribe from all channels
    if (missionChannel) {
      db.coupleMissions.unsubscribe(missionChannel);
      missionChannel = null;
    }
    if (lockChannel) {
      db.missionLock.unsubscribe(lockChannel);
      lockChannel = null;
    }
    if (bookmarkChannel) {
      db.coupleBookmarks.unsubscribe(bookmarkChannel);
      bookmarkChannel = null;
    }
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
    if (progressChannel) {
      db.missionProgress.unsubscribe(progressChannel);
      progressChannel = null;
    }
    if (albumsChannel) {
      db.coupleAlbums.unsubscribe(albumsChannel);
      albumsChannel = null;
    }
    if (albumPhotosChannel) {
      db.albumPhotos.unsubscribe(albumPhotosChannel);
      albumPhotosChannel = null;
    }

    set(initialState);
  },

  // ============================================
  // MISSION SYNC
  // ============================================

  acquireMissionLock: async () => {
    const { coupleId, userId } = get();
    if (!coupleId || !userId || isDemoMode) return true;

    const acquired = await db.missionLock.acquire(coupleId, userId);
    if (acquired) {
      set({ missionGenerationStatus: 'generating', generatingUserId: userId });
    }
    return acquired;
  },

  releaseMissionLock: async (status: 'completed' | 'idle' = 'completed') => {
    const { coupleId } = get();
    if (!coupleId || isDemoMode) return;

    await db.missionLock.release(coupleId, status);
    set({ missionGenerationStatus: status, generatingUserId: null });
  },

  saveSharedMissions: async (missions: Mission[], answers: unknown) => {
    const { coupleId, userId } = get();
    if (!coupleId || !userId || isDemoMode) {
      set({ sharedMissions: missions, lastMissionUpdate: new Date() });
      return;
    }

    // Expire old missions first
    await db.coupleMissions.expireOld(coupleId);

    // Save new missions
    const { error } = await db.coupleMissions.create(coupleId, missions, answers, userId);
    if (!error) {
      set({
        sharedMissions: missions,
        lastMissionUpdate: new Date(),
        missionGenerationStatus: 'completed',
      });
    }

    // Release the lock
    await get().releaseMissionLock('completed');
  },

  loadSharedMissions: async () => {
    const { coupleId } = get();
    if (!coupleId || isDemoMode) return null;

    set({ isLoadingMissions: true });
    const { data, error } = await db.coupleMissions.getToday(coupleId);
    set({ isLoadingMissions: false });

    if (!error && data) {
      const missions = data.missions as Mission[];
      set({
        sharedMissions: missions,
        lastMissionUpdate: new Date(data.generated_at),
        missionGenerationStatus: 'completed',
        generatingUserId: data.generated_by,
      });
      return missions;
    }

    // Also check lock status
    const { data: lockData } = await db.missionLock.getStatus(coupleId);
    if (lockData && lockData.status === 'generating') {
      set({
        missionGenerationStatus: 'generating',
        generatingUserId: lockData.locked_by,
      });
    }

    return null;
  },

  setSharedMissions: (missions: Mission[]) => {
    set({ sharedMissions: missions, lastMissionUpdate: new Date() });
  },

  setMissionGenerationStatus: (status: MissionGenerationStatus, userId: string | null = null) => {
    set({ missionGenerationStatus: status, generatingUserId: userId });
  },

  // ============================================
  // BOOKMARK SYNC
  // ============================================

  addBookmark: async (mission: Mission) => {
    const { coupleId, userId, sharedBookmarks } = get();

    // Check if already bookmarked (max 5)
    if (sharedBookmarks.length >= 5) {
      return false;
    }

    // Check if already exists
    if (sharedBookmarks.some((b) => b.mission_id === mission.id)) {
      return false;
    }

    if (!coupleId || !userId || isDemoMode) {
      // Demo mode: add locally
      const newBookmark: SyncedBookmark = {
        id: `local-${Date.now()}`,
        couple_id: coupleId || 'demo',
        mission_id: mission.id,
        mission_data: mission,
        bookmarked_by: userId || 'demo',
        created_at: new Date().toISOString(),
      };
      set({ sharedBookmarks: [newBookmark, ...sharedBookmarks] });
      return true;
    }

    const { error } = await db.coupleBookmarks.add(coupleId, mission.id, mission, userId);
    return !error;
  },

  removeBookmark: async (missionId: string) => {
    const { coupleId, sharedBookmarks } = get();

    if (!coupleId || isDemoMode) {
      // Demo mode: remove locally
      set({
        sharedBookmarks: sharedBookmarks.filter((b) => b.mission_id !== missionId),
      });
      return true;
    }

    const { error } = await db.coupleBookmarks.remove(coupleId, missionId);
    return !error;
  },

  loadBookmarks: async () => {
    const { coupleId } = get();
    if (!coupleId || isDemoMode) return;

    set({ isLoadingBookmarks: true });
    const { data, error } = await db.coupleBookmarks.getAll(coupleId);
    set({ isLoadingBookmarks: false });

    if (!error && data) {
      set({ sharedBookmarks: data as SyncedBookmark[] });
    }
  },

  isBookmarked: (missionId: string) => {
    return get().sharedBookmarks.some((b) => b.mission_id === missionId);
  },

  // ============================================
  // TODO SYNC
  // ============================================

  addTodo: async (date: string, text: string) => {
    const { coupleId, userId, sharedTodos } = get();

    if (!coupleId || !userId || isDemoMode) {
      // Demo mode: add locally
      const newTodo: SyncedTodo = {
        id: `local-${Date.now()}`,
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
      set({
        sharedTodos: [...sharedTodos, newTodo].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        ),
      });
      return newTodo;
    }

    const { data, error } = await db.coupleTodos.create(coupleId, date, text, userId);
    if (!error && data) {
      return data as SyncedTodo;
    }
    return null;
  },

  toggleTodo: async (todoId: string, completed: boolean) => {
    const { userId, sharedTodos } = get();

    if (isDemoMode) {
      // Demo mode: update locally
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
      return;
    }

    await db.coupleTodos.toggleComplete(todoId, completed, userId || '');
  },

  deleteTodo: async (todoId: string) => {
    const { sharedTodos } = get();

    // Optimistic delete - update local state immediately
    set({
      sharedTodos: sharedTodos.filter((t) => t.id !== todoId),
    });

    if (isDemoMode) {
      // Demo mode: already deleted locally
      return;
    }

    // Delete from DB (real-time subscription will also fire, but we've already updated locally)
    await db.coupleTodos.delete(todoId);
  },

  loadTodos: async () => {
    const { coupleId } = get();
    if (!coupleId || isDemoMode) return;

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

    if (!coupleId || !userId || isDemoMode) {
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
    if (!coupleId || isDemoMode) return;

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

    if (!coupleId || !userId || isDemoMode) {
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
    if (!coupleId || isDemoMode) return;

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
  // EXTENDED SYNC - MISSION PROGRESS
  // ============================================

  startMissionProgress: async (missionId: string, missionData: Mission) => {
    const { coupleId, userId } = get();

    if (!coupleId || !userId || isDemoMode) {
      // Demo mode: create locally
      const progress: MissionProgress = {
        id: `local-${Date.now()}`,
        couple_id: coupleId || 'demo',
        mission_id: missionId,
        mission_data: missionData,
        photo_url: null,
        user1_id: userId || 'demo',
        user1_message: null,
        user1_message_at: null,
        user2_id: null,
        user2_message: null,
        user2_message_at: null,
        started_by: userId || 'demo',
        started_at: new Date().toISOString(),
        completed_at: null,
        status: 'photo_pending',
        location: null,
        date: new Date().toISOString().split('T')[0],
      };
      set({ activeMissionProgress: progress });
      return progress;
    }

    const { data, error } = await db.missionProgress.start(coupleId, missionId, missionData, userId);
    if (!error && data) {
      const progress = data as MissionProgress;
      set({ activeMissionProgress: progress });
      return progress;
    }
    return null;
  },

  uploadMissionPhoto: async (photoUrl: string) => {
    const { activeMissionProgress } = get();

    if (!activeMissionProgress || isDemoMode) {
      // Demo mode: update locally
      if (activeMissionProgress) {
        set({
          activeMissionProgress: {
            ...activeMissionProgress,
            photo_url: photoUrl,
            status: 'message_pending',
          },
        });
      }
      return;
    }

    await db.missionProgress.uploadPhoto(activeMissionProgress.id, photoUrl);
  },

  submitMissionMessage: async (message: string) => {
    const { activeMissionProgress, userId } = get();

    if (!activeMissionProgress || !userId) return;

    if (isDemoMode) {
      // Demo mode: update locally
      const isUser1 = activeMissionProgress.user1_id === userId;
      const now = new Date().toISOString();

      const updates: Partial<MissionProgress> = isUser1
        ? { user1_message: message, user1_message_at: now }
        : { user2_id: userId, user2_message: message, user2_message_at: now };

      const hasUser1Message = isUser1 ? true : !!activeMissionProgress.user1_message;
      const hasUser2Message = isUser1 ? !!activeMissionProgress.user2_message : true;

      if (hasUser1Message && hasUser2Message) {
        updates.status = 'completed';
        updates.completed_at = now;
      } else {
        updates.status = 'waiting_partner';
      }

      set({
        activeMissionProgress: { ...activeMissionProgress, ...updates } as MissionProgress,
      });
      return;
    }

    const isUser1 = activeMissionProgress.user1_id === userId;
    await db.missionProgress.submitMessage(activeMissionProgress.id, userId, message, isUser1);
  },

  updateMissionLocation: async (location: string) => {
    const { activeMissionProgress } = get();

    if (!activeMissionProgress || isDemoMode) {
      // Demo mode: update locally
      if (activeMissionProgress) {
        set({
          activeMissionProgress: { ...activeMissionProgress, location },
        });
      }
      return;
    }

    await db.missionProgress.updateLocation(activeMissionProgress.id, location);
  },

  loadMissionProgress: async () => {
    const { coupleId } = get();
    if (!coupleId || isDemoMode) return;

    set({ isLoadingProgress: true });
    const { data, error } = await db.missionProgress.getToday(coupleId);
    set({ isLoadingProgress: false });

    if (!error && data) {
      set({ activeMissionProgress: data as MissionProgress });
    }
  },

  cancelMissionProgress: async () => {
    const { activeMissionProgress } = get();

    if (!activeMissionProgress || isDemoMode) {
      set({ activeMissionProgress: null });
      return;
    }

    await db.missionProgress.delete(activeMissionProgress.id);
    set({ activeMissionProgress: null });
  },

  isUserMessage1Submitter: () => {
    const { activeMissionProgress, userId } = get();
    if (!activeMissionProgress || !userId) return false;
    return activeMissionProgress.user1_id === userId;
  },

  hasUserSubmittedMessage: () => {
    const { activeMissionProgress, userId } = get();
    if (!activeMissionProgress || !userId) return false;

    if (activeMissionProgress.user1_id === userId) {
      return !!activeMissionProgress.user1_message;
    } else {
      return !!activeMissionProgress.user2_message;
    }
  },

  hasPartnerSubmittedMessage: () => {
    const { activeMissionProgress, userId } = get();
    if (!activeMissionProgress || !userId) return false;

    if (activeMissionProgress.user1_id === userId) {
      return !!activeMissionProgress.user2_message;
    } else {
      return !!activeMissionProgress.user1_message;
    }
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
    ransomSeed?: number
  ) => {
    const { coupleId, userId, coupleAlbums } = get();

    const finalRansomSeed = ransomSeed ?? Math.floor(Math.random() * 1000000);

    if (!coupleId || !userId || isDemoMode) {
      // Demo mode: create locally
      const album: CoupleAlbum = {
        id: `local-${Date.now()}`,
        couple_id: coupleId || 'demo',
        name,
        cover_photo_url: coverPhotoUrl || null,
        name_position: namePosition || { x: 0.5, y: 0.5 },
        text_scale: textScale ?? 1.0,
        font_style: fontStyle || 'basic',
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
        ransom_seed: finalRansomSeed,
      },
      userId
    );

    if (!error && data) {
      return data as CoupleAlbum;
    }
    return null;
  },

  updateAlbum: async (albumId: string, updates: Partial<CoupleAlbum>) => {
    const { coupleAlbums } = get();

    if (isDemoMode) {
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
    });
  },

  deleteAlbum: async (albumId: string) => {
    const { coupleAlbums, albumPhotosMap } = get();

    if (isDemoMode) {
      // Demo mode: delete locally
      const newPhotosMap = { ...albumPhotosMap };
      delete newPhotosMap[albumId];
      set({
        coupleAlbums: coupleAlbums.filter((a) => a.id !== albumId),
        albumPhotosMap: newPhotosMap,
      });
      return;
    }

    await db.coupleAlbums.delete(albumId);
  },

  loadAlbums: async () => {
    const { coupleId } = get();
    if (!coupleId || isDemoMode) return;

    set({ isLoadingAlbums: true });
    const { data, error } = await db.coupleAlbums.getAll(coupleId);
    set({ isLoadingAlbums: false });

    if (!error && data) {
      set({ coupleAlbums: data as CoupleAlbum[] });
    }
  },

  addPhotoToAlbum: async (albumId: string, memoryId: string) => {
    const { userId, albumPhotosMap } = get();

    if (!userId || isDemoMode) {
      // Demo mode: add locally
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
      return;
    }

    await db.albumPhotos.add(albumId, memoryId, userId);
  },

  removePhotoFromAlbum: async (albumId: string, memoryId: string) => {
    const { albumPhotosMap } = get();

    if (isDemoMode) {
      // Demo mode: remove locally
      const existingPhotos = albumPhotosMap[albumId] || [];
      set({
        albumPhotosMap: {
          ...albumPhotosMap,
          [albumId]: existingPhotos.filter((p) => p.memory_id !== memoryId),
        },
      });
      return;
    }

    await db.albumPhotos.remove(albumId, memoryId);
  },

  loadAlbumPhotos: async (albumId: string) => {
    if (isDemoMode) return;

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
}));

export default useCoupleSyncStore;
