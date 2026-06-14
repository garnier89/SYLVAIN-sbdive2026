import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X, Trash, Phone, Car } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { fleetAPI } from '../../../services/api';

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500';

const FleetDriversPage = () => {
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);

  const load = useCallback(() => {
    fleetAPI.drivers().then((r) => setDrivers(r.data.drivers || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name.trim()) { toast.error('Nom requis'); return; }
    try { await fleetAPI.addDriver(form); toast.success('Conducteur ajouté'); setForm(null); load(); } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
  };
  const remove = async (d) => {
    if (!window.confirm(`Supprimer « ${d.name} » ?`)) return;
    try { await fleetAPI.deleteDriver(d.id); toast.success('Supprimé'); load(); } catch { toast.error('Erreur'); }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="fleet-drivers-page">
      <div className="sticky top-0 z-30 bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b">
        <button onClick={() => navigate('/sb-tracking')} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-extrabold text-gray-900 flex-1">Conducteurs</h1>
        <button onClick={() => setForm({ name: '', phone: '', license_no: '' })} className="bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1" data-testid="add-driver-btn"><Plus size={14} weight="bold" /> Ajouter</button>
      </div>

      <div className="p-4 space-y-2">
        {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
          : drivers.length === 0 ? <p className="text-sm text-gray-400 text-center py-16" data-testid="no-drivers">Aucun conducteur. Ajoutez-en un.</p>
          : drivers.map((d) => (
            <div key={d.id} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm" data-testid={`driver-${d.id}`}>
              <div className="w-10 h-10 rounded-full bg-fuchsia-100 flex items-center justify-center text-fuchsia-700 font-bold shrink-0">{(d.name || '?')[0].toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-900 truncate">{d.name}</p>
                <p className="text-[11px] text-gray-400 flex items-center gap-2 flex-wrap">
                  {d.phone && <span className="flex items-center gap-0.5"><Phone size={11} /> {d.phone}</span>}
                  {d.vehicle_name ? <span className="flex items-center gap-0.5 text-emerald-600"><Car size={11} weight="fill" /> {d.vehicle_name}</span> : <span className="text-gray-300">Non assigné</span>}
                </p>
              </div>
              <button onClick={() => remove(d)} className="text-red-500" data-testid={`del-driver-${d.id}`}><Trash size={16} /></button>
            </div>
          ))}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" data-testid="driver-form">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4"><h2 className="font-bold">Nouveau conducteur</h2><button onClick={() => setForm(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button></div>
            <div className="space-y-3">
              <input className={inp} placeholder="Nom complet" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="d-name" />
              <input className={inp} placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="d-phone" />
              <input className={inp} placeholder="N° de permis" value={form.license_no} onChange={(e) => setForm({ ...form, license_no: e.target.value })} data-testid="d-license" />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setForm(null)} className="flex-1 border border-gray-300 font-bold py-2.5 rounded-lg">Annuler</button>
              <button onClick={save} className="flex-1 bg-blue-700 text-white font-bold py-2.5 rounded-lg" data-testid="save-driver-btn">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetDriversPage;
