import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy, Check, Crown } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const LoyaltyPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/loyalty/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="min-h-screen flex items-center justify-center text-gray-400">Chargement…</div>;

  const { tier, next_tier, points, points_to_next, perk, tiers, history, is_driver } = data;
  const pct = next_tier
    ? Math.min(100, Math.round(((points - tier.min_points) / (next_tier.min_points - tier.min_points)) * 100))
    : 100;

  return (
    <div className="min-h-screen bg-gray-50 pb-10" data-testid="loyalty-page">
      <div className="text-white p-5" style={{ background: `linear-gradient(120deg, ${tier.color}, #0B0B0B)` }}>
        <button onClick={() => navigate(-1)} className="mb-4" data-testid="loyalty-back"><ArrowLeft size={22} className="text-white" /></button>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
            <Trophy size={30} weight="fill" className="text-white" />
          </div>
          <div>
            <p className="text-2xl font-black" data-testid="loyalty-tier">{tier.name}</p>
            <p className="text-sm text-white/85" data-testid="loyalty-points">{points} points · {perk?.label}</p>
          </div>
        </div>
        {next_tier && (
          <div className="mt-4">
            <div className="h-2 w-full rounded-full bg-white/25 overflow-hidden">
              <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-white/85 mt-2">Plus que {points_to_next} pts pour {next_tier.name}</p>
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2"><Crown size={16} weight="fill" className="text-amber-500" /> Les paliers</h2>
        {tiers.map((t) => {
          const reached = points >= t.min_points;
          const perkVal = is_driver ? t.driver_commission_discount_pct : t.client_discount_pct;
          const perkTxt = is_driver ? `-${perkVal}% commission` : `-${perkVal}% sur vos courses`;
          return (
            <div key={t.key} className={`rounded-xl border p-3 flex items-center gap-3 ${t.key === tier.key ? 'border-2' : 'border-gray-200'}`}
              style={t.key === tier.key ? { borderColor: t.color } : {}} data-testid={`loyalty-tier-${t.key}`}>
              <span className="w-4 h-4 rounded-full shrink-0" style={{ background: t.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800">{t.name} <span className="text-xs font-normal text-gray-400">· {t.min_points} pts</span></p>
                <p className="text-[12px] text-gray-500">{perkVal > 0 ? perkTxt : 'Statut de base'}</p>
              </div>
              {reached && <Check size={18} weight="bold" className="text-green-500 shrink-0" />}
            </div>
          );
        })}

        {history?.length > 0 && (
          <>
            <h2 className="text-sm font-bold text-gray-700 mt-5 mb-1">Historique des points</h2>
            <div className="rounded-xl bg-white border border-gray-200 divide-y">
              {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5" data-testid={`loyalty-history-${i}`}>
                  <span className="text-[13px] text-gray-600">{labelFor(h.reason)}</span>
                  <span className="text-sm font-bold text-green-600">+{h.points}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const labelFor = (r) => ({
  ride_completed: 'Course terminée',
  first_ride_bonus: 'Bonus 1ère course',
  referral_bonus: 'Bonus parrainage',
}[r] || r);

export default LoyaltyPage;
