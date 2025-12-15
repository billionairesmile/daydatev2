import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyMission, Mission, MissionState, KeptMission, TodayCompletedMission } from '@/types';
import { generateMissionsWithAI, generateMissionsFallback } from '@/services/missionGenerator';
import {
  useOnboardingStore,
  type OnboardingData,
  type ActivityType,
  type DateWorry,
  type Constraint,
} from '@/stores/onboardingStore';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
import { useAuthStore } from '@/stores/authStore';
import {
  checkCoupleLocationStatus,
  showLocationRequiredAlert,
  updateUserLocationInDB,
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
  generateTodayMissions: (answers: MissionGenerationAnswers) => Promise<{ status: 'success' | 'locked' | 'exists' | 'location_required'; message?: string }>;
  hasTodayMissions: () => boolean;
  getTodayMissions: () => Mission[];
  checkAndResetMissions: () => void;
  resetGeneratedMissions: () => void;
  resetTodayCompletedMission: () => void;
  resetAllTodayMissions: () => void;
  // In-progress mission actions
  saveInProgressMission: (data: Partial<InProgressMissionData> & { missionId: string }) => void;
  getInProgressMission: (missionId: string) => InProgressMissionData | null;
  clearInProgressMission: (missionId: string) => void;
  reset: () => void;
}

interface ExtendedMissionState extends MissionState {
  generatedMissionData: GeneratedMissionData | null;
  inProgressMissions: Record<string, InProgressMissionData>;
}

const initialState: ExtendedMissionState = {
  dailyMission: null,
  missionHistory: [],
  keptMissions: [],
  todayCompletedMission: null,
  generatedMissionData: null,
  inProgressMissions: {},
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

      // Keep mission: 미션을 북마크에 추가 (최대 5개)
      keepMission: (mission) => {
        const { keptMissions } = get();

        // 이미 Keep된 미션인지 확인
        const isAlreadyKept = keptMissions.some((m) => m.id === mission.id);
        if (isAlreadyKept) return false;

        // 최대 5개 제한
        if (keptMissions.length >= 5) {
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
      // Returns: { status: 'success' | 'locked' | 'error' | 'location_required', message?: string }
      generateTodayMissions: async (answers) => {
        const today = getTodayDateString();
        const syncStore = useCoupleSyncStore.getState();
        const { user, partner } = useAuthStore.getState();

        // Check location status for both users (required)
        if (user?.id && partner?.id) {
          const locationStatus = await checkCoupleLocationStatus(user.id, partner.id);

          if (!locationStatus.bothEnabled) {
            // Show alert and block mission generation
            showLocationRequiredAlert(locationStatus.missingUsers);
            return {
              status: 'location_required' as const,
              message: `위치 정보가 필요합니다: ${locationStatus.missingUsers.join(', ')}`,
            };
          }

          // Update current user's location in DB
          if (user.id) {
            await updateUserLocationInDB(user.id);
          }
        }

        // Check if couple sync is initialized
        if (syncStore.isInitialized && syncStore.coupleId) {
          // Check if missions already exist from partner
          const existingMissions = syncStore.sharedMissions;
          if (existingMissions.length > 0) {
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

          // Try to acquire lock for generation
          const acquired = await syncStore.acquireMissionLock();
          if (!acquired) {
            // Partner is generating
            return { status: 'locked' as const, message: '미션 생성 중입니다...' };
          }
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

          // Try to generate missions with AI
          const aiMissions = await generateMissionsWithAI({
            userAPreferences: onboardingData,
            userBPreferences: partnerPreferences as OnboardingData | undefined,
            todayAnswers: answers,
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
            await syncStore.saveSharedMissions(aiMissions, answers);
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
            await syncStore.saveSharedMissions(fallbackMissions, answers);
          }

          return { status: 'success' as const };
        }
      },

      // Check if today's missions are already generated (local or synced)
      hasTodayMissions: () => {
        const { generatedMissionData } = get();
        const syncStore = useCoupleSyncStore.getState();

        // Check local state first
        if (generatedMissionData && generatedMissionData.generatedDate === getTodayDateString()) {
          return true;
        }

        // Check synced state
        if (syncStore.isInitialized && syncStore.sharedMissions.length > 0) {
          return true;
        }

        return false;
      },

      // Get today's generated missions (local or synced)
      getTodayMissions: () => {
        const { generatedMissionData } = get();
        const syncStore = useCoupleSyncStore.getState();
        const today = getTodayDateString();

        // Check local state first
        if (generatedMissionData && generatedMissionData.generatedDate === today) {
          return generatedMissionData.missions;
        }

        // Check synced state
        if (syncStore.isInitialized && syncStore.sharedMissions.length > 0) {
          return syncStore.sharedMissions;
        }

        return [];
      },

      // Check and reset missions if date changed (called on app focus)
      checkAndResetMissions: () => {
        const { generatedMissionData, inProgressMissions } = get();
        const today = getTodayDateString();

        // Reset generated missions if date changed
        if (generatedMissionData && generatedMissionData.generatedDate !== today) {
          set({ generatedMissionData: null });
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
      }),
    }
  )
);

export default useMissionStore;
