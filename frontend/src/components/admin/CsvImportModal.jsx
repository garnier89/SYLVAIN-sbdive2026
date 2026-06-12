import React, { useState, useRef } from 'react';
import { X, DownloadSimple, UploadSimple, CheckCircle, WarningCircle, FileCsv } from '@phosphor-icons/react';
import { toast } from 'sonner';

// Quote a CSV cell when it contains a comma, quote or newline.
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (headers, rows) =>
  [headers.join(','), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(','))].join('\n');

const downloadCsv = (filename, text) => {
  const blob = new Blob(["\uFEFF" + text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

/**
 * Reusable bulk-CSV-import modal.
 * Props:
 *  - title, label, accent ('emerald' | 'orange')
 *  - templateHeaders: string[]  (CSV column order)
 *  - templateExample: object    (one example row keyed by header)
 *  - templateName: string       (download filename for the template)
 *  - onImport: async (csvText) => { created, skipped, total, results: [{line,status,email,name,password,reason}] }
 *  - onClose, onDone
 *  - testIdPrefix
 */
export const CsvImportModal = ({
  title, label, accent = 'emerald', templateHeaders, templateExample, templateName,
  onImport, onClose, onDone, testIdPrefix = 'csv-import',
}) => {
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);
  const fileRef = useRef(null);

  const accentBtn = accent === 'orange' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-emerald-500 hover:bg-emerald-600';

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ''));
    reader.readAsText(f);
  };

  const runImport = async () => {
    if (!csvText.trim()) { toast.error('Choisissez d\'abord un fichier CSV'); return; }
    setImporting(true);
    try {
      const res = await onImport(csvText);
      setReport(res);
      if (res.created > 0) toast.success(`${res.created} compte(s) créé(s)`);
      if (res.skipped > 0) toast.warning(`${res.skipped} ligne(s) ignorée(s)`);
      if (onDone) onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de l\'import');
    } finally { setImporting(false); }
  };

  const downloadTemplate = () => {
    downloadCsv(templateName, toCsv(templateHeaders, [templateExample]));
  };

  const downloadReport = () => {
    const headers = ['line', 'status', 'email', 'name', 'password', 'reason'];
    const rows = (report?.results || []).map((r) => ({
      line: r.line, status: r.status, email: r.email || '', name: r.name || '',
      password: r.password || '', reason: r.reason || '',
    }));
    downloadCsv('rapport-import.csv', toCsv(headers, rows));
  };

  return (
    <div className="fixed inset-0 z-[2900] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid={`${testIdPrefix}-modal`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><FileCsv size={18} className="text-gray-500" />{title}</h3>
          <button onClick={onClose} className="text-gray-400" data-testid={`${testIdPrefix}-close`}><X size={22} /></button>
        </div>

        {!report ? (
          <div className="p-4 space-y-4">
            <p className="text-sm text-gray-600">{label}</p>
            <button onClick={downloadTemplate} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-3 text-sm font-semibold text-gray-600 hover:border-gray-400" data-testid={`${testIdPrefix}-template`}>
              <DownloadSimple size={16} /> Télécharger le modèle CSV
            </button>
            <div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" data-testid={`${testIdPrefix}-file`} />
              <button onClick={() => fileRef.current?.click()} className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-xl py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50" data-testid={`${testIdPrefix}-pick`}>
                <UploadSimple size={16} /> {fileName || 'Choisir un fichier CSV…'}
              </button>
            </div>
            <p className="text-[11px] text-gray-400">Les mots de passe sont générés automatiquement (sauf si une colonne « password » est fournie). Les lignes invalides sont ignorées et listées dans le rapport.</p>
            <button onClick={runImport} disabled={importing || !csvText.trim()} className={`w-full py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50 ${accentBtn}`} data-testid={`${testIdPrefix}-submit`}>
              {importing ? 'Import en cours…' : 'Importer'}
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3" data-testid={`${testIdPrefix}-report`}>
            <div className="flex gap-3">
              <div className="flex-1 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600" data-testid={`${testIdPrefix}-created-count`}>{report.created}</p>
                <p className="text-xs text-emerald-700">Créés</p>
              </div>
              <div className="flex-1 rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
                <p className="text-2xl font-bold text-amber-600" data-testid={`${testIdPrefix}-skipped-count`}>{report.skipped}</p>
                <p className="text-xs text-amber-700">Ignorés</p>
              </div>
            </div>
            <button onClick={downloadReport} className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-xl py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50" data-testid={`${testIdPrefix}-download-report`}>
              <DownloadSimple size={16} /> Télécharger le rapport (mots de passe inclus)
            </button>
            <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-100">
              {(report.results || []).map((r) => (
                <div key={r.line} className="flex items-start gap-2 p-2.5 text-xs">
                  {r.status === 'created'
                    ? <CheckCircle size={16} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" />
                    : <WarningCircle size={16} weight="fill" className="text-amber-500 shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate">L{r.line} · {r.email || '—'}</p>
                    {r.status === 'created'
                      ? <p className="text-gray-500">Mot de passe : <span className="font-mono">{r.password}</span></p>
                      : <p className="text-amber-600">{r.reason}</p>}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-gray-800 text-white font-bold text-sm" data-testid={`${testIdPrefix}-done`}>
              Terminer
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CsvImportModal;
