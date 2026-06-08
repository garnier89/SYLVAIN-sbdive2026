import { useState, useCallback } from 'react';

const KEY = 'sb_service_taps';

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
};

/**
 * Tracks how often the user opens each service tile (localStorage) and exposes
 * the most-used ones as quick "shortcuts" for the top of the home screen.
 */
export const useServiceShortcuts = (max = 8) => {
  const [taps, setTaps] = useState(read);

  const recordTap = useCallback((service) => {
    if (!service || !service.path) return;
    const id = service.id || service.path;
    // Skip aggregate / "more" tiles — they are not real services.
    if (/(^|-)more(-|$)/.test(id)) return;
    setTaps((prev) => {
      const cur = prev[id] || { count: 0 };
      const next = {
        ...prev,
        [id]: {
          id,
          count: cur.count + 1,
          name: service.name,
          iconName: service.iconName,
          imageUrl: service.imageUrl,
          bg: service.bg,
          iconColor: service.iconColor,
          path: service.path,
        },
      };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);

  const shortcuts = Object.values(taps)
    .filter((s) => s.count >= 1 && s.path && s.name)
    .sort((a, b) => b.count - a.count)
    .slice(0, max);

  return { shortcuts, recordTap };
};
