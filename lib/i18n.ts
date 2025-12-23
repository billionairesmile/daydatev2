import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import ko from '@/locales/ko.json';
import en from '@/locales/en.json';
import es from '@/locales/es.json';

const resources = {
  ko: { translation: ko },
  en: { translation: en },
  es: { translation: es },
};

// Get device language (ko, en, es, etc.)
const getDeviceLanguage = (): string => {
  const locales = Localization.getLocales();
  if (locales && locales.length > 0) {
    const languageCode = locales[0].languageCode;
    // Support Korean, English, and Spanish
    if (languageCode === 'ko') return 'ko';
    if (languageCode === 'es') return 'es';
  }
  return 'en'; // Default to English
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getDeviceLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
