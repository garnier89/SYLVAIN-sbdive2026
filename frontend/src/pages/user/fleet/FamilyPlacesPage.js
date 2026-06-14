import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X, Trash, House, GraduationCap, Briefcase, MapPin, Crosshair } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { familyAPI } from '../../../services/api';
import FamilyMap from './FamilyMap';

const KIND_META = {
  home: { label: 'Maison', Icon: House, color: 'text-emerald-600' },
  school: { label: 'École', Icon: GraduationCap, color: 'text-indigo-600' },
  work: { label: 'Travail', Icon: Briefcase, color: 'text-amber-600' },
  other: { label: 'Autre', Icon: MapPin, color: 'text-gray-500' },
};
const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-500';

const FamilyPlacesPage = () => {
  const navigate = useNavigate();
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);

  const load = useCallback(() => { familyAPI.places().then((r) => setPlaces(r.data.places || [])).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => familyAPI.context().then((r) => { const c = r.data.circle?.center || { lat: 14.6036, lng: -61.0667 }; setForm({ name: '', kind: 'home', lat: c.lat, lng: c.lng, radius_m: 200 }); });
  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error('Géolocalisation indisponible'); return; }
    navigator.geolocation.getCurrentPosition((p) => { setForm((f) => ({ ...f, lat: p.coords.latitude, lng: p.coords.longitude })); toast.success('Position actuelle'); }, () => toast.error('Refusé'));
  };
  const save = async () => {
    if (!form.name.trim()) { toast.error('Nom requis'); return; }
    try { await familyAPI.createPlace({ ...form, lat: Number(form.lat), lng: Number(form.lng), radius_m: Number(form.radius_m) }); toast.success('Lieu créé'); setForm(null); load(); } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
  };
  const remove = async (p) => { if (!window.confirm(`Supprimer « ${p.name} » ?`)) return; try { await familyAPI.deletePlace(p.id); load(); } catch { toast.error('Erreur'); } };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="family-places-page">
      <div className="sticky top-0 z-30 bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b">
        <button onClick={() => navigate('/famille')} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-extrabold text-gray-900 flex-1">Lieux & zones</h1>
        <button onClick={openNew} className="bg-pink-600 text-white text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1" data-testid="add-place-btn"><Plus size={14} weight="bold" /> Ajouter</button>
      </div>

      <div className="p-4 space-y-3">
        {places.length > 0 && <FamilyMap places={places} height={200} />}
        {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin" /></div>
          : places.length === 0 ? <p className="text-sm text-gray-400 text-center py-16" data-testid="no-places">Aucun lieu. Créez « Maison », « École »… pour être alerté des arrivées/départs.</p>
          : places.map((p) => { const k = KIND_META[p.kind] || KIND_META.other; return (
            <div key={p.id} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm" data-testid={`place-${p.id}`}>
              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0"><k.Icon size={20} weight="fill" className={k.color} /></div>
              <div className="flex-1 min-w-0"><p className="font-bold text-sm text-gray-900 truncate">{p.name}</p><p className="text-[11px] text-gray-400">{k.label} • rayon {p.radius_m} m</p></div>
              <button onClick={() => remove(p)} className="text-red-400" data-testid={`del-place-${p.id}`}><Trash size={16} /></button>
            </div>
          ); })}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" data-testid="place-form">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4"><h2 className="font-bold">Nouveau lieu</h2><button onClick={() => setForm(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button></div>
            <div className="space-y-3">
              <input className={inp} placeholder="Nom du lieu" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="p-name" />
              <select className={inp} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} data-testid="p-kind">
                {Object.entries(KIND_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input className={inp} type="number" step="any" placeholder="Latitude" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} data-testid="p-lat" />
                <input className={inp} type="number" step="any" placeholder="Longitude" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} data-testid="p-lng" />
              </div>
              <button onClick={useMyLocation} className="w-full flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 text-xs font-bold py-2 rounded-lg" data-testid="p-mylocation"><Crosshair size={13} /> Utiliser ma position</button>
              <input className={inp} type="number" placeholder="Rayon (m)" value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: e.target.value })} data-testid="p-radius" />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setForm(null)} className="flex-1 border border-gray-300 font-bold py-2.5 rounded-lg">Annuler</button>
              <button onClick={save} className="flex-1 bg-pink-600 text-white font-bold py-2.5 rounded-lg" data-testid="save-place-btn">Créer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilyPlacesPage;
