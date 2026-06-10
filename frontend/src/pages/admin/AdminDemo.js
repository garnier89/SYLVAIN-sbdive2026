/**
 * AdminDemo — one-click "Seed démo / Reset démo" for live demonstrations.
 * Seed : crée les aéroports CDG/Orly (si absents) + passe les chauffeurs démo en ligne.
 * Reset: repasse les chauffeurs démo hors-ligne (les aéroports sont conservés).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Sparkle, ArrowCounterClockwise, AirplaneTilt, Car, CheckCircle, XCircle } from '@phosphor-icons/react';
import { demoAPI } from '../../services/api';

const AdminDemo = () => {
  const [status, setStatus] = useState({ airports: [], drivers: [], demo_rides_count: 0 });
  const [busy, setBusy] = useState(false);
  const [cleanRides, setCleanRides] = useState(false);

  const load = useCallback(() => {
    demoAPI.status().then((r) => setStatus(r.data || { airports: [], drivers: [], demo_rides_count: 0 })).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const seed = async () => {
    setBusy(true);
    try {
      const r = await demoAPI.seed();
      toast.success(`Démo activée · ${r.data.drivers_online?.length || 0} chauffeur(s) en ligne`);
      load();
    } catch { toast.error('Échec du seed démo'); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    setBusy(true);
    try {
      const r = await demoAPI.reset(cleanRides);
      toast.success(cleanRides ? `Réinitialisé · ${r.data.rides_deleted || 0} course(s) démo supprimée(s)` : 'Chauffeurs démo repassés hors-ligne');
      load();
    } catch { toast.error('Échec du reset démo'); }
    finally { setBusy(false); }
  };

  const Pill = ({ ok }) => (ok
    ? <CheckCircle size={18} weight="fill" className="text-emerald-500" />
    : <XCircle size={18} weight="fill" className="text-gray-300" />);

  return (
    <div className="p-4 max-w-3xl mx-auto" data-testid="admin-demo-page">
      <div className="flex items-center gap-2 mb-1">
        <Sparkle size={26} weight="fill" className="text-[#FF5000]" />
        <h1 className="text-xl font-black text-[#0B1426]">Données de démonstration</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">Activez un jeu de démarrage (aéroports + chauffeurs en ligne) pour vos démos, en un clic.</p>

      <div className="grid sm:grid-cols-2 gap-3 mb-5">
        <button onClick={seed} disabled={busy} className="rounded-2xl bg-[#FF5000] text-white p-4 text-left active:scale-[0.98] transition-transform disabled:opacity-50" data-testid="demo-seed-btn">
          <Sparkle size={22} weight="fill" />
          <p className="font-black text-lg mt-2">Activer la démo</p>
          <p className="text-xs text-white/80">CDG + Orly · 3 chauffeurs en ligne (Paris)</p>
        </button>
        <button onClick={reset} disabled={busy} className="rounded-2xl bg-white border-2 border-gray-200 text-[#0B1426] p-4 text-left active:scale-[0.98] transition-transform disabled:opacity-50" data-testid="demo-reset-btn">
          <ArrowCounterClockwise size={22} weight="bold" className="text-gray-500" />
          <p className="font-black text-lg mt-2">Réinitialiser</p>
          <p className="text-xs text-gray-500">Chauffeurs hors-ligne · aéroports conservés</p>
        </button>
      </div>

      <label className="flex items-center gap-2 mb-5 cursor-pointer select-none" data-testid="demo-clean-rides-toggle">
        <input type="checkbox" checked={cleanRides} onChange={(e) => setCleanRides(e.target.checked)} className="w-4 h-4 accent-[#FF5000]" />
        <span className="text-sm text-gray-700">Lors du reset, <b>supprimer aussi les courses des chauffeurs démo</b> {status.demo_rides_count ? <span className="text-[#FF5000] font-bold">({status.demo_rides_count})</span> : null}</span>
      </label>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
        <h3 className="font-bold text-sm text-[#0B1426] mb-2 flex items-center gap-1.5"><AirplaneTilt size={16} className="text-[#0EA5E9]" /> Aéroports démo</h3>
        {status.airports.map((a) => (
          <div key={a.code} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0" data-testid={`demo-airport-${a.code}`}>
            <span className="text-sm text-gray-700">{a.code}</span><Pill ok={a.exists} />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <h3 className="font-bold text-sm text-[#0B1426] mb-2 flex items-center gap-1.5"><Car size={16} className="text-[#FF5000]" /> Chauffeurs démo</h3>
        {status.drivers.map((d) => (
          <div key={d.email} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0" data-testid={`demo-driver-${d.email}`}>
            <span className="text-sm text-gray-700">{d.name || d.email} <span className="text-[11px] text-gray-400">{d.online ? '· en ligne' : '· hors-ligne'}</span></span>
            <Pill ok={d.online} />
          </div>
        ))}
      </div>

      <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
        ⚠️ Les chauffeurs démo apparaissent en ligne mais ne sont pas pilotés : ils ne valideront pas réellement une course. Pensez à <b>réinitialiser</b> avant l'arrivée de vrais clients.
      </p>
    </div>
  );
};

export default AdminDemo;
