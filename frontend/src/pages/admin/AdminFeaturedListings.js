import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Star, MagnifyingGlass } from '@phosphor-icons/react';
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

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeCollection]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/phase2/catalogs/${activeCollection}?limit=200`, { credentials: 'include' });
      const d = await r.json();
      setItems(Array.isArray(d) ? d : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const feature = async (item) => {
    const days = parseInt(window.prompt('Mise en avant pour combien de jours ?', '30')) || 30;
    try {
      const r = await fetch(`${API}/api/phase2/admin/catalogs/${activeCollection}/${item.id}/feature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ duration_days: days, priority: 5 }),
      });
      if (!r.ok) throw new Error('feature failed');
      toast.success(`${item.name || item.title} mis en avant ${days}j`);
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

      {/* Tabs */}
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
                      <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white text-xs h-7" onClick={() => feature(it)} data-testid={`feature-${it.id}`}>★ Mettre en avant</Button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">Aucun partenaire</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminFeaturedListings;
