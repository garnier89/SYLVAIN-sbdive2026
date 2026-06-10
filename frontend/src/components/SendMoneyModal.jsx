import React, { useState } from 'react';
import { PaperPlaneTilt, X } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * P2P money transfer by phone (SbPayGo Send). Shared by the client and driver
 * wallets. `maxAmount` caps the send (drivers pass their withdrawable amount so
 * the non-withdrawable reserve is preserved). `maxLabel` labels that amount.
 */
export const SendMoneyModal = ({ maxAmount, maxLabel = 'Solde disponible', initialRecipient, onClose, onDone }) => {
  const [recipient, setRecipient] = useState(initialRecipient || '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const numAmount = parseFloat(amount) || 0;
  const max = Number(maxAmount || 0);

  const submit = async () => {
    if (!recipient.trim() || numAmount <= 0) return;
    if (numAmount > max) { toast.error('Montant supérieur au disponible'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/finance/sbpaygo/send`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_phone: recipient, amount: numAmount, note: note || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.detail === 'string' ? err.detail : 'Envoi échoué');
      }
      const data = await res.json();
      toast.success(`${numAmount.toFixed(2)} € envoyés${data.recipient_found ? '' : ' (destinataire en attente)'}`);
      onDone();
    } catch (e) {
      toast.error(e.message || 'Envoi échoué');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center bg-black/50" data-testid="send-modal">
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl sm:rounded-3xl p-6 mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <PaperPlaneTilt size={20} weight="duotone" className="text-orange-600" />
            Envoyer de l'argent
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="send-close">
            <X size={14} />
          </button>
        </div>

        <div className="mb-4 text-xs text-gray-500">{maxLabel} : <b className="text-gray-900">{max.toFixed(2)} €</b></div>

        <div className="space-y-3 mb-5">
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Téléphone du destinataire</label>
            <input
              type="tel" value={recipient} onChange={(e) => setRecipient(e.target.value)}
              placeholder="+33 6 12 34 56 78"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
              data-testid="send-recipient-input"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Montant (€)</label>
            <input
              type="number" min="0.5" step="0.5" max={max}
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
              data-testid="send-amount-input"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Note (optionnel)</label>
            <input
              type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Ex : Remboursement repas"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
              data-testid="send-note-input"
            />
          </div>
        </div>

        <button
          onClick={submit}
          disabled={loading || !recipient.trim() || numAmount <= 0 || numAmount > max}
          className="w-full h-12 rounded-xl bg-orange-600 text-white font-bold disabled:opacity-60"
          data-testid="send-confirm-btn"
        >
          {loading ? 'Envoi…' : `Envoyer ${numAmount.toFixed(2)} €`}
        </button>
      </div>
    </div>
  );
};

export default SendMoneyModal;
