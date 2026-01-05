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
          console.log('[MemoryStore] addMemory called with id:', memory.id, 'photoUrl:', memory.photoUrl?.substring(0, 50));
          console.log('[MemoryStore] Current memories count:', state.memories.length);

          // Check for duplicates - skip if memory with same ID already exists
          if (state.memories.some((m) => m.id === memory.id)) {
            console.log('[MemoryStore] Skipping duplicate memory:', memory.id);
            return state;
          }

          console.log('[MemoryStore] Adding new memory, new count will be:', state.memories.length + 1);
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
            // Clear memories when database returns empty (e.g., after deletion)
            set({ memories: [], isLoading: false });
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

// Empty sample memories array (removed for production)
export const SAMPLE_MEMORIES: CompletedMission[] = [];

export default useMemoryStore;
