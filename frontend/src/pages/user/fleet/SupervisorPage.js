import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, Clock, Lock } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { employeesAPI } from '../../../services/api';
import { fmtMin } from './employeeShared';
import { fmtAgo } from './fleetShared';

const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const dayLabel = (k) => { try { return DOW[new Date(k + 'T00:00:00Z').getUTCDay()]; } catch { return '?'; } };

const SupervisorPage = () => {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    employeesAPI.supervisedTeam(orgId).then((r) => setData(r.data)).catch((e) => {
      toast.error(e?.response?.data?.detail || 'Accès refusé'); navigate('/mon-espace');
    }).finally(() => setLoading(false));
  }, [orgId, navigate]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  if (loading) return <div className="min-h-screen flex justify-center items-center bg-gray-50"><div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>;

  const counts = data?.counts || {};
  const employees = data?.employees || [];
  const rows = data?.report?.rows || [];
  const dayKeys = data?.report?.day_keys || [];
  const maxMin = Math.max(60, ...rows.flatMap((r) => r.days));

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="supervisor-page">
      <div className="px-4 pt-5 pb-6 rounded-b-3xl text-white" style={{ background: 'linear-gradient(135deg,#312e81,#4338ca,#6366f1)' }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/mon-espace')} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
          <div className="flex-1 min-w-0"><h1 className="text-lg font-extrabold flex items-center gap-1.5"><Eye size={20} weight="fill" /> Supervision</h1><p className="text-[11px] text-white/70 truncate">{data?.org?.name}</p></div>
          <span className="text-[10px] font-bold bg-white/15 px-2 py-1 rounded-full flex items-center gap-1"><Lock size={11} weight="fill" /> Lecture seule</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/10 rounded-xl px-3 py-2.5 text-center"><p className="text-xl font-extrabold">{counts.present || 0}</p><p className="text-[10px] text-white/70">En service</p></div>
          <div className="bg-white/10 rounded-xl px-3 py-2.5 text-center"><p className="text-xl font-extrabold">{counts.employees || 0}</p><p className="text-[10px] text-white/70">Employés</p></div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        <div>
          <h2 className="font-bold text-gray-900 mb-2">Présence</h2>
          <div className="space-y-2">
            {employees.map((e) => (
              <div key={e.id} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm" data-testid={`sup-emp-${e.id}`}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0" style={{ background: e.color }}>{(e.name || '?')[0].toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-gray-900 truncate">{e.name} <span className="text-[10px] text-gray-400 font-normal">{e.role}</span></p>
                  <p className="text-[11px] flex items-center gap-2"><span className={`font-bold ${e.on_shift ? 'text-emerald-600' : 'text-gray-400'}`}>{e.on_shift ? 'En service' : 'Hors service'}</span><span className="text-gray-400 flex items-center gap-0.5"><Clock size={11} /> {fmtMin(e.minutes_today)}</span><span className="text-gray-300">{fmtAgo(e.live?.ts)}</span></p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-bold text-gray-900 mb-2">Heures — 7 jours</h2>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.employee_id} className="bg-white rounded-2xl p-4 shadow-sm" data-testid={`sup-report-${r.employee_id}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-sm text-gray-900 truncate">{r.name}</p>
                  <p className="font-extrabold text-indigo-700 text-sm">{fmtMin(r.total_min)}</p>
                </div>
                <div className="flex items-end justify-between gap-1.5 h-16">
                  {r.days.map((m, i) => (
                    <div key={i} className="flex-1 h-full flex flex-col items-center justify-end gap-1">
                      <div className="w-full bg-indigo-500 rounded-md" style={{ height: `${m > 0 ? Math.max(6, (m / maxMin) * 100) : 0}%` }} title={fmtMin(m)} />
                      <span className="text-[9px] text-gray-400">{dayLabel(dayKeys[i])}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupervisorPage;
