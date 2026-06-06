import React, { useMemo } from 'react';
import { Car } from '@phosphor-icons/react';

/**
 * RadarCars — little cars scattered around the pickup on the "searching" radar map.
 * Admin-configurable (enabled / icon / count / dispersion radius) via the
 * "Recherche chauffeur" service config (service_key="ride_search").
 *
 * Real nearby-driver positions are used first (correct bearing & relative
 * distance), then padded with stable simulated cars up to `count` for ambiance.
 *
 * Props:
 *  - pickupLat, pickupLng : pickup coordinates (origin of the radar)
 *  - realPositions : [{lat,lng}] live nearby drivers (optional)
 *  - config : { enabled, icon_url, count, radius_m }
 *  - seed : stable string (ride id) so simulated cars don't jump between polls
 */
const MAX_R = 116; // px — keep cars inside the visible map area

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

const CarIcon = ({ iconUrl }) => (
  <div className="w-9 h-9 rounded-full bg-white shadow-[0_4px_10px_-2px_rgba(11,20,38,0.35)] flex items-center justify-center ring-1 ring-black/5">
    {iconUrl
      ? <img src={iconUrl} alt="" className="w-6 h-6 object-contain" />
      : <Car size={20} weight="fill" className="text-[#FF5000]" />}
  </div>
);

export const RadarCars = ({ pickupLat, pickupLng, realPositions = [], config = {}, seed = 'r' }) => {
  const { enabled = true, icon_url: iconUrl = '', count = 5, radius_m: radiusM = 600 } = config;

  const cars = useMemo(() => {
    if (!enabled || count <= 0) return [];
    const out = [];
    // 1) Real drivers first (correct direction & relative distance).
    //    Coincident / at-pickup positions are scattered to avoid stacking.
    const reals = (realPositions || []).filter((p) => p && p.lat != null && p.lng != null).slice(0, count);
    reals.forEach((p, i) => {
      const { bearing, dist } = toPolar(pickupLat, pickupLng, p.lat, p.lng);
      if (dist < 40) {
        const b = rand(seed, i * 5 + 7) * Math.PI * 2;
        const f = 0.4 + rand(seed, i * 5 + 8) * 0.5;
        out.push({ id: `real-${i}`, bearing: b, factor: f, real: true });
      } else {
        const factor = Math.max(0.32, Math.min(0.96, dist / radiusM));
        out.push({ id: `real-${i}`, bearing, factor, real: true });
      }
    });
    // 2) Pad with stable simulated cars up to count
    for (let i = reals.length; i < count; i++) {
      const bearing = rand(seed, i * 3 + 1) * Math.PI * 2;
      const factor = 0.4 + rand(seed, i * 3 + 2) * 0.5; // 0.40 – 0.90
      out.push({ id: `sim-${i}`, bearing, factor, real: false });
    }
    return out;
  }, [enabled, count, radiusM, iconUrl, pickupLat, pickupLng, realPositions, seed]);

  if (!enabled || !pickupLat || cars.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none" data-testid="radar-cars">
      {cars.map((c) => {
        const r = c.factor * MAX_R;
        const x = Math.sin(c.bearing) * r;  // east → right
        const y = -Math.cos(c.bearing) * r; // north → up
        return (
          <div
            key={c.id}
            className="absolute left-1/2 top-1/2"
            data-testid={`radar-car-${c.id}`}
            style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
          >
            <div style={{ animation: `radar-car-bob 2.6s ease-in-out ${(r % 7) / 7}s infinite` }}>
              <CarIcon iconUrl={iconUrl} />
            </div>
          </div>
        );
      })}
      <style>{`@keyframes radar-car-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}`}</style>
    </div>
  );
};

export default RadarCars;
