import { useState, useEffect } from 'react';
import { configAPI } from '../services/api';

// Module-level cache so the public App Settings are fetched only once per session
// and shared across every feature gate (rider + driver apps).
let _cache = null;
let _promise = null;

const DEFAULTS = {
  // Feature flags the UI gates on. Backend remains the source of truth; these are
  // safe fallbacks used before the network response arrives.
  taxi_hail_option: true,
  enable_pool: true,
  book_for_someone: true,
  enable_tip: true,
  enable_skip_rating: true,
  ask_otp_before_start: true,
  enable_gift_card: true,
  enable_referral_system: true,
  enable_donation: true,
  enable_favorite_driver: false,
  enable_news: true,
  enable_corporate_profile: true,
  enable_handicap: true,
  enable_child_seat: false,
  enable_gender_based_female: false,
  allow_driver_edit_profile: true,
  allow_driver_edit_vehicle: true,
  enable_driver_reward_program: true,
  enable_driver_wallet_withdrawal: false,
  driver_wallet_withdrawal_restriction_min: 50,
  enable_rider_reward_program: false,
  driver_timeout: 35,
};

export const fetchAppSettings = () => {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;
  _promise = configAPI.getAppSettings()
    .then((res) => { _cache = { ...DEFAULTS, ...(res.data || {}) }; return _cache; })
    .catch(() => { _cache = { ...DEFAULTS }; return _cache; })
    .finally(() => { _promise = null; });
  return _promise;
};

// Invalidate the cache and re-fetch. Called after an admin saves App Settings so
// open rider/driver apps refresh their feature gates WITHOUT a manual reload.
export const refreshAppSettings = () => {
  _cache = null;
  _promise = null;
  return fetchAppSettings().then((s) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app-settings-updated', { detail: s }));
    }
    return s;
  });
};

/**
 * useAppSettings — reads the public App Settings (118-key V3Cube panel) once and
 * exposes them to feature gates. `settings` starts with safe defaults so the UI
 * never flickers a disabled feature on first paint. Listens for live updates
 * broadcast after an admin save (instant activation/désactivation).
 */
export const useAppSettings = () => {
  const [settings, setSettings] = useState(_cache || DEFAULTS);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    let alive = true;
    fetchAppSettings().then((s) => { if (alive) { setSettings(s); setLoading(false); } });
    const onUpdated = (e) => { if (alive) setSettings(e.detail || _cache || DEFAULTS); };
    window.addEventListener('app-settings-updated', onUpdated);
    return () => { alive = false; window.removeEventListener('app-settings-updated', onUpdated); };
  }, []);

  return { settings, loading };
};

export default useAppSettings;
