import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Package, Receipt, ArrowClockwise, Plus, PencilSimple, Trash, X, CheckCircle,
} from '@phosphor-icons/react';
import { autoPartsAdminAPI } from '../../services/api';

const eur = (n) => `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const STATUS_LABEL = { confirmed: 'Confirmée', preparing: 'Préparation', shipped: 'Expédiée', ready: 'Prête', delivered: 'Livrée', cancelled: 'Annulée' };

const AdminAutoParts = () => {
  const [tab, setTab] = useState('products');
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [revenue, setRevenue] = useState(0);
  const [statuses, setStatuses] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, or] = await Promise.all([autoPartsAdminAPI.products(), autoPartsAdminAPI.orders()]);
      setProducts(pr.data.products || []); setCategories(pr.data.categories || []);
      setOrders(or.data.orders || []); setRevenue(or.data.revenue || 0); setStatuses(or.data.statuses || []);
    } catch { toast.error('Erreur de chargement'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveProduct = async (form) => {
    try {
      if (form.id) await autoPartsAdminAPI.updateProduct(form.id, form);
      else await autoPartsAdminAPI.createProduct(form);
      toast.success('Produit enregistré'); setEditing(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Échec'); }
  };
  const delProduct = async (id) => {
    if (!window.confirm('Désactiver ce produit ?')) return;
    try { await autoPartsAdminAPI.deleteProduct(id); load(); } catch { toast.error('Échec'); }
  };
  const setStatus = async (id, status) => {
    try { await autoPartsAdminAPI.setStatus(id, { status }); toast.success('Statut mis à jour'); load(); } catch { toast.error('Échec'); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto" data-testid="admin-auto-parts">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Package size={24} weight="fill" className="text-blue-600" /><h1 className="text-xl font-black text-gray-900">SB Auto Pièces</h1></div>
        <button onClick={load} className="flex items-center gap-1.5 text-sm font-semibold text-gray-500" data-testid="auto-admin-refresh"><ArrowClockwise size={16} /> Actualiser</button>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('products')} className={`px-4 py-2 rounded-full text-sm font-semibold ${tab === 'products' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`} data-testid="tab-products">Produits ({products.filter(p => p.active).length})</button>
        <button onClick={() => setTab('orders')} className={`px-4 py-2 rounded-full text-sm font-semibold ${tab === 'orders' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`} data-testid="tab-orders">Commandes ({orders.length})</button>
        <div className="ml-auto bg-emerald-50 text-emerald-700 rounded-full px-4 py-2 text-sm font-bold flex items-center gap-1.5" data-testid="auto-revenue"><Receipt size={16} /> {eur(revenue)}</div>
      </div>

      {tab === 'products' ? (
        <div className="space-y-2">
          <button onClick={() => setEditing({ category: categories[0]?.id, price: 0, stock: 0, compat: ['Universel'] })} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5" data-testid="add-product-btn"><Plus size={16} /> Nouveau produit</button>
          {products.filter(p => p.active).map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3" data-testid={`admin-product-${p.id}`}>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm truncate">{p.name}</p>
                <p className="text-xs text-gray-500">{p.brand} · {p.category} · {eur(p.price)} · stock {p.stock}</p>
              </div>
              <button onClick={() => setEditing(p)} className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center" data-testid={`edit-product-${p.id}`}><PencilSimple size={15} className="text-gray-500" /></button>
              <button onClick={() => delProduct(p.id)} className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center" data-testid={`del-product-${p.id}`}><Trash size={15} className="text-rose-500" /></button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {orders.length === 0 ? <p className="text-center text-gray-400 py-10">Aucune commande</p> : orders.map(o => (
            <div key={o.id} className="bg-white rounded-xl border border-gray-100 p-3" data-testid={`admin-order-${o.id}`}>
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-900 text-sm">#{o.id.slice(-6)} · {o.user_name}</p>
                <span className="font-bold text-gray-900 text-sm">{eur(o.total)}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{o.items.map(i => `${i.qty}× ${i.name}`).join(', ')} · {o.fulfillment === 'delivery' ? 'Livraison' : 'Retrait'}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-xs text-gray-400">Statut :</span>
                <select value={o.status} onChange={e => setStatus(o.id, e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs" data-testid={`order-status-${o.id}`}>
                  {statuses.map(s => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <ProductForm initial={editing} categories={categories} onClose={() => setEditing(null)} onSave={saveProduct} />}
    </div>
  );
};

const ProductForm = ({ initial, categories, onClose, onSave }) => {
  const [f, setF] = useState({ name: '', brand: '', description: '', compat: 'Universel', ...initial, compat: (initial.compat || ['Universel']).join(', ') });
  const submit = () => {
    if (!f.name.trim()) { toast.error('Nom requis'); return; }
    onSave({ ...f, price: Number(f.price), stock: Number(f.stock), compat: f.compat.split(',').map(s => s.trim()).filter(Boolean) });
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose} data-testid="product-form">
      <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><p className="font-bold text-gray-900">{initial.id ? 'Modifier' : 'Nouveau produit'}</p><button onClick={onClose}><X size={20} /></button></div>
        <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Nom" className="w-full border rounded-lg px-3 py-2 text-sm" data-testid="pf-name" />
        <input value={f.brand} onChange={e => setF({ ...f, brand: e.target.value })} placeholder="Marque" className="w-full border rounded-lg px-3 py-2 text-sm" data-testid="pf-brand" />
        <select value={f.category} onChange={e => setF({ ...f, category: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" data-testid="pf-category">
          {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} placeholder="Prix" className="border rounded-lg px-3 py-2 text-sm" data-testid="pf-price" />
          <input type="number" value={f.stock} onChange={e => setF({ ...f, stock: e.target.value })} placeholder="Stock" className="border rounded-lg px-3 py-2 text-sm" data-testid="pf-stock" />
        </div>
        <input value={f.compat} onChange={e => setF({ ...f, compat: e.target.value })} placeholder="Compatibilité (séparée par virgules)" className="w-full border rounded-lg px-3 py-2 text-sm" data-testid="pf-compat" />
        <textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="Description" className="w-full border rounded-lg px-3 py-2 text-sm resize-none h-16" data-testid="pf-desc" />
        <button onClick={submit} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-1.5" data-testid="pf-save"><CheckCircle size={16} weight="fill" /> Enregistrer</button>
      </div>
    </div>
  );
};

export default AdminAutoParts;
