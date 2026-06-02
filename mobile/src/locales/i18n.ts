import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import fr from './fr.json';
import en from './en.json';

const detectedLng = (() => {
  try {
    const locales = (Localization as any).getLocales?.();
    const code = locales?.[0]?.languageCode || 'fr';
    return ['fr', 'en'].includes(code) ? code : 'fr';
  } catch {
    return 'fr';
  }
})();

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v4',
    lng: detectedLng,
    fallbackLng: 'fr',
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
