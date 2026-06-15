/**
 * Navigation GPS chauffeur — déclenchement automatique de Google Maps.
 *
 * Ouvre l'app Google Maps (ou l'onglet maps.google sur desktop) en mode
 * itinéraire voiture vers la destination. Utilisé automatiquement quand le
 * chauffeur accepte une course (→ prise en charge) puis la démarre (→ dépose).
 *
 * Sur mobile, l'ouverture déclenchée après un appel réseau peut être bloquée
 * par le navigateur (popup blocker). On renvoie alors {ok:false, reason:'blocked'}
 * + l'URL pour proposer un repli « 1 tap » garanti côté UI.
 */
export const buildGoogleMapsUrl = (lat, lng) => {
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    return null;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
};

export const openGoogleMapsNav = (lat, lng) => {
  const url = buildGoogleMapsUrl(lat, lng);
  if (!url) return { ok: false, reason: 'invalid', url: null };
  let win = null;
  try {
    win = window.open(url, '_blank', 'noopener');
  } catch {
    win = null;
  }
  return { ok: Boolean(win), reason: win ? 'opened' : 'blocked', url };
};
