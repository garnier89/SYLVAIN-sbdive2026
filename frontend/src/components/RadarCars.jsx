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

// Top-view (bird's-eye) car icon — glossy white car with windshield & red taillights
const TopCar = ({ size = 26 }) => (
  <svg width={size * 0.72} height={size} viewBox="0 0 40 56" style={{ filter: 'drop-shadow(0 3px 5px rgba(11,20,38,0.5))' }}>
    <defs>
      <linearGradient id="radarCarBody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#e7ebf1" />
      </linearGradient>
    </defs>
    {/* side mirrors */}
    <rect x="2" y="20" width="4.5" height="3.4" rx="1.7" fill="#dfe3e9" />
    <rect x="33.5" y="20" width="4.5" height="3.4" rx="1.7" fill="#dfe3e9" />
    {/* body */}
    <rect x="5" y="2" width="30" height="52" rx="12" fill="url(#radarCarBody)" stroke="#c5cbd4" strokeWidth="1" />
    {/* windshield (front glass) */}
    <path d="M9.5 18 C14 13 26 13 30.5 18 L28.5 25.5 C23 22.8 17 22.8 11.5 25.5 Z" fill="#1f2733" opacity="0.88" />
    {/* roof */}
    <rect x="11" y="27" width="18" height="11.5" rx="4" fill="#f4f6f9" />
    {/* rear window */}
    <path d="M11.5 40 C17 38 23 38 28.5 40 L30.5 46 C25.5 44 14.5 44 9.5 46 Z" fill="#2b3340" opacity="0.7" />
    {/* taillights */}
    <rect x="7" y="48.5" width="6" height="3.2" rx="1.6" fill="#e23030" />
    <rect x="27" y="48.5" width="6" height="3.2" rx="1.6" fill="#e23030" />
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
              <CarIcon iconUrl={iconUrl} size={30} />
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
