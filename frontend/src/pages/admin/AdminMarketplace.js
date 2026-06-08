import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Storefront, Car, ShoppingBag, MagnifyingGlass, Trash, Star, Eye, EyeSlash, Percent, Truck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { marketplaceAPI } from '../../services/api';

const KIND_LABEL = { vehicle: 'Véhicule', item: 'Article' };

const AdminMarketplace = () => {
  const [listings, setListings] = useState([]);
  const [counts, setCounts] = useState({ vehicle: 0, item: 0 });
  const [kind, setKind] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ commission_pct: '', delivery_fee: '' });
  const [savingSettings, setSavingSettings] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await marketplaceAPI.adminListings({ kind: kind || undefined, search: search || undefined });
      setListings(r.data.listings || []);
      setCounts(r.data.counts || { vehicle: 0, item: 0 });
    } catch (e) { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  }, [kind, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    marketplaceAPI.adminGetSettings().then((r) => setSettings({ commission_pct: r.data.commission_pct, delivery_fee: r.data.delivery_fee })).catch(() => {});
  }, []);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const r = await marketplaceAPI.adminSetSettings({ commission_pct: Number(settings.commission_pct), delivery_fee: Number(settings.delivery_fee) });
      setSettings({ commission_pct: r.data.commission_pct, delivery_fee: r.data.delivery_fee });
      toast.success('Réglages enregistrés');
    } catch (e) { toast.error('Échec'); }
    finally { setSavingSettings(false); }
  };

  const feature = async (id) => { try { const r = await marketplaceAPI.adminFeatureListing(id); toast.success(r.data.is_featured ? 'Annonce sponsorisée' : 'Sponsoring retiré'); load(); } catch { toast.error('Échec'); } };
  const toggle = async (id) => { try { await marketplaceAPI.adminToggleListing(id); load(); } catch { toast.error('Échec'); } };
  const remove = async (id) => { if (!window.confirm('Supprimer définitivement cette annonce ?')) return; try { await marketplaceAPI.adminDeleteListing(id); toast.success('Annonce supprimée'); load(); } catch { toast.error('Échec'); } };

  return (
    <div className="p-6" data-testid="admin-marketplace-page">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Storefront size={22} className="text-[#FF5000]" weight="fill" /> Marketplace</h1>
        <p className="text-sm text-gray-500 mt-1">Modérez les annonces (Véhicules &amp; Articles) et réglez la commission &amp; les frais de livraison.</p>
      </div>

      {/* Settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end" data-testid="mp-settings">
        <div>
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-1"><Percent size={13} /> Commission plateforme (%)</label>
          <Input type="number" value={settings.commission_pct} onChange={(e) => setSettings((s) => ({ ...s, commission_pct: e.target.value }))} className="h-9" data-testid="mp-commission" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-1"><Truck size={13} /> Frais de livraison (€)</label>
          <Input type="number" value={settings.delivery_fee} onChange={(e) => setSettings((s) => ({ ...s, delivery_fee: e.target.value }))} className="h-9" data-testid="mp-delivery-fee" />
        </div>
        <Button className="bg-[#FF5000] hover:bg-[#e64800] text-white h-9" onClick={saveSettings} disabled={savingSettings} data-testid="mp-save-settings">{savingSettings ? '…' : 'Enregistrer'}</Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button onClick={() => setKind('')} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${kind === '' ? 'bg-[#FF5000] text-white' : 'bg-white text-gray-600 border border-gray-200'}`} data-testid="mp-filter-all">Toutes ({counts.vehicle + counts.item})</button>
        <button onClick={() => setKind('vehicle')} className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 ${kind === 'vehicle' ? 'bg-[#FF5000] text-white' : 'bg-white text-gray-600 border border-gray-200'}`} data-testid="mp-filter-vehicle"><Car size={13} /> Véhicules ({counts.vehicle})</button>
        <button onClick={() => setKind('item')} className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 ${kind === 'item' ? 'bg-[#FF5000] text-white' : 'bg-white text-gray-600 border border-gray-200'}`} data-testid="mp-filter-item"><ShoppingBag size={13} /> Articles ({counts.item})</button>
        <div className="relative ml-auto">
          <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Titre ou vendeur…" className="pl-9 h-9 w-56 text-sm" data-testid="mp-search" />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="w-8 h-8 border-2 border-orange-200 border-t-[#FF5000] rounded-full animate-spin mx-auto" /></div>
        ) : listings.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10" data-testid="mp-empty">Aucune annonce.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr><th className="text-left p-3">Annonce</th><th className="text-left p-3">Type</th><th className="text-left p-3">Prix</th><th className="text-left p-3">Vendeur</th><th className="text-left p-3">Statut</th><th className="text-right p-3">Actions</th></tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id} className="border-t border-gray-100" data-testid={`mp-row-${l.id}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {l.image ? <img src={l.image} alt="" className="w-10 h-10 rounded-lg object-cover" /> : <div className="w-10 h-10 rounded-lg bg-gray-100" />}
                      <div className="min-w-0"><p className="font-medium text-gray-800 truncate max-w-[200px]">{l.title}</p>{l.is_featured && <Badge className="bg-amber-100 text-amber-700 text-[10px] mt-0.5">★ Sponsorisé</Badge>}</div>
                    </div>
                  </td>
                  <td className="p-3"><Badge variant="outline">{KIND_LABEL[l.kind] || l.kind}</Badge><div className="text-[10px] text-gray-400 mt-0.5">{l.listing_type === 'rent' ? 'Location' : 'Vente'}</div></td>
                  <td className="p-3 font-semibold text-gray-700">{l.price} €</td>
                  <td className="p-3 text-gray-600">{l.seller_name || '—'}</td>
                  <td className="p-3">{l.status === 'active' ? <Badge className="bg-emerald-100 text-emerald-700">Active</Badge> : <Badge variant="outline" className="text-gray-400">Inactive</Badge>}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => feature(l.id)} data-testid={`mp-feature-${l.id}`} title="Sponsoriser"><Star size={16} className={l.is_featured ? 'text-amber-500' : 'text-gray-300'} weight={l.is_featured ? 'fill' : 'regular'} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(l.id)} data-testid={`mp-toggle-${l.id}`} title={l.status === 'active' ? 'Désactiver' : 'Activer'}>{l.status === 'active' ? <Eye size={16} className="text-emerald-600" /> : <EyeSlash size={16} className="text-gray-400" />}</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(l.id)} data-testid={`mp-delete-${l.id}`} title="Supprimer"><Trash size={16} className="text-red-500" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminMarketplace;
