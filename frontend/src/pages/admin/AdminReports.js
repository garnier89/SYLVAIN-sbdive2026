import React, { useEffect, useState, useCallback } from 'react';
import { adminAPI } from '../../services/api';
import { toast } from 'sonner';
import { exportCSV, exportPDF } from '../../lib/exportUtils';
import { ChartBar, CreditCard, Warning, Prohibit, Files, DownloadSimple, FilePdf } from '@phosphor-icons/react';

const REPORTS = [
  { key: 'results', label: 'Rapport sur les résultats', icon: ChartBar },
  { key: 'payments', label: 'Rapport de paiement', icon: CreditCard },
  { key: 'exceptional', label: 'Rapport exceptionnel', icon: Warning },
  { key: 'refused-cancelled', label: 'Alertes refusées / annulées', icon: Prohibit },
  { key: 'other', label: 'Autres rapports', icon: Files },
];

const iso = (d) => d.toISOString().slice(0, 10);
const PRESETS = [
  { key: 'today', label: "Aujourd'hui", days: 0 },
  { key: '7d', label: '7 jours', days: 7 },
  { key: '30d', label: '30 jours', days: 30 },
  { key: '90d', label: '90 jours', days: 90 },
];

const AdminReports = () => {
  const [kind, setKind] = useState('results');
  const [preset, setPreset] = useState('30d');
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const applyPreset = (p) => {
    setPreset(p.key);
    setTo(iso(new Date()));
    setFrom(iso(new Date(Date.now() - p.days * 864e5)));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await adminAPI.report(kind, { date_from: from, date_to: to })).data); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Échec du chargement du rapport'); }
    finally { setLoading(false); }
  }, [kind, from, to]);

  useEffect(() => { load(); }, [load]);

  const current = REPORTS.find((r) => r.key === kind);
  const doExport = (type) => {
    if (!data?.rows?.length) { toast.error('Aucune donnée à exporter'); return; }
    const title = `${current.label} (${from} → ${to})`;
    if (type === 'csv') exportCSV(`${kind}-${from}_${to}.csv`, data.columns, data.rows);
    else exportPDF(title, data.columns, data.rows);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="admin-reports-page">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-800">Rapports</h1>
        <p className="text-sm text-gray-500 mt-1">Analyses financières et opérationnelles, filtrables par période et exportables.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left nav */}
        <div className="lg:w-64 shrink-0 space-y-1">
          {REPORTS.map((r) => (
            <button key={r.key} onClick={() => setKind(r.key)} data-testid={`report-nav-${r.key}`}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-left ${kind === r.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <r.icon size={17} weight={kind === r.key ? 'fill' : 'regular'} /> {r.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button key={p.key} onClick={() => applyPreset(p)} data-testid={`preset-${p.key}`}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${preset === p.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{p.label}</button>
            ))}
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(''); }} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" data-testid="report-date-from" />
            <span className="text-gray-400 text-sm">→</span>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset(''); }} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" data-testid="report-date-to" />
            <div className="ml-auto flex gap-2">
              <button onClick={() => doExport('csv')} className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50" data-testid="report-export-csv"><DownloadSimple size={15} /> CSV</button>
              <button onClick={() => doExport('pdf')} className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50" data-testid="report-export-pdf"><FilePdf size={15} /> PDF</button>
            </div>
          </div>

          {loading ? <p className="text-sm text-gray-400 py-10 text-center">Chargement…</p> : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {(data?.kpis || []).map((k, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 p-4" data-testid={`report-kpi-${i}`}>
                    <p className="text-xs text-gray-500">{k.label}</p>
                    <p className="text-xl font-bold mt-0.5" style={{ color: k.color || '#111827' }}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Table */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {(data?.rows || []).length === 0 ? (
                  <p className="p-8 text-center text-sm text-gray-400" data-testid="report-empty">Aucune donnée sur cette période.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                        <tr>{(data.columns || []).map((c) => <th key={c.key} className="text-left p-3">{c.label}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {data.rows.map((row, ri) => (
                          <tr key={ri} className="hover:bg-gray-50" data-testid={`report-row-${ri}`}>
                            {data.columns.map((c) => <td key={c.key} className="p-3 text-gray-700">{row[c.key] != null ? String(row[c.key]) : '—'}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminReports;
