import { create } from 'zustand';
import type { DailyMission, Mission, MissionState } from '@/types';

interface MissionActions {
  setDailyMission: (mission: DailyMission | null) => void;
  setMissionHistory: (history: DailyMission[]) => void;
  addToHistory: (mission: DailyMission) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  completeMission: (missionId: string) => void;
  skipMission: (missionId: string) => void;
  reset: () => void;
}

const initialState: MissionState = {
  dailyMission: null,
  missionHistory: [],
  isLoading: false,
  error: null,
};

export const useMissionStore = create<MissionState & MissionActions>()((set, get) => ({
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

  reset: () => set(initialState),
}));

// Sample missions for development/testing
export const SAMPLE_MISSIONS: Mission[] = [
  {
    id: '1',
    title: '카페에서 함께 커피 한잔',
    description: '분위기 좋은 카페에서 따뜻한 커피 한잔과 함께 서로의 이야기를 나눠보세요.',
    category: 'food',
    difficulty: 1,
    duration: '1시간',
    locationType: 'indoor',
    tags: ['카페', '대화', '여유'],
    icon: '☕',
    imageUrl: 'https://images.unsplash.com/photo-1548051072-b34898021f8b?w=800',
    isPremium: false,
    estimatedTime: 60,
  },
  {
    id: '2',
    title: '일몰 보며 산책하기',
    description: '해 질 녘, 손을 잡고 함께 걸어보세요. 하루의 끝을 함께 마무리하는 특별한 시간이 될 거예요.',
    category: 'outdoor',
    difficulty: 1,
    duration: '30분',
    locationType: 'outdoor',
    tags: ['산책', '일몰', '로맨틱'],
    icon: '🌅',
    imageUrl: 'https://images.unsplash.com/photo-1693852512019-cb0eccc97e8f?w=800',
    isPremium: false,
    estimatedTime: 30,
  },
  {
    id: '3',
    title: '함께 요리하기',
    description: '오늘은 집에서 함께 요리해보는 건 어떨까요? 서로 도우며 만드는 음식은 더욱 맛있답니다.',
    category: 'home',
    difficulty: 2,
    duration: '2시간',
    locationType: 'indoor',
    tags: ['요리', '홈데이트', '협력'],
    icon: '👨‍🍳',
    imageUrl: 'https://images.unsplash.com/photo-1758522489456-96afe24741dc?w=800',
    isPremium: false,
    estimatedTime: 120,
  },
  {
    id: '4',
    title: '영화관 데이트',
    description: '최신 영화를 함께 관람하고, 영화 후 감상을 나눠보세요.',
    category: 'entertainment',
    difficulty: 1,
    duration: '3시간',
    locationType: 'indoor',
    tags: ['영화', '문화생활', '데이트'],
    icon: '🎬',
    imageUrl: 'https://images.unsplash.com/photo-1622296571436-8d5b1c203416?w=800',
    isPremium: false,
    estimatedTime: 180,
  },
  {
    id: '5',
    title: '맛집 탐방',
    description: '평소 가보고 싶었던 맛집을 함께 방문해보세요. 맛있는 음식과 함께하는 시간은 언제나 특별해요.',
    category: 'food',
    difficulty: 1,
    duration: '2시간',
    locationType: 'indoor',
    tags: ['맛집', '음식', '탐방'],
    icon: '🍽️',
    imageUrl: 'https://images.unsplash.com/photo-1544824970-97b1c7bbd6ba?w=800',
    isPremium: false,
    estimatedTime: 120,
  },
];

export default useMissionStore;
