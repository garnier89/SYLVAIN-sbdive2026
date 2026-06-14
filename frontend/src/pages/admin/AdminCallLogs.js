import React, { useEffect, useState, useCallback } from 'react';
import {
  Phone, ArrowClockwise, DownloadSimple, PhoneCall, PhoneX, Globe,
  Timer, CheckCircle, MagnifyingGlass, ShieldCheck,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { adminAPI } from '../../services/api';
import DateRangePicker from '../../components/admin/DateRangePicker';

const isoDay = (d) => d.toISOString().slice(0, 10);
const initialRange = () => ({
  date_from: isoDay(new Date(Date.now() - 30 * 86400000)),
  date_to: isoDay(new Date()),
});

const fmtDur = (s) => {
  const n = Math.round(Number(s || 0));
  if (!n) return '—';
  return n >= 60 ? `${Math.floor(n / 60)}min ${String(n % 60).padStart(2, '0')}s` : `${n}s`;
};
const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};

const STATUS_META = {
  connected: { label: 'Abouti', cls: 'bg-emerald-100 text-emerald-700' },
  ended: { label: 'Terminé', cls: 'bg-emerald-100 text-emerald-700' },
  relayed: { label: 'Relayé', cls: 'bg-orange-100 text-orange-700' },
  no_answer: { label: 'Sans réponse', cls: 'bg-amber-100 text-amber-700' },
  declined: { label: 'Refusé', cls: 'bg-rose-100 text-rose-700' },
  initiated: { label: 'Tenté', cls: 'bg-gray-100 text-gray-600' },
};

const KpiCard = ({ icon: Icon, label, value, accent, testid }) => (
  <div className="bg-white rounded-2xl border border-gray-100 p-4" data-testid={testid}>
    <div className={`w-9 h-9 rounded-xl ${accent} flex items-center justify-center mb-2`}>
      <Icon size={18} weight="fill" className="text-white" />
    </div>
    <p className="text-2xl font-black text-gray-900 leading-none">{value}</p>
    <p className="text-xs text-gray-500 mt-1">{label}</p>
  </div>
);

const FILTERS = [
  ['', 'Tous'], ['webrtc', 'In-app (WebRTC)'], ['relay', 'Relais téléphone'],
];

const AdminCallLogs = () => {
  const [range, setRange] = useState(initialRange);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState('');

  const load = useCallback((r, ch) => {
    setLoading(true);
    adminAPI.callLogs({ ...r, channel: ch || undefined })
      .then((res) => setData(res.data))
      .catch(() => toast.error('Chargement impossible'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(range, channel); }, [range, channel, load]);

  const calls = (data?.calls || []).filter((c) =>
    !q || (c.caller_name || '').toLowerCase().includes(q.toLowerCase())
    || (c.counterpart_name || '').toLowerCase().includes(q.toLowerCase())
    || (c.ride_id || '').includes(q));
  const k = data?.kpis || {};

  const exportCsv = () => {
    const head = ['Date', 'Appelant', 'Rôle', 'Correspondant', 'Canal', 'Statut', 'Durée (s)', 'Course'];
    const lines = calls.map((c) => [
      c.created_at, c.caller_name, c.caller_role, c.counterpart_name,
      c.channel, c.status, c.duration_seconds || 0, c.ride_id,
    ]);
    const csv = [head, ...lines].map((r) => r.join(';')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `journal-appels-${range.date_from}_${range.date_to}.csv`;
    a.click();
  };

  return (
    <div className="p-6 max-w-6xl" data-testid="admin-call-logs">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <PhoneCall size={22} className="text-indigo-600" weight="fill" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Journal des appels</h1>
            <p className="text-sm text-gray-500 flex items-center gap-1.5">
              <ShieldCheck size={14} weight="fill" className="text-emerald-500" />
              Appels masqués — canal WebRTC vs relais Twilio, statut & durée. Aucun numéro réel exposé.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} data-testid="calls-export" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700">
            <DownloadSimple size={16} weight="bold" /> CSV
          </button>
          <button onClick={() => load(range, channel)} data-testid="calls-refresh" className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
            <ArrowClockwise size={18} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <DateRangePicker value={range} onChange={setRange} accent="indigo" testid="calls-range" />
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {FILTERS.map(([val, lbl]) => (
            <button key={val} onClick={() => setChannel(val)} data-testid={`calls-filter-${val || 'all'}`}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${channel === val ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="calls-search" placeholder="Nom ou n° de course…"
            className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
            <KpiCard icon={Phone} label="Appels" value={k.total ?? 0} accent="bg-indigo-500" testid="kpi-total" />
            <KpiCard icon={Globe} label="In-app WebRTC" value={k.webrtc ?? 0} accent="bg-sky-500" testid="kpi-webrtc" />
            <KpiCard icon={PhoneCall} label="Relais tél." value={k.relay ?? 0} accent="bg-orange-500" testid="kpi-relay" />
            <KpiCard icon={CheckCircle} label="Aboutis" value={k.connected ?? 0} accent="bg-emerald-500" testid="kpi-connected" />
            <KpiCard icon={PhoneX} label="Manqués" value={k.missed ?? 0} accent="bg-rose-500" testid="kpi-missed" />
            <KpiCard icon={Timer} label="Durée moy." value={fmtDur(k.avg_duration)} accent="bg-violet-500" testid="kpi-avg" />
            <KpiCard icon={CheckCircle} label="Taux réponse" value={`${k.answer_rate ?? 0}%`} accent="bg-teal-500" testid="kpi-rate" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 overflow-x-auto" data-testid="calls-table">
            {calls.length === 0 ? <p className="text-sm text-gray-400">Aucun appel sur la période.</p> : (
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-100">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Appelant</th>
                    <th className="py-2 pr-3">Correspondant</th>
                    <th className="py-2 pr-3">Canal</th>
                    <th className="py-2 pr-3">Statut</th>
                    <th className="py-2 pr-3 text-right">Durée</th>
                    <th className="py-2 text-right">Course</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c, i) => {
                    const sm = STATUS_META[c.status] || STATUS_META.initiated;
                    return (
                      <tr key={c.id || i} className="border-b border-gray-50 last:border-0" data-testid={`calls-row-${i}`}>
                        <td className="py-2.5 pr-3 text-gray-500">{fmtDate(c.created_at)}</td>
                        <td className="py-2.5 pr-3">
                          <p className="font-semibold text-gray-800">{c.caller_name}</p>
                          <p className="text-[11px] text-gray-400">{c.caller_role === 'driver' ? 'Chauffeur' : 'Client'}</p>
                        </td>
                        <td className="py-2.5 pr-3 text-gray-700">{c.counterpart_name}</td>
                        <td className="py-2.5 pr-3">
                          {c.channel === 'relay' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-50 text-orange-600">
                              <PhoneCall size={12} weight="fill" /> Relais
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-600">
                              <Globe size={12} weight="fill" /> WebRTC
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${sm.cls}`}>{sm.label}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-gray-600">{fmtDur(c.duration_seconds)}</td>
                        <td className="py-2.5 text-right text-[11px] text-gray-400 font-mono">{(c.ride_id || '').slice(0, 8)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            La durée n'est enregistrée que pour les appels in-app aboutis. Le relais téléphonique masque les deux numéros via Twilio.
          </p>
        </>
      )}
    </div>
  );
};

export default AdminCallLogs;
