/**
 * ManageVehiclesPage — V3Cube Pack B
 * Driver can register / edit / delete / set primary among multiple vehicles.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Car, Star, Trash, PencilSimple, X } from '@phosphor-icons/react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

const API = process.env.REACT_APP_BACKEND_URL;
const INITIAL_FORM = { brand: '', model: '', plate: '', year: '', color: '', vehicle_type: 'comfort' };

const ManageVehiclesPage = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [chassisModal, setChassisModal] = useState(false);
  const [chassisPhoto, setChassisPhoto] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/driver-pro/vehicles`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        setVehicles(d.items || []);
      }
    } catch (e) { console.warn('vehicles load failed:', e?.message || e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitVehicle = async (extra = {}) => {
    const payload = { ...form, ...extra };
    const url = editing ? `${API}/api/driver-pro/vehicles/${editing}` : `${API}/api/driver-pro/vehicles`;
    const method = editing ? 'PUT' : 'POST';
    try {
      const r = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        toast.success(editing ? 'Véhicule modifié' : (extra.chassis_photo ? 'Propriété réclamée — véhicule activé' : 'Véhicule ajouté'));
        setEditing(null);
        setForm(INITIAL_FORM);
        setChassisModal(false);
        setChassisPhoto('');
        load();
        return;
      }
      const e = await r.json().catch(() => ({}));
      // Plate already connected on another account → offer the chassis-photo ownership claim.
      if (r.status === 409 && !editing) {
        setChassisModal(true);
        toast.message(typeof e.detail === 'string' ? e.detail : 'Cette plaque est déjà connectée.');
        return;
      }
      toast.error(typeof e.detail === 'string' ? e.detail : 'Erreur');
    } catch (e) { toast.error('Erreur réseau'); }
  };

  const save = () => {
    if (!form.brand || !form.model || !form.plate || !form.year || !form.color) {
      return toast.error('Tous les champs sont requis');
    }
    submitVehicle();
  };

  const onChassisFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast.error('Photo trop volumineuse (max 8 Mo)');
    const reader = new FileReader();
    reader.onload = () => setChassisPhoto(reader.result);
    reader.readAsDataURL(file);
  };

  const confirmChassis = () => {
    if (!chassisPhoto) return toast.error('Ajoutez une photo du châssis (VIN)');
    submitVehicle({ chassis_photo: chassisPhoto });
  };

  const remove = async (id) => {
    if (!window.confirm('Supprimer ce véhicule ?')) return;
    try {
      const r = await fetch(`${API}/api/driver-pro/vehicles/${id}`, { method: 'DELETE', credentials: 'include' });
      if (r.ok) { toast.success('Supprimé'); load(); }
    } catch (e) { toast.error('Erreur'); }
  };

  const setPrimary = async (id) => {
    try {
      const r = await fetch(`${API}/api/driver-pro/vehicles/${id}/set-primary`, { method: 'POST', credentials: 'include' });
      if (r.ok) { toast.success('Véhicule principal défini'); load(); }
    } catch (e) { toast.error('Erreur'); }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24" data-testid="manage-vehicles-page">
      <div className="bg-gradient-to-br from-[#0B1426] to-[#1E293B] text-white px-4 pt-12 pb-6 rounded-b-3xl">
        <button onClick={() => navigate(-1)} className="mb-3"><ArrowLeft size={24} /></button>
        <h1 className="text-xl font-bold">Mes véhicules</h1>
        <p className="text-xs text-gray-400 mt-1">Gérez vos véhicules enregistrés ({vehicles.length})</p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {loading && <div className="text-center text-gray-400 py-8 animate-pulse">Chargement...</div>}
        {!loading && vehicles.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <Car size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-600 font-medium">Aucun véhicule</p>
          </div>
        )}
        {vehicles.map((v) => (
          <div key={v.id} className="bg-white rounded-2xl p-4 shadow-sm" data-testid={`vehicle-${v.id}`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${v.is_primary ? 'bg-amber-100' : 'bg-gray-100'}`}>
                <Car size={20} className={v.is_primary ? 'text-amber-600' : 'text-gray-500'} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1">
                  <p className="font-bold text-gray-900">{v.brand} {v.model}</p>
                  {v.is_primary && <Star size={14} weight="fill" className="text-amber-500" />}
                </div>
                <p className="text-xs text-gray-500">{v.plate} · {v.year} · {v.color}</p>
                <p className="text-[10px] text-gray-400 capitalize">{v.vehicle_type}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              {!v.is_primary && (
                <button onClick={() => setPrimary(v.id)} className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 bg-amber-50" data-testid={`set-primary-${v.id}`}>
                  Travailler avec ce véhicule
                </button>
              )}
              <button onClick={() => { setEditing(v.id); setForm({ ...v, year: String(v.year) }); }} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 flex items-center gap-1" data-testid={`edit-${v.id}`}>
                <PencilSimple size={12} /> Modifier
              </button>
              <button onClick={() => remove(v.id)} className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 flex items-center gap-1" data-testid={`delete-${v.id}`}>
                <Trash size={12} /> Supprimer
              </button>
            </div>
          </div>
        ))}

        {/* Form */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border-2 border-dashed border-amber-200 mt-4" data-testid="vehicle-form">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900">{editing ? 'Modifier' : 'Ajouter un véhicule'}</h3>
            {editing && (
              <button onClick={() => { setEditing(null); setForm(INITIAL_FORM); }}>
                <X size={18} className="text-gray-400" />
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-3">Commencez par la <b>plaque d'immatriculation</b> (France &amp; DOM-TOM), puis complétez les informations du véhicule.</p>
          <div className="mb-2">
            <Input placeholder="Plaque d'immatriculation (ex. AB-123-CD)" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })} data-testid="form-plate" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Marque" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} data-testid="form-brand" />
            <Input placeholder="Modèle" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} data-testid="form-model" />
            <Input placeholder="Année" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} data-testid="form-year" />
            <Input placeholder="Couleur" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} data-testid="form-color" />
            <select value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })} className="border rounded-lg px-2 text-sm col-span-2" data-testid="form-type">
              <option value="economic">Eco</option>
              <option value="comfort">Confort</option>
              <option value="premium">Premium</option>
              <option value="moto">Moto</option>
              <option value="van">Van</option>
            </select>
          </div>
          <Button onClick={save} className="w-full mt-3" data-testid="save-vehicle">
            <Plus size={16} className="mr-1" /> {editing ? 'Mettre à jour' : 'Ajouter'}
          </Button>
        </div>
      </div>

      {/* Ownership claim — chassis (VIN) photo when the plate is already connected. */}
      {chassisModal && (
        <div className="fixed inset-0 z-[2000] bg-black/50 flex items-end sm:items-center justify-center p-4" data-testid="chassis-modal">
          <div className="bg-white rounded-2xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-900">Véhicule déjà enregistré</h3>
              <button onClick={() => { setChassisModal(false); setChassisPhoto(''); }} data-testid="chassis-close"><X size={18} className="text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              La plaque <b>{form.plate}</b> est déjà connectée sur un autre compte. Si ce véhicule
              vous a été <b>vendu</b>, ajoutez une <b>photo du châssis (numéro VIN)</b> pour en
              réclamer la propriété. L'autre véhicule sera alors désactivé.
            </p>
            <label className="block w-full border-2 border-dashed border-amber-300 rounded-xl p-4 text-center cursor-pointer text-amber-700 bg-amber-50 text-sm font-medium" data-testid="chassis-upload-label">
              {chassisPhoto ? '✅ Photo ajoutée — toucher pour changer' : '📷 Ajouter la photo du châssis'}
              <input type="file" accept="image/*" capture="environment" onChange={onChassisFile} className="hidden" data-testid="chassis-file-input" />
            </label>
            {chassisPhoto && <img src={chassisPhoto} alt="châssis" className="mt-3 rounded-xl max-h-40 mx-auto object-contain" />}
            <Button onClick={confirmChassis} className="w-full mt-4" data-testid="chassis-confirm-btn">
              Réclamer la propriété
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageVehiclesPage;
