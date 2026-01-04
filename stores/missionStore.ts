import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import type { DailyMission, Mission, MissionState, KeptMission, TodayCompletedMission } from '@/types';
import { generateMissionsWithAI, generateMissionsFallback, type MissionHistorySummary, type ExcludedMission, type CustomAnniversaryForMission } from '@/services/missionGenerator';
import { anniversaryService } from '@/services/anniversaryService';
import { db, isDemoMode } from '@/lib/supabase';
import {
  useOnboardingStore,
  type OnboardingData,
  type ActivityType,
  type DateWorry,
  type Constraint,
} from '@/stores/onboardingStore';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
import { getTodayInTimezone } from '@/stores/timezoneStore';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import {
  checkLocationPermission,
  requestLocationPermission,
  updateUserLocationInDB,
  getCurrentLocation,
  type UserLocation,
} from '@/lib/locationUtils';

// Helper to get today's date string in YYYY-MM-DD format
const getTodayDateString = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// Mission generation types
export type TodayMood = 'fun' | 'deep_talk' | 'romantic' | 'healing' | 'adventure' | 'active' | 'culture';
export type AvailableTime = '30min' | '1hour' | '2hour' | 'allday';

export interface MissionGenerationAnswers {
  canMeetToday: boolean;
  availableTime: AvailableTime;
  todayMoods: TodayMood[];
}

export const TIME_OPTIONS: { id: AvailableTime; label: string }[] = [
  { id: '30min', label: '30분' },
  { id: '1hour', label: '1시간' },
  { id: '2hour', label: '2시간 +' },
  { id: 'allday', label: '하루종일' },
];

export interface GeneratedMissionData {
  missions: Mission[];
  generatedDate: string;
  answers: MissionGenerationAnswers;
}

// In-progress mission data for persistence across navigation
export interface InProgressMissionData {
  missionId: string;
  capturedPhoto: string | null;
  user1Message: string | null;
  user2Message: string | null;
  date: string;
}

export const MOOD_OPTIONS: { id: TodayMood; label: string; icon: string }[] = [
  { id: 'fun', label: '웃고 싶어요', icon: '😆' },
  { id: 'deep_talk', label: '대화가 필요해', icon: '💬' },
  { id: 'active', label: '활동·에너지', icon: '🏃🏻' },
  { id: 'healing', label: '휴식·힐링', icon: '🌿' },
  { id: 'culture', label: '문화·감성', icon: '📸' },
  { id: 'adventure', label: '새로운 도전', icon: '🔥' },
  { id: 'romantic', label: '로맨틱', icon: '💕' },
];

interface MissionActions {
  setDailyMission: (mission: DailyMission | null) => void;
  setMissionHistory: (history: DailyMission[]) => void;
  addToHistory: (mission: DailyMission) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  completeMission: (missionId: string) => void;
  skipMission: (missionId: string) => void;
  // Keep mission actions
  keepMission: (mission: Mission) => boolean;
  removeKeptMission: (missionId: string) => void;
  removeKeptMissionByKeptId: (keptId: string) => void;
  isKeptMission: (missionId: string) => boolean;
  // Daily completion actions
  completeTodayMission: (missionId: string) => void;
  hasTodayCompletedMission: () => boolean;
  canStartMission: (missionId: string) => boolean;
  getTodayCompletedMissionId: () => string | null;
  isTodayCompletedMission: (missionId: string) => boolean;
  // Mission generation actions
  generateTodayMissions: (answers: MissionGenerationAnswers, excludedMissions?: ExcludedMission[]) => Promise<{ status: 'success' | 'locked' | 'exists' | 'location_required' | 'preferences_required' | 'limit_reached'; message?: string }>;
  hasTodayMissions: () => boolean;
  getTodayMissions: () => Mission[];
  checkAndResetMissions: () => void;
  resetGeneratedMissions: () => void;
  resetTodayCompletedMission: () => void;
  resetAllTodayMissions: () => void;
  // Refresh tracking
  setRefreshUsedToday: () => Promise<void>;
  hasUsedRefreshToday: () => boolean;
  // In-progress mission actions
  saveInProgressMission: (data: Partial<InProgressMissionData> & { missionId: string }) => void;
  getInProgressMission: (missionId: string) => InProgressMissionData | null;
  clearInProgressMission: (missionId: string) => void;
  reset: () => void;
}

interface ExtendedMissionState extends MissionState {
  generatedMissionData: GeneratedMissionData | null;
  inProgressMissions: Record<string, InProgressMissionData>;
  refreshUsedDate: string | null; // Date when refresh was used (YYYY-MM-DD format)
}

const initialState: ExtendedMissionState = {
  dailyMission: null,
  missionHistory: [],
  keptMissions: [],
  todayCompletedMission: null,
  generatedMissionData: null,
  inProgressMissions: {},
  refreshUsedDate: null,
  isLoading: false,
  error: null,
};

export const useMissionStore = create<ExtendedMissionState & MissionActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setDailyMission: (mission) => set({ dailyMission: mission }),

      setMissionHistory: (history) => set({ missionHistory: history }),

      addToHistory: (mission) =>
        set((state) => ({
          missionHistory: [mission, ...state.missionHistory],
        })),

      setIsLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      completeMission: (missionId) => {
        const currentMission = get().dailyMission;
        if (currentMission && currentMission.id === missionId) {
          const completedMission = {
            ...currentMission,
            status: 'completed' as const,
          };
          set({
            dailyMission: completedMission,
            missionHistory: [completedMission, ...get().missionHistory],
          });
        }
      },

      skipMission: (missionId) => {
        const currentMission = get().dailyMission;
        if (currentMission && currentMission.id === missionId) {
          const skippedMission = {
            ...currentMission,
            status: 'skipped' as const,
          };
          set({
            dailyMission: null,
            missionHistory: [skippedMission, ...get().missionHistory],
          });
        }
      },

      // Keep mission: 미션을 북마크에 추가 (구독 상태에 따라 제한)
      keepMission: (mission) => {
        const { keptMissions } = get();

        // 이미 Keep된 미션인지 확인
        const isAlreadyKept = keptMissions.some((m) => m.id === mission.id);
        if (isAlreadyKept) return false;

        // 구독 상태에 따른 북마크 제한 확인
        const { canBookmarkMission } = useSubscriptionStore.getState();
        if (!canBookmarkMission(keptMissions.length)) {
          return false;
        }

        const keptMission: KeptMission = {
          ...mission,
          keptId: `${mission.id}-${Date.now()}`,
          keptDate: new Date(),
        };
        set({ keptMissions: [...keptMissions, keptMission] });
        return true;
      },

      // Remove kept mission by mission ID
      removeKeptMission: (missionId) => {
        set((state) => ({
          keptMissions: state.keptMissions.filter((m) => m.id !== missionId),
        }));
      },

      // Remove kept mission by kept ID (unique instance)
      removeKeptMissionByKeptId: (keptId) => {
        set((state) => ({
          keptMissions: state.keptMissions.filter((m) => m.keptId !== keptId),
        }));
      },

      // Check if mission is kept
      isKeptMission: (missionId) => {
        return get().keptMissions.some((m) => m.id === missionId);
      },

      // Complete today's mission (one per day limit)
      completeTodayMission: (missionId) => {
        const today = getTodayDateString();
        const { todayCompletedMission, keptMissions } = get();

        // Check if already completed a mission today
        if (todayCompletedMission && todayCompletedMission.date === today) {
          return; // Already completed today
        }

        // Set today's completed mission
        const newCompletedMission: TodayCompletedMission = {
          date: today,
          missionId,
        };

        // Also remove from kept missions if it was bookmarked
        const updatedKeptMissions = keptMissions.filter((m) => m.id !== missionId);

        set({
          todayCompletedMission: newCompletedMission,
          keptMissions: updatedKeptMissions,
        });

        // Also remove from Supabase couple_bookmarks if bookmarked
        // This is async but we don't need to wait for it
        const syncStore = useCoupleSyncStore.getState();
        if (syncStore.isInitialized && syncStore.coupleId) {
          syncStore.removeBookmark(missionId).catch((err) => {
            console.warn('[Mission] Failed to remove bookmark from Supabase:', err);
          });
        }
      },

      // Check if any mission is completed today
      hasTodayCompletedMission: () => {
        const { todayCompletedMission } = get();
        if (!todayCompletedMission) return false;
        return todayCompletedMission.date === getTodayDateString();
      },

      // Check if a specific mission can be started
      canStartMission: (missionId) => {
        const { todayCompletedMission } = get();
        const syncStore = useCoupleSyncStore.getState();
        const subscriptionStore = useSubscriptionStore.getState();

        // Premium users (or partner is premium) can start unlimited missions
        const isCouplePremium = subscriptionStore.isPremium || subscriptionStore.partnerIsPremium;

        // Check if another mission is already locked (message written)
        if (syncStore.isInitialized && syncStore.lockedMissionId) {
          // If the locked mission is completed, don't block other missions
          const lockedProgress = syncStore.allMissionProgress.find(
            p => p.mission_id === syncStore.lockedMissionId
          );

          // Only block if locked mission is still in progress (not completed)
          if (lockedProgress?.status !== 'completed') {
            // Can only start if it's the locked mission (for viewing/continuing)
            if (syncStore.lockedMissionId !== missionId) {
              return false;
            }
          }
        }

        // Premium users can start new missions even after completing one today
        if (isCouplePremium) {
          return true;
        }

        if (!todayCompletedMission) return true;
        if (todayCompletedMission.date !== getTodayDateString()) return true;
        // Can only start if it's the same mission that was completed today (for viewing)
        return todayCompletedMission.missionId === missionId;
      },

      // Get today's completed mission ID
      getTodayCompletedMissionId: () => {
        const { todayCompletedMission } = get();
        if (!todayCompletedMission) return null;
        if (todayCompletedMission.date !== getTodayDateString()) return null;
        return todayCompletedMission.missionId;
      },

      // Check if a specific mission is the one completed today
      isTodayCompletedMission: (missionId) => {
        const { todayCompletedMission } = get();
        if (!todayCompletedMission) return false;
        if (todayCompletedMission.date !== getTodayDateString()) return false;
        return todayCompletedMission.missionId === missionId;
      },

      // Generate today's missions based on user answers (with AI)
      // Returns: { status: 'success' | 'locked' | 'error' | 'location_required' | 'preferences_required', message?: string }
      // excludedMissions: Optional list of missions to exclude (used for refresh to avoid duplicates)
      generateTodayMissions: async (answers, excludedMissions) => {
        const today = getTodayDateString();
        const syncStore = useCoupleSyncStore.getState();
        const { user, partner } = useAuthStore.getState();

        try {
          // Check if partner has completed onboarding (required for mission generation)
          if (partner?.id) {
            const { data: partnerProfile } = await db.profiles.get(partner.id);

            if (!partnerProfile?.is_onboarding_complete) {
              // Partner hasn't completed onboarding yet
              Alert.alert(
                '파트너 온보딩 필요',
                '파트너가 온보딩을 완료한 후 미션을 생성할 수 있습니다.',
                [{ text: '확인' }]
              );
              return {
                status: 'preferences_required' as const,
                message: '파트너가 온보딩을 완료해야 합니다.',
              };
            }
          }

          // Check current user's location (only the generating user needs location)
          if (user?.id) {
            const hasLocationPermission = await checkLocationPermission();
            if (!hasLocationPermission) {
              // Request location permission
              const granted = await requestLocationPermission();
              if (!granted) {
                return {
                  status: 'location_required' as const,
                  message: '위치 권한이 필요합니다.',
                };
              }
            }

            // Get current location
            const currentLocation = await getCurrentLocation();
            if (!currentLocation) {
              Alert.alert(
                '위치 정보 필요',
                '미션 생성을 위해 위치 정보가 필요합니다. 위치 서비스가 켜져 있는지 확인해주세요.',
                [{ text: '확인' }]
              );
              return {
                status: 'location_required' as const,
                message: '위치 정보를 가져올 수 없습니다.',
              };
            }

            // Update current user's location in DB
            await updateUserLocationInDB(user.id);
          }

          // Check if couple sync is initialized
          console.log('[MissionStore] Sync initialized:', syncStore.isInitialized, 'CoupleId:', syncStore.coupleId);
          if (syncStore.isInitialized && syncStore.coupleId) {
            // Check if missions already exist from partner (must be today's missions)
            const existingMissions = syncStore.sharedMissions;
            const existingMissionsDate = syncStore.sharedMissionsDate;
            const todayTimezone = getTodayInTimezone(); // Use timezone-aware date for comparison
            console.log('[MissionStore] Existing missions count:', existingMissions.length, 'Date:', existingMissionsDate, 'Today:', todayTimezone);

            // Only consider existing missions if they are from TODAY
            if (existingMissions.length > 0 && existingMissionsDate === todayTimezone) {
              console.log('[MissionStore] Using existing missions from today - returning exists status');
              // Use existing shared missions
              set({
                generatedMissionData: {
                  missions: existingMissions,
                  generatedDate: today,
                  answers,
                },
              });
              return { status: 'exists' as const, message: '이미 생성된 미션이 있습니다.' };
            }

            // If there are stale missions from a different date, clear them first
            if (existingMissions.length > 0 && existingMissionsDate !== todayTimezone) {
              console.log('[MissionStore] Clearing stale missions. Date:', existingMissionsDate, 'Today:', todayTimezone);
              // Reset the sync store's missions so we generate fresh ones
              syncStore.checkAndResetSharedMissions();
            }

            // Try to acquire lock for generation
            console.log('[MissionStore] Trying to acquire mission lock...');
            const acquired = await syncStore.acquireMissionLock();
            console.log('[MissionStore] Lock acquired:', acquired);
            if (!acquired) {
              // Partner is generating
              console.log('[MissionStore] Lock not acquired - partner is generating');
              return { status: 'locked' as const, message: '미션 생성 중입니다...' };
            }

            // Skip limit check for refresh mode (excludedMissions indicates refresh)
            // Refresh mode allows regeneration even if daily limit was reached
            if (!excludedMissions || excludedMissions.length === 0) {
              // Check subscription limit for mission generation (only for first generation)
              const subscriptionStore = useSubscriptionStore.getState();
              console.log('[MissionStore] Checking generation limit...');
              const canGenerate = await subscriptionStore.canGenerateMissions(syncStore.coupleId);
              console.log('[MissionStore] Can generate missions:', canGenerate);
              if (!canGenerate) {
                // Release lock since we can't generate
                await syncStore.releaseMissionLock();
                console.log('[MissionStore] Generation limit reached');
                return { status: 'limit_reached' as const, message: '일일 미션 생성 한도에 도달했습니다.' };
              }
            } else {
              console.log('[MissionStore] Refresh mode - skipping generation limit check');
            }
          }
        } catch (preCheckError) {
          console.error('[MissionStore] Pre-generation check failed:', preCheckError);
          // Release lock if acquired
          if (syncStore.isInitialized && syncStore.coupleId) {
            try {
              await syncStore.releaseMissionLock('idle');
            } catch (e) {
              // Ignore lock release error
            }
          }
          throw preCheckError; // Re-throw to be caught by mission.tsx
        }

        try {
          // Get user preferences from onboarding store for personalization
          const onboardingData = useOnboardingStore.getState().data;

          // Get partner preferences from authStore
          const { partner, couple } = useAuthStore.getState();
          let partnerPreferences: Partial<OnboardingData> | undefined;

          if (partner?.preferences) {
            // Extract relevant preference fields from partner's preferences
            // The preferences stored in DB follow OnboardingData structure
            const prefs = partner.preferences as unknown as Record<string, unknown>;
            partnerPreferences = {
              mbti: (prefs.mbti as string) || '',
              activityTypes: (prefs.activityTypes as ActivityType[]) || [],
              dateWorries: (prefs.dateWorries as DateWorry[]) || [],
              constraints: (prefs.constraints as Constraint[]) || [],
              birthDate: partner.birthDate || null,
              birthDateCalendarType: partner.birthDateCalendarType || 'solar',
              relationshipType: (prefs.relationshipType as 'dating' | 'married') || couple?.relationshipType || 'dating',
              anniversaryDate: couple?.datingStartDate || null,
            };
          }

          // Fetch mission history for deduplication (hybrid approach)
          let missionHistory: MissionHistorySummary | undefined;
          if (!isDemoMode && couple?.id) {
            try {
              missionHistory = await db.completedMissions.getMissionHistorySummary(couple.id, 30);
              console.log(`[MissionStore] Loaded history: ${missionHistory.totalCompleted} missions, ${missionHistory.recentTitles.length} titles`);
            } catch (historyError) {
              console.warn('[MissionStore] Failed to load mission history:', historyError);
              // Continue without history - deduplication will be skipped
            }
          }

          // Get current user's location for region-based mission generation
          const currentLocation = await getCurrentLocation();
          console.log('[MissionStore] Current location:', currentLocation ?
            `${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)}` : 'Not available');

          // Fetch custom anniversaries for anniversary-related mission generation
          let customAnniversaries: CustomAnniversaryForMission[] = [];
          if (couple?.id) {
            try {
              const anniversaries = await anniversaryService.load(couple.id);
              customAnniversaries = anniversaries.map(a => ({
                label: a.label,
                targetDate: a.targetDate,
                isYearly: a.isYearly,
              }));
              console.log(`[MissionStore] Loaded ${customAnniversaries.length} custom anniversaries for mission generation`);
            } catch (anniversaryError) {
              console.warn('[MissionStore] Failed to load custom anniversaries:', anniversaryError);
              // Continue without custom anniversaries
            }
          }

          // Try to generate missions with AI
          const aiMissions = await generateMissionsWithAI({
            userAPreferences: onboardingData,
            userBPreferences: partnerPreferences as OnboardingData | undefined,
            todayAnswers: answers,
            missionHistory, // Pass history for deduplication
            excludedMissions, // Pass excluded missions for refresh (to avoid duplicates)
            customAnniversaries, // Pass custom anniversaries for anniversary-related missions
            location: currentLocation ? {
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
            } : undefined,
          });

          // Save to local state
          set({
            generatedMissionData: {
              missions: aiMissions,
              generatedDate: today,
              answers,
            },
          });

          // Save to couple sync (will broadcast to partner)
          if (syncStore.isInitialized && syncStore.coupleId) {
            await syncStore.saveSharedMissions(
              aiMissions,
              answers,
              partner?.id, // Partner ID for push notification
              user?.nickname // Current user's nickname for notification message
            );

            // Increment generation count for subscription tracking
            await useSubscriptionStore.getState().incrementGenerationCount(syncStore.coupleId);
          }

          return { status: 'success' as const };
        } catch (error) {
          console.error('Error generating missions with AI:', error);

          // Release lock on error
          if (syncStore.isInitialized && syncStore.coupleId) {
            await syncStore.releaseMissionLock('idle');
          }

          // Fallback to basic missions if AI fails
          const fallbackMissions = generateMissionsFallback(answers.todayMoods);

          set({
            generatedMissionData: {
              missions: fallbackMissions,
              generatedDate: today,
              answers,
            },
          });

          // Save fallback missions to couple sync
          if (syncStore.isInitialized && syncStore.coupleId) {
            await syncStore.saveSharedMissions(
              fallbackMissions,
              answers,
              partner?.id, // Partner ID for push notification
              user?.nickname // Current user's nickname for notification message
            );

            // Increment generation count for subscription tracking
            await useSubscriptionStore.getState().incrementGenerationCount(syncStore.coupleId);
          }

          return { status: 'success' as const };
        }
      },

      // Check if today's missions are already generated (local or synced)
      // IMPORTANT: Check synced state FIRST - it's the source of truth for couples
      hasTodayMissions: () => {
        const { generatedMissionData } = get();
        const syncStore = useCoupleSyncStore.getState();
        const today = getTodayDateString();
        // Use timezone-aware date for sync store comparison (sync store uses getTodayInTimezone)
        const todayTimezone = getTodayInTimezone();

        // Check synced state FIRST - this is the source of truth for couples
        if (syncStore.isInitialized && syncStore.sharedMissions.length > 0 && syncStore.sharedMissionsDate === todayTimezone) {
          return true;
        }

        // Defensive: if missions exist but date is null, check mission progress for today
        // This handles edge cases where sharedMissionsDate wasn't properly set
        if (syncStore.isInitialized && syncStore.sharedMissions.length > 0 && syncStore.sharedMissionsDate === null) {
          const hasTodayProgress = syncStore.allMissionProgress.some(p => p.date === todayTimezone);
          if (hasTodayProgress) {
            // Missions exist and we have today's progress - treat as today's missions
            return true;
          }
        }

        // Fallback to local state only if no synced data available
        if (generatedMissionData && generatedMissionData.generatedDate === today) {
          return true;
        }

        return false;
      },

      // Get today's generated missions (local or synced)
      // IMPORTANT: Check synced state FIRST - it's the source of truth for couples
      // This ensures that when partner refreshes missions, we get the new ones
      getTodayMissions: () => {
        const { generatedMissionData } = get();
        const syncStore = useCoupleSyncStore.getState();
        const today = getTodayDateString();
        // Use timezone-aware date for sync store comparison (sync store uses getTodayInTimezone)
        const todayTimezone = getTodayInTimezone();

        // Check synced state FIRST - this is the source of truth for couples
        // When partner refreshes missions, sharedMissions will have the latest data
        if (syncStore.isInitialized && syncStore.sharedMissions.length > 0 && syncStore.sharedMissionsDate === todayTimezone) {
          return syncStore.sharedMissions;
        }

        // Defensive: if missions exist but date is null, check mission progress for today
        // This handles edge cases where sharedMissionsDate wasn't properly set
        if (syncStore.isInitialized && syncStore.sharedMissions.length > 0 && syncStore.sharedMissionsDate === null) {
          const hasTodayProgress = syncStore.allMissionProgress.some(p => p.date === todayTimezone);
          if (hasTodayProgress) {
            // Missions exist and we have today's progress - return them
            return syncStore.sharedMissions;
          }
        }

        // Fallback to local state only if no synced data available
        if (generatedMissionData && generatedMissionData.generatedDate === today) {
          return generatedMissionData.missions;
        }

        return [];
      },

      // Check and reset missions if date changed (called on app focus)
      checkAndResetMissions: () => {
        const { generatedMissionData, inProgressMissions, refreshUsedDate } = get();
        const today = getTodayDateString();

        // Reset generated missions if date changed
        if (generatedMissionData && generatedMissionData.generatedDate !== today) {
          set({ generatedMissionData: null });
        }

        // Reset refresh used date if date changed
        if (refreshUsedDate && refreshUsedDate !== today) {
          set({ refreshUsedDate: null });
        }

        // Clean up old in-progress missions (from previous days)
        const currentInProgress = { ...inProgressMissions };
        let hasChanges = false;
        for (const [missionId, data] of Object.entries(currentInProgress)) {
          if (data.date !== today) {
            delete currentInProgress[missionId];
            hasChanges = true;
          }
        }
        if (hasChanges) {
          set({ inProgressMissions: currentInProgress });
        }

        // Also check and reset shared missions in coupleSyncStore
        useCoupleSyncStore.getState().checkAndResetSharedMissions();

        // Note: todayCompletedMission already checks date in its getters
      },

      // Reset only generated missions (for manual reset)
      resetGeneratedMissions: () => {
        set({ generatedMissionData: null });
      },

      // Reset today's completed mission (for developer reset)
      resetTodayCompletedMission: () => {
        set({ todayCompletedMission: null });
      },

      // Reset all today's mission data (generated, completed, in-progress)
      resetAllTodayMissions: () => {
        set({
          generatedMissionData: null,
          todayCompletedMission: null,
          inProgressMissions: {},
        });
      },

      // Mark refresh as used today (syncs to DB for couple sync)
      setRefreshUsedToday: async () => {
        const today = getTodayDateString();
        set({ refreshUsedDate: today });

        // Also sync to database so partner sees the same state
        const syncStore = useCoupleSyncStore.getState();
        if (syncStore.isInitialized && syncStore.coupleId && !isDemoMode) {
          try {
            const { error } = await db.coupleMissions.setRefreshed(syncStore.coupleId);
            if (error) {
              console.error('[MissionStore] Failed to sync refresh status to DB:', error);
            } else {
              console.log('[MissionStore] Successfully synced refresh status to DB');
            }
          } catch (e) {
            console.error('[MissionStore] Error syncing refresh status:', e);
          }
        }
      },

      // Check if refresh has been used today
      hasUsedRefreshToday: () => {
        const { refreshUsedDate } = get();
        if (!refreshUsedDate) return false;
        return refreshUsedDate === getTodayDateString();
      },

      // Save in-progress mission data (for persistence across navigation)
      saveInProgressMission: (data) => {
        const today = getTodayDateString();
        const { inProgressMissions } = get();

        // Get existing data for this mission or create new
        const existing = inProgressMissions[data.missionId] || {
          missionId: data.missionId,
          capturedPhoto: null,
          user1Message: null,
          user2Message: null,
          date: today,
        };

        // Merge new data with existing
        const updated: InProgressMissionData = {
          ...existing,
          ...data,
          date: today,
        };

        set({
          inProgressMissions: {
            ...inProgressMissions,
            [data.missionId]: updated,
          },
        });
      },

      // Get in-progress mission data (only if from today)
      getInProgressMission: (missionId) => {
        const { inProgressMissions } = get();
        const data = inProgressMissions[missionId];

        if (!data) return null;

        // Only return if from today
        if (data.date !== getTodayDateString()) {
          return null;
        }

        return data;
      },

      // Clear in-progress mission data
      clearInProgressMission: (missionId) => {
        const { inProgressMissions } = get();
        const { [missionId]: _, ...rest } = inProgressMissions;
        set({ inProgressMissions: rest });
      },

      reset: () => set(initialState),
    }),
    {
      name: 'daydate-mission-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        keptMissions: state.keptMissions,
        todayCompletedMission: state.todayCompletedMission,
        generatedMissionData: state.generatedMissionData,
        missionHistory: state.missionHistory,
        inProgressMissions: state.inProgressMissions,
        refreshUsedDate: state.refreshUsedDate,
      }),
    }
  )
);

export default useMissionStore;
