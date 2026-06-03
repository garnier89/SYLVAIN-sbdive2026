import React from 'react';
import { MapPin } from '@phosphor-icons/react';

/**
 * SearchingRadar — "looking for a driver" animation matching the SB Drive VTC
 * design: a white location pin centred inside a rotating broken blue ring
 * (4 arcs), over concentric pulsing radar circles.
 *
 * Props:
 *  - size: overall diameter in px (default 200)
 */
export const SearchingRadar = ({ size = 200 }) => {
  // r=44 → circumference ≈ 276.46 → 8 equal segments (4 arcs + 4 gaps) ≈ 34.56
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      data-testid="searching-radar"
    >
      {/* Concentric pulsing radar rings */}
      <span
        className="absolute rounded-full border border-blue-500/20 bg-blue-500/5 animate-ping"
        style={{ width: size, height: size, animationDuration: '2.6s' }}
      />
      <span
        className="absolute rounded-full border border-blue-500/25 bg-blue-500/5 animate-ping"
        style={{ width: size * 0.68, height: size * 0.68, animationDuration: '2.6s', animationDelay: '0.7s' }}
      />

      {/* Rotating broken ring — 4 blue arcs */}
      <svg
        className="absolute animate-spin"
        style={{ width: size * 0.82, height: size * 0.82, animationDuration: '2.4s' }}
        viewBox="0 0 100 100"
        fill="none"
      >
        <circle
          cx="50" cy="50" r="44"
          stroke="#2563EB" strokeWidth="5" strokeLinecap="round"
          strokeDasharray="34.56 34.56"
        />
      </svg>

      {/* Centre white location pin on a blue disc */}
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: size * 0.4, height: size * 0.4,
          background: '#2563EB', boxShadow: '0 8px 24px rgba(37,99,235,0.35)',
        }}
      >
        <MapPin size={size * 0.24} weight="fill" className="text-white" />
      </div>
    </div>
  );
};

export default SearchingRadar;
