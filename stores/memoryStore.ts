import { create } from 'zustand';
import type { CompletedMission, MemoryState } from '@/types';

interface MemoryActions {
  setMemories: (memories: CompletedMission[]) => void;
  addMemory: (memory: CompletedMission) => void;
  setSelectedMemory: (memory: CompletedMission | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  getMemoriesByMonth: (year: number, month: number) => CompletedMission[];
  reset: () => void;
}

const initialState: MemoryState = {
  memories: [],
  selectedMemory: null,
  isLoading: false,
  error: null,
};

export const useMemoryStore = create<MemoryState & MemoryActions>()((set, get) => ({
  ...initialState,

  setMemories: (memories) => set({ memories }),

  addMemory: (memory) =>
    set((state) => ({
      memories: [memory, ...state.memories],
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

  reset: () => set(initialState),
}));

// Sample memories for development/testing
export const SAMPLE_MEMORIES: CompletedMission[] = [
  // November 2025 - 20 photos
  {
    id: '1',
    coupleId: 'sample-couple',
    missionId: '1',
    photoUrl: 'https://images.unsplash.com/photo-1548051072-b34898021f8b?w=800',
    user1Message: '오늘 정말 재밌었어! 이 카페 분위기 너무 좋아',
    user2Message: '나도 너무 좋았어. 다음에 또 오자 💕',
    location: '서울 성수동',
    completedAt: new Date(2025, 10, 26, 14, 30),
  },
  {
    id: '2',
    coupleId: 'sample-couple',
    missionId: '2',
    photoUrl: 'https://images.unsplash.com/photo-1693852512019-cb0eccc97e8f?w=800',
    user1Message: '너랑 보는 노을이 제일 예뻐',
    user2Message: '나도 이 순간 영원히 기억할게 🌅',
    location: '한강공원',
    completedAt: new Date(2025, 10, 25, 17, 45),
  },
  {
    id: '3',
    coupleId: 'sample-couple',
    missionId: '3',
    photoUrl: 'https://images.unsplash.com/photo-1687338216550-7a485e952d79?w=800',
    user1Message: '정상까지 함께해서 힘이 났어!',
    user2Message: '다음엔 더 높은 산도 도전해보자 💪',
    location: '북한산',
    completedAt: new Date(2025, 10, 24, 11, 20),
  },
  {
    id: '4',
    coupleId: 'sample-couple',
    missionId: '4',
    photoUrl: 'https://images.unsplash.com/photo-1544824970-97b1c7bbd6ba?w=800',
    user1Message: '오늘 밤 너무 특별했어 ✨',
    user2Message: '당신과 함께라서 매일이 특별해요',
    location: '이태원 레스토랑',
    completedAt: new Date(2025, 10, 23, 19, 0),
  },
  {
    id: '5',
    coupleId: 'sample-couple',
    missionId: '5',
    photoUrl: 'https://images.unsplash.com/photo-1761569443180-9baa5be7a87f?w=800',
    user1Message: '바다 소리 들으며 너랑 있는 이 순간 🌊',
    user2Message: '정말 행복해! 사랑해 ❤️',
    location: '양양 해변',
    completedAt: new Date(2025, 10, 22, 15, 30),
  },
  {
    id: '6',
    coupleId: 'sample-couple',
    missionId: '6',
    photoUrl: 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=800',
    user1Message: '우리 첫 크리스마스 마켓! 🎄',
    user2Message: '핫초코 맛있었어 ☕',
    location: '명동 크리스마스 마켓',
    completedAt: new Date(2025, 10, 21, 18, 0),
  },
  {
    id: '7',
    coupleId: 'sample-couple',
    missionId: '7',
    photoUrl: 'https://images.unsplash.com/photo-1529634806980-85c3dd6d34ac?w=800',
    user1Message: '맛있는 브런치 데이트 🥞',
    user2Message: '여기 또 오자! 팬케이크 최고',
    location: '연남동 브런치 카페',
    completedAt: new Date(2025, 10, 20, 11, 30),
  },
  {
    id: '8',
    coupleId: 'sample-couple',
    missionId: '8',
    photoUrl: 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=800',
    user1Message: '영화 너무 재밌었어!',
    user2Message: '다음엔 뭐 볼까? 🎬',
    location: 'CGV 용산',
    completedAt: new Date(2025, 10, 19, 20, 0),
  },
  {
    id: '9',
    coupleId: 'sample-couple',
    missionId: '9',
    photoUrl: 'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?w=800',
    user1Message: '오늘 요리 성공! 👨‍🍳',
    user2Message: '우리 집밥 최고야 🍳',
    location: '우리집',
    completedAt: new Date(2025, 10, 18, 19, 30),
  },
  {
    id: '10',
    coupleId: 'sample-couple',
    missionId: '10',
    photoUrl: 'https://images.unsplash.com/photo-1474552226712-ac0f0961a954?w=800',
    user1Message: '공원 산책 좋았어 🌳',
    user2Message: '날씨 완벽했어!',
    location: '올림픽공원',
    completedAt: new Date(2025, 10, 17, 15, 0),
  },
  {
    id: '11',
    coupleId: 'sample-couple',
    missionId: '11',
    photoUrl: 'https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?w=800',
    user1Message: '전시회 너무 좋았어 🎨',
    user2Message: '다음엔 또 다른 전시 가자',
    location: '국립현대미술관',
    completedAt: new Date(2025, 10, 16, 14, 0),
  },
  {
    id: '12',
    coupleId: 'sample-couple',
    missionId: '12',
    photoUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800',
    user1Message: '스테이크 맛있었어 🥩',
    user2Message: '생일 축하해! 🎂',
    location: '압구정 스테이크하우스',
    completedAt: new Date(2025, 10, 15, 19, 0),
  },
  {
    id: '13',
    coupleId: 'sample-couple',
    missionId: '13',
    photoUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
    user1Message: '드라이브 최고! 🚗',
    user2Message: '바다 보러 또 가자',
    location: '강릉 해안도로',
    completedAt: new Date(2025, 10, 14, 16, 0),
  },
  {
    id: '14',
    coupleId: 'sample-couple',
    missionId: '14',
    photoUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800',
    user1Message: '커피 한 잔의 여유 ☕',
    user2Message: '이 카페 분위기 좋다',
    location: '을지로 카페',
    completedAt: new Date(2025, 10, 13, 15, 0),
  },
  {
    id: '15',
    coupleId: 'sample-couple',
    missionId: '15',
    photoUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800',
    user1Message: '운동 같이 하니까 좋아 💪',
    user2Message: '매일 같이 하자!',
    location: '한강 러닝',
    completedAt: new Date(2025, 10, 12, 7, 0),
  },
  {
    id: '16',
    coupleId: 'sample-couple',
    missionId: '16',
    photoUrl: 'https://images.unsplash.com/photo-1533777857889-4be7c70b33f7?w=800',
    user1Message: '맛집 탐방 성공! 🍜',
    user2Message: '여기 또 와야해',
    location: '을지로 맛집',
    completedAt: new Date(2025, 10, 11, 13, 0),
  },
  {
    id: '17',
    coupleId: 'sample-couple',
    missionId: '17',
    photoUrl: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800',
    user1Message: '집에서 영화 보기 🍿',
    user2Message: '이불 밖은 위험해',
    location: '우리집',
    completedAt: new Date(2025, 10, 10, 21, 0),
  },
  {
    id: '18',
    coupleId: 'sample-couple',
    missionId: '18',
    photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800',
    user1Message: '인생샷 건졌다! 📸',
    user2Message: '넌 언제나 예뻐',
    location: '익선동',
    completedAt: new Date(2025, 10, 9, 16, 0),
  },
  {
    id: '19',
    coupleId: 'sample-couple',
    missionId: '19',
    photoUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
    user1Message: '파스타 맛있었어 🍝',
    user2Message: '이탈리안 최고!',
    location: '한남동 레스토랑',
    completedAt: new Date(2025, 10, 8, 19, 0),
  },
  {
    id: '20',
    coupleId: 'sample-couple',
    missionId: '20',
    photoUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
    user1Message: '와인 한 잔 🍷',
    user2Message: '분위기 좋다',
    location: '청담 와인바',
    completedAt: new Date(2025, 10, 7, 20, 0),
  },
  // October 2025
  {
    id: '21',
    coupleId: 'sample-couple',
    missionId: '21',
    photoUrl: 'https://images.unsplash.com/photo-1666094324130-2d0a983d97d8?w=800',
    user1Message: '가을 단풍만큼 예쁜 사람과 함께 🍂',
    user2Message: '나도 너무 행복했어! 가을 사랑해',
    location: '남이섬',
    completedAt: new Date(2025, 9, 28, 15, 0),
  },
];

export default useMemoryStore;
