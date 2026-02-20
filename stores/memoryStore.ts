import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DateRecord, MemoryState } from '@/types';

interface MemoryActions {
  setMemories: (memories: DateRecord[]) => void;
  addMemory: (memory: DateRecord) => void;
  deleteMemory: (memoryId: string) => void;
  setSelectedMemory: (memory: DateRecord | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  getMemoriesByMonth: (year: number, month: number) => DateRecord[];
  loadFromDB: (coupleId: string) => Promise<void>;
  reset: () => void;
}

const initialState: MemoryState = {
  memories: [],
  selectedMemory: null,
  isLoading: false,
  error: null,
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

      // Load memories - uses locally persisted data only (no DB query)
      loadFromDB: async (_coupleId: string) => {
        set({ isLoading: false, error: null });
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
export const SAMPLE_MEMORIES: DateRecord[] = [];

export default useMemoryStore;
