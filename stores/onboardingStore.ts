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
}

interface OnboardingActions {
  setStep: (step: OnboardingStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateData: (data: Partial<OnboardingData>) => void;
  reset: () => void;
  skipPreferences: () => void;
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
};

// Step order for navigation
const stepOrderA: OnboardingStep[] = [
  'welcome',
  'login',
  'terms',
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

      reset: () => set(initialState),

      skipPreferences: () => {
        set({ currentStep: 'complete' });
      },
    }),
    {
      name: 'daydate-onboarding-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        currentStep: state.currentStep,
        data: state.data,
      }),
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

export const ACTIVITY_TYPE_OPTIONS: { id: ActivityType; label: string; icon: string }[] = [
  { id: 'home', label: '집콕', icon: '🏠' },
  { id: 'cafe_restaurant', label: '카페·식당', icon: '☕' },
  { id: 'outdoor', label: '야외 활동', icon: '🌳' },
  { id: 'culture', label: '문화생활', icon: '🎬' },
  { id: 'activity', label: '액티비티', icon: '⚽' },
  { id: 'home_activity', label: '집에서 만드는 활동', icon: '🎲' },
  { id: 'travel', label: '여행', icon: '✈️' },
  { id: 'drive', label: '드라이브', icon: '🚗' },
  { id: 'shopping', label: '쇼핑·구경', icon: '🛍️' },
  { id: 'cooking', label: '요리·베이킹', icon: '🍳' },
  { id: 'sports', label: '운동·스포츠', icon: '🏃' },
  { id: 'nightlife', label: '술·나이트라이프', icon: '🍷' },
  { id: 'healing', label: '힐링·스파', icon: '🧘' },
  { id: 'photo', label: '사진·영상', icon: '📸' },
  { id: 'learning', label: '배움·클래스', icon: '📚' },
];

export const DATE_WORRY_OPTIONS: { id: DateWorry; label: string; icon: string }[] = [
  { id: 'no_idea', label: '뭐 할지 모르겠어요', icon: '🤔' },
  { id: 'same_pattern', label: '맨날 비슷한 거만 해요', icon: '💁🏻' },
  { id: 'budget', label: '돈이 부담돼요', icon: '💵' },
  { id: 'time', label: '시간이 부족해요', icon: '⏰' },
  { id: 'talk', label: '대화가 필요해요', icon: '💬' },
  { id: 'none', label: '딱히 없어요! 그냥 더 재밌게 놀고싶어요', icon: '✨' },
];

export const CONSTRAINT_OPTIONS: { id: Constraint; label: string; icon: string }[] = [
  { id: 'pet', label: '반려동물', icon: '🐾' },
  { id: 'child', label: '아이 있음', icon: '👶' },
  { id: 'long_distance', label: '장거리', icon: '✈️' },
  { id: 'no_car', label: '차/면허 없음', icon: '🚘' },
  { id: 'no_alcohol', label: '술 안함', icon: '🍻' },
  { id: 'none', label: '없음', icon: '❌' },
];

export default useOnboardingStore;
