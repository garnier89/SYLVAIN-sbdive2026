import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Storefront } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { marketplaceAPI } from '../../services/api';
import { useLocale } from '../../contexts/LocaleContext';

const STATUS_LABEL = {
  paid: { txt: 'Payée', cls: 'bg-blue-100 text-blue-700' },
  shipped: { txt: 'Expédiée', cls: 'bg-amber-100 text-amber-700' },
  completed: { txt: 'Terminée', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { txt: 'Annulée', cls: 'bg-gray-200 text-gray-500' },
};

const MyOrdersPage = () => {
  const navigate = useNavigate();
  const { money } = useLocale();
  const [tab, setTab] = useState('buy'); // buy | sell
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = tab === 'buy' ? await marketplaceAPI.myOrders() : await marketplaceAPI.mySales();
      setOrders(r.data.orders || []);
    } catch { setOrders([]); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const act = async (orderId, status) => {
    try {
      await marketplaceAPI.updateOrderStatus(orderId, status);
      toast.success('Statut mis à jour');
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
  };

  return (
    <div className="min-h-screen bg-gray-50" data-testid="my-orders-page">
      <div className="bg-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10 border-b">
        <button onClick={() => navigate('/marketplace')} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center" data-testid="orders-back-btn"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-extrabold text-gray-900">Mes commandes</h1>
      </div>

      <div className="flex gap-2 p-4">
        <button onClick={() => setTab('buy')} data-testid="tab-buy" className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm ${tab === 'buy' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}><Package size={16} /> Mes achats</button>
        <button onClick={() => setTab('sell')} data-testid="tab-sell" className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm ${tab === 'sell' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}><Storefront size={16} /> Mes ventes</button>
      </div>

      <div className="px-4 pb-10 space-y-3">
        {loading ? (
          <div className="py-12 text-center"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto" /></div>
        ) : orders.length === 0 ? (
          <p className="text-center text-gray-400 py-12" data-testid="orders-empty">{tab === 'buy' ? 'Aucun achat pour le moment.' : 'Aucune vente pour le moment.'}</p>
        ) : orders.map((o) => {
          const st = STATUS_LABEL[o.status] || { txt: o.status, cls: 'bg-gray-100 text-gray-600' };
          return (
            <div key={o.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`order-${o.id}`}>
              <div className="flex items-center gap-3">
                {o.listing_image ? <img src={o.listing_image} alt="" className="w-14 h-14 rounded-xl object-cover" /> : <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center"><Package size={22} className="text-gray-300" /></div>}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate">{o.listing_title}</p>
                  <p className="text-sm text-gray-500">{tab === 'buy' ? `Vendeur : ${o.seller_name}` : `Acheteur : ${o.buyer_name}`}</p>
                  <p className="text-sm font-extrabold text-blue-600">{money(tab === 'sell' ? o.seller_payout : o.amount)}</p>
                </div>
                <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${st.cls}`}>{st.txt}</span>
              </div>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400">
                <span>{o.fulfillment === 'delivery' ? `Livraison · ${o.delivery_address}` : 'Retrait / à convenir'}</span>
                <span>· {o.payment_method === 'card' ? 'Carte' : 'Portefeuille'}</span>
              </div>
              {/* Actions */}
              {tab === 'sell' && o.status === 'paid' && (
                <button onClick={() => act(o.id, 'shipped')} className="mt-3 w-full bg-amber-500 text-white rounded-lg py-2 text-sm font-bold" data-testid={`mark-shipped-${o.id}`}>Marquer comme expédiée</button>
              )}
              {tab === 'buy' && (o.status === 'paid' || o.status === 'shipped') && (
                <button onClick={() => act(o.id, 'completed')} className="mt-3 w-full bg-emerald-600 text-white rounded-lg py-2 text-sm font-bold" data-testid={`mark-completed-${o.id}`}>Confirmer la réception</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MyOrdersPage;
