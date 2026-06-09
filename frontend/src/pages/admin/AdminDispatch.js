import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { dispatchAdminAPI } from '../../services/api';
import {
  Broadcast, MapPin, Warning, Money, CreditCard, Wallet, Clock,
  ArrowRight, ShieldWarning, Power, ArrowCounterClockwise, CircleNotch, Bell,
} from '@phosphor-icons/react';
import { toast } from 'sonner';

const fmtAge = (s) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const TierBadge = ({ tier }) => {
  const map = {
    0: { label: 'Diffusion', cls: 'bg-gray-100 text-gray-600' },
    1: { label: 'Tier 1 ⚡', cls: 'bg-amber-100 text-amber-700 border border-amber-300' },
    2: { label: 'Tier 2 🔥', cls: 'bg-red-100 text-red-700 border border-red-300 animate-pulse' },
  };
  const m = map[tier] || map[0];
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.cls}`} data-testid={`tier-badge-${tier}`}>{m.label}</span>;
};

const PayChip = ({ method }) => {
  const m = (method || '').toLowerCase();
  if (['card', 'cb', 'credit_card', 'stripe', 'carte'].includes(m)) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700"><CreditCard size={11} weight="fill" /> CB</span>;
  }
  if (['wallet', 'paygo'].includes(m)) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700"><Wallet size={11} weight="fill" /> Wallet</span>;
  }
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><Money size={11} weight="fill" /> Espèces</span>;
};

const AdminDispatch = () => {
  const [overview, setOverview] = useState(null);
  const [behavior, setBehavior] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [tick, setTick] = useState(0); // forces age re-render every second
  const refreshing = useRef(false);
  const prevAlerts = useRef(null);
  const prevFlagged = useRef(null);
  const audioRef = useRef(null);

  const beep = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = audioRef.current || new Ctx();
      audioRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.setValueAtTime(660, ctx.currentTime + 0.18);
      g.gain.setValueAtTime(0.18, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
      o.start(); o.stop(ctx.currentTime + 0.55);
    } catch { /* audio not available */ }
  }, []);

  const load = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const [ov, bh] = await Promise.all([
        dispatchAdminAPI.overview(),
        dispatchAdminAPI.driverBehavior(),
      ]);
      setOverview(ov.data);
      setBehavior(bh.data);
      if (!cfg) setCfg(ov.data.config);
      // Live alerting: beep + toast when a NEW no-driver zone or flagged driver appears.
      const alertZones = new Set((ov.data.zones || []).filter((z) => z.alert).map((z) => z.zone));
      const flagged = new Set((bh.data.drivers || []).filter((d) => d.flagged).map((d) => d.id));
      if (prevAlerts.current !== null) {
        if ([...alertZones].some((z) => !prevAlerts.current.has(z))) {
          beep(); toast.error('🚨 Zone sans chauffeur détectée — réaffectez un chauffeur', { duration: 8000 });
        }
        if ([...flagged].some((id) => !prevFlagged.current.has(id))) {
          beep(); toast.warning('🚩 Chauffeur signalé (annulations sans espèces)', { duration: 8000 });
        }
      }
      prevAlerts.current = alertZones;
      prevFlagged.current = flagged;
    } catch (e) {
      console.error('dispatch load failed', e);
    } finally {
      refreshing.current = false;
    }
  }, [cfg, beep]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  // local 1s timer so the age counters tick smoothly between 5s fetches
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const saveCfg = async () => {
    setSavingCfg(true);
    try {
      await dispatchAdminAPI.updateConfig({
        max_refusals_before_offline: Number(cfg.max_refusals_before_offline) || 0,
        refusal_window_minutes: Number(cfg.refusal_window_minutes) || 60,
        cb_cancel_flag_pct: Number(cfg.cb_cancel_flag_pct) || 0,
        cb_cancel_flag_min: Number(cfg.cb_cancel_flag_min) || 0,
      });
      toast.success('Réglages enregistrés');
      load();
    } catch { toast.error('Échec de l\'enregistrement'); }
    finally { setSavingCfg(false); }
  };

  const suspend = async (id, name) => {
    if (!window.confirm(`Suspendre le chauffeur « ${name} » ? Il passera hors-ligne et ne pourra plus accepter de courses.`)) return;
    try { await dispatchAdminAPI.suspendDriver(id); toast.success('Chauffeur suspendu'); load(); }
    catch { toast.error('Échec de la suspension'); }
  };
  const reinstate = async (id) => {
    try { await dispatchAdminAPI.reinstateDriver(id); toast.success('Chauffeur réactivé'); load(); }
    catch { toast.error('Échec de la réactivation'); }
  };

  const totals = overview?.totals || { pending: 0, online_drivers: 0, no_driver_alerts: 0 };
  const elapsed = (ageBase) => ageBase + (overview ? Math.floor((Date.now() - new Date(overview.server_time).getTime()) / 1000) : 0);

  return (
    <div className="p-6" data-testid="admin-dispatch">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Broadcast size={26} weight="fill" className="text-[#FF5000]" /> Tour de contrôle dispatch
          </h1>
          <p className="text-sm text-gray-500">Supervision temps réel — courses en attente, chauffeurs en ligne &amp; comportements</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative" title="Alertes zones sans chauffeur" data-testid="dispatch-bell">
            <Bell size={24} weight={totals.no_driver_alerts ? 'fill' : 'regular'} className={totals.no_driver_alerts ? 'text-red-500 animate-bounce' : 'text-gray-400'} />
            {totals.no_driver_alerts > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{totals.no_driver_alerts}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" /> EN DIRECT (5s)
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card data-testid="total-pending"><CardContent className="p-4">
          <p className="text-xs text-gray-500 font-semibold">Courses en attente</p>
          <p className="text-3xl font-extrabold text-gray-800">{totals.pending}</p>
        </CardContent></Card>
        <Card data-testid="total-online"><CardContent className="p-4">
          <p className="text-xs text-gray-500 font-semibold">Chauffeurs en ligne</p>
          <p className="text-3xl font-extrabold text-emerald-600">{totals.online_drivers}</p>
        </CardContent></Card>
        <Card data-testid="total-alerts" className={totals.no_driver_alerts ? 'border-red-300' : ''}><CardContent className="p-4">
          <p className="text-xs text-gray-500 font-semibold flex items-center gap-1"><Warning size={13} className="text-red-500" /> Zones sans chauffeur</p>
          <p className={`text-3xl font-extrabold ${totals.no_driver_alerts ? 'text-red-600' : 'text-gray-800'}`}>{totals.no_driver_alerts}</p>
        </CardContent></Card>
      </div>

      {/* Config bar */}
      {cfg && (
        <Card className="mb-6 border-orange-200">
          <CardHeader><CardTitle className="text-base">Règles de discipline</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Hors-ligne auto après X refus (0 = off)</label>
              <Input type="number" min="0" value={cfg.max_refusals_before_offline ?? 0} onChange={(e) => setCfg({ ...cfg, max_refusals_before_offline: e.target.value })} data-testid="cfg-max-refusals" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Fenêtre refus (min)</label>
              <Input type="number" min="1" value={cfg.refusal_window_minutes ?? 60} onChange={(e) => setCfg({ ...cfg, refusal_window_minutes: e.target.value })} data-testid="cfg-refusal-window" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Drapeau si annul. CB ≥ (%)</label>
              <Input type="number" min="0" max="100" value={cfg.cb_cancel_flag_pct ?? 30} onChange={(e) => setCfg({ ...cfg, cb_cancel_flag_pct: e.target.value })} data-testid="cfg-cb-pct" />
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600 block mb-1">Min. annulations</label>
                <Input type="number" min="1" value={cfg.cb_cancel_flag_min ?? 3} onChange={(e) => setCfg({ ...cfg, cb_cancel_flag_min: e.target.value })} data-testid="cfg-cb-min" />
              </div>
              <Button onClick={saveCfg} disabled={savingCfg} className="bg-orange-500 hover:bg-orange-600 text-white" data-testid="cfg-save-btn">{savingCfg ? '…' : 'Enregistrer'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Zones */}
      <h2 className="text-lg font-bold text-gray-700 mb-3">Zones</h2>
      {!overview ? (
        <div className="flex items-center gap-2 text-gray-400 py-8"><CircleNotch size={20} className="animate-spin" /> Chargement…</div>
      ) : overview.zones.length === 0 ? (
        <p className="text-sm text-gray-400 py-6">Aucune course en attente ni chauffeur en ligne pour le moment.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {overview.zones.map((z) => (
            <Card key={z.zone} className={z.alert ? 'border-red-400 shadow-red-100 shadow-md' : ''} data-testid={`zone-card-${z.zone}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2"><MapPin size={18} weight="fill" className="text-[#FF5000]" /> {z.zone}</span>
                  <span className="flex items-center gap-2">
                    {z.alert && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white flex items-center gap-1" data-testid="zone-alert"><Warning size={11} weight="fill" /> AUCUN CHAUFFEUR</span>}
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">{z.online_drivers} en ligne</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">{z.pending} en attente</span>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {z.rides.length === 0 && <p className="text-xs text-gray-400">Aucune course en attente.</p>}
                {z.rides.map((r) => (
                  <div key={r.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50/60" data-testid={`dispatch-ride-${r.id}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <TierBadge tier={r.tier} />
                        <PayChip method={r.payment_method} />
                        {r.scheduled && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">📅 Planifiée{!r.due ? ' (en pool)' : ''}</span>}
                      </div>
                      <span className="flex items-center gap-1 text-xs font-mono font-bold text-gray-600"><Clock size={12} /> {fmtAge(elapsed(r.age_seconds))}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-700">
                      <span className="font-semibold truncate max-w-[40%]">{r.pickup_address || '—'}</span>
                      <ArrowRight size={12} className="text-gray-400 flex-shrink-0" />
                      <span className="truncate max-w-[40%]">{r.dropoff_address || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[11px] text-gray-500">
                      <span>{r.passenger_name || 'Client'} · {r.vehicle_type}</span>
                      <span className="font-bold text-gray-700">{(r.estimated_fare || 0).toFixed(2)} €</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Driver behaviour */}
      <h2 className="text-lg font-bold text-gray-700 mb-1 flex items-center gap-2"><ShieldWarning size={20} className="text-red-500" /> Comportement chauffeurs</h2>
      <p className="text-xs text-gray-500 mb-3">
        Drapeau rouge quand le taux d'annulation sur courses <strong>sans espèces (CB ou Wallet)</strong> ≥ {behavior?.flag_pct ?? 30}% (min. {behavior?.flag_min ?? 3} annulations).
        Détecte les chauffeurs qui acceptent puis annulent les courses payées par carte ou portefeuille (clients pris « au black »).
      </p>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="p-3">Chauffeur</th>
                <th className="p-3">Statut</th>
                <th className="p-3 text-center">Accept→Annul.</th>
                <th className="p-3 text-center">dont sans esp.</th>
                <th className="p-3 text-center">% sans esp.</th>
                <th className="p-3 text-center">Refus récents</th>
                <th className="p-3 text-center">Alertes chat</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {!behavior ? (
                <tr><td colSpan={8} className="p-6 text-center text-gray-400"><CircleNotch size={18} className="animate-spin inline" /></td></tr>
              ) : behavior.drivers.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-gray-400">Aucun comportement à signaler.</td></tr>
              ) : behavior.drivers.map((d) => (
                <tr key={d.id} className={`border-b last:border-0 ${d.flagged ? 'bg-red-50' : ''}`} data-testid={`behavior-row-${d.id}`}>
                  <td className="p-3 font-semibold text-gray-800">
                    {d.flagged && <span className="mr-1.5" title="Comportement à risque">🚩</span>}{d.name}
                  </td>
                  <td className="p-3">
                    {d.status === 'suspended'
                      ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">Suspendu</span>
                      : <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${d.is_online ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{d.is_online ? 'En ligne' : 'Hors-ligne'}</span>}
                  </td>
                  <td className="p-3 text-center">{d.accept_release_count}</td>
                  <td className="p-3 text-center">{d.accept_release_cb_count}</td>
                  <td className={`p-3 text-center font-bold ${d.flagged ? 'text-red-600' : 'text-gray-600'}`}>{d.cb_cancel_ratio}%</td>
                  <td className="p-3 text-center">{d.recent_refusals}</td>
                  <td className="p-3 text-center">{d.chat_flags > 0 ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">🚩 {d.chat_flags}</span> : <span className="text-gray-300">0</span>}</td>
                  <td className="p-3 text-right">
                    {d.status === 'suspended'
                      ? <Button size="sm" variant="outline" onClick={() => reinstate(d.id)} data-testid={`reinstate-${d.id}`}><ArrowCounterClockwise size={14} className="mr-1" /> Réintégrer</Button>
                      : <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => suspend(d.id, d.name)} data-testid={`suspend-${d.id}`}><Power size={14} className="mr-1" /> Suspendre</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDispatch;
