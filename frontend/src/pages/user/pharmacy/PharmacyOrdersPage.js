import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { pharmacyAPI } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { ArrowLeft, Pill, Prescription, ShoppingBag, Clock, Wallet } from '@phosphor-icons/react';

const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
const STATUS = {
  pending: { l: 'En attente de devis', c: 'bg-amber-100 text-amber-700' },
  confirmed: { l: 'Confirmée', c: 'bg-blue-100 text-blue-700' },
  preparing: { l: 'En préparation', c: 'bg-indigo-100 text-indigo-700' },
  accepted: { l: 'Coursier assigné', c: 'bg-purple-100 text-purple-700' },
  picked_up: { l: 'Récupérée', c: 'bg-purple-100 text-purple-700' },
  in_transit: { l: 'En livraison', c: 'bg-cyan-100 text-cyan-700' },
  delivered: { l: 'Livrée', c: 'bg-green-100 text-green-700' },
  cancelled: { l: 'Annulée', c: 'bg-gray-200 text-gray-500' },
};
const TIMELINE = ['confirmed', 'preparing', 'accepted', 'picked_up', 'in_transit', 'delivered'];

const PharmacyOrdersPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { on } = useWebSocket(user?.id);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState(null); // order awaiting payment
  const [balances, setBalances] = useState({});
  const [paying, setPaying] = useState(false);

  const load = useCallback(() => {
    pharmacyAPI.myOrders().then((r) => setOrders(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  // Real-time: pharmacy sent a price quote → prompt payment
  useEffect(() => {
    const unsub = on('pharmacy_quote_ready', (msg) => {
      toast.success(`💶 Devis reçu : ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(msg.total || 0)} — vous pouvez payer.`);
      load();
    });
    return unsub;
  }, [on, load]);

  const cancel = async (id) => {
    if (!window.confirm('Annuler cette commande ?')) return;
    try { await pharmacyAPI.cancelOrder(id); toast.success('Commande annulée'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Annulation impossible'); }
  };

  const openPay = (order) => {
    setPayTarget(order);
    pharmacyAPI.paymentMethods().then((r) => {
      const map = {}; (r.data.methods || []).forEach((m) => { map[m.id] = m.balance; }); setBalances(map);
    }).catch(() => {});
  };

  const doPay = async (method) => {
    const isWallet = ['wallet', 'sbpaygo'].includes(method);
    if (isWallet && (balances[method] ?? 0) < payTarget.total) {
      if (method === 'wallet') return navigate('/wallet');
      try { const r = await pharmacyAPI.sbpaygoSsoLink(); if (r.data?.url) window.location.assign(r.data.url); } catch { toast.error('Recharge indisponible'); }
      return;
    }
    setPaying(true);
    try {
      await pharmacyAPI.payOrder(payTarget.id, method);
      toast.success(isWallet ? 'Paiement effectué ✅' : 'Paiement à la livraison confirmé ✅');
      setPayTarget(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Paiement échoué'); }
    finally { setPaying(false); }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="pharmacy-orders-page">
      <div className="bg-white px-4 pt-5 pb-3 border-b border-gray-100 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate('/pharmacy')} className="p-1" data-testid="orders-back-btn"><ArrowLeft size={22} /></button>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Pill size={20} weight="fill" className="text-[#FF4500]" /> Mes commandes</h1>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {loading && <p className="text-center text-sm text-gray-400 py-10">Chargement…</p>}
        {!loading && orders.length === 0 && (
          <div className="text-center py-16">
            <Pill size={48} weight="duotone" className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Aucune commande pour le moment.</p>
            <button onClick={() => navigate('/pharmacy')} className="mt-4 text-sm font-semibold text-[#FF4500]" data-testid="orders-empty-cta">Commander maintenant →</button>
          </div>
        )}
        {orders.map((o) => {
          const st = STATUS[o.status] || { l: o.status, c: 'bg-gray-100 text-gray-600' };
          const stepIdx = TIMELINE.indexOf(o.status);
          const canCancel = !['in_transit', 'delivered', 'cancelled'].includes(o.status);
          return (
            <div key={o.id} className="rounded-2xl bg-white border border-gray-200 p-4" data-testid={`order-card-${o.id}`}>
              <div className="flex items-center gap-2 mb-2">
                {o.order_type === 'prescription'
                  ? <Prescription size={18} weight="duotone" className="text-[#FF4500]" />
                  : <ShoppingBag size={18} weight="duotone" className="text-emerald-600" />}
                <span className="text-sm font-semibold text-gray-900">{o.order_type === 'prescription' ? 'Ordonnance' : 'Catalogue'}</span>
                <span className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.c}`} data-testid={`order-status-${o.id}`}>{st.l}</span>
              </div>

              {o.needs_quote && o.status === 'pending' && (
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-2 text-[11px] text-amber-700 mb-2 flex items-center gap-1">
                  <Clock size={13} weight="fill" /> En attente du devis de la pharmacie.
                </div>
              )}

              <div className="text-xs text-gray-500 space-y-0.5 mb-2">
                {o.pharmacy_name && <p>Pharmacie : {o.pharmacy_name}</p>}
                {o.items?.length > 0 && <p>{o.items.length} article{o.items.length > 1 ? 's' : ''} · {o.items.map((i) => `${i.name} ×${i.qty}`).slice(0, 2).join(', ')}{o.items.length > 2 ? '…' : ''}</p>}
                <p>Livraison : {o.delivery_address || '—'}</p>
              </div>

              {/* Timeline */}
              {o.status !== 'cancelled' && o.status !== 'pending' && (
                <div className="flex items-center gap-1 my-2" data-testid={`order-timeline-${o.id}`}>
                  {TIMELINE.map((s, i) => (
                    <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? 'bg-[#FF4500]' : 'bg-gray-200'}`} />
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div className="text-sm">
                  <span className="text-gray-400 text-xs">Total </span>
                  <span className="font-bold text-gray-900">{o.needs_quote && o.status === 'pending' ? 'À confirmer' : fmt(o.total)}</span>
                  {o.payment_status === 'paid' && <span className="ml-2 text-[11px] font-semibold text-green-600">· Payé ✓</span>}
                  {o.payment_status === 'cod' && <span className="ml-2 text-[11px] font-semibold text-amber-600">· À régler à la livraison</span>}
                </div>
                <div className="flex items-center gap-3">
                  {o.payment_status === 'pending' && o.total > 0 && !['pending', 'delivered', 'cancelled'].includes(o.status) && (
                    <button onClick={() => openPay(o)} className="text-xs font-bold text-white bg-[#FF4500] rounded-full px-3 py-1.5 flex items-center gap-1" data-testid={`order-pay-${o.id}`}>
                      <Wallet size={13} weight="fill" /> Payer maintenant
                    </button>
                  )}
                  {canCancel && (
                    <button onClick={() => cancel(o.id)} className="text-xs font-semibold text-red-500" data-testid={`order-cancel-${o.id}`}>Annuler</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Payment sheet */}
      {payTarget && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end" onClick={() => setPayTarget(null)}>
          <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl p-4" onClick={(e) => e.stopPropagation()} data-testid="pay-sheet">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
            <h3 className="text-base font-bold text-gray-900 mb-1">Payer la commande</h3>
            <p className="text-xs text-gray-500 mb-3">Total à régler : <span className="font-bold text-gray-900">{fmt(payTarget.total)}</span> (médicaments {fmt(payTarget.medication_total)} + livraison {fmt(payTarget.delivery_fee)}).</p>
            <div className="space-y-2">
              {[
                { id: 'cash', label: 'Espèces à la livraison' },
                { id: 'card', label: 'Carte à la livraison' },
                { id: 'wallet', label: 'Mon portefeuille' },
                { id: 'sbpaygo', label: 'SB PayGo' },
              ].map((m) => {
                const isWallet = ['wallet', 'sbpaygo'].includes(m.id);
                const bal = balances[m.id];
                const insufficient = isWallet && (bal ?? 0) < payTarget.total;
                return (
                  <button key={m.id} onClick={() => doPay(m.id)} disabled={paying} data-testid={`pay-method-${m.id}`}
                    className="w-full flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3 text-left disabled:opacity-60">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{m.label}</div>
                      {isWallet
                        ? <div className={`text-[11px] ${insufficient ? 'text-red-500' : 'text-gray-400'}`}>Solde : {bal == null ? '—' : fmt(bal)}{insufficient ? ' · insuffisant → recharger' : ''}</div>
                        : <div className="text-[11px] text-gray-400">Réglé au coursier à la livraison</div>}
                    </div>
                    <span className="text-xs font-bold text-[#FF4500]">{isWallet ? (insufficient ? 'Recharger →' : 'Payer →') : 'Confirmer →'}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setPayTarget(null)} className="w-full mt-3 text-sm text-gray-500 py-2" data-testid="pay-cancel-btn">Plus tard</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PharmacyOrdersPage;
