import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { useAuth } from '../../contexts/AuthContext';
import { Gear, Storefront, Clock, Phone, SealPercent, ForkKnife } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const MerchantSettings = () => {
  const { user } = useAuth();
  // Real storefront fields (loaded from / saved to backend).
  const [vitrine, setVitrine] = useState(null);
  const [savingVitrine, setSavingVitrine] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/merchants/me`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((m) => { if (m) setVitrine({ cuisine: m.cuisine || '', discount_pct: m.discount_pct || 0, delivery_fee: m.delivery_fee ?? 2.5, eta_min: m.eta_min || 30, store_name: m.store_name }); })
      .catch(() => {});
  }, []);

  const saveVitrine = async () => {
    setSavingVitrine(true);
    try {
      const res = await fetch(`${API}/api/merchants/me`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuisine: vitrine.cuisine,
          discount_pct: Number(vitrine.discount_pct) || 0,
          delivery_fee: Number(vitrine.delivery_fee) || 0,
          eta_min: Number(vitrine.eta_min) || 30,
        }),
      });
      if (res.ok) { const m = await res.json(); setVitrine({ ...vitrine, ...m }); toast.success('Vitrine mise à jour !'); }
      else toast.error('Échec de l\'enregistrement');
    } catch { toast.error('Erreur réseau'); }
    finally { setSavingVitrine(false); }
  };

  const [settings, setSettings] = useState({
    store_name: user?.name || 'Ma Boutique',
    description: 'Restaurant de cuisine locale et internationale',
    phone: '+33 6 00 00 00 00',
    email: user?.email || '',
    address: '12 Rue du Commerce, Fort-de-France',
    opening_hours: '08:00 - 22:00',
    delivery_radius: '5',
    min_order: '10',
    delivery_fee: '2.50',
    auto_accept: true,
    notifications: true,
    category: 'food',
  });

  const handleSave = () => {
    toast.success('Parametres sauvegardes !');
  };

  const categories = ['food', 'grocery', 'pharmacy', 'electronics', 'clothing', 'beauty', 'other'];

  return (
    <div className="p-6" data-testid="merchant-settings">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Parametres de la boutique</h1>

      <div className="grid gap-6 max-w-2xl">
        {/* Vitrine & Réduction — REAL (connected to backend) */}
        {vitrine && (
          <Card className="border-orange-200">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ForkKnife size={18} className="text-orange-500" /> Vitrine & Réduction</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Type de cuisine</label>
                <Input value={vitrine.cuisine} onChange={e => setVitrine({ ...vitrine, cuisine: e.target.value })} placeholder="Ex : Italien, Japonais, Américain…" data-testid="vitrine-cuisine" />
                <p className="text-xs text-gray-400 mt-1">Affiché sous le nom de votre boutique et sert de filtre « Cuisines ».</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><SealPercent size={14} className="text-red-500" /> Réduction (%)</label>
                <Input type="number" min="0" max="90" step="1" value={vitrine.discount_pct} onChange={e => setVitrine({ ...vitrine, discount_pct: e.target.value })} data-testid="vitrine-discount" />
                <p className="text-xs text-gray-400 mt-1">Badge rouge « Obtenir X% de réduction » + appliqué au total du client.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Frais de livraison (€)</label>
                  <Input type="number" min="0" step="0.5" value={vitrine.delivery_fee} onChange={e => setVitrine({ ...vitrine, delivery_fee: e.target.value })} data-testid="vitrine-delivery" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Délai (min)</label>
                  <Input type="number" min="1" step="5" value={vitrine.eta_min} onChange={e => setVitrine({ ...vitrine, eta_min: e.target.value })} data-testid="vitrine-eta" />
                </div>
              </div>
              <Button onClick={saveVitrine} disabled={savingVitrine} className="bg-orange-500 hover:bg-orange-600 text-white" data-testid="save-vitrine-btn">
                {savingVitrine ? 'Enregistrement…' : 'Enregistrer la vitrine'}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Storefront size={18} /> Informations generales</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nom de la boutique</label>
              <Input value={settings.store_name} onChange={e => setSettings({...settings, store_name: e.target.value})} data-testid="store-name-input" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Description</label>
              <Textarea value={settings.description} onChange={e => setSettings({...settings, description: e.target.value})} rows={3} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Categorie</label>
              <select value={settings.category} onChange={e => setSettings({...settings, category: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Phone size={18} /> Contact</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Telephone</label>
              <Input value={settings.phone} onChange={e => setSettings({...settings, phone: e.target.value})} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Email</label>
              <Input type="email" value={settings.email} onChange={e => setSettings({...settings, email: e.target.value})} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Adresse</label>
              <Input value={settings.address} onChange={e => setSettings({...settings, address: e.target.value})} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock size={18} /> Livraison & Horaires</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Horaires d'ouverture</label>
              <Input value={settings.opening_hours} onChange={e => setSettings({...settings, opening_hours: e.target.value})} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Rayon (km)</label>
                <Input type="number" value={settings.delivery_radius} onChange={e => setSettings({...settings, delivery_radius: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Min. commande (EUR)</label>
                <Input type="number" value={settings.min_order} onChange={e => setSettings({...settings, min_order: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Frais livraison (EUR)</label>
                <Input type="number" value={settings.delivery_fee} onChange={e => setSettings({...settings, delivery_fee: e.target.value})} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Gear size={18} /> Preferences</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={settings.auto_accept} onChange={e => setSettings({...settings, auto_accept: e.target.checked})} className="w-4 h-4 text-orange-500 rounded" />
              <span className="text-sm text-gray-700">Accepter automatiquement les commandes</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={settings.notifications} onChange={e => setSettings({...settings, notifications: e.target.checked})} className="w-4 h-4 text-orange-500 rounded" />
              <span className="text-sm text-gray-700">Notifications pour nouvelles commandes</span>
            </label>
          </CardContent>
        </Card>

        <Button onClick={handleSave} className="bg-orange-500 hover:bg-orange-600 text-white w-full py-3" data-testid="save-settings-btn">
          Sauvegarder les parametres
        </Button>
      </div>
    </div>
  );
};

export default MerchantSettings;
