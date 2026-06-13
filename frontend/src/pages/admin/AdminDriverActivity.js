import React, { useEffect, useState, useCallback } from 'react';
import {
  ChartLineUp, ArrowClockwise, DownloadSimple, Clock, CheckCircle,
  XCircle, ThumbsDown, ArrowsClockwise, CurrencyEur, MagnifyingGlass,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { adminAPI } from '../../services/api';

const money = (n) => `${Number(n || 0).toFixed(2)} €`;
const hm = (min) => {
  const m = Math.round(Number(min || 0));
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}min`;
};
const PRESETS = [
  { key: '7d', label: '7 jours' },
  { key: '30d', label: '30 jours' },
  { key: '90d', label: '90 jours' },
];
const isoDay = (d) => d.toISOString().slice(0, 10);
const rangeFor = (p) => {
  const days = { '7d': 7, '30d': 30, '90d': 90 }[p] || 30;
  return { date_from: isoDay(new Date(Date.now() - days * 86400000)), date_to: isoDay(new Date()) };
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

const COLS = [
  ['name', 'Chauffeur'], ['online', 'En ligne'], ['received', 'Reçues'],
  ['accepted', 'Acceptées'], ['refused', 'Refusées'], ['completed', 'Terminées'],
  ['cancelled', 'Annulées'], ['scheduled_accepted', 'Planif. acc.'],
  ['released', 'Relâchées'], ['acceptance_rate', 'Taux acc.'], ['revenue', 'CA'],
];

const AdminDriverActivity = () => {
  const [preset, setPreset] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = useCallback((p) => {
    setLoading(true);
    adminAPI.driverActivity(rangeFor(p)).then((r) => setData(r.data)).catch(() => toast.error('Chargement impossible')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(preset); }, [preset, load]);

  const rows = (data?.drivers || []).filter((d) =>
    !q || d.name.toLowerCase().includes(q.toLowerCase()) || (d.phone || '').includes(q));
  const t = data?.totals || {};

  const exportCsv = () => {
    const head = ['Chauffeur', 'Téléphone', 'Minutes en ligne', 'Reçues', 'Acceptées', 'Refusées', 'Terminées', 'Annulées', 'Planif. acceptées', 'Relâchées', 'Taux acceptation %', 'CA'];
    const lines = rows.map((d) => [d.name, d.phone, d.online_minutes, d.received, d.accepted, d.refused, d.completed, d.cancelled, d.scheduled_accepted, d.released, d.acceptance_rate ?? '', d.revenue]);
    const csv = [head, ...lines].map((r) => r.join(';')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `activite-chauffeurs-${preset}.csv`;
    a.click();
  };

  return (
    <div className="p-6 max-w-6xl" data-testid="admin-driver-activity">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
            <ChartLineUp size={22} className="text-sky-600" weight="fill" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Activité des chauffeurs</h1>
            <p className="text-sm text-gray-500">Temps en ligne · commandes reçues·acceptées·refusées · réservations relâchées · CA</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} data-testid="activity-export" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700">
            <DownloadSimple size={16} weight="bold" /> CSV
          </button>
          <button onClick={() => load(preset)} data-testid="activity-refresh" className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
            <ArrowClockwise size={18} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => setPreset(p.key)} data-testid={`activity-preset-${p.key}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${preset === p.key ? 'bg-sky-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {p.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="activity-search" placeholder="Rechercher un chauffeur…"
            className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-sky-200" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-sky-200 border-t-sky-500 rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
            <KpiCard icon={Clock} label="Heures en ligne" value={`${t.online_hours ?? 0}h`} accent="bg-indigo-500" testid="kpi-online" />
            <KpiCard icon={CheckCircle} label="Acceptées" value={t.accepted ?? 0} accent="bg-emerald-500" testid="kpi-accepted" />
            <KpiCard icon={ThumbsDown} label="Refusées" value={t.refused ?? 0} accent="bg-amber-500" testid="kpi-refused" />
            <KpiCard icon={CheckCircle} label="Terminées" value={t.completed ?? 0} accent="bg-green-600" testid="kpi-completed" />
            <KpiCard icon={XCircle} label="Annulées" value={t.cancelled ?? 0} accent="bg-rose-500" testid="kpi-cancelled" />
            <KpiCard icon={ArrowsClockwise} label="Relâchées" value={t.released ?? 0} accent="bg-orange-500" testid="kpi-released" />
            <KpiCard icon={CurrencyEur} label="CA généré" value={money(t.revenue)} accent="bg-violet-500" testid="kpi-revenue" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 overflow-x-auto" data-testid="activity-table">
            {rows.length === 0 ? <p className="text-sm text-gray-400">Aucune activité sur la période.</p> : (
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-100">
                    {COLS.map(([k, l]) => (
                      <th key={k} className={`py-2 pr-3 ${k === 'name' ? '' : 'text-right'}`}>{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d, i) => (
                    <tr key={d.driver_id} className="border-b border-gray-50 last:border-0" data-testid={`activity-row-${i}`}>
                      <td className="py-2.5 pr-3">
                        <p className="font-semibold text-gray-800">{d.name}</p>
                        <p className="text-[11px] text-gray-400">{d.phone}</p>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-gray-600">{hm(d.online_minutes)}</td>
                      <td className="py-2.5 pr-3 text-right text-gray-600">{d.received}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-emerald-600">{d.accepted}</td>
                      <td className="py-2.5 pr-3 text-right text-amber-600">{d.refused}</td>
                      <td className="py-2.5 pr-3 text-right text-gray-700">{d.completed}</td>
                      <td className="py-2.5 pr-3 text-right text-rose-500">{d.cancelled}</td>
                      <td className="py-2.5 pr-3 text-right text-gray-600">{d.scheduled_accepted}</td>
                      <td className={`py-2.5 pr-3 text-right font-semibold ${d.released ? 'text-orange-600' : 'text-gray-400'}`}>{d.released}</td>
                      <td className="py-2.5 pr-3 text-right text-gray-600">{d.acceptance_rate != null ? `${d.acceptance_rate}%` : '—'}</td>
                      <td className="py-2.5 text-right font-bold text-violet-600">{money(d.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-3">Le temps en ligne est comptabilisé depuis l'activation du suivi (les sessions s'accumulent à partir de maintenant).</p>
        </>
      )}
    </div>
  );
};

export default AdminDriverActivity;
