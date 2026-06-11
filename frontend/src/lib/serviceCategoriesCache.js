/**
 * Shared session cache for the Taxi service categories (`/api/service-categories`).
 *
 * Why: several screens (Home tiles, Taxi Hub grid, Ride Choose) render the same
 * dashboard-defined category icons. Without a shared cache each page re-fetches on
 * mount and briefly shows the hardcoded fallback icon before the API resolves —
 * the visible "old icon flashes then changes" effect. Initialising state from this
 * cache makes the correct icons render instantly, then we revalidate in background.
 */
import { configAPI } from '../services/api';

let _cache = null;     // last-known categories array (per session)
let _inflight = null;  // de-dupes concurrent loads

export const cachedServiceCategories = () => _cache || [];

export function loadServiceCategories() {
  if (_inflight) return _inflight;
  _inflight = configAPI.getServiceCategories()
    .then((r) => {
      const data = Array.isArray(r.data) ? r.data : (r.data?.items || []);
      _cache = data;
      return data;
    })
    .finally(() => { _inflight = null; });
  return _inflight;
}
