import { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

const FALLBACK = [
  { id: 'cash', label: 'Espèces', icon: 'Money' },
  { id: 'card', label: 'Carte bancaire', icon: 'CreditCard' },
  { id: 'wallet', label: 'Portefeuille SB', icon: 'Wallet' },
];

/**
 * Returns the list of currently-ENABLED payment methods (admin-configured).
 * Falls back to cash/card/wallet on network error to keep checkout usable.
 */
export const usePaymentMethods = () => {
  const [methods, setMethods] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/api/config/payment-methods`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (Array.isArray(data.methods) && data.methods.length > 0) {
          setMethods(data.methods);
        }
      } catch (e) {
        // keep fallback
      } finally { setLoading(false); }
    };
    load();
  }, []);

  return { methods, loading };
};

export default usePaymentMethods;
