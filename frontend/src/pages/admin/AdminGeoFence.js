import React, { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { MapPin, Plus, Trash, PencilSimple, Circle } from '@phosphor-icons/react';

const AdminGeoFence = () => {
  const [zones, setZones] = useState([
    { id: 'gz_1', name: 'Paris Centre', type: 'service_area', lat: 48.8566, lng: 2.3522, radius_km: 15, status: 'active', surge_multiplier: 1.0 },
    { id: 'gz_2', name: 'Fort-de-France', type: 'service_area', lat: 14.6161, lng: -61.0588, radius_km: 20, status: 'active', surge_multiplier: 1.0 },
    { id: 'gz_3', name: 'Aeroport CDG', type: 'airport', lat: 49.0097, lng: 2.5479, radius_km: 5, status: 'active', surge_multiplier: 1.5 },
    { id: 'gz_4', name: 'Zone Restreinte Test', type: 'restricted', lat: 48.87, lng: 2.35, radius_km: 1, status: 'inactive', surge_multiplier: 0 },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'service_area', lat: '', lng: '', radius_km: '10', surge_multiplier: '1.0' });

  const typeColors = { service_area: 'bg-green-100 text-green-700', airport: 'bg-blue-100 text-blue-700', restricted: 'bg-red-100 text-red-700', surge: 'bg-amber-100 text-amber-700' };

  const handleAdd = () => {
    setZones(prev => [...prev, { ...form, id: `gz_${Date.now()}`, lat: parseFloat(form.lat), lng: parseFloat(form.lng), radius_km: parseFloat(form.radius_km), surge_multiplier: parseFloat(form.surge_multiplier), status: 'active' }]);
    setShowForm(false);
    setForm({ name: '', type: 'service_area', lat: '', lng: '', radius_km: '10', surge_multiplier: '1.0' });
  };

  const toggleStatus = (id) => setZones(prev => prev.map(z => z.id === id ? { ...z, status: z.status === 'active' ? 'inactive' : 'active' } : z));
  const handleDelete = (id) => setZones(prev => prev.filter(z => z.id !== id));

  return (
    <div className="p-6" data-testid="admin-geofence">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Geo Fence Locations</h1>
          <p className="text-sm text-gray-500 mt-1">{zones.length} zones configurees</p>
        </div>
        <Button className="bg-[#3b82f6] text-white" onClick={() => setShowForm(!showForm)} data-testid="add-zone-btn">
          <Plus size={16} className="mr-1" /> Ajouter une zone
        </Button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6" data-testid="zone-form">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Input placeholder="Nom de la zone" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="service_area">Zone de service</option>
              <option value="airport">Aeroport</option>
              <option value="restricted">Zone restreinte</option>
              <option value="surge">Zone de surge</option>
            </select>
            <Input type="number" placeholder="Latitude" value={form.lat} onChange={e => setForm({...form, lat: e.target.value})} />
            <Input type="number" placeholder="Longitude" value={form.lng} onChange={e => setForm({...form, lng: e.target.value})} />
            <Input type="number" placeholder="Rayon (km)" value={form.radius_km} onChange={e => setForm({...form, radius_km: e.target.value})} />
            <Input type="number" placeholder="Multiplicateur surge" value={form.surge_multiplier} onChange={e => setForm({...form, surge_multiplier: e.target.value})} />
          </div>
          <div className="flex gap-2 mt-3">
            <Button onClick={handleAdd} className="bg-[#3b82f6] text-white">Ajouter</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {zones.map(zone => (
          <div key={zone.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4" data-testid={`zone-${zone.id}`}>
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <MapPin size={20} className="text-blue-500" weight="fill" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900">{zone.name}</span>
                <Badge className={typeColors[zone.type] || ''}>{zone.type.replace('_', ' ')}</Badge>
                <Badge className={zone.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>{zone.status}</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Lat: {zone.lat}, Lng: {zone.lng} | Rayon: {zone.radius_km}km | Surge: x{zone.surge_multiplier}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button size="sm" variant="outline" onClick={() => toggleStatus(zone.id)}>{zone.status === 'active' ? 'Desactiver' : 'Activer'}</Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => handleDelete(zone.id)}><Trash size={16} /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminGeoFence;
