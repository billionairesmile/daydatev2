import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, isInTestMode, supabase } from '@/lib/supabase';
import type { Mission } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useMemoryStore, dbToCompletedMission } from './memoryStore';
import { formatDateToLocal } from '@/lib/dateUtils';
import { offlineQueue, OfflineOperationType } from '@/lib/offlineQueue';
import { getIsOnline } from '@/lib/useNetwork';
import {
  notifyPartnerMissionGenerated,
  notifyMissionReminder,
  scheduleMissionReminderNotification,
  cancelMissionReminderNotification,
} from '@/lib/pushNotifications';
import { useLanguageStore } from './languageStore';
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
  is_message_locked?: boolean; // True if this mission is locked for message submission
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
  sharedMissionsDate: string | null; // Track the date missions were generated (YYYY-MM-DD)
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

  // Extended sync - Mission Progress (supports multiple missions per day)
  activeMissionProgress: MissionProgress | null; // The locked mission or first mission (legacy compatibility)
  allMissionProgress: MissionProgress[]; // All missions for today
  lockedMissionId: string | null; // The mission_id that is locked for message submission

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
  saveSharedMissions: (missions: Mission[], answers: unknown, partnerId?: string, userNickname?: string) => Promise<void>;
  loadSharedMissions: () => Promise<Mission[] | null>;
  resetAllMissions: () => Promise<void>;
  checkAndResetSharedMissions: () => void;

  // Mission reminder notification
  sendMissionReminderNotifications: (userNickname: string, partnerNickname: string) => Promise<void>;

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

  // Extended sync - Mission Progress (supports multiple missions per day)
  startMissionProgress: (missionId: string, missionData: Mission) => Promise<MissionProgress | null>;
  uploadMissionPhoto: (photoUrl: string, progressId?: string) => Promise<void>;
  submitMissionMessage: (message: string, progressId?: string) => Promise<void>;
  updateMissionLocation: (location: string, progressId?: string) => Promise<void>;
  loadMissionProgress: () => Promise<void>;
  cancelMissionProgress: (progressId?: string) => Promise<void>;
  isUserMessage1Submitter: (progress?: MissionProgress | null) => boolean;
  hasUserSubmittedMessage: (progress?: MissionProgress | null) => boolean;
  hasPartnerSubmittedMessage: (progress?: MissionProgress | null) => boolean;
  // Multi-mission support
  getMissionProgressByMissionId: (missionId: string) => MissionProgress | undefined;
  getLockedMissionProgress: () => MissionProgress | null;
  isMissionLocked: (missionId: string) => boolean;
  canStartNewMission: () => boolean;

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

  // Offline sync
  processPendingOperations: () => Promise<void>;
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
let completedMissionsChannel: ReturnType<SupabaseClient['channel']> | null = null;

const initialState: CoupleSyncState = {
  isInitialized: false,
  coupleId: null,
  userId: null,
  sharedMissions: [],
  sharedMissionsDate: null,
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
  allMissionProgress: [],
  lockedMissionId: null,
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
      const today = formatDateToLocal(new Date());
      set({
        sharedMissions: missions,
        sharedMissionsDate: today, // Set the date when receiving missions via real-time
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
        set((state) => {
          // Check if bookmark already exists (prevent duplicate from realtime + direct add)
          if (state.sharedBookmarks.some(b => b.id === bookmark.id)) {
            return state;
          }
          return {
            sharedBookmarks: [bookmark, ...state.sharedBookmarks],
          };
        });
      } else if (payload.eventType === 'DELETE') {
        set((state) => ({
          sharedBookmarks: state.sharedBookmarks.filter((b) => b.id !== bookmark.id),
        }));
      }
    });

    // 4. Todo subscription
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

    // 7. Mission progress subscription (handles multiple missions per day)
    progressChannel = db.missionProgress.subscribeToProgress(coupleId, (payload) => {
      const progress = payload.progress as MissionProgress;
      const today = formatDateToLocal(new Date());

      // Only process progress for today
      if (progress.date !== today) return;

      if (payload.eventType === 'INSERT') {
        set((state) => {
          const existing = state.allMissionProgress.find(p => p.id === progress.id);
          if (existing) return state;

          const updatedAll = [...state.allMissionProgress, progress];
          const lockedProgress = updatedAll.find(p => p.is_message_locked);
          const lockedId = lockedProgress?.mission_id || null;
          const active = lockedProgress || updatedAll[0] || null;

          return {
            allMissionProgress: updatedAll,
            activeMissionProgress: active,
            lockedMissionId: lockedId,
          };
        });
      } else if (payload.eventType === 'UPDATE') {
        set((state) => {
          const updatedAll = state.allMissionProgress.map(p =>
            p.id === progress.id ? progress : p
          );

          // If progress wasn't in the array, add it
          if (!state.allMissionProgress.some(p => p.id === progress.id)) {
            updatedAll.push(progress);
          }

          const lockedProgress = updatedAll.find(p => p.is_message_locked);
          const lockedId = lockedProgress?.mission_id || null;
          const active = lockedProgress || updatedAll[0] || null;

          // Cancel scheduled reminder if locked mission is completed
          if (progress.status === 'completed' && progress.is_message_locked) {
            cancelMissionReminderNotification().catch((err) => {
              console.error('[CoupleSyncStore] Failed to cancel reminder notification:', err);
            });

            // Clean up non-locked missions when locked mission completes
            if (state.coupleId && !isInTestMode()) {
              db.missionProgress.deleteNonLockedMissions(state.coupleId).catch((err) => {
                console.error('[CoupleSyncStore] Failed to delete non-locked missions:', err);
              });
            }
          }

          return {
            allMissionProgress: updatedAll,
            activeMissionProgress: active,
            lockedMissionId: lockedId,
          };
        });
      } else if (payload.eventType === 'DELETE') {
        set((state) => {
          const updatedAll = state.allMissionProgress.filter(p => p.id !== progress.id);
          const lockedProgress = updatedAll.find(p => p.is_message_locked);
          const lockedId = lockedProgress?.mission_id || null;
          const active = lockedProgress || updatedAll[0] || null;

          return {
            allMissionProgress: updatedAll,
            activeMissionProgress: active,
            lockedMissionId: lockedId,
          };
        });
      }
    });

    // 8. Albums subscription
    albumsChannel = db.coupleAlbums.subscribeToAlbums(coupleId, async (payload) => {
      const album = payload.album as CoupleAlbum;

      if (payload.eventType === 'INSERT') {
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
    // Track processed events to prevent duplicates
    const processedAlbumPhotoEvents = new Set<string>();

    albumPhotosChannel = db.albumPhotos.subscribeToAlbumPhotos(coupleId, async (payload) => {
      const albumPhoto = payload.albumPhoto as AlbumPhoto;
      let { coupleAlbums, albumPhotosMap } = get();

      // Deduplicate events using event id + type
      const eventKey = `${payload.eventType}-${albumPhoto.id}`;
      if (processedAlbumPhotoEvents.has(eventKey)) {
        return;
      }
      processedAlbumPhotoEvents.add(eventKey);
      // Clean up old entries after 5 seconds
      setTimeout(() => processedAlbumPhotoEvents.delete(eventKey), 5000);

      // Handle DELETE specially - album_id may not be in payload
      if (payload.eventType === 'DELETE') {
        // Search for the photo in all albums to find its album_id
        let targetAlbumId: string | undefined;
        for (const [albumId, photos] of Object.entries(albumPhotosMap)) {
          const matchingPhoto = photos.find(p => p.id === albumPhoto.id || p.memory_id === albumPhoto.memory_id);
          if (matchingPhoto) {
            targetAlbumId = albumId;
            break;
          }
        }

        if (!targetAlbumId) {
          return;
        }
        const photoId = albumPhoto.id;
        const memoryId = albumPhoto.memory_id;
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
      let albumBelongsToCouple = coupleAlbums.some(album => album.id === albumPhoto.album_id);

      // Race condition fix: if album not found locally, try to fetch it from database
      if (!albumBelongsToCouple && albumPhoto.album_id) {
        const { data: fetchedAlbum } = await db.coupleAlbums.getById(albumPhoto.album_id);

        if (fetchedAlbum && (fetchedAlbum as CoupleAlbum).couple_id === coupleId) {
          const album = fetchedAlbum as CoupleAlbum;
          set((state) => ({
            coupleAlbums: [album, ...state.coupleAlbums.filter(a => a.id !== album.id)],
          }));
          albumBelongsToCouple = true;
          albumPhotosMap = get().albumPhotosMap;
        }
      }

      if (!albumBelongsToCouple) {
        return;
      }

      if (payload.eventType === 'INSERT') {
        // Check if photo already exists (avoid duplicates from optimistic update)
        const existingPhotos = albumPhotosMap[albumPhoto.album_id] || [];
        const alreadyExists = existingPhotos.some(p =>
          p.id === albumPhoto.id ||
          (p.memory_id === albumPhoto.memory_id && p.id.startsWith('temp-'))
        );

        if (alreadyExists) {
          // Replace temp photo with real one from server
          set((state) => ({
            albumPhotosMap: {
              ...state.albumPhotosMap,
              [albumPhoto.album_id]: state.albumPhotosMap[albumPhoto.album_id]?.map(p =>
                (p.memory_id === albumPhoto.memory_id && p.id.startsWith('temp-')) ? albumPhoto : p
              ) || [albumPhoto],
            },
          }));
        } else {
          set((state) => ({
            albumPhotosMap: {
              ...state.albumPhotosMap,
              [albumPhoto.album_id]: [albumPhoto, ...(state.albumPhotosMap[albumPhoto.album_id] || [])],
            },
          }));
        }
      }
    });

    // 10. Completed missions subscription (for memory sync between devices)
    // Track processed events to prevent duplicates
    const processedMemoryEvents = new Set<string>();

    completedMissionsChannel = db.completedMissions.subscribeToCompletedMissions(coupleId, (payload) => {
      const memoryData = payload.memory as Record<string, unknown>;
      const memoryId = memoryData?.id as string;

      // Deduplicate events
      const eventKey = `${payload.eventType}-${memoryId}`;
      if (processedMemoryEvents.has(eventKey)) {
        return;
      }
      processedMemoryEvents.add(eventKey);
      setTimeout(() => processedMemoryEvents.delete(eventKey), 5000);

      const memoryStore = useMemoryStore.getState();

      if (payload.eventType === 'INSERT') {
        // Convert DB format to CompletedMission format using shared converter
        const newMemory = dbToCompletedMission(memoryData);

        // Check if memory already exists (avoid duplicates)
        const existingMemories = memoryStore.memories;
        if (!existingMemories.some(m => m.id === newMemory.id)) {
          memoryStore.addMemory(newMemory);
        }
      } else if (payload.eventType === 'DELETE') {
        if (memoryId) {
          memoryStore.deleteMemory(memoryId);
        }
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
    if (completedMissionsChannel) {
      db.completedMissions.unsubscribeFromCompletedMissions(completedMissionsChannel);
      completedMissionsChannel = null;
    }

    set(initialState);
  },

  // ============================================
  // MISSION SYNC
  // ============================================

  acquireMissionLock: async () => {
    const { coupleId, userId } = get();
    if (!coupleId || !userId || isInTestMode()) return true;

    const acquired = await db.missionLock.acquire(coupleId, userId);
    if (acquired) {
      set({ missionGenerationStatus: 'generating', generatingUserId: userId });
    }
    return acquired;
  },

  releaseMissionLock: async (status: 'completed' | 'idle' = 'completed') => {
    const { coupleId } = get();
    if (!coupleId || isInTestMode()) return;

    await db.missionLock.release(coupleId, status);
    set({ missionGenerationStatus: status, generatingUserId: null });
  },

  saveSharedMissions: async (missions: Mission[], answers: unknown, partnerId?: string, userNickname?: string) => {
    const { coupleId, userId } = get();
    const today = formatDateToLocal(new Date());

    if (!coupleId || !userId || isInTestMode()) {
      set({ sharedMissions: missions, sharedMissionsDate: today, lastMissionUpdate: new Date() });
      return;
    }

    // Expire old missions first
    await db.coupleMissions.expireOld(coupleId);

    // Save new missions
    const { error } = await db.coupleMissions.create(coupleId, missions, answers, userId);
    if (!error) {
      set({
        sharedMissions: missions,
        sharedMissionsDate: today,
        lastMissionUpdate: new Date(),
        missionGenerationStatus: 'completed',
      });

      // Send push notification to partner
      if (partnerId && userNickname) {
        console.log('[CoupleSyncStore] Sending mission generated notification to partner:', partnerId);
        const language = useLanguageStore.getState().language;
        notifyPartnerMissionGenerated(partnerId, userNickname, language).catch((err) => {
          console.error('[CoupleSyncStore] Failed to send notification:', err);
        });
      }

      // Schedule a reminder notification for 8 PM if missions aren't completed
      const language = useLanguageStore.getState().language;
      scheduleMissionReminderNotification(20, language).catch((err) => {
        console.error('[CoupleSyncStore] Failed to schedule reminder notification:', err);
      });
    }

    // Release the lock
    await get().releaseMissionLock('completed');
  },

  loadSharedMissions: async () => {
    const { coupleId } = get();
    if (!coupleId || isInTestMode()) return null;

    set({ isLoadingMissions: true });
    const { data, error } = await db.coupleMissions.getToday(coupleId);
    set({ isLoadingMissions: false });

    const today = formatDateToLocal(new Date());

    if (!error && data) {
      const missions = data.missions as Mission[];
      set({
        sharedMissions: missions,
        sharedMissionsDate: today,
        lastMissionUpdate: new Date(data.generated_at),
        missionGenerationStatus: 'completed',
        generatingUserId: data.generated_by,
      });
      return missions;
    }

    // No missions found for today - clear any stale persisted missions
    if (!error && !data) {
      set({
        sharedMissions: [],
        sharedMissionsDate: null,
        missionGenerationStatus: 'idle',
        generatingUserId: null,
      });
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

  /**
   * Send mission reminder notifications to users who haven't written their message.
   * Logic:
   * 1. If the mission date is not today (past midnight), don't send any notifications
   * 2. If today's mission is already completed (any mission with status='completed'), don't send any notifications
   * 3. Only check missions that have photo uploaded (status='message_pending' or 'waiting_partner')
   * 4. If neither user has written their message -> notify both users
   * 5. If only one user hasn't written -> notify only that user
   */
  sendMissionReminderNotifications: async (userNickname: string, partnerNickname: string) => {
    const { activeMissionProgress, userId } = get();

    // No active mission progress - nothing to remind about
    if (!activeMissionProgress || isInTestMode()) {
      console.log('[CoupleSyncStore] No active mission progress - skipping reminder');
      return;
    }

    // Check if mission date is still today (don't send reminders for past missions after midnight)
    const today = formatDateToLocal(new Date());
    if (activeMissionProgress.date !== today) {
      console.log('[CoupleSyncStore] Mission date is not today - skipping reminder (mission date:', activeMissionProgress.date, ', today:', today, ')');
      return;
    }

    // If mission is already completed, don't send any notifications
    if (activeMissionProgress.status === 'completed') {
      console.log('[CoupleSyncStore] Mission already completed - skipping reminder');
      return;
    }

    // Only proceed if photo has been uploaded (status is message_pending or waiting_partner)
    if (activeMissionProgress.status === 'photo_pending') {
      console.log('[CoupleSyncStore] Photo not yet uploaded - skipping reminder');
      return;
    }

    const user1HasMessage = !!activeMissionProgress.user1_message;
    const user2HasMessage = !!activeMissionProgress.user2_message;

    // Both have written - should have been marked completed, but just in case
    if (user1HasMessage && user2HasMessage) {
      console.log('[CoupleSyncStore] Both users have written messages - skipping reminder');
      return;
    }

    // Determine who needs to be notified
    const isCurrentUserUser1 = activeMissionProgress.user1_id === userId;
    const currentUserHasMessage = isCurrentUserUser1 ? user1HasMessage : user2HasMessage;
    const partnerHasMessage = isCurrentUserUser1 ? user2HasMessage : user1HasMessage;
    const partnerId = isCurrentUserUser1
      ? activeMissionProgress.user2_id
      : activeMissionProgress.user1_id;

    // Get user's language preference
    const language = useLanguageStore.getState().language;

    // Notify current user if they haven't written
    if (!currentUserHasMessage && userId) {
      console.log('[CoupleSyncStore] Sending reminder to current user:', userId);
      await notifyMissionReminder(userId, partnerNickname, partnerHasMessage, language);
    }

    // Notify partner if they haven't written
    if (!partnerHasMessage && partnerId) {
      console.log('[CoupleSyncStore] Sending reminder to partner:', partnerId);
      await notifyMissionReminder(partnerId, userNickname, currentUserHasMessage, language);
    }
  },

  // Reset all missions (for manual reset from settings)
  resetAllMissions: async () => {
    const { coupleId } = get();

    // Clear local state first
    set({
      sharedMissions: [],
      sharedMissionsDate: null,
      missionGenerationStatus: 'idle',
      activeMissionProgress: null,
      allMissionProgress: [],
      lockedMissionId: null,
      generatingUserId: null,
    });

    // If synced, also delete from database
    if (coupleId && !isInTestMode()) {
      try {
        // Delete active missions from couple_missions table
        await db.coupleMissions.deleteActive(coupleId);

        // Delete today's mission progress
        await db.missionProgress.deleteToday(coupleId);

        // Release any mission lock
        await db.missionLock.release(coupleId);
      } catch (error) {
        console.error('Error resetting missions in database:', error);
      }
    }
  },

  // Check and reset shared missions if date changed (called from missionStore.checkAndResetMissions)
  checkAndResetSharedMissions: () => {
    const { sharedMissionsDate, sharedMissions, allMissionProgress } = get();
    const today = formatDateToLocal(new Date());

    // Reset shared missions if:
    // 1. Date changed (sharedMissionsDate exists but doesn't match today), OR
    // 2. We have missions but no date set (shouldn't happen, but handle gracefully)
    const shouldReset = sharedMissions.length > 0 &&
      (!sharedMissionsDate || sharedMissionsDate !== today);

    if (shouldReset) {
      console.log('[CoupleSyncStore] Resetting shared missions. Old date:', sharedMissionsDate, 'Today:', today);
      set({
        sharedMissions: [],
        sharedMissionsDate: null,
        missionGenerationStatus: 'idle',
        generatingUserId: null,
      });
    }

    // Also reset mission progress if date changed
    const progressFromOtherDays = allMissionProgress.filter(p => p.date !== today);
    if (progressFromOtherDays.length > 0) {
      console.log('[CoupleSyncStore] Date changed, clearing old mission progress');
      const todayProgress = allMissionProgress.filter(p => p.date === today);
      const lockedProgress = todayProgress.find(p => p.is_message_locked);
      set({
        allMissionProgress: todayProgress,
        activeMissionProgress: lockedProgress || todayProgress[0] || null,
        lockedMissionId: lockedProgress?.mission_id || null,
      });
    }
  },

  // ============================================
  // BOOKMARK SYNC
  // ============================================

  addBookmark: async (mission: Mission) => {
    const { coupleId, userId, sharedBookmarks } = get();

    if (!coupleId || !userId || isInTestMode()) {
      // Demo mode: add locally with local state check
      if (sharedBookmarks.length >= 5) {
        return false;
      }
      if (sharedBookmarks.some((b) => b.mission_id === mission.id)) {
        return false;
      }
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

    // Get actual auth.uid() for RLS compliance
    let authUserId = userId;
    if (supabase) {
      const { data: authData } = await supabase.auth.getUser();
      authUserId = authData?.user?.id || userId;
      console.log('[Bookmark] Debug - Store userId:', userId);
      console.log('[Bookmark] Debug - Auth uid:', authUserId);
      console.log('[Bookmark] Debug - coupleId:', coupleId);
    }

    // Try to fetch current bookmarks from DB
    const { data: currentBookmarks, error: fetchError } = await db.coupleBookmarks.getAll(coupleId);

    // Use DB data if available, otherwise fall back to local state
    const bookmarkList = fetchError ? sharedBookmarks : (currentBookmarks || []);

    if (fetchError) {
      console.warn('[Bookmark] DB fetch failed, using local state:', fetchError);
    }

    // Check if already bookmarked (max 5)
    if (bookmarkList.length >= 5) {
      console.log('[Bookmark] Limit reached:', bookmarkList.length);
      return false;
    }

    // Check if already exists
    if (bookmarkList.some((b) => b.mission_id === mission.id)) {
      console.log('[Bookmark] Already bookmarked:', mission.id);
      return false;
    }

    // Try to add to DB - use authUserId for RLS compliance
    const { error } = await db.coupleBookmarks.add(coupleId, mission.id, mission, authUserId);

    if (error) {
      // Offline or DB error - add locally
      console.warn('[Bookmark] DB add failed, adding locally:', error);
      console.warn('[Bookmark] Error code:', error.code, 'Message:', error.message);
      const newBookmark: SyncedBookmark = {
        id: `local-${Date.now()}`,
        couple_id: coupleId,
        mission_id: mission.id,
        mission_data: mission,
        bookmarked_by: authUserId,
        created_at: new Date().toISOString(),
      };
      set({ sharedBookmarks: [newBookmark, ...sharedBookmarks] });
      return true;
    }

    // Success - refresh local state
    await get().loadBookmarks();
    return true;
  },

  removeBookmark: async (missionId: string) => {
    const { coupleId, sharedBookmarks } = get();

    if (!coupleId || isInTestMode()) {
      // Demo mode: remove locally
      set({
        sharedBookmarks: sharedBookmarks.filter((b) => b.mission_id !== missionId),
      });
      return true;
    }

    console.log('[Bookmark] Removing bookmark for mission:', missionId, 'coupleId:', coupleId);

    const { error } = await db.coupleBookmarks.remove(coupleId, missionId);

    if (error) {
      console.warn('[Bookmark] DB remove failed:', error);
      console.warn('[Bookmark] Error code:', error.code, 'Message:', error.message);
      // Still remove locally for better UX
      set({
        sharedBookmarks: sharedBookmarks.filter((b) => b.mission_id !== missionId),
      });
      return false;
    }

    // Success - update local state
    set({
      sharedBookmarks: sharedBookmarks.filter((b) => b.mission_id !== missionId),
    });
    console.log('[Bookmark] Successfully removed bookmark');
    return true;
  },

  loadBookmarks: async () => {
    const { coupleId } = get();
    if (!coupleId || isInTestMode()) return;

    set({ isLoadingBookmarks: true });
    const { data, error } = await db.coupleBookmarks.getAll(coupleId);
    set({ isLoadingBookmarks: false });

    if (!error && data) {
      set({ sharedBookmarks: data as SyncedBookmark[] });
    } else {
      // On error, sync with empty array to clear stale persist data
      set({ sharedBookmarks: [] });
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

    // Create local todo first (optimistic update)
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
  // EXTENDED SYNC - MISSION PROGRESS
  // ============================================

  startMissionProgress: async (missionId: string, missionData: Mission) => {
    const { coupleId, userId, allMissionProgress, lockedMissionId } = get();

    // Check if this mission already has progress
    const existingProgress = allMissionProgress.find(p => p.mission_id === missionId);
    if (existingProgress) {
      console.log('[CoupleSyncStore] Mission already has progress:', missionId);
      return existingProgress;
    }

    // Check if a mission is locked and it's not this one
    if (lockedMissionId && lockedMissionId !== missionId) {
      console.log('[CoupleSyncStore] Cannot start new mission - another mission is locked');
      return null;
    }

    if (!coupleId || !userId || isInTestMode()) {
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
        date: formatDateToLocal(new Date()),
        is_message_locked: false,
      };

      set((state) => ({
        allMissionProgress: [...state.allMissionProgress, progress],
        activeMissionProgress: state.lockedMissionId ? state.activeMissionProgress : progress,
      }));
      return progress;
    }

    const { data, error } = await db.missionProgress.start(coupleId, missionId, missionData, userId);
    if (!error && data) {
      const progress = data as MissionProgress;
      set((state) => ({
        allMissionProgress: [...state.allMissionProgress, progress],
        activeMissionProgress: state.lockedMissionId ? state.activeMissionProgress : progress,
      }));
      return progress;
    }
    return null;
  },

  uploadMissionPhoto: async (photoUrl: string, progressId?: string) => {
    const { activeMissionProgress, allMissionProgress } = get();
    const targetId = progressId || activeMissionProgress?.id;
    const targetProgress = progressId
      ? allMissionProgress.find(p => p.id === progressId)
      : activeMissionProgress;

    if (!targetProgress) return;

    if (isInTestMode()) {
      // Demo mode: update locally
      set((state) => {
        const updatedProgress = {
          ...targetProgress,
          photo_url: photoUrl,
          status: 'message_pending' as MissionProgressStatus,
        };
        const updatedAll = state.allMissionProgress.map(p =>
          p.id === targetProgress.id ? updatedProgress : p
        );
        const lockedProgress = updatedAll.find(p => p.is_message_locked);
        return {
          allMissionProgress: updatedAll,
          activeMissionProgress: lockedProgress || updatedAll[0] || null,
        };
      });
      return;
    }

    await db.missionProgress.uploadPhoto(targetProgress.id, photoUrl);
  },

  submitMissionMessage: async (message: string, progressId?: string) => {
    const { activeMissionProgress, allMissionProgress, userId, lockedMissionId } = get();
    const targetProgress = progressId
      ? allMissionProgress.find(p => p.id === progressId)
      : activeMissionProgress;

    if (!targetProgress || !userId) return;

    // Check if another mission is already locked
    if (lockedMissionId && lockedMissionId !== targetProgress.mission_id) {
      console.log('[CoupleSyncStore] Cannot submit message - another mission is locked');
      return;
    }

    if (isInTestMode()) {
      // Demo mode: update locally
      const isUser1 = targetProgress.user1_id === userId;
      const now = new Date().toISOString();

      const updates: Partial<MissionProgress> = isUser1
        ? { user1_message: message, user1_message_at: now }
        : { user2_id: userId, user2_message: message, user2_message_at: now };

      const hasUser1Message = isUser1 ? true : !!targetProgress.user1_message;
      const hasUser2Message = isUser1 ? !!targetProgress.user2_message : true;

      // Set is_message_locked if this is the first message and no mission is locked yet
      if (!lockedMissionId) {
        updates.is_message_locked = true;
      }

      if (hasUser1Message && hasUser2Message) {
        updates.status = 'completed';
        updates.completed_at = now;

        // Cancel scheduled reminder since mission is completed
        cancelMissionReminderNotification().catch((err) => {
          console.error('[CoupleSyncStore] Failed to cancel reminder notification:', err);
        });
      } else {
        updates.status = 'waiting_partner';
      }

      set((state) => {
        const updatedProgress = { ...targetProgress, ...updates } as MissionProgress;
        const updatedAll = state.allMissionProgress.map(p =>
          p.id === targetProgress.id ? updatedProgress : p
        );
        const newLockedId = updatedProgress.is_message_locked ? updatedProgress.mission_id : state.lockedMissionId;

        return {
          allMissionProgress: updatedAll,
          activeMissionProgress: updatedProgress,
          lockedMissionId: newLockedId,
        };
      });
      return;
    }

    const isUser1 = targetProgress.user1_id === userId;
    await db.missionProgress.submitMessage(targetProgress.id, userId, message, isUser1);
  },

  updateMissionLocation: async (location: string, progressId?: string) => {
    const { activeMissionProgress, allMissionProgress } = get();
    const targetProgress = progressId
      ? allMissionProgress.find(p => p.id === progressId)
      : activeMissionProgress;

    if (!targetProgress) return;

    if (isInTestMode()) {
      // Demo mode: update locally
      set((state) => {
        const updatedProgress = { ...targetProgress, location };
        const updatedAll = state.allMissionProgress.map(p =>
          p.id === targetProgress.id ? updatedProgress : p
        );
        const lockedProgress = updatedAll.find(p => p.is_message_locked);
        return {
          allMissionProgress: updatedAll,
          activeMissionProgress: lockedProgress || updatedAll[0] || null,
        };
      });
      return;
    }

    await db.missionProgress.updateLocation(targetProgress.id, location);
  },

  loadMissionProgress: async () => {
    const { coupleId } = get();
    if (!coupleId || isInTestMode()) return;

    set({ isLoadingProgress: true });

    // Load all mission progress for today
    const { data: allData, error } = await db.missionProgress.getTodayAll(coupleId);
    set({ isLoadingProgress: false });

    if (!error && allData) {
      const allProgress = allData as MissionProgress[];
      const lockedProgress = allProgress.find(p => p.is_message_locked);
      const lockedId = lockedProgress?.mission_id || null;
      const active = lockedProgress || allProgress[0] || null;

      set({
        allMissionProgress: allProgress,
        activeMissionProgress: active,
        lockedMissionId: lockedId,
      });
    }
  },

  cancelMissionProgress: async (progressId?: string) => {
    const { activeMissionProgress, allMissionProgress } = get();
    const targetId = progressId || activeMissionProgress?.id;

    if (!targetId) {
      return;
    }

    // Find the progress to cancel
    const progressToCancel = allMissionProgress.find(p => p.id === targetId);

    if (isInTestMode()) {
      set((state) => {
        const updatedAll = state.allMissionProgress.filter(p => p.id !== targetId);
        const lockedProgress = updatedAll.find(p => p.is_message_locked);
        const active = lockedProgress || updatedAll[0] || null;
        return {
          allMissionProgress: updatedAll,
          activeMissionProgress: active,
          lockedMissionId: lockedProgress?.mission_id || null,
        };
      });
      return;
    }

    // Don't allow canceling a locked mission
    if (progressToCancel?.is_message_locked) {
      console.log('[CoupleSyncStore] Cannot cancel a locked mission');
      return;
    }

    await db.missionProgress.delete(targetId);

    set((state) => {
      const updatedAll = state.allMissionProgress.filter(p => p.id !== targetId);
      const lockedProgress = updatedAll.find(p => p.is_message_locked);
      const active = lockedProgress || updatedAll[0] || null;
      return {
        allMissionProgress: updatedAll,
        activeMissionProgress: active,
        lockedMissionId: lockedProgress?.mission_id || null,
      };
    });
  },

  isUserMessage1Submitter: (progress?: MissionProgress | null) => {
    const { activeMissionProgress, userId } = get();
    const targetProgress = progress ?? activeMissionProgress;
    if (!targetProgress || !userId) return false;
    return targetProgress.user1_id === userId;
  },

  hasUserSubmittedMessage: (progress?: MissionProgress | null) => {
    const { activeMissionProgress, userId } = get();
    const targetProgress = progress ?? activeMissionProgress;
    if (!targetProgress || !userId) return false;

    if (targetProgress.user1_id === userId) {
      return !!targetProgress.user1_message;
    } else {
      return !!targetProgress.user2_message;
    }
  },

  hasPartnerSubmittedMessage: (progress?: MissionProgress | null) => {
    const { activeMissionProgress, userId } = get();
    const targetProgress = progress ?? activeMissionProgress;
    if (!targetProgress || !userId) return false;

    if (targetProgress.user1_id === userId) {
      return !!targetProgress.user2_message;
    } else {
      return !!targetProgress.user1_message;
    }
  },

  // Multi-mission support functions
  getMissionProgressByMissionId: (missionId: string) => {
    const { allMissionProgress } = get();
    return allMissionProgress.find(p => p.mission_id === missionId);
  },

  getLockedMissionProgress: () => {
    const { allMissionProgress } = get();
    return allMissionProgress.find(p => p.is_message_locked) || null;
  },

  isMissionLocked: (missionId: string) => {
    const { lockedMissionId } = get();
    if (!lockedMissionId) return false;
    return lockedMissionId !== missionId;
  },

  canStartNewMission: () => {
    const { lockedMissionId, allMissionProgress } = get();
    // Can start if no mission is locked yet, or if there's a locked mission and we can add photos to other missions
    // Note: Once a mission is locked (first message written), user can't start new missions
    // But they can still take photos for existing started missions
    if (lockedMissionId) {
      // If there's a locked mission, check if it's completed
      const lockedProgress = allMissionProgress.find(p => p.mission_id === lockedMissionId);
      return lockedProgress?.status === 'completed';
    }
    return true;
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

    await db.coupleAlbums.delete(albumId);
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
    const { userId, albumPhotosMap } = get();

    // UUID validation regex
    const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    // Check if memoryId is a valid UUID (sample memories have non-UUID IDs like '1', '2', etc.)
    const isSampleMemory = !isValidUUID(memoryId);

    if (!userId || isInTestMode() || isSampleMemory) {
      // Demo mode or sample memory: add locally only
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

    // Optimistic update: add to local state immediately
    const optimisticPhoto: AlbumPhoto = {
      id: `temp-${Date.now()}`,
      album_id: albumId,
      memory_id: memoryId,
      added_by: userId,
      added_at: new Date().toISOString(),
    };
    const existingPhotos = albumPhotosMap[albumId] || [];
    set({
      albumPhotosMap: {
        ...albumPhotosMap,
        [albumId]: [optimisticPhoto, ...existingPhotos],
      },
    });

    // Perform database insert
    const { data, error } = await db.albumPhotos.add(albumId, memoryId, userId);

    if (error) {
      // Rollback optimistic update on error
      set((state) => ({
        albumPhotosMap: {
          ...state.albumPhotosMap,
          [albumId]: (state.albumPhotosMap[albumId] || []).filter(p => p.id !== optimisticPhoto.id),
        },
      }));
      return;
    }

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
    }
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
}),
  {
    name: 'daydate-couple-sync-storage',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (state) => ({
      // Only persist essential local data
      sharedTodos: state.sharedTodos,
      sharedBookmarks: state.sharedBookmarks,
      coupleAlbums: state.coupleAlbums,
      albumPhotosMap: state.albumPhotosMap,
      backgroundImageUrl: state.backgroundImageUrl,
      menstrualSettings: state.menstrualSettings,
      // Mission state (with date tracking for proper reset)
      sharedMissions: state.sharedMissions,
      sharedMissionsDate: state.sharedMissionsDate,
      // Mission progress state
      allMissionProgress: state.allMissionProgress,
      lockedMissionId: state.lockedMissionId,
    }),
  }
));

export default useCoupleSyncStore;
