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

export default AdminStudent;
