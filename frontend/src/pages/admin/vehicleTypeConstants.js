// Constants for the Vehicle Type configuration editor (V3Cube parity, modernised).

export const CURRENCIES = [
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'XOF', symbol: 'CFA', label: 'Franc CFA (Ouest)' },
  { code: 'XAF', symbol: 'FCFA', label: 'Franc CFA (Central)' },
  { code: 'XPF', symbol: '₣', label: 'Franc Pacifique' },
  { code: 'CAD', symbol: 'CA$', label: 'Dollar canadien' },
  { code: 'CHF', symbol: 'CHF', label: 'Franc suisse' },
  { code: 'MAD', symbol: 'DH', label: 'Dirham marocain' },
  { code: 'DZD', symbol: 'DA', label: 'Dinar algérien' },
  { code: 'TND', symbol: 'DT', label: 'Dinar tunisien' },
  { code: 'AED', symbol: 'د.إ', label: 'Dirham EAU' },
  { code: 'SAR', symbol: '﷼', label: 'Riyal saoudien' },
  { code: 'INR', symbol: '₹', label: 'Roupie indienne' },
  { code: 'CNY', symbol: '¥', label: 'Yuan chinois' },
  { code: 'JPY', symbol: '¥', label: 'Yen japonais' },
  { code: 'BRL', symbol: 'R$', label: 'Real brésilien' },
  { code: 'MXN', symbol: 'MX$', label: 'Peso mexicain' },
  { code: 'ZAR', symbol: 'R', label: 'Rand sud-africain' },
  { code: 'NGN', symbol: '₦', label: 'Naira nigérian' },
  { code: 'KES', symbol: 'KSh', label: 'Shilling kényan' },
  { code: 'EGP', symbol: 'E£', label: 'Livre égyptienne' },
  { code: 'TRY', symbol: '₺', label: 'Livre turque' },
  { code: 'RUB', symbol: '₽', label: 'Rouble russe' },
  { code: 'AUD', symbol: 'A$', label: 'Dollar australien' },
  { code: 'HTG', symbol: 'G', label: 'Gourde haïtienne' },
];

// ~32 languages (V3Cube-style multilingual name)
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'ar', label: 'العربية' },
  { code: 'az', label: 'Azərbaycan' },
  { code: 'bs', label: 'Bosanski' },
  { code: 'bg', label: 'Български' },
  { code: 'zh', label: '中文' },
  { code: 'cs', label: 'Čeština' },
  { code: 'da', label: 'Dansk' },
  { code: 'de', label: 'Deutsch' },
  { code: 'el', label: 'Ελληνικά' },
  { code: 'es', label: 'Español' },
  { code: 'fil', label: 'Pilipino' },
  { code: 'fi', label: 'Suomi' },
  { code: 'he', label: 'עברית' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'hu', label: 'Magyar' },
  { code: 'id', label: 'Indonesia' },
  { code: 'it', label: 'Italiano' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'ms', label: 'Melayu' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'no', label: 'Norsk' },
  { code: 'pl', label: 'Polski' },
  { code: 'pt', label: 'Português' },
  { code: 'ro', label: 'Română' },
  { code: 'ru', label: 'Русский' },
  { code: 'sv', label: 'Svenska' },
  { code: 'th', label: 'ไทย' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'uk', label: 'Українська' },
  { code: 'vi', label: 'Tiếng Việt' },
];

export const DAYS = [
  { id: 'mon', label: 'Lundi' },
  { id: 'tue', label: 'Mardi' },
  { id: 'wed', label: 'Mercredi' },
  { id: 'thu', label: 'Jeudi' },
  { id: 'fri', label: 'Vendredi' },
  { id: 'sat', label: 'Samedi' },
  { id: 'sun', label: 'Dimanche' },
];

export const ICON_TYPES = ['Car', 'Moto', 'Velo', 'Van', 'Truck', 'Ambulance', 'Tuktuk', 'Taxi'];

export const ZONES = ['Martinique', 'Guadeloupe', 'Guyane', 'Réunion', 'Paris', 'Lyon', 'Marseille'];

export const FARE_STRATEGIES = [
  { id: 'incremental', label: 'Incrémental (distance + temps)' },
  { id: 'fixed', label: 'Fixe' },
];

export const currencySymbol = (code) => CURRENCIES.find((c) => c.code === code)?.symbol || code;
