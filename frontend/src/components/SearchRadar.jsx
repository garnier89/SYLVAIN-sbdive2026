import React from 'react';

/**
 * SearchRadar — big rotating radar used on the "Recherche d'un chauffeur" screens.
 * A rotating broken ring (4 orange arcs) + pulsing waves + a white location pin
 * in the center. Matches the V3Cube searching mockup.
 *
 * Props: size (px, default 240), caption (optional text shown under the pin)
 */
export const SearchRadar = ({ size = 240, caption = null }) => {
  const pin = Math.round(size * 0.22);
  return (
    <div
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      style={{ width: size, height: size }}
      data-testid="radar-pulse"
    >
      {/* Pulsing soft waves */}
      {[0, 0.8, 1.6].map((delay) => (
        <span
          key={delay}
          className="absolute inset-0 m-auto rounded-full bg-[#FF5000]/15 animate-ping"
          style={{ width: size * 0.85, height: size * 0.85, animationDelay: `${delay}s`, animationDuration: '2.4s' }}
        />
      ))}
      {/* Soft filled glow */}
      <span className="absolute inset-0 m-auto rounded-full bg-[#FF5000]/10" style={{ width: size * 0.62, height: size * 0.62 }} />

      {/* Rotating broken ring (4 arcs) */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 m-auto animate-spin"
        style={{ width: size, height: size, animationDuration: '3.6s' }}
      >
        <circle
          cx="50" cy="50" r="44"
          fill="none" stroke="#FF5000" strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray="40 29.13"
        />
      </svg>
      {/* Inner counter-rotating thin arcs for depth */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 m-auto animate-spin"
        style={{ width: size * 0.7, height: size * 0.7, animationDuration: '5s', animationDirection: 'reverse' }}
      >
        <circle
          cx="50" cy="50" r="44"
          fill="none" stroke="#FF5000" strokeWidth="2.5" strokeLinecap="round" opacity="0.5"
          strokeDasharray="22 47"
        />
      </svg>

      {/* Center white location pin */}
      <svg
        className="absolute left-1/2 top-1/2"
        style={{ width: pin, height: pin * 1.25, transform: 'translate(-50%, -58%)' }}
        viewBox="0 0 44 54"
      >
        <path
          d="M22 1.5 C11 1.5 2.5 9.7 2.5 20.5 C2.5 34.5 22 52 22 52 C22 52 41.5 34.5 41.5 20.5 C41.5 9.7 33 1.5 22 1.5 Z"
          fill="#FFFFFF" stroke="#FF5000" strokeWidth="3.2"
        />
        <circle cx="22" cy="20.5" r="7" fill="none" stroke="#FF5000" strokeWidth="3.2" />
      </svg>

      {/* Estimated wait time under the pin */}
      {caption && (
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform: 'translate(-50%, 16px)' }}
          data-testid="radar-eta"
        >
          <span className="px-2.5 py-1 rounded-full bg-white shadow-md text-[11px] font-extrabold text-[#FF5000] whitespace-nowrap ring-1 ring-black/5">
            {caption}
          </span>
        </div>
      )}
    </div>
  );
};

export default SearchRadar;
