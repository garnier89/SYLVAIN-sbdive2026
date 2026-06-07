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
