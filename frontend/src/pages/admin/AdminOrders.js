import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Package, MagnifyingGlass, Eye, MapPin, Clock } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  preparing: 'bg-indigo-100 text-indigo-800',
  ready: 'bg-purple-100 text-purple-800',
  picked_up: 'bg-cyan-100 text-cyan-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);

  const loadOrders = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`${API}/api/orders?${params}`, { credentials: 'include' });
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) { console.error('Failed to load orders:', err); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const updateStatus = async (orderId, newStatus) => {
    try {
      await fetch(`${API}/api/orders/${orderId}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      loadOrders();
      if (selected?.id === orderId) setSelected(prev => ({ ...prev, status: newStatus }));
    } catch (err) { console.error('Update status error:', err); }
  };

  const filtered = orders.filter(o =>
    (o.id || '').toLowerCase().includes(filter.toLowerCase()) ||
    (o.delivery_address || '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="p-6" data-testid="admin-orders">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Store Delivery / Orders</h1>
          <p className="text-sm text-gray-500 mt-1">{orders.length} commandes</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Rechercher par ID ou adresse..." className="pl-9" value={filter} onChange={e => setFilter(e.target.value)} data-testid="order-search" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" data-testid="order-status-filter">
          <option value="">Tous les statuts</option>
          {Object.keys(statusColors).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">ID</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Type</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Adresse</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Statut</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-600">Total</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Date</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(order => (
              <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`order-row-${order.id}`}>
                <td className="py-3 px-4 font-mono text-xs text-blue-600">{order.id?.slice(-8)}</td>
                <td className="py-3 px-4"><Badge variant="outline">{order.order_type || 'food'}</Badge></td>
                <td className="py-3 px-4 text-gray-700 max-w-[200px] truncate">{order.delivery_address || '-'}</td>
                <td className="py-3 px-4">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[order.status] || 'bg-gray-100 text-gray-600'}`}>
                    {order.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right font-medium">{(order.total || 0).toFixed(2)}€</td>
                <td className="py-3 px-4 text-xs text-gray-500">{order.created_at ? new Date(order.created_at).toLocaleDateString('fr-FR') : '-'}</td>
                <td className="py-3 px-4 text-center">
                  <Button size="sm" variant="ghost" onClick={() => setSelected(order)} data-testid={`order-view-${order.id}`}>
                    <Eye size={14} className="mr-1" /> Voir
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="p-8 text-center text-gray-400">Chargement...</div>}
        {!loading && filtered.length === 0 && <div className="p-8 text-center text-gray-400">Aucune commande</div>}
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="order-detail-modal">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Commande {selected.id?.slice(-8)}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Statut</span><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[selected.status] || ''}`}>{selected.status}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-bold">{(selected.total || 0).toFixed(2)}€</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Paiement</span><span>{selected.payment_method}</span></div>
              <div><span className="text-gray-500">Adresse : </span><span>{selected.delivery_address}</span></div>
              {selected.items && (
                <div>
                  <p className="text-gray-500 mb-2">Articles :</p>
                  {selected.items.map((item, i) => (
                    <div key={item.product_id || i} className="flex justify-between py-1 border-b border-gray-50">
                      <span>{item.name} x{item.quantity}</span>
                      <span>{(item.total || item.price * item.quantity).toFixed(2)}€</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {selected.status !== 'delivered' && selected.status !== 'cancelled' && (
              <div className="mt-5 flex flex-wrap gap-2">
                {selected.status === 'pending' && <Button size="sm" className="bg-blue-600 text-white" onClick={() => updateStatus(selected.id, 'accepted')}>Accepter</Button>}
                {selected.status === 'accepted' && <Button size="sm" className="bg-indigo-600 text-white" onClick={() => updateStatus(selected.id, 'preparing')}>Préparer</Button>}
                {selected.status === 'preparing' && <Button size="sm" className="bg-purple-600 text-white" onClick={() => updateStatus(selected.id, 'ready')}>Prêt</Button>}
                {selected.status === 'ready' && <Button size="sm" className="bg-cyan-600 text-white" onClick={() => updateStatus(selected.id, 'picked_up')}>Récupéré</Button>}
                {selected.status === 'picked_up' && <Button size="sm" className="bg-green-600 text-white" onClick={() => updateStatus(selected.id, 'delivered')}>Livré</Button>}
                <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={() => updateStatus(selected.id, 'cancelled')}>Annuler</Button>
              </div>
            )}
            <Button variant="outline" className="mt-4 w-full" onClick={() => setSelected(null)}>Fermer</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOrders;
