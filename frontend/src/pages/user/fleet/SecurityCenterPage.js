import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Warning, Siren, BellRinging, Gauge, CaretRight } from '@phosphor-icons/react';
import { securityAPI } from '../../../services/api';
import { fmtAgo } from './fleetShared';

const SEV_META = {
  critical: { label: 'Critique', dot: 'bg-red-500', chip: 'bg-red-50 text-red-700', ring: 'ring-red-100' },
  warning: { label: 'Alerte', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700', ring: 'ring-amber-100' },
  info: { label: 'Info', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700', ring: 'ring-sky-100' },
};
const scoreColor = (s) => (s >= 90 ? '#10b981' : s >= 75 ? '#84cc16' : s >= 60 ? '#f59e0b' : '#ef4444');
const gradeColor = (g) => ({ A: 'text-emerald-600', B: 'text-lime-600', C: 'text-amber-600', D: 'text-red-600' }[g] || 'text-gray-500');

const Gaugue = ({ score }) => {
  const s = score == null ? 0 : score;
  const col = score == null ? '#94a3b8' : scoreColor(s);
  const deg = (s / 100) * 360;
  return (
    <div className="relative w-28 h-28 mx-auto" data-testid="security-gauge">
      <div className="w-full h-full rounded-full" style={{ background: `conic-gradient(${col} ${deg}deg, rgba(255,255,255,0.18) ${deg}deg)` }} />
      <div className="absolute inset-[10px] rounded-full bg-[#0c1b33] flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold text-white">{score == null ? '—' : s}</span>
        <span className="text-[10px] text-white/60">/ 100</span>
      </div>
    </div>
  );
};

const SecurityCenterPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = useCallback(() => { securityAPI.overview().then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const counts = data?.counts || {};
  const events = (data?.events || []).filter((e) => filter === 'all' || e.severity === filter);
  const scores = data?.driving_scores || [];

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="security-center-page">
      <div className="px-4 pt-5 pb-8 rounded-b-3xl text-white" style={{ background: 'linear-gradient(135deg,#0f172a,#7f1d1d,#b91c1c)' }}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/sb-tracking')} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
          <div className="flex-1 min-w-0"><h1 className="text-lg font-extrabold flex items-center gap-1.5"><ShieldCheck size={20} weight="fill" /> Centre de sécurité</h1><p className="text-[11px] text-white/70">Vue unifiée des risques & score de conduite</p></div>
        </div>
        <Gaugue score={data?.security_score} />
        <p className="text-center text-[11px] text-white/70 mt-2">Score de sécurité de la flotte</p>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <button onClick={() => setFilter('critical')} className="bg-white/10 rounded-xl px-2 py-2 text-center" data-testid="stat-critical"><p className="text-lg font-extrabold text-red-300">{counts.critical || 0}</p><p className="text-[10px] text-white/70">Critiques</p></button>
          <button onClick={() => setFilter('warning')} className="bg-white/10 rounded-xl px-2 py-2 text-center" data-testid="stat-warning"><p className="text-lg font-extrabold text-amber-300">{counts.warning || 0}</p><p className="text-[10px] text-white/70">Alertes</p></button>
          <button onClick={() => setFilter('info')} className="bg-white/10 rounded-xl px-2 py-2 text-center" data-testid="stat-info"><p className="text-lg font-extrabold text-sky-300">{counts.info || 0}</p><p className="text-[10px] text-white/70">Infos</p></button>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" /></div> : (
          <>
            {scores.length > 0 && (
              <div>
                <h2 className="font-bold text-gray-900 mb-2 flex items-center gap-1.5"><Gauge size={18} weight="fill" className="text-sky-600" /> Score de conduite</h2>
                <div className="space-y-2">
                  {scores.map((s) => (
                    <div key={s.vehicle_id} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm" data-testid={`score-${s.vehicle_id}`}>
                      <div className="w-11 h-11 rounded-full flex items-center justify-center font-extrabold text-white shrink-0" style={{ background: scoreColor(s.score) }}>{s.score}</div>
                      <div className="flex-1 min-w-0"><p className="font-bold text-sm text-gray-900 truncate">{s.name}</p><p className="text-[11px] text-gray-400">{s.events} évènement(s) de risque</p></div>
                      <span className={`text-xl font-extrabold ${gradeColor(s.grade)}`}>{s.grade}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-gray-900 flex items-center gap-1.5"><BellRinging size={18} weight="fill" className="text-rose-600" /> Évènements de sécurité</h2>
                {filter !== 'all' && <button onClick={() => setFilter('all')} className="text-xs font-bold text-sky-600" data-testid="clear-filter">Tout voir</button>}
              </div>
              <div className="space-y-2">
                {events.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 text-center text-gray-400" data-testid="no-events">
                    <ShieldCheck size={36} className="mx-auto mb-2 text-emerald-300" weight="duotone" />
                    <p className="text-sm">Aucun évènement de sécurité. Tout est calme.</p>
                  </div>
                ) : events.map((e) => {
                  const m = SEV_META[e.severity] || SEV_META.info;
                  return (
                    <div key={e.id} className={`bg-white rounded-2xl p-3 flex items-start gap-3 shadow-sm ${!e.read ? `ring-2 ${m.ring}` : ''}`} data-testid={`event-${e.id}`}>
                      <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${m.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m.chip}`}>{e.label}</span>
                          <span className="text-[10px] text-gray-300 uppercase">{e.source === 'family' ? 'Famille' : 'Flotte'}</span>
                        </div>
                        <p className="text-sm text-gray-800 leading-snug mt-0.5">{e.message}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{e.subject ? `${e.subject} • ` : ''}{fmtAgo(e.ts)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => navigate('/sb-tracking/alertes')} className="bg-white rounded-2xl p-3 flex items-center justify-between shadow-sm" data-testid="go-fleet-alerts"><span className="font-bold text-sm flex items-center gap-2"><Warning size={18} weight="fill" className="text-amber-500" /> Alertes flotte</span><CaretRight size={16} className="text-gray-300" /></button>
              <button onClick={() => navigate('/famille/alertes')} className="bg-white rounded-2xl p-3 flex items-center justify-between shadow-sm" data-testid="go-family-alerts"><span className="font-bold text-sm flex items-center gap-2"><Siren size={18} weight="fill" className="text-rose-500" /> Alertes famille</span><CaretRight size={16} className="text-gray-300" /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SecurityCenterPage;
