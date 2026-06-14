import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle, Circle, MapPin, Briefcase, Eye, UserPlus, CaretDown, CaretUp } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { employeesAPI } from '../../../services/api';
import { fmtMin } from './employeeShared';

const EmployeeSpacePage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onShift, setOnShift] = useState(false);
  const [open, setOpen] = useState({});
  const watchId = useRef(null);

  const load = useCallback(() => {
    employeesAPI.memberships().then((r) => {
      setData(r.data);
      setOnShift((r.data.memberships || []).some((m) => m.on_shift));
    }).catch(() => {}).finally(() => setLoading(false));
    employeesAPI.myRoutes().then((r) => setRoutes(r.data.routes || [])).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => { clearInterval(t); if (watchId.current) navigator.geolocation.clearWatch(watchId.current); };
  }, [load]);

  const startWatch = () => {
    if (!navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition(
      (p) => { employeesAPI.ping({ lat: p.coords.latitude, lng: p.coords.longitude, speed: (p.coords.speed || 0) * 3.6 }).catch(() => {}); },
      () => {}, { enableHighAccuracy: true, maximumAge: 5000 },
    );
  };
  const togglePunch = () => {
    if (!onShift) {
      const ci = (lat, lng) => employeesAPI.clockIn(lat != null ? { lat, lng } : {}).then(() => { setOnShift(true); startWatch(); toast.success('Service démarré'); load(); }).catch((e) => toast.error(e?.response?.data?.detail || 'Erreur'));
      if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => ci(p.coords.latitude, p.coords.longitude), () => ci());
      else ci();
    } else {
      if (watchId.current) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
      const co = (lat, lng) => employeesAPI.clockOut(lat != null ? { lat, lng } : {}).then(() => { setOnShift(false); toast('Service terminé'); load(); }).catch(() => toast.error('Erreur'));
      if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => co(p.coords.latitude, p.coords.longitude), () => co());
      else co();
    }
  };

  const toggleStop = async (r, s) => {
    try { const res = await employeesAPI.toggleMyStop(r.id, s.id); setRoutes((rs) => rs.map((x) => x.id === r.id ? { ...x, stops: res.data.stops, done_count: res.data.stops.filter((y) => y.done).length } : x)); }
    catch { toast.error('Erreur'); }
  };

  const memberships = data?.memberships || [];
  const totalToday = memberships.reduce((a, m) => a + (m.minutes_today || 0), 0);
  const totalWeek = memberships.reduce((a, m) => a + (m.minutes_week || 0), 0);
  const supervisedOrgs = memberships.filter((m) => m.member_role === 'supervisor');

  if (loading) return <div className="min-h-screen flex justify-center items-center bg-gray-50"><div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" /></div>;

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="employee-space-page">
      <div className="px-4 pt-5 pb-6 rounded-b-3xl text-white" style={{ background: 'linear-gradient(135deg,#0c4a6e,#0369a1,#0ea5e9)' }}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/sb-tracking')} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
          <div className="flex-1 min-w-0"><h1 className="text-lg font-extrabold flex items-center gap-1.5"><Briefcase size={20} weight="fill" /> Mon espace</h1><p className="text-[11px] text-white/70">Mes heures & mes tournées</p></div>
        </div>
        {memberships.length === 0 ? null : (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-white/10 rounded-xl px-3 py-2.5 text-center"><p className="text-xl font-extrabold">{fmtMin(totalToday)}</p><p className="text-[10px] text-white/70">Aujourd'hui</p></div>
              <div className="bg-white/10 rounded-xl px-3 py-2.5 text-center"><p className="text-xl font-extrabold">{fmtMin(totalWeek)}</p><p className="text-[10px] text-white/70">Cette semaine</p></div>
            </div>
            <button onClick={togglePunch} className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-extrabold ${onShift ? 'bg-red-600 text-white' : 'bg-white text-sky-700'}`} data-testid="punch-toggle">
              <Clock size={16} weight="fill" /> {onShift ? 'Terminer mon service' : 'Pointer mon arrivée'}
            </button>
          </>
        )}
      </div>

      <div className="p-4 space-y-4">
        {memberships.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500" data-testid="no-membership">
            <UserPlus size={36} className="mx-auto mb-2 text-gray-300" weight="duotone" />
            <p className="text-sm">Vous n'avez rejoint aucune équipe.</p>
            <button onClick={() => navigate('/employes/rejoindre')} className="mt-4 bg-sky-600 text-white font-bold text-sm px-5 py-2.5 rounded-full" data-testid="join-team-btn">Rejoindre une équipe</button>
          </div>
        ) : (
          <>
            {memberships.map((m) => (
              <div key={m.slot_id} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm" data-testid={`membership-${m.slot_id}`}>
                <div className="w-10 h-10 rounded-full bg-sky-50 flex items-center justify-center shrink-0"><Briefcase size={18} weight="fill" className="text-sky-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-gray-900 truncate">{m.org_name}</p>
                  <p className="text-[11px] text-gray-400">{m.role} • {m.member_role === 'supervisor' ? 'Superviseur' : 'Employé'} • {fmtMin(m.minutes_week)} / sem</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.on_shift ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>{m.on_shift ? 'En service' : 'Hors service'}</span>
              </div>
            ))}

            {supervisedOrgs.length > 0 && (
              <div className="space-y-2">
                {supervisedOrgs.map((m) => (
                  <button key={`sup-${m.slot_id}`} onClick={() => navigate(`/superviser/${m.org_id}`)} className="w-full bg-indigo-600 text-white rounded-2xl p-3 flex items-center gap-3 shadow-sm" data-testid={`supervise-${m.org_id}`}>
                    <Eye size={20} weight="fill" />
                    <div className="flex-1 text-left"><p className="font-bold text-sm">Superviser « {m.org_name} »</p><p className="text-[10px] text-white/70">Vue équipe en lecture seule</p></div>
                  </button>
                ))}
              </div>
            )}

            <div>
              <h2 className="font-bold text-gray-900 mb-2 flex items-center gap-1.5"><MapPin size={18} weight="fill" className="text-indigo-600" /> Mes tournées</h2>
              {routes.length === 0 ? <p className="text-sm text-gray-400 text-center py-6" data-testid="no-my-routes">Aucune tournée assignée.</p>
                : <div className="space-y-2">
                  {routes.map((r) => {
                    const isOpen = open[r.id];
                    return (
                      <div key={r.id} className="bg-white rounded-2xl shadow-sm overflow-hidden" data-testid={`my-route-${r.id}`}>
                        <button onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} className="w-full p-3 flex items-center gap-3 text-left">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0"><MapPin size={20} weight="fill" className="text-indigo-600" /></div>
                          <div className="flex-1 min-w-0"><p className="font-bold text-sm text-gray-900 truncate">{r.name}</p><p className="text-[11px] text-gray-400">{r.done_count}/{r.total_count} arrêts</p></div>
                          {isOpen ? <CaretUp size={16} className="text-gray-400" /> : <CaretDown size={16} className="text-gray-400" />}
                        </button>
                        {isOpen && (
                          <div className="px-3 pb-3 space-y-1">
                            {(r.stops || []).map((s) => (
                              <button key={s.id} onClick={() => toggleStop(r, s)} className="w-full flex items-center gap-2 text-left py-1.5" data-testid={`my-stop-${s.id}`}>
                                {s.done ? <CheckCircle size={20} weight="fill" className="text-emerald-500 shrink-0" /> : <Circle size={20} className="text-gray-300 shrink-0" />}
                                <div className="flex-1 min-w-0"><p className={`text-sm ${s.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{s.name}</p>{s.address && <p className="text-[10px] text-gray-400">{s.address}</p>}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EmployeeSpacePage;
