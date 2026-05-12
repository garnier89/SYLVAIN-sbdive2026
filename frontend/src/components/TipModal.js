import React, { useState } from 'react';
import { X, HandHeart, Star, Smiley } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * TipModal — Lets passengers add a tip to a completed ride.
 * Calls POST /api/phase2/rides/{rideId}/tip with {amount}.
 *
 * Props:
 *   - open: boolean
 *   - rideId: string
 *   - currency: 'EUR' | string
 *   - onClose: () => void
 *   - onSuccess: (amount: number) => void
 */
const PRESETS = [2, 5, 10];

const TipModal = ({ open, rideId, currency = 'EUR', onClose, onSuccess }) => {
  const [amount, setAmount] = useState(2);
  const [custom, setCustom] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;
  const finalAmount = custom ? parseFloat(custom) : amount;

  const submit = async () => {
    if (!finalAmount || finalAmount <= 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/phase2/rides/${rideId}/tip`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: finalAmount }),
      });
      if (!res.ok) throw new Error('tip failed');
      toast.success(`Merci ! ${finalAmount.toFixed(2)} ${currency === 'EUR' ? '€' : currency} envoyé`);
      onSuccess?.(finalAmount);
      onClose();
    } catch {
      toast.error("Échec de l'envoi du pourboire");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center bg-black/50" data-testid="tip-modal">
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl sm:rounded-3xl p-6 mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <HandHeart size={20} weight="duotone" className="text-pink-500" />
            Pourboire au chauffeur
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="tip-close-btn">
            <X size={14} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-5 flex items-center gap-1">
          <Smiley size={14} weight="duotone" className="text-amber-500" />
          Récompensez un excellent service. 100% va au chauffeur.
        </p>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {PRESETS.map((v) => (
            <button
              key={v}
              onClick={() => { setAmount(v); setCustom(''); }}
              className={`py-3 rounded-xl border-2 font-bold ${!custom && amount === v ? 'border-[#FF4500] bg-orange-50 text-[#FF4500]' : 'border-gray-200 text-gray-700'}`}
              data-testid={`tip-preset-${v}`}
            >
              {v} €
            </button>
          ))}
        </div>

        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-700 mb-1">Montant personnalisé</label>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Ex : 3.50"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
            data-testid="tip-custom-input"
          />
        </div>

        <button
          onClick={submit}
          disabled={loading || !finalAmount}
          className="w-full h-12 rounded-xl bg-[#FF4500] text-white font-bold disabled:opacity-60 flex items-center justify-center gap-2"
          data-testid="tip-submit-btn"
        >
          <Star size={16} weight="fill" />
          {loading ? 'Envoi…' : `Envoyer ${finalAmount?.toFixed(2) || '0.00'} €`}
        </button>
        <button onClick={onClose} className="w-full mt-2 text-sm text-gray-400 py-2" data-testid="tip-skip-btn">
          Passer
        </button>
      </div>
    </div>
  );
};

export default TipModal;
