import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapTrifold, Car, UsersThree, BellRinging, Polygon, UsersFour, Briefcase, ShieldCheck, Sparkle, Crown, Lock } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { fleetAPI, proAPI } from '../../../services/api';

const SbTrackingHub = () => {
  const navigate = useNavigate();
  const [ctx, setCtx] = useState(null);
  const [pro, setPro] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(() => {
    fleetAPI.context().then((r) => setCtx(r.data)).catch(() => {});
    proAPI.status().then((r) => setPro(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const seed = async () => {
    setSeeding(true);
    try { await fleetAPI.seedDemo(); toast.success('Démo activée — 3 véhicules en mouvement'); load(); navigate('/sb-tracking/carte'); }
    catch { toast.error('Erreur'); } finally { setSeeding(false); }
  };

  const isPro = !!pro?.active;
  const c = ctx?.counts || {};
  const tiles = [
    { key: 'carte', label: 'Carte temps réel', desc: 'Suivi GPS en direct', Icon: MapTrifold, to: '/sb-tracking/carte', accent: 'from-emerald-500 to-teal-600' },
    { key: 'vehicules', label: 'Véhicules', desc: `${c.vehicles || 0} véhicule(s)`, Icon: Car, to: '/sb-tracking/vehicules', accent: 'from-indigo-500 to-blue-600' },
    { key: 'conducteurs', label: 'Conducteurs', desc: `${c.drivers || 0} conducteur(s)`, Icon: UsersThree, to: '/sb-tracking/conducteurs', accent: 'from-fuchsia-500 to-purple-600' },
    { key: 'alertes', label: 'Alertes', desc: c.unread_alerts ? `${c.unread_alerts} non lue(s)` : 'Aucune alerte', Icon: BellRinging, to: '/sb-tracking/alertes', accent: 'from-rose-500 to-red-600', badge: c.unread_alerts },
    { key: 'zones', label: 'Géo-zones', desc: `${c.geofences || 0} zone(s)`, Icon: Polygon, to: '/sb-tracking/zones', accent: 'from-amber-500 to-orange-600' },
    { key: 'famille', label: 'Famille', desc: 'Localiser ses proches', Icon: UsersFour, to: '/famille', accent: 'from-pink-500 to-rose-500' },
    { key: 'employes', label: 'Employés', desc: 'Pointage & tournées', Icon: Briefcase, to: '/employes', accent: 'from-cyan-500 to-sky-600' },
    { key: 'securite', label: 'Sécurité', desc: 'Centre de sécurité', Icon: ShieldCheck, to: '/sb-tracking/securite', accent: 'from-red-500 to-rose-700', pro: true },
  ];

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="sb-tracking-hub">
      <div className="px-4 pt-5 pb-8 rounded-b-3xl text-white" style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a8a,#0e7490)' }}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/home')} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold flex items-center gap-1.5"><ShieldCheck size={22} weight="fill" /> SB Tracking</h1>
            <p className="text-[11px] text-white/70">Géolocalisation & gestion de flotte</p>
          </div>
          {isPro && <span className="text-[10px] font-extrabold bg-amber-300 text-amber-900 px-2 py-1 rounded-full flex items-center gap-1" data-testid="pro-badge"><Crown size={11} weight="fill" /> PRO</span>}
        </div>
        {ctx && (
          <div className="bg-white/10 rounded-2xl px-4 py-3 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{ctx.fleet.name}</p>
              <p className="text-[11px] text-white/60 capitalize">{ctx.role} • {ctx.fleet.kind === 'company' ? 'Entreprise' : 'Individuel'}</p>
            </div>
            {(c.vehicles || 0) === 0 && (
              <button onClick={seed} disabled={seeding} className="bg-white text-blue-800 text-xs font-extrabold px-3 py-2 rounded-full flex items-center gap-1 shrink-0 disabled:opacity-60" data-testid="seed-demo-btn">
                <Sparkle size={13} weight="fill" /> {seeding ? '...' : 'Activer la démo'}
              </button>
            )}
          </div>
        )}
      </div>

      {!isPro && (
        <button onClick={() => navigate('/sb-tracking/pro')} className="mx-4 -mt-4 mb-1 w-[calc(100%-2rem)] rounded-2xl p-3.5 flex items-center gap-3 text-white shadow-lg active:scale-[0.99] transition-transform" style={{ background: 'linear-gradient(135deg,#4338ca,#7c3aed)' }} data-testid="pro-cta-banner">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0"><Crown size={20} weight="fill" className="text-amber-300" /></div>
          <div className="flex-1 text-left"><p className="font-extrabold text-sm">Passez à SB Tracking Pro</p><p className="text-[11px] text-white/75">Commande à distance, sécurité, rapports PDF & plus</p></div>
          <span className="text-[11px] font-bold bg-white/20 px-2.5 py-1.5 rounded-full">Voir</span>
        </button>
      )}

      <div className="px-4 mt-3 grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <button key={t.key} disabled={t.soon} onClick={() => t.to && navigate(t.to)}
            className="relative bg-white rounded-2xl p-4 text-left shadow-sm disabled:opacity-60 active:scale-[0.98] transition-transform" data-testid={`tile-${t.key}`}>
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${t.accent} flex items-center justify-center mb-2`}>
              <t.Icon size={22} weight="fill" className="text-white" />
            </div>
            <p className="font-bold text-sm text-gray-900">{t.label}</p>
            <p className="text-[11px] text-gray-400">{t.desc}</p>
            {t.badge ? <span className="absolute top-3 right-3 bg-red-500 text-white text-[10px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center">{t.badge}</span> : null}
            {t.pro && !isPro ? <span className="absolute top-3 right-3 bg-indigo-100 text-indigo-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5" data-testid={`pro-lock-${t.key}`}><Lock size={9} weight="fill" /> PRO</span> : null}
            {t.soon ? <span className="absolute top-3 right-3 bg-gray-200 text-gray-500 text-[9px] font-bold px-1.5 py-0.5 rounded-full">Bientôt</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SbTrackingHub;
