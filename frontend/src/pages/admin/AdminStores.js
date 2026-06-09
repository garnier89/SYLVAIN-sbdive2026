import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Storefront, MagnifyingGlass, Star, CheckCircle, XCircle, PencilSimple, X, FloppyDisk, SealPercent, Lightning } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminStores = () => {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

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

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/merchants/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          cuisine: editing.cuisine || '',
          discount_pct: Number(editing.discount_pct) || 0,
          delivery_fee: Number(editing.delivery_fee) || 0,
          eta_min: Number(editing.eta_min) || 30,
          flash_discount: { ...editing.flash, pct: Number(editing.flash?.pct) || 0 },
        }),
      });
      if (res.ok) { toast.success('Marchand mis à jour'); setEditing(null); loadStores(); }
      else toast.error('Échec de l\'enregistrement');
    } catch { toast.error('Erreur réseau'); }
    finally { setSaving(false); }
  };

  const ADM_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const toggleAdmDay = (i) => setEditing((e) => {
    const days = (e.flash.days || []).includes(i) ? e.flash.days.filter((d) => d !== i) : [...(e.flash.days || []), i];
    return { ...e, flash: { ...e.flash, days } };
  });

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
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Cuisine</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Réduction</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Livraison</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Note</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Statut</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(store => (
              <tr key={store.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`store-row-${store.id}`}>
                <td className="py-3 px-4 font-medium text-gray-800">{store.store_name}</td>
                <td className="py-3 px-4 text-gray-600">{store.cuisine || '—'}</td>
                <td className="py-3 px-4 text-center">
                  {store.discount_pct > 0
                    ? <Badge className="bg-red-100 text-red-700">{store.discount_pct}%</Badge>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="py-3 px-4 text-center text-gray-600">{(store.delivery_fee ?? 2.5).toFixed(2)} €</td>
                <td className="py-3 px-4 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Star size={14} weight="fill" className="text-amber-400" />
                    <span>{store.rating || '5.0'}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-center">
                  <Badge className={store.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                    {store.status || 'active'}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-center whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...store, cuisine: store.cuisine || '', discount_pct: store.discount_pct || 0, delivery_fee: store.delivery_fee ?? 2.5, eta_min: store.eta_min || 30, flash: store.flash_discount || { enabled: false, pct: 20, start_time: '14:00', end_time: '17:00', days: [] } })} data-testid={`store-edit-${store.id}`}>
                    <PencilSimple size={16} className="text-blue-500" />
                  </Button>
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

      {editing && (
        <div className="fixed inset-0 z-[2800] bg-black/50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="store-editor">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Storefront size={18} className="text-orange-500" />{editing.store_name}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400"><X size={22} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Type de cuisine</label>
                <Input value={editing.cuisine} onChange={(e) => setEditing({ ...editing, cuisine: e.target.value })} placeholder="Ex : Italien, Japonais…" data-testid="edit-cuisine" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><SealPercent size={14} className="text-red-500" /> Réduction (%)</label>
                <Input type="number" step="1" min="0" max="90" value={editing.discount_pct} onChange={(e) => setEditing({ ...editing, discount_pct: e.target.value })} data-testid="edit-discount" />
                <p className="text-[11px] text-gray-400 mt-1">Affiché en badge rouge et appliqué au total du panier.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Frais de livraison (€)</label>
                  <Input type="number" step="0.5" min="0" value={editing.delivery_fee} onChange={(e) => setEditing({ ...editing, delivery_fee: e.target.value })} data-testid="edit-delivery" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Délai (min)</label>
                  <Input type="number" step="5" min="1" value={editing.eta_min} onChange={(e) => setEditing({ ...editing, eta_min: e.target.value })} data-testid="edit-eta" />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={editing.flash?.enabled} onChange={(e) => setEditing({ ...editing, flash: { ...editing.flash, enabled: e.target.checked } })} className="w-4 h-4 text-amber-500 rounded" data-testid="edit-flash-enabled" />
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1"><Lightning size={14} weight="fill" className="text-amber-500" /> Réduction flash</span>
                </label>
                {editing.flash?.enabled && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="number" min="0" max="90" placeholder="%" value={editing.flash.pct} onChange={(e) => setEditing({ ...editing, flash: { ...editing.flash, pct: e.target.value } })} data-testid="edit-flash-pct" />
                      <Input type="time" value={editing.flash.start_time} onChange={(e) => setEditing({ ...editing, flash: { ...editing.flash, start_time: e.target.value } })} data-testid="edit-flash-start" />
                      <Input type="time" value={editing.flash.end_time} onChange={(e) => setEditing({ ...editing, flash: { ...editing.flash, end_time: e.target.value } })} data-testid="edit-flash-end" />
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {ADM_DAYS.map((d, i) => (
                        <button key={d} type="button" onClick={() => toggleAdmDay(i)} data-testid={`edit-flash-day-${i}`}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${(editing.flash.days || []).includes(i) ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100">
              <Button onClick={saveSettings} disabled={saving} className="w-full bg-orange-500 hover:bg-orange-600 text-white" data-testid="save-store-btn">
                <FloppyDisk size={16} weight="fill" className="mr-2" />{saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminStores;
