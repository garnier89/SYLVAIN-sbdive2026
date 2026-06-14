import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X, Trash, Polygon, Crosshair } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { fleetAPI } from '../../../services/api';
import FleetMap from './FleetMap';

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500';

const FleetGeofencesPage = () => {
  const navigate = useNavigate();
  const [geofences, setGeofences] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);

  const load = useCallback(() => {
    fleetAPI.geofences().then((r) => setGeofences(r.data.geofences || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
    fleetAPI.vehicles().then((r) => setVehicles(r.data.vehicles || [])).catch(() => {});
    fleetAPI.context().then((r) => { const c = r.data.fleet?.center; if (c) setForm((f) => f); }).catch(() => {});
  }, [load]);

  const openNew = () => {
    const c = vehicles.find((v) => v.live?.lat != null)?.live;
    setForm({ name: '', lat: c ? c.lat : 14.6036, lng: c ? c.lng : -61.0667, radius_m: 400, alert_on: 'both' });
  };
  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error('Géolocalisation indisponible'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setForm((f) => ({ ...f, lat: p.coords.latitude, lng: p.coords.longitude })); toast.success('Position actuelle utilisée'); },
      () => toast.error('Position refusée'),
    );
  };
  const save = async () => {
    if (!form.name.trim()) { toast.error('Nom requis'); return; }
    try { await fleetAPI.createGeofence({ ...form, lat: Number(form.lat), lng: Number(form.lng), radius_m: Number(form.radius_m) }); toast.success('Zone créée'); setForm(null); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
  };
  const remove = async (g) => {
    if (!window.confirm(`Supprimer « ${g.name} » ?`)) return;
    try { await fleetAPI.deleteGeofence(g.id); toast.success('Supprimée'); load(); } catch { toast.error('Erreur'); }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="fleet-geofences-page">
      <div className="sticky top-0 z-30 bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b">
        <button onClick={() => navigate('/sb-tracking')} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-extrabold text-gray-900 flex-1">Géo-zones</h1>
        <button onClick={openNew} className="bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1" data-testid="add-geofence-btn"><Plus size={14} weight="bold" /> Ajouter</button>
      </div>

      <div className="p-4 space-y-3">
        {geofences.length > 0 && <FleetMap vehicles={vehicles} geofences={geofences} height={220} />}
        {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
          : geofences.length === 0 ? <p className="text-sm text-gray-400 text-center py-16" data-testid="no-geofences">Aucune zone. Créez une zone pour être alerté des entrées/sorties.</p>
          : geofences.map((g) => (
            <div key={g.id} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm" data-testid={`geofence-${g.id}`}>
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0"><Polygon size={20} weight="fill" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-900 truncate">{g.name}</p>
                <p className="text-[11px] text-gray-400">Rayon {g.radius_m} m • Alerte : {g.alert_on === 'both' ? 'entrée/sortie' : g.alert_on === 'enter' ? 'entrée' : 'sortie'}</p>
              </div>
              <button onClick={() => remove(g)} className="text-red-500" data-testid={`del-geofence-${g.id}`}><Trash size={16} /></button>
            </div>
          ))}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" data-testid="geofence-form">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4"><h2 className="font-bold">Nouvelle zone</h2><button onClick={() => setForm(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button></div>
            <div className="space-y-3">
              <input className={inp} placeholder="Nom (ex. Dépôt, École...)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="g-name" />
              <div className="grid grid-cols-2 gap-3">
                <input className={inp} type="number" step="any" placeholder="Latitude" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} data-testid="g-lat" />
                <input className={inp} type="number" step="any" placeholder="Longitude" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} data-testid="g-lng" />
              </div>
              <button onClick={useMyLocation} className="w-full flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 text-xs font-bold py-2 rounded-lg" data-testid="g-mylocation"><Crosshair size={13} /> Utiliser ma position</button>
              <div className="grid grid-cols-2 gap-3">
                <input className={inp} type="number" placeholder="Rayon (m)" value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: e.target.value })} data-testid="g-radius" />
                <select className={inp} value={form.alert_on} onChange={(e) => setForm({ ...form, alert_on: e.target.value })} data-testid="g-alerton">
                  <option value="both">Entrée et sortie</option>
                  <option value="enter">Entrée seulement</option>
                  <option value="exit">Sortie seulement</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setForm(null)} className="flex-1 border border-gray-300 font-bold py-2.5 rounded-lg">Annuler</button>
              <button onClick={save} className="flex-1 bg-blue-700 text-white font-bold py-2.5 rounded-lg" data-testid="save-geofence-btn">Créer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetGeofencesPage;
