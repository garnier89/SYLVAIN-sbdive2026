/**
 * userLocation — localisation utilisateur partagée et persistante.
 *
 * Source de vérité unique pour la zone de l'utilisateur (en-tête d'accueil,
 * départ des courses/coursier, centre des cartes). Persistée dans localStorage
 * pour rester cohérente entre les pages et les sessions.
 *
 * Ordre de résolution : choix manuel stocké → GPS navigateur → IP (serveur,
 * borné à la zone de service France/Antilles) → défaut Fort-de-France.
 */
import { geoAPI } from '../services/api/mobility';
import { getCurrentLocation } from './googleMaps';

const KEY = 'sb_user_location';

// Centre de service par défaut — aligné sur le backend (DEFAULT_CENTER).
export const DEFAULT_LOCATION = {
  lat: 14.6036, lng: -61.0667, label: 'Fort-de-France, Martinique',
};

// Villes proposées dans le sélecteur (zone de service de l'app).
export const CITY_PRESETS = [
  { label: 'Fort-de-France, Martinique', lat: 14.6036, lng: -61.0667 },
  { label: 'Le Lamentin, Martinique', lat: 14.6097, lng: -60.9989 },
  { label: 'Schoelcher, Martinique', lat: 14.6135, lng: -61.0879 },
  { label: 'Pointe-à-Pitre, Guadeloupe', lat: 16.2415, lng: -61.5340 },
  { label: 'Cayenne, Guyane', lat: 4.9227, lng: -52.3269 },
  { label: 'Saint-Denis, La Réunion', lat: -20.8823, lng: 55.4504 },
  { label: 'Paris, Île-de-France', lat: 48.8566, lng: 2.3522 },
  { label: 'Lyon, Auvergne-Rhône-Alpes', lat: 45.7640, lng: 4.8357 },
  { label: 'Marseille, PACA', lat: 43.2965, lng: 5.3698 },
];

export function getStoredLocation() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && v.lat != null && v.lng != null) return v;
  } catch { /* ignore */ }
  return null;
}

export function setStoredLocation(loc) {
  if (!loc || loc.lat == null || loc.lng == null) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({
      lat: loc.lat, lng: loc.lng, label: loc.label || loc.address || '',
    }));
  } catch { /* ignore */ }
}

export function clearStoredLocation() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Localisation immédiate (sync) : choix stocké ou défaut. */
export function resolveLocation() {
  return getStoredLocation() || DEFAULT_LOCATION;
}

/**
 * Localisation robuste (async) pour un champ « départ » : GPS d'abord, puis IP
 * (borné zone de service côté serveur), puis choix stocké, puis défaut.
 * Ne rejette jamais — retourne toujours {lat, lng, address}.
 */
export async function locateWithFallback({ preferGps = true } = {}) {
  if (preferGps) {
    try {
      const loc = await getCurrentLocation();
      if (loc && loc.lat != null) return { lat: loc.lat, lng: loc.lng, address: loc.address || '' };
    } catch { /* GPS bloqué/refusé — on continue */ }
  }
  try {
    const { data } = await geoAPI.ipLocate();
    if (data?.ok && data.lat != null) return { lat: data.lat, lng: data.lng, address: data.address || '' };
  } catch { /* ignore */ }
  const stored = getStoredLocation();
  if (stored) return { lat: stored.lat, lng: stored.lng, address: stored.label || '' };
  return { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng, address: DEFAULT_LOCATION.label };
}
