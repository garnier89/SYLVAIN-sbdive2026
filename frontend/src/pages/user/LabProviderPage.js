/**
 * LabProviderPage — Espace laboratoire SB Labo (/laboratoire).
 * Onboarding + KYC (pro-services vertical='lab', validé admin), feed des commandes,
 * acceptation, puis saisie des résultats (par analyse) → compte rendu au patient.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, CircleNotch, ShieldCheck, Warning, UploadSimple, CheckCircle, Flask, FilePlus, X,
} from '@phosphor-icons/react';
import { useLocale } from '../../contexts/LocaleContext';

const API = process.env.REACT_APP_BACKEND_URL;
const PS = `${API}/api/pro-services/lab`;
const LAB = `${API}/api/lab`;

const LabProviderPage = () => {
  const { money } = useLocale();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reg, setReg] = useState({ name: '', categories: [], city: '' });
  const [uploading, setUploading] = useState('');
  const [feed, setFeed] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [resultFor, setResultFor] = useState(null); // order being filled
  const [rows, setRows] = useState([]);
  const [conclusion, setConclusion] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${PS}/provider/me`, { credentials: 'include' });
      const d = await r.json(); setMe(d); setCats(d.categories || []);
      if (d.registered && d.provider?.verification_status === 'approved') {
        const o = await fetch(`${LAB}/provider/orders`, { credentials: 'include' }).then(r => r.json());
        setFeed(o.feed || []); setJobs(o.jobs || []);
      }
    } catch { /* */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const register = async () => {
    if (!reg.categories.length) { toast.error('Choisissez au moins une famille d\'analyses'); return; }
    try {
      const r = await fetch(`${PS}/provider/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(reg) });
      const d = await r.json();
      if (r.ok) { toast.success('Profil créé — envoyez votre agrément pour validation'); load(); } else toast.error(d.detail || 'Erreur');
    } catch { toast.error('Erreur réseau'); }
  };
  const uploadDoc = async (key, file) => {
    if (!file) return; setUploading(key);
    try {
      const fd = new FormData(); fd.append('file', file);
      const up = await fetch(`${API}/api/uploads/image`, { method: 'POST', credentials: 'include', body: fd });
      const u = await up.json();
      await fetch(`${PS}/provider/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ [key]: u.url || u.image_url }) });
      toast.success('Document envoyé'); load();
    } catch { toast.error('Échec'); } finally { setUploading(''); }
  };
  const accept = async (id) => {
    try {
      const r = await fetch(`${LAB}/orders/${id}/accept`, { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (r.ok) { toast.success('Commande acceptée'); load(); } else toast.error(d.detail || 'Indisponible');
    } catch { toast.error('Erreur réseau'); }
  };
  const openResults = (o) => {
    setResultFor(o);
    setRows((o.analyses || []).map(a => ({ name: a.name, value: '', unit: '', ref_range: '', flag: 'normal' })));
    setConclusion('');
  };
  const setRow = (i, k, v) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const submitResults = async () => {
    if (!rows.some(r => r.value.trim())) { toast.error('Saisissez au moins un résultat'); return; }
    try {
      const r = await fetch(`${LAB}/orders/${resultFor.id}/results`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ results: rows, conclusion }),
      });
      const d = await r.json();
      if (r.ok) { toast.success('Résultats envoyés au patient'); setResultFor(null); load(); } else toast.error(d.detail || 'Erreur');
    } catch { toast.error('Erreur réseau'); }
  };

  if (loading) return <div className="mobile-container min-h-screen bg-gray-50 flex items-center justify-center"><CircleNotch size={28} className="text-indigo-500 animate-spin" /></div>;

  if (!me?.registered) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50" data-testid="lab-register">
        <Header title="Devenir laboratoire" onBack={() => navigate(-1)} />
        <div className="p-4 space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-sm text-indigo-800 flex gap-2"><Flask size={20} weight="fill" className="text-indigo-600 flex-shrink-0" /> Inscrivez votre laboratoire, faites valider votre agrément, puis traitez les commandes d'analyses et publiez les résultats.</div>
          <input value={reg.name} onChange={e => setReg({ ...reg, name: e.target.value })} placeholder="Nom du laboratoire" className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm" data-testid="reg-name" />
          <div className="bg-white rounded-2xl p-4">
            <p className="text-xs font-bold text-gray-500 mb-2">Familles d'analyses proposées</p>
            <div className="flex flex-wrap gap-2">
              {cats.map(c => { const on = reg.categories.includes(c.id);
                return <button key={c.id} onClick={() => setReg({ ...reg, categories: on ? reg.categories.filter(x => x !== c.id) : [...reg.categories, c.id] })} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200'}`} data-testid={`reg-cat-${c.id}`}>{c.label}</button>; })}
            </div>
          </div>
          <input value={reg.city} onChange={e => setReg({ ...reg, city: e.target.value })} placeholder="Ville" className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm" data-testid="reg-city" />
          <button onClick={register} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-sm" data-testid="reg-submit">Créer mon profil laboratoire</button>
        </div>
      </div>
    );
  }

  const p = me.provider; const vs = p.verification_status;
  const DocBtn = ({ k, label }) => (
    <label className="flex-1 border border-dashed border-gray-300 rounded-xl py-3 flex flex-col items-center gap-1 cursor-pointer" data-testid={`upload-${k}`}>
      {p.documents?.[k] ? <CheckCircle size={20} className="text-emerald-500" weight="fill" /> : <UploadSimple size={20} className="text-gray-400" />}
      <span className="text-[11px] font-semibold text-gray-600">{label}</span>
      {uploading === k && <CircleNotch size={12} className="animate-spin text-indigo-500" />}
      <input type="file" accept="image/*" className="hidden" onChange={e => uploadDoc(k, e.target.files[0])} />
    </label>
  );

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="lab-dashboard">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 px-4 pt-4 pb-5 text-white">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-white" data-testid="lab-prov-back"><ArrowLeft size={22} /></button>
          <div className="flex-1 min-w-0"><h1 className="text-lg font-bold truncate">{p.name}</h1><p className="text-[11px] text-white/70">Espace laboratoire · SB Labo</p></div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {vs !== 'approved' && (
          <div className={`rounded-2xl p-4 ${vs === 'rejected' ? 'bg-rose-50 border border-rose-200' : 'bg-amber-50 border border-amber-200'}`} data-testid="verification-banner">
            <div className="flex items-center gap-2">{vs === 'rejected' ? <Warning size={20} className="text-rose-600" weight="fill" /> : <ShieldCheck size={20} className="text-amber-600" weight="fill" />}<p className={`font-bold text-sm ${vs === 'rejected' ? 'text-rose-700' : 'text-amber-700'}`}>{vs === 'rejected' ? 'Compte refusé' : 'Validation en attente'}</p></div>
            <p className="text-xs text-gray-600 mt-1">{vs === 'rejected' ? (p.rejection_reason || 'Documents non conformes.') : 'Envoyez votre agrément et votre assurance pour traiter les commandes.'}</p>
            <div className="flex gap-2 mt-3"><DocBtn k="id_card" label="Agrément" /><DocBtn k="diploma" label="Certification" /><DocBtn k="insurance" label="Assurance" /></div>
          </div>
        )}

        {vs === 'approved' && (
          <>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Nouvelles commandes</p>
              {feed.length === 0 ? <Empty text="Aucune commande en attente" /> : (
                <div className="space-y-3">{feed.map(o => (
                  <div key={o.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`feed-${o.id}`}>
                    <p className="font-bold text-gray-900 text-sm">{(o.analyses || []).length} analyse(s)</p>
                    <p className="text-xs text-gray-500 mt-0.5">{(o.analyses || []).map(a => a.name).join(', ')}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{o.scheduled_date} à {o.scheduled_time} · {o.at_home ? 'À domicile' : 'Au labo'}</p>
                    <div className="flex justify-between items-center mt-2"><span className="font-bold text-indigo-600 text-sm">{money(Number(o.total))}</span><button onClick={() => accept(o.id)} className="bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-lg" data-testid={`accept-${o.id}`}>Accepter</button></div>
                  </div>
                ))}</div>
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Mes commandes</p>
              {jobs.length === 0 ? <Empty text="Aucune commande" /> : (
                <div className="space-y-3">{jobs.map(o => (
                  <div key={o.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`job-${o.id}`}>
                    <div className="flex items-center justify-between"><p className="font-bold text-gray-900 text-sm">{(o.analyses || []).length} analyse(s)</p><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${o.status === 'results_ready' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>{o.status === 'results_ready' ? 'Résultats publiés' : 'Confirmé'}</span></div>
                    <p className="text-xs text-gray-500 mt-0.5">{o.patient_name} · {o.scheduled_date}</p>
                    {o.status === 'confirmed' && <button onClick={() => openResults(o)} className="mt-2 w-full bg-indigo-600 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5" data-testid={`fill-${o.id}`}><FilePlus size={14} /> Saisir les résultats</button>}
                  </div>
                ))}</div>
              )}
            </div>
          </>
        )}
      </div>

      {resultFor && (
        <div className="fixed inset-0 bg-black/40 flex items-end z-50" onClick={() => setResultFor(null)}>
          <div className="bg-white w-full max-w-[430px] mx-auto rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="results-sheet">
            <div className="flex items-center justify-between mb-3"><p className="font-bold text-gray-900">Résultats — {resultFor.patient_name}</p><button onClick={() => setResultFor(null)}><X size={20} /></button></div>
            {rows.map((r, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-3 mb-2" data-testid={`result-row-${i}`}>
                <p className="text-sm font-semibold text-gray-800 mb-1.5">{r.name}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  <input value={r.value} onChange={e => setRow(i, 'value', e.target.value)} placeholder="Résultat" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" data-testid={`res-value-${i}`} />
                  <input value={r.unit} onChange={e => setRow(i, 'unit', e.target.value)} placeholder="Unité" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" data-testid={`res-unit-${i}`} />
                  <input value={r.ref_range} onChange={e => setRow(i, 'ref_range', e.target.value)} placeholder="Réf." className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" data-testid={`res-ref-${i}`} />
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  {['normal', 'high', 'low'].map(f => <button key={f} onClick={() => setRow(i, 'flag', f)} className={`text-[10px] font-bold px-2 py-1 rounded-full ${r.flag === f ? (f === 'normal' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white') : 'bg-gray-100 text-gray-500'}`} data-testid={`res-flag-${f}-${i}`}>{f === 'normal' ? 'Normal' : f === 'high' ? 'Élevé' : 'Bas'}</button>)}
                </div>
              </div>
            ))}
            <textarea value={conclusion} onChange={e => setConclusion(e.target.value)} placeholder="Conclusion / commentaire (facultatif)" rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mt-1" data-testid="res-conclusion" />
            <button onClick={submitResults} className="w-full mt-3 bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-sm" data-testid="submit-results">Publier les résultats</button>
          </div>
        </div>
      )}
    </div>
  );
};

const Header = ({ title, onBack }) => (
  <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
    <button onClick={onBack} data-testid="lab-prov-header-back"><ArrowLeft size={22} /></button>
    <h1 className="text-base font-bold truncate">{title}</h1>
  </div>
);
const Empty = ({ text }) => (
  <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-400">{text}</div>
);

export default LabProviderPage;
