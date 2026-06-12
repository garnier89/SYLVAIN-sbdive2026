import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { dispatchAdminAPI } from '../../services/api';
import {
  Broadcast, MapPin, Warning, Money, CreditCard, Wallet, Clock,
  ArrowRight, ShieldWarning, Power, ArrowCounterClockwise, CircleNotch, Bell, Car, Fire, Phone, TrendUp,
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

const fmtDateShort = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return "aujourd'hui";
    if (days === 1) return 'hier';
    return `il y a ${days} j`;
  } catch { return '—'; }
};

const AutoSurgeConfig = () => {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { dispatchAdminAPI.getAutoSurge().then((r) => setCfg(r.data)).catch(() => {}); }, []);

  if (!cfg) return null;
  const setTier = (i, key, val) => {
    const tiers = cfg.tiers.map((t, idx) => idx === i ? { ...t, [key]: parseFloat(val) || 0 } : t);
    setCfg({ ...cfg, tiers });
  };
  const save = async () => {
    setSaving(true);
    try { const r = await dispatchAdminAPI.saveAutoSurge(cfg); setCfg(r.data.config); toast.success('Surge auto sauvegardé'); }
    catch { toast.error('Échec'); } finally { setSaving(false); }
  };

  return (
    <Card className="mb-6" data-testid="auto-surge-config">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2"><TrendUp size={18} weight="bold" className="text-red-500" /> Tarification dynamique automatique (par commune)</span>
          <button onClick={() => setCfg({ ...cfg, enabled: !cfg.enabled })} data-testid="auto-surge-toggle"
            className={`w-12 h-7 rounded-full relative transition-colors ${cfg.enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
            <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${cfg.enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-gray-500 mb-3">Majoration auto du tarif quand la demande d'une commune (courses en attente) dépasse un palier. {cfg.enabled ? <span className="text-green-600 font-semibold">Actif</span> : <span className="text-gray-400 font-semibold">Inactif</span>}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {cfg.tiers.map((t, i) => (
            <div key={i} className="border border-gray-200 rounded-xl p-3" data-testid={`surge-tier-${i}`}>
              <label className="text-[11px] text-gray-500 font-semibold">À partir de (courses en attente)</label>
              <input type="number" value={t.min_pending} onChange={(e) => setTier(i, 'min_pending', e.target.value)} className="w-full border rounded-lg px-2 py-1 text-sm mb-2" data-testid={`surge-tier-min-${i}`} />
              <label className="text-[11px] text-gray-500 font-semibold">Multiplicateur</label>
              <input type="number" step="0.1" value={t.multiplier} onChange={(e) => setTier(i, 'multiplier', e.target.value)} className="w-full border rounded-lg px-2 py-1 text-sm" data-testid={`surge-tier-mult-${i}`} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <label className="text-xs font-semibold text-gray-600">Plafond x</label>
          <input type="number" step="0.1" value={cfg.cap} onChange={(e) => setCfg({ ...cfg, cap: parseFloat(e.target.value) || 2 })} className="w-20 border rounded-lg px-2 py-1 text-sm" data-testid="surge-cap" />
          <button onClick={save} disabled={saving} className="ml-auto bg-[#3b82f6] text-white text-sm font-bold px-5 py-2 rounded-lg disabled:opacity-50" data-testid="auto-surge-save">{saving ? 'Sauvegarde...' : 'Sauvegarder'}</button>
        </div>
      </CardContent>
    </Card>
  );
};

const NearbyOfflineDrivers = () => {
  const [data, setData] = useState(null);
  useEffect(() => {
    const load = () => dispatchAdminAPI.nearbyOfflineDrivers(14).then((r) => setData(r.data)).catch(() => {});
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);
  if (!data || data.count === 0) return null;
  return (
    <Card className="mb-6" data-testid="nearby-offline-drivers">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Power size={18} className="text-gray-400" /> Chauffeurs taxi à proximité (hors-ligne, actifs ≤ {data.days} j)
          <span className="text-xs font-normal text-gray-400">— appelez-les pour renforcer l'offre</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {data.drivers.map((d) => (
            <div key={d.driver_id} className="flex items-center justify-between gap-2 border border-gray-100 rounded-xl p-2.5 bg-gray-50/60" data-testid={`nearby-driver-${d.driver_id}`}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{d.name}</p>
                <p className="text-[11px] text-gray-500 truncate">{d.zone} · {d.vehicle_type || '—'} · {fmtDateShort(d.last_worked)}</p>
              </div>
              {d.phone && (
                <a href={`tel:${d.phone}`} className="shrink-0 inline-flex items-center gap-1 bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full" data-testid={`nearby-call-${d.driver_id}`}>
                  <Phone size={12} weight="fill" /> Appeler
                </a>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const heatBg = (intensity) => {
  // Red heat scale by demand intensity (0-100): faint → intense.
  const a = 0.12 + (Math.max(0, Math.min(100, intensity)) / 100) * 0.78;
  return `rgba(239, 68, 68, ${a.toFixed(2)})`;
};

const AdminDispatch = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [behavior, setBehavior] = useState(null);
  const [recruit, setRecruit] = useState(null);
  const [heat, setHeat] = useState(null);
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
      dispatchAdminAPI.taxiRecruitment().then((r) => setRecruit(r.data)).catch(() => {});
      dispatchAdminAPI.demandHeatmap().then((r) => setHeat(r.data)).catch(() => {});
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

      {/* Taxi recruitment alert — courier-only drivers in high-demand taxi zones */}
      {recruit?.totals?.hot_zones > 0 && (
        <Card className="mb-6 border-[#FF5000] bg-orange-50/50" data-testid="dispatch-recruit-widget">
          <CardContent className="p-4 flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-full bg-[#FF5000] flex items-center justify-center shrink-0">
              <Car size={20} weight="fill" className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold text-[#0B1426]">
                {recruit.totals.hot_zones} zone{recruit.totals.hot_zones > 1 ? 's' : ''} taxi en tension
              </p>
              <p className="text-xs text-gray-600">
                {recruit.totals.candidates} chauffeur{recruit.totals.candidates > 1 ? 's' : ''} livraison/coursier à proximité — activez ou invitez-les au Taxi pour absorber la demande.
              </p>
            </div>
            <Button onClick={() => navigate('/admin/taxi-recruitment')} className="bg-[#FF5000] hover:bg-[#e64900] text-white" data-testid="dispatch-recruit-cta">
              Recruter <ArrowRight size={14} className="ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tarification dynamique auto + chauffeurs hors-ligne à proximité */}
      <AutoSurgeConfig />
      <NearbyOfflineDrivers />

      {/* Demand heatmap by commune */}
      {heat?.communes?.length > 0 && (
        <Card className="mb-6" data-testid="dispatch-demand-heatmap">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
              <span className="flex items-center gap-2"><Fire size={18} weight="fill" className="text-red-500" /> Carte thermique de la demande (par commune)</span>
              <span className="text-xs font-normal text-gray-500">
                {heat.totals.pending} en attente · {heat.totals.today} demandes aujourd'hui · {heat.totals.communes_active} communes actives
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {heat.communes.map((c) => (
                <div key={c.zone} className="rounded-xl p-3 text-white relative overflow-hidden" style={{ backgroundColor: heatBg(c.intensity) }} data-testid={`heat-commune-${c.zone}`}>
                  <p className="text-xs font-bold truncate drop-shadow-sm" title={c.zone}>{c.zone}</p>
                  <p className="text-2xl font-extrabold leading-tight drop-shadow-sm">{c.pending}<span className="text-xs font-medium opacity-90"> en attente</span></p>
                  {c.surge_multiplier > 1 && (
                    <span className="inline-flex items-center gap-0.5 bg-white/90 text-red-600 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full mt-0.5" data-testid={`heat-surge-${c.zone}`}>
                      <TrendUp size={10} weight="bold" /> x{c.surge_multiplier}
                    </span>
                  )}
                  <div className="flex items-center justify-between mt-1 text-[10px] font-semibold">
                    <span className="opacity-90">{c.today} auj.</span>
                    <span className="opacity-90 flex items-center gap-0.5"><Power size={9} weight="fill" /> {c.online_taxi} taxi</span>
                  </div>
                  {c.deficit > 0 && (
                    <span className="absolute top-1.5 right-1.5 bg-white/90 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full" data-testid={`heat-deficit-${c.zone}`}>−{c.deficit}</span>
                  )}
                </div>
              ))}
            </div>
            {heat.unzoned && (heat.unzoned.pending > 0 || heat.unzoned.today > 0) && (
              <div className="mt-2.5 rounded-xl p-3 bg-gray-100 border border-gray-200 flex items-center justify-between" data-testid="heat-unzoned">
                <span className="text-xs font-semibold text-gray-600">Hors zone (demande non géolocalisée)</span>
                <span className="text-xs text-gray-500">{heat.unzoned.pending} en attente · {heat.unzoned.today} auj.</span>
              </div>
            )}
            <div className="flex items-center gap-3 mt-3 text-[10px] text-gray-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: heatBg(10) }} /> faible</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: heatBg(55) }} /> moyenne</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: heatBg(100) }} /> forte demande</span>
              <span className="ml-auto">−N = déficit chauffeurs taxi</span>
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
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate font-medium text-gray-700">{r.passenger_name || 'Client'}</span>
                        {r.passenger_phone && (
                          <a href={`tel:${r.passenger_phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-0.5 text-blue-600 font-semibold hover:underline" data-testid={`dispatch-ride-call-${r.id}`}>
                            <Phone size={11} weight="fill" /> {r.passenger_phone}
                          </a>
                        )}
                        <span className="text-gray-400">· {r.vehicle_type}</span>
                      </span>
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
                    {d.scheduled_suspended && (
                      <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700" title={`Réservations planifiées suspendues jusqu'au ${new Date(d.scheduled_suspended_until).toLocaleString('fr-FR')}`} data-testid={`sched-suspended-${d.id}`}>⏸ Planifiées bloquées</span>
                    )}
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
