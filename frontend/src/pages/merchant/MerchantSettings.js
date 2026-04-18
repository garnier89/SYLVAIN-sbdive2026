import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { useAuth } from '../../contexts/AuthContext';
import { Gear, Storefront, Clock, MapPin, Phone, Envelope, CheckCircle, Image } from '@phosphor-icons/react';
import { toast } from 'sonner';

const MerchantSettings = () => {
  const { user } = useAuth();
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
