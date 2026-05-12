import { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Hook returning whether SB PayGo is available in the current user's zone.
 * Reads the user's stored country (from useAuth) — defaults to FR.
 * Result: { available: boolean, zone: object|null, loading: boolean }
 */
export const useSbPayGoAvailability = (country) => {
  const [available, setAvailable] = useState(false);
  const [zone, setZone] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (country) params.set('country', country);
        const res = await fetch(`${API}/api/finance/sbpaygo/availability?${params.toString()}`);
        if (!res.ok) throw new Error('availability fetch failed');
        const data = await res.json();
        setAvailable(!!data.available);
        setZone(data.zone || null);
      } catch {
        setAvailable(false); setZone(null);
      } finally { setLoading(false); }
    };
    load();
  }, [country]);

  return { available, zone, loading };
};

export default useSbPayGoAvailability;
