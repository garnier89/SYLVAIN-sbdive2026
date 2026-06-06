import React, { useMemo } from 'react';

/**
 * RadarCars — little top-view cars in movement on the "searching" radar map.
 * Admin-configurable (enabled / icon / count / dispersion radius) via the
 * "Recherche chauffeur" service config (service_key="ride_search").
 *
 * Real nearby-driver positions glide smoothly to their latest GPS coordinates
 * (CSS transition) and face their travel direction. Remaining slots are filled
 * with simulated cars that drive across the radar ("passing traffic") so the
 * scene always feels alive.
 *
 * Props:
 *  - pickupLat, pickupLng : pickup coordinates (origin of the radar)
 *  - realPositions : [{lat,lng}] live nearby drivers (optional)
 *  - config : { enabled, icon_url, count, radius_m }
 *  - seed : stable string (ride id) so simulated cars don't jump between polls
 */
const MAX_R = 124; // px — keep cars inside the visible map area

const rand = (seed, i) => {
  let h = 2166136261 ^ i;
  const s = `${seed}:${i}`;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
};

const toPolar = (plat, plng, lat, lng) => {
  const dLat = (lat - plat) * 111320;
  const dLng = (lng - plng) * 111320 * Math.cos((plat * Math.PI) / 180);
  return { dist: Math.hypot(dLat, dLng), bearing: Math.atan2(dLng, dLat) };
};

// Top-view car icon — glossy white car with windshield & red taillights
const TopCar = ({ size = 30 }) => (
  <svg width={size * 0.72} height={size} viewBox="0 0 40 56" style={{ filter: 'drop-shadow(0 3px 5px rgba(11,20,38,0.5))' }}>
    <defs>
      <linearGradient id="radarCarBody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#e7ebf1" />
      </linearGradient>
    </defs>
    <rect x="2" y="20" width="4.5" height="3.4" rx="1.7" fill="#dfe3e9" />
    <rect x="33.5" y="20" width="4.5" height="3.4" rx="1.7" fill="#dfe3e9" />
    <rect x="5" y="2" width="30" height="52" rx="12" fill="url(#radarCarBody)" stroke="#c5cbd4" strokeWidth="1" />
    <path d="M9.5 18 C14 13 26 13 30.5 18 L28.5 25.5 C23 22.8 17 22.8 11.5 25.5 Z" fill="#1f2733" opacity="0.88" />
    <rect x="11" y="27" width="18" height="11.5" rx="4" fill="#f4f6f9" />
    <path d="M11.5 40 C17 38 23 38 28.5 40 L30.5 46 C25.5 44 14.5 44 9.5 46 Z" fill="#2b3340" opacity="0.7" />
    <rect x="7" y="48.5" width="6" height="3.2" rx="1.6" fill="#e23030" />
    <rect x="27" y="48.5" width="6" height="3.2" rx="1.6" fill="#e23030" />
  </svg>
);

const CarIcon = ({ iconUrl, size = 30 }) =>
  iconUrl
    ? <img src={iconUrl} alt="" style={{ width: size, height: size, filter: 'drop-shadow(0 3px 4px rgba(11,20,38,0.4))' }} className="object-contain" />
    : <TopCar size={size} />;

const deg = (x, y) => (Math.atan2(x, -y) * 180) / Math.PI; // heading so the car nose follows (x,y)

export const RadarCars = ({ pickupLat, pickupLng, realPositions = [], config = {}, seed = 'r' }) => {
  const { enabled = true, icon_url: iconUrl = '', count = 5, radius_m: radiusM = 600 } = config;

  const realKey = JSON.stringify(realPositions || []);

  // Real drivers that are genuinely on the move (away from the pickup) glide to
  // their GPS position and face the pickup ("arriving"). Drivers sitting on the
  // pickup are left to the simulated moving traffic so the scene always lives.
  const realCars = useMemo(() => {
    if (!enabled || count <= 0 || !pickupLat) return [];
    const out = [];
    const arr = (realPositions || []).filter((p) => p && p.lat != null && p.lng != null);
    for (const p of arr) {
      if (out.length >= count) break;
      const { dist, bearing } = toPolar(pickupLat, pickupLng, p.lat, p.lng);
      if (dist < 60) continue; // on the pickup → handled by moving traffic
      const f = Math.max(0.2, Math.min(0.96, dist / radiusM));
      const x = Math.sin(bearing) * f * MAX_R, y = -Math.cos(bearing) * f * MAX_R;
      out.push({ id: `real-${out.length}`, x, y, rot: deg(-x, -y) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, count, radiusM, pickupLat, pickupLng, realKey]);

  // Simulated cars → drive across the radar (passing traffic).
  const simCars = useMemo(() => {
    if (!enabled || count <= 0) return [];
    const out = [];
    for (let j = 0; j < count; j++) {
      const theta = rand(seed, j * 7 + 1) * Math.PI * 2;
      const offset = (rand(seed, j * 7 + 2) - 0.5) * 1.5 * MAX_R;
      const L = MAX_R * 1.4;
      const ux = Math.sin(theta), uy = -Math.cos(theta);     // travel direction
      const px = Math.cos(theta), py = Math.sin(theta);      // perpendicular
      const sx = -L * ux + offset * px, sy = -L * uy + offset * py;
      const ex = L * ux + offset * px, ey = L * uy + offset * py;
      const dur = 7 + rand(seed, j * 7 + 3) * 6;
      const delay = -rand(seed, j * 7 + 4) * dur; // desync: start mid-cycle
      out.push({ id: `sim-${j}`, sx, sy, ex, ey, rot: deg(ux, uy), dur, delay });
    }
    return out;
  }, [enabled, count, seed]);

  if (!enabled || !pickupLat) return null;

  const realCount = realCars.length;
  const simShown = simCars.slice(0, Math.max(0, count - realCount));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" data-testid="radar-cars">
      {realCars.map((c) => (
        <div
          key={c.id}
          className="absolute left-1/2 top-1/2"
          data-testid={`radar-car-${c.id}`}
          style={{ transform: `translate(-50%,-50%) translate(${c.x}px,${c.y}px)`, transition: 'transform 1.6s linear' }}
        >
          <div style={{ transform: `rotate(${c.rot}deg)`, transition: 'transform 0.8s ease' }}>
            <CarIcon iconUrl={iconUrl} />
          </div>
        </div>
      ))}
      {simShown.map((c) => (
        <div
          key={c.id}
          className="absolute left-1/2 top-1/2"
          data-testid={`radar-car-${c.id}`}
          style={{
            '--sx': `${c.sx}px`, '--sy': `${c.sy}px`, '--ex': `${c.ex}px`, '--ey': `${c.ey}px`,
            animation: `radar-traffic ${c.dur}s linear ${c.delay}s infinite`,
          }}
        >
          <div style={{ transform: `rotate(${c.rot}deg)` }}>
            <CarIcon iconUrl={iconUrl} />
          </div>
        </div>
      ))}
      <style>{`@keyframes radar-traffic{
        0%{transform:translate(-50%,-50%) translate(var(--sx),var(--sy));opacity:0}
        10%{opacity:1}
        90%{opacity:1}
        100%{transform:translate(-50%,-50%) translate(var(--ex),var(--ey));opacity:0}
      }`}</style>
    </div>
  );
};

export default RadarCars;
