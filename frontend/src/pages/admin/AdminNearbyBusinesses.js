import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Storefront, MagnifyingGlass, X, Plus, PencilSimple, Trash } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
const COLLECTION = 'nearby_businesses';

const CATEGORIES = [
  'Café', 'Bar', 'Restaurant', 'Salon', 'Spa', 'Boulangerie', 'Pharmacie',
  'Hôpital', 'Salle de sport', 'Shopping', 'Centre commercial',
  'Hôtel', 'Musée', 'Attraction', 'Bibliothèque', 'Vie Nocturne', 'Parking', 'Garage',
];

const EMPTY = {
  name: '', category: 'Café', address: '', phone: '', description: '',
  rating: 4.5, distance_km: 1.0, open_now: true, is_active: true, image: '',
};

const AdminNearbyBusinesses = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [editing, setEditing] = useState(null); // {form, id}

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/phase2/catalogs/${COLLECTION}?limit=300`, { credentials: 'include' });
      const d = await r.json();
      setItems(Array.isArray(d) ? d : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => setEditing({ id: null, form: { ...EMPTY } });
  const openEdit = (it) => setEditing({
    id: it.id,
    form: {
      name: it.name || '', category: it.category || 'Café', address: it.address || '',
      phone: it.phone || '', description: it.description || '',
      rating: it.rating ?? 4.5, distance_km: it.distance_km ?? 1.0,
      open_now: it.open_now !== false, is_active: it.is_active !== false, image: it.image || '',
    },
  });

  const setField = (k, v) => setEditing((e) => ({ ...e, form: { ...e.form, [k]: v } }));

  const onImageFile = (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error('Image trop lourde (max 8 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = () => setField('image', reader.result);
    reader.readAsDataURL(file);
  };

  const save = async () => {
    const { id, form } = editing;
    if (!form.name.trim()) { toast.error('Le nom est requis'); return; }
    const payload = {
      ...form,
      name: form.name.trim(),
      rating: Math.max(0, Math.min(5, parseFloat(form.rating) || 0)),
      distance_km: Math.max(0, parseFloat(form.distance_km) || 0),
      open_now: !!form.open_now, is_active: !!form.is_active,
    };
    try {
      const url = id
        ? `${API}/api/phase2/admin/catalogs/${COLLECTION}/${id}`
        : `${API}/api/phase2/admin/catalogs/${COLLECTION}`;
      const r = await fetch(url, {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error('save failed');
      toast.success(id ? 'Commerce mis à jour' : 'Commerce ajouté');
      setEditing(null);
      load();
    } catch (e) { console.error(e); toast.error('Erreur lors de l’enregistrement'); }
  };

  const remove = async (it) => {
    if (!window.confirm(`Supprimer « ${it.name} » ?`)) return;
    try {
      const r = await fetch(`${API}/api/phase2/admin/catalogs/${COLLECTION}/${it.id}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!r.ok) throw new Error('delete failed');
      toast.success('Commerce supprimé');
      load();
    } catch (e) { console.error(e); toast.error('Erreur'); }
  };

  const filtered = items.filter((i) => {
    const matchText = !search.trim() || (i.name || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !catFilter || i.category === catFilter;
    return matchText && matchCat;
  });

  return (
    <div className="p-6" data-testid="admin-nearby-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Storefront size={22} className="text-indigo-500" weight="fill" />
            Commerces proches
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gérez l’annuaire local affiché dans « Commerces Proches ». <span className="font-semibold text-indigo-600">{items.length} commerce(s)</span>
          </p>
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={openCreate} data-testid="add-business-btn">
          <Plus size={16} className="mr-1" /> Ajouter un commerce
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative max-w-xs flex-1">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Rechercher un commerce..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="search-business-input" />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="border border-gray-200 rounded-md px-3 text-sm bg-white"
          data-testid="filter-category-select"
        >
          <option value="">Toutes les catégories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Commerce</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Catégorie</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-600">Note</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-600">Statut</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="border-b border-gray-100" data-testid={`business-row-${it.id}`}>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {it.image && <img src={it.image} alt="" className="w-10 h-10 rounded object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                      <div>
                        <div className="font-medium text-gray-800">{it.name}</div>
                        <div className="text-xs text-gray-400">{it.address}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{it.category}</td>
                  <td className="py-3 px-4 text-center text-gray-700">{it.rating != null ? `★ ${it.rating}` : '-'}</td>
                  <td className="py-3 px-4 text-center">
                    {it.is_active !== false
                      ? <Badge className="bg-emerald-100 text-emerald-700">Actif</Badge>
                      : <Badge variant="outline" className="text-gray-400">Masqué</Badge>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(it)} data-testid={`edit-${it.id}`}>
                        <PencilSimple size={14} />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200" onClick={() => remove(it)} data-testid={`delete-${it.id}`}>
                        <Trash size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">Aucun commerce</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditing(null)} data-testid="business-dialog">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">{editing.id ? 'Modifier le commerce' : 'Nouveau commerce'}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Nom *</label>
                <Input value={editing.form.name} onChange={(e) => setField('name', e.target.value)} data-testid="form-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Catégorie</label>
                  <select value={editing.form.category} onChange={(e) => setField('category', e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white" data-testid="form-category">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Téléphone</label>
                  <Input value={editing.form.phone} onChange={(e) => setField('phone', e.target.value)} data-testid="form-phone" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Adresse</label>
                <Input value={editing.form.address} onChange={(e) => setField('address', e.target.value)} data-testid="form-address" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Description</label>
                <Input value={editing.form.description} onChange={(e) => setField('description', e.target.value)} data-testid="form-description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Note (0–5)</label>
                  <Input type="number" min="0" max="5" step="0.1" value={editing.form.rating} onChange={(e) => setField('rating', e.target.value)} data-testid="form-rating" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Distance (km)</label>
                  <Input type="number" min="0" step="0.1" value={editing.form.distance_km} onChange={(e) => setField('distance_km', e.target.value)} data-testid="form-distance" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Image</label>
                {editing.form.image && (
                  <div className="flex items-center gap-3 mb-2">
                    <img src={editing.form.image} alt="" className="w-16 h-12 object-cover rounded" />
                    <button onClick={() => setField('image', '')} className="text-xs text-red-600 underline">retirer</button>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={(e) => onImageFile(e.target.files?.[0])} className="text-xs" data-testid="form-image-file" />
              </div>
              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={editing.form.open_now} onChange={(e) => setField('open_now', e.target.checked)} data-testid="form-open-now" />
                  Ouvert maintenant
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={editing.form.is_active} onChange={(e) => setField('is_active', e.target.checked)} data-testid="form-active" />
                  Actif (visible)
                </label>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)} data-testid="dialog-cancel">Annuler</Button>
              <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white" onClick={save} data-testid="dialog-save">Enregistrer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminNearbyBusinesses;
