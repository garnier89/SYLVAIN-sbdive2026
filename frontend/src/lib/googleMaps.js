/**
 * Single source of truth for loading the Google Maps JS API.
 *
 * Every map/places consumer MUST load the API through `useJsApiLoader(GMAPS_LOADER_OPTIONS)`
 * with this EXACT same options object. `@react-google-maps/api` dedupes by the
 * script `id`, and the `libraries` array MUST be a stable reference — otherwise
 * you get "You have included the Google Maps JavaScript API multiple times" and
 * "LoadScript has been reloaded unintentionally" warnings.
 *
 * `places`        → Autocomplete / Geocoder (address inputs, map picker)
 * `visualization` → heatmap layer (admin/driver demand map)
 */
export const GMAPS_LIBRARIES = ['places', 'visualization'];

export const GMAPS_LOADER_OPTIONS = {
  id: 'google-map-script',
  googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_KEY || '',
  libraries: GMAPS_LIBRARIES,
  language: 'fr',
  region: 'FR',
};

/**
 * Returns a ready-to-use google.maps.Geocoder instance, or null if Maps isn't
 * loaded. Google's async loader (loading=async) exposes the `google.maps`
 * namespace BEFORE the classes are ready, so `new google.maps.Geocoder()` can
 * throw "Geocoder is not a constructor". This helper prefers the direct
 * constructor and falls back to `importLibrary('geocoding')` (the supported way
 * to lazily load a class), guaranteeing the constructor is available.
 */
export async function getGeocoder() {
  const maps = window.google?.maps;
  if (!maps) return null;
  if (typeof maps.Geocoder === 'function') {
    try { return new maps.Geocoder(); } catch (e) { /* fall through to importLibrary */ }
  }
  if (typeof maps.importLibrary === 'function') {
    try {
      const lib = await maps.importLibrary('geocoding');
      const Ctor = lib?.Geocoder || maps.Geocoder;
      return typeof Ctor === 'function' ? new Ctor() : null;
    } catch (e) { return null; }
  }
  return null;
}

/**
 * Détecte la position actuelle de l'utilisateur (comme le taxi) puis fait un
 * reverse-geocoding pour obtenir une adresse lisible.
 * Retourne { lat, lng, address }. Rejette si la géolocalisation est refusée/indispo.
 */
export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Géolocalisation non supportée par ce navigateur.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let address = '';
        try {
          const geocoder = await getGeocoder();
          if (geocoder) {
            await new Promise((res) => {
              geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                if (status === 'OK' && results?.[0]) address = results[0].formatted_address;
                res();
              });
            });
          }
        } catch (e) { /* adresse facultative */ }
        resolve({ lat, lng, address });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

