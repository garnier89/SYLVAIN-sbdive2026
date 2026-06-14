import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Briefcase, Clock, CheckCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { employeesAPI } from '../../../services/api';

const EmployeeJoinPage = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(null);
  const [onShift, setOnShift] = useState(false);
  const watchId = useRef(null);

  useEffect(() => () => { if (watchId.current) navigator.geolocation.clearWatch(watchId.current); }, []);

  const join = async () => {
    const c = code.trim().toUpperCase();
    if (!c) { toast.error('Saisissez le code'); return; }
    setJoining(true);
    try { const r = await employeesAPI.join(c); setJoined(r.data); toast.success('Compte relié'); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Code invalide'); }
    finally { setJoining(false); }
  };

  const startWatch = () => {
    if (!navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition(
      (p) => { employeesAPI.ping({ lat: p.coords.latitude, lng: p.coords.longitude, speed: (p.coords.speed || 0) * 3.6 }).catch(() => {}); },
      () => {}, { enableHighAccuracy: true, maximumAge: 5000 },
    );
  };
  const togglePunch = () => {
    if (!onShift) {
      const ci = (lat, lng) => employeesAPI.clockIn(lat != null ? { lat, lng } : {}).then(() => { setOnShift(true); startWatch(); toast.success('Service démarré'); }).catch((e) => toast.error(e?.response?.data?.detail || 'Erreur'));
      if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => ci(p.coords.latitude, p.coords.longitude), () => ci());
      else ci();
    } else {
      if (watchId.current) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
      const co = (lat, lng) => employeesAPI.clockOut(lat != null ? { lat, lng } : {}).then(() => { setOnShift(false); toast('Service terminé'); }).catch(() => toast.error('Erreur'));
      if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => co(p.coords.latitude, p.coords.longitude), () => co());
      else co();
    }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="employee-join-page">
      <div className="px-4 pt-4 pb-8 rounded-b-3xl text-white" style={{ background: 'linear-gradient(135deg,#0c4a6e,#0369a1,#0ea5e9)' }}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/employes')} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
          <div className="flex-1"><h1 className="text-lg font-extrabold">Rejoindre une équipe</h1><p className="text-[11px] text-white/70">Pointez depuis votre téléphone</p></div>
        </div>
        <div className="bg-white/10 rounded-2xl p-4 flex items-center gap-3">
          <Briefcase size={28} weight="fill" />
          <p className="text-xs text-white/85">Saisissez le code d'invitation reçu de votre employeur pour relier votre compte et pointer.</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {!joined ? (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <label className="text-xs font-bold text-gray-500">Code d'invitation</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="EMP-XXXXX"
              className="w-full mt-2 border border-gray-200 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest outline-none focus:border-sky-500" data-testid="join-code-input" />
            <button onClick={join} disabled={joining} className="w-full mt-4 bg-sky-600 text-white font-bold py-3 rounded-xl disabled:opacity-60" data-testid="join-submit-btn">{joining ? '...' : 'Rejoindre'}</button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center" data-testid="join-success">
            <CheckCircle size={48} weight="fill" className="text-emerald-500 mx-auto mb-3" />
            <p className="font-bold text-gray-900">Relié à{joined.org_name ? ` « ${joined.org_name} »` : ' l\'équipe'}</p>
            <p className="text-xs text-gray-500 mt-1">Pointez votre arrivée pour démarrer votre service.</p>
            <button onClick={togglePunch} className={`w-full mt-5 flex items-center justify-center gap-2 py-3 rounded-xl font-bold ${onShift ? 'bg-red-600 text-white' : 'bg-sky-600 text-white'}`} data-testid="join-punch-toggle">
              <Clock size={18} weight="fill" /> {onShift ? 'Terminer mon service' : 'Pointer mon arrivée'}
            </button>
            <button onClick={() => navigate('/employes')} className="w-full mt-3 text-sm font-bold text-gray-500" data-testid="join-back-btn">Retour aux Employés</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeJoinPage;
