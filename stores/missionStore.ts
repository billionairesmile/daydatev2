import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyMission, Mission, MissionState, KeptMission, TodayCompletedMission } from '@/types';
import { generateMissionsWithAI, generateMissionsFallback } from '@/services/missionGenerator';
import { useOnboardingStore } from '@/stores/onboardingStore';

// Helper to get today's date string in YYYY-MM-DD format
const getTodayDateString = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// Mission generation types
export type TodayMood = 'fun' | 'deep_talk' | 'romantic' | 'healing' | 'adventure' | 'active' | 'culture';

export interface MissionGenerationAnswers {
  canMeetToday: boolean;
  todayMoods: TodayMood[];
}

export interface GeneratedMissionData {
  missions: Mission[];
  generatedDate: string;
  answers: MissionGenerationAnswers;
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
  generateTodayMissions: (answers: MissionGenerationAnswers) => void;
  hasTodayMissions: () => boolean;
  getTodayMissions: () => Mission[];
  checkAndResetMissions: () => void;
  resetGeneratedMissions: () => void;
  reset: () => void;
}

interface ExtendedMissionState extends MissionState {
  generatedMissionData: GeneratedMissionData | null;
}

const initialState: ExtendedMissionState = {
  dailyMission: null,
  missionHistory: [],
  keptMissions: [],
  todayCompletedMission: null,
  generatedMissionData: null,
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
      generateTodayMissions: async (answers) => {
        const today = getTodayDateString();

        try {
          // Get user preferences from onboarding store for personalization
          const onboardingData = useOnboardingStore.getState().data;

          // Try to generate missions with AI
          const aiMissions = await generateMissionsWithAI({
            userAPreferences: onboardingData,
            todayAnswers: answers,
          });

          set({
            generatedMissionData: {
              missions: aiMissions,
              generatedDate: today,
              answers,
            },
          });
        } catch (error) {
          console.error('Error generating missions with AI:', error);

          // Fallback to basic missions if AI fails
          const fallbackMissions = generateMissionsFallback(answers.todayMoods);

          set({
            generatedMissionData: {
              missions: fallbackMissions,
              generatedDate: today,
              answers,
            },
          });
        }
      },

      // Check if today's missions are already generated
      hasTodayMissions: () => {
        const { generatedMissionData } = get();
        if (!generatedMissionData) return false;
        return generatedMissionData.generatedDate === getTodayDateString();
      },

      // Get today's generated missions
      getTodayMissions: () => {
        const { generatedMissionData } = get();
        if (!generatedMissionData) return [];
        if (generatedMissionData.generatedDate !== getTodayDateString()) return [];
        return generatedMissionData.missions;
      },

      // Check and reset missions if date changed (called on app focus)
      checkAndResetMissions: () => {
        const { generatedMissionData, todayCompletedMission } = get();
        const today = getTodayDateString();

        // Reset generated missions if date changed
        if (generatedMissionData && generatedMissionData.generatedDate !== today) {
          set({ generatedMissionData: null });
        }

        // Note: todayCompletedMission already checks date in its getters
      },

      // Reset only generated missions (for manual reset)
      resetGeneratedMissions: () => {
        set({ generatedMissionData: null });
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
      }),
    }
  )
);

// ============================================
// Legacy Mission Pool (No Longer Used)
// ============================================
// AI now generates personalized missions based on user preferences.
// This pool is kept for reference only and as a fallback in missionGenerator.ts

const LEGACY_MISSION_POOL: Mission[] = [
  {
    id: 'cafe-1',
    title: '카페에서 함께 커피 한잔',
    description: '분위기 좋은 카페에서 따뜻한 커피 한잔과 함께 서로의 이야기를 나눠보세요.',
    category: 'cafe',
    difficulty: 1,
    locationType: 'indoor',
    tags: ['카페', '대화', '여유'],
    icon: '☕',
    imageUrl: 'https://images.unsplash.com/photo-1548051072-b34898021f8b?w=800',
    isPremium: false,
    moodTags: ['deep_talk', 'healing'],
  },
  {
    id: 'sunset-1',
    title: '일몰 보며 산책하기',
    description: '해 질 녘, 손을 잡고 함께 걸어보세요. 하루의 끝을 함께 마무리하는 특별한 시간이 될 거예요.',
    category: 'outdoor',
    difficulty: 1,
    locationType: 'outdoor',
    tags: ['산책', '일몰', '로맨틱'],
    icon: '🌅',
    imageUrl: 'https://images.unsplash.com/photo-1693852512019-cb0eccc97e8f?w=800',
    isPremium: false,
    moodTags: ['romantic', 'healing'],
  },
  {
    id: 'cook-1',
    title: '함께 요리하기',
    description: '오늘은 집에서 함께 요리해보는 건 어떨까요? 서로 도우며 만드는 음식은 더욱 맛있답니다.',
    category: 'home',
    difficulty: 2,
    locationType: 'indoor',
    tags: ['요리', '홈데이트', '협력'],
    icon: '👨‍🍳',
    imageUrl: 'https://images.unsplash.com/photo-1758522489456-96afe24741dc?w=800',
    isPremium: false,
    moodTags: ['fun', 'adventure'],
  },
  {
    id: 'game-1',
    title: '보드게임 대결',
    description: '오늘은 진지하게 승부를 가려볼까요? 보드게임으로 웃음 가득한 시간을 보내보세요.',
    category: 'home',
    difficulty: 1,
    locationType: 'indoor',
    tags: ['보드게임', '집콕', '승부'],
    icon: '🎲',
    imageUrl: 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=800',
    isPremium: false,
    moodTags: ['fun'],
  },
  {
    id: 'movie-1',
    title: '영화 마라톤',
    description: '좋아하는 영화 시리즈를 정하고 함께 감상해보세요. 팝콘은 필수!',
    category: 'home',
    difficulty: 1,
    locationType: 'indoor',
    tags: ['영화', '집콕', '휴식'],
    icon: '🎬',
    imageUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800',
    isPremium: false,
    moodTags: ['healing', 'fun'],
  },
  {
    id: 'photo-1',
    title: '사진관 데이트',
    description: '오늘의 우리를 사진으로 남겨보세요. 인생샷을 건질 수 있을 거예요!',
    category: 'photo',
    difficulty: 1,
    locationType: 'indoor',
    tags: ['사진', '추억', '기념'],
    icon: '📸',
    imageUrl: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800',
    isPremium: false,
    moodTags: ['fun', 'romantic'],
  },
  {
    id: 'letter-1',
    title: '서로에게 손편지 쓰기',
    description: '오래된 방식이지만 그래서 더 특별해요. 진심을 담은 편지를 써보세요.',
    category: 'romantic',
    difficulty: 1,
    locationType: 'indoor',
    tags: ['손편지', '감동', '진심'],
    icon: '💌',
    imageUrl: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800',
    isPremium: false,
    moodTags: ['romantic', 'deep_talk'],
  },
  {
    id: 'hike-1',
    title: '가벼운 등산',
    description: '가까운 산에 올라 함께 정상에서 도시락을 먹어보세요. 땀 흘린 만큼 더 맛있어요.',
    category: 'outdoor',
    difficulty: 2,
    locationType: 'outdoor',
    tags: ['등산', '자연', '건강'],
    icon: '⛰️',
    imageUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
    isPremium: false,
    moodTags: ['adventure', 'healing'],
  },
  {
    id: 'spa-1',
    title: '찜질방 데이트',
    description: '따뜻한 찜질방에서 피로를 풀며 도란도란 이야기를 나눠보세요.',
    category: 'wellness',
    difficulty: 1,
    locationType: 'indoor',
    tags: ['찜질방', '휴식', '힐링'],
    icon: '🧖',
    imageUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800',
    isPremium: false,
    moodTags: ['healing'],
  },
  {
    id: 'museum-1',
    title: '미술관 투어',
    description: '조용한 미술관에서 예술 작품을 감상하며 서로의 감상을 나눠보세요.',
    category: 'culture',
    difficulty: 1,
    locationType: 'indoor',
    tags: ['미술관', '문화', '감상'],
    icon: '🎨',
    imageUrl: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800',
    isPremium: false,
    moodTags: ['deep_talk', 'healing'],
  },
  {
    id: 'bike-1',
    title: '자전거 라이딩',
    description: '한강이나 가까운 자전거 길에서 바람을 맞으며 함께 달려보세요.',
    category: 'outdoor',
    difficulty: 2,
    locationType: 'outdoor',
    tags: ['자전거', '운동', '바람'],
    icon: '🚴',
    imageUrl: 'https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800',
    isPremium: false,
    moodTags: ['adventure', 'fun'],
  },
  {
    id: 'talk-1',
    title: '36가지 질문',
    description: '서로를 더 깊이 알아가는 36가지 질문을 나눠보세요. 새로운 모습을 발견할 수 있어요.',
    category: 'home',
    difficulty: 1,
    locationType: 'indoor',
    tags: ['대화', '질문', '깊은대화'],
    icon: '💬',
    imageUrl: 'https://images.unsplash.com/photo-1516534775068-ba3e7458af70?w=800',
    isPremium: false,
    moodTags: ['deep_talk'],
  },
  {
    id: 'video-1',
    title: '영상통화 데이트',
    description: '만날 수 없는 날에도 얼굴을 보며 이야기해요. 화면 너머로 사랑을 전해보세요.',
    category: 'online',
    difficulty: 1,
    locationType: 'indoor',
    tags: ['영상통화', '장거리', '대화'],
    icon: '📱',
    imageUrl: 'https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=800',
    isPremium: false,
    moodTags: ['deep_talk', 'romantic'],
  },
  {
    id: 'game-online-1',
    title: '온라인 게임 함께 하기',
    description: '같은 게임을 하며 협력하거나 대결해보세요. 웃음이 끊이지 않을 거예요.',
    category: 'online',
    difficulty: 1,
    locationType: 'indoor',
    tags: ['게임', '온라인', '협력'],
    icon: '🎮',
    imageUrl: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800',
    isPremium: false,
    moodTags: ['fun'],
  },
  {
    id: 'dance-1',
    title: '집에서 춤추기',
    description: '좋아하는 노래를 틀고 함께 춤을 춰보세요. 실력은 중요하지 않아요!',
    category: 'home',
    difficulty: 1,
    locationType: 'indoor',
    tags: ['춤', '음악', '재미'],
    icon: '💃',
    imageUrl: 'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=800',
    isPremium: false,
    moodTags: ['fun', 'romantic'],
  },
  {
    id: 'star-1',
    title: '별 보며 이야기하기',
    description: '밤하늘 아래 담요를 깔고 누워 별을 보며 이야기를 나눠보세요.',
    category: 'outdoor',
    difficulty: 1,
    locationType: 'outdoor',
    tags: ['별', '밤', '로맨틱'],
    icon: '⭐',
    imageUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800',
    isPremium: false,
    moodTags: ['romantic', 'deep_talk'],
  },
];

export default useMissionStore;
