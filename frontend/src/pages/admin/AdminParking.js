import React, { useState, useEffect, useCallback } from 'react';
import { Plus, PencilSimple, Trash, Eye, EyeSlash, MapPin, CircleNotch, X, Car } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { parkingAdminAPI } from '../../services/api';

const EMPTY = {
  name: '', address: '', lat: '', lng: '', price_per_hour: '', total_spots: '',
  available_spots: '', rating: '', features: '', image_url: '', active: true,
};

const Field = ({ label, ...props }) => (
  <label className="block">
    <span className="text-xs font-semibold text-gray-600">{label}</span>
    <input {...props} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none" />
  </label>
);

const ParkingModal = ({ open, initial, onClose, onSaved }) => {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setForm(initial
        ? { ...initial, features: Array.isArray(initial.features) ? initial.features.join(', ') : (initial.features || '') }
        : EMPTY);
    }
  }, [open, initial]);
  if (!open) return null;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    if (!form.name.trim()) { toast.error('Le nom est requis'); return; }
    setSaving(true);
    try {
      if (initial?.id) await parkingAdminAPI.update(initial.id, form);
      else await parkingAdminAPI.create(form);
      toast.success(initial?.id ? 'Parking mis à jour' : 'Parking ajouté');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de l’enregistrement');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4" data-testid="parking-modal">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400" data-testid="parking-modal-close"><X size={20} /></button>
        <h3 className="text-lg font-extrabold text-gray-900 mb-4">{initial?.id ? 'Modifier le parking' : 'Nouveau parking'}</h3>
        <div className="space-y-3">
          <Field label="Nom" value={form.name} onChange={set('name')} data-testid="parking-name" placeholder="Parking Gare du Nord" />
          <Field label="Adresse" value={form.address} onChange={set('address')} data-testid="parking-address" placeholder="18 Rue de Dunkerque, 75010 Paris" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude" type="number" value={form.lat} onChange={set('lat')} data-testid="parking-lat" placeholder="48.8809" />
            <Field label="Longitude" type="number" value={form.lng} onChange={set('lng')} data-testid="parking-lng" placeholder="2.3553" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Prix / heure (€)" type="number" value={form.price_per_hour} onChange={set('price_per_hour')} data-testid="parking-price" placeholder="4.50" />
            <Field label="Places totales" type="number" value={form.total_spots} onChange={set('total_spots')} data-testid="parking-total" placeholder="200" />
            <Field label="Places dispo" type="number" value={form.available_spots} onChange={set('available_spots')} data-testid="parking-available" placeholder="45" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Note (0-5)" type="number" value={form.rating} onChange={set('rating')} data-testid="parking-rating" placeholder="4.2" />
            <Field label="Équipements (séparés par virgule)" value={form.features} onChange={set('features')} data-testid="parking-features" placeholder="Couvert, Bornes électriques" />
          </div>
          <Field label="URL de la photo" value={form.image_url} onChange={set('image_url')} data-testid="parking-image" placeholder="https://…" />
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} data-testid="parking-active" /> Visible dans l’app client
          </label>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 font-semibold text-sm" data-testid="parking-cancel">Annuler</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60" data-testid="parking-save">
            {saving ? <CircleNotch size={16} className="animate-spin" /> : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminParking = () => {
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, initial: null });

  const load = useCallback(() => {
    setLoading(true);
    parkingAdminAPI.list()
      .then((r) => setSpots(r.data.spots || []))
      .catch(() => toast.error('Échec du chargement'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (id) => {
    try { await parkingAdminAPI.toggle(id); load(); } catch { toast.error('Échec'); }
  };
  const remove = async (s) => {
    if (!window.confirm(`Supprimer « ${s.name} » ?`)) return;
    try { await parkingAdminAPI.remove(s.id); toast.success('Supprimé'); load(); } catch { toast.error('Échec'); }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto" data-testid="admin-parking-page">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2"><Car size={26} weight="fill" className="text-indigo-600" /> Parkings</h1>
        <button onClick={() => setModal({ open: true, initial: null })} className="flex items-center gap-1.5 bg-indigo-600 text-white font-bold text-sm px-4 py-2 rounded-lg" data-testid="parking-add-btn">
          <Plus size={16} weight="bold" /> Ajouter
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">Gérez les places de stationnement proposées dans l’app (section Parking de l’accueil).</p>

      {loading ? (
        <div className="flex justify-center py-16"><CircleNotch size={28} className="animate-spin text-indigo-500" /></div>
      ) : spots.length === 0 ? (
        <div className="text-center py-16 text-gray-400" data-testid="parking-empty">Aucun parking. Cliquez sur « Ajouter ».</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4" data-testid="parking-list">
          {spots.map((s) => (
            <div key={s.id} className={`bg-white rounded-xl shadow-sm border p-4 ${!s.active ? 'opacity-60' : ''}`} data-testid={`parking-card-${s.id}`}>
              <div className="flex gap-3">
                {s.image_url ? <img src={s.image_url} alt={s.name} className="w-16 h-16 rounded-lg object-cover" /> : <div className="w-16 h-16 rounded-lg bg-indigo-50 flex items-center justify-center"><MapPin size={22} className="text-indigo-400" /></div>}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate">{s.name}</p>
                  <p className="text-xs text-gray-500 truncate">{s.address}</p>
                  <p className="text-xs text-gray-600 mt-1">{s.price_per_hour} €/h · {s.available_spots}/{s.total_spots} places · ★ {s.rating}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                <button onClick={() => toggle(s.id)} className={`p-2 rounded-lg ${s.active ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 bg-gray-100'}`} title="Afficher/Masquer" data-testid={`parking-toggle-${s.id}`}>
                  {s.active ? <Eye size={16} /> : <EyeSlash size={16} />}
                </button>
                <button onClick={() => setModal({ open: true, initial: s })} className="p-2 rounded-lg text-indigo-600 bg-indigo-50" title="Modifier" data-testid={`parking-edit-${s.id}`}><PencilSimple size={16} /></button>
                <button onClick={() => remove(s)} className="p-2 rounded-lg text-red-600 bg-red-50 ml-auto" title="Supprimer" data-testid={`parking-delete-${s.id}`}><Trash size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ParkingModal open={modal.open} initial={modal.initial} onClose={() => setModal({ open: false, initial: null })} onSaved={load} />
    </div>
  );
};

export default AdminParking;
