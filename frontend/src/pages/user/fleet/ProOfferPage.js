import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Crown, Check, Prohibit, ShieldCheck, FilePdf, Eye, Infinity as InfinityIcon, Sparkle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { proAPI } from '../../../services/api';

const FEATURES = [
  { Icon: Prohibit, text: 'Commande & contrôle (coupure moteur, verrouillage)' },
  { Icon: ShieldCheck, text: 'Centre de sécurité + scores de conduite' },
  { Icon: FilePdf, text: 'Rapports PDF (heures équipe & activité flotte)' },
  { Icon: Eye, text: 'Rôle Superviseur (vue équipe en lecture seule)' },
  { Icon: InfinityIcon, text: 'Véhicules & employés illimités' },
];

const ProOfferPage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const polled = useRef(false);

  const load = useCallback(() => { proAPI.status().then((r) => setStatus(r.data)).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);

  const poll = useCallback(async (sessionId, attempts = 0) => {
    if (attempts >= 8) { setVerifying(false); toast.error('Vérification du paiement expirée'); return; }
    try {
      const r = await proAPI.checkoutStatus(sessionId);
      if (r.data.payment_status === 'paid') { setVerifying(false); toast.success('Bienvenue dans SB Tracking Pro 🎉'); setStatus((s) => ({ ...s, ...r.data.pro })); load(); return; }
      if (r.data.status === 'expired') { setVerifying(false); toast.error('Session de paiement expirée'); return; }
    } catch { /* keep polling */ }
    setTimeout(() => poll(sessionId, attempts + 1), 2000);
  }, [load]);

  useEffect(() => {
    const sid = params.get('session_id');
    if (sid && !polled.current) {
      polled.current = true;
      setVerifying(true);
      poll(sid);
      params.delete('session_id'); setParams(params, { replace: true });
    }
  }, [params, setParams, poll]);

  const subscribe = async (pkgId) => {
    setBusy(pkgId);
    try {
      const r = await proAPI.checkout(pkgId, window.location.origin);
      window.location.href = r.data.url;
    } catch { toast.error('Impossible de démarrer le paiement'); setBusy(null); }
  };

  const packages = status?.packages || [];

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-12" data-testid="pro-offer-page">
      <div className="px-4 pt-5 pb-10 rounded-b-[28px] text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#1e1b4b,#4338ca,#7c3aed)' }}>
        <div className="flex items-center gap-3 mb-5 relative z-10">
          <button onClick={() => navigate('/sb-tracking')} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
          <h1 className="text-lg font-extrabold flex items-center gap-1.5"><Crown size={20} weight="fill" className="text-amber-300" /> SB Tracking Pro</h1>
        </div>
        <div className="relative z-10">
          <p className="text-2xl font-extrabold leading-tight">Pilotez votre flotte<br />comme un pro.</p>
          <p className="text-sm text-white/75 mt-2">Commande à distance, supervision, rapports et sécurité avancée — débloquez tout le potentiel de SB Tracking.</p>
        </div>
        <Crown size={150} weight="fill" className="absolute -right-6 -bottom-6 text-white/5" />
      </div>

      <div className="p-4 space-y-5 -mt-6">
        {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" /></div> : (
          <>
            {status?.active ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3" data-testid="pro-active-banner">
                <div className="w-11 h-11 rounded-full bg-emerald-500 flex items-center justify-center"><Crown size={22} weight="fill" className="text-white" /></div>
                <div className="flex-1"><p className="font-extrabold text-emerald-800">Abonnement Pro actif</p><p className="text-xs text-emerald-600">{status.days_left} jour(s) restant(s) • {status.plan === 'pro_annual' ? 'Annuel' : 'Mensuel'}</p></div>
              </div>
            ) : verifying ? (
              <div className="bg-white rounded-2xl p-5 text-center shadow-sm" data-testid="verifying-banner"><div className="w-7 h-7 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-2" /><p className="text-sm font-bold text-gray-700">Vérification de votre paiement…</p></div>
            ) : null}

            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="font-bold text-gray-900 mb-3 flex items-center gap-1.5"><Sparkle size={16} weight="fill" className="text-amber-500" /> Tout ce que Pro débloque</p>
              <div className="space-y-2.5">
                {FEATURES.map((f, i) => (
                  <div key={i} className="flex items-center gap-3" data-testid={`feature-${i}`}>
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0"><f.Icon size={16} weight="fill" className="text-indigo-600" /></div>
                    <p className="text-sm text-gray-700 flex-1">{f.text}</p>
                    <Check size={16} weight="bold" className="text-emerald-500" />
                  </div>
                ))}
              </div>
            </div>

            {!status?.active && (
              <div className="space-y-3">
                {packages.map((p) => {
                  const annual = p.id === 'pro_annual';
                  return (
                    <div key={p.id} className={`rounded-2xl p-4 border-2 ${annual ? 'border-indigo-500 bg-indigo-50/40' : 'border-gray-200 bg-white'}`} data-testid={`plan-${p.id}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-extrabold text-gray-900 flex items-center gap-2">{p.label.replace('SB Tracking Pro — ', '')}{annual && <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">−20%</span>}</p>
                          <p className="text-xs text-gray-400">{annual ? 'Facturé annuellement' : 'Par mois, sans engagement'}</p>
                        </div>
                        <div className="text-right"><p className="text-xl font-extrabold text-gray-900">{p.amount.toFixed(2)} €</p><p className="text-[10px] text-gray-400">{annual ? '/ an' : '/ mois'}</p></div>
                      </div>
                      <button onClick={() => subscribe(p.id)} disabled={busy === p.id} className={`w-full mt-3 py-3 rounded-xl font-bold text-sm disabled:opacity-60 ${annual ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-white'}`} data-testid={`subscribe-${p.id}`}>
                        {busy === p.id ? 'Redirection…' : 'Choisir ce forfait'}
                      </button>
                    </div>
                  );
                })}
                <p className="text-[11px] text-gray-400 text-center px-4">Paiement sécurisé via Stripe. L'accès Pro couvre votre flotte/équipe ; vos employés & superviseurs en bénéficient.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ProOfferPage;
