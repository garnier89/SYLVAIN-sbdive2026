/**
 * Navigation GPS chauffeur — déclenchement automatique de Google Maps.
 *
 * Ouvre l'app Google Maps (ou l'onglet maps.google sur desktop) en mode
 * itinéraire voiture vers la destination. Utilisé automatiquement quand le
 * chauffeur accepte une course (→ prise en charge) puis la démarre (→ dépose).
 */
export const openGoogleMapsNav = (lat, lng) => {
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    return false;
  }
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  try {
    window.open(url, '_blank', 'noopener');
    return true;
  } catch {
    return false;
  }
};
