import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Car, Plus, PencilSimple, Trash, MagnifyingGlass } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminVehicleTypes = () => {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ slug: '', name_fr: '', person_capacity: 4, min_fare: 10, base_fare: 5, price_per_km: 1.5, price_per_min: 0.3, commission_percent: 15 });

  useEffect(() => { loadTypes(); }, []);

  const loadTypes = async () => {
    try {
      const res = await fetch(`${API}/api/config/vehicle-types`);
      setTypes(await res.json());
    } catch (err) { console.error('Failed to load vehicle types:', err); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    try {
      const method = editing ? 'PUT' : 'POST';
      const url = editing ? `${API}/api/admin/vehicle-types/${editing}` : `${API}/api/admin/vehicle-types`;
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(form) });
      setEditing(null);
      setForm({ slug: '', name_fr: '', person_capacity: 4, min_fare: 10, base_fare: 5, price_per_km: 1.5, price_per_min: 0.3, commission_percent: 15 });
      loadTypes();
    } catch (err) { console.error('Save error:', err); }
  };

  const handleDelete = async (slug) => {
    if (!window.confirm('Supprimer ce type de véhicule ?')) return;
    try {
      await fetch(`${API}/api/admin/vehicle-types/${slug}`, { method: 'DELETE', credentials: 'include' });
      loadTypes();
    } catch (err) { console.error('Delete error:', err); }
  };

  const startEdit = (vt) => {
    setEditing(vt.slug);
    setForm({ ...vt });
  };

  return (
    <div className="p-6" data-testid="admin-vehicle-types">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Vehicle Types</h1>
          <p className="text-sm text-gray-500 mt-1">{types.length} types configurés</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6" data-testid="vehicle-form">
        <h3 className="text-sm font-bold text-gray-700 mb-3">{editing ? 'Modifier' : 'Ajouter'} un type de véhicule</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Input placeholder="Slug (ex: suv)" value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} disabled={!!editing} data-testid="vt-slug" />
          <Input placeholder="Nom FR" value={form.name_fr} onChange={e => setForm({...form, name_fr: e.target.value})} data-testid="vt-name" />
          <Input type="number" placeholder="Capacité" value={form.person_capacity} onChange={e => setForm({...form, person_capacity: parseInt(e.target.value) || 0})} data-testid="vt-capacity" />
          <Input type="number" placeholder="Tarif min" value={form.min_fare} onChange={e => setForm({...form, min_fare: parseFloat(e.target.value) || 0})} data-testid="vt-min-fare" />
          <Input type="number" placeholder="Tarif base" value={form.base_fare} onChange={e => setForm({...form, base_fare: parseFloat(e.target.value) || 0})} />
          <Input type="number" placeholder="Prix/km" value={form.price_per_km} onChange={e => setForm({...form, price_per_km: parseFloat(e.target.value) || 0})} />
          <Input type="number" placeholder="Prix/min" value={form.price_per_min} onChange={e => setForm({...form, price_per_min: parseFloat(e.target.value) || 0})} />
          <Input type="number" placeholder="Commission %" value={form.commission_percent} onChange={e => setForm({...form, commission_percent: parseFloat(e.target.value) || 0})} />
        </div>
        <div className="flex gap-2 mt-3">
          <Button onClick={handleSave} className="bg-[#3b82f6] text-white" data-testid="vt-save">{editing ? 'Modifier' : 'Ajouter'}</Button>
          {editing && <Button variant="outline" onClick={() => { setEditing(null); setForm({ slug: '', name_fr: '', person_capacity: 4, min_fare: 10, base_fare: 5, price_per_km: 1.5, price_per_min: 0.3, commission_percent: 15 }); }}>Annuler</Button>}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Type</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Nom</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Capacité</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-600">Min</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-600">Base</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-600">/km</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-600">/min</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-600">Comm%</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {types.map(vt => (
              <tr key={vt.slug} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`vt-row-${vt.slug}`}>
                <td className="py-3 px-4"><Badge variant="outline" className="font-mono">{vt.slug}</Badge></td>
                <td className="py-3 px-4 font-medium text-gray-800">{vt.name_fr}</td>
                <td className="py-3 px-4 text-center">{vt.person_capacity}</td>
                <td className="py-3 px-4 text-right">{vt.min_fare}€</td>
                <td className="py-3 px-4 text-right">{vt.base_fare}€</td>
                <td className="py-3 px-4 text-right">{vt.price_per_km}€</td>
                <td className="py-3 px-4 text-right">{vt.price_per_min}€</td>
                <td className="py-3 px-4 text-right">{vt.commission_percent}%</td>
                <td className="py-3 px-4 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(vt)} data-testid={`vt-edit-${vt.slug}`}><PencilSimple size={14} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => handleDelete(vt.slug)} data-testid={`vt-delete-${vt.slug}`}><Trash size={14} /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="p-8 text-center text-gray-400">Chargement...</div>}
        {!loading && types.length === 0 && <div className="p-8 text-center text-gray-400">Aucun type de véhicule</div>}
      </div>
    </div>
  );
};

export default AdminVehicleTypes;
