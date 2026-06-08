import { useEffect } from 'react';
import {
  prewarmRoutes, TaxiHubPage, RideChoosePage, AllDeliveryPage, FoodPage, WalletPage,
  ProfilePage, RideTrackingPage, DriverBookingsPage, DriverEarningsPage, DriverProfilePage,
  DriverWalletPage, DriverRewardsPage,
} from './pages';

// Map of in-app paths -> preloadable route components (hot routes only).
// Add data-prefetch="/taxi" to any clickable element to warm its chunk on hover/focus.
const PREFETCH_MAP = {
  '/taxi': TaxiHubPage,
  '/course': RideChoosePage,
  '/all-delivery': AllDeliveryPage,
  '/food': FoodPage,
  '/wallet': WalletPage,
  '/profile': ProfilePage,
  '/chauffeur/reservations': DriverBookingsPage,
  '/chauffeur/earnings': DriverEarningsPage,
  '/chauffeur/profile': DriverProfilePage,
  '/chauffeur/wallet': DriverWalletPage,
  '/chauffeur/rewards': DriverRewardsPage,
};

const runIdle = (fn) => {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(fn, { timeout: 2000 });
  } else {
    setTimeout(fn, 600);
  }
};

const preloadComponent = (comp) => {
  try { comp && comp.preload && comp.preload(); } catch (e) { /* ignore */ }
};

// Warms likely-next routes per role (touch-friendly) + hover/focus prefetch (desktop).
export function useRoutePrefetch(role) {
  useEffect(() => {
    if (!role) return undefined;
    runIdle(() => prewarmRoutes(role));

    const onHover = (e) => {
      const el = e.target && e.target.closest && e.target.closest('[data-prefetch]');
      if (!el) return;
      preloadComponent(PREFETCH_MAP[el.getAttribute('data-prefetch')]);
    };
    document.addEventListener('pointerover', onHover, { passive: true });
    document.addEventListener('focusin', onHover, { passive: true });
    return () => {
      document.removeEventListener('pointerover', onHover);
      document.removeEventListener('focusin', onHover);
    };
  }, [role]);
}

// Imperative prefetch (e.g. on touchstart) for a known path.
export function prefetchPath(path) {
  preloadComponent(PREFETCH_MAP[path]);
}
