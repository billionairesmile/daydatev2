import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CompletedMission, MemoryState, Mission, MissionCategory } from '@/types';
import { db, isInTestMode } from '@/lib/supabase';

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
export const dbToCompletedMission = (record: Record<string, unknown>): CompletedMission => {
  const missionData = record.mission_data as Record<string, unknown> | null;

  const mission: Mission = missionData
    ? {
      id: (missionData.id as string) || record.id as string,
      title: (missionData.title as string) || '미션',
      description: (missionData.description as string) || '',
      category: ((missionData.category as string) || 'home') as MissionCategory,
      tags: (missionData.tags as string[]) || [],
      imageUrl: (missionData.imageUrl as string) || '',
      isPremium: false,
    }
    : {
      id: record.id as string,
      title: '미션',
      description: '',
      category: 'home' as MissionCategory,
      tags: [],
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
        set((state) => {
          // Check for duplicates - skip if memory with same ID already exists
          if (state.memories.some((m) => m.id === memory.id)) {
            console.log('[MemoryStore] Skipping duplicate memory:', memory.id);
            return state;
          }
          return {
            memories: [memory, ...state.memories],
          };
        }),

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
        if (isInTestMode()) {
          return; // Use local data in demo/test mode
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
  // 2026년 1월 테스트 샘플 (연도 표시 테스트용)
  {
    id: '2026-01-sample',
    coupleId: 'sample-couple',
    missionId: '2026-01',
    mission: {
      id: '2026-01',
      title: '새해 첫 데이트',
      description: '2026년의 첫 데이트를 함께 즐겨보세요.',
      category: 'outdoor' as MissionCategory,
      tags: ['새해', '2026', '첫데이트'],
      imageUrl: 'https://i.postimg.cc/VNbTxMsK/Gemini-Generated-Image-61p7xg61p7xg61p7.png',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/VNbTxMsK/Gemini-Generated-Image-61p7xg61p7xg61p7.png',
    user1Message: '2026년 첫 데이트! 올해도 너와 함께여서 행복해.',
    user2Message: '새해 첫날부터 너랑 함께라니 올해도 좋은 일만 가득할 것 같아.',
    location: '서울 용산구',
    completedAt: new Date(2026, 0, 15, 14, 30), // 2026년 1월 15일
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
      tags: ['드라이브', '야경', '로맨틱'],
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
      tags: ['크리스마스', '트리', '겨울'],
      imageUrl: 'https://i.postimg.cc/VNbTxMsK/Gemini-Generated-Image-61p7xg61p7xg61p7.png',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/VNbTxMsK/Gemini-Generated-Image-61p7xg61p7xg61p7.png',
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
      category: 'sports' as MissionCategory,
      tags: ['응원', '스포츠', '함께'],
      imageUrl: 'https://i.postimg.cc/tgVfKPRk/Gemini-Generated-Image-62iywb62iywb62iy-(1).png',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/tgVfKPRk/Gemini-Generated-Image-62iywb62iywb62iy-(1).png',
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
      category: 'cooking' as MissionCategory,
      tags: ['요리', '홈파티', '함께'],
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
      tags: ['기념일', '휴식', '여행'],
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
      category: 'restaurant' as MissionCategory,
      tags: ['레스토랑', '맛집', '데이트'],
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
      tags: ['콘서트', '축제', '공연'],
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
      title: '운명에 맡긴 오늘의 한 잔',
      description: '눈 감고 메뉴판을 짚어 나온 음료 마시기',
      category: 'cafe' as MissionCategory,
      tags: ['카페', '랜덤', '도전'],
      imageUrl: 'https://i.postimg.cc/25ybrQ1k/IMG-4665.jpg',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/25ybrQ1k/IMG-4665.jpg',
    user1Message: '눈 감고 메뉴 찍는데 긴장됐는데, 네가 웃어주니까 다 괜찮았어. 뭐든 같이 골라주자',
    user2Message: '이상한 조합 나와도 너랑이면 맛있을 것 같았어. 오늘도 웃긴 추억 하나 생겼다!',
    location: '부산 광진구',
    completedAt: new Date(2025, 10, 7, 15, 20),
  },
  {
    id: '10',
    coupleId: 'sample-couple',
    missionId: '10',
    mission: {
      id: '10',
      title: '멜로디 따라, 바퀴 따라',
      description: '노래 들으며 함께 자전거 타기',
      category: 'fitness' as MissionCategory,
      tags: ['자전거', '음악', '운동'],
      imageUrl: 'https://i.postimg.cc/zBvLDJMk/IMG-9631.jpg',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/zBvLDJMk/IMG-9631.jpg',
    user1Message: '바람 맞으며 네 옆에서 달리니까 마음까지 시원해졌어. 노래 틀어주던 네 모습 잊지 못할 것 같아',
    user2Message: '자전거 타면서 이렇게 행복할 줄 몰랐어. 네 뒷모습 따라가는 것도 좋았고, 다음엔 더 멀리 가보자!',
    location: '대전 유성구',
    completedAt: new Date(2025, 10, 16, 14, 30),
  },
  {
    id: '11',
    coupleId: 'sample-couple',
    missionId: '11',
    mission: {
      id: '11',
      title: '카페에서, 우리의 내년을 그리며',
      description: '카페에서 함께 새해 버킷리스트 작성하기',
      category: 'cafe' as MissionCategory,
      tags: ['카페', '버킷리스트', '계획'],
      imageUrl: 'https://i.postimg.cc/R0X6z3Pp/IMG-3469.jpg',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/R0X6z3Pp/IMG-3469.jpg',
    user1Message: '내년에 하고 싶은 것들 적으면서 벌써 두근거렸어. 다 너랑 함께라서 기대돼!',
    user2Message: '버킷리스트 쓰면서 내년이 벌써 기다려졌어. 하나씩 같이 이뤄가자, 사랑해',
    location: '전주 완산구',
    completedAt: new Date(2025, 10, 17, 16, 45),
  },
  {
    id: '12',
    coupleId: 'sample-couple',
    missionId: '12',
    mission: {
      id: '12',
      title: '마이크 하나, 두 목소리의 하모니',
      description: '노래방에서 듀엣곡 부르기',
      category: 'game' as MissionCategory,
      tags: ['노래방', '듀엣', '데이트'],
      imageUrl: 'https://i.postimg.cc/Dz0Jnr8t/IMG-3500.jpg',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/Dz0Jnr8t/IMG-3500.jpg',
    user1Message: '듀엣곡 부르면서 네 목소리에 맞춰 부르니까 심장이 콩닥거렸어. 목 쉬어도 행복해!',
    user2Message: '같이 노래 부르니까 시간 가는 줄 몰랐어. 우리 노래방 정규화하자, 다음엔 발라드 도전!',
    location: '대전 유성구',
    completedAt: new Date(2025, 10, 19, 20, 30),
  },
  {
    id: '13',
    coupleId: 'sample-couple',
    missionId: '13',
    mission: {
      id: '13',
      title: '귀여운 친구들 사이, 우리의 하루',
      description: '토끼농장에서 함께 동물 체험하기',
      category: 'outdoor' as MissionCategory,
      tags: ['토끼', '농장', '체험'],
      imageUrl: 'https://i.postimg.cc/j2HCZvFn/IMG-4613.avif',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/j2HCZvFn/IMG-4613.avif',
    user1Message: '토끼들 먹이주면서 환하게 웃는 네 모습이 자꾸 생각나. 오늘 힐링 제대로 했다!',
    user2Message: '귀여운 동물들 보면서 힐링했는데, 사실 제일 귀여운 건 너였어. 또 오자!',
    location: '제주시 애월읍',
    completedAt: new Date(2025, 10, 2, 13, 15),
  },
  {
    id: '14',
    coupleId: 'sample-couple',
    missionId: '14',
    mission: {
      id: '14',
      title: '같은 페이지, 다른 생각, 그리고 우리',
      description: '함께 책 읽고 감상 나누기',
      category: 'cafe' as MissionCategory,
      tags: ['독서', '북카페', '대화'],
      imageUrl: 'https://i.postimg.cc/Bb9XTRML/IMG-4643.avif',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/Bb9XTRML/IMG-4643.avif',
    user1Message: '같은 책 읽으면서 감상 나누니까 너를 더 알게 된 것 같아. 이런 시간이 좋아',
    user2Message: '조용히 옆에서 책 읽는 시간이 생각보다 로맨틱했어. 서로의 취향을 알아가는 느낌!',
    location: '대구 수성구',
    completedAt: new Date(2025, 10, 22, 15, 40),
  },
  {
    id: '15',
    coupleId: 'sample-couple',
    missionId: '15',
    mission: {
      id: '15',
      title: '나란히 앉아, 함께 누르는 키보드',
      description: 'PC방에서 함께 게임하기',
      category: 'game' as MissionCategory,
      tags: ['PC방', '게임', '데이트'],
      imageUrl: 'https://i.postimg.cc/SRYQvd1t/IMG-3503.jpg',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/SRYQvd1t/IMG-3503.jpg',
    user1Message: '솔직히 게임 집중 안 됐어. 네가 웃으면서 하는 모습 보느라 바빴거든!',
    user2Message: '옆에서 같이 게임하니까 혼자 할 때보다 100배 재밌었어. 우리 팀플 최고야!',
    location: '서울 용산구',
    completedAt: new Date(2025, 10, 23, 19, 25),
  },
  {
    id: '16',
    coupleId: 'sample-couple',
    missionId: '16',
    mission: {
      id: '16',
      title: '얼음 위를 미끄러지는 우리의 겨울',
      description: '아이스링크에서 스케이트 타기',
      category: 'sports' as MissionCategory,
      tags: ['스케이트', '겨울', '운동'],
      imageUrl: 'https://i.postimg.cc/kGRMpsYZ/IMG-9044.jpg',
      isPremium: false,
    },
    photoUrl: 'https://i.postimg.cc/kGRMpsYZ/IMG-9044.jpg',
    user1Message: '넘어질 뻔했는데 잡아줘서 심장이 두 번 뛰었어. 추운데도 손잡고 타니까 따뜻했어',
    user2Message: '처음엔 무서웠는데 네가 잡아주니까 금방 적응됐어. 겨울마다 같이 타러 오자!',
    location: '대전 서구',
    completedAt: new Date(2025, 10, 29, 17, 50),
  },
];

export default useMemoryStore;
