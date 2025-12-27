import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import ko from '@/locales/ko.json';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import zhTW from '@/locales/zh-TW.json';
import ja from '@/locales/ja.json';

const resources = {
  ko: { translation: ko },
  en: { translation: en },
  es: { translation: es },
  'zh-TW': { translation: zhTW },
  ja: { translation: ja },
};

// Get device language (ko, en, es, zh-TW, ja, etc.)
const getDeviceLanguage = (): string => {
  const locales = Localization.getLocales();
  if (locales && locales.length > 0) {
    const locale = locales[0];
    const languageCode = locale.languageCode;
    const regionCode = locale.regionCode;

    // Support Korean, English, Spanish, Traditional Chinese, and Japanese
    if (languageCode === 'ko') return 'ko';
    if (languageCode === 'ja') return 'ja';
    if (languageCode === 'es') return 'es';
    // Traditional Chinese for Taiwan, Hong Kong, Macau
    if (languageCode === 'zh' && (regionCode === 'TW' || regionCode === 'HK' || regionCode === 'MO')) {
      return 'zh-TW';
    }
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
