import React from 'react';
import { MapPin } from '@phosphor-icons/react';

/**
 * SearchingRadar — "looking for a driver" animation matching the SB Drive VTC
 * design: a white location pin centred inside a rotating broken orange ring
 * (4 arcs), over concentric pulsing radar circles. Tuned for a WHITE background.
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
        className="absolute rounded-full border border-[#FF5000]/20 bg-[#FF5000]/5 animate-ping"
        style={{ width: size, height: size, animationDuration: '2.6s' }}
      />
      <span
        className="absolute rounded-full border border-[#FF5000]/25 bg-[#FF5000]/5 animate-ping"
        style={{ width: size * 0.68, height: size * 0.68, animationDuration: '2.6s', animationDelay: '0.7s' }}
      />

      {/* Rotating broken ring — 4 orange arcs */}
      <svg
        className="absolute animate-spin"
        style={{ width: size * 0.82, height: size * 0.82, animationDuration: '2.4s' }}
        viewBox="0 0 100 100"
        fill="none"
      >
        <circle
          cx="50" cy="50" r="44"
          stroke="#FF5000" strokeWidth="5" strokeLinecap="round"
          strokeDasharray="34.56 34.56"
        />
      </svg>

      {/* Centre white location pin on an orange disc */}
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: size * 0.4, height: size * 0.4,
          background: '#FF5000', boxShadow: '0 8px 24px rgba(255,80,0,0.35)',
        }}
      >
        <MapPin size={size * 0.24} weight="fill" className="text-white" />
      </div>
    </div>
  );
};

export default SearchingRadar;
