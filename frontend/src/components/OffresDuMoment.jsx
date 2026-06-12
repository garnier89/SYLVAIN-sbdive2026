import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AirplaneTilt, Bed, Tag, Fire } from '@phosphor-icons/react';
import { travelPackagesAPI } from '../services/api';

const NAVY = '#0A2540';
const money = (n) => `${Number(n || 0).toFixed(0)} €`;

/**
 * Carrousel « Offres du moment » : met en avant les forfaits Vol+Hôtel
 * avec la plus forte remise. Clic → deep-link vers le forfait (/forfaits?pkg=ID).
 */
export const OffresDuMoment = ({ className = '' }) => {
  const navigate = useNavigate();
  const [offers, setOffers] = useState([]);

  useEffect(() => {
    travelPackagesAPI.list()
      .then((r) => {
        const list = (r.data.packages || [])
          .filter((p) => (p.discount_pct || 0) > 0)
          .sort((a, b) => (b.discount_pct || 0) - (a.discount_pct || 0) || (b.savings || 0) - (a.savings || 0))
          .slice(0, 6);
        setOffers(list);
      })
      .catch(() => {});
  }, []);

  if (offers.length === 0) return null;

  return (
    <section className={className} data-testid="offres-du-moment">
      <div className="flex items-center justify-between px-4 mb-2">
        <h2 className="text-base font-black flex items-center gap-1.5" style={{ color: NAVY }}>
          <Fire size={18} weight="fill" className="text-[#FF5000]" /> Offres du moment
        </h2>
        <button onClick={() => navigate('/forfaits')} data-testid="offres-see-all" className="text-xs font-bold" style={{ color: '#FF5000' }}>Tout voir</button>
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 pb-2 no-scrollbar snap-x">
        {offers.map((p) => (
          <button
            key={p.id}
            onClick={() => navigate(`/forfaits?pkg=${p.id}`)}
            data-testid={`offre-card-${p.id}`}
            className="snap-start shrink-0 w-64 text-left bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
          >
            <div className="h-24 relative flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7C3AED, #1D4ED8)' }}>
              {p.image_url
                ? <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                : <AirplaneTilt size={32} weight="duotone" className="text-white/70" />}
              <span className="absolute top-2 right-2 text-[11px] font-black px-2 py-1 rounded-full bg-[#FF5000] text-white flex items-center gap-1">
                <Tag size={11} weight="fill" /> -{p.discount_pct}%
              </span>
            </div>
            <div className="p-3">
              <p className="font-bold text-gray-900 text-sm truncate">{p.title}</p>
              <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5 truncate">
                <AirplaneTilt size={11} /> {p.flight?.origin} → {p.flight?.destination}
                <Bed size={11} className="ml-1" /> {p.nights}n
              </p>
              <div className="flex items-center justify-between mt-1.5">
                <span>
                  <span className="text-[11px] text-gray-400 line-through mr-1">{money(p.base_total)}</span>
                  <span className="font-black text-sm" style={{ color: NAVY }}>{money(p.final_total)}</span>
                </span>
                <span className="text-[11px] font-bold text-emerald-600">−{money(p.savings)}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};

export default OffresDuMoment;
