import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Star, Buildings, Trash, Eye, EyeSlash, Rocket, Plus, PencilSimple, Check, X } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { realEstateAPI } from '../../services/api';

const fmt = (v, cur = 'EUR') => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(v || 0);
const CAT = { residential: 'Résidentiel', commercial: 'Commercial', land: 'Terrain' };
const ST = { active: { l: 'Active', c: 'bg-green-100 text-green-700' }, inactive: { l: 'Inactive', c: 'bg-amber-100 text-amber-700' }, sold: { l: 'Vendu', c: 'bg-gray-200 text-gray-600' }, rented: { l: 'Loué', c: 'bg-gray-200 text-gray-600' } };
const COUNTRIES = [
  { id: 'default', label: 'Par défaut (tous)' }, { id: 'FR', label: 'France 🇫🇷' },
  { id: 'MQ', label: 'Martinique 🇲🇶' }, { id: 'GP', label: 'Guadeloupe 🇬🇵' }, { id: 'GF', label: 'Guyane 🇬🇫' },
];
const CURRENCIES = ['EUR', 'USD', 'XOF', 'XAF', 'GBP'];
const emptyPlan = { country: 'FR', country_label: '', currency: 'EUR', duration_days: 7, price: 4.99, priority: 5, label: '', active: true };

// ───────────────────────── Listings tab ─────────────────────────
const ListingsTab = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await realEstateAPI.adminList(filter || undefined); setItems(r.data || []); }
    catch { toast.error('Erreur de chargement'); } finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const toggleStatus = async (id) => { try { await realEstateAPI.adminToggleStatus(id); load(); } catch { toast.error('Échec'); } };
  const feature = async (id) => { try { const r = await realEstateAPI.adminFeature(id); toast.success(r.data.is_featured ? 'Annonce sponsorisée' : 'Sponsoring retiré'); load(); } catch { toast.error('Échec'); } };
  const remove = async (id) => { if (!window.confirm('Supprimer cette annonce ?')) return; try { await realEstateAPI.adminRemove(id); toast.success('Supprimée'); load(); } catch { toast.error('Échec'); } };

  return (
    <>
      <div className="flex gap-2 mb-4">
        {['', 'active', 'inactive', 'sold', 'rented'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} data-testid={`re-admin-filter-${s || 'all'}`}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
            {s === '' ? 'Toutes' : (ST[s]?.l || s)}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr><th className="text-left p-3">Annonce</th><th className="text-left p-3">Type</th><th className="text-left p-3">Prix</th><th className="text-left p-3">Vues/Dem.</th><th className="text-left p-3">Statut</th><th className="text-right p-3">Actions</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-8 text-center text-gray-400">Chargement...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">Aucune annonce.</td></tr>}
            {!loading && items.map((p) => {
              const st = ST[p.status] || ST.active;
              return (
                <tr key={p.id} className="border-t border-gray-100" data-testid={`re-admin-row-${p.id}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                        {p.thumbnail ? <img src={p.thumbnail} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><Buildings size={18} /></div>}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 flex items-center gap-1">{p.is_featured && <Star size={13} weight="fill" className="text-amber-500" />}{p.title}</p>
                        <p className="text-xs text-gray-400">{p.city || p.address || '—'} · {CAT[p.category]}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3"><Badge variant="outline">{p.listing_type === 'rent' ? 'Location' : 'Vente'}</Badge></td>
                  <td className="p-3 font-bold text-gray-800">{fmt(p.price)}</td>
                  <td className="p-3 text-gray-500">{p.views || 0} / {p.inquiries_count || 0}</td>
                  <td className="p-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.c}`}>{st.l}</span></td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => feature(p.id)} data-testid={`re-admin-feature-${p.id}`} title="Sponsoriser"><Star size={16} className={p.is_featured ? 'text-amber-500' : 'text-gray-400'} weight={p.is_featured ? 'fill' : 'regular'} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleStatus(p.id)} data-testid={`re-admin-toggle-${p.id}`} title="Activer/Désactiver">{p.status === 'active' ? <EyeSlash size={16} className="text-gray-500" /> : <Eye size={16} className="text-green-600" />}</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(p.id)} data-testid={`re-admin-delete-${p.id}`} title="Supprimer"><Trash size={16} className="text-red-500" /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ───────────────────────── Boost plans tab ─────────────────────────
const BoostPlansTab = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { ...plan } or emptyPlan with no id

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await realEstateAPI.adminBoostPlans(); setPlans(r.data || []); }
    catch { toast.error('Erreur de chargement'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const payload = { ...editing, duration_days: parseInt(editing.duration_days) || 1, price: parseFloat(editing.price) || 0, priority: parseInt(editing.priority) || 0, country_label: COUNTRIES.find((c) => c.id === editing.country)?.label };
    try {
      if (editing.id) await realEstateAPI.adminUpdateBoostPlan(editing.id, payload);
      else await realEstateAPI.adminCreateBoostPlan(payload);
      toast.success('Plan enregistré'); setEditing(null); load();
    } catch { toast.error('Échec'); }
  };
  const toggle = async (id) => { try { await realEstateAPI.adminToggleBoostPlan(id); load(); } catch { toast.error('Échec'); } };
  const remove = async (id) => { if (!window.confirm('Supprimer ce plan ?')) return; try { await realEstateAPI.adminDeleteBoostPlan(id); toast.success('Supprimé'); load(); } catch { toast.error('Échec'); } };

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">Définissez les tarifs de boost par pays/localité et devise. Les annonceurs paient pour passer en tête (★ Sponsorisé).</p>
        <Button onClick={() => setEditing({ ...emptyPlan })} data-testid="boost-plan-add"><Plus size={16} className="mr-1" /> Nouveau plan</Button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr><th className="text-left p-3">Pays / localité</th><th className="text-left p-3">Durée</th><th className="text-left p-3">Prix</th><th className="text-left p-3">Priorité</th><th className="text-left p-3">Statut</th><th className="text-right p-3">Actions</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-8 text-center text-gray-400">Chargement...</td></tr>}
            {!loading && plans.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">Aucun plan. Créez-en un.</td></tr>}
            {!loading && plans.map((pl) => (
              <tr key={pl.id} className="border-t border-gray-100" data-testid={`boost-plan-row-${pl.id}`}>
                <td className="p-3 font-semibold text-gray-800">{pl.country_label || pl.country}</td>
                <td className="p-3">{pl.duration_days} j</td>
                <td className="p-3 font-bold text-orange-500">{fmt(pl.price, pl.currency)}</td>
                <td className="p-3 text-gray-500">{pl.priority}</td>
                <td className="p-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${pl.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{pl.active ? 'Actif' : 'Inactif'}</span></td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(pl)} data-testid={`boost-plan-edit-${pl.id}`}><PencilSimple size={16} className="text-gray-500" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => toggle(pl.id)} data-testid={`boost-plan-toggle-${pl.id}`}>{pl.active ? <EyeSlash size={16} className="text-gray-500" /> : <Eye size={16} className="text-green-600" />}</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(pl.id)} data-testid={`boost-plan-delete-${pl.id}`}><Trash size={16} className="text-red-500" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()} data-testid="boost-plan-modal">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2"><Rocket size={20} className="text-orange-500" /> {editing.id ? 'Modifier le plan' : 'Nouveau plan de boost'}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400"><X size={22} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600">Pays / localité</label>
                <select value={editing.country} onChange={(e) => setEditing({ ...editing, country: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" data-testid="boost-plan-country">
                  {COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Devise</label>
                <select value={editing.currency} onChange={(e) => setEditing({ ...editing, currency: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" data-testid="boost-plan-currency">
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Durée (jours)</label>
                <input type="number" value={editing.duration_days} onChange={(e) => setEditing({ ...editing, duration_days: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" data-testid="boost-plan-duration" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Prix</label>
                <input type="number" step="0.01" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" data-testid="boost-plan-price" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Priorité</label>
                <input type="number" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" data-testid="boost-plan-priority" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600">Libellé (optionnel)</label>
                <input value={editing.label || ''} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="Ex: Boost 7 jours" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" data-testid="boost-plan-label" />
              </div>
            </div>
            <Button onClick={save} className="w-full" data-testid="boost-plan-save"><Check size={16} className="mr-1" /> Enregistrer</Button>
          </div>
        </div>
      )}
    </>
  );
};

const AdminRealEstate = () => {
  const [tab, setTab] = useState('listings');
  return (
    <div className="p-6" data-testid="admin-real-estate">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Buildings size={26} weight="duotone" /> Immobilier</h1>
        <p className="text-sm text-gray-500">Gérez les annonces et les tarifs de boost (★ Sponsorisé).</p>
      </div>
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        <button onClick={() => setTab('listings')} data-testid="admin-re-tab-listings" className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === 'listings' ? 'border-[#FF5000] text-[#FF5000]' : 'border-transparent text-gray-500'}`}>Annonces</button>
        <button onClick={() => setTab('boost')} data-testid="admin-re-tab-boost" className={`px-4 py-2 text-sm font-semibold border-b-2 flex items-center gap-1 ${tab === 'boost' ? 'border-[#FF5000] text-[#FF5000]' : 'border-transparent text-gray-500'}`}><Rocket size={15} /> Plans de Boost</button>
      </div>
      {tab === 'listings' ? <ListingsTab /> : <BoostPlansTab />}
    </div>
  );
};

export default AdminRealEstate;
