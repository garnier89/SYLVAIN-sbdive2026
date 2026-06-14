/**
 * PractitionerPage — Espace praticien SB Santé (/praticien).
 * Inscription + KYC (réutilise le moteur pro-services vertical='medical', validé
 * par l'admin) puis émission d'ordonnances électroniques + historique émis.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, CircleNotch, ShieldCheck, Warning, UploadSimple, CheckCircle, Plus, Trash,
  FilePlus, Prescription, Stethoscope,
} from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;
const PS = `${API}/api/pro-services/medical`;
const MED = `${API}/api/medical`;
const emptyMed = () => ({ name: '', dosage: '', duration: '' });

const PractitionerPage = () => {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reg, setReg] = useState({ name: '', categories: [], city: '', bio: '' });
  const [uploading, setUploading] = useState('');
  const [rx, setRx] = useState({ patient_email: '', diagnosis: '', notes: '', medications: [emptyMed()] });
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState([]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${PS}/provider/me`, { credentials: 'include' });
      const d = await r.json();
      setMe(d);
      setCats(d.categories || []);
      if (d.registered && d.provider?.verification_status === 'approved') {
        fetch(`${MED}/prescriptions/issued`, { credentials: 'include' }).then(r => r.json()).then(setIssued).catch(() => {});
      }
    } catch { /* */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const register = async () => {
    if (!reg.categories.length) { toast.error('Choisissez au moins une spécialité'); return; }
    try {
      const r = await fetch(`${PS}/provider/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(reg),
      });
      const d = await r.json();
      if (r.ok) { toast.success('Profil créé — envoyez vos diplômes pour validation'); load(); } else toast.error(d.detail || 'Erreur');
    } catch { toast.error('Erreur réseau'); }
  };

  const uploadDoc = async (key, file) => {
    if (!file) return;
    setUploading(key);
    try {
      const fd = new FormData(); fd.append('file', file);
      const up = await fetch(`${API}/api/uploads/image`, { method: 'POST', credentials: 'include', body: fd });
      const u = await up.json();
      await fetch(`${PS}/provider/documents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ [key]: u.url || u.image_url }),
      });
      toast.success('Document envoyé'); load();
    } catch { toast.error('Échec de l\'envoi'); } finally { setUploading(''); }
  };

  const issue = async () => {
    if (!rx.patient_email.trim()) { toast.error('Email du patient requis'); return; }
    if (!rx.medications.some(m => m.name.trim())) { toast.error('Ajoutez au moins un médicament'); return; }
    setIssuing(true);
    try {
      const r = await fetch(`${MED}/prescriptions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(rx),
      });
      const d = await r.json();
      if (r.ok) { toast.success('Ordonnance délivrée au patient'); setRx({ patient_email: '', diagnosis: '', notes: '', medications: [emptyMed()] }); load(); }
      else toast.error(d.detail || 'Erreur');
    } catch { toast.error('Erreur réseau'); } finally { setIssuing(false); }
  };

  const setMed = (i, k, v) => setRx(s => ({ ...s, medications: s.medications.map((m, j) => j === i ? { ...m, [k]: v } : m) }));

  if (loading) return <div className="mobile-container min-h-screen bg-gray-50 flex items-center justify-center"><CircleNotch size={28} className="text-teal-500 animate-spin" /></div>;

  // ── Registration ──
  if (!me?.registered) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50" data-testid="practitioner-register">
        <Header title="Devenir praticien" onBack={() => navigate(-1)} />
        <div className="p-4 space-y-4">
          <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4 text-sm text-teal-800 flex gap-2"><Stethoscope size={20} weight="fill" className="text-teal-600 flex-shrink-0" /> Inscrivez-vous, faites valider votre diplôme, puis délivrez des ordonnances électroniques à vos patients.</div>
          <input value={reg.name} onChange={e => setReg({ ...reg, name: e.target.value })} placeholder="Nom (ex. Dr. Sophie Martin)" className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm" data-testid="reg-name" />
          <div className="bg-white rounded-2xl p-4">
            <p className="text-xs font-bold text-gray-500 mb-2">Vos spécialités</p>
            <div className="flex flex-wrap gap-2">
              {cats.map(cat => {
                const on = reg.categories.includes(cat.id);
                return <button key={cat.id} onClick={() => setReg({ ...reg, categories: on ? reg.categories.filter(x => x !== cat.id) : [...reg.categories, cat.id] })} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${on ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-200'}`} data-testid={`reg-cat-${cat.id}`}>{cat.label}</button>;
              })}
            </div>
          </div>
          <input value={reg.city} onChange={e => setReg({ ...reg, city: e.target.value })} placeholder="Ville" className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm" data-testid="reg-city" />
          <button onClick={register} className="w-full bg-teal-600 text-white py-4 rounded-xl font-bold text-sm" data-testid="reg-submit">Créer mon profil praticien</button>
        </div>
      </div>
    );
  }

  const p = me.provider;
  const vs = p.verification_status;
  const DocBtn = ({ k, label }) => (
    <label className="flex-1 border border-dashed border-gray-300 rounded-xl py-3 flex flex-col items-center gap-1 cursor-pointer" data-testid={`upload-${k}`}>
      {p.documents?.[k] ? <CheckCircle size={20} className="text-emerald-500" weight="fill" /> : <UploadSimple size={20} className="text-gray-400" />}
      <span className="text-[11px] font-semibold text-gray-600">{label}</span>
      {uploading === k && <CircleNotch size={12} className="animate-spin text-teal-500" />}
      <input type="file" accept="image/*" className="hidden" onChange={e => uploadDoc(k, e.target.files[0])} />
    </label>
  );

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="practitioner-dashboard">
      <div className="bg-gradient-to-br from-teal-600 to-emerald-700 px-4 pt-4 pb-5 text-white">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-white" data-testid="prac-back"><ArrowLeft size={22} /></button>
          <div className="flex-1 min-w-0"><h1 className="text-lg font-bold truncate">{p.name}</h1><p className="text-[11px] text-white/70">Espace praticien · SB Santé</p></div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {vs !== 'approved' && (
          <div className={`rounded-2xl p-4 ${vs === 'rejected' ? 'bg-rose-50 border border-rose-200' : 'bg-amber-50 border border-amber-200'}`} data-testid="verification-banner">
            <div className="flex items-center gap-2">
              {vs === 'rejected' ? <Warning size={20} className="text-rose-600" weight="fill" /> : <ShieldCheck size={20} className="text-amber-600" weight="fill" />}
              <p className={`font-bold text-sm ${vs === 'rejected' ? 'text-rose-700' : 'text-amber-700'}`}>{vs === 'rejected' ? 'Compte refusé' : 'Validation en attente'}</p>
            </div>
            <p className="text-xs text-gray-600 mt-1">{vs === 'rejected' ? (p.rejection_reason || 'Documents non conformes.') : 'Envoyez votre diplôme et votre carte professionnelle pour délivrer des ordonnances.'}</p>
            <div className="flex gap-2 mt-3">
              <DocBtn k="id_card" label="Pièce d'identité" />
              <DocBtn k="diploma" label="Diplôme" />
              <DocBtn k="insurance" label="Carte RPPS" />
            </div>
          </div>
        )}

        {vs === 'approved' && (
          <>
            {/* Émettre une ordonnance */}
            <div className="bg-white rounded-2xl p-4" data-testid="issue-form">
              <p className="font-bold text-gray-900 flex items-center gap-1.5 mb-3"><FilePlus size={18} weight="fill" className="text-teal-600" /> Émettre une ordonnance</p>
              <input value={rx.patient_email} onChange={e => setRx({ ...rx, patient_email: e.target.value })} placeholder="Email du patient" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mb-2" data-testid="rx-patient-email" />
              <input value={rx.diagnosis} onChange={e => setRx({ ...rx, diagnosis: e.target.value })} placeholder="Diagnostic (facultatif)" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mb-2" data-testid="rx-diagnosis" />
              <p className="text-[10px] tracking-wide uppercase font-bold text-gray-400 mt-2 mb-1">Médicaments</p>
              {rx.medications.map((m, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 mb-1.5" data-testid={`rx-med-${i}`}>
                  <input value={m.name} onChange={e => setMed(i, 'name', e.target.value)} placeholder="Médicament" className="col-span-5 border border-gray-200 rounded-lg px-2 py-2 text-xs" data-testid={`rx-med-name-${i}`} />
                  <input value={m.dosage} onChange={e => setMed(i, 'dosage', e.target.value)} placeholder="Posologie" className="col-span-4 border border-gray-200 rounded-lg px-2 py-2 text-xs" data-testid={`rx-med-dosage-${i}`} />
                  <input value={m.duration} onChange={e => setMed(i, 'duration', e.target.value)} placeholder="Durée" className="col-span-2 border border-gray-200 rounded-lg px-2 py-2 text-xs" data-testid={`rx-med-duration-${i}`} />
                  <button onClick={() => setRx(s => ({ ...s, medications: s.medications.filter((_, j) => j !== i) }))} className="col-span-1 flex items-center justify-center text-rose-400" data-testid={`rx-med-del-${i}`}><Trash size={15} /></button>
                </div>
              ))}
              <button onClick={() => setRx(s => ({ ...s, medications: [...s.medications, emptyMed()] }))} className="text-xs font-semibold text-teal-600 flex items-center gap-1 mt-1" data-testid="rx-add-med"><Plus size={14} /> Ajouter un médicament</button>
              <textarea value={rx.notes} onChange={e => setRx({ ...rx, notes: e.target.value })} placeholder="Recommandations (facultatif)" rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mt-2" data-testid="rx-notes" />
              <button onClick={issue} disabled={issuing} className="w-full bg-teal-600 text-white py-3.5 rounded-xl font-bold text-sm mt-2 disabled:opacity-60" data-testid="rx-submit">{issuing ? 'Émission…' : 'Délivrer l\'ordonnance'}</button>
            </div>

            {/* Historique */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Ordonnances émises</p>
              {issued.length === 0 ? <Empty text="Aucune ordonnance émise" /> : (
                <div className="space-y-3">
                  {issued.map(r => (
                    <div key={r.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`issued-${r.id}`}>
                      <div className="flex items-center gap-1.5"><Prescription size={16} className="text-teal-600" weight="fill" /><p className="font-bold text-gray-900 text-sm">{r.patient_name}</p></div>
                      <p className="text-xs text-gray-500 mt-0.5">{r.diagnosis || 'Sans diagnostic'} · {(r.medications || []).length} médicament(s)</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const Header = ({ title, onBack }) => (
  <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
    <button onClick={onBack} data-testid="prac-header-back"><ArrowLeft size={22} /></button>
    <h1 className="text-base font-bold truncate">{title}</h1>
  </div>
);
const Empty = ({ text }) => (
  <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-400">{text}</div>
);

export default PractitionerPage;
