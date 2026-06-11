/**
 * Shared session cache for the Taxi service categories (`/api/service-categories`).
 *
 * Why: several screens (Home tiles, Taxi Hub grid, Ride Choose) render the same
 * dashboard-defined category icons. Without a shared cache each page re-fetches on
 * mount and briefly shows the hardcoded fallback icon before the API resolves —
 * the visible "old icon flashes then changes" effect. Initialising state from this
 * cache makes the correct icons render instantly, then we revalidate in background.
 */
import { configAPI, servicesAPI } from '../services/api';

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

// ── Delivery (store) categories — same flicker-free, dashboard-icon pattern ──
let _storeCache = null;
export const cachedStoreCategories = () => _storeCache || [];
export function loadStoreCategories(location) {
  return configAPI.getStoreCategories(location)
    .then((r) => { const d = (r.data || []).filter((c) => c.active); _storeCache = d; return d; });
}

// ── On-demand service categories ──
let _onDemandCache = null;
let _onDemandInflight = null;
export const cachedOnDemandCategories = () => _onDemandCache || [];
export function loadOnDemandCategories() {
  if (_onDemandInflight) return _onDemandInflight;
  _onDemandInflight = servicesAPI.getOnDemandCategories()
    .then((r) => { const d = r.data || []; _onDemandCache = d; return d; })
    .finally(() => { _onDemandInflight = null; });
  return _onDemandInflight;
}
