import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X, Copy, Trash, ClipboardText, ChartBar, Clock, Sparkle, UserPlus, Broadcast, BatteryHigh } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { employeesAPI } from '../../../services/api';
import EmployeesMap from './EmployeesMap';
import { fmtMin } from './employeeShared';
import { fmtAgo } from './fleetShared';

const EmployeesPage = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [onShift, setOnShift] = useState(false);
  const watchId = useRef(null);

  const load = useCallback(() => {
    employeesAPI.list().then((r) => setEmployees(r.data.employees || [])).catch(() => {}).finally(() => setLoading(false));
    employeesAPI.context().then((r) => setCtx(r.data)).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => { clearInterval(t); if (watchId.current) navigator.geolocation.clearWatch(watchId.current); };
  }, [load]);

  const center = employees.find((e) => e.live?.lat != null)?.live || ctx?.org?.center;

  const seed = async () => { try { await employeesAPI.seedDemo(); toast.success('Démo : 3 employés en service'); load(); } catch { toast.error('Erreur'); } };

  const addEmployee = async () => {
    if (!form.name.trim()) { toast.error('Nom requis'); return; }
    try { await employeesAPI.add(form); toast.success('Employé ajouté'); setForm(null); load(); } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
  };
  const removeEmployee = async (e) => { if (!window.confirm(`Retirer « ${e.name} » ?`)) return; try { await employeesAPI.remove(e.id); load(); } catch { toast.error('Erreur'); } };
  const copy = async (c) => { try { await navigator.clipboard.writeText(c); toast.success(`Code ${c} copié`); } catch { toast.error('Copie indisponible'); } };

  const startWatch = () => {
    if (!navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition(
      (p) => { employeesAPI.ping({ lat: p.coords.latitude, lng: p.coords.longitude, speed: (p.coords.speed || 0) * 3.6 }).catch(() => {}); },
      () => {}, { enableHighAccuracy: true, maximumAge: 5000 },
    );
  };
  const togglePunch = async () => {
    const ensureSelf = async () => { if (!employees.some((e) => e.is_self)) { try { await employeesAPI.add({ name: 'Moi', role: 'Moi', is_self: true }); } catch { /* noop */ } } };
    if (!onShift) {
      if (!navigator.geolocation) { toast.error('Géolocalisation indisponible'); return; }
      await ensureSelf();
      navigator.geolocation.getCurrentPosition(
        async (p) => {
          try { await employeesAPI.clockIn({ lat: p.coords.latitude, lng: p.coords.longitude }); setOnShift(true); startWatch(); toast.success('Service démarré'); load(); }
          catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
        },
        async () => { try { await employeesAPI.clockIn({}); setOnShift(true); toast.success('Service démarré'); load(); } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); } },
      );
    } else {
      if (watchId.current) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
      const done = () => { setOnShift(false); load(); };
      navigator.geolocation.getCurrentPosition(
        async (p) => { await employeesAPI.clockOut({ lat: p.coords.latitude, lng: p.coords.longitude }); toast('Service terminé'); done(); },
        async () => { await employeesAPI.clockOut({}); toast('Service terminé'); done(); },
      );
    }
  };

  const c = ctx?.counts || {};

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="employees-page">
      <div className="px-4 pt-4 pb-5 rounded-b-3xl text-white" style={{ background: 'linear-gradient(135deg,#0c4a6e,#0369a1,#0ea5e9)' }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/sb-tracking')} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
          <div className="flex-1"><h1 className="text-lg font-extrabold">Employés</h1><p className="text-[11px] text-white/70">Pointage, présence & tournées</p></div>
          <button onClick={() => navigate('/employes/rejoindre')} className="text-[11px] font-bold bg-white/15 px-2.5 py-1.5 rounded-full" data-testid="join-link">Rejoindre</button>
        </div>
        {ctx && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-white/10 rounded-xl px-2 py-2 text-center"><p className="text-lg font-extrabold">{c.present || 0}</p><p className="text-[10px] text-white/70">En service</p></div>
            <div className="bg-white/10 rounded-xl px-2 py-2 text-center"><p className="text-lg font-extrabold">{c.routes_today || 0}</p><p className="text-[10px] text-white/70">Tournées</p></div>
            <div className="bg-white/10 rounded-xl px-2 py-2 text-center"><p className="text-lg font-extrabold">{c.pending_stops || 0}</p><p className="text-[10px] text-white/70">Arrêts restants</p></div>
          </div>
        )}
        <button onClick={togglePunch} className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-extrabold ${onShift ? 'bg-red-600 text-white' : 'bg-white text-sky-700'}`} data-testid="punch-toggle">
          <Clock size={16} weight="fill" /> {onShift ? 'Terminer mon service' : 'Pointer mon arrivée'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-sky-200 border-t-sky-500 rounded-full animate-spin" /></div>
          : employees.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-gray-500" data-testid="no-employees">
              <UserPlus size={36} className="mx-auto mb-2 text-gray-300" weight="duotone" />
              <p className="text-sm">Aucun employé. Ajoutez un membre ou activez la démo.</p>
              <div className="flex gap-2 justify-center mt-4">
                <button onClick={() => setForm({ name: '', role: 'Employé', phone: '' })} className="bg-sky-600 text-white font-bold text-sm px-4 py-2 rounded-full" data-testid="add-first-employee">Ajouter</button>
                <button onClick={seed} className="border border-sky-200 text-sky-600 font-bold text-sm px-4 py-2 rounded-full flex items-center gap-1" data-testid="seed-demo-btn"><Sparkle size={13} weight="fill" /> Démo</button>
              </div>
            </div>
          ) : (
            <>
              <EmployeesMap center={center} employees={employees} height={280} />

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => navigate('/employes/tournees')} className="bg-white rounded-2xl p-3 flex items-center gap-2 shadow-sm" data-testid="routes-shortcut"><ClipboardText size={20} weight="fill" className="text-indigo-600" /><div className="text-left"><p className="font-bold text-sm">Tournées</p><p className="text-[10px] text-gray-400">{c.routes_today || 0} aujourd'hui</p></div></button>
                <button onClick={() => navigate('/employes/rapports')} className="bg-white rounded-2xl p-3 flex items-center gap-2 shadow-sm" data-testid="reports-shortcut"><ChartBar size={20} weight="fill" className="text-emerald-600" /><div className="text-left"><p className="font-bold text-sm">Rapports</p><p className="text-[10px] text-gray-400">Heures / assiduité</p></div></button>
              </div>

              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900">Mon équipe</h2>
                <button onClick={() => setForm({ name: '', role: 'Employé', phone: '' })} className="text-xs font-bold text-sky-600 flex items-center gap-1" data-testid="add-employee-btn"><Plus size={13} weight="bold" /> Ajouter</button>
              </div>
              <div className="space-y-2">
                {employees.map((e) => (
                  <div key={e.id} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm" data-testid={`employee-${e.id}`}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0" style={{ background: e.color }}>{(e.name || '?')[0].toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-gray-900 truncate">{e.name} <span className="text-[10px] text-gray-400 font-normal">{e.role}</span></p>
                      <p className="text-[11px] flex items-center gap-2">
                        <span className={`font-bold ${e.on_shift ? 'text-emerald-600' : 'text-gray-400'}`}>{e.on_shift ? 'En service' : 'Hors service'}</span>
                        <span className="text-gray-400 flex items-center gap-0.5"><Clock size={11} /> {fmtMin(e.minutes_today)}</span>
                        {e.live?.battery != null && <span className="text-gray-400 flex items-center gap-0.5"><BatteryHigh size={11} /> {Math.round(e.live.battery)}%</span>}
                        <span className="text-gray-300">{fmtAgo(e.live?.ts)}</span>
                      </p>
                      {!e.linked && !e.is_self && <button onClick={() => copy(e.invite_code)} className="text-[10px] font-mono text-sky-600 mt-0.5 flex items-center gap-1" data-testid={`code-${e.id}`}>Code : {e.invite_code} <Copy size={10} /></button>}
                    </div>
                    <button onClick={() => removeEmployee(e)} className="text-red-400" data-testid={`del-employee-${e.id}`}><Trash size={15} /></button>
                  </div>
                ))}
              </div>
            </>
          )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" data-testid="employee-form">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4"><h2 className="font-bold">Nouvel employé</h2><button onClick={() => setForm(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button></div>
            <div className="space-y-3">
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-500" placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="e-name" />
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-500" placeholder="Poste (ex. Livreur, Technicien...)" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="e-role" />
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-500" placeholder="Téléphone (optionnel)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="e-phone" />
              <p className="text-[11px] text-gray-400">Un code d'invitation sera généré : l'employé le saisit dans « Rejoindre » pour pointer depuis son téléphone.</p>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setForm(null)} className="flex-1 border border-gray-300 font-bold py-2.5 rounded-lg">Annuler</button>
              <button onClick={addEmployee} className="flex-1 bg-sky-600 text-white font-bold py-2.5 rounded-lg" data-testid="save-employee-btn">Ajouter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeesPage;
