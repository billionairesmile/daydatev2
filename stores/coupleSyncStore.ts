import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { db, isInTestMode, supabase } from '@/lib/supabase';
import type { Mission } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useMemoryStore, dbToCompletedMission } from './memoryStore';
import { getTodayInTimezone, getNextMidnightInTimezone, useTimezoneStore, formatDateInTimezone, type TimezoneId } from './timezoneStore';
import { offlineQueue, OfflineOperationType } from '@/lib/offlineQueue';
import { getIsOnline } from '@/lib/useNetwork';
import {
  notifyPartnerMissionGenerated,
  notifyMissionReminder,
  notifyPartnerMessageWritten,
  notifyPartnerPhotoUploaded,
  scheduleMissionReminderNotification,
  cancelMissionReminderNotification,
  scheduleHourlyReminders,
  cancelHourlyReminders,
} from '@/lib/pushNotifications';
import { useLanguageStore } from './languageStore';
import { useSubscriptionStore } from './subscriptionStore';
import { useAuthStore } from './authStore';

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
  completed_at: string | null; // When the bookmarked mission was completed (null = not completed)
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

type MissionGenerationStatus = 'idle' | 'generating' | 'ad_watching' | 'completed';

interface CoupleSyncState {
  // Connection
  isInitialized: boolean;
  coupleId: string | null;
  userId: string | null;

  // Mission sync
  sharedMissions: Mission[];
  sharedMissionsDate: string | null; // Track the date missions were generated (YYYY-MM-DD)
  sharedMissionsRefreshedAt: string | null; // Track when missions were refreshed (synced between users)
  missionsReady: boolean; // Track if mission generator has finished loading images
  missionGenerationStatus: MissionGenerationStatus;
  generatingUserId: string | null;
  lastMissionUpdate: Date | null;

  // Pending missions (waiting for ad completion)
  pendingMissions: Mission[] | null;
  pendingMissionsAnswers: unknown | null;

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

  // Mission sync
  acquireMissionLock: () => Promise<boolean>;
  releaseMissionLock: (status?: 'completed' | 'idle') => Promise<void>;
  broadcastAdCancelled: () => Promise<void>;
  saveSharedMissions: (missions: Mission[], answers: unknown, partnerId?: string, userNickname?: string) => Promise<void>;
  setMissionsReady: () => Promise<void>;
  loadSharedMissions: () => Promise<Mission[] | null>;
  resetAllMissions: () => Promise<void>;
  checkAndResetSharedMissions: () => void;

  // Pending mission management (for ad-gated refresh)
  savePendingMissions: (missions: Mission[], answers: unknown) => Promise<void>;
  commitPendingMissions: (partnerId?: string, userNickname?: string) => Promise<void>;
  rollbackPendingMissions: () => Promise<void>;
  hasPendingMissions: () => boolean;
  setAdWatchingStatus: () => Promise<boolean>;

  // Mission reminder notification
  sendMissionReminderNotifications: (userNickname: string, partnerNickname: string) => Promise<void>;

  // Bookmark sync
  addBookmark: (mission: Mission) => Promise<boolean>;
  removeBookmark: (missionId: string) => Promise<boolean>;
  markBookmarkCompleted: (missionId: string) => Promise<boolean>;
  cleanupCompletedBookmarks: () => Promise<void>;
  loadBookmarks: () => Promise<void>;
  isBookmarked: (missionId: string) => boolean;
  isBookmarkCompleted: (missionId: string) => boolean;

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
  clearMissionProgressByMissionId: (missionId: string) => Promise<void>;

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

  // State setters (for internal use)
  setSharedMissions: (missions: Mission[]) => void;
  setMissionGenerationStatus: (status: MissionGenerationStatus, userId?: string | null) => void;

  // Offline sync
  processPendingOperations: () => Promise<void>;

  // Timezone mismatch detection
  updateDeviceTimezoneAndCheckMismatch: () => Promise<void>;
  dismissTimezoneMismatch: () => void;

  // Heart liked sync
  updateHeartLiked: (liked: boolean) => Promise<void>;
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
let coupleUpdatesChannel: ReturnType<SupabaseClient['channel']> | null = null;

const initialState: CoupleSyncState = {
  isInitialized: false,
  coupleId: null,
  userId: null,
  sharedMissions: [],
  sharedMissionsDate: null,
  sharedMissionsRefreshedAt: null,
  missionsReady: false,
  missionGenerationStatus: 'idle',
  generatingUserId: null,
  lastMissionUpdate: null,
  pendingMissions: null,
  pendingMissionsAnswers: null,
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
      get().loadSharedMissions(),
      get().loadBookmarks(),
      get().loadTodos(),
      get().loadMenstrualSettings(),
      // Extended sync
      get().loadCoupleSettings(),
      get().loadMissionProgress(),
      get().loadAlbums(),
    ]);

    // Update device timezone and check for mismatch
    get().updateDeviceTimezoneAndCheckMismatch();

    // Setup real-time subscriptions
    // 1. Mission subscription
    missionChannel = db.coupleMissions.subscribeToMissions(coupleId, (payload) => {
      const today = getTodayInTimezone();

      // Handle DELETE event - partner has reset missions
      if (payload.eventType === 'DELETE') {
        console.log('[CoupleSyncStore] Received DELETE event - clearing shared missions');
        set({
          sharedMissions: [],
          sharedMissionsDate: null,
          sharedMissionsRefreshedAt: null,
          missionGenerationStatus: 'idle',
          generatingUserId: null,
        });
        return;
      }

      // Handle UPDATE event - missions were updated (e.g., refreshed_at changed or missions_ready changed)
      if (payload.eventType === 'UPDATE') {
        console.log('[CoupleSyncStore] Received UPDATE event');

        // Check if missions_ready flag was updated
        if ('missions_ready' in payload && typeof payload.missions_ready === 'boolean') {
          console.log('[CoupleSyncStore] missions_ready updated to:', payload.missions_ready);
          set({
            missionsReady: payload.missions_ready,
            // When missions become ready, mark generation as completed
            missionGenerationStatus: payload.missions_ready ? 'completed' : get().missionGenerationStatus,
          });
        }

        // Update missions data if present
        if (payload.missions) {
          const missions = payload.missions as Mission[];
          set({
            sharedMissions: missions,
            sharedMissionsRefreshedAt: payload.refreshed_at || null,
            lastMissionUpdate: new Date(),
          });
        }

        return;
      }

      // Handle INSERT event - new missions generated
      const missions = payload.missions as Mission[];
      // CRITICAL: Use the actual mission generation date from realtime payload in couple's timezone
      // This ensures proper date comparison in checkAndResetSharedMissions
      const timezone = useTimezoneStore.getState().getEffectiveTimezone();
      const missionDate = payload.generated_at ? formatDateInTimezone(new Date(payload.generated_at), timezone) : today;
      set({
        sharedMissions: missions,
        sharedMissionsDate: missionDate, // Set the actual date when missions were generated
        sharedMissionsRefreshedAt: payload.refreshed_at || null, // Also include refreshed_at on insert
        missionsReady: payload.missions_ready === true, // Set from payload (should be false initially)
        lastMissionUpdate: new Date(),
        // Keep status as 'generating' until missionsReady becomes true
        // This ensures B continues showing loading state while A loads images
        missionGenerationStatus: payload.missions_ready === true ? 'completed' : 'generating',
        generatingUserId: payload.generated_by,
      });
    });

    // 2. Lock subscription
    lockChannel = db.missionLock.subscribeToLock(coupleId, (payload) => {
      const prevStatus = get().missionGenerationStatus;
      const newStatus = payload.status as MissionGenerationStatus;

      // Detect ad cancellation: status changed from 'ad_watching' to 'idle'
      if (prevStatus === 'ad_watching' && newStatus === 'idle') {
        console.log('[CoupleSyncStore] Partner cancelled ad - reloading missions');
        // Reload missions to ensure both users see the same (old) missions
        get().loadSharedMissions().catch((err) => {
          console.error('[CoupleSyncStore] Failed to reload missions after ad cancellation:', err);
        });
      }

      // Prevent status change from 'ad_watching' to 'generating' for B (partner)
      // B should stay in 'ad_watching' state until missions INSERT event arrives
      // This keeps "Partner watching ad" message consistent
      if (prevStatus === 'ad_watching' && newStatus === 'generating') {
        const currentUserId = useAuthStore.getState().user?.id;
        const isPartnerGenerating = payload.locked_by && payload.locked_by !== currentUserId;

        if (isPartnerGenerating) {
          console.log('[CoupleSyncStore] Partner finished ad and started generating - keeping ad_watching status for B');
          // Don't update status - keep showing "Partner watching ad" message
          // Status will change to 'generating' when missions INSERT event arrives
          return;
        }
      }

      set({
        missionGenerationStatus: newStatus,
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
      const today = getTodayInTimezone();

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

    // 9. Album photos subscription
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

    // 10. Completed missions subscription (for memory sync between devices)
    console.log('[CoupleSyncStore] Setting up completed missions subscription for coupleId:', coupleId);
    // Track processed events to prevent duplicates
    const processedMemoryEvents = new Set<string>();

    completedMissionsChannel = db.completedMissions.subscribeToCompletedMissions(coupleId, (payload) => {
      console.log('[CompletedMissions Realtime] Event received:', payload.eventType);
      const memoryData = payload.memory as Record<string, unknown>;
      const memoryId = memoryData?.id as string;
      console.log('[CompletedMissions Realtime] Memory ID:', memoryId);

      // Deduplicate events
      const eventKey = `${payload.eventType}-${memoryId}`;
      if (processedMemoryEvents.has(eventKey)) {
        console.log('[CompletedMissions Realtime] Skipping duplicate event:', eventKey);
        return;
      }
      processedMemoryEvents.add(eventKey);
      setTimeout(() => processedMemoryEvents.delete(eventKey), 5000);

      const memoryStore = useMemoryStore.getState();

      if (payload.eventType === 'INSERT') {
        // Convert DB format to CompletedMission format using shared converter
        const newMemory = dbToCompletedMission(memoryData);
        console.log('[CompletedMissions Realtime] Converted memory:', newMemory.id, 'photoUrl:', newMemory.photoUrl?.substring(0, 50));

        // Check if memory already exists (avoid duplicates)
        const existingMemories = memoryStore.memories;
        const alreadyExists = existingMemories.some(m => m.id === newMemory.id);
        console.log('[CompletedMissions Realtime] Already exists in store:', alreadyExists, 'Current memories count:', existingMemories.length);

        if (!alreadyExists) {
          console.log('[CompletedMissions Realtime] Adding new memory to store');
          memoryStore.addMemory(newMemory);
          // Verify the memory was added
          const updatedMemories = useMemoryStore.getState().memories;
          console.log('[CompletedMissions Realtime] After addMemory - memories count:', updatedMemories.length);
        }
      } else if (payload.eventType === 'DELETE') {
        console.log('[CompletedMissions Realtime] Deleting memory:', memoryId);
        if (memoryId) {
          memoryStore.deleteMemory(memoryId);
        }
      }
    });

    // 11. Couple updates subscription (for timezone sync, disconnection detection, and heart liked sync)
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
    if (coupleUpdatesChannel) {
      db.couples.unsubscribeFromCoupleUpdates(coupleUpdatesChannel);
      coupleUpdatesChannel = null;
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

  // Broadcast ad cancellation to partner (releases lock to 'idle')
  // Partner's lock subscription will detect this and can trigger UI reset
  broadcastAdCancelled: async () => {
    const { coupleId } = get();
    if (!coupleId || isInTestMode()) return;

    await db.missionLock.release(coupleId, 'idle');
    console.log('[CoupleSyncStore] Broadcast ad cancelled via lock release');
  },

  // Set missions ready flag (when mission generator has loaded all images)
  // This signals to partner that missions are ready to display
  setMissionsReady: async () => {
    const { coupleId } = get();
    if (!coupleId || isInTestMode() || !supabase) return;

    console.log('[CoupleSyncStore] Setting missions_ready flag');

    // Update local state first
    set({ missionsReady: true });

    // Then update database to notify partner via Realtime
    const { error } = await supabase
      .from('couple_missions')
      .update({ missions_ready: true })
      .eq('couple_id', coupleId)
      .eq('status', 'active');

    if (error) {
      console.error('[CoupleSyncStore] Failed to set missions_ready:', error);
      // Rollback local state on error
      set({ missionsReady: false });
    }
  },

  // Set ad watching status (when user is watching rewarded ad before mission generation)
  // This is a lightweight lock that doesn't save any pending missions
  // Partner sees this status and knows to wait, but keeps their existing mission cards
  setAdWatchingStatus: async () => {
    const { coupleId, userId } = get();

    if (!coupleId || !userId || isInTestMode()) {
      set({
        missionGenerationStatus: 'ad_watching',
        generatingUserId: userId,
      });
      return true;
    }

    // Update lock table with ad_watching status (no missions, just status)
    const { error } = await db.missionLock.updateStatus(coupleId, 'ad_watching', userId);

    if (error) {
      console.error('[CoupleSyncStore] Failed to set ad_watching status:', error);
      return false;
    }

    set({
      missionGenerationStatus: 'ad_watching',
      generatingUserId: userId,
    });

    console.log('[CoupleSyncStore] Set ad_watching status - partner will see waiting state');
    return true;
  },

  // ============================================
  // PENDING MISSION MANAGEMENT (for ad-gated refresh)
  // ============================================

  savePendingMissions: async (missions: Mission[], answers: unknown) => {
    const { coupleId, userId } = get();

    if (!coupleId || !userId || isInTestMode()) {
      // Test mode: save locally only
      set({
        pendingMissions: missions,
        pendingMissionsAnswers: answers,
        missionGenerationStatus: 'ad_watching',
        generatingUserId: userId,
      });
      return;
    }

    // Update lock table with pending status and missions
    const { error } = await db.missionLock.updatePending(coupleId, missions, answers, userId);

    if (error) {
      console.error('[CoupleSyncStore] Failed to save pending missions:', error);
    }

    set({
      pendingMissions: missions,
      pendingMissionsAnswers: answers,
      missionGenerationStatus: 'ad_watching',
      generatingUserId: userId,
    });

    console.log('[CoupleSyncStore] Saved pending missions, waiting for ad completion');
  },

  commitPendingMissions: async (partnerId?: string, userNickname?: string) => {
    const { pendingMissions, pendingMissionsAnswers } = get();

    if (!pendingMissions || pendingMissions.length === 0) {
      console.warn('[CoupleSyncStore] No pending missions to commit');
      return;
    }

    console.log('[CoupleSyncStore] Committing pending missions to active');

    // Use existing saveSharedMissions with pending data
    await get().saveSharedMissions(
      pendingMissions,
      pendingMissionsAnswers,
      partnerId,
      userNickname
    );

    // Clear pending state
    set({
      pendingMissions: null,
      pendingMissionsAnswers: null,
    });

    console.log('[CoupleSyncStore] Pending missions committed successfully');
  },

  rollbackPendingMissions: async () => {
    const { coupleId } = get();

    console.log('[CoupleSyncStore] Rolling back pending missions');

    // Clear local pending state
    set({
      pendingMissions: null,
      pendingMissionsAnswers: null,
      missionGenerationStatus: 'idle',
      generatingUserId: null,
    });

    // Clear pending data and release lock in DB
    if (coupleId && !isInTestMode()) {
      await db.missionLock.clearPending(coupleId);
      await db.missionLock.release(coupleId, 'idle');
    }

    console.log('[CoupleSyncStore] Pending missions rolled back');
  },

  hasPendingMissions: () => {
    const { pendingMissions } = get();
    return pendingMissions !== null && pendingMissions.length > 0;
  },

  saveSharedMissions: async (missions: Mission[], answers: unknown, partnerId?: string, userNickname?: string) => {
    const { coupleId, userId } = get();
    const today = getTodayInTimezone();

    if (!coupleId || !userId || isInTestMode()) {
      set({ sharedMissions: missions, sharedMissionsDate: today, sharedMissionsRefreshedAt: null, lastMissionUpdate: new Date() });
      return;
    }

    // Expire old missions first, then delete expired ones to prevent data bloat
    // Note: expireOld now uses server time to prevent client time manipulation
    await db.coupleMissions.expireOld(coupleId);
    await db.coupleMissions.deleteExpired(coupleId);

    // SECURITY: Check if active missions already exist (using server time)
    // This prevents time manipulation abuse where user advances device time to reset,
    // then reverts time to generate new missions
    const { data: existingMissions } = await db.coupleMissions.getToday(coupleId);
    if (existingMissions) {
      console.warn('[CoupleSyncStore] Active missions already exist');
      console.warn('[CoupleSyncStore] Existing missions:', {
        id: existingMissions.id,
        generated_at: existingMissions.generated_at,
        expires_at: existingMissions.expires_at,
        generated_by: existingMissions.generated_by,
        mission_count: (existingMissions.missions as Mission[]).length,
      });

      // Check if this is a refresh scenario (missionGenerationStatus was 'ad_watching' or 'generating')
      // In refresh mode, we want to replace old missions with new ones
      const currentStatus = get().missionGenerationStatus;
      const isRefreshMode = currentStatus === 'ad_watching' || currentStatus === 'generating';

      if (isRefreshMode) {
        console.log('[CoupleSyncStore] Refresh mode detected - deleting old active missions before creating new ones');
        // Delete old active missions to allow new ones
        const { error: deleteError } = await db.coupleMissions.deleteActive(coupleId);
        if (deleteError) {
          console.error('[CoupleSyncStore] Failed to delete old missions:', deleteError);
          // Continue anyway - the insert might fail with duplicate constraint
        }
      } else {
        console.log('[CoupleSyncStore] Not refresh mode - loading existing missions');
        // Load existing missions instead of creating new ones
        set({
          sharedMissions: existingMissions.missions as Mission[],
          sharedMissionsDate: today,
          missionGenerationStatus: 'completed',
        });
        return;
      }
    }

    // Calculate expiration time based on couple's timezone setting
    const expiresAt = getNextMidnightInTimezone();
    console.log('[CoupleSyncStore] Mission expires at (UTC):', expiresAt, 'Timezone:', useTimezoneStore.getState().getEffectiveTimezone());

    // Save new missions with timezone-aware expiration
    const { error } = await db.coupleMissions.create(coupleId, missions, answers, userId, expiresAt);
    if (!error) {
      set({
        sharedMissions: missions,
        sharedMissionsDate: today,
        sharedMissionsRefreshedAt: null, // Reset refreshed state for new missions
        missionsReady: false, // A will set to true after loading images
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
    const { coupleId, isLoadingMissions, sharedMissions: existingMissions, sharedMissionsDate: existingDate } = get();
    if (!coupleId || isInTestMode()) return null;

    // Guard against concurrent calls - if already loading, return existing missions
    // This prevents race conditions when app comes to foreground multiple times quickly
    if (isLoadingMissions) {
      console.log('[CoupleSyncStore] loadSharedMissions already in progress, skipping');
      return existingMissions.length > 0 ? existingMissions : null;
    }

    set({ isLoadingMissions: true });

    const today = getTodayInTimezone();

    try {
      const { data, error } = await db.coupleMissions.getToday(coupleId);

      if (!error && data) {
        const missions = data.missions as Mission[];
        const refreshedAt = (data as { refreshed_at?: string }).refreshed_at || null;
        // CRITICAL: Use the actual mission generation date from DB in couple's timezone
        // This ensures proper date comparison in checkAndResetSharedMissions
        const timezone = useTimezoneStore.getState().getEffectiveTimezone();
        const missionDate = data.generated_at ? formatDateInTimezone(new Date(data.generated_at), timezone) : today;
        // Preserve ad_watching/generating status - don't override with 'completed'
        // when partner is actively watching ad or generating missions
        const currentStatus = get().missionGenerationStatus;
        const preserveStatus = currentStatus === 'ad_watching' || currentStatus === 'generating';
        set({
          sharedMissions: missions,
          sharedMissionsDate: missionDate,
          sharedMissionsRefreshedAt: refreshedAt,
          lastMissionUpdate: new Date(data.generated_at),
          missionGenerationStatus: preserveStatus ? currentStatus : 'completed',
          generatingUserId: preserveStatus ? get().generatingUserId : data.generated_by,
          isLoadingMissions: false,
        });

        // FALLBACK: When status is NOT preserved (idle/completed), check lock table
        // to catch partner's ad_watching/generating that was missed by Realtime
        // (e.g., iOS WebSocket dropped while app was backgrounded)
        if (!preserveStatus) {
          try {
            const { data: lockData } = await db.missionLock.getStatus(coupleId);
            // Only fall back to 'generating' status, NOT 'ad_watching'
            // ad_watching should only be set via Realtime subscription for freshness
            // Re-setting ad_watching from DB fallback causes infinite loops when
            // partner force-closes app (stale lock stays in DB, gets re-read on every loadSharedMissions)
            if (lockData && lockData.status === 'generating') {
              const lockTime = lockData.locked_at ? new Date(lockData.locked_at) : null;
              const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
              const currentUserId = get().userId;

              // Only apply if lock is fresh (<5min) and belongs to partner (not self)
              if (lockTime && lockTime > fiveMinutesAgo && lockData.locked_by && lockData.locked_by !== currentUserId) {
                console.log('[CoupleSyncStore] Lock fallback: detected partner generating via DB check');
                set({
                  missionGenerationStatus: 'generating',
                  generatingUserId: lockData.locked_by,
                });
              }
            }
          } catch (lockError) {
            console.log('[CoupleSyncStore] Lock fallback check failed:', lockError);
          }
        }

        return missions;
      }

      // No missions found for today from database
      // DEFENSIVE: Only clear local state if we're ABSOLUTELY confident the missions are truly gone
      // Priority: Preserve user experience over strict DB consistency
      if (!error && !data) {
        // Re-fetch current state to avoid stale closure issues
        const currentState = get();
        const localMissions = currentState.sharedMissions;
        const localDate = currentState.sharedMissionsDate;
        const isLocalMissionsFromToday = localDate === today;

        if (localMissions.length > 0) {
          // ALWAYS preserve local missions if they exist
          // This prevents the "disappearing cards" bug on older devices with memory pressure
          console.log('[CoupleSyncStore] DB returned null but local missions exist, preserving local state');

          // If date doesn't match but missions exist, update the date to today
          // This handles edge cases from timezone changes or partial rehydration
          if (!isLocalMissionsFromToday) {
            console.log('[CoupleSyncStore] Updating stale date to today while preserving missions');
            set({ sharedMissionsDate: today });
          }
        } else if (!isLocalMissionsFromToday && localDate !== null) {
          // Only clear if: no local missions AND date is from a different day
          console.log('[CoupleSyncStore] No local missions and date is stale, clearing state');
          set({
            sharedMissions: [],
            sharedMissionsDate: null,
            missionGenerationStatus: 'idle',
            generatingUserId: null,
          });
        }
        // If localMissions is empty and localDate is null, do nothing - state is already clean
      }

      // Check lock status, but be defensive about stale locks
      const { data: lockData } = await db.missionLock.getStatus(coupleId);
      if (lockData && lockData.status === 'generating') {
        // Only respect the lock if it's recent (within last 5 minutes)
        // This prevents stale "generating" locks from hiding the generate button
        const lockTime = lockData.locked_at ? new Date(lockData.locked_at) : null;
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        if (lockTime && lockTime > fiveMinutesAgo) {
          set({
            missionGenerationStatus: 'generating',
            generatingUserId: lockData.locked_by,
          });
        } else {
          // Stale lock detected - release it
          console.log('[CoupleSyncStore] Stale generating lock detected, releasing');
          await db.missionLock.release(coupleId, 'idle');
          set({
            missionGenerationStatus: 'idle',
            generatingUserId: null,
          });
        }
      }

      // Handle 'ad_watching' status (when partner is watching ad or user closed app during ad)
      // Uses 3-minute timeout since ads typically complete within 30 seconds to 2 minutes
      if (lockData && lockData.status === 'ad_watching') {
        const lockTime = lockData.locked_at ? new Date(lockData.locked_at) : null;
        const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);

        if (lockTime && lockTime > threeMinutesAgo) {
          // Lock is fresh (< 3 min) - partner might still be watching ad
          // Set state so UI shows loading/waiting state
          set({
            missionGenerationStatus: 'ad_watching',
            generatingUserId: lockData.locked_by,
          });
        } else {
          // Lock is stale (> 3 min) - ad viewing was likely abandoned
          console.log('[CoupleSyncStore] Stale ad_watching lock detected (>3min), cleaning up');
          await db.missionLock.clearPending(coupleId);
          await db.missionLock.release(coupleId, 'idle');
          set({
            missionGenerationStatus: 'idle',
            generatingUserId: null,
            pendingMissions: null,
            pendingMissionsAnswers: null,
          });
        }
      }

      return null;
    } finally {
      set({ isLoadingMissions: false });
    }
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
    const today = getTodayInTimezone();
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

  // Reset all missions (for manual reset from settings or mission refresh)
  // IMPORTANT: Preserves locked mission progress to prevent starting new missions while one is in progress
  resetAllMissions: async () => {
    const { coupleId, lockedMissionId, allMissionProgress, activeMissionProgress } = get();

    // Check if there's a mission in progress that should be preserved
    const lockedProgress = lockedMissionId
      ? allMissionProgress.find((p) => p.mission_id === lockedMissionId)
      : null;
    const shouldPreserveLock =
      lockedMissionId && lockedProgress && lockedProgress.status !== 'completed';

    console.log('[CoupleSyncStore] resetAllMissions - shouldPreserveLock:', shouldPreserveLock, 'lockedMissionId:', lockedMissionId);

    // Clear local state (but preserve locked mission progress if in progress)
    set({
      sharedMissions: [],
      sharedMissionsDate: null,
      missionGenerationStatus: 'idle',
      generatingUserId: null,
      // Preserve locked mission data if mission is still in progress
      activeMissionProgress: shouldPreserveLock ? activeMissionProgress : null,
      allMissionProgress: shouldPreserveLock && lockedProgress ? [lockedProgress] : [],
      lockedMissionId: shouldPreserveLock ? lockedMissionId : null,
    });

    // If synced, also delete from database
    if (coupleId && !isInTestMode()) {
      try {
        // Delete active missions from couple_missions table
        await db.coupleMissions.deleteActive(coupleId);

        // Only delete mission progress if no locked mission to preserve
        if (!shouldPreserveLock) {
          await db.missionProgress.deleteToday(coupleId);
        }

        // Release any mission lock
        await db.missionLock.release(coupleId);
      } catch (error) {
        console.error('Error resetting missions in database:', error);
      }
    }
  },

  // Check and reset shared missions if date changed (called from missionStore.checkAndResetMissions)
  checkAndResetSharedMissions: () => {
    const { sharedMissionsDate, sharedMissions, allMissionProgress, lastMissionUpdate, sharedBookmarks } = get();
    const today = getTodayInTimezone();

    // Check if date changed in the user's effective timezone
    const dateChanged = sharedMissionsDate !== null && sharedMissionsDate !== today;

    // IMPORTANT: If sharedMissionsDate is null but missions exist, we should NOT reset
    // This protects against hydration timing issues or partial state restoration
    // Trust the timezone-aware date comparison for midnight resets
    const shouldReset = sharedMissions.length > 0 && dateChanged;

    if (shouldReset) {
      const generatedAtMs = lastMissionUpdate?.getTime() || 0;
      const nowMs = Date.now();
      console.log('[CoupleSyncStore] Resetting shared missions - date changed.');
      console.log('[CoupleSyncStore] - Date:', sharedMissionsDate, '→', today);
      console.log('[CoupleSyncStore] - Hours since generation:', Math.floor((nowMs - generatedAtMs) / (60 * 60 * 1000)));
      set({
        sharedMissions: [],
        sharedMissionsDate: null,
        missionGenerationStatus: 'idle',
        generatingUserId: null,
      });
    }

    // If missions exist but date is null (shouldn't happen normally), set the date to today
    // This helps recover from partial state issues
    if (sharedMissions.length > 0 && sharedMissionsDate === null) {
      console.log('[CoupleSyncStore] Missions exist but date is null, setting date to today');
      set({ sharedMissionsDate: today });
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

    // Cleanup completed bookmarks (remove bookmarks completed before today)
    // This should run regardless of whether mission date changed
    console.log('[CoupleSyncStore] checkAndResetSharedMissions - checking bookmarks:', sharedBookmarks.length);

    if (sharedBookmarks.length > 0) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      console.log('[CoupleSyncStore] Today start (local):', todayStart.toISOString());

      const activeBookmarks = sharedBookmarks.filter((b) => {
        // Keep non-completed bookmarks
        if (!b.completed_at) {
          console.log('[CoupleSyncStore] Bookmark not completed, keeping:', b.mission_id);
          return true;
        }

        // Parse completed_at as Date and compare with today's start in user's timezone
        const completedAt = new Date(b.completed_at);
        const shouldKeep = completedAt >= todayStart;
        console.log('[CoupleSyncStore] Bookmark completed_at:', b.completed_at,
          '| completedAt:', completedAt.toISOString(),
          '| shouldKeep:', shouldKeep);

        // Keep only if completed today (on or after midnight), remove if completed before today
        return shouldKeep;
      });

      if (activeBookmarks.length !== sharedBookmarks.length) {
        const removedCount = sharedBookmarks.length - activeBookmarks.length;
        console.log(`[CoupleSyncStore] Cleaned up ${removedCount} completed bookmarks from previous days`);
        set({ sharedBookmarks: activeBookmarks });

        // Also trigger DB cleanup (async, don't wait)
        get().cleanupCompletedBookmarks().catch((err) => {
          console.warn('[CoupleSyncStore] Failed to cleanup bookmarks in DB:', err);
        });
      } else {
        console.log('[CoupleSyncStore] No bookmarks to cleanup');
      }
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
        completed_at: null,
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

    // Check if bookmark limit reached (premium: unlimited, free: max 5)
    const { canBookmarkMission } = useSubscriptionStore.getState();
    if (!canBookmarkMission(bookmarkList.length)) {
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
        completed_at: null,
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

    // First, clear any in-progress mission data for this mission
    // This ensures the locked state is reset when deleting a bookmarked mission
    await get().clearMissionProgressByMissionId(missionId);

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

    // First, cleanup any expired completed bookmarks
    await db.coupleBookmarks.cleanupCompleted(coupleId).catch((err) => {
      console.warn('[Bookmark] Failed to cleanup completed bookmarks:', err);
    });

    // Then load the remaining bookmarks
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

  isBookmarkCompleted: (missionId: string) => {
    const bookmark = get().sharedBookmarks.find((b) => b.mission_id === missionId);
    return bookmark?.completed_at !== null && bookmark?.completed_at !== undefined;
  },

  // Mark a bookmark as completed (will be removed at midnight when date changes)
  markBookmarkCompleted: async (missionId: string) => {
    const { coupleId, sharedBookmarks } = get();

    if (!coupleId || isInTestMode()) {
      // Demo mode: update local state only
      set({
        sharedBookmarks: sharedBookmarks.map((b) =>
          b.mission_id === missionId
            ? { ...b, completed_at: new Date().toISOString() }
            : b
        ),
      });
      return true;
    }

    console.log('[Bookmark] Marking bookmark as completed:', missionId);

    const { data, error } = await db.coupleBookmarks.markCompleted(coupleId, missionId);

    if (error) {
      console.error('[Bookmark] DB mark completed failed:', error);
      // Still update local state even if DB fails
      set({
        sharedBookmarks: sharedBookmarks.map((b) =>
          b.mission_id === missionId
            ? { ...b, completed_at: new Date().toISOString() }
            : b
        ),
      });
      return false;
    }

    // Check if bookmark actually existed and was updated
    if (!data || data.length === 0) {
      console.log('[Bookmark] Mission was not in bookmarks, skipping mark completed');
      return true; // Not an error - just wasn't bookmarked
    }

    // Success - update local state
    set({
      sharedBookmarks: sharedBookmarks.map((b) =>
        b.mission_id === missionId
          ? { ...b, completed_at: new Date().toISOString() }
          : b
      ),
    });
    console.log('[Bookmark] Successfully marked bookmark as completed:', data.length, 'bookmark(s)');
    return true;
  },

  // Cleanup completed bookmarks when date changes (at midnight)
  cleanupCompletedBookmarks: async () => {
    const { coupleId, sharedBookmarks } = get();

    if (!coupleId || isInTestMode()) {
      // Demo mode: cleanup locally - remove bookmarks completed before today
      const now = new Date();
      const todayMidnight = new Date(now);
      todayMidnight.setHours(0, 0, 0, 0);

      set({
        sharedBookmarks: sharedBookmarks.filter((b) => {
          if (!b.completed_at) return true; // Keep non-completed bookmarks
          const completedDate = new Date(b.completed_at);
          // Keep only if completed today or later
          return completedDate >= todayMidnight;
        }),
      });
      return;
    }

    console.log('[Bookmark] Cleaning up completed bookmarks...');

    const { data, error } = await db.coupleBookmarks.cleanupCompleted(coupleId);

    if (error) {
      console.warn('[Bookmark] DB cleanup failed:', error);
      return;
    }

    // Reload bookmarks to get updated list
    await get().loadBookmarks();
    console.log('[Bookmark] Cleanup complete, removed:', data);
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
        date: getTodayInTimezone(),
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
    const { activeMissionProgress, allMissionProgress, lockedMissionId } = get();
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

    // Only schedule hourly reminders and notify partner if:
    // 1. No mission is locked yet, OR
    // 2. This mission is the locked mission
    // Don't schedule reminders for non-locked missions when another mission is locked
    const shouldScheduleReminders = !lockedMissionId || lockedMissionId === targetProgress.mission_id;

    if (shouldScheduleReminders) {
      const language = useLanguageStore.getState().language;
      const { userId } = get();
      const currentUserNickname = useAuthStore.getState().user?.nickname || '';

      // Get partner info for notifications
      if (userId && targetProgress) {
        const isUser1 = targetProgress.user1_id === userId;
        const partnerId = isUser1 ? targetProgress.user2_id : targetProgress.user1_id;

        if (partnerId) {
          // Fetch partner nickname for hourly reminders
          db.profiles.get(partnerId).then(({ data: partnerProfile }) => {
            const partnerNickname = partnerProfile?.nickname || '';

            // Schedule local hourly reminders for current user with partner's nickname
            scheduleHourlyReminders(partnerNickname, language).catch((err) => {
              console.error('[CoupleSyncStore] Failed to schedule hourly reminders:', err);
            });
          }).catch((err) => {
            console.error('[CoupleSyncStore] Failed to get partner profile:', err);
            // Fallback: schedule without nickname
            scheduleHourlyReminders('', language).catch((err2) => {
              console.error('[CoupleSyncStore] Failed to schedule hourly reminders:', err2);
            });
          });

          // Send push notification to partner with mission ID for deep linking
          notifyPartnerPhotoUploaded(partnerId, currentUserNickname, language, targetProgress.mission_id).catch((err) => {
            console.error('[CoupleSyncStore] Failed to notify partner of photo upload:', err);
          });
        }
      }
    } else {
      console.log('[CoupleSyncStore] Skipping hourly reminders - another mission is locked');
    }
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

    // Get user info for notifications
    const language = useLanguageStore.getState().language;
    const currentUserNickname = useAuthStore.getState().user?.nickname || '';
    const isUser1 = targetProgress.user1_id === userId;
    const partnerId = isUser1 ? targetProgress.user2_id : targetProgress.user1_id;

    // Check if both will have messages after this submission
    const hasUser1Message = isUser1 ? true : !!targetProgress.user1_message;
    const hasUser2Message = isUser1 ? !!targetProgress.user2_message : true;
    const willBeCompleted = hasUser1Message && hasUser2Message;

    if (isInTestMode()) {
      // Demo mode: update locally
      const now = new Date().toISOString();

      const updates: Partial<MissionProgress> = isUser1
        ? { user1_message: message, user1_message_at: now }
        : { user2_id: userId, user2_message: message, user2_message_at: now };

      // Set is_message_locked if this is the first message and no mission is locked yet
      if (!lockedMissionId) {
        updates.is_message_locked = true;
      }

      if (willBeCompleted) {
        updates.status = 'completed';
        updates.completed_at = now;

        // Cancel all scheduled reminders since mission is completed
        Promise.all([
          cancelMissionReminderNotification(),
          cancelHourlyReminders(),
        ]).catch((err) => {
          console.error('[CoupleSyncStore] Failed to cancel reminder notifications:', err);
        });

        // Mark bookmark as completed (will be removed at midnight when date changes)
        get().markBookmarkCompleted(targetProgress.mission_id).catch((err) => {
          console.warn('[CoupleSyncStore] Failed to mark bookmark as completed:', err);
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

    await db.missionProgress.submitMessage(targetProgress.id, userId, message, isUser1);

    // Handle notifications after message submission
    if (willBeCompleted) {
      // Mission is completed - cancel all reminders
      Promise.all([
        cancelMissionReminderNotification(),
        cancelHourlyReminders(),
      ]).catch((err) => {
        console.error('[CoupleSyncStore] Failed to cancel reminder notifications:', err);
      });

      // Mark bookmark as completed (will be removed at midnight when date changes)
      get().markBookmarkCompleted(targetProgress.mission_id).catch((err) => {
        console.warn('[CoupleSyncStore] Failed to mark bookmark as completed:', err);
      });
    } else if (partnerId) {
      // Mission not complete yet - notify partner that message was written with mission ID for deep linking
      notifyPartnerMessageWritten(partnerId, currentUserNickname, language, targetProgress.mission_id).catch((err) => {
        console.error('[CoupleSyncStore] Failed to send partner message notification:', err);
      });
    }
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
    const { coupleId, userId } = get();
    if (!coupleId || isInTestMode()) return;

    set({ isLoadingProgress: true });

    // First, cleanup expired incomplete missions and their photos from storage
    // This runs on app startup to prevent orphaned files from accumulating
    db.missionProgress.deleteExpiredIncomplete(coupleId).catch((err) => {
      console.warn('[CoupleSyncStore] Failed to cleanup expired missions:', err);
    });

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

      // Schedule hourly reminders if there's a relevant mission with photo but no message from current user
      // Only for the locked mission (or first mission if none locked)
      const relevantProgress = lockedProgress || allProgress[0];
      if (relevantProgress && userId) {
        const hasPhoto = !!relevantProgress.photo_url;
        const isUser1 = relevantProgress.user1_id === userId;
        const currentUserHasMessage = isUser1
          ? !!relevantProgress.user1_message
          : !!relevantProgress.user2_message;
        const isCompleted = relevantProgress.status === 'completed';

        // Schedule reminders if: has photo, not completed, current user hasn't written message
        if (hasPhoto && !isCompleted && !currentUserHasMessage) {
          const language = useLanguageStore.getState().language;
          const partnerId = isUser1 ? relevantProgress.user2_id : relevantProgress.user1_id;

          // Fetch partner nickname for hourly reminders
          if (partnerId) {
            db.profiles.get(partnerId).then(({ data: partnerProfile }) => {
              const partnerNickname = partnerProfile?.nickname || '';
              scheduleHourlyReminders(partnerNickname, language).catch((err) => {
                console.error('[CoupleSyncStore] Failed to schedule hourly reminders on load:', err);
              });
            }).catch((err) => {
              console.error('[CoupleSyncStore] Failed to get partner profile on load:', err);
              // Fallback: schedule without nickname
              scheduleHourlyReminders('', language).catch((err2) => {
                console.error('[CoupleSyncStore] Failed to schedule hourly reminders on load:', err2);
              });
            });
          }
        } else if (isCompleted) {
          // Cancel reminders if mission is already completed
          cancelHourlyReminders().catch((err) => {
            console.error('[CoupleSyncStore] Failed to cancel hourly reminders on load:', err);
          });
        }
      }
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

  // Clear mission progress when a bookmarked mission is deleted
  // This resets the locked state and allows starting new missions
  clearMissionProgressByMissionId: async (missionId: string) => {
    const { coupleId, allMissionProgress, lockedMissionId } = get();

    // Find the progress for this mission
    const progressToDelete = allMissionProgress.find(p => p.mission_id === missionId);

    if (!progressToDelete) {
      console.log('[CoupleSyncStore] No progress found for mission:', missionId);
      return; // No progress data, nothing to clear
    }

    console.log('[CoupleSyncStore] Clearing mission progress for:', missionId, 'progressId:', progressToDelete.id);

    // Delete from DB if not in test mode
    if (coupleId && !isInTestMode()) {
      const { error } = await db.missionProgress.delete(progressToDelete.id);
      if (error) {
        console.error('[CoupleSyncStore] Failed to delete mission progress from DB:', error);
        // Continue with local cleanup even if DB fails
      }
    }

    // Update local state
    set((state) => {
      const updatedAll = state.allMissionProgress.filter(p => p.mission_id !== missionId);
      const lockedProgress = updatedAll.find(p => p.is_message_locked);
      const active = lockedProgress || updatedAll[0] || null;

      return {
        allMissionProgress: updatedAll,
        activeMissionProgress: active,
        lockedMissionId: lockedProgress?.mission_id || null,
      };
    });

    // If the deleted mission was the locked mission, cancel scheduled notifications
    if (lockedMissionId === missionId) {
      console.log('[CoupleSyncStore] Deleted mission was locked, canceling notifications');
      Promise.all([
        cancelMissionReminderNotification(),
        cancelHourlyReminders(),
      ]).catch(err => {
        console.warn('[CoupleSyncStore] Failed to cancel notifications:', err);
      });
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
      sharedBookmarks: state.sharedBookmarks,
      coupleAlbums: state.coupleAlbums,
      albumPhotosMap: state.albumPhotosMap,
      backgroundImageUrl: state.backgroundImageUrl,
      menstrualSettings: state.menstrualSettings,
      // Mission state (with date tracking for proper reset)
      sharedMissions: state.sharedMissions,
      sharedMissionsDate: state.sharedMissionsDate,
      // Mission generation status - persist to prevent state loss on memory pressure
      // Only persist 'completed' status (not 'idle' or 'generating') to avoid stale states
      missionGenerationStatus: state.sharedMissions.length > 0 ? 'completed' : state.missionGenerationStatus,
      // Mission progress state
      allMissionProgress: state.allMissionProgress,
      lockedMissionId: state.lockedMissionId,
    }),
  }
));

export default useCoupleSyncStore;
