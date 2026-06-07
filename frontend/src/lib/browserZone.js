/**
 * browserZone — best-effort resolution of a free-text location label for the
 * user's current position, via the browser Geolocation API + Google reverse
 * geocoding (REST, no JS SDK dependency).
 *
 * Used to make zone-scoped home content (banners, news…) location-aware: the
 * returned label (e.g. "Fort-de-France, Martinique 97200, France") is passed to
 * the public endpoints which resolve it to a {country, state, city} zone.
 *
 * Returns '' on any failure (permission denied, no key, network) so callers
 * gracefully fall back to showing global content.
 */
const GKEY = process.env.REACT_APP_GOOGLE_MAPS_KEY || '';

export function getBrowserLocationLabel() {
  return new Promise((resolve) => {
    if (!GKEY || typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve('');
      return;
    }
    const done = (v) => resolve(v || '');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&language=fr&key=${GKEY}`;
          const res = await fetch(url);
          const data = await res.json();
          done(data?.results?.[0]?.formatted_address || '');
        } catch {
          done('');
        }
      },
      () => done(''),
      { timeout: 6000, maximumAge: 600000 },
    );
  });
}

/**
 * Resolve the ISO country code (short_name, e.g. "MQ", "SN", "FR") of the user's
 * current position via Geolocation + Google reverse geocoding. Used to suggest a
 * locally-relevant UI language on first launch. Returns '' on any failure.
 */
export function getBrowserCountryCode() {
  return new Promise((resolve) => {
    if (!GKEY || typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve('');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&language=fr&key=${GKEY}`;
          const res = await fetch(url);
          const data = await res.json();
          let cc = '';
          for (const r of (data?.results || [])) {
            const comp = (r.address_components || []).find((c) => (c.types || []).includes('country'));
            if (comp?.short_name) { cc = comp.short_name; break; }
          }
          resolve((cc || '').toUpperCase());
        } catch {
          resolve('');
        }
      },
      () => resolve(''),
      { timeout: 6000, maximumAge: 600000 },
    );
  });
}
