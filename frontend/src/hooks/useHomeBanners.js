import { useEffect, useState } from 'react';
import { homeBannersAPI } from '../services/api';
import { getBrowserLocationLabel } from '../lib/browserZone';

// Fallback mirrors the backend seed so the home renders instantly / offline-safe.
const FALLBACK = [
  { id: 'sb_student', key: 'sb_student', variant: 'entry', title: 'SB Student 🎓', subtitle: 'Marketplace, tarifs étudiants, campus & plus', icon: 'GraduationCap', badge: '', bg_from: '#5B21B6', bg_to: '#7C3AED', target_route: '/sb-student', dismissible: true, updated_at: '' },
  { id: 'instant_delivery', key: 'instant_delivery', variant: 'hero', title: 'Livraison Instantanée', subtitle: 'Envoyez un colis maintenant — un coursier le récupère et le livre en temps réel.', icon: 'Lightning', badge: 'EXPRESS · DÈS 30 MIN', bg_from: '#4F46E5', bg_to: '#FF5000', target_route: '/parcel', dismissible: true, updated_at: '' },
];

/**
 * Active home feature banners (admin-piloted: order, visibility, zone, schedule).
 * Refines by the user's resolved zone once available.
 */
export const useHomeBanners = () => {
  const [banners, setBanners] = useState(FALLBACK);

  useEffect(() => {
    let alive = true;
    homeBannersAPI.public()
      .then((r) => { if (alive && Array.isArray(r.data.banners)) setBanners(r.data.banners); })
      .catch(() => { /* keep fallback */ });
    getBrowserLocationLabel().then((label) => {
      if (!label || !alive) return;
      homeBannersAPI.public(label)
        .then((r) => { if (alive && Array.isArray(r.data.banners)) setBanners(r.data.banners); })
        .catch(() => {});
    });
    return () => { alive = false; };
  }, []);

  return banners;
};

export default useHomeBanners;
