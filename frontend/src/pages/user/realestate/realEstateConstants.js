// Shared constants for the Real Estate (Immobilier) module — V3Cube parity.
export const LISTING_TYPES = [
  { id: 'sale', label: 'Acheter', short: 'Vente' },
  { id: 'rent', label: 'Louer', short: 'Location' },
];

export const CATEGORIES = [
  { id: 'residential', label: 'Résidentiel', emoji: '🏠' },
  { id: 'commercial', label: 'Commercial', emoji: '🏢' },
  { id: 'land', label: 'Terrain', emoji: '🌳' },
];

export const SUBTYPES = {
  residential: ['Appartement', 'Maison', 'Villa', 'Studio', 'Duplex', 'Chambre'],
  commercial: ['Bureau', 'Local commercial', 'Entrepôt', 'Boutique', 'Fonds de commerce'],
  land: ['Terrain constructible', 'Terrain agricole', 'Parcelle'],
};

export const RENT_PERIODS = [
  { id: 'month', label: '/ mois' },
  { id: 'week', label: '/ semaine' },
  { id: 'day', label: '/ jour' },
];

export const AMENITIES = [
  'Parking', 'Ascenseur', 'Balcon', 'Terrasse', 'Jardin', 'Piscine',
  'Climatisation', 'Chauffage', 'Sécurité', 'Meublé', 'Fibre', 'Cave',
];

export const STATUS_META = {
  active: { label: 'Active', cls: 'bg-green-100 text-green-700' },
  sold: { label: 'Vendu', cls: 'bg-gray-200 text-gray-600' },
  rented: { label: 'Loué', cls: 'bg-gray-200 text-gray-600' },
  inactive: { label: 'Inactive', cls: 'bg-amber-100 text-amber-700' },
};

export const fmtPrice = (v) => {
  if (v == null) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
};

export const COUNTRIES = [
  { id: 'FR', label: 'France 🇫🇷' },
  { id: 'MQ', label: 'Martinique 🇲🇶' },
  { id: 'GP', label: 'Guadeloupe 🇬🇵' },
  { id: 'GF', label: 'Guyane 🇬🇫' },
];

export const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;
export const rentSuffix = (p) => RENT_PERIODS.find((r) => r.id === p)?.label || '';
