import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '@/lib/i18n';

// Supported languages
export type SupportedLanguage = 'ko' | 'en' | 'es';

// Country codes for culture-specific content
export type CountryCode = 'KR' | 'US' | 'GB' | 'AU' | 'CA' | 'DEFAULT';

interface LanguageState {
  // User's selected language (for UI and missions)
  language: SupportedLanguage;
  // Detected country from location (for culture-specific missions)
  detectedCountry: CountryCode;
  // Whether user has manually set language (override auto-detection)
  isManuallySet: boolean;

  // Actions
  setLanguage: (language: SupportedLanguage) => void;
  setDetectedCountry: (country: CountryCode) => void;
  resetToDeviceLanguage: () => void;
}

// Get device language
const getDeviceLanguage = (): SupportedLanguage => {
  try {
    const Localization = require('expo-localization');
    const locales = Localization.getLocales();
    if (locales && locales.length > 0) {
      const languageCode = locales[0].languageCode;
      if (languageCode === 'ko') return 'ko';
      if (languageCode === 'es') return 'es';
    }
  } catch (e) {
    console.log('[LanguageStore] Failed to get device language:', e);
  }
  return 'en';
};

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: getDeviceLanguage(),
      detectedCountry: 'DEFAULT',
      isManuallySet: false,

      setLanguage: (language: SupportedLanguage) => {
        // Update i18n language
        i18n.changeLanguage(language);
        set({ language, isManuallySet: true });
      },

      setDetectedCountry: (country: CountryCode) => {
        set({ detectedCountry: country });
      },

      resetToDeviceLanguage: () => {
        const deviceLanguage = getDeviceLanguage();
        i18n.changeLanguage(deviceLanguage);
        set({ language: deviceLanguage, isManuallySet: false });
      },
    }),
    {
      name: 'language-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        // When store is rehydrated, sync i18n with stored language
        if (state?.language) {
          i18n.changeLanguage(state.language);
        }
      },
    }
  )
);

// Helper: Map country code to language (for missions)
export const getLanguageForCountry = (country: CountryCode): SupportedLanguage => {
  switch (country) {
    case 'KR':
      return 'ko';
    case 'US':
    case 'GB':
    case 'AU':
    case 'CA':
    default:
      return 'en';
  }
};

// Helper: Get language display name
export const getLanguageDisplayName = (language: SupportedLanguage): string => {
  switch (language) {
    case 'ko':
      return '한국어';
    case 'en':
      return 'English';
    case 'es':
      return 'Español';
    default:
      return 'English';
  }
};
