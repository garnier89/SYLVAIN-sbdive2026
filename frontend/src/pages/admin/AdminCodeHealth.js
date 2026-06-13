import React, { useEffect, useState, useCallback } from 'react';
import {
  Code, FileCode, Function as FunctionIcon, Plugs, TestTube, ArrowClockwise,
  Warning, ShieldCheck, Stack,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { adminAPI } from '../../services/api';

const nf = (n) => Number(n || 0).toLocaleString('fr-FR');

const LEVEL = {
  danger: { bar: 'bg-rose-500', text: 'text-rose-600', chip: 'bg-rose-50 text-rose-600' },
  warn: { bar: 'bg-amber-500', text: 'text-amber-600', chip: 'bg-amber-50 text-amber-600' },
  ok: { bar: 'bg-emerald-500', text: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-600' },
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

const AdminCodeHealth = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminAPI.codeHealth()
      .then((r) => setData(r.data))
      .catch(() => toast.error('Chargement de la santé du code impossible'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const k = data?.kpis || {};
  const maxDir = Math.max(1, ...((data?.by_directory || []).map((d) => d.lines)));
  const maxFile = Math.max(1, ...((data?.largest_files || []).map((f) => f.lines)));
  const cov = data?.coverage || {};
  const covRatio = cov.ratio ?? 0;
  const covColor = covRatio >= 70 ? 'text-emerald-600' : covRatio >= 40 ? 'text-amber-600' : 'text-rose-600';

  return (
    <div className="p-6 max-w-5xl" data-testid="admin-code-health">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Code size={22} className="text-indigo-600" weight="fill" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Santé du code</h1>
            <p className="text-sm text-gray-500">
              Métriques statiques du backend · dette technique &amp; couverture (proxy)
            </p>
          </div>
        </div>
        <button onClick={load} data-testid="code-health-refresh"
          className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
          <ArrowClockwise size={18} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" /></div>
      ) : !data ? (
        <p className="text-gray-400">Aucune donnée.</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard icon={FileCode} label="Fichiers Python" value={nf(k.py_files)} accent="bg-indigo-500" testid="kpi-files" />
            <KpiCard icon={Stack} label="Lignes de code" value={nf(k.total_lines)} accent="bg-sky-500" testid="kpi-lines" />
            <KpiCard icon={Plugs} label="Endpoints API" value={nf(k.total_endpoints)} accent="bg-violet-500" testid="kpi-endpoints" />
            <KpiCard icon={FunctionIcon} label="Fonctions" value={nf(k.total_functions)} accent="bg-teal-500" testid="kpi-functions" />
            <KpiCard icon={TestTube} label="Fichiers de tests" value={nf(k.test_files)} accent="bg-emerald-500" testid="kpi-test-files" />
            <KpiCard icon={TestTube} label="Tests (cas)" value={nf(k.test_functions)} accent="bg-green-500" testid="kpi-test-funcs" />
            <KpiCard icon={Warning} label={`Fichiers > ${data.thresholds.danger} lignes`} value={nf(k.danger_files)} accent="bg-rose-500" testid="kpi-danger" />
            <KpiCard icon={Warning} label={`Fichiers > ${data.thresholds.warn} lignes`} value={nf(k.warn_files)} accent="bg-amber-500" testid="kpi-warn" />
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* By directory */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5" data-testid="code-health-dirs">
              <h2 className="text-sm font-bold text-gray-700 mb-3">Lignes par dossier</h2>
              <div className="space-y-2.5">
                {(data.by_directory || []).map((d) => (
                  <div key={d.dir} data-testid={`dir-${d.dir}`}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-gray-700">{d.dir}/ <span className="text-gray-400 font-normal">· {d.files} fichiers · {d.endpoints} endpoints</span></span>
                      <span className="text-gray-500 font-medium">{nf(d.lines)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(d.lines / maxDir) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Coverage proxy */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5" data-testid="code-health-coverage">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-gray-700">Couverture (proxy statique)</h2>
                <ShieldCheck size={18} className={covColor} weight="fill" />
              </div>
              <div className="flex items-end gap-2 mb-2">
                <span className={`text-4xl font-black leading-none ${covColor}`}>{covRatio}%</span>
                <span className="text-xs text-gray-500 mb-1">{cov.tested}/{cov.source_modules} modules routes+core avec test</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
                <div className={`h-full rounded-full ${covRatio >= 70 ? 'bg-emerald-500' : covRatio >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${covRatio}%` }} />
              </div>
              <p className="text-xs font-semibold text-gray-500 mb-2">{cov.untested_count} modules sans test référencé :</p>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto" data-testid="coverage-untested">
                {(cov.untested || []).map((m) => (
                  <span key={m.module} className="px-2 py-0.5 rounded-md text-[11px] bg-gray-50 text-gray-600 border border-gray-100">
                    {m.module} <span className="text-gray-400">· {nf(m.lines)}</span>
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-3">Proxy : un module est « testé » si son nom est référencé dans un fichier de tests. N'équivaut pas à une couverture ligne-par-ligne.</p>
            </div>
          </div>

          {/* Largest files */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5" data-testid="code-health-largest">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Plus gros fichiers (points chauds de dette)</h2>
            <div className="space-y-2">
              {(data.largest_files || []).map((f) => {
                const lv = LEVEL[f.level] || LEVEL.ok;
                return (
                  <div key={f.path} className="flex items-center gap-3" data-testid={`file-${f.path}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-mono text-gray-700 truncate">{f.path}</span>
                        <span className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-gray-400">{f.endpoints} ep · {f.functions} fn</span>
                          <span className={`font-bold ${lv.text}`}>{nf(f.lines)}</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${lv.bar}`} style={{ width: `${(f.lines / maxFile) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-gray-400 mt-4">Généré le {new Date(data.generated_at).toLocaleString('fr-FR')}</p>
        </>
      )}
    </div>
  );
};

export default AdminCodeHealth;
