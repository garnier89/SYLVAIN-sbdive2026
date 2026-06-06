import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Car, Plus, PencilSimple, Trash, Copy, ArrowUp, ArrowDown } from '@phosphor-icons/react';
import { toast } from 'sonner';
import VehicleTypeEditor from './VehicleTypeEditor';
import { currencySymbol } from './vehicleTypeConstants';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminVehicleTypes = () => {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // editor item or null

  const loadTypes = () => {
    fetch(`${API}/api/admin/vehicle-types`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setTypes(data))
      .catch(() => toast.error('Erreur de chargement'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadTypes(); }, []);

  const handleDelete = async (slug) => {
    if (!window.confirm('Supprimer ce type de véhicule ?')) return;
    try {
      await fetch(`${API}/api/admin/vehicle-types/${slug}`, { method: 'DELETE', credentials: 'include' });
      toast.success('Supprimé'); loadTypes();
    } catch { toast.error('Échec'); }
  };

  // Reorder a vehicle (↑/↓) — order is reflected in the client app (sorted by display_order).
  const move = async (slug, dir) => {
    const idx = types.findIndex((t) => t.slug === slug);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= types.length) return;
    const next = [...types];
    [next[idx], next[j]] = [next[j], next[idx]];
    setTypes(next);
    try {
      await fetch(`${API}/api/admin/vehicle-types/reorder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ordered_slugs: next.map((t) => t.slug) }),
      });
    } catch { toast.error('Échec du classement'); loadTypes(); }
  };

  const openNew = () => setEditing({ _isExisting: false });
  const openEdit = (vt) => setEditing({ ...vt, _isExisting: true });
  const duplicate = (vt) => setEditing({ ...vt, slug: '', name_fr: `${vt.name_fr || ''} (copie)`, _isExisting: false });

  if (editing) {
    return (
      <VehicleTypeEditor
        item={editing}
        onSaved={() => { setEditing(null); loadTypes(); }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="p-6" data-testid="admin-vehicle-types">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Car size={26} weight="duotone" /> Types de véhicule</h1>
          <p className="text-sm text-gray-500 mt-1">{types.length} type(s) configuré(s) · classez-les avec les flèches ↑/↓ (ordre repris dans l&apos;app client)</p>
        </div>
        <Button onClick={openNew} className="bg-[#FF5000] text-white" data-testid="vt-add-new"><Plus size={16} className="mr-1.5" />Nouveau type</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading && <p className="col-span-full text-center text-gray-400 py-10">Chargement...</p>}
        {!loading && types.length === 0 && <p className="col-span-full text-center text-gray-400 py-10">Aucun type de véhicule. Créez-en un.</p>}
        {!loading && types.map((vt, idx) => {
          const sym = currencySymbol(vt.currency || 'EUR');
          return (
            <div key={vt.slug} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow" data-testid={`vt-card-${vt.slug}`}>
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                  {vt.image_selected || vt.image_unselected
                    ? <img src={vt.image_selected || vt.image_unselected} alt={vt.name_fr} className="w-full h-full object-contain" />
                    : <Car size={26} className="text-gray-300" weight="duotone" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-800 truncate">{vt.name_fr || vt.slug}</h3>
                    {vt.status === 'inactive' && <Badge variant="outline" className="text-amber-600 border-amber-300">Inactif</Badge>}
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px] mt-0.5">{vt.slug}</Badge>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {vt.enable_pool && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Pool</span>}
                    {vt.pet_friendly && <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded">🐾</span>}
                    {vt.ask_otp_before_ride && <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">OTP</span>}
                    {vt.allow_whatsapp_booking && <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">WA</span>}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <button onClick={() => move(vt.slug, -1)} disabled={idx === 0} title="Monter" data-testid={`vt-up-${vt.slug}`}
                    className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center disabled:opacity-30"><ArrowUp size={13} weight="bold" /></button>
                  <span className="text-[10px] font-bold text-gray-400">{idx + 1}</span>
                  <button onClick={() => move(vt.slug, 1)} disabled={idx === types.length - 1} title="Descendre" data-testid={`vt-down-${vt.slug}`}
                    className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center disabled:opacity-30"><ArrowDown size={13} weight="bold" /></button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div className="bg-gray-50 rounded-lg py-1.5"><p className="text-[10px] text-gray-400">Base</p><p className="text-sm font-bold text-gray-800">{vt.base_fare}{sym}</p></div>
                <div className="bg-gray-50 rounded-lg py-1.5"><p className="text-[10px] text-gray-400">/km</p><p className="text-sm font-bold text-gray-800">{vt.price_per_km}{sym}</p></div>
                <div className="bg-gray-50 rounded-lg py-1.5"><p className="text-[10px] text-gray-400">Places</p><p className="text-sm font-bold text-gray-800">{vt.person_capacity}</p></div>
              </div>
              <div className="flex gap-1 mt-3 pt-3 border-t border-gray-100">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(vt)} data-testid={`vt-edit-${vt.slug}`}><PencilSimple size={14} className="mr-1" />Modifier</Button>
                <Button size="sm" variant="ghost" onClick={() => duplicate(vt)} title="Dupliquer" data-testid={`vt-dup-${vt.slug}`}><Copy size={15} /></Button>
                <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDelete(vt.slug)} data-testid={`vt-delete-${vt.slug}`}><Trash size={15} /></Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminVehicleTypes;
