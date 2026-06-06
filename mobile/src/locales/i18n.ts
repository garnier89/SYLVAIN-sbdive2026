import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import fr from './fr.json';
import en from './en.json';
import { i18nAPI } from '@/api/endpoints';

const LANG_KEY = 'sbdrive.lang';

const detectedLng = (() => {
  try {
    const locales = (Localization as any).getLocales?.();
    return locales?.[0]?.languageCode || 'fr';
  } catch {
    return 'fr';
  }
})();

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v4',
    lng: ['fr', 'en'].includes(detectedLng) ? detectedLng : 'fr',
    fallbackLng: 'fr',
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    interpolation: { escapeValue: false },
  });

/**
 * Switch language. For any language beyond the bundled fr/en, the translation
 * bundle is fetched on demand from the dashboard engine (/api/i18n/bundle/{lang})
 * and applied live. RTL is toggled for right-to-left languages (ar, fa, ur, he).
 */
export async function applyLanguage(code: string): Promise<{ rtlChanged: boolean }> {
  try { await SecureStore.setItemAsync(LANG_KEY, code); } catch {}
  let rtl = false;
  if (code !== 'fr' && code !== 'en') {
    try {
      const r = await i18nAPI.getBundle(code);
      const bundle = r.data?.bundle;
      if (bundle && Object.keys(bundle).length) {
        i18n.addResourceBundle(code, 'translation', bundle, true, true);
      }
      rtl = !!r.data?.is_rtl;
    } catch {
      // network/translation unavailable → keep current, fall back gracefully
    }
  }
  await i18n.changeLanguage(code);
  let rtlChanged = false;
  try {
    if (I18nManager.isRTL !== rtl) {
      I18nManager.allowRTL(rtl);
      I18nManager.forceRTL(rtl);
      rtlChanged = true; // requires app reload to fully re-layout
    }
  } catch {}
  return { rtlChanged };
}

/** Restore the user's previously selected language at startup (non-blocking). */
export async function restoreLanguage() {
  try {
    const saved = await SecureStore.getItemAsync(LANG_KEY);
    if (saved && saved !== i18n.language) await applyLanguage(saved);
  } catch {}
}

restoreLanguage();

export default i18n;
