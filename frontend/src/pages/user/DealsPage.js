import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Tag, Copy, Percent } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { couponAPI } from '../../services/api';

const fmtDiscount = (c) => {
  if (c.discount_type === 'Percentage') {
    const cap = c.max_discount && c.max_discount < 999999 ? ` (max ${c.max_discount}€)` : '';
    return `-${c.discount_value}%${cap}`;
  }
  return `-${c.discount_value}€`;
};

const fmtExpiry = (date) => {
  if (!date) return null;
  try { return new Date(date).toLocaleDateString('fr-FR'); } catch { return null; }
};

const copyCode = (code) => {
  navigator.clipboard?.writeText(code);
  toast.success(`Code "${code}" copié`);
};

const DealsPage = () => {
  const navigate = useNavigate();
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    couponAPI.list()
      .then((r) => { if (alive) setDeals(r.data || []); })
      .catch(() => { if (alive) setDeals([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="deals-page">
      <div className="bg-gradient-to-br from-[#B45309] to-[#F59E0B] px-4 pt-5 pb-6 rounded-b-3xl">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/home')} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-extrabold text-white leading-none">Bons plans</h1>
            <p className="text-[11px] text-white/80 mt-1">Codes promo & réductions du moment</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-amber-200 border-t-[#B45309] rounded-full animate-spin" /></div>
      ) : deals.length === 0 ? (
        <div className="px-4 mt-10 text-center text-gray-500" data-testid="deals-empty">
          <Tag size={40} className="mx-auto mb-3 text-gray-300" weight="duotone" />
          <p className="text-sm">Aucune offre disponible pour le moment</p>
        </div>
      ) : (
        <div className="px-4 mt-4 space-y-3">
          {deals.map((c) => (
            <div key={c.code} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3" data-testid={`deal-${c.code}`}>
              <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Percent size={22} weight="fill" className="text-[#B45309]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-sm text-[#B45309]">{fmtDiscount(c)}</p>
                {c.description && <p className="text-[12px] text-gray-600 mt-0.5 line-clamp-2">{c.description}</p>}
                {fmtExpiry(c.expiry_date) && <p className="text-[10px] text-gray-400 mt-1">Valable jusqu'au {fmtExpiry(c.expiry_date)}</p>}
              </div>
              <button
                onClick={() => copyCode(c.code)}
                className="shrink-0 flex items-center gap-1 bg-amber-50 text-[#B45309] font-bold text-xs px-3 py-2 rounded-full border border-dashed border-amber-300"
                data-testid={`copy-${c.code}`}
              >
                {c.code} <Copy size={13} weight="bold" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DealsPage;
