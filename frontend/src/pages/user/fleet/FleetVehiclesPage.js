import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X, Copy, Trash, CaretRight, Cpu } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { fleetAPI } from '../../../services/api';
import { VTYPE_META, vtypeMeta, statusMeta } from './fleetShared';

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500';

const FleetVehiclesPage = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);

  const load = useCallback(() => {
    fleetAPI.vehicles().then((r) => setVehicles(r.data.vehicles || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); fleetAPI.drivers().then((r) => setDrivers(r.data.drivers || [])).catch(() => {}); }, [load]);

  const openNew = () => setForm({ name: '', plate: '', vtype: 'car', driver_id: '', speed_limit: 90, sim_enabled: true });
  const openEdit = (v) => setForm({ id: v.id, name: v.name, plate: v.plate, vtype: v.vtype, driver_id: v.driver_id || '', speed_limit: v.speed_limit, sim_enabled: v.sim_enabled });

  const save = async () => {
    if (!form.name.trim()) { toast.error('Nom requis'); return; }
    const payload = { ...form, driver_id: form.driver_id || null, speed_limit: Number(form.speed_limit || 90) };
    try {
      if (form.id) await fleetAPI.updateVehicle(form.id, payload);
      else await fleetAPI.createVehicle(payload);
      toast.success('Véhicule enregistré'); setForm(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
  };
  const remove = async (v) => {
    if (!window.confirm(`Supprimer « ${v.name} » ?`)) return;
    try { await fleetAPI.deleteVehicle(v.id); toast.success('Supprimé'); load(); } catch { toast.error('Erreur'); }
  };
  const copyKey = async (k) => { try { await navigator.clipboard.writeText(k); toast.success('Clé traceur copiée'); } catch { toast.error('Copie indisponible'); } };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="fleet-vehicles-page">
      <div className="sticky top-0 z-30 bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b">
        <button onClick={() => navigate('/sb-tracking')} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-extrabold text-gray-900 flex-1">Véhicules</h1>
        <button onClick={openNew} className="bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1" data-testid="add-vehicle-btn"><Plus size={14} weight="bold" /> Ajouter</button>
      </div>

      <div className="p-4 space-y-3">
        {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
          : vehicles.length === 0 ? <p className="text-sm text-gray-400 text-center py-16" data-testid="no-vehicles">Aucun véhicule. Ajoutez-en un.</p>
          : vehicles.map((v) => {
            const VIcon = vtypeMeta(v.vtype).Icon; const sm = statusMeta(v.live?.status);
            return (
              <div key={v.id} className="bg-white rounded-2xl p-3 shadow-sm" data-testid={`vehicle-${v.id}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: sm.color + '22' }}><VIcon size={20} weight="fill" style={{ color: sm.color }} /></div>
                  <button onClick={() => navigate(`/sb-tracking/vehicules/${v.id}`)} className="flex-1 min-w-0 text-left">
                    <p className="font-bold text-sm text-gray-900 truncate">{v.name}</p>
                    <p className="text-[11px] text-gray-400">{v.plate || '—'} • {vtypeMeta(v.vtype).label} • {v.driver_name || 'Sans conducteur'}</p>
                  </button>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sm.bg} ${sm.text}`}>{sm.label}</span>
                  <CaretRight size={16} className="text-gray-300" onClick={() => navigate(`/sb-tracking/vehicules/${v.id}`)} />
                </div>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                  <button onClick={() => copyKey(v.tracker_key)} className="flex items-center gap-1 text-[11px] font-mono text-gray-500 bg-gray-50 px-2 py-1 rounded-lg" data-testid={`key-${v.id}`}><Cpu size={12} /> {v.tracker_key} <Copy size={11} /></button>
                  <div className="flex-1" />
                  <button onClick={() => openEdit(v)} className="text-xs font-bold text-blue-600" data-testid={`edit-${v.id}`}>Éditer</button>
                  <button onClick={() => remove(v)} className="text-red-500" data-testid={`del-${v.id}`}><Trash size={15} /></button>
                </div>
              </div>
            );
          })}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" data-testid="vehicle-form">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">{form.id ? 'Éditer' : 'Nouveau'} véhicule</h2>
              <button onClick={() => setForm(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <input className={inp} placeholder="Nom (ex. Camion 01)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="f-name" />
              <div className="grid grid-cols-2 gap-3">
                <input className={inp} placeholder="Immatriculation" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} data-testid="f-plate" />
                <select className={inp} value={form.vtype} onChange={(e) => setForm({ ...form, vtype: e.target.value })} data-testid="f-vtype">
                  {Object.entries(VTYPE_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select className={inp} value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })} data-testid="f-driver">
                  <option value="">Sans conducteur</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <input className={inp} type="number" placeholder="Limite km/h" value={form.speed_limit} onChange={(e) => setForm({ ...form, speed_limit: e.target.value })} data-testid="f-speed" />
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.sim_enabled} onChange={(e) => setForm({ ...form, sim_enabled: e.target.checked })} data-testid="f-sim" /> Simuler le mouvement (démo, sans traceur réel)</label>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setForm(null)} className="flex-1 border border-gray-300 font-bold py-2.5 rounded-lg">Annuler</button>
              <button onClick={save} className="flex-1 bg-blue-700 text-white font-bold py-2.5 rounded-lg" data-testid="save-vehicle-btn">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetVehiclesPage;
