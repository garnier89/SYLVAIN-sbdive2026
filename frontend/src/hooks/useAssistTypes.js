import { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

// Fallback when the API is unreachable — keeps the SB Access booking panel usable.
const FALLBACK = [
  { k: 'wheelchair', l: 'Fauteuil roulant' },
  { k: 'pmr', l: 'PMR' },
  { k: 'access', l: 'Accès' },
  { k: 'elderly', l: 'Personne âgée' },
  { k: 'medical', l: 'Sortie médicale' },
  { k: 'luggage', l: 'Aide bagages' },
];

/**
 * Returns the list of ACTIVE SB Access assistance types (admin-editable).
 * Shape: [{ k, l }] to match the existing panel rendering.
 */
export const useAssistTypes = () => {
  const [options, setOptions] = useState(FALLBACK);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/assist-types`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (Array.isArray(data.types) && data.types.length > 0) {
          setOptions(data.types.map((t) => ({ k: t.key, l: t.label })));
        }
      } catch (e) {
        // keep fallback
      }
    })();
  }, []);

  return options;
};

export default useAssistTypes;
