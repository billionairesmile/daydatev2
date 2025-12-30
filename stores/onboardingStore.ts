import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Types
export type RelationshipType = 'dating' | 'married' | 'friendship';

export type ActivityType =
  | 'home'
  | 'cafe_restaurant'
  | 'outdoor'
  | 'culture'
  | 'activity'
  | 'home_activity'
  | 'travel'
  | 'drive'
  | 'shopping'
  | 'cooking'
  | 'sports'
  | 'nightlife'
  | 'healing'
  | 'photo'
  | 'learning';

export type DateWorry =
  | 'no_idea'
  | 'same_pattern'
  | 'budget'
  | 'time'
  | 'talk'
  | 'none';

export type Constraint =
  | 'none'
  | 'pet'
  | 'child'
  | 'long_distance'
  | 'far_distance'
  | 'no_car'
  | 'no_alcohol'
  | 'avoid_crowd';

export type CalendarType = 'solar' | 'lunar';
export type Gender = 'male' | 'female';

export interface OnboardingData {
  // Step A - Required
  loginProvider?: 'kakao' | 'google';
  nickname: string;
  gender: Gender | null;
  birthDate: Date | null;
  birthDateCalendarType: CalendarType;
  pairingCode: string;
  isCreatingCode: boolean;
  isPairingConnected: boolean; // True when pairing is successfully established
  relationshipType: RelationshipType;
  anniversaryDate: Date | null;

  // Terms & Consent
  ageVerified: boolean; // 만 14세 이상 확인
  termsAgreed: boolean; // 서비스 이용약관
  locationTermsAgreed: boolean; // 위치기반 서비스 이용약관
  privacyAgreed: boolean; // 개인정보 수집 및 이용
  marketingAgreed: boolean; // 광고성 알림 수신 (선택)

  // Step B - Preferences (Skippable)
  mbti: string;
  activityTypes: ActivityType[];
  dateWorries: DateWorry[];
  constraints: Constraint[];

  // Meta
  preferencesCompleted: boolean;
}

export type OnboardingStep =
  | 'welcome'
  | 'login'
  | 'terms'
  | 'basic_info'
  | 'pairing'
  | 'couple_info'
  | 'preferences_intro'
  | 'mbti'
  | 'activity_type'
  | 'date_worries'
  | 'constraints'
  | 'complete';

interface OnboardingState {
  currentStep: OnboardingStep;
  data: OnboardingData;
  _hasHydrated: boolean;
}

interface OnboardingActions {
  setStep: (step: OnboardingStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateData: (data: Partial<OnboardingData>) => void;
  reset: () => void;
  skipPreferences: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

const initialData: OnboardingData = {
  loginProvider: undefined,
  nickname: '',
  gender: null,
  birthDate: null,
  birthDateCalendarType: 'solar',
  pairingCode: '',
  isCreatingCode: true,
  isPairingConnected: false,
  relationshipType: 'dating',
  anniversaryDate: null,
  // Terms & Consent
  ageVerified: false,
  termsAgreed: false,
  locationTermsAgreed: false,
  privacyAgreed: false,
  marketingAgreed: false,
  // Preferences
  mbti: '',
  activityTypes: [],
  dateWorries: [],
  constraints: [],
  preferencesCompleted: false,
};

const initialState: OnboardingState = {
  currentStep: 'welcome',
  data: initialData,
  _hasHydrated: false,
};

// Step order for navigation
const stepOrderA: OnboardingStep[] = [
  'welcome',
  'login',
  'pairing',
  'basic_info',
  'couple_info',
  'preferences_intro',
];

const stepOrderB: OnboardingStep[] = [
  'mbti',
  'activity_type',
  'date_worries',
  'constraints',
  'complete',
];

const allSteps = [...stepOrderA, ...stepOrderB];

export const useOnboardingStore = create<OnboardingState & OnboardingActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setStep: (step) => set({ currentStep: step }),

      nextStep: () => {
        const currentIndex = allSteps.indexOf(get().currentStep);
        if (currentIndex < allSteps.length - 1) {
          set({ currentStep: allSteps[currentIndex + 1] });
        }
      },

      prevStep: () => {
        const currentIndex = allSteps.indexOf(get().currentStep);
        if (currentIndex > 0) {
          set({ currentStep: allSteps[currentIndex - 1] });
        }
      },

      updateData: (newData) => {
        set((state) => ({
          data: { ...state.data, ...newData },
        }));
      },

      reset: () => set({
        ...initialState,
        _hasHydrated: true, // Preserve hydration state when resetting to avoid pairing screen flash
      }),

      skipPreferences: () => {
        set({ currentStep: 'complete' });
      },

      setHasHydrated: (hasHydrated) => set({ _hasHydrated: hasHydrated }),
    }),
    {
      name: 'daydate-onboarding-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        currentStep: state.currentStep,
        data: state.data,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// Helper functions
export const generatePairingCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const MBTI_OPTIONS = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
];

export const ACTIVITY_TYPE_OPTIONS: { id: ActivityType; labelKey: string; icon: string }[] = [
  { id: 'home', labelKey: 'onboarding.activityTypes.home', icon: '🏠' },
  { id: 'cafe_restaurant', labelKey: 'onboarding.activityTypes.cafe_restaurant', icon: '☕' },
  { id: 'outdoor', labelKey: 'onboarding.activityTypes.outdoor', icon: '🌳' },
  { id: 'culture', labelKey: 'onboarding.activityTypes.culture', icon: '🎬' },
  { id: 'activity', labelKey: 'onboarding.activityTypes.activity', icon: '⚽' },
  { id: 'home_activity', labelKey: 'onboarding.activityTypes.home_activity', icon: '🎲' },
  { id: 'travel', labelKey: 'onboarding.activityTypes.travel', icon: '✈️' },
  { id: 'drive', labelKey: 'onboarding.activityTypes.drive', icon: '🚗' },
  { id: 'shopping', labelKey: 'onboarding.activityTypes.shopping', icon: '🛍️' },
  { id: 'cooking', labelKey: 'onboarding.activityTypes.cooking', icon: '🍳' },
  { id: 'sports', labelKey: 'onboarding.activityTypes.sports', icon: '🏃' },
  { id: 'nightlife', labelKey: 'onboarding.activityTypes.nightlife', icon: '🍷' },
  { id: 'healing', labelKey: 'onboarding.activityTypes.healing', icon: '🧘' },
  { id: 'photo', labelKey: 'onboarding.activityTypes.photo', icon: '📸' },
  { id: 'learning', labelKey: 'onboarding.activityTypes.learning', icon: '📚' },
];

export const DATE_WORRY_OPTIONS: { id: DateWorry; labelKey: string; icon: string }[] = [
  { id: 'no_idea', labelKey: 'onboarding.dateWorries.no_idea', icon: '🤔' },
  { id: 'same_pattern', labelKey: 'onboarding.dateWorries.same_pattern', icon: '💁🏻' },
  { id: 'budget', labelKey: 'onboarding.dateWorries.budget', icon: '💵' },
  { id: 'time', labelKey: 'onboarding.dateWorries.time', icon: '⏰' },
  { id: 'talk', labelKey: 'onboarding.dateWorries.talk', icon: '💬' },
  { id: 'none', labelKey: 'onboarding.dateWorries.none', icon: '✨' },
];

export const CONSTRAINT_OPTIONS: { id: Constraint; labelKey: string; icon: string }[] = [
  { id: 'pet', labelKey: 'onboarding.constraints.pet', icon: '🐾' },
  { id: 'child', labelKey: 'onboarding.constraints.child', icon: '👶' },
  { id: 'long_distance', labelKey: 'onboarding.constraints.long_distance', icon: '✈️' },
  { id: 'no_car', labelKey: 'onboarding.constraints.no_car', icon: '🚘' },
  { id: 'no_alcohol', labelKey: 'onboarding.constraints.no_alcohol', icon: '🍻' },
  { id: 'none', labelKey: 'onboarding.constraints.none', icon: '❌' },
];

export default useOnboardingStore;
