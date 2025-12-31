import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '@/lib/i18n';
import { db, isDemoMode } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Supported languages
export type SupportedLanguage = 'ko' | 'en' | 'es' | 'zh-TW' | 'ja';

// Country codes for culture-specific content
export type CountryCode = 'KR' | 'US' | 'GB' | 'AU' | 'CA' | 'TW' | 'HK' | 'JP' | 'DEFAULT';

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
  syncLanguageToDatabase: () => Promise<void>;
}

// Sync language to database for push notification localization
const syncLanguageToDatabase = async (language: SupportedLanguage) => {
  if (isDemoMode) return;

  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    console.log('[LanguageStore] No user ID, skipping database sync');
    return;
  }

  try {
    const { error } = await db.profiles.update(userId, { language });
    if (error) {
      console.error('[LanguageStore] Failed to sync language to database:', error);
    } else {
      console.log('[LanguageStore] Language synced to database:', language);
    }
  } catch (e) {
    console.error('[LanguageStore] Error syncing language to database:', e);
  }
};

// Get device language
const getDeviceLanguage = (): SupportedLanguage => {
  try {
    const Localization = require('expo-localization');
    const locales = Localization.getLocales();
    if (locales && locales.length > 0) {
      const locale = locales[0];
      const languageCode = locale.languageCode;
      const regionCode = locale.regionCode;

      if (languageCode === 'ko') return 'ko';
      if (languageCode === 'ja') return 'ja';
      if (languageCode === 'es') return 'es';
      // Traditional Chinese for Taiwan, Hong Kong, Macau
      if (languageCode === 'zh' && (regionCode === 'TW' || regionCode === 'HK' || regionCode === 'MO')) {
        return 'zh-TW';
      }
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
        // Sync to database for push notification localization
        syncLanguageToDatabase(language);
      },

      setDetectedCountry: (country: CountryCode) => {
        set({ detectedCountry: country });
      },

      resetToDeviceLanguage: () => {
        const deviceLanguage = getDeviceLanguage();
        i18n.changeLanguage(deviceLanguage);
        set({ language: deviceLanguage, isManuallySet: false });
        // Sync to database for push notification localization
        syncLanguageToDatabase(deviceLanguage);
      },

      syncLanguageToDatabase: async () => {
        const { language } = get();
        await syncLanguageToDatabase(language);
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
    case 'JP':
      return 'ja';
    case 'TW':
    case 'HK':
      return 'zh-TW';
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
    case 'zh-TW':
      return '繁體中文';
    case 'ja':
      return '日本語';
    default:
      return 'English';
  }
};
