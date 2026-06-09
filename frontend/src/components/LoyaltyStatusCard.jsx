import React, { useEffect, useState } from 'react';
import { Trophy, CaretRight } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

/** Compact loyalty status card (client & driver). Shows tier, progress to the
 *  next tier and the active perk. Hidden when loyalty is disabled. */
export const LoyaltyStatusCard = ({ onClick, className = '' }) => {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/loyalty/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.enabled) setData(d); })
      .catch(() => {});
  }, []);

  if (!data) return null;
  const { tier, next_tier, points, points_to_next, perk } = data;
  const pct = next_tier
    ? Math.min(100, Math.round(((points - tier.min_points) / (next_tier.min_points - tier.min_points)) * 100))
    : 100;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl p-4 shadow-sm text-white active:scale-[0.99] transition-transform ${className}`}
      style={{ background: `linear-gradient(120deg, ${tier.color}, #0B0B0B)` }}
      data-testid="loyalty-status-card"
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <Trophy size={24} weight="fill" className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold" data-testid="loyalty-tier-name">{tier.name}</span>
            <span className="text-[11px] text-white/80" data-testid="loyalty-points">{points} pts</span>
          </div>
          <p className="text-[12px] text-white/85 mt-0.5">{perk?.label}</p>
        </div>
        <CaretRight size={18} weight="bold" className="text-white/80 shrink-0" />
      </div>
      {next_tier && (
        <div className="mt-3">
          <div className="h-1.5 w-full rounded-full bg-white/25 overflow-hidden">
            <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} data-testid="loyalty-progress-bar" />
          </div>
          <p className="text-[11px] text-white/80 mt-1.5" data-testid="loyalty-next-text">
            Plus que {points_to_next} pts pour atteindre {next_tier.name}
          </p>
        </div>
      )}
    </button>
  );
};

export default LoyaltyStatusCard;
