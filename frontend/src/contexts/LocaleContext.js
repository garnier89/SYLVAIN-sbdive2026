import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
import { BASE_FLAT_FR, flatten, interpolate } from '../lib/i18nBase';
import { getBrowserCountryCode } from '../lib/browserZone';

// Module-level cache of fetched (flattened) bundles, keyed by lang code.
const _bundleCache = { fr: BASE_FLAT_FR };

// Country (ISO) → locally-relevant UI language to SUGGEST on first launch.
// Covers DOM-TOM creoles + key African markets.
const ZONE_LANG = {
  MQ: 'gcf-mq', // Martinique → créole martiniquais
  GP: 'gcf',    // Guadeloupe → créole guadeloupéen
  GF: 'gcr',    // Guyane → créole guyanais
  RE: 'rcf',    // Réunion → créole réunionnais
  HT: 'ht',     // Haïti → créole haïtien
  SN: 'wo',     // Sénégal → wolof
  CI: 'dyu',    // Côte d'Ivoire → dioula
  CD: 'ln',     // RD Congo → lingala
  CG: 'ln',     // Congo → lingala
  NG: 'ha',     // Nigeria → haoussa
};

const CURRENCIES = [
  { code: 'EUR', symbol: '\u20AC', name: 'Euro', flag: '\uD83C\uDDEA\uD83C\uDDFA' },
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
  { code: 'GBP', symbol: '\u00A3', name: 'Livre Sterling', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
  { code: 'XOF', symbol: 'CFA', name: 'Franc CFA (BCEAO)', flag: '\uD83C\uDDE8\uD83C\uDDEE' },
  { code: 'XAF', symbol: 'FCFA', name: 'Franc CFA (BEAC)', flag: '\uD83C\uDDE8\uD83C\uDDF2' },
  { code: 'MAD', symbol: 'MAD', name: 'Dirham Marocain', flag: '\uD83C\uDDF2\uD83C\uDDE6' },
  { code: 'CAD', symbol: 'CA$', name: 'Dollar Canadien', flag: '\uD83C\uDDE8\uD83C\uDDE6' },
  { code: 'CHF', symbol: 'CHF', name: 'Franc Suisse', flag: '\uD83C\uDDE8\uD83C\uDDED' },
  { code: 'TND', symbol: 'DT', name: 'Dinar Tunisien', flag: '\uD83C\uDDF9\uD83C\uDDF3' },
  { code: 'DZD', symbol: 'DA', name: 'Dinar Algerien', flag: '\uD83C\uDDE9\uD83C\uDDFF' },
  { code: 'GNF', symbol: 'FG', name: 'Franc Guineen', flag: '\uD83C\uDDEC\uD83C\uDDF3' },
  { code: 'HTG', symbol: 'G', name: 'Gourde Haitienne', flag: '\uD83C\uDDED\uD83C\uDDF9' },
  { code: 'MGA', symbol: 'Ar', name: 'Ariary Malgache', flag: '\uD83C\uDDF2\uD83C\uDDEC' },
  { code: 'CDF', symbol: 'FC', name: 'Franc Congolais', flag: '\uD83C\uDDE8\uD83C\uDDE9' },
  { code: 'NGN', symbol: '\u20A6', name: 'Naira Nigerian', flag: '\uD83C\uDDF3\uD83C\uDDEC' },
  { code: 'KES', symbol: 'KSh', name: 'Shilling Kenyan', flag: '\uD83C\uDDF0\uD83C\uDDEA' },
  { code: 'ZAR', symbol: 'R', name: 'Rand Sud-Africain', flag: '\uD83C\uDDFF\uD83C\uDDE6' },
  { code: 'AED', symbol: 'AED', name: 'Dirham EAU', flag: '\uD83C\uDDE6\uD83C\uDDEA' },
  { code: 'SAR', symbol: 'SAR', name: 'Riyal Saoudien', flag: '\uD83C\uDDF8\uD83C\uDDE6' },
  { code: 'INR', symbol: '\u20B9', name: 'Roupie Indienne', flag: '\uD83C\uDDEE\uD83C\uDDF3' },
  { code: 'BRL', symbol: 'R$', name: 'Real Bresilien', flag: '\uD83C\uDDE7\uD83C\uDDF7' },
  { code: 'MXN', symbol: 'MX$', name: 'Peso Mexicain', flag: '\uD83C\uDDF2\uD83C\uDDFD' },
  { code: 'JPY', symbol: '\u00A5', name: 'Yen Japonais', flag: '\uD83C\uDDEF\uD83C\uDDF5' },
  { code: 'CNY', symbol: '\u00A5', name: 'Yuan Chinois', flag: '\uD83C\uDDE8\uD83C\uDDF3' },
  { code: 'RUB', symbol: '\u20BD', name: 'Rouble Russe', flag: '\uD83C\uDDF7\uD83C\uDDFA' },
  { code: 'TRY', symbol: '\u20BA', name: 'Livre Turque', flag: '\uD83C\uDDF9\uD83C\uDDF7' },
  { code: 'THB', symbol: '\u0E3F', name: 'Baht Thai', flag: '\uD83C\uDDF9\uD83C\uDDED' },
  { code: 'PHP', symbol: '\u20B1', name: 'Peso Philippin', flag: '\uD83C\uDDF5\uD83C\uDDED' },
  { code: 'IDR', symbol: 'Rp', name: 'Roupie Indonesienne', flag: '\uD83C\uDDEE\uD83C\uDDE9' },
  { code: 'MYR', symbol: 'RM', name: 'Ringgit Malaisien', flag: '\uD83C\uDDF2\uD83C\uDDFE' },
];

const LANGUAGES = [
  { code: 'fr', name: 'Francais', flag: '\uD83C\uDDEB\uD83C\uDDF7' },
  { code: 'en', name: 'English', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
  { code: 'ar', name: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629', flag: '\uD83C\uDDF8\uD83C\uDDE6' },
  { code: 'es', name: 'Espanol', flag: '\uD83C\uDDEA\uD83C\uDDF8' },
  { code: 'pt', name: 'Portugues', flag: '\uD83C\uDDF5\uD83C\uDDF9' },
  { code: 'de', name: 'Deutsch', flag: '\uD83C\uDDE9\uD83C\uDDEA' },
  { code: 'it', name: 'Italiano', flag: '\uD83C\uDDEE\uD83C\uDDF9' },
  { code: 'nl', name: 'Nederlands', flag: '\uD83C\uDDF3\uD83C\uDDF1' },
  { code: 'tr', name: 'Turkce', flag: '\uD83C\uDDF9\uD83C\uDDF7' },
  { code: 'ru', name: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439', flag: '\uD83C\uDDF7\uD83C\uDDFA' },
  { code: 'zh', name: '\u4E2D\u6587', flag: '\uD83C\uDDE8\uD83C\uDDF3' },
  { code: 'ja', name: '\u65E5\u672C\u8A9E', flag: '\uD83C\uDDEF\uD83C\uDDF5' },
  { code: 'ko', name: '\uD55C\uAD6D\uC5B4', flag: '\uD83C\uDDF0\uD83C\uDDF7' },
  { code: 'hi', name: '\u0939\u093F\u0928\u094D\u0926\u0940', flag: '\uD83C\uDDEE\uD83C\uDDF3' },
  { code: 'sw', name: 'Kiswahili', flag: '\uD83C\uDDF0\uD83C\uDDEA' },
  { code: 'ha', name: 'Hausa', flag: '\uD83C\uDDF3\uD83C\uDDEC' },
  { code: 'wo', name: 'Wolof', flag: '\uD83C\uDDF8\uD83C\uDDF3' },
  { code: 'ht', name: 'Kreyol Ayisyen', flag: '\uD83C\uDDED\uD83C\uDDF9' },
  { code: 'mg', name: 'Malagasy', flag: '\uD83C\uDDF2\uD83C\uDDEC' },
  { code: 'ln', name: 'Lingala', flag: '\uD83C\uDDE8\uD83C\uDDE9' },
  { code: 'th', name: '\u0E44\u0E17\u0E22', flag: '\uD83C\uDDF9\uD83C\uDDED' },
  { code: 'vi', name: 'Ti\u1EBFng Vi\u1EC7t', flag: '\uD83C\uDDFB\uD83C\uDDF3' },
  { code: 'ms', name: 'Bahasa Melayu', flag: '\uD83C\uDDF2\uD83C\uDDFE' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '\uD83C\uDDEE\uD83C\uDDE9' },
  { code: 'tl', name: 'Filipino', flag: '\uD83C\uDDF5\uD83C\uDDED' },
];

const LocaleContext = createContext();

// Non-intrusive first-launch banner suggesting the locally-relevant language.
const LanguageSuggestionBanner = () => {
  const ctx = useContext(LocaleContext);
  const suggestion = ctx?.suggestion;
  if (!suggestion) return null;
  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[10000] w-[calc(100%-1.5rem)] max-w-[406px] rounded-2xl bg-white shadow-[0_12px_40px_-8px_rgba(11,20,38,0.35)] border border-slate-200 p-3.5 animate-in slide-in-from-top"
      data-testid="lang-suggestion-banner"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none mt-0.5">{suggestion.flag}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#1F2430]">Bonjour ! 👋</p>
          <p className="text-[13px] text-slate-600 mt-0.5">
            Cette langue est disponible près de chez vous : <b>{suggestion.name}</b>. Souhaitez-vous l&apos;utiliser ?
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={ctx.acceptSuggestion}
              data-testid="lang-suggestion-accept"
              className="flex-1 py-2 rounded-xl bg-[#FF5000] text-white text-sm font-semibold"
            >
              Oui, passer en {suggestion.name}
            </button>
            <button
              onClick={ctx.dismissSuggestion}
              data-testid="lang-suggestion-dismiss"
              className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium"
            >
              Rester en français
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


export const LocaleProvider = ({ children }) => {
  const { user } = useAuth();
  const [currency, setCurrencyState] = useState(() => {
    const saved = localStorage.getItem('sb_currency');
    return saved ? JSON.parse(saved) : CURRENCIES[0];
  });
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem('sb_language');
    return saved ? JSON.parse(saved) : LANGUAGES[0];
  });
  // Languages shown in the selector — loaded from the backend (ready bundles),
  // falling back to the static list for an instant first render.
  const [languages, setLanguages] = useState(LANGUAGES);

  // Persist the language/currency preference to the user account (cross-device)
  // when authenticated. localStorage already mirrors it for guests.
  const persistPrefs = useCallback((langCode, currCode) => {
    if (user) api.put('/users/language', { language: langCode, currency: currCode }).catch(() => {});
  }, [user]);

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang);
    persistPrefs(lang.code, currency.code);
  }, [persistPrefs, currency]);

  const setCurrency = useCallback((curr) => {
    setCurrencyState(curr);
    persistPrefs(language.code, curr.code);
  }, [persistPrefs, language]);

  // On login, apply the language/currency saved on the user account (so a
  // creole/wolof speaker keeps their language on any new device). Applied once;
  // re-runs if the backend language list arrives after the user (creole codes).
  const prefAppliedRef = useRef(false);
  useEffect(() => {
    if (!user) { prefAppliedRef.current = false; return; }
    if (prefAppliedRef.current) return;
    const lang = user.language ? languages.find((l) => l.code === user.language) : null;
    const curr = user.currency ? CURRENCIES.find((c) => c.code === user.currency) : null;
    if (!lang && !curr) return;
    // Apply on the next tick (async) so it isn't a synchronous set-state-in-effect.
    Promise.resolve().then(() => {
      if (lang) setLanguageState(lang);
      if (curr) setCurrencyState(curr);
    });
    if (lang || (user.currency && !user.language)) prefAppliedRef.current = true;
  }, [user, languages]);

  // Fetch the ready languages (active + translated) once on mount.
  useEffect(() => {
    let cancelled = false;
    api.get('/i18n/languages')
      .then((r) => {
        const items = (r.data?.items || []).map((l) => ({ code: l.code, name: l.name, flag: l.flag, is_rtl: l.is_rtl }));
        if (!cancelled && items.length) setLanguages(items);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── First-launch language SUGGESTION by zone (non-intrusive banner) ──
  const [suggestedCode, setSuggestedCode] = useState('');
  useEffect(() => {
    const savedRaw = localStorage.getItem('sb_language');
    const savedCode = savedRaw ? (JSON.parse(savedRaw)?.code || 'fr') : 'fr';
    const asked = localStorage.getItem('sb_lang_suggested');
    // Only suggest when the user is still on the French default and was never asked.
    if (asked || savedCode !== 'fr') return;
    let cancelled = false;
    getBrowserCountryCode()
      .then((cc) => {
        const lang = ZONE_LANG[cc];
        if (lang && lang !== 'fr' && !cancelled) setSuggestedCode(lang);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Derived suggestion object (needs the loaded languages for name/flag).
  const suggestion = suggestedCode ? (languages.find((l) => l.code === suggestedCode) || null) : null;

  const acceptSuggestion = useCallback(() => {
    if (suggestion) setLanguage(suggestion);
    localStorage.setItem('sb_lang_suggested', '1');
    setSuggestedCode('');
  }, [suggestion]);

  const dismissSuggestion = useCallback(() => {
    localStorage.setItem('sb_lang_suggested', '1');
    setSuggestedCode('');
  }, []);
  // Flattened label bundles by lang code (FR base always present as fallback).
  const [bundles, setBundles] = useState(() => ({ ..._bundleCache }));

  useEffect(() => { localStorage.setItem('sb_currency', JSON.stringify(currency)); }, [currency]);
  useEffect(() => { localStorage.setItem('sb_language', JSON.stringify(language)); }, [language]);

  // Active bundle is DERIVED during render (no set-state-in-effect).
  const bundle = bundles[language.code] || BASE_FLAT_FR;

  // Apply text direction + lazily fetch the bundle for the active language.
  useEffect(() => {
    const code = language.code;
    const rtl = ['ar', 'fa', 'ur', 'he'].includes(code);
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.documentElement.lang = code;
    if (code === 'fr' || _bundleCache[code]) return; // already available
    let cancelled = false;
    api.get(`/i18n/bundle/${code}`)
      .then((r) => {
        // Merge over the FR base so any untranslated key still resolves (in FR).
        const flat = { ...BASE_FLAT_FR, ...flatten(r.data?.bundle || {}) };
        _bundleCache[code] = flat;
        if (!cancelled) setBundles((prev) => ({ ...prev, [code]: flat }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [language]);

  // Translate a flat key (e.g. "auth.login") with optional {{var}} interpolation.
  // Falls back to the FR base, then to the key itself.
  const t = useCallback((key, vars) => {
    const val = bundle[key] != null ? bundle[key] : (BASE_FLAT_FR[key] != null ? BASE_FLAT_FR[key] : key);
    return interpolate(val, vars);
  }, [bundle]);

  const formatPrice = (amount) => {
    if (currency.code === 'EUR') return `${amount.toFixed(2)} ${currency.symbol}`;
    return `${currency.symbol}${amount.toFixed(2)}`;
  };

  return (
    <LocaleContext.Provider value={{ currency, setCurrency, language, setLanguage, formatPrice, t, currencies: CURRENCIES, languages, suggestion, acceptSuggestion, dismissSuggestion }}>
      {children}
      <LanguageSuggestionBanner />
    </LocaleContext.Provider>
  );
};

export const useLocale = () => useContext(LocaleContext);
