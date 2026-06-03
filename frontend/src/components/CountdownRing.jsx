import React from 'react';

/**
 * Circular countdown ring (inDrive-style urgency) used on both passenger
 * (driver offer cards) and driver (own pending offer) sides of the bidding flow.
 */
export const CountdownRing = ({ seconds, total = 30, size = 36 }) => {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, seconds / total));
  const color = seconds <= 8 ? '#ef4444' : seconds <= 15 ? '#f59e0b' : '#10b981';
  return (
    <div
      className="relative flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
      data-testid="offer-countdown"
    >
      <svg className="-rotate-90" width={size} height={size} viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
        <circle
          cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
        />
      </svg>
      <span className="absolute text-[11px] font-extrabold tabular-nums" style={{ color }}>{seconds}</span>
    </div>
  );
};

export default CountdownRing;
