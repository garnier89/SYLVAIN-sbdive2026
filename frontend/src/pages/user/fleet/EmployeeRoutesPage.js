import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X, Trash, MapPin, CheckCircle, Circle, Crosshair, CaretDown, CaretUp } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { employeesAPI } from '../../../services/api';

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-500';

const EmployeeRoutesPage = () => {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState({});
  const [form, setForm] = useState(null);

  const load = useCallback(() => {
    employeesAPI.routes().then((r) => setRoutes(r.data.routes || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); employeesAPI.list().then((r) => setEmployees(r.data.employees || [])).catch(() => {}); }, [load]);

  const openNew = () => setForm({ name: '', employee_id: '', stops: [{ name: '', address: '', lat: '', lng: '' }] });
  const addStop = () => setForm((f) => ({ ...f, stops: [...f.stops, { name: '', address: '', lat: '', lng: '' }] }));
  const setStop = (i, k, v) => setForm((f) => ({ ...f, stops: f.stops.map((s, idx) => idx === i ? { ...s, [k]: v } : s) }));
  const rmStop = (i) => setForm((f) => ({ ...f, stops: f.stops.filter((_, idx) => idx !== i) }));
  const pickLoc = (i) => { if (!navigator.geolocation) { toast.error('Géoloc indisponible'); return; } navigator.geolocation.getCurrentPosition((p) => { setStop(i, 'lat', p.coords.latitude); setStop(i, 'lng', p.coords.longitude); toast.success('Position ajoutée'); }, () => toast.error('Refusé')); };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Nom de tournée requis'); return; }
    const stops = form.stops.filter((s) => s.name.trim());
    if (!stops.length) { toast.error('Au moins un arrêt'); return; }
    try { await employeesAPI.createRoute({ name: form.name, employee_id: form.employee_id || null, stops }); toast.success('Tournée créée'); setForm(null); load(); } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
  };
  const toggle = async (r, s) => { try { const res = await employeesAPI.toggleStop(r.id, s.id); setRoutes((rs) => rs.map((x) => x.id === r.id ? { ...x, stops: res.data.stops, done_count: res.data.stops.filter((y) => y.done).length } : x)); } catch { toast.error('Erreur'); } };
  const remove = async (r) => { if (!window.confirm(`Supprimer « ${r.name} » ?`)) return; try { await employeesAPI.deleteRoute(r.id); load(); } catch { toast.error('Erreur'); } };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="employee-routes-page">
      <div className="sticky top-0 z-30 bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b">
        <button onClick={() => navigate('/employes')} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-extrabold text-gray-900 flex-1">Tournées</h1>
        <button onClick={openNew} className="bg-sky-600 text-white text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1" data-testid="add-route-btn"><Plus size={14} weight="bold" /> Nouvelle</button>
      </div>

      <div className="p-4 space-y-3">
        {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-sky-200 border-t-sky-500 rounded-full animate-spin" /></div>
          : routes.length === 0 ? <p className="text-sm text-gray-400 text-center py-16" data-testid="no-routes">Aucune tournée. Créez-en une avec des arrêts assignés à un employé.</p>
          : routes.map((r) => {
            const isOpen = open[r.id];
            return (
              <div key={r.id} className="bg-white rounded-2xl shadow-sm overflow-hidden" data-testid={`route-${r.id}`}>
                <button onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} className="w-full p-3 flex items-center gap-3 text-left">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0"><MapPin size={20} weight="fill" className="text-indigo-600" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900 truncate">{r.name}</p>
                    <p className="text-[11px] text-gray-400">{r.employee_name || 'Non assignée'} • {r.done_count}/{r.total_count} arrêts</p>
                  </div>
                  {isOpen ? <CaretUp size={16} className="text-gray-400" /> : <CaretDown size={16} className="text-gray-400" />}
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 space-y-1.5">
                    {(r.stops || []).map((s) => (
                      <button key={s.id} onClick={() => toggle(r, s)} className="w-full flex items-center gap-2 text-left py-1.5" data-testid={`stop-${s.id}`}>
                        {s.done ? <CheckCircle size={20} weight="fill" className="text-emerald-500 shrink-0" /> : <Circle size={20} className="text-gray-300 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${s.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{s.name}</p>
                          {s.address && <p className="text-[10px] text-gray-400">{s.address}</p>}
                        </div>
                      </button>
                    ))}
                    <button onClick={() => remove(r)} className="text-[11px] font-bold text-red-500 flex items-center gap-1 mt-2" data-testid={`del-route-${r.id}`}><Trash size={12} /> Supprimer la tournée</button>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" data-testid="route-form">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><h2 className="font-bold">Nouvelle tournée</h2><button onClick={() => setForm(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button></div>
            <div className="space-y-3">
              <input className={inp} placeholder="Nom de la tournée" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="r-name" />
              <select className={inp} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} data-testid="r-employee">
                <option value="">Assigner à… (optionnel)</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.role}</option>)}
              </select>
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-500">Arrêts</p>
                {form.stops.map((s, i) => (
                  <div key={i} className="border border-gray-100 rounded-xl p-2 space-y-2" data-testid={`stop-input-${i}`}>
                    <div className="flex gap-2">
                      <input className={inp} placeholder={`Arrêt ${i + 1}`} value={s.name} onChange={(e) => setStop(i, 'name', e.target.value)} data-testid={`r-stop-name-${i}`} />
                      {form.stops.length > 1 && <button onClick={() => rmStop(i)} className="w-9 shrink-0 text-red-400 flex items-center justify-center"><Trash size={15} /></button>}
                    </div>
                    <input className={inp} placeholder="Adresse (optionnel)" value={s.address} onChange={(e) => setStop(i, 'address', e.target.value)} />
                    <button onClick={() => pickLoc(i)} className="w-full flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 text-[11px] font-bold py-1.5 rounded-lg"><Crosshair size={12} /> {s.lat ? 'Position ajoutée ✓' : 'Ajouter ma position'}</button>
                  </div>
                ))}
                <button onClick={addStop} className="w-full text-sky-600 text-xs font-bold border border-dashed border-sky-300 rounded-lg py-2 flex items-center justify-center gap-1" data-testid="add-stop-btn"><Plus size={13} weight="bold" /> Ajouter un arrêt</button>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setForm(null)} className="flex-1 border border-gray-300 font-bold py-2.5 rounded-lg">Annuler</button>
              <button onClick={save} className="flex-1 bg-sky-600 text-white font-bold py-2.5 rounded-lg" data-testid="save-route-btn">Créer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeRoutesPage;
