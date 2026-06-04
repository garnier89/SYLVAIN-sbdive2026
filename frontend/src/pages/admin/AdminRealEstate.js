import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Star, Buildings, Trash, Eye, EyeSlash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { realEstateAPI } from '../../services/api';

const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
const CAT = { residential: 'Résidentiel', commercial: 'Commercial', land: 'Terrain' };
const ST = { active: { l: 'Active', c: 'bg-green-100 text-green-700' }, inactive: { l: 'Inactive', c: 'bg-amber-100 text-amber-700' }, sold: { l: 'Vendu', c: 'bg-gray-200 text-gray-600' }, rented: { l: 'Loué', c: 'bg-gray-200 text-gray-600' } };

const AdminRealEstate = () => {
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

  const stats = {
    total: items.length,
    active: items.filter((i) => i.status === 'active').length,
    featured: items.filter((i) => i.is_featured).length,
  };

  return (
    <div className="p-6" data-testid="admin-real-estate">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Buildings size={26} weight="duotone" /> Immobilier — Annonces</h1>
          <p className="text-sm text-gray-500">Gérez les annonces immobilières publiées par les utilisateurs.</p>
        </div>
        <div className="flex gap-4 text-center">
          <div><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-gray-400">Total</p></div>
          <div><p className="text-2xl font-bold text-green-600">{stats.active}</p><p className="text-xs text-gray-400">Actives</p></div>
          <div><p className="text-2xl font-bold text-orange-500">{stats.featured}</p><p className="text-xs text-gray-400">Sponsorisées</p></div>
        </div>
      </div>

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
    </div>
  );
};

export default AdminRealEstate;
