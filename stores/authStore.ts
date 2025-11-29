import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User, Couple, UserPreferences, AuthState } from '@/types';

interface AuthActions {
  // Authentication
  setUser: (user: User | null) => void;
  setCouple: (couple: Couple | null) => void;
  setPartner: (partner: User | null) => void;
  setIsAuthenticated: (isAuthenticated: boolean) => void;
  setIsOnboardingComplete: (isComplete: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;

  // User actions
  updateUserPreferences: (preferences: Partial<UserPreferences>) => void;
  updateNickname: (nickname: string) => void;
  updateAvatar: (avatarUrl: string) => void;

  // Couple actions
  updateAnniversary: (date: Date, type: string) => void;

  // Session
  signOut: () => void;
  reset: () => void;
}

const initialState: AuthState = {
  user: null,
  couple: null,
  partner: null,
  isAuthenticated: false,
  isOnboardingComplete: false,
  isLoading: false,
  error: null,
};

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Authentication setters
      setUser: (user) => set({ user }),
      setCouple: (couple) => set({ couple }),
      setPartner: (partner) => set({ partner }),
      setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      setIsOnboardingComplete: (isComplete) => set({ isOnboardingComplete: isComplete }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),

      // User actions
      updateUserPreferences: (preferences) => {
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: {
              ...currentUser,
              preferences: {
                ...currentUser.preferences,
                ...preferences,
              },
            },
          });
        }
      },

      updateNickname: (nickname) => {
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: {
              ...currentUser,
              nickname,
            },
          });
        }
      },

      updateAvatar: (avatarUrl) => {
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: {
              ...currentUser,
              avatarUrl,
            },
          });
        }
      },

      // Couple actions
      updateAnniversary: (date, type) => {
        const currentCouple = get().couple;
        if (currentCouple) {
          set({
            couple: {
              ...currentCouple,
              anniversaryDate: date,
              anniversaryType: type as Couple['anniversaryType'],
            },
          });
        }
      },

      // Session
      signOut: () => {
        set({
          ...initialState,
          isOnboardingComplete: false,
        });
      },

      reset: () => set(initialState),
    }),
    {
      name: 'daydate-auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        couple: state.couple,
        partner: state.partner,
        isAuthenticated: state.isAuthenticated,
        isOnboardingComplete: state.isOnboardingComplete,
      }),
    }
  )
);

export default useAuthStore;
