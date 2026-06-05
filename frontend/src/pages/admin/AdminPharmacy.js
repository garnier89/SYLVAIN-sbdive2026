import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../components/ui/button';
import { Pill, Storefront, Package, Receipt, Plus, PencilSimple, Trash, Check, X, Tag, Gear } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { pharmacyAPI } from '../../services/api';

const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);

// Categories are now admin-managed (DB-backed). This hook loads the live list.
const useCategories = () => {
  const [cats, setCats] = useState([]);
  const reload = useCallback(() => { pharmacyAPI.categories().then((r) => setCats(r.data.categories || [])).catch(() => {}); }, []);
  useEffect(() => { reload(); }, [reload]);
  return [cats, reload];
};

const ORDER_STATUSES = ['confirmed', 'preparing', 'accepted', 'picked_up', 'in_transit', 'delivered', 'cancelled'];
const ST_LABEL = { pending: 'En attente devis', confirmed: 'Confirmée', preparing: 'Préparation', accepted: 'Coursier', picked_up: 'Récupérée', in_transit: 'Livraison', delivered: 'Livrée', cancelled: 'Annulée' };

// ───────── Pharmacies tab ─────────
const emptyPharmacy = { name: '', address: '', city: '', phone: '', lat: '', lng: '', open_hours: '', image_url: '', rating: 4.7, active: true };
const PharmaciesTab = () => {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => { pharmacyAPI.adminPharmacies().then((r) => setItems(r.data || [])).catch(() => toast.error('Erreur')); }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing.name) return toast.error('Nom requis');
    const payload = { ...editing, lat: editing.lat ? Number(editing.lat) : null, lng: editing.lng ? Number(editing.lng) : null, rating: Number(editing.rating) || 4.7 };
    try {
      if (editing.id) await pharmacyAPI.adminUpdatePharmacy(editing.id, payload);
      else await pharmacyAPI.adminCreatePharmacy(payload);
      toast.success('Enregistré'); setEditing(null); load();
    } catch { toast.error('Échec'); }
  };
  const remove = async (id) => { if (!window.confirm('Supprimer ?')) return; try { await pharmacyAPI.adminDeletePharmacy(id); load(); } catch { toast.error('Échec'); } };

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button onClick={() => setEditing({ ...emptyPharmacy })} data-testid="add-pharmacy-btn"><Plus size={16} className="mr-1" /> Nouvelle pharmacie</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((p) => (
          <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-3 flex gap-3" data-testid={`admin-pharmacy-${p.id}`}>
            {p.image_url && <img src={p.image_url} alt={p.name} className="w-16 h-16 rounded-lg object-cover" />}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-gray-900 truncate">{p.name}</h4>
              <p className="text-xs text-gray-500 truncate">{p.address}</p>
              <p className="text-xs text-gray-400">{p.open_hours} · ⭐ {p.rating} {p.active ? '' : '· Inactif'}</p>
            </div>
            <div className="flex flex-col gap-1">
              <button onClick={() => setEditing({ ...p })} className="text-gray-500 hover:text-gray-900" data-testid={`edit-pharmacy-${p.id}`}><PencilSimple size={18} /></button>
              <button onClick={() => remove(p.id)} className="text-red-400 hover:text-red-600" data-testid={`del-pharmacy-${p.id}`}><Trash size={18} /></button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="pharmacy-editor">
            <h3 className="font-bold text-lg mb-3">{editing.id ? 'Modifier' : 'Nouvelle'} pharmacie</h3>
            <div className="grid grid-cols-2 gap-2">
              <input className="col-span-2 border rounded-lg px-3 py-2 text-sm" placeholder="Nom" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="ph-name" />
              <input className="col-span-2 border rounded-lg px-3 py-2 text-sm" placeholder="Adresse" value={editing.address || ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} data-testid="ph-address" />
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Ville" value={editing.city || ''} onChange={(e) => setEditing({ ...editing, city: e.target.value })} />
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Téléphone" value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Latitude" value={editing.lat ?? ''} onChange={(e) => setEditing({ ...editing, lat: e.target.value })} />
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Longitude" value={editing.lng ?? ''} onChange={(e) => setEditing({ ...editing, lng: e.target.value })} />
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Horaires" value={editing.open_hours || ''} onChange={(e) => setEditing({ ...editing, open_hours: e.target.value })} />
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Note" value={editing.rating} onChange={(e) => setEditing({ ...editing, rating: e.target.value })} />
              <input className="col-span-2 border rounded-lg px-3 py-2 text-sm" placeholder="URL image" value={editing.image_url || ''} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} />
              <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Actif</label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setEditing(null)}><X size={16} className="mr-1" />Annuler</Button>
              <Button onClick={save} data-testid="save-pharmacy-btn"><Check size={16} className="mr-1" />Enregistrer</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ───────── Products tab ─────────
const emptyProduct = { name: '', category: 'pain', price: 0, description: '', image_url: '', pharmacy_id: null, in_stock: true };
const ProductsTab = () => {
  const [cats] = useCategories();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => { pharmacyAPI.adminProducts(filter !== 'all' ? filter : undefined).then((r) => setItems(r.data || [])).catch(() => toast.error('Erreur')); }, [filter]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing.name) return toast.error('Nom requis');
    const payload = { ...editing, price: Number(editing.price) || 0 };
    try {
      if (editing.id) await pharmacyAPI.adminUpdateProduct(editing.id, payload);
      else await pharmacyAPI.adminCreateProduct(payload);
      toast.success('Enregistré'); setEditing(null); load();
    } catch { toast.error('Échec'); }
  };
  const remove = async (id) => { if (!window.confirm('Supprimer ?')) return; try { await pharmacyAPI.adminDeleteProduct(id); load(); } catch { toast.error('Échec'); } };

  return (
    <>
      <div className="flex items-center justify-between mb-3 gap-2">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" data-testid="product-cat-filter">
          <option value="all">Toutes catégories</option>
          {cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <Button onClick={() => setEditing({ ...emptyProduct })} data-testid="add-product-btn"><Plus size={16} className="mr-1" /> Nouveau produit</Button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase"><tr><th className="text-left p-3">Produit</th><th className="text-left p-3">Catégorie</th><th className="text-left p-3">Prix</th><th className="text-left p-3">Stock</th><th className="text-right p-3">Actions</th></tr></thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t border-gray-100" data-testid={`admin-product-${p.id}`}>
                <td className="p-3 flex items-center gap-2">{p.image_url && <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover" />}{p.name}</td>
                <td className="p-3 text-gray-500">{cats.find((c) => c.key === p.category)?.label || p.category}</td>
                <td className="p-3 font-semibold">{fmt(p.price)}</td>
                <td className="p-3">{p.in_stock ? <span className="text-green-600 text-xs">En stock</span> : <span className="text-red-500 text-xs">Rupture</span>}</td>
                <td className="p-3 text-right">
                  <button onClick={() => setEditing({ ...p })} className="text-gray-500 mr-2" data-testid={`edit-product-${p.id}`}><PencilSimple size={16} /></button>
                  <button onClick={() => remove(p.id)} className="text-red-400" data-testid={`del-product-${p.id}`}><Trash size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg" onClick={(e) => e.stopPropagation()} data-testid="product-editor">
            <h3 className="font-bold text-lg mb-3">{editing.id ? 'Modifier' : 'Nouveau'} produit</h3>
            <div className="grid grid-cols-2 gap-2">
              <input className="col-span-2 border rounded-lg px-3 py-2 text-sm" placeholder="Nom" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="prod-name" />
              <select className="border rounded-lg px-3 py-2 text-sm" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} data-testid="prod-cat">{cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Prix" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} data-testid="prod-price" />
              <input className="col-span-2 border rounded-lg px-3 py-2 text-sm" placeholder="Description" value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              <input className="col-span-2 border rounded-lg px-3 py-2 text-sm" placeholder="URL image" value={editing.image_url || ''} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} />
              <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.in_stock} onChange={(e) => setEditing({ ...editing, in_stock: e.target.checked })} /> En stock</label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setEditing(null)}><X size={16} className="mr-1" />Annuler</Button>
              <Button onClick={save} data-testid="save-product-btn"><Check size={16} className="mr-1" />Enregistrer</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ───────── Orders tab ─────────
const OrdersTab = () => {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('');
  const [quoting, setQuoting] = useState(null);
  const [quoteVal, setQuoteVal] = useState('');

  const load = useCallback(() => { pharmacyAPI.adminOrders(filter || undefined).then((r) => setItems(r.data || [])).catch(() => toast.error('Erreur')); }, [filter]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (id, status) => { try { await pharmacyAPI.adminOrderStatus(id, status); load(); } catch { toast.error('Échec'); } };
  const submitQuote = async () => {
    const v = Number(quoteVal);
    if (!v || v <= 0) return toast.error('Montant invalide');
    try { await pharmacyAPI.adminQuote(quoting.id, v); toast.success('Devis envoyé'); setQuoting(null); setQuoteVal(''); load(); } catch { toast.error('Échec'); }
  };

  return (
    <>
      <div className="flex gap-2 mb-3 flex-wrap">
        {['', 'pending', 'confirmed', 'preparing', 'in_transit', 'delivered'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} data-testid={`order-filter-${s || 'all'}`} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
            {s === '' ? 'Toutes' : (ST_LABEL[s] || s)}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {items.map((o) => (
          <div key={o.id} className="bg-white rounded-xl border border-gray-200 p-3" data-testid={`admin-order-${o.id}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-gray-400">{o.id}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{o.order_type === 'prescription' ? 'Ordonnance' : 'Catalogue'}</span>
              <span className="ml-auto text-xs font-semibold text-gray-700" data-testid={`admin-order-status-${o.id}`}>{ST_LABEL[o.status] || o.status}</span>
            </div>
            <p className="text-sm text-gray-700">{o.recipient_name} · {o.recipient_phone} · {o.delivery_address}</p>
            <p className="text-xs text-gray-500">{o.pharmacy_name || 'Pharmacie proche'} · Total {o.needs_quote && o.status === 'pending' ? 'à devis' : fmt(o.total)} (méd. {fmt(o.medication_total)} + liv. {fmt(o.delivery_fee)})</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {o.needs_quote && o.status === 'pending' && (
                <Button size="sm" onClick={() => { setQuoting(o); setQuoteVal(''); }} data-testid={`quote-btn-${o.id}`}>💶 Établir le devis</Button>
              )}
              <select value="" onChange={(e) => e.target.value && setStatus(o.id, e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs" data-testid={`status-select-${o.id}`}>
                <option value="">Changer statut…</option>
                {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ST_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-center text-sm text-gray-400 py-10">Aucune commande.</p>}
      </div>

      {quoting && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setQuoting(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()} data-testid="quote-modal">
            <h3 className="font-bold mb-1">Devis ordonnance</h3>
            <p className="text-xs text-gray-500 mb-3">Prix des médicaments (hors livraison {fmt(quoting.delivery_fee)}).</p>
            {quoting.prescription_note && <p className="text-xs bg-gray-50 rounded p-2 mb-2">Note : {quoting.prescription_note}</p>}
            <input type="number" value={quoteVal} onChange={(e) => setQuoteVal(e.target.value)} placeholder="Montant médicaments €" className="w-full border rounded-lg px-3 py-2 text-sm mb-3" data-testid="quote-input" autoFocus />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setQuoting(null)}>Annuler</Button>
              <Button onClick={submitQuote} data-testid="submit-quote-btn">Confirmer le devis</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ───────── Categories tab ─────────
const emptyCategory = { key: '', label: '', order: 0 };
const CategoriesTab = () => {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => { pharmacyAPI.adminCategories().then((r) => setItems(r.data || [])).catch(() => toast.error('Erreur')); }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing.label || !editing.key) return toast.error('Clé et libellé requis');
    try {
      if (editing.existing) await pharmacyAPI.adminUpdateCategory(editing.key, { key: editing.key, label: editing.label, order: Number(editing.order) || 0 });
      else await pharmacyAPI.adminCreateCategory({ key: editing.key, label: editing.label, order: Number(editing.order) || 0 });
      toast.success('Enregistré'); setEditing(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Échec'); }
  };
  const remove = async (key) => { if (!window.confirm('Supprimer cette catégorie ?')) return; try { await pharmacyAPI.adminDeleteCategory(key); load(); } catch (e) { toast.error(e.response?.data?.detail || 'Échec'); } };

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button onClick={() => setEditing({ ...emptyCategory })} data-testid="add-category-btn"><Plus size={16} className="mr-1" /> Nouvelle catégorie</Button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase"><tr><th className="text-left p-3">Ordre</th><th className="text-left p-3">Libellé</th><th className="text-left p-3">Clé</th><th className="text-right p-3">Actions</th></tr></thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.key} className="border-t border-gray-100" data-testid={`admin-category-${c.key}`}>
                <td className="p-3 text-gray-400">{c.order}</td>
                <td className="p-3 font-semibold">{c.label}</td>
                <td className="p-3 text-gray-500 font-mono text-xs">{c.key}</td>
                <td className="p-3 text-right">
                  <button onClick={() => setEditing({ ...c, existing: true })} className="text-gray-500 mr-2" data-testid={`edit-category-${c.key}`}><PencilSimple size={16} /></button>
                  <button onClick={() => remove(c.key)} className="text-red-400" data-testid={`del-category-${c.key}`}><Trash size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()} data-testid="category-editor">
            <h3 className="font-bold text-lg mb-3">{editing.existing ? 'Modifier' : 'Nouvelle'} catégorie</h3>
            <input className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="Libellé (ex: Vitamines)" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} data-testid="cat-label" />
            <input className="w-full border rounded-lg px-3 py-2 text-sm mb-2 disabled:bg-gray-100" placeholder="Clé (ex: vitamins, sans espace)" value={editing.key} disabled={editing.existing} onChange={(e) => setEditing({ ...editing, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} data-testid="cat-key" />
            <input className="w-full border rounded-lg px-3 py-2 text-sm mb-3" placeholder="Ordre d'affichage" type="number" value={editing.order} onChange={(e) => setEditing({ ...editing, order: e.target.value })} data-testid="cat-order" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}><X size={16} className="mr-1" />Annuler</Button>
              <Button onClick={save} data-testid="save-category-btn"><Check size={16} className="mr-1" />Enregistrer</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ───────── Settings tab ─────────
const SettingsTab = () => {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { pharmacyAPI.adminSettings().then((r) => setS(r.data)).catch(() => toast.error('Erreur')); }, []);
  if (!s) return <p className="text-sm text-gray-400">Chargement…</p>;

  const setD = (k, v) => setS({ ...s, delivery: { ...s.delivery, [k]: v } });
  const save = async () => {
    setSaving(true);
    try {
      await pharmacyAPI.adminUpdateSettings({
        active: s.active, info_note: s.info_note || '',
        delivery: {
          base: Number(s.delivery.base) || 0, per_km: Number(s.delivery.per_km) || 0,
          min: Number(s.delivery.min) || 0, free_threshold: Number(s.delivery.free_threshold) || 0,
        },
      });
      toast.success('Paramètres enregistrés');
    } catch { toast.error('Échec'); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-xl space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between" data-testid="settings-active-row">
        <div>
          <h4 className="font-semibold text-gray-900">Service Pharmacie actif</h4>
          <p className="text-xs text-gray-500">Désactivé : les clients ne peuvent plus commander.</p>
        </div>
        <button onClick={() => setS({ ...s, active: !s.active })} data-testid="settings-active-toggle"
          className={`w-12 h-7 rounded-full transition-colors relative ${s.active ? 'bg-green-500' : 'bg-gray-300'}`}>
          <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${s.active ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="text-sm font-semibold text-gray-900">Note / bannière client</label>
        <input className="w-full border rounded-lg px-3 py-2 text-sm mt-2" placeholder="Ex: Livraison sous 45 min" value={s.info_note || ''} onChange={(e) => setS({ ...s, info_note: e.target.value })} data-testid="settings-info-note" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Frais de livraison</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Frais de base (€)</label>
            <input type="number" step="0.1" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" value={s.delivery.base} onChange={(e) => setD('base', e.target.value)} data-testid="settings-base" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Prix / km (€)</label>
            <input type="number" step="0.1" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" value={s.delivery.per_km} onChange={(e) => setD('per_km', e.target.value)} data-testid="settings-per-km" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Frais minimum (€)</label>
            <input type="number" step="0.1" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" value={s.delivery.min} onChange={(e) => setD('min', e.target.value)} data-testid="settings-min" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Livraison gratuite dès (€, 0 = off)</label>
            <input type="number" step="1" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" value={s.delivery.free_threshold} onChange={(e) => setD('free_threshold', e.target.value)} data-testid="settings-free-threshold" />
          </div>
        </div>
      </div>

      <Button onClick={save} disabled={saving} data-testid="save-settings-btn"><Check size={16} className="mr-1" />{saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}</Button>
    </div>
  );
};


const TABS = [
  { key: 'orders', label: 'Commandes', icon: Receipt, comp: OrdersTab },
  { key: 'products', label: 'Produits', icon: Package, comp: ProductsTab },
  { key: 'categories', label: 'Catégories', icon: Tag, comp: CategoriesTab },
  { key: 'pharmacies', label: 'Pharmacies', icon: Storefront, comp: PharmaciesTab },
  { key: 'settings', label: 'Paramètres', icon: Gear, comp: SettingsTab },
];

const AdminPharmacy = () => {
  const [tab, setTab] = useState('orders');
  const Active = TABS.find((t) => t.key === tab).comp;
  return (
    <div data-testid="admin-pharmacy-page">
      <div className="flex items-center gap-2 mb-4">
        <Pill size={26} weight="duotone" className="text-[#FF4500]" />
        <h1 className="text-xl font-bold text-gray-900">Pharmacie</h1>
      </div>
      <div className="flex gap-2 mb-5 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`pharmacy-tab-${t.key}`}
            className={`px-4 py-2 text-sm font-semibold flex items-center gap-1.5 border-b-2 -mb-px ${tab === t.key ? 'border-[#FF4500] text-[#FF4500]' : 'border-transparent text-gray-500'}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>
      <Active />
    </div>
  );
};

export default AdminPharmacy;
