import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Storefront, MagnifyingGlass, Eye, Star, CheckCircle, XCircle } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminStores = () => {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { loadStores(); }, []);

  const loadStores = async () => {
    try {
      const res = await fetch(`${API}/api/merchants`, { credentials: 'include' });
      const data = await res.json();
      setStores(Array.isArray(data) ? data : data.merchants || []);
    } catch (err) { console.error('Failed to load stores:', err); }
    finally { setLoading(false); }
  };

  const toggleStatus = async (storeId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await fetch(`${API}/api/admin/merchants/${storeId}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      loadStores();
    } catch (err) { console.error('Toggle status error:', err); }
  };

  const filtered = stores.filter(s =>
    (s.store_name || '').toLowerCase().includes(filter.toLowerCase()) ||
    (s.category || '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="p-6" data-testid="admin-stores">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Manage Stores</h1>
          <p className="text-sm text-gray-500 mt-1">{stores.length} marchands enregistrés</p>
        </div>
      </div>

      <div className="relative mb-5 max-w-md">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Rechercher par nom ou catégorie..." className="pl-9" value={filter} onChange={e => setFilter(e.target.value)} data-testid="store-search" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Nom</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Catégorie</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Adresse</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Note</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Commandes</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Statut</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(store => (
              <tr key={store.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`store-row-${store.id}`}>
                <td className="py-3 px-4 font-medium text-gray-800">{store.store_name}</td>
                <td className="py-3 px-4"><Badge variant="outline">{store.category || 'food'}</Badge></td>
                <td className="py-3 px-4 text-gray-600 max-w-[200px] truncate">{store.address || '-'}</td>
                <td className="py-3 px-4 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Star size={14} weight="fill" className="text-amber-400" />
                    <span>{store.rating || '5.0'}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-center">{store.total_orders || 0}</td>
                <td className="py-3 px-4 text-center">
                  <Badge className={store.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                    {store.status || 'active'}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-center">
                  <Button size="sm" variant="ghost" onClick={() => toggleStatus(store.id, store.status || 'active')} data-testid={`store-toggle-${store.id}`}>
                    {store.status === 'active' ? <XCircle size={16} className="text-red-500" /> : <CheckCircle size={16} className="text-green-500" />}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="p-8 text-center text-gray-400">Chargement...</div>}
        {!loading && filtered.length === 0 && <div className="p-8 text-center text-gray-400">Aucun marchand trouvé</div>}
      </div>
    </div>
  );
};

export default AdminStores;
