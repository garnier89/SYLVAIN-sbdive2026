import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Star, MagnifyingGlass, X } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const COLLECTIONS = [
  { key: 'beauty_salons', label: 'Salons de beauté' },
  { key: 'pet_providers', label: 'Animaux' },
  { key: 'car_services', label: 'Entretien Auto' },
  { key: 'towing_partners', label: 'Dépannage' },
  { key: 'nearby_businesses', label: 'Commerces' },
  { key: 'ondemand_services', label: 'À la demande' },
  { key: 'carpool_trips', label: 'Covoiturage' },
  { key: 'marketplace_listings', label: 'Annonces' },
];

const AdminFeaturedListings = () => {
  const [activeCollection, setActiveCollection] = useState('beauty_salons');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [featureDialog, setFeatureDialog] = useState(null);

  // Reload only when the active collection changes (search filters client-side).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [activeCollection]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/phase2/catalogs/${activeCollection}?limit=200`, { credentials: 'include' });
      const d = await r.json();
      setItems(Array.isArray(d) ? d : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const openFeatureDialog = (item) => setFeatureDialog({ item, days: 30, priority: 5 });

  const confirmFeature = async () => {
    if (!featureDialog) return;
    const { item, days, priority } = featureDialog;
    const safeDays = Math.max(1, Math.min(365, parseInt(days) || 30));
    try {
      const r = await fetch(`${API}/api/phase2/admin/catalogs/${activeCollection}/${item.id}/feature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ duration_days: safeDays, priority: Math.max(0, parseInt(priority) || 0) }),
      });
      if (!r.ok) throw new Error('feature failed');
      toast.success(`${item.name || item.title} mis en avant ${safeDays}j`);
      setFeatureDialog(null);
      load();
    } catch (e) { console.error(e); toast.error('Erreur'); }
  };

  const unfeature = async (item) => {
    try {
      await fetch(`${API}/api/phase2/admin/catalogs/${activeCollection}/${item.id}/feature`, {
        method: 'DELETE', credentials: 'include',
      });
      toast.success('Mise en avant retirée');
      load();
    } catch (e) { console.error(e); toast.error('Erreur'); }
  };

  const filtered = items.filter(i => !search.trim() ||
    (i.name || i.title || '').toLowerCase().includes(search.toLowerCase()));
  const featuredCount = items.filter(i => i.is_featured).length;

  return (
    <div className="p-6" data-testid="admin-featured-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Star size={22} className="text-amber-500" weight="fill" />
            Mise en avant sponsorisée
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Activez la promotion payante pour mettre vos partenaires en tête des résultats. <span className="font-semibold text-amber-600">{featuredCount} sponsorisé(s)</span>
          </p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {COLLECTIONS.map(c => (
          <button
            key={c.key}
            onClick={() => setActiveCollection(c.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${activeCollection === c.key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
            data-testid={`tab-${c.key}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-md">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Rechercher un partenaire..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Partenaire</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Catégorie</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-600">Statut</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-600">Expire le</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(it => (
                <tr key={it.id} className="border-b border-gray-100" data-testid={`row-${it.id}`}>
                  <td className="py-3 px-4 font-medium text-gray-800">{it.name || it.title}</td>
                  <td className="py-3 px-4 text-gray-600">{it.category || it.type || '-'}</td>
                  <td className="py-3 px-4 text-center">
                    {it.is_featured ? (
                      <Badge className="bg-gradient-to-r from-amber-400 to-orange-500 text-white">★ Sponsorisé</Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-500">Standard</Badge>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center text-xs text-gray-500">
                    {it.featured_until ? new Date(it.featured_until).toLocaleDateString('fr-FR') : '-'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {it.is_featured ? (
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => unfeature(it)} data-testid={`unfeature-${it.id}`}>Retirer</Button>
                    ) : (
                      <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white text-xs h-7" onClick={() => openFeatureDialog(it)} data-testid={`feature-${it.id}`}>★ Mettre en avant</Button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">Aucun partenaire</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {featureDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setFeatureDialog(null)} data-testid="feature-dialog">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Star size={20} className="text-amber-500" weight="fill" />
                Mettre en avant
              </h3>
              <button onClick={() => setFeatureDialog(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4"><span className="font-semibold">{featureDialog.item.name || featureDialog.item.title}</span></p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Durée (jours)</label>
                <Input type="number" min="1" max="365" value={featureDialog.days} onChange={e => setFeatureDialog({...featureDialog, days: e.target.value})} data-testid="dialog-days-input" />
                <p className="text-[10px] text-gray-400 mt-1">Entre 1 et 365 jours</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Priorité (0–10)</label>
                <Input type="number" min="0" max="10" value={featureDialog.priority} onChange={e => setFeatureDialog({...featureDialog, priority: e.target.value})} data-testid="dialog-priority-input" />
                <p className="text-[10px] text-gray-400 mt-1">Plus haut = remonté plus haut dans la liste</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setFeatureDialog(null)} data-testid="dialog-cancel">Annuler</Button>
              <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white" onClick={confirmFeature} data-testid="dialog-confirm">★ Activer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFeaturedListings;
