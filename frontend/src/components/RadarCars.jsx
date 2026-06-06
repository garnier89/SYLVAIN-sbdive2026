import React, { useMemo } from 'react';

/**
 * RadarCars — little top-view cars that converge toward the pickup on the
 * "searching" radar map. Admin-configurable (enabled / icon / count / radius)
 * via the "Recherche chauffeur" service config (service_key="ride_search").
 *
 * Real nearby-driver positions are used first (correct bearing & relative
 * distance), then padded with stable simulated cars up to `count` for ambiance.
 * Each car slowly drifts inward toward the pickup ("drivers converge" effect).
 *
 * Props:
 *  - pickupLat, pickupLng : pickup coordinates (origin of the radar)
 *  - realPositions : [{lat,lng}] live nearby drivers (optional)
 *  - config : { enabled, icon_url, count, radius_m }
 *  - seed : stable string (ride id) so simulated cars don't jump between polls
 */
const MAX_R = 124; // px — keep cars inside the visible map area

// Deterministic pseudo-random in [0,1) from a string + index
const rand = (seed, i) => {
  let h = 2166136261 ^ i;
  const s = `${seed}:${i}`;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
};

// Bearing (0=N, clockwise) + distance (m) from pickup to a point
const toPolar = (plat, plng, lat, lng) => {
  const dLat = (lat - plat) * 111320;
  const dLng = (lng - plng) * 111320 * Math.cos((plat * Math.PI) / 180);
  const dist = Math.hypot(dLat, dLng);
  const bearing = Math.atan2(dLng, dLat); // 0 = north, + = east
  return { bearing, dist };
};

// Top-view (bird's-eye) car icon — white body with windshields
const TopCar = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ filter: 'drop-shadow(0 3px 4px rgba(11,20,38,0.45))' }}>
    <rect x="6" y="2.5" width="12" height="19" rx="4.2" fill="#FFFFFF" stroke="#0B1426" strokeWidth="0.9" />
    <path d="M8 6.2 C9 5.4 15 5.4 16 6.2 L15.2 9 C13 8.5 11 8.5 8.8 9 Z" fill="#2B3445" />
    <path d="M8.8 15.4 C11 14.9 13 14.9 15.2 15.4 L16 18.4 C15 17.7 9 17.7 8 18.4 Z" fill="#39424F" />
    <rect x="4.4" y="8.2" width="1.8" height="3" rx="0.9" fill="#0B1426" />
    <rect x="17.8" y="8.2" width="1.8" height="3" rx="0.9" fill="#0B1426" />
  </svg>
);

const CarIcon = ({ iconUrl, size }) =>
  iconUrl
    ? <img src={iconUrl} alt="" style={{ width: size, height: size, filter: 'drop-shadow(0 3px 4px rgba(11,20,38,0.4))' }} className="object-contain" />
    : <TopCar size={size} />;

export const RadarCars = ({ pickupLat, pickupLng, realPositions = [], config = {}, seed = 'r' }) => {
  const { enabled = true, icon_url: iconUrl = '', count = 5, radius_m: radiusM = 600 } = config;

  const cars = useMemo(() => {
    if (!enabled || count <= 0) return [];
    const out = [];
    const push = (id, bearing, factor) => {
      const r = factor * MAX_R;
      const x = Math.sin(bearing) * r;   // east → right
      const y = -Math.cos(bearing) * r;  // north → up
      // Heading toward the pickup (centre) so the car faces where it drives.
      const rot = (Math.atan2(-x, y) * 180) / Math.PI;
      out.push({ id, x, y, rot });
    };
    // 1) Real drivers first; coincident / at-pickup positions are scattered.
    const reals = (realPositions || []).filter((p) => p && p.lat != null && p.lng != null).slice(0, count);
    reals.forEach((p, i) => {
      const { bearing, dist } = toPolar(pickupLat, pickupLng, p.lat, p.lng);
      if (dist < 40) {
        push(`real-${i}`, rand(seed, i * 5 + 7) * Math.PI * 2, 0.45 + rand(seed, i * 5 + 8) * 0.5);
      } else {
        push(`real-${i}`, bearing, Math.max(0.4, Math.min(0.96, dist / radiusM)));
      }
    });
    // 2) Pad with stable simulated cars up to count.
    for (let i = reals.length; i < count; i++) {
      push(`sim-${i}`, rand(seed, i * 3 + 1) * Math.PI * 2, 0.45 + rand(seed, i * 3 + 2) * 0.5);
    }
    return out;
  }, [enabled, count, radiusM, pickupLat, pickupLng, realPositions, seed]);

  if (!enabled || !pickupLat || cars.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" data-testid="radar-cars">
      {cars.map((c, i) => {
        const dur = 4.6 + (i % 5) * 0.7;
        const delay = (i % 6) * 0.55;
        return (
          <div
            key={c.id}
            className="absolute left-1/2 top-1/2"
            data-testid={`radar-car-${c.id}`}
            style={{
              '--x': `${c.x}px`,
              '--y': `${c.y}px`,
              animation: `radar-converge ${dur}s ease-in-out ${delay}s infinite`,
            }}
          >
            <div style={{ transform: `rotate(${c.rot}deg)` }}>
              <CarIcon iconUrl={iconUrl} size={26} />
            </div>
          </div>
        );
      })}
      <style>{`@keyframes radar-converge{
        0%{transform:translate(-50%,-50%) translate(var(--x),var(--y)) scale(1);opacity:0}
        16%{opacity:1}
        80%{opacity:1}
        100%{transform:translate(-50%,-50%) translate(calc(var(--x)*0.12),calc(var(--y)*0.12)) scale(0.82);opacity:0}
      }`}</style>
    </div>
  );
};

export default RadarCars;
