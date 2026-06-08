import React, { useState, useEffect } from 'react';
import { X, Wallet, CreditCard, Package, Storefront, ShieldCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { marketplaceAPI, walletAPI } from '../../../services/api';
import { useLocale } from '../../../contexts/LocaleContext';

/**
 * Checkout modal for a fixed-price Marketplace purchase.
 * Buyer picks fulfillment (pickup / courier delivery) + payment (wallet / card).
 * Wallet → instant order; Card → redirect to Stripe Checkout.
 */
export const BuyModal = ({ listing, onClose, onPaid }) => {
  const { money } = useLocale();
  const [fulfillment, setFulfillment] = useState('pickup');
  const [address, setAddress] = useState('');
  const [method, setMethod] = useState('wallet');
  const [settings, setSettings] = useState({ commission_pct: 10, delivery_fee: 5 });
  const [balance, setBalance] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    marketplaceAPI.settings().then((r) => setSettings(r.data)).catch(() => {});
    walletAPI.get().then((r) => setBalance(r.data.balance || 0)).catch(() => {});
  }, []);

  const price = Number(listing.price) || 0;
  const deliveryFee = fulfillment === 'delivery' ? Number(settings.delivery_fee || 0) : 0;
  const total = price + deliveryFee;
  const insufficient = method === 'wallet' && balance < total;

  const submit = async () => {
    if (fulfillment === 'delivery' && !address.trim()) {
      toast.error('Veuillez saisir une adresse de livraison'); return;
    }
    setSubmitting(true);
    try {
      const payload = { listing_id: listing.id, fulfillment, delivery_address: address };
      if (method === 'wallet') {
        const r = await marketplaceAPI.buyWithWallet(payload);
        toast.success('Achat confirmé ! Le vendeur a été notifié.');
        onPaid?.(r.data.order);
      } else {
        const r = await marketplaceAPI.buyWithCard({ ...payload, origin_url: window.location.origin });
        if (r.data.url) window.location.href = r.data.url;
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Échec de l'achat");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose} data-testid="buy-modal">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h3 className="text-lg font-extrabold text-gray-900">Acheter</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500" data-testid="buy-modal-close"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-3">
            {listing.image ? <img src={listing.image} alt="" className="w-14 h-14 rounded-xl object-cover" /> : <div className="w-14 h-14 rounded-xl bg-gray-100" />}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 truncate">{listing.title}</p>
              <p className="text-blue-600 font-extrabold">{money(price)}</p>
            </div>
          </div>

          {/* Fulfillment */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">Réception</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setFulfillment('pickup')} data-testid="fulfillment-pickup"
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-semibold ${fulfillment === 'pickup' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                <Storefront size={20} /> Retrait / à convenir
              </button>
              <button onClick={() => setFulfillment('delivery')} data-testid="fulfillment-delivery"
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-semibold ${fulfillment === 'delivery' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                <Package size={20} /> Livraison (+{money(settings.delivery_fee || 0)})
              </button>
            </div>
            {fulfillment === 'delivery' && (
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresse de livraison"
                className="w-full border rounded-xl px-3 py-2 text-sm mt-2" data-testid="delivery-address-input" />
            )}
          </div>

          {/* Payment method */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">Paiement</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMethod('wallet')} data-testid="pay-wallet"
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-semibold ${method === 'wallet' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                <Wallet size={20} /> Portefeuille
                <span className="text-[10px] text-gray-400">{money(balance)}</span>
              </button>
              <button onClick={() => setMethod('card')} data-testid="pay-card"
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-semibold ${method === 'card' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                <CreditCard size={20} /> Carte bancaire
              </button>
            </div>
            {insufficient && <p className="text-xs text-red-500 mt-2" data-testid="insufficient-balance">Solde insuffisant — choisissez la carte ou rechargez.</p>}
          </div>

          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
            <div className="flex justify-between text-gray-600"><span>Article</span><span>{money(price)}</span></div>
            {deliveryFee > 0 && <div className="flex justify-between text-gray-600"><span>Livraison</span><span>{money(deliveryFee)}</span></div>}
            <div className="flex justify-between font-extrabold text-gray-900 pt-1 border-t border-gray-200"><span>Total</span><span data-testid="buy-total">{money(total)}</span></div>
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-gray-400"><ShieldCheck size={14} /> Paiement sécurisé. Le vendeur reçoit {money(price * (1 - (settings.commission_pct || 0) / 100))} (commission {settings.commission_pct}%).</p>

          <button onClick={submit} disabled={submitting || insufficient} data-testid="confirm-buy-btn"
            className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-bold disabled:opacity-50">
            {submitting ? 'Traitement…' : method === 'wallet' ? `Payer ${money(total)}` : `Payer par carte · ${money(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BuyModal;
