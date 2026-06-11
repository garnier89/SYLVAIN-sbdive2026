/**
 * AdminStudent — SB Drive Student admin console.
 * Tabs: Tableau de bord (stats), Tarification (config), Domaines email, Étudiants (review).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { studentAPI } from '../../services/api';

const TABS = [
  { key: 'dashboard', label: 'Tableau de bord' },
  { key: 'pricing', label: 'Tarification' },
  { key: 'passes', label: 'Pass Campus' },
  { key: 'zones', label: 'Zones campus' },
  { key: 'rewards', label: 'Récompenses' },
  { key: 'events', label: 'Événements' },
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'domains', label: 'Domaines email' },
  { key: 'students', label: 'Étudiants' },
];

const AdminStudent = () => {
  const [tab, setTab] = useState('dashboard');
  return (
    <div className="p-6 max-w-5xl" data-testid="admin-student-page">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">SB Drive Student 🎓</h1>
      <p className="text-sm text-slate-500 mb-5">Offre de mobilité étudiante — vérification, tarifs, domaines et suivi.</p>
      <div className="flex gap-2 border-b border-slate-200 mb-5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`admin-student-tab-${t.key}`}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t.key ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'pricing' && <Pricing />}
      {tab === 'passes' && <Passes />}
      {tab === 'zones' && <CampusZones />}
      {tab === 'rewards' && <Rewards />}
      {tab === 'events' && <Events />}
      {tab === 'marketplace' && <Marketplace />}
      {tab === 'domains' && <Domains />}
      {tab === 'students' && <Students />}
    </div>
  );
};

const Stat = ({ label, value, color = 'text-slate-900' }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4">
    <p className="text-[11px] uppercase font-bold text-slate-400">{label}</p>
    <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
  </div>
);

const Dashboard = () => {
  const [s, setS] = useState(null);
  useEffect(() => { studentAPI.adminStats().then((r) => setS(r.data)).catch(() => {}); }, []);
  if (!s) return <p className="text-slate-400 text-sm">Chargement…</p>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="admin-student-stats">
      <Stat label="Étudiants inscrits" value={s.enrolled} />
      <Stat label="Vérifiés" value={s.verified} color="text-emerald-600" />
      <Stat label="En attente" value={s.pending} color="text-amber-500" />
      <Stat label="Refusés" value={s.rejected} color="text-red-500" />
      <Stat label="Courses étudiantes" value={s.student_rides} />
      <Stat label="Réductions (mois)" value={`${Number(s.discount_used_month).toFixed(2)} €`} />
      <Stat label="Réductions (total)" value={`${Number(s.discount_used_total).toFixed(2)} €`} />
      <Stat label="Taux de vérification" value={`${s.verification_rate}%`} />
    </div>
  );
};

const PricingField = ({ cfg, setCfg, k, label, suffix }) => (
  <div>
    <label className="text-xs font-semibold text-slate-600">{label}</label>
    <div className="flex items-center gap-2 mt-1">
      <input type="number" value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })}
        className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid={`student-cfg-${k}`} />
      <span className="text-sm text-slate-400">{suffix}</span>
    </div>
  </div>
);

const Pricing = () => {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { studentAPI.adminGetConfig().then((r) => setCfg(r.data)).catch(() => {}); }, []);
  const save = async () => {
    setSaving(true);
    try {
      const r = await studentAPI.adminUpdateConfig({
        enabled: cfg.enabled,
        ride_discount_pct: Number(cfg.ride_discount_pct),
        advance_discount_pct: Number(cfg.advance_discount_pct),
        campus_discount_pct: Number(cfg.campus_discount_pct),
        daily_cap: Number(cfg.daily_cap),
        monthly_cap: Number(cfg.monthly_cap),
      });
      setCfg(r.data);
      toast.success('Tarification enregistrée');
    } catch { toast.error('Échec de l\'enregistrement'); }
    finally { setSaving(false); }
  };
  if (!cfg) return <p className="text-slate-400 text-sm">Chargement…</p>;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-lg space-y-4" data-testid="admin-student-pricing">
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={!!cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} data-testid="student-cfg-enabled" />
        <span className="text-sm font-semibold text-slate-700">Module SB Student activé</span>
      </label>
      <div className="grid grid-cols-2 gap-4">
        <PricingField cfg={cfg} setCfg={setCfg} k="ride_discount_pct" label="Réduction courses" suffix="%" />
        <PricingField cfg={cfg} setCfg={setCfg} k="advance_discount_pct" label="Réduction réservation à l'avance" suffix="%" />
        <PricingField cfg={cfg} setCfg={setCfg} k="campus_discount_pct" label="Réduction campus ↔ domicile" suffix="%" />
        <div />
        <PricingField cfg={cfg} setCfg={setCfg} k="daily_cap" label="Plafond journalier (0 = illimité)" suffix="€" />
        <PricingField cfg={cfg} setCfg={setCfg} k="monthly_cap" label="Plafond mensuel (0 = illimité)" suffix="€" />
      </div>
      <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-lg font-bold text-white bg-violet-600 disabled:opacity-50" data-testid="student-cfg-save">
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </div>
  );
};

const Passes = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => { setLoading(true); studentAPI.campusAdminPlans().then((r) => setPlans(r.data.plans || [])).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);
  const patch = async (id, field, value) => { try { await studentAPI.campusAdminUpdatePlan(id, { [field]: value }); load(); } catch { toast.error('Échec'); } };
  const del = async (id) => { if (!window.confirm('Supprimer ce Pass ?')) return; try { await studentAPI.campusAdminDeletePlan(id); load(); } catch { toast.error('Échec'); } };
  const addPlan = async () => {
    try { await studentAPI.campusAdminCreatePlan({ name: 'Nouveau Pass', type: 'monthly', price: 9.99, duration_days: 30, discount_pct: 15, included_credits: 0, perks: [] }); toast.success('Pass créé'); load(); }
    catch { toast.error('Échec'); }
  };
  return (
    <div className="space-y-3" data-testid="admin-student-passes">
      <button onClick={addPlan} className="px-4 py-2 rounded-lg font-bold text-white bg-violet-600 text-sm" data-testid="pass-add-btn">+ Ajouter un Pass</button>
      {plans.map((p) => (
        <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4" data-testid={`pass-row-${p.id}`}>
          <div className="flex items-center justify-between mb-2">
            <input defaultValue={p.name} onBlur={(e) => e.target.value !== p.name && patch(p.id, 'name', e.target.value)} className="font-bold text-slate-800 border-b border-transparent focus:border-slate-300 outline-none" data-testid={`pass-name-${p.id}`} />
            <div className="flex items-center gap-3">
              <button onClick={() => patch(p.id, 'enabled', !p.enabled)} className={`px-2 py-1 rounded-full text-xs font-bold ${p.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`} data-testid={`pass-toggle-${p.id}`}>{p.enabled ? 'Actif' : 'Inactif'}</button>
              <button onClick={() => del(p.id)} className="text-red-500 text-xs font-semibold" data-testid={`pass-del-${p.id}`}>Suppr.</button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 text-xs">
            <PassNum p={p} k="price" label="Prix €" patch={patch} />
            <PassNum p={p} k="duration_days" label="Durée (j)" patch={patch} />
            <PassNum p={p} k="discount_pct" label="Réduc %" patch={patch} />
            <PassNum p={p} k="included_credits" label="Crédits €" patch={patch} />
          </div>
        </div>
      ))}
      {loading ? <p className="text-slate-400 text-sm">Chargement…</p> : plans.length === 0 && <p className="text-slate-400 text-sm">Aucun Pass.</p>}
    </div>
  );
};

const PassNum = ({ p, k, label, patch }) => (
  <div>
    <label className="text-[11px] font-semibold text-slate-500">{label}</label>
    <input type="number" defaultValue={p[k]} onBlur={(e) => Number(e.target.value) !== p[k] && patch(p.id, k, Number(e.target.value))} className="block w-full border border-slate-200 rounded-lg px-2 py-1.5 mt-0.5" data-testid={`pass-${k}-${p.id}`} />
  </div>
);

const ZONE_TYPES = [
  { key: 'university', label: 'Université' },
  { key: 'residence', label: 'Résidence étudiante' },
  { key: 'library', label: 'Bibliothèque' },
  { key: 'training_center', label: 'Centre de formation' },
];

const CampusZones = () => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', type: 'university', lat: '', lng: '', radius_m: 500, country: '' });
  const load = useCallback(() => { setLoading(true); studentAPI.zonesAdminList().then((r) => setList(r.data.zones || [])).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!form.name.trim() || form.lat === '' || form.lng === '') return toast.error('Nom, latitude et longitude requis');
    try {
      await studentAPI.zonesAdminCreate({ ...form, lat: Number(form.lat), lng: Number(form.lng), radius_m: Number(form.radius_m) });
      toast.success('Zone créée'); setForm({ name: '', type: 'university', lat: '', lng: '', radius_m: 500, country: '' }); load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
  };
  const toggle = async (z) => { try { await studentAPI.zonesAdminUpdate(z.id, { enabled: !z.enabled }); load(); } catch { toast.error('Échec'); } };
  const del = async (z) => { if (!window.confirm(`Supprimer ${z.name} ?`)) return; try { await studentAPI.zonesAdminDelete(z.id); load(); } catch { toast.error('Échec'); } };
  return (
    <div className="space-y-4" data-testid="admin-student-zones">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div><label className="text-xs font-semibold text-slate-600">Nom</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Campus Schoelcher" className="block w-44 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="zone-input-name" /></div>
        <div><label className="text-xs font-semibold text-slate-600">Type</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="block w-44 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="zone-input-type">{ZONE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
        <div><label className="text-xs font-semibold text-slate-600">Latitude</label><input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="14.6097" className="block w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="zone-input-lat" /></div>
        <div><label className="text-xs font-semibold text-slate-600">Longitude</label><input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="-61.0742" className="block w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="zone-input-lng" /></div>
        <div><label className="text-xs font-semibold text-slate-600">Rayon (m)</label><input type="number" value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: e.target.value })} className="block w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="zone-input-radius" /></div>
        <div><label className="text-xs font-semibold text-slate-600">Pays</label><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="FR / SN" maxLength={2} className="block w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="zone-input-country" /></div>
        <button onClick={add} className="px-4 py-2 rounded-lg font-bold text-white bg-violet-600" data-testid="zone-add-btn">Ajouter</button>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="text-left px-4 py-2">Zone</th><th className="text-left px-4 py-2">Type</th><th className="text-left px-4 py-2">Coordonnées</th><th className="text-left px-4 py-2">Rayon</th><th className="text-left px-4 py-2">Points</th><th className="text-left px-4 py-2">Statut</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {list.map((z) => (
              <tr key={z.id} className="border-t border-slate-100" data-testid={`zone-row-${z.id}`}>
                <td className="px-4 py-2 font-semibold">{z.name} <span className="text-xs text-slate-400">{z.country}</span></td>
                <td className="px-4 py-2 text-xs">{ZONE_TYPES.find((t) => t.key === z.type)?.label || z.type}</td>
                <td className="px-4 py-2 text-xs font-mono">{z.lat?.toFixed(4)}, {z.lng?.toFixed(4)}</td>
                <td className="px-4 py-2 text-xs">{z.radius_m} m</td>
                <td className="px-4 py-2 text-xs">{(z.pickup_points || []).length} prise · {(z.safe_meeting_points || []).length} sûr</td>
                <td className="px-4 py-2"><button onClick={() => toggle(z)} className={`px-2 py-1 rounded-full text-xs font-bold ${z.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`} data-testid={`zone-toggle-${z.id}`}>{z.enabled ? 'Actif' : 'Inactif'}</button></td>
                <td className="px-4 py-2 text-right"><button onClick={() => del(z)} className="text-red-500 text-xs font-semibold" data-testid={`zone-del-${z.id}`}>Supprimer</button></td>
              </tr>
            ))}
            {!loading && list.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Aucune zone campus.</td></tr>}
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Chargement…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Rewards = () => {
  const [cfg, setCfg] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const load = useCallback(() => {
    studentAPI.rewardsAdminConfig().then((r) => setCfg(r.data)).catch(() => {});
    studentAPI.rewardsAdminCatalog().then((r) => setCatalog(r.data.rewards || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const saveCfg = async () => { try { await studentAPI.rewardsAdminUpdateConfig({ enabled: cfg.enabled, points_per_ride: Number(cfg.points_per_ride), points_per_referral: Number(cfg.points_per_referral), signup_bonus: Number(cfg.signup_bonus) }); toast.success('Réglages enregistrés'); } catch { toast.error('Échec'); } };
  const patch = async (id, field, value) => { try { await studentAPI.rewardsAdminUpdate(id, { [field]: value }); load(); } catch { toast.error('Échec'); } };
  const del = async (id) => { if (!window.confirm('Supprimer ?')) return; try { await studentAPI.rewardsAdminDelete(id); load(); } catch { toast.error('Échec'); } };
  const add = async () => { try { await studentAPI.rewardsAdminCreate({ title: 'Nouvelle récompense', type: 'voucher', cost_points: 200, value: 5 }); toast.success('Ajoutée'); load(); } catch { toast.error('Échec'); } };
  if (!cfg) return <p className="text-slate-400 text-sm">Chargement…</p>;
  return (
    <div className="space-y-4" data-testid="admin-student-rewards">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} data-testid="rewards-cfg-enabled" /><span className="text-sm font-semibold">Activé</span></label>
        <div><label className="text-xs font-semibold text-slate-600">Points / course</label><input type="number" value={cfg.points_per_ride} onChange={(e) => setCfg({ ...cfg, points_per_ride: e.target.value })} className="block w-24 border border-slate-200 rounded-lg px-2 py-1.5 mt-1" data-testid="rewards-cfg-ride" /></div>
        <div><label className="text-xs font-semibold text-slate-600">Points / parrainage</label><input type="number" value={cfg.points_per_referral} onChange={(e) => setCfg({ ...cfg, points_per_referral: e.target.value })} className="block w-24 border border-slate-200 rounded-lg px-2 py-1.5 mt-1" data-testid="rewards-cfg-referral" /></div>
        <div><label className="text-xs font-semibold text-slate-600">Bonus inscription</label><input type="number" value={cfg.signup_bonus} onChange={(e) => setCfg({ ...cfg, signup_bonus: e.target.value })} className="block w-24 border border-slate-200 rounded-lg px-2 py-1.5 mt-1" data-testid="rewards-cfg-signup" /></div>
        <button onClick={saveCfg} className="px-4 py-2 rounded-lg font-bold text-white bg-violet-600 text-sm" data-testid="rewards-cfg-save">Enregistrer</button>
      </div>
      <button onClick={add} className="px-4 py-2 rounded-lg font-bold text-white bg-violet-600 text-sm" data-testid="reward-add-btn">+ Ajouter une récompense</button>
      {catalog.map((rw) => (
        <div key={rw.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3" data-testid={`reward-row-${rw.id}`}>
          <input defaultValue={rw.title} onBlur={(e) => e.target.value !== rw.title && patch(rw.id, 'title', e.target.value)} className="flex-1 font-semibold text-slate-800 border-b border-transparent focus:border-slate-300 outline-none" data-testid={`reward-title-${rw.id}`} />
          <input type="number" defaultValue={rw.cost_points} onBlur={(e) => Number(e.target.value) !== rw.cost_points && patch(rw.id, 'cost_points', Number(e.target.value))} className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" data-testid={`reward-cost-${rw.id}`} />
          <span className="text-xs text-slate-400">pts</span>
          <button onClick={() => patch(rw.id, 'enabled', !rw.enabled)} className={`px-2 py-1 rounded-full text-xs font-bold ${rw.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`} data-testid={`reward-toggle-${rw.id}`}>{rw.enabled ? 'Actif' : 'Inactif'}</button>
          <button onClick={() => del(rw.id)} className="text-red-500 text-xs font-semibold" data-testid={`reward-del-${rw.id}`}>Suppr.</button>
        </div>
      ))}
    </div>
  );
};

const EVENT_TYPES = [{ key: 'party', label: 'Soirée' }, { key: 'university', label: 'Universitaire' }, { key: 'festival', label: 'Festival' }];

const Events = () => {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ title: '', type: 'party', date: '', location: '', shuttle_enabled: true, shuttle_price: 0, capacity: 30 });
  const load = useCallback(() => { studentAPI.eventsAdminList().then((r) => setList(r.data.events || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!form.title.trim()) return toast.error('Titre requis');
    try { await studentAPI.eventAdminCreate({ ...form, shuttle_price: Number(form.shuttle_price), capacity: Number(form.capacity), date: form.date || null }); toast.success('Événement créé'); setForm({ title: '', type: 'party', date: '', location: '', shuttle_enabled: true, shuttle_price: 0, capacity: 30 }); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
  };
  const toggle = async (ev) => { try { await studentAPI.eventAdminUpdate(ev.id, { enabled: !ev.enabled }); load(); } catch { toast.error('Échec'); } };
  const del = async (ev) => { if (!window.confirm('Supprimer ?')) return; try { await studentAPI.eventAdminDelete(ev.id); load(); } catch { toast.error('Échec'); } };
  return (
    <div className="space-y-4" data-testid="admin-student-events">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div><label className="text-xs font-semibold text-slate-600">Titre</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="block w-48 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="event-input-title" /></div>
        <div><label className="text-xs font-semibold text-slate-600">Type</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="block w-40 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="event-input-type">{EVENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
        <div><label className="text-xs font-semibold text-slate-600">Date</label><input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value ? new Date(e.target.value).toISOString() : '' })} className="block border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="event-input-date" /></div>
        <div><label className="text-xs font-semibold text-slate-600">Lieu</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="block w-40 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="event-input-location" /></div>
        <div><label className="text-xs font-semibold text-slate-600">Prix navette €</label><input type="number" value={form.shuttle_price} onChange={(e) => setForm({ ...form, shuttle_price: e.target.value })} className="block w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="event-input-price" /></div>
        <div><label className="text-xs font-semibold text-slate-600">Capacité</label><input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="block w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="event-input-capacity" /></div>
        <button onClick={add} className="px-4 py-2 rounded-lg font-bold text-white bg-violet-600" data-testid="event-add-btn">Ajouter</button>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="text-left px-4 py-2">Événement</th><th className="text-left px-4 py-2">Type</th><th className="text-left px-4 py-2">Date</th><th className="text-left px-4 py-2">Navette</th><th className="text-left px-4 py-2">Réserv.</th><th className="text-left px-4 py-2">Statut</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {list.map((ev) => (
              <tr key={ev.id} className="border-t border-slate-100" data-testid={`event-row-${ev.id}`}>
                <td className="px-4 py-2 font-semibold">{ev.title}<div className="text-xs text-slate-400">{ev.location}</div></td>
                <td className="px-4 py-2 text-xs">{EVENT_TYPES.find((t) => t.key === ev.type)?.label}</td>
                <td className="px-4 py-2 text-xs">{ev.date ? new Date(ev.date).toLocaleDateString('fr-FR') : '—'}</td>
                <td className="px-4 py-2 text-xs">{ev.shuttle_enabled ? `${ev.shuttle_price} € / ${ev.capacity || '∞'}` : '—'}</td>
                <td className="px-4 py-2 text-xs">{ev.seats_taken || 0}</td>
                <td className="px-4 py-2"><button onClick={() => toggle(ev)} className={`px-2 py-1 rounded-full text-xs font-bold ${ev.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`} data-testid={`event-toggle-${ev.id}`}>{ev.enabled ? 'Actif' : 'Inactif'}</button></td>
                <td className="px-4 py-2 text-right"><button onClick={() => del(ev)} className="text-red-500 text-xs font-semibold" data-testid={`event-del-${ev.id}`}>Supprimer</button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Aucun événement.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Domains = () => {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ domain: '', label: '', country: '', enabled: true });
  const load = useCallback(() => { studentAPI.adminDomains().then((r) => setList(r.data.domains || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!form.domain.trim()) return toast.error('Domaine requis');
    try { await studentAPI.adminCreateDomain(form); toast.success('Domaine ajouté'); setForm({ domain: '', label: '', country: '', enabled: true }); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
  };
  const toggle = async (d) => { try { await studentAPI.adminUpdateDomain(d.id, { enabled: !d.enabled }); load(); } catch { toast.error('Échec'); } };
  const del = async (d) => { if (!window.confirm(`Supprimer ${d.domain} ?`)) return; try { await studentAPI.adminDeleteDomain(d.id); load(); } catch { toast.error('Échec'); } };
  return (
    <div className="space-y-4" data-testid="admin-student-domains">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div><label className="text-xs font-semibold text-slate-600">Domaine</label><input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="univ-x.fr" className="block w-44 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="domain-input-domain" /></div>
        <div><label className="text-xs font-semibold text-slate-600">Établissement</label><input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Université X" className="block w-48 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="domain-input-label" /></div>
        <div><label className="text-xs font-semibold text-slate-600">Pays (ISO)</label><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="FR / SN / CI" maxLength={2} className="block w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="domain-input-country" /></div>
        <button onClick={add} className="px-4 py-2 rounded-lg font-bold text-white bg-violet-600" data-testid="domain-add-btn">Ajouter</button>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="text-left px-4 py-2">Domaine</th><th className="text-left px-4 py-2">Établissement</th><th className="text-left px-4 py-2">Pays</th><th className="text-left px-4 py-2">Statut</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id} className="border-t border-slate-100" data-testid={`domain-row-${d.id}`}>
                <td className="px-4 py-2 font-mono">{d.domain}</td>
                <td className="px-4 py-2">{d.label || '—'}</td>
                <td className="px-4 py-2">{d.country || '—'}</td>
                <td className="px-4 py-2">
                  <button onClick={() => toggle(d)} className={`px-2 py-1 rounded-full text-xs font-bold ${d.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`} data-testid={`domain-toggle-${d.id}`}>{d.enabled ? 'Actif' : 'Inactif'}</button>
                </td>
                <td className="px-4 py-2 text-right"><button onClick={() => del(d)} className="text-red-500 text-xs font-semibold" data-testid={`domain-del-${d.id}`}>Supprimer</button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Aucun domaine.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Students = () => {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('');
  const load = useCallback(() => { studentAPI.adminList(filter).then((r) => setList(r.data.students || [])).catch(() => {}); }, [filter]);
  useEffect(() => { load(); }, [load]);
  const approve = async (uid) => { try { await studentAPI.adminApprove(uid); toast.success('Validé'); load(); } catch { toast.error('Échec'); } };
  const reject = async (uid) => { const reason = window.prompt('Motif du refus ?') || ''; try { await studentAPI.adminReject(uid, reason); toast.success('Refusé'); load(); } catch { toast.error('Échec'); } };
  const badge = (s) => s === 'verified' ? 'bg-emerald-100 text-emerald-700' : s === 'pending' ? 'bg-amber-100 text-amber-700' : s === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500';
  return (
    <div className="space-y-3" data-testid="admin-student-list">
      <div className="flex gap-2">
        {['', 'pending', 'verified', 'rejected'].map((f) => (
          <button key={f || 'all'} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${filter === f ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'}`} data-testid={`student-filter-${f || 'all'}`}>{f || 'Tous'}</button>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="text-left px-4 py-2">Étudiant</th><th className="text-left px-4 py-2">Méthode</th><th className="text-left px-4 py-2">Établissement</th><th className="text-left px-4 py-2">Statut</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.user_id} className="border-t border-slate-100" data-testid={`student-row-${p.user_id}`}>
                <td className="px-4 py-2"><p className="font-semibold text-slate-800">{p.user_name || '—'}</p><p className="text-xs text-slate-400">{p.user_email || p.university_email || ''}</p></td>
                <td className="px-4 py-2 text-xs">{p.method || '—'}</td>
                <td className="px-4 py-2 text-xs">{p.university || p.country || '—'}</td>
                <td className="px-4 py-2"><span className={`px-2 py-1 rounded-full text-xs font-bold ${badge(p.status)}`}>{p.status}</span></td>
                <td className="px-4 py-2 text-right">
                  {p.status !== 'verified' && <button onClick={() => approve(p.user_id)} className="text-emerald-600 text-xs font-bold mr-3" data-testid={`student-approve-${p.user_id}`}>Valider</button>}
                  {p.status !== 'rejected' && <button onClick={() => reject(p.user_id)} className="text-red-500 text-xs font-bold" data-testid={`student-reject-${p.user_id}`}>Refuser</button>}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Aucun étudiant.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ===== Marketplace boost config + revenue =====
const Marketplace = () => {
  const [cfg, setCfg] = useState(null);
  const [rev, setRev] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => {
    studentAPI.mktAdminBoostConfig().then((r) => setCfg(r.data)).catch(() => {});
    studentAPI.mktAdminBoostRevenue().then((r) => setRev(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const setPlan = (i, field, value) => {
    const plans = [...(cfg.plans || [])];
    plans[i] = { ...plans[i], [field]: value };
    setCfg({ ...cfg, plans });
  };
  const addPlan = () => setCfg({ ...cfg, plans: [...(cfg.plans || []), { days: 1, points: 25, price_eur: 0.5 }] });
  const removePlan = (i) => setCfg({ ...cfg, plans: cfg.plans.filter((_, j) => j !== i) });

  const save = async () => {
    setSaving(true);
    try {
      const plans = (cfg.plans || []).map((p) => ({ id: p.id, days: Number(p.days), points: Number(p.points), price_eur: Number(p.price_eur) }));
      await studentAPI.mktAdminUpdateBoostConfig({ enabled: cfg.enabled, plans });
      toast.success('Boost enregistré'); load();
    } catch { toast.error('Échec'); }
    finally { setSaving(false); }
  };

  if (!cfg) return <p className="text-sm text-slate-400">Chargement…</p>;
  return (
    <div className="space-y-5" data-testid="admin-mkt-boost">
      {rev && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Boosts" value={rev.total_boosts} />
          <Stat label="Revenu €" value={`${Number(rev.revenue_eur).toFixed(2)} €`} />
          <Stat label="Points dépensés" value={rev.points_spent} />
          <Stat label="Boosts actifs" value={rev.active_boosts} />
        </div>
      )}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800">Forfaits « Top annonce »</h3>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} data-testid="boost-enabled" /> Activé</label>
        </div>
        <div className="space-y-2">
          {(cfg.plans || []).map((p, i) => (
            <div key={i} className="flex items-end gap-2 flex-wrap" data-testid={`boost-plan-row-${i}`}>
              <Field label="Jours" value={p.days} onChange={(v) => setPlan(i, 'days', v)} />
              <Field label="Points" value={p.points} onChange={(v) => setPlan(i, 'points', v)} />
              <Field label="Prix €" value={p.price_eur} step="0.5" onChange={(v) => setPlan(i, 'price_eur', v)} />
              <button onClick={() => removePlan(i)} className="text-red-500 text-sm font-semibold pb-2">Suppr.</button>
            </div>
          ))}
        </div>
        <button onClick={addPlan} className="mt-2 text-sm font-semibold text-violet-700">+ Ajouter un forfait</button>
        <div className="mt-4">
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold disabled:opacity-50" data-testid="boost-save">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
      {rev?.recent?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-bold text-slate-800 mb-2">Boosts récents</h3>
          <div className="space-y-1 text-sm text-slate-600">
            {rev.recent.map((b) => (
              <div key={b.id} className="flex justify-between border-b border-slate-50 py-1">
                <span>{b.days}j · {b.method === 'points' ? `${b.points} pts` : `${Number(b.amount_eur).toFixed(2)} €`}</span>
                <span className="text-slate-400">{(b.created_at || '').split('T')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <DigestPanel />
      <SellerRepPanel />
    </div>
  );
};

// ===== Trusted-seller thresholds =====
const SellerRepPanel = () => {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { studentAPI.mktAdminSellerConfig().then((r) => setCfg(r.data)).catch(() => {}); }, []);
  const save = async () => {
    setSaving(true);
    try {
      await studentAPI.mktUpdateSellerConfig({ trusted_min_sales: Number(cfg.trusted_min_sales), trusted_min_rating: Number(cfg.trusted_min_rating) });
      toast.success('Seuils enregistrés');
    } catch { toast.error('Échec'); }
    finally { setSaving(false); }
  };
  if (!cfg) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4" data-testid="admin-seller-rep">
      <h3 className="font-bold text-slate-800 mb-3">Badge « Vendeur de confiance »</h3>
      <div className="flex items-end gap-2 flex-wrap">
        <Field label="Ventes min." value={cfg.trusted_min_sales} onChange={(v) => setCfg({ ...cfg, trusted_min_sales: v })} />
        <Field label="Note min." step="0.1" value={cfg.trusted_min_rating} onChange={(v) => setCfg({ ...cfg, trusted_min_rating: v })} />
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold disabled:opacity-50" data-testid="seller-rep-save">{saving ? '…' : 'Enregistrer'}</button>
      </div>
      <p className="text-xs text-slate-400 mt-2">Un vendeur obtient le badge à partir de {cfg.trusted_min_sales} ventes ET d'une note moyenne ≥ {cfg.trusted_min_rating}/5.</p>
    </div>
  );
};

// ===== Weekly digest config + manual trigger =====
const DigestPanel = () => {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const load = useCallback(() => { studentAPI.mktDigestConfig().then((r) => setCfg(r.data)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    setSaving(true);
    try {
      await studentAPI.mktUpdateDigestConfig({ enabled: cfg.enabled, send_day: Number(cfg.send_day), send_hour: Number(cfg.send_hour), max_items: Number(cfg.max_items) });
      toast.success('Récap hebdo enregistré'); load();
    } catch { toast.error('Échec'); }
    finally { setSaving(false); }
  };
  const sendNow = async () => {
    if (!window.confirm('Envoyer le récap « Top affaires » à tous les étudiants éligibles maintenant ?')) return;
    setSending(true);
    try { const r = await studentAPI.mktDigestSendNow(); toast.success(`Récap envoyé (${r.data.sent} étudiant·e·s, ${r.data.skipped} sans annonce)`); }
    catch { toast.error('Échec de l\'envoi'); }
    finally { setSending(false); }
  };
  const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  if (!cfg) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4" data-testid="admin-digest">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-800">Récap hebdo « Top affaires de ton campus »</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} data-testid="digest-enabled" /> Activé</label>
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-xs text-slate-400 mb-0.5">Jour d'envoi</label>
          <select value={cfg.send_day} onChange={(e) => setCfg({ ...cfg, send_day: e.target.value })} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white" data-testid="digest-day">
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
        <Field label="Heure" value={cfg.send_hour} onChange={(v) => setCfg({ ...cfg, send_hour: v })} />
        <Field label="Nb max" value={cfg.max_items} onChange={(v) => setCfg({ ...cfg, max_items: v })} />
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold disabled:opacity-50" data-testid="digest-save">{saving ? '…' : 'Enregistrer'}</button>
        <button onClick={sendNow} disabled={sending} className="px-4 py-2 rounded-lg border border-violet-600 text-violet-700 text-sm font-semibold disabled:opacity-50" data-testid="digest-send-now">{sending ? 'Envoi…' : 'Envoyer maintenant'}</button>
      </div>
      <p className="text-xs text-slate-400 mt-2">Envoyé chaque {DAYS[Number(cfg.send_day)] || 'Lundi'} vers {cfg.send_hour}h aux étudiants ayant activé le récap.</p>
    </div>
  );
};

const Field = ({ label, value, onChange, step }) => (
  <div>
    <label className="block text-xs text-slate-400 mb-0.5">{label}</label>
    <input type="number" step={step || '1'} value={value} onChange={(e) => onChange(e.target.value)}
      className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
  </div>
);


export default AdminStudent;
