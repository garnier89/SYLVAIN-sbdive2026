import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BellRinging, Siren, MapPin, Check } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { familyAPI } from '../../../services/api';
import { fmtAgo } from './fleetShared';

const TYPE_META = {
  sos: { label: 'SOS', color: 'text-red-700', bg: 'bg-red-50', Icon: Siren },
  place: { label: 'Lieu', color: 'text-emerald-600', bg: 'bg-emerald-50', Icon: MapPin },
};
const typeMeta = (t) => TYPE_META[t] || { label: 'Alerte', color: 'text-gray-600', bg: 'bg-gray-50', Icon: BellRinging };

const FamilyAlertsPage = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    familyAPI.alerts().then((r) => setAlerts(r.data.alerts || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const readAll = async () => { try { await familyAPI.readAllAlerts(); load(); toast.success('Toutes lues'); } catch { toast.error('Erreur'); } };
  const read = async (a) => { if (a.read) return; try { await familyAPI.readAlert(a.id); load(); } catch { /* noop */ } };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="family-alerts-page">
      <div className="sticky top-0 z-30 bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b">
        <button onClick={() => navigate('/famille')} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-extrabold text-gray-900 flex-1">Alertes famille</h1>
        {alerts.some((a) => !a.read) && <button onClick={readAll} className="text-xs font-bold text-pink-600" data-testid="read-all-btn">Tout marquer lu</button>}
      </div>

      <div className="p-4 space-y-2">
        {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin" /></div>
          : alerts.length === 0 ? (
            <div className="text-center text-gray-400 py-20" data-testid="no-alerts"><BellRinging size={40} className="mx-auto mb-2 text-gray-300" weight="duotone" /><p className="text-sm">Aucune alerte</p></div>
          ) : alerts.map((a) => {
            const m = typeMeta(a.type);
            return (
              <button key={a.id} onClick={() => read(a)} className={`w-full text-left rounded-2xl p-3 flex items-start gap-3 ${a.read ? 'bg-white' : 'bg-white ring-2 ring-pink-100'}`} data-testid={`alert-${a.id}`}>
                <div className={`w-9 h-9 rounded-xl ${m.bg} flex items-center justify-center shrink-0`}><m.Icon size={18} weight="fill" className={m.color} /></div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold ${m.color}`}>{m.label}</p>
                  <p className="text-sm text-gray-800 leading-snug">{a.message}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{fmtAgo(a.ts)}</p>
                </div>
                {!a.read && <span className="w-2 h-2 rounded-full bg-pink-500 mt-1" />}
                {a.read && <Check size={14} className="text-gray-300 mt-1" />}
              </button>
            );
          })}
      </div>
    </div>
  );
};

export default FamilyAlertsPage;
