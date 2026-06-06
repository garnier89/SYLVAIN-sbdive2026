import React from 'react';
import { MapPin } from '@phosphor-icons/react';

/**
 * SearchingRadar — "looking for a driver" animation matching the SB Drive VTC
 * design: a location pin centred inside a rotating broken ring (4 arcs), over
 * concentric pulsing radar circles.
 *
 * Props:
 *  - size: overall diameter in px (default 200)
 *  - variant: 'light' (orange accents on a white background) | 'orange'
 *    (white accents tuned for an ORANGE background, default 'light')
 */
export const SearchingRadar = ({ size = 200, variant = 'light' }) => {
  // r=44 → circumference ≈ 276.46 → 8 equal segments (4 arcs + 4 gaps) ≈ 34.56
  const onOrange = variant === 'orange';
  const ringClass = onOrange
    ? 'border-white/40 bg-white/10'
    : 'border-[#FF5000]/20 bg-[#FF5000]/5';
  const arcStroke = onOrange ? '#FFFFFF' : '#FF5000';
  const discBg = onOrange ? '#FFFFFF' : '#FF5000';
  const discShadow = onOrange ? '0 8px 24px rgba(0,0,0,0.20)' : '0 8px 24px rgba(255,80,0,0.35)';
  const pinClass = onOrange ? 'text-[#FF5000]' : 'text-white';

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      data-testid="searching-radar"
    >
      {/* Concentric pulsing radar rings */}
      <span
        className={`absolute rounded-full border animate-ping ${ringClass}`}
        style={{ width: size, height: size, animationDuration: '2.6s' }}
      />
      <span
        className={`absolute rounded-full border animate-ping ${ringClass}`}
        style={{ width: size * 0.68, height: size * 0.68, animationDuration: '2.6s', animationDelay: '0.7s' }}
      />

      {/* Rotating broken ring — 4 arcs */}
      <svg
        className="absolute animate-spin"
        style={{ width: size * 0.82, height: size * 0.82, animationDuration: '2.4s' }}
        viewBox="0 0 100 100"
        fill="none"
      >
        <circle
          cx="50" cy="50" r="44"
          stroke={arcStroke} strokeWidth="5" strokeLinecap="round"
          strokeDasharray="34.56 34.56"
        />
      </svg>

      {/* Centre location pin on a contrasting disc */}
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: size * 0.4, height: size * 0.4,
          background: discBg, boxShadow: discShadow,
        }}
      >
        <MapPin size={size * 0.24} weight="fill" className={pinClass} />
      </div>
    </div>
  );
};

export default SearchingRadar;
