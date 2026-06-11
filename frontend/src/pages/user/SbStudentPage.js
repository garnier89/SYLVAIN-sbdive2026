/**
 * SbStudentPage — SB Drive Student (SB School) hub.
 * Lets a user verify their student status (university email OTP OR document upload),
 * shows their badge + the active student discounts once verified.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  GraduationCap, CaretLeft, EnvelopeSimple, IdentificationCard, CheckCircle,
  Clock, XCircle, Sparkle, Percent, ArrowsClockwise, CaretRight, Crown, Check, UsersThree, ShieldCheck, Trophy, Confetti, Storefront,
} from '@phosphor-icons/react';
import { studentAPI } from '../../services/api';

const BRAND = '#5B21B6';

const SbStudentPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    studentAPI.me().then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const sendOtp = async () => {
    if (!email.trim()) return toast.error('Saisissez votre email universitaire');
    setBusy(true);
    try {
      const r = await studentAPI.requestEmailOtp(email.trim());
      setOtpSent(true);
      toast.success(`Code envoyé à ${r.data.masked_email}`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec de l\'envoi'); }
    finally { setBusy(false); }
  };

  const confirmOtp = async () => {
    if (!code.trim()) return toast.error('Saisissez le code reçu');
    setBusy(true);
    try {
      await studentAPI.confirmEmailOtp(email.trim(), code.trim());
      toast.success('Statut étudiant validé 🎓');
      setOtpSent(false); setCode('');
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Code invalide'); }
    finally { setBusy(false); }
  };

  const uploadDoc = (docType) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setBusy(true);
      try {
        await studentAPI.uploadDocument(file, docType);
        toast.success('Document envoyé — en attente de validation.');
        load();
      } catch (err) { toast.error(err?.response?.data?.detail || 'Échec de l\'envoi'); }
      finally { setBusy(false); }
    };
    input.click();
  };

  const status = data?.status || 'none';
  const verified = data?.is_student;
  const cfg = data?.config || {};
  const cur = cfg.currency || 'EUR';

  return (
    <div className="mobile-container min-h-screen bg-[#F5F3FF] pb-16" data-testid="sb-student-page">
      <div className="text-white px-4 pt-6 pb-8 rounded-b-3xl" style={{ background: `linear-gradient(135deg, ${BRAND}, #7C3AED)` }}>
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center mb-3" data-testid="student-back-btn"><CaretLeft size={20} /></button>
        <div className="flex items-center gap-2">
          <GraduationCap size={28} weight="fill" />
          <h1 className="text-2xl font-black">SB Student</h1>
        </div>
        <p className="text-white/80 text-sm mt-1">Des trajets abordables et des avantages pensés pour la vie étudiante.</p>
      </div>

      {loading ? (
        <div className="p-6 text-gray-400 text-sm">Chargement…</div>
      ) : (
        <div className="px-4 -mt-4 space-y-4">
          {/* Status card */}
          <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="student-status-card">
            {verified ? (
              <div className="flex items-center gap-3" data-testid="student-badge">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center"><CheckCircle size={26} weight="fill" className="text-emerald-600" /></div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 flex items-center gap-1">Badge Étudiant actif <Sparkle size={16} weight="fill" className="text-amber-500" /></p>
                  <p className="text-xs text-gray-500">{data?.university || data?.university_email || 'Statut vérifié'}</p>
                </div>
              </div>
            ) : status === 'pending' ? (
              <div className="flex items-center gap-3" data-testid="student-pending">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center"><Clock size={26} weight="fill" className="text-amber-500" /></div>
                <div><p className="font-bold text-gray-900">Vérification en cours</p><p className="text-xs text-gray-500">Votre document est en cours de validation par notre équipe.</p></div>
              </div>
            ) : status === 'rejected' ? (
              <div className="flex items-center gap-3" data-testid="student-rejected">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center"><XCircle size={26} weight="fill" className="text-red-500" /></div>
                <div><p className="font-bold text-gray-900">Demande refusée</p><p className="text-xs text-gray-500">Vous pouvez soumettre un nouveau justificatif ci-dessous.</p></div>
              </div>
            ) : (
              <div className="flex items-center gap-3" data-testid="student-unverified">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: BRAND + '15' }}><GraduationCap size={26} weight="duotone" style={{ color: BRAND }} /></div>
                <div><p className="font-bold text-gray-900">Devenez étudiant vérifié</p><p className="text-xs text-gray-500">Validez votre statut pour débloquer les offres étudiantes.</p></div>
              </div>
            )}
          </div>

          {/* Benefits */}
          {cfg.enabled !== false && (
            <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="student-benefits">
              <p className="font-bold text-gray-900 mb-2">Vos avantages étudiants</p>
              <div className="space-y-2">
                <Benefit pct={cfg.ride_discount_pct} label="sur vos courses" />
                <Benefit pct={cfg.advance_discount_pct} label="sur vos réservations à l'avance" />
                <Benefit pct={cfg.campus_discount_pct} label="sur vos trajets campus ↔ domicile" />
              </div>
              {(cfg.daily_cap > 0 || cfg.monthly_cap > 0) && (
                <p className="text-[11px] text-gray-400 mt-2">
                  Plafonds : {cfg.daily_cap > 0 ? `${cfg.daily_cap} ${cur}/jour` : 'illimité/jour'} · {cfg.monthly_cap > 0 ? `${cfg.monthly_cap} ${cur}/mois` : 'illimité/mois'}
                </p>
              )}
              {verified && data?.usage && (
                <p className="text-[11px] text-emerald-600 mt-1" data-testid="student-usage">Économies ce mois-ci : {Number(data.usage.month || 0).toFixed(2)} {cur}</p>
              )}
            </div>
          )}

          {/* Pass Campus */}
          <CampusPassSection navigate={navigate} onChange={load} />

          {/* Recurring bookings entry */}
          <button onClick={() => navigate('/sb-student/recurrents')} className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3" data-testid="student-recurring-entry">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: BRAND + '15' }}><ArrowsClockwise size={20} weight="duotone" style={{ color: BRAND }} /></div>
            <div className="flex-1 text-left"><p className="font-bold text-gray-900 text-sm">Mes trajets récurrents</p><p className="text-xs text-gray-500">Campus → Résidence, Résidence → Gare…</p></div>
            <CaretRight size={18} className="text-gray-300" />
          </button>

          {/* Campus Share entry */}
          <button onClick={() => navigate('/sb-student/campus-share')} className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3" data-testid="student-share-entry">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: BRAND + '15' }}><UsersThree size={20} weight="duotone" style={{ color: BRAND }} /></div>
            <div className="flex-1 text-left"><p className="font-bold text-gray-900 text-sm">Campus Share</p><p className="text-xs text-gray-500">Covoiturage étudiant — partagez et économisez</p></div>
            <CaretRight size={18} className="text-gray-300" />
          </button>

          {/* Safety entry */}
          <button onClick={() => navigate('/sb-student/securite')} className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3" data-testid="student-safety-entry">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: BRAND + '15' }}><ShieldCheck size={20} weight="duotone" style={{ color: BRAND }} /></div>
            <div className="flex-1 text-left"><p className="font-bold text-gray-900 text-sm">Sécurité & Safe Ride Night</p><p className="text-xs text-gray-500">Partage live, contacts de confiance, trajets de nuit</p></div>
            <CaretRight size={18} className="text-gray-300" />
          </button>

          {/* Rewards entry */}
          <button onClick={() => navigate('/sb-student/recompenses')} className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3" data-testid="student-rewards-entry">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: BRAND + '15' }}><Trophy size={20} weight="duotone" style={{ color: BRAND }} /></div>
            <div className="flex-1 text-left"><p className="font-bold text-gray-900 text-sm">Mes récompenses</p><p className="text-xs text-gray-500">Gagnez des points, échangez des avantages</p></div>
            <CaretRight size={18} className="text-gray-300" />
          </button>

          {/* Marketplace entry */}
          <button onClick={() => navigate('/sb-student/marketplace')} className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3" data-testid="student-marketplace-entry">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: BRAND + '15' }}><Storefront size={20} weight="duotone" style={{ color: BRAND }} /></div>
            <div className="flex-1 text-left"><p className="font-bold text-gray-900 text-sm">Marketplace étudiante</p><p className="text-xs text-gray-500">Livres, logement, coloc, matériel & services · IA</p></div>
            <CaretRight size={18} className="text-gray-300" />
          </button>

          {/* Events entry */}
          <button onClick={() => navigate('/sb-student/evenements')} className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3" data-testid="student-events-entry">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: BRAND + '15' }}><Confetti size={20} weight="duotone" style={{ color: BRAND }} /></div>
            <div className="flex-1 text-left"><p className="font-bold text-gray-900 text-sm">Événements étudiants</p><p className="text-xs text-gray-500">Soirées, festivals & navettes</p></div>
            <CaretRight size={18} className="text-gray-300" />
          </button>

          {/* Verification (hidden once verified) */}
          {!verified && (
            <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="student-verify-card">
              <p className="font-bold text-gray-900 mb-3">Vérifier mon statut</p>
              <div className="flex gap-2 bg-gray-100 p-1 rounded-xl mb-4">
                <button onClick={() => setTab('email')} data-testid="student-tab-email" className={`flex-1 py-2 rounded-lg text-sm font-bold ${tab === 'email' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Email universitaire</button>
                <button onClick={() => setTab('document')} data-testid="student-tab-document" className={`flex-1 py-2 rounded-lg text-sm font-bold ${tab === 'document' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Document</button>
              </div>

              {tab === 'email' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5">
                    <EnvelopeSimple size={18} className="text-gray-400" />
                    <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@univ-...fr" type="email"
                      className="flex-1 text-sm outline-none" data-testid="student-email-input" disabled={otpSent} />
                  </div>
                  {!otpSent ? (
                    <button onClick={sendOtp} disabled={busy} className="w-full py-3 rounded-xl font-bold text-white disabled:opacity-50" style={{ background: BRAND }} data-testid="student-send-otp-btn">
                      {busy ? 'Envoi…' : 'Recevoir le code'}
                    </button>
                  ) : (
                    <>
                      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code à 6 chiffres" inputMode="numeric" maxLength={6}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none tracking-widest text-center" data-testid="student-otp-input" />
                      <button onClick={confirmOtp} disabled={busy} className="w-full py-3 rounded-xl font-bold text-white disabled:opacity-50" style={{ background: BRAND }} data-testid="student-confirm-otp-btn">
                        {busy ? 'Vérification…' : 'Valider mon statut'}
                      </button>
                      <button onClick={sendOtp} disabled={busy} className="w-full text-xs text-gray-500 underline" data-testid="student-resend-otp">Renvoyer le code</button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 mb-1">Envoyez votre carte étudiante ou certificat de scolarité. Validation sous 24-48h.</p>
                  <button onClick={() => uploadDoc('student_card')} disabled={busy} className="w-full flex items-center gap-3 border border-gray-200 rounded-xl p-3 active:bg-gray-50" data-testid="student-upload-card">
                    <IdentificationCard size={20} style={{ color: BRAND }} />
                    <span className="text-sm text-gray-800 flex-1 text-left">Carte étudiante</span>
                  </button>
                  <button onClick={() => uploadDoc('enrollment_certificate')} disabled={busy} className="w-full flex items-center gap-3 border border-gray-200 rounded-xl p-3 active:bg-gray-50" data-testid="student-upload-certificate">
                    <IdentificationCard size={20} style={{ color: BRAND }} />
                    <span className="text-sm text-gray-800 flex-1 text-left">Certificat de scolarité</span>
                  </button>
                  {(data?.documents || []).length > 0 && (
                    <div className="mt-2 space-y-1" data-testid="student-docs-list">
                      {data.documents.map((d, i) => (
                        <div key={i} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                          <span>{d.filename || d.type}</span>
                          <span className={d.status === 'approved' ? 'text-emerald-600' : d.status === 'rejected' ? 'text-red-500' : 'text-amber-500'}>
                            {d.status === 'approved' ? 'Approuvé' : d.status === 'rejected' ? 'Refusé' : 'En attente'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const CampusPassSection = ({ navigate, onChange }) => {
  const [plans, setPlans] = useState([]);
  const [sub, setSub] = useState(null);
  const [busy, setBusy] = useState('');
  const load = () => {
    studentAPI.campusPlans().then((r) => setPlans(r.data.plans || [])).catch(() => {});
    studentAPI.campusSubscription().then((r) => setSub(r.data.subscription)).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  const subscribe = async (planId) => {
    setBusy(planId);
    try {
      await studentAPI.campusSubscribe(planId);
      toast.success('Pass Campus activé 🎓');
      load(); onChange && onChange();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec de la souscription'); }
    finally { setBusy(''); }
  };
  const cancel = async () => {
    if (!window.confirm('Résilier votre Pass Campus ?')) return;
    try { await studentAPI.campusCancel(); toast.success('Pass résilié'); load(); } catch { toast.error('Échec'); }
  };

  if (sub) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="campus-active-sub">
        <div className="flex items-center gap-2 mb-1"><Crown size={20} weight="fill" className="text-amber-500" /><p className="font-bold text-gray-900">{sub.plan_name} actif</p></div>
        <p className="text-xs text-gray-500">Réduction permanente -{sub.discount_pct}% · Expire le {(sub.expires_at || '').split('T')[0]}</p>
        <button onClick={cancel} className="mt-2 text-xs text-red-500 font-semibold" data-testid="campus-cancel-btn">Résilier le Pass</button>
      </div>
    );
  }
  if (plans.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="campus-plans">
      <div className="flex items-center gap-2 mb-1"><Crown size={20} weight="fill" className="text-amber-500" /><p className="font-bold text-gray-900">Pass Campus</p></div>
      <p className="text-xs text-gray-500 mb-3">Abonnez-vous pour des réductions permanentes et des crédits inclus.</p>
      <div className="space-y-3">
        {plans.map((p) => (
          <div key={p.id} className="border border-gray-100 rounded-xl p-3" data-testid={`campus-plan-${p.id}`}>
            <div className="flex items-center justify-between">
              <div><p className="font-bold text-gray-900 text-sm">{p.name}</p><p className="text-xs text-gray-400">{p.type === 'semester' ? 'Semestriel' : 'Mensuel'} · -{p.discount_pct}%</p></div>
              <p className="font-black text-gray-900">{Number(p.price).toFixed(2)} €</p>
            </div>
            {(p.perks || []).length > 0 && (
              <ul className="mt-2 space-y-1">
                {p.perks.map((perk, i) => <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600"><Check size={13} className="text-emerald-500" />{perk}</li>)}
              </ul>
            )}
            <button onClick={() => subscribe(p.id)} disabled={busy === p.id} className="w-full mt-3 py-2.5 rounded-xl font-bold text-white disabled:opacity-50" style={{ background: BRAND }} data-testid={`campus-subscribe-${p.id}`}>
              {busy === p.id ? 'Souscription…' : 'Souscrire'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const Benefit = ({ pct, label }) => {
  if (!pct || pct <= 0) return null;
  return (
    <div className="flex items-center gap-2" data-testid="student-benefit">
      <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center"><Percent size={16} weight="bold" className="text-emerald-600" /></div>
      <p className="text-sm text-gray-700"><b className="text-emerald-700">-{pct}%</b> {label}</p>
    </div>
  );
};

export default SbStudentPage;
