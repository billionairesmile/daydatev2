import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CompletedMission, MemoryState, Mission, MissionCategory, MissionDifficulty, LocationType } from '@/types';
import { db, isDemoMode } from '@/lib/supabase';

interface MemoryActions {
  setMemories: (memories: CompletedMission[]) => void;
  addMemory: (memory: CompletedMission) => void;
  deleteMemory: (memoryId: string) => void;
  setSelectedMemory: (memory: CompletedMission | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  getMemoriesByMonth: (year: number, month: number) => CompletedMission[];
  loadFromDB: (coupleId: string) => Promise<void>;
  reset: () => void;
}

const initialState: MemoryState = {
  memories: [],
  selectedMemory: null,
  isLoading: false,
  error: null,
};

// Convert DB record to CompletedMission type
const dbToCompletedMission = (record: Record<string, unknown>): CompletedMission => {
  const missionData = record.mission_data as Record<string, unknown> | null;

  const mission: Mission = missionData
    ? {
      id: (missionData.id as string) || record.id as string,
      title: (missionData.title as string) || '미션',
      description: (missionData.description as string) || '',
      category: ((missionData.category as string) || 'home') as MissionCategory,
      difficulty: ((missionData.difficulty as number) || 1) as MissionDifficulty,
      locationType: ((missionData.locationType as string) || 'indoor') as LocationType,
      tags: (missionData.tags as string[]) || [],
      icon: (missionData.icon as string) || '📷',
      imageUrl: (missionData.imageUrl as string) || '',
      isPremium: false,
    }
    : {
      id: record.id as string,
      title: '미션',
      description: '',
      category: 'home' as MissionCategory,
      difficulty: 1 as MissionDifficulty,
      locationType: 'indoor' as LocationType,
      tags: [],
      icon: '📷',
      imageUrl: '',
      isPremium: false,
    };

  return {
    id: record.id as string,
    coupleId: record.couple_id as string,
    missionId: missionData?.id as string || record.id as string,
    mission,
    photoUrl: record.photo_url as string,
    user1Message: record.user1_message as string,
    user2Message: record.user2_message as string,
    location: record.location as string,
    completedAt: new Date(record.completed_at as string),
  };
};

export const useMemoryStore = create<MemoryState & MemoryActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setMemories: (memories) => set({ memories }),

      addMemory: (memory) =>
        set((state) => ({
          memories: [memory, ...state.memories],
        })),

      deleteMemory: (memoryId) =>
        set((state) => ({
          memories: state.memories.filter((memory) => memory.id !== memoryId),
        })),

      setSelectedMemory: (memory) => set({ selectedMemory: memory }),

      setIsLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      getMemoriesByMonth: (year, month) => {
        return get().memories.filter((memory) => {
          const date = new Date(memory.completedAt);
          return date.getFullYear() === year && date.getMonth() === month;
        });
      },

      // Load memories from database
      loadFromDB: async (coupleId: string) => {
        if (isDemoMode) {
          return; // Use local data in demo mode
        }

        set({ isLoading: true, error: null });

        try {
          const { data, error } = await db.completedMissions.getAll(coupleId);

          if (error) {
            throw error;
          }

          if (data && data.length > 0) {
            const memories = data.map(dbToCompletedMission);
            set({ memories, isLoading: false });
          } else {
            set({ isLoading: false });
          }
        } catch (error) {
          console.error('Error loading memories from DB:', error);
          set({ error: 'Failed to load memories', isLoading: false });
        }
      },

      reset: () => set(initialState),
    }),
    {
      name: 'daydate-memory-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        memories: state.memories,
      }),
    }
  )
);

// Sample memories for development/testing
export const SAMPLE_MEMORIES: CompletedMission[] = [
  {
    id: '1',
    coupleId: 'sample-couple',
    missionId: '1',
    mission: {
      id: '1',
      title: '서로에게 편지쓰기',
      description: '손편지로 마음을 전해보세요.',
      category: 'home' as MissionCategory,
      difficulty: 1 as MissionDifficulty,
      locationType: 'indoor' as LocationType,
      tags: ['편지', '감동', '추억'],
      icon: '✉️',
      imageUrl: 'https://i.postimg.cc/fbmHcN3j/IMG-1020.jpg',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/fbmHcN3j/IMG-1020.jpg',
    user1Message: '편지를 진짜 오랜만에 쓰는데 덕분에 감정이 말랑말랑해졌어. 키키 행복하자! 사랑해',
    user2Message: '그동안 하지 못했던 말들 편지로 쓰니까 울컥하기도 하고.. 앞으로 더 자주 써줄게!',
    location: '서울 마포구',
    completedAt: new Date(2025, 10, 8, 18, 30),
  },
  {
    id: '2',
    coupleId: 'sample-couple',
    missionId: '2',
    mission: {
      id: '2',
      title: '야경 보며 드라이브하기',
      description: '밤하늘 아래 드라이브를 즐겨보세요.',
      category: 'outdoor' as MissionCategory,
      difficulty: 1 as MissionDifficulty,
      locationType: 'outdoor' as LocationType,
      tags: ['드라이브', '야경', '로맨틱'],
      icon: '🚗',
      imageUrl: 'https://i.postimg.cc/Xvd2fbZK/IMG-2440.jpg',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/Xvd2fbZK/IMG-2440.jpg',
    user1Message: '오늘 하루 힐링되고 행복하다. 너랑 함께여서 더 행복해, 평생 사랑할게',
    user2Message: '오늘 피곤했을텐데 드라이브 시켜줘서 고마워. 추억을 하나 더 만들어서 뿌듯해',
    location: '서울 강남구',
    completedAt: new Date(2025, 10, 13, 21, 30),
  },
  {
    id: '3',
    coupleId: 'sample-couple',
    missionId: '3',
    mission: {
      id: '3',
      title: '반짝이는 트리 아래, 우리의 겨울',
      description: '크리스마스 트리와 함께 특별한 순간을 만들어보세요.',
      category: 'outdoor' as MissionCategory,
      difficulty: 1 as MissionDifficulty,
      locationType: 'outdoor' as LocationType,
      tags: ['크리스마스', '트리', '겨울'],
      icon: '🎄',
      imageUrl: 'https://i.postimg.cc/7L0B3kC9/IMG-3023.jpg',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/7L0B3kC9/IMG-3023.jpg',
    user1Message: '오늘 네 손 잡고 트리 보러 다니는 순간이 영화 같았어. 사진 속에 오늘의 두근거림이 오래 남았으면 좋겠다.',
    user2Message: '같이 걸으면서 트리 찾는 게 생각보다 더 설레었어. 올해 크리스마스도 너와 함께라서 참 따뜻하다.',
    location: '서울 용산구',
    completedAt: new Date(2025, 11, 10, 19, 30),
  },
  {
    id: '4',
    coupleId: 'sample-couple',
    missionId: '4',
    mission: {
      id: '4',
      title: '함께 외치는 응원의 순간',
      description: '좋아하는 팀을 함께 응원해보세요.',
      category: 'activity' as MissionCategory,
      difficulty: 1 as MissionDifficulty,
      locationType: 'indoor' as LocationType,
      tags: ['응원', '스포츠', '함께'],
      icon: '⚽',
      imageUrl: 'https://i.postimg.cc/wMT0YRwb/IMG-3189.avif',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/wMT0YRwb/IMG-3189.avif',
    user1Message: '네 목소리 들리니까 더 신나고 집중됐어. 오늘도 옆에 있어줘서 고마워.',
    user2Message: '너랑 같이 응원하니까 경기가 더 재밌었어. 다음에 손흥민 골넣으면 뽀뽀해줄게.',
    location: '대전 유성구',
    completedAt: new Date(2025, 10, 14, 20, 43),
  },
  {
    id: '5',
    coupleId: 'sample-couple',
    missionId: '5',
    mission: {
      id: '5',
      title: '우리만의 홈셰프 파티',
      description: '함께 요리하고 맛있게 먹어보세요.',
      category: 'home' as MissionCategory,
      difficulty: 2 as MissionDifficulty,
      locationType: 'indoor' as LocationType,
      tags: ['요리', '홈파티', '함께'],
      icon: '👨‍🍳',
      imageUrl: 'https://i.postimg.cc/pTvsk68q/IMG-3716.jpg',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/pTvsk68q/IMG-3716.jpg',
    user1Message: '오늘 네가 만든 음식 진짜 맛있었어. 정성 가득한 시간이었다. 고마워.',
    user2Message: '같이 준비하고 먹으니까 더 맛있었던 것 같아. 다음엔 내가 메인 요리 해볼게.',
    location: '서울 마포구',
    completedAt: new Date(2025, 10, 25, 20, 11),
  },
  {
    id: '6',
    coupleId: 'sample-couple',
    missionId: '6',
    mission: {
      id: '6',
      title: '특별한 날, 둘만의 휴식',
      description: '기념일을 특별하게 보내보세요.',
      category: 'travel' as MissionCategory,
      difficulty: 2 as MissionDifficulty,
      locationType: 'outdoor' as LocationType,
      tags: ['기념일', '휴식', '여행'],
      icon: '💑',
      imageUrl: 'https://i.postimg.cc/85GZw0Wy/IMG-5490.jpg',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/85GZw0Wy/IMG-5490.jpg',
    user1Message: '올해도 함께여서 고마워. 오늘 하루 정말 꿈같았어. 앞으로도 우리만의 속도대로 가자.',
    user2Message: '기념일을 이렇게 보내니까 더 의미가 깊어졌어. 늘 고맙고 많이 사랑해.',
    location: '부산 해운대구',
    completedAt: new Date(2025, 10, 11, 18, 22),
  },
  {
    id: '7',
    coupleId: 'sample-couple',
    missionId: '7',
    mission: {
      id: '7',
      title: '분위기 좋은 레스토랑 데이트',
      description: '맛있는 음식과 함께 대화를 나눠보세요.',
      category: 'cafe' as MissionCategory,
      difficulty: 1 as MissionDifficulty,
      locationType: 'indoor' as LocationType,
      tags: ['레스토랑', '맛집', '데이트'],
      icon: '🍽️',
      imageUrl: 'https://i.postimg.cc/dQ45mn0m/IMG-5944.avif',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/dQ45mn0m/IMG-5944.avif',
    user1Message: '너랑 먹으니까 더 맛있었어. 말없이 웃는 순간마저 좋았다.',
    user2Message: '오늘 대화 너무 좋았어. 다음엔 내가 특별한 곳 찾아볼게.',
    location: '부산 해운대구',
    completedAt: new Date(2025, 10, 28, 12, 58),
  },
  {
    id: '8',
    coupleId: 'sample-couple',
    missionId: '8',
    mission: {
      id: '8',
      title: '콘서트/축제 관람하기',
      description: '함께 공연을 즐겨보세요.',
      category: 'culture' as MissionCategory,
      difficulty: 2 as MissionDifficulty,
      locationType: 'outdoor' as LocationType,
      tags: ['콘서트', '축제', '공연'],
      icon: '🎤',
      imageUrl: 'https://i.postimg.cc/NMtdbzmc/IMG-6827.jpg',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/NMtdbzmc/IMG-6827.jpg',
    user1Message: '무대만 본 줄 알았는데, 결국 오늘의 주인공은 우리였던 것 같아.',
    user2Message: '노래보다 네 표정이 더 기억에 남아. 다음 공연도 같이 가자.',
    location: '대전 동구',
    completedAt: new Date(2025, 10, 4, 18, 22),
  },
  {
    id: '9',
    coupleId: 'sample-couple',
    missionId: '9',
    mission: {
      id: '9',
      title: '우리, 그리고 반려견과의 하루',
      description: '반려견과 함께 특별한 시간을 보내보세요.',
      category: 'outdoor' as MissionCategory,
      difficulty: 1 as MissionDifficulty,
      locationType: 'outdoor' as LocationType,
      tags: ['반려견', '산책', '함께'],
      icon: '🐕',
      imageUrl: 'https://i.postimg.cc/htHyQjGT/choegeun-sajin-bogi.jpg',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/htHyQjGT/choegeun-sajin-bogi.jpg',
    user1Message: '우리 강아지가 너 좋아하는 거 보니까 나도 괜히 흐뭇했어. 고마워.',
    user2Message: '같이 산책도 하고 사진도 찍고, 오늘 하루 참 따뜻했어. 다음에 또 같이 가자.',
    location: '서울 용산구',
    completedAt: new Date(2025, 11, 2, 15, 32),
  },
  {
    id: '10',
    coupleId: 'sample-couple',
    missionId: '10',
    mission: {
      id: '10',
      title: '자전거 데이트',
      description: '바람을 맞으며 자전거를 타보세요.',
      category: 'outdoor' as MissionCategory,
      difficulty: 1 as MissionDifficulty,
      locationType: 'outdoor' as LocationType,
      tags: ['자전거', '한강', '운동'],
      icon: '🚴',
      imageUrl: 'https://i.postimg.cc/dV8dntBy/1c928846-5c7a-4054-8ace-aeab85ebf5b2.webp',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/dV8dntBy/1c928846-5c7a-4054-8ace-aeab85ebf5b2.webp',
    user1Message: '바람이 차가웠는데 네가 옆에 있어서 따뜻했어. 우리 오늘 정말 잘 어울렸다.',
    user2Message: '넘어질까 걱정했는데 옆에서 챙겨줘서 든든했어. 다음엔 더 멀리 달려보자.',
    location: '한강공원',
    completedAt: new Date(2025, 11, 7, 14, 42),
  },
];

export default useMemoryStore;
