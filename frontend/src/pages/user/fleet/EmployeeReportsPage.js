import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChartBar, FilePdf } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { employeesAPI } from '../../../services/api';
import { fmtMin, downloadBlob } from './employeeShared';

const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const dayLabel = (key) => { try { const d = new Date(key + 'T00:00:00Z'); return DOW[d.getUTCDay()]; } catch { return '?'; } };

const EmployeeReportsPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => { employeesAPI.reports().then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);

  const exportPdf = async () => {
    setExporting(true);
    try { const res = await employeesAPI.reportPdf(); downloadBlob(res, `rapport-employes.pdf`); toast.success('PDF téléchargé'); }
    catch { toast.error('Erreur lors de l\'export'); }
    finally { setExporting(false); }
  };

  const dayKeys = data?.day_keys || [];
  const rows = data?.rows || [];
  const maxMin = Math.max(60, ...rows.flatMap((r) => r.days));

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="employee-reports-page">
      <div className="sticky top-0 z-30 bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b">
        <button onClick={() => navigate('/employes')} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-extrabold text-gray-900 flex-1">Rapports — 7 jours</h1>
        {rows.length > 0 && <button onClick={exportPdf} disabled={exporting} className="bg-sky-600 text-white text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1 disabled:opacity-60" data-testid="export-pdf-btn"><FilePdf size={14} weight="fill" /> {exporting ? '...' : 'PDF'}</button>}
      </div>

      <div className="p-4 space-y-3">
        {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-sky-200 border-t-sky-500 rounded-full animate-spin" /></div>
          : rows.length === 0 ? <div className="text-center text-gray-400 py-20" data-testid="no-reports"><ChartBar size={40} className="mx-auto mb-2 text-gray-300" weight="duotone" /><p className="text-sm">Aucune donnée. Les pointages alimentent ce rapport.</p></div>
          : rows.map((r) => (
            <div key={r.employee_id} className="bg-white rounded-2xl p-4 shadow-sm" data-testid={`report-${r.employee_id}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold shrink-0" style={{ background: r.color }}>{(r.name || '?')[0].toUpperCase()}</div>
                <div className="flex-1 min-w-0"><p className="font-bold text-sm text-gray-900 truncate">{r.name}</p><p className="text-[10px] text-gray-400">{r.role} • {r.shifts_count} service(s)</p></div>
                <div className="text-right"><p className="font-extrabold text-sky-700 text-sm" data-testid={`total-${r.employee_id}`}>{fmtMin(r.total_min)}</p><p className="text-[10px] text-gray-400">cette semaine</p></div>
              </div>
              <div className="flex items-end justify-between gap-1.5 h-24">
                {r.days.map((m, i) => (
                  <div key={i} className="flex-1 h-full flex flex-col items-center justify-end gap-1">
                    <div className="w-full bg-sky-500 rounded-md transition-all" style={{ height: `${m > 0 ? Math.max(6, (m / maxMin) * 100) : 0}%` }} title={fmtMin(m)} />
                    <span className="text-[9px] text-gray-400">{dayLabel(dayKeys[i])}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default EmployeeReportsPage;
