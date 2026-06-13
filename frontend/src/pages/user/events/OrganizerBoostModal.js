import React, { useState } from 'react';
import { X, Megaphone, CurrencyEur } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { organizerAPI } from '../../../services/api';
import { fmtPrice } from './eventsShared';

/** Paid sponsorship ("boost") of one event, charged to SB Pay. */
const OrganizerBoostModal = ({ event, pricePerDay, onClose, onDone }) => {
  const [days, setDays] = useState(3);
  const [paying, setPaying] = useState(false);
  const cost = (days * pricePerDay).toFixed(2);
  const boost = async () => {
    setPaying(true);
    try {
      const r = await organizerAPI.boost(event.id, days);
      toast.success(`Sponsorisé ${days} j • ${fmtPrice(r.data.cost)} débités`);
      onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); onClose(); }
    finally { setPaying(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" data-testid="boost-modal">
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><Megaphone size={18} weight="fill" className="text-[#FF4500]" /> Booster l'événement</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4 line-clamp-1">{event.title}</p>
        <p className="text-xs text-gray-500 mb-2">Affichage « À la une » et en tête de liste pendant :</p>
        <div className="flex items-center gap-3 justify-center mb-4">
          <button onClick={() => setDays((d) => Math.max(1, d - 1))} className="w-9 h-9 rounded-full bg-gray-100 font-bold" data-testid="boost-minus">−</button>
          <span className="text-2xl font-extrabold w-16 text-center" data-testid="boost-days">{days} j</span>
          <button onClick={() => setDays((d) => Math.min(60, d + 1))} className="w-9 h-9 rounded-full bg-gray-100 font-bold" data-testid="boost-plus">+</button>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between mb-4">
          <span className="text-sm text-gray-600 flex items-center gap-1"><CurrencyEur size={14} /> {pricePerDay}/jour</span>
          <span className="font-extrabold text-[#B91C1C]">{cost} €</span>
        </div>
        <button onClick={boost} disabled={paying} className="w-full bg-[#FF4500] text-white font-extrabold py-3 rounded-xl disabled:opacity-60" data-testid="boost-pay-btn">
          {paying ? '...' : `Payer ${cost} € avec SB Pay`}
        </button>
      </div>
    </div>
  );
};

export default OrganizerBoostModal;
