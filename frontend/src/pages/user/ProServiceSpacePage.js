/**
 * ProServiceSpacePage — Espace prestataire (générique par verticale).
 * Inscription → KYC (documents) → validation admin → disponibilité →
 * feed des demandes → accepter → gérer (en cours / terminé) + gains nets.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, CircleNotch, CheckCircle, Warning, ShieldCheck, UploadSimple,
  Bell, Briefcase, Coins, Power,
} from '@phosphor-icons/react';
import { useLocale } from '../../contexts/LocaleContext';

const API = process.env.REACT_APP_BACKEND_URL;
const STATUS_LABEL = { pending: 'En attente', confirmed: 'Confirmé', in_progress: 'En cours', completed: 'Terminé', cancelled: 'Annulé' };
const ACCENT = {
  beauty: { grad: 'from-pink-600 to-rose-700', solid: 'bg-pink-600', text: 'text-pink-600', soft: 'bg-pink-50', softText: 'text-pink-800', border: 'border-pink-100', spin: 'text-pink-400', selBorder: 'border-pink-600' },
  trades: { grad: 'from-amber-600 to-orange-700', solid: 'bg-amber-600', text: 'text-amber-600', soft: 'bg-amber-50', softText: 'text-amber-800', border: 'border-amber-100', spin: 'text-amber-400', selBorder: 'border-amber-600' },
  medical: { grad: 'from-teal-600 to-emerald-700', solid: 'bg-teal-600', text: 'text-teal-600', soft: 'bg-teal-50', softText: 'text-teal-800', border: 'border-teal-100', spin: 'text-teal-400', selBorder: 'border-teal-600' },
};

const ProServiceSpacePage = () => {
  const { vertical = 'beauty' } = useParams();
  const acc = ACCENT[vertical] || ACCENT.beauty;
  const { money } = useLocale();
  const navigate = useNavigate();
  const base = `${API}/api/pro-services/${vertical}`;
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [reg, setReg] = useState({ name: '', categories: [], city: '', bio: '' });
  const [uploading, setUploading] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${base}/provider/me`, { credentials: 'include' });
      const d = await r.json();
      setMe(d);
      if (d.registered) {
        fetch(`${base}/provider/feed`, { credentials: 'include' }).then(r => r.json()).then(setFeed).catch(() => {});
        fetch(`${base}/provider/jobs`, { credentials: 'include' }).then(r => r.json()).then(setJobs).catch(() => {});
      }
    } catch { /* */ } finally { setLoading(false); }
  }, [base]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!me?.registered) return;
    const t = setInterval(() => {
      fetch(`${base}/provider/feed`, { credentials: 'include' }).then(r => r.json()).then(setFeed).catch(() => {});
    }, 6000);
    return () => clearInterval(t);
  }, [me?.registered, base]);

  const register = async () => {
    if (!reg.categories.length) { toast.error('Choisissez au moins une spécialité'); return; }
    try {
      const r = await fetch(`${base}/provider/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(reg),
      });
      const d = await r.json();
      if (r.ok) { toast.success('Profil créé — envoyez vos documents pour validation'); load(); } else toast.error(d.detail || 'Erreur');
    } catch { toast.error('Erreur réseau'); }
  };

  const uploadDoc = async (key, file) => {
    if (!file) return;
    setUploading(key);
    try {
      const fd = new FormData(); fd.append('file', file);
      const up = await fetch(`${API}/api/uploads/image`, { method: 'POST', credentials: 'include', body: fd });
      const u = await up.json();
      const url = u.url || u.image_url;
      await fetch(`${base}/provider/documents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ [key]: url }),
      });
      toast.success('Document envoyé'); load();
    } catch { toast.error('Échec de l\'envoi'); } finally { setUploading(''); }
  };

  const toggleAvailable = async () => {
    try {
      const r = await fetch(`${base}/provider/availability`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ available: !me.provider.is_available }),
      });
      const d = await r.json();
      if (r.ok) load(); else toast.error(d.detail || 'Erreur');
    } catch { toast.error('Erreur réseau'); }
  };

  const accept = async (id) => {
    try {
      const r = await fetch(`${base}/bookings/${id}/accept`, { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (r.ok) { toast.success('Réservation acceptée'); load(); } else toast.error(d.detail || 'Indisponible');
    } catch { toast.error('Erreur réseau'); }
  };
  const setStatus = async (id, status) => {
    try {
      const r = await fetch(`${base}/bookings/${id}/provider-status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status }),
      });
      const d = await r.json();
      if (r.ok) { toast.success(status === 'completed' ? 'Prestation terminée' : 'Prestation démarrée'); load(); } else toast.error(d.detail || 'Erreur');
    } catch { toast.error('Erreur réseau'); }
  };

  if (loading) return <div className="mobile-container min-h-screen bg-gray-50 flex items-center justify-center"><CircleNotch size={28} className={`${acc.spin} animate-spin`} /></div>;

  // ── Registration ──
  if (!me?.registered) {
    const cats = me?.categories || [];
    return (
      <div className="mobile-container min-h-screen bg-gray-50" data-testid="pro-register">
        <Header title="Devenir prestataire" onBack={() => navigate(-1)} />
        <div className="p-4 space-y-4">
          <div className={`${acc.soft} border ${acc.border} rounded-2xl p-4 text-sm ${acc.softText}`}>Proposez vos prestations, recevez des réservations et encaissez vos gains (commission plateforme {Math.round((0.15) * 100)}%).</div>
          <input value={reg.name} onChange={e => setReg({ ...reg, name: e.target.value })} placeholder="Nom de votre activité / salon" className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm" data-testid="reg-name" />
          <div className="bg-white rounded-2xl p-4">
            <p className="text-xs font-bold text-gray-500 mb-2">Vos spécialités</p>
            <div className="flex flex-wrap gap-2">
              {cats.map(c => {
                const on = reg.categories.includes(c.id);
                return <button key={c.id} onClick={() => setReg({ ...reg, categories: on ? reg.categories.filter(x => x !== c.id) : [...reg.categories, c.id] })} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${on ? `${acc.solid} text-white ${acc.selBorder}` : 'bg-white text-gray-600 border-gray-200'}`} data-testid={`reg-cat-${c.id}`}>{c.label}</button>;
              })}
            </div>
          </div>
          <input value={reg.city} onChange={e => setReg({ ...reg, city: e.target.value })} placeholder="Ville" className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm" data-testid="reg-city" />
          <textarea value={reg.bio} onChange={e => setReg({ ...reg, bio: e.target.value })} placeholder="Présentez votre activité…" rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm" data-testid="reg-bio" />
          <button onClick={register} className={`w-full ${acc.solid} text-white py-4 rounded-xl font-bold text-sm`} data-testid="reg-submit">Créer mon profil prestataire</button>
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
      {uploading === k && <CircleNotch size={12} className={`animate-spin ${acc.spin}`} />}
      <input type="file" accept="image/*" className="hidden" onChange={e => uploadDoc(k, e.target.files[0])} />
    </label>
  );

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="pro-dashboard">
      <div className={`bg-gradient-to-br ${acc.grad} px-4 pt-4 pb-5 text-white`}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="text-white" data-testid="pro-back"><ArrowLeft size={22} /></button>
          <div className="flex-1 min-w-0"><h1 className="text-lg font-bold truncate">{p.name}</h1><p className="text-[11px] text-white/70">Espace prestataire</p></div>
          {vs === 'approved' && (
            <button onClick={toggleAvailable} className={`text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1 ${p.is_available ? 'bg-emerald-400 text-emerald-900' : 'bg-white/20 text-white'}`} data-testid="availability-toggle">
              <Power size={13} weight="fill" /> {p.is_available ? 'Disponible' : 'Hors ligne'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[['Terminées', me.stats.completed, Briefcase], ['En cours', me.stats.active, Bell], ['Gains', money(me.stats.earnings), Coins]].map(([l, v, Ic]) => (
            <div key={l} className="bg-white/10 rounded-xl px-2 py-2.5 text-center"><Ic size={16} className="mx-auto mb-1" /><p className="text-sm font-extrabold">{v}</p><p className="text-[10px] text-white/70">{l}</p></div>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Verification */}
        {vs !== 'approved' && (
          <div className={`rounded-2xl p-4 ${vs === 'rejected' ? 'bg-rose-50 border border-rose-200' : 'bg-amber-50 border border-amber-200'}`} data-testid="verification-banner">
            <div className="flex items-center gap-2">
              {vs === 'rejected' ? <Warning size={20} className="text-rose-600" weight="fill" /> : <ShieldCheck size={20} className="text-amber-600" weight="fill" />}
              <p className={`font-bold text-sm ${vs === 'rejected' ? 'text-rose-700' : 'text-amber-700'}`}>{vs === 'rejected' ? 'Compte refusé' : 'Validation en attente'}</p>
            </div>
            <p className="text-xs text-gray-600 mt-1">{vs === 'rejected' ? (p.rejection_reason || 'Documents non conformes. Renvoyez vos pièces.') : 'Envoyez vos pièces justificatives. Vous pourrez recevoir des réservations une fois validé.'}</p>
            <div className="flex gap-2 mt-3">
              <DocBtn k="id_card" label="Pièce d'identité" />
              <DocBtn k="diploma" label="Diplôme/CAP" />
              <DocBtn k="insurance" label="Assurance" />
            </div>
          </div>
        )}

        {/* Feed */}
        {vs === 'approved' && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Nouvelles demandes</p>
            {feed.length === 0 ? <Empty text="Aucune demande pour l'instant" /> : (
              <div className="space-y-3">
                {feed.map(b => (
                  <div key={b.id} className={`bg-white rounded-2xl p-4 border ${b.urgent ? 'border-red-300' : 'border-gray-100'}`} data-testid={`feed-${b.id}`}>
                    <div className="flex items-center gap-2">
                      {b.urgent && <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded">⚡ URGENT</span>}
                      <p className="font-bold text-gray-900 text-sm">{b.service_name}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{b.scheduled_date} à {b.scheduled_time} · {b.at_home ? 'À domicile' : 'En salon'}</p>
                    <div className="flex justify-between items-center mt-2">
                      <span className={`font-bold ${acc.text} text-sm`}>{money(Number(b.total))}</span>
                      <button onClick={() => accept(b.id)} className={`${acc.solid} text-white text-xs font-bold px-4 py-2 rounded-lg`} data-testid={`accept-${b.id}`}>Accepter</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Jobs */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Mes prestations</p>
          {jobs.length === 0 ? <Empty text="Aucune prestation" /> : (
            <div className="space-y-3">
              {jobs.map(b => (
                <div key={b.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`job-${b.id}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-gray-900 text-sm">{b.service_name}</p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${b.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : b.status === 'cancelled' ? 'bg-rose-50 text-rose-600' : `${acc.soft} ${acc.text}`}`}>{STATUS_LABEL[b.status]}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{b.scheduled_date} à {b.scheduled_time} · {b.user_name}</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="font-bold text-gray-900 text-sm">{money(Number(b.total))} {b.payment_method === 'cash' ? '(espèces)' : ''}</span>
                    <div className="flex gap-2">
                      {b.status === 'confirmed' && <button onClick={() => setStatus(b.id, 'in_progress')} className={`text-xs font-bold ${acc.text} ${acc.soft} px-3 py-1.5 rounded-lg`} data-testid={`start-${b.id}`}>Démarrer</button>}
                      {['confirmed', 'in_progress'].includes(b.status) && <button onClick={() => setStatus(b.id, 'completed')} className="text-xs font-bold text-white bg-emerald-500 px-3 py-1.5 rounded-lg" data-testid={`complete-${b.id}`}>Terminer</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Header = ({ title, onBack }) => (
  <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
    <button onClick={onBack} data-testid="pro-header-back"><ArrowLeft size={22} /></button>
    <h1 className="text-base font-bold truncate">{title}</h1>
  </div>
);
const Empty = ({ text }) => (
  <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-400">{text}</div>
);

export default ProServiceSpacePage;
