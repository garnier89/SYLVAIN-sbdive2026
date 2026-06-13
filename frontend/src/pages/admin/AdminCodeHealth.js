import React, { useEffect, useState, useCallback } from 'react';
import {
  Code, FileCode, Function as FunctionIcon, Plugs, TestTube, ArrowClockwise,
  Warning, ShieldCheck, Stack, Copy, MapTrifold, Bug, FloppyDisk, Play,
  CheckCircle, XCircle, CircleNotch, ShieldWarning,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { adminAPI } from '../../services/api';

const nf = (n) => Number(n || 0).toLocaleString('fr-FR');

const LEVEL = {
  danger: { bar: 'bg-rose-500', text: 'text-rose-600' },
  warn: { bar: 'bg-amber-500', text: 'text-amber-600' },
  ok: { bar: 'bg-emerald-500', text: 'text-emerald-600' },
};
const SEV = {
  high: 'bg-rose-50 text-rose-600 border-rose-100',
  medium: 'bg-amber-50 text-amber-600 border-amber-100',
  low: 'bg-gray-50 text-gray-500 border-gray-100',
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

const Spinner = () => (
  <div className="flex justify-center py-20">
    <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
  </div>
);

/* ---------------------------------------------------------------- Métriques */
const MetricsTab = ({ data }) => {
  const k = data?.kpis || {};
  const maxDir = Math.max(1, ...((data?.by_directory || []).map((d) => d.lines)));
  const maxFile = Math.max(1, ...((data?.largest_files || []).map((f) => f.lines)));
  const cov = data?.coverage || {};
  const covRatio = cov.ratio ?? 0;
  const covColor = covRatio >= 70 ? 'text-emerald-600' : covRatio >= 40 ? 'text-amber-600' : 'text-rose-600';

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard icon={FileCode} label="Fichiers Python" value={nf(k.py_files)} accent="bg-indigo-500" testid="kpi-files" />
        <KpiCard icon={Stack} label="Lignes de code" value={nf(k.total_lines)} accent="bg-sky-500" testid="kpi-lines" />
        <KpiCard icon={Plugs} label="Endpoints API" value={nf(k.total_endpoints)} accent="bg-violet-500" testid="kpi-endpoints" />
        <KpiCard icon={FunctionIcon} label="Fonctions" value={nf(k.total_functions)} accent="bg-teal-500" testid="kpi-functions" />
        <KpiCard icon={TestTube} label="Fichiers de tests" value={nf(k.test_files)} accent="bg-emerald-500" testid="kpi-test-files" />
        <KpiCard icon={TestTube} label="Tests (cas)" value={nf(k.test_functions)} accent="bg-green-500" testid="kpi-test-funcs" />
        <KpiCard icon={Warning} label={`Fichiers > ${data?.thresholds?.danger} lignes`} value={nf(k.danger_files)} accent="bg-rose-500" testid="kpi-danger" />
        <KpiCard icon={Warning} label={`Fichiers > ${data?.thresholds?.warn} lignes`} value={nf(k.warn_files)} accent="bg-amber-500" testid="kpi-warn" />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-5" data-testid="code-health-dirs">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Lignes par dossier</h2>
          <div className="space-y-2.5">
            {(data?.by_directory || []).map((d) => (
              <div key={d.dir} data-testid={`dir-${d.dir}`}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-gray-700">{d.dir}/ <span className="text-gray-400 font-normal">· {d.files} fichiers · {d.endpoints} ep</span></span>
                  <span className="text-gray-500 font-medium">{nf(d.lines)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(d.lines / maxDir) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5" data-testid="code-health-coverage-proxy">
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
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto" data-testid="coverage-untested">
            {(cov.untested || []).map((m) => (
              <span key={m.module} className="px-2 py-0.5 rounded-md text-[11px] bg-gray-50 text-gray-600 border border-gray-100">
                {m.module} <span className="text-gray-400">· {nf(m.lines)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5" data-testid="code-health-largest">
        <h2 className="text-sm font-bold text-gray-700 mb-3">Plus gros fichiers (points chauds de dette)</h2>
        <div className="space-y-2">
          {(data?.largest_files || []).map((f) => {
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
    </>
  );
};

/* ---------------------------------------------------------------- Couverture réelle */
const CoverageTab = ({ proxy }) => {
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchRun = useCallback(() => {
    adminAPI.codeCoverage().then((r) => setRun(r.data)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { fetchRun(); }, [fetchRun]);

  // Poll while a run is in progress.
  useEffect(() => {
    if (run?.status !== 'running') return undefined;
    const t = setInterval(fetchRun, 4000);
    return () => clearInterval(t);
  }, [run?.status, fetchRun]);

  const launch = () => {
    adminAPI.codeCoverageRun().then((r) => {
      setRun(r.data);
      toast.info('Analyse pytest --cov lancée (1-3 min)…');
    }).catch(() => toast.error('Lancement impossible'));
  };

  const running = run?.status === 'running';
  const real = run?.percent;
  const realColor = real >= 70 ? 'text-emerald-600' : real >= 40 ? 'text-amber-600' : 'text-rose-600';

  if (loading) return <Spinner />;
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl border border-gray-100 p-5" data-testid="coverage-real">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700">Couverture RÉELLE (pytest --cov)</h2>
          <button onClick={launch} disabled={running} data-testid="coverage-run-btn"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${running ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
            {running ? <CircleNotch size={15} className="animate-spin" /> : <Play size={15} weight="fill" />}
            {running ? 'Analyse en cours…' : "Lancer l'analyse"}
          </button>
        </div>
        {run?.status === 'never' || run?.status === 'stale' ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            {run?.status === 'stale' ? "Analyse précédente interrompue (rechargement serveur). Relancez l'analyse." : "Aucune analyse réelle encore lancée. Cliquez sur « Lancer l'analyse »."}
          </p>
        ) : running ? (
          <div className="py-8 text-center">
            <CircleNotch size={32} className="animate-spin text-indigo-500 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Exécution de la suite de tests en arrière-plan…</p>
            <p className="text-xs text-gray-400">Démarré à {new Date(run.started_at).toLocaleTimeString('fr-FR')}</p>
          </div>
        ) : (
          <>
            <div className="flex items-end gap-2 mb-2">
              <span className={`text-5xl font-black leading-none ${realColor}`}>{real ?? '—'}%</span>
              <span className="text-xs text-gray-500 mb-1">routes + core{run.covered_lines != null ? ` · ${nf(run.covered_lines)}/${nf(run.num_statements)} lignes` : ''}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
              <div className={`h-full rounded-full ${real >= 70 ? 'bg-emerald-500' : real >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${real || 0}%` }} />
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {run.status === 'timeout' && <span className="px-2 py-1 rounded bg-amber-50 text-amber-600">⏱️ Timeout (résultat partiel)</span>}
              {run.tests_passed != null && <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-600 inline-flex items-center gap-1"><CheckCircle size={13} weight="fill" /> {run.tests_passed} réussis</span>}
              {run.tests_failed ? <span className="px-2 py-1 rounded bg-rose-50 text-rose-600 inline-flex items-center gap-1"><XCircle size={13} weight="fill" /> {run.tests_failed} échoués</span> : null}
              {run.duration_sec != null && <span className="px-2 py-1 rounded bg-gray-50 text-gray-500">{run.duration_sec}s</span>}
            </div>
            {run.finished_at && <p className="text-[11px] text-gray-400 mt-3">Dernière analyse : {new Date(run.finished_at).toLocaleString('fr-FR')}{run.files_run ? ` · échantillon unitaire (${run.files_run} fichiers, hors e2e réseau)` : ''}</p>}
          </>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-3">Proxy statique (référence)</h2>
        <div className="flex items-end gap-2 mb-2">
          <span className="text-4xl font-black text-gray-700 leading-none">{proxy?.ratio ?? 0}%</span>
          <span className="text-xs text-gray-500 mb-1">{proxy?.tested}/{proxy?.source_modules} modules référencés dans un test</span>
        </div>
        <p className="text-xs text-gray-400 mt-3">Le proxy compte les modules <em>cités</em> dans un test (rapide). La couverture réelle mesure les lignes <em>exécutées</em> par pytest (précis). L'écart révèle les tests superficiels.</p>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- Sécurité & Intégrité */
const SecurityTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminAPI.codeSecurity().then((r) => setData(r.data)).catch(() => toast.error('Scan sécurité impossible')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const baseline = () => {
    adminAPI.codeSetBaseline().then((r) => { toast.success(`Baseline définie (${r.data.files} fichiers)`); load(); });
  };

  if (loading) return <Spinner color="rose" />;
  const ig = data?.integrity || {};
  const dup = data?.duplication || {};
  const sus = data?.suspicious || {};

  return (
    <div className="space-y-6" data-testid="security-tab">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={ig.broken_count ? Bug : CheckCircle} label="Fichiers corrompus (syntaxe)" value={nf(ig.broken_count)} accent={ig.broken_count ? 'bg-rose-500' : 'bg-emerald-500'} testid="kpi-broken" />
        <KpiCard icon={Copy} label="Clusters dupliqués" value={nf(dup.clusters_count)} accent="bg-amber-500" testid="kpi-dup" />
        <KpiCard icon={ShieldWarning} label="Patterns suspects" value={nf(sus.count)} accent={sus.high ? 'bg-rose-500' : sus.count ? 'bg-amber-500' : 'bg-emerald-500'} testid="kpi-suspicious" />
        <KpiCard icon={FloppyDisk} label="Dérive d'intégrité" value={ig.baseline_set ? nf(ig.drift_count) : '—'} accent="bg-sky-500" testid="kpi-drift" />
      </div>

      {/* Intégrité */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5" data-testid="integrity-card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700">Intégrité des fichiers ({nf(ig.files_checked)} vérifiés)</h2>
          <button onClick={baseline} data-testid="set-baseline-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700">
            <FloppyDisk size={15} weight="fill" /> {ig.baseline_set ? 'Redéfinir la baseline' : 'Définir la baseline'}
          </button>
        </div>
        {ig.broken_count > 0 ? (
          <div className="space-y-1">
            {ig.broken.map((b) => (
              <div key={b.file} className="text-xs font-mono text-rose-600 bg-rose-50 rounded px-2 py-1">{b.file}:{b.line} — {b.error}</div>
            ))}
          </div>
        ) : <p className="text-sm text-emerald-600 inline-flex items-center gap-1"><CheckCircle size={15} weight="fill" /> Aucun fichier corrompu — tout compile.</p>}
        {ig.baseline_set && ig.drift_count > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-gray-500 mb-1">{ig.drift_count} fichiers modifiés depuis la baseline ({new Date(ig.baseline_at).toLocaleString('fr-FR')}) :</p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {ig.drift.map((d) => (
                <span key={d.file} className={`px-2 py-0.5 rounded text-[11px] border ${d.status === 'modified' ? 'bg-amber-50 text-amber-600 border-amber-100' : d.status === 'new' ? 'bg-sky-50 text-sky-600 border-sky-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>{d.file} · {d.status}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Duplication */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5" data-testid="duplication-card">
        <h2 className="text-sm font-bold text-gray-700 mb-1">Duplication de code source <span className="text-gray-400 font-normal">· {dup.duplication_ratio}% · {dup.duplicated_blocks} blocs · fenêtre {dup.window_lines} lignes</span></h2>
        {(dup.top || []).length === 0 ? (
          <p className="text-sm text-emerald-600">Aucune duplication significative.</p>
        ) : (
          <div className="space-y-2 mt-2 max-h-80 overflow-y-auto">
            {dup.top.map((c, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-2.5" data-testid={`dup-${i}`}>
                <div className="flex justify-between items-center mb-1">
                  <code className="text-xs text-gray-700 truncate">{c.snippet}…</code>
                  <span className="text-[11px] font-bold text-amber-600 shrink-0 ml-2">×{c.count}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.locations.map((l, j) => (
                    <span key={j} className="text-[10px] font-mono text-gray-400">{l.file}:{l.line}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suspicious */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5" data-testid="suspicious-card">
        <h2 className="text-sm font-bold text-gray-700 mb-2">Patterns suspects <span className="text-gray-400 font-normal">· {sus.high} critiques · {sus.medium} moyens</span></h2>
        {(sus.findings || []).length === 0 ? (
          <p className="text-sm text-emerald-600 inline-flex items-center gap-1"><CheckCircle size={15} weight="fill" /> Aucun pattern à risque détecté (eval/exec, shell, secrets en dur).</p>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {sus.findings.map((f, i) => (
              <div key={i} className={`flex items-center justify-between text-xs rounded px-2 py-1.5 border ${SEV[f.severity]}`} data-testid={`sus-${i}`}>
                <span className="font-mono truncate">{f.file}:{f.line}</span>
                <span className="font-semibold shrink-0 ml-2">{f.issue}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- Garde Google Maps */
const MapsTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminAPI.codeMapsGuard().then((r) => setData(r.data)).catch(() => toast.error('Audit Maps impossible')).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner color="emerald" />;
  const statusColor = { danger: 'text-rose-600', warn: 'text-amber-600', ok: 'text-emerald-600' }[data?.status] || 'text-gray-500';

  return (
    <div className="space-y-6" data-testid="maps-tab">
      <div className={`rounded-2xl border p-4 ${data?.status === 'danger' ? 'bg-rose-50 border-rose-100' : data?.status === 'warn' ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
        <div className="flex items-center gap-2">
          <ShieldWarning size={20} className={statusColor} weight="fill" />
          <p className={`text-sm font-bold ${statusColor}`}>
            {data?.status === 'danger' ? 'Risque de surfacturation détecté' : data?.status === 'warn' ? `${data?.risks_count} point(s) à vérifier` : 'Aucun risque de surfacturation détecté'}
          </p>
        </div>
        <p className="text-xs text-gray-500 mt-1">Audit statique des usages Google Maps (loaders, appels REST facturés, boucles de fond).</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={MapTrifold} label="Fichiers utilisant Maps" value={nf(data?.files_touching_maps)} accent="bg-emerald-500" testid="kpi-maps-files" />
        <KpiCard icon={Plugs} label="Loaders Maps JS" value={nf(data?.loaders_count)} accent="bg-sky-500" testid="kpi-maps-loaders" />
        <KpiCard icon={Stack} label="Appels REST facturés" value={nf(data?.rest_calls_total)} accent="bg-violet-500" testid="kpi-maps-rest" />
        <KpiCard icon={Warning} label="Risques (coût)" value={nf(data?.risks_count)} accent={data?.high_risks_count ? 'bg-rose-500' : data?.risks_count ? 'bg-amber-500' : 'bg-emerald-500'} testid="kpi-maps-risks" />
      </div>

      {(data?.risks || []).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5" data-testid="maps-risks-card">
          <h2 className="text-sm font-bold text-gray-700 mb-2">Risques de coût</h2>
          <div className="space-y-1.5">
            {data.risks.map((r, i) => (
              <div key={i} className={`text-xs rounded px-2 py-2 border ${SEV[r.severity]}`} data-testid={`maps-risk-${i}`}>
                <div className="flex justify-between"><span className="font-mono truncate">{r.file}{r.line ? `:${r.line}` : ''}</span><span className="font-bold uppercase text-[10px] shrink-0 ml-2">{r.severity}</span></div>
                <p className="text-gray-500 mt-0.5">{r.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-5" data-testid="maps-rest-card">
        <h2 className="text-sm font-bold text-gray-700 mb-3">Appels REST Google Maps par type (facturés à l'appel)</h2>
        {(data?.rest_usage || []).length === 0 ? <p className="text-sm text-gray-400">Aucun appel REST direct.</p> : (
          <div className="space-y-2">
            {data.rest_usage.map((u) => (
              <div key={u.api} className="flex items-center justify-between border-b border-gray-50 pb-2 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-gray-700">{u.api}</p>
                  <p className="text-[11px] font-mono text-gray-400">{u.sites.map((s) => `${s.file}:${s.line}`).join(' · ')}</p>
                </div>
                <span className="text-lg font-black text-violet-600">{u.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- Page */
const TABS = [
  { key: 'metrics', label: 'Métriques' },
  { key: 'coverage', label: 'Couverture réelle' },
  { key: 'security', label: 'Sécurité & Intégrité' },
  { key: 'maps', label: 'Garde Google Maps' },
];

const AdminCodeHealth = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('metrics');

  const load = useCallback(() => {
    setLoading(true);
    adminAPI.codeHealth().then((r) => setData(r.data)).catch(() => toast.error('Chargement impossible')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-5xl" data-testid="admin-code-health">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Code size={22} className="text-indigo-600" weight="fill" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Santé du code</h1>
            <p className="text-sm text-gray-500">Qualité, sécurité &amp; coûts · backend + frontend</p>
          </div>
        </div>
        <button onClick={load} data-testid="code-health-refresh"
          className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
          <ArrowClockwise size={18} />
        </button>
      </div>

      <div className="flex gap-2 mb-5 border-b border-gray-100 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`tab-${t.key}`}
            className={`px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && tab === 'metrics' ? <Spinner /> : (
        <>
          {tab === 'metrics' && <MetricsTab data={data} />}
          {tab === 'coverage' && <CoverageTab proxy={data?.coverage} />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'maps' && <MapsTab />}
        </>
      )}

      {data?.generated_at && tab === 'metrics' && (
        <p className="text-[11px] text-gray-400 mt-4">Généré le {new Date(data.generated_at).toLocaleString('fr-FR')}</p>
      )}
    </div>
  );
};

export default AdminCodeHealth;
