import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { pharmacyAPI } from '../../../services/api';
import { ArrowLeft, Pill, Prescription, ShoppingBag, Clock } from '@phosphor-icons/react';

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
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    pharmacyAPI.myOrders().then((r) => setOrders(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const cancel = async (id) => {
    if (!window.confirm('Annuler cette commande ?')) return;
    try { await pharmacyAPI.cancelOrder(id); toast.success('Commande annulée'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Annulation impossible'); }
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
                </div>
                {canCancel && (
                  <button onClick={() => cancel(o.id)} className="text-xs font-semibold text-red-500" data-testid={`order-cancel-${o.id}`}>Annuler</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PharmacyOrdersPage;
