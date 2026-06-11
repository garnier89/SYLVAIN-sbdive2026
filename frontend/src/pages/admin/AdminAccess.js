/**
 * AdminAccess — Console admin SB Drive Access (transport adapté PMR / handicap).
 * Onglets : Vue d'ensemble, Catégories & tarifs PMR, Réglages (zones + Safe Ride Night),
 * Chauffeurs Access (certification), Réservations.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { accessAPI } from '../../services/api';

const NAVY = '#0A2540';
const TABS = [
  { key: 'dashboard', label: "Vue d'ensemble" },
  { key: 'categories', label: 'Catégories & tarifs' },
  { key: 'settings', label: 'Réglages & Safe Ride Night' },
  { key: 'drivers', label: 'Chauffeurs Access' },
  { key: 'bookings', label: 'Réservations' },
];

const CAP_FIELDS = [
  { key: 'ramp', label: 'Rampe' },
  { key: 'lift', label: 'Plateforme élévatrice' },
  { key: 'wheelchair_anchor', label: 'Ancrage fauteuil' },
  { key: 'extra_space', label: 'Espace étendu' },
  { key: 'medical_trunk', label: 'Coffre médical' },
  { key: 'install_help', label: "Aide à l'installation" },
];

const AdminAccess = () => {
  const [tab, setTab] = useState('dashboard');
  return (
    <div className="p-6 max-w-5xl" data-testid="admin-access-page">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">SB Drive Access ♿</h1>
      <p className="text-sm text-slate-500 mb-5">Transport adapté & inclusif — catégories, tarifs PMR, zones, Safe Ride Night et certification chauffeurs.</p>
      <div className="flex gap-2 border-b border-slate-200 mb-5 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`admin-access-tab-${t.key}`}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t.key ? 'border-[#0A2540] text-[#0A2540]' : 'border-transparent text-slate-500'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'categories' && <Categories />}
      {tab === 'settings' && <Settings />}
      {tab === 'drivers' && <Drivers />}
      {tab === 'bookings' && <Bookings />}
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
  useEffect(() => { accessAPI.adminStats().then((r) => setS(r.data)).catch(() => {}); }, []);
  if (!s) return <p className="text-slate-400 text-sm">Chargement…</p>;
  const bt = s.bookings_by_type || {};
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="admin-access-stats">
      <Stat label="Réservations totales" value={s.total_bookings} />
      <Stat label="Courses chauffeur certifié" value={`${s.certified_ride_rate}%`} color="text-emerald-600" />
      <Stat label="Chauffeurs certifiés" value={s.certified_drivers} color="text-[#0A2540]" />
      <Stat label="Catégories PMR actives" value={s.pmr_categories_available} />
      <Stat label="Trajets standard" value={bt.standard || 0} />
      <Stat label="Trajets médicaux" value={bt.medical || 0} color="text-rose-500" />
      <Stat label="Trajets récurrents" value={bt.recurring || 0} color="text-amber-500" />
    </div>
  );
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
    {children}
  </label>
);
const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-[#0A2540]';

const Categories = () => {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => { accessAPI.adminCategories().then((r) => setItems(r.data.items || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const blank = () => ({ key: '', name: '', description: '', capabilities: {}, capacity_passengers: 4, capacity_wheelchairs: 0, base_fare: 0, price_per_km: 0, price_per_min: 0, min_fare: 0, icon: 'Wheelchair', active: true, display_order: 99, scope: { country: '', state: '', city: '' } });

  const save = async () => {
    const e = editing;
    try {
      if (e.id) await accessAPI.adminUpdateCategory(e.id, e);
      else await accessAPI.adminCreateCategory(e);
      toast.success('Catégorie enregistrée');
      setEditing(null); load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };
  const del = async (id) => {
    if (!window.confirm('Supprimer cette catégorie ?')) return;
    try { await accessAPI.adminDeleteCategory(id); load(); } catch { toast.error('Échec'); }
  };

  return (
    <div data-testid="admin-access-categories">
      <button onClick={() => setEditing(blank())} data-testid="access-add-category-btn"
        className="mb-4 px-4 py-2 text-sm font-bold text-white rounded-lg" style={{ background: NAVY }}>+ Nouvelle catégorie</button>
      <div className="space-y-2">
        {items.map((c) => (
          <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3" data-testid={`access-cat-row-${c.key}`}>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900">{c.name} {!c.active && <span className="text-xs text-slate-400">(inactif)</span>}</p>
              <p className="text-xs text-slate-500 truncate">{c.description}</p>
              <p className="text-xs text-slate-600 mt-1">Base {c.base_fare}€ · {c.price_per_km}€/km · {c.price_per_min}€/min · min {c.min_fare}€ · {c.capacity_wheelchairs} fauteuil(s) · {c.capacity_passengers} pax</p>
            </div>
            <button onClick={() => setEditing({ ...c, scope: c.scope || { country: '', state: '', city: '' } })} data-testid={`access-edit-cat-${c.key}`} className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg">Modifier</button>
            <button onClick={() => del(c.id)} data-testid={`access-del-cat-${c.key}`} className="px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg">Supprimer</button>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()} data-testid="access-category-modal">
            <h3 className="text-lg font-bold text-slate-900">{editing.id ? 'Modifier' : 'Nouvelle'} catégorie</h3>
            {!editing.id && <Field label="Clé (unique, ex. access_pmr)"><input className={inputCls} value={editing.key} onChange={(e) => setEditing({ ...editing, key: e.target.value })} data-testid="access-cat-key" /></Field>}
            <Field label="Nom"><input className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="access-cat-name" /></Field>
            <Field label="Description"><textarea className={inputCls} rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} data-testid="access-cat-desc" /></Field>
            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-1">Équipements</span>
              <div className="grid grid-cols-2 gap-1.5">
                {CAP_FIELDS.map((cf) => (
                  <label key={cf.key} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={!!editing.capabilities?.[cf.key]} data-testid={`access-cap-${cf.key}`}
                      onChange={(e) => setEditing({ ...editing, capabilities: { ...editing.capabilities, [cf.key]: e.target.checked } })} />
                    {cf.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Passagers"><input type="number" className={inputCls} value={editing.capacity_passengers} onChange={(e) => setEditing({ ...editing, capacity_passengers: e.target.value })} /></Field>
              <Field label="Fauteuils roulants"><input type="number" className={inputCls} value={editing.capacity_wheelchairs} onChange={(e) => setEditing({ ...editing, capacity_wheelchairs: e.target.value })} data-testid="access-cat-wheelchairs" /></Field>
              <Field label="Tarif de base (€)"><input type="number" step="0.1" className={inputCls} value={editing.base_fare} onChange={(e) => setEditing({ ...editing, base_fare: e.target.value })} data-testid="access-cat-base" /></Field>
              <Field label="Prix / km (€)"><input type="number" step="0.1" className={inputCls} value={editing.price_per_km} onChange={(e) => setEditing({ ...editing, price_per_km: e.target.value })} /></Field>
              <Field label="Prix / min (€)"><input type="number" step="0.1" className={inputCls} value={editing.price_per_min} onChange={(e) => setEditing({ ...editing, price_per_min: e.target.value })} /></Field>
              <Field label="Tarif minimum (€)"><input type="number" step="0.1" className={inputCls} value={editing.min_fare} onChange={(e) => setEditing({ ...editing, min_fare: e.target.value })} /></Field>
              <Field label="Ordre d'affichage"><input type="number" className={inputCls} value={editing.display_order} onChange={(e) => setEditing({ ...editing, display_order: e.target.value })} /></Field>
              <Field label="Icône (Car / Van / Wheelchair)"><input className={inputCls} value={editing.icon} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} /></Field>
            </div>
            <ScopeEditor scope={editing.scope} onChange={(scope) => setEditing({ ...editing, scope })} />
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} data-testid="access-cat-active" /> Active</label>
            <div className="flex gap-2 pt-2">
              <button onClick={save} data-testid="access-cat-save" className="flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-lg" style={{ background: NAVY }}>Enregistrer</button>
              <button onClick={() => setEditing(null)} className="px-4 py-2.5 text-sm font-semibold border border-slate-300 rounded-lg">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ScopeEditor = ({ scope, onChange, testidPrefix = 'access-scope' }) => {
  const s = scope || { country: '', state: '', city: '' };
  return (
    <div>
      <span className="block text-xs font-semibold text-slate-600 mb-1">Zone (laisser vide = partout)</span>
      <div className="grid grid-cols-3 gap-2">
        <input className={inputCls} placeholder="Pays (FR, MQ…)" value={s.country} data-testid={`${testidPrefix}-country`} onChange={(e) => onChange({ ...s, country: e.target.value })} />
        <input className={inputCls} placeholder="Région" value={s.state} data-testid={`${testidPrefix}-state`} onChange={(e) => onChange({ ...s, state: e.target.value })} />
        <input className={inputCls} placeholder="Ville" value={s.city} data-testid={`${testidPrefix}-city`} onChange={(e) => onChange({ ...s, city: e.target.value })} />
      </div>
    </div>
  );
};

const MODE_OPTIONS = [
  { key: 'access', label: 'SB Access' },
  { key: 'standard', label: 'Standard' },
  { key: 'pool', label: 'Pool' },
  { key: 'moto', label: 'Moto' },
];

const Settings = () => {
  const [s, setS] = useState(null);
  const load = useCallback(() => { accessAPI.adminGetSettings().then((r) => setS(r.data)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  if (!s) return <p className="text-slate-400 text-sm">Chargement…</p>;
  const srn = s.safe_ride_night || {};

  const save = async () => {
    try {
      await accessAPI.adminUpdateSettings({
        enabled: s.enabled,
        available_zones: s.available_zones || [],
        extra_assistance_minutes: Number(s.extra_assistance_minutes),
        no_late_penalty: s.no_late_penalty,
        priority_certified_drivers: s.priority_certified_drivers,
        safe_ride_night: {
          enabled: srn.enabled, modes: srn.modes || [],
          start_hour: Number(srn.start_hour), end_hour: Number(srn.end_hour),
          zones: srn.zones || [],
        },
      });
      toast.success('Réglages enregistrés'); load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };
  const setSrn = (patch) => setS({ ...s, safe_ride_night: { ...srn, ...patch } });
  const toggleMode = (m) => setSrn({ modes: (srn.modes || []).includes(m) ? srn.modes.filter((x) => x !== m) : [...(srn.modes || []), m] });
  const addZone = (key) => setS({ ...s, [key]: [...(s[key] || []), { country: '', state: '', city: '' }] });
  const setZone = (key, idx, z) => setS({ ...s, [key]: (s[key] || []).map((x, i) => i === idx ? z : x) });
  const delZone = (key, idx) => setS({ ...s, [key]: (s[key] || []).filter((_, i) => i !== idx) });

  return (
    <div className="space-y-5 max-w-2xl" data-testid="admin-access-settings">
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h3 className="font-bold text-slate-900">Disponibilité du module</h3>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} data-testid="access-enabled-toggle" /> Module SB Access activé</label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!s.priority_certified_drivers} onChange={(e) => setS({ ...s, priority_certified_drivers: e.target.checked })} data-testid="access-priority-toggle" /> Prioriser les chauffeurs certifiés Access</label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!s.no_late_penalty} onChange={(e) => setS({ ...s, no_late_penalty: e.target.checked })} /> Aucune pénalité de retard (temps d'assistance)</label>
        <Field label="Minutes d'assistance offertes"><input type="number" className={`${inputCls} max-w-[120px]`} value={s.extra_assistance_minutes} onChange={(e) => setS({ ...s, extra_assistance_minutes: e.target.value })} data-testid="access-assistance-minutes" /></Field>
        <div>
          <div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold text-slate-600">Zones de disponibilité (vide = partout)</span>
            <button onClick={() => addZone('available_zones')} className="text-xs font-semibold text-[#0A2540]" data-testid="access-add-zone">+ Ajouter une zone</button></div>
          {(s.available_zones || []).map((z, i) => (
            <div key={i} className="flex items-end gap-2 mb-2">
              <div className="flex-1"><ScopeEditor scope={z} testidPrefix={`access-zone-${i}`} onChange={(nz) => setZone('available_zones', i, nz)} /></div>
              <button onClick={() => delZone('available_zones', i)} className="px-2 py-2 text-xs text-red-600">✕</button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3" data-testid="access-srn-block">
        <h3 className="font-bold text-slate-900">🌙 Safe Ride Night (trajet de nuit sécurisé)</h3>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!srn.enabled} onChange={(e) => setSrn({ enabled: e.target.checked })} data-testid="access-srn-toggle" /> Activer Safe Ride Night</label>
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <Field label="Heure de début"><input type="number" min="0" max="23" className={inputCls} value={srn.start_hour} onChange={(e) => setSrn({ start_hour: e.target.value })} data-testid="access-srn-start" /></Field>
          <Field label="Heure de fin"><input type="number" min="0" max="23" className={inputCls} value={srn.end_hour} onChange={(e) => setSrn({ end_hour: e.target.value })} data-testid="access-srn-end" /></Field>
        </div>
        <div>
          <span className="block text-xs font-semibold text-slate-600 mb-1">Modes concernés</span>
          <div className="flex flex-wrap gap-2">
            {MODE_OPTIONS.map((m) => (
              <button key={m.key} onClick={() => toggleMode(m.key)} data-testid={`access-srn-mode-${m.key}`}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${(srn.modes || []).includes(m.key) ? 'text-white border-transparent' : 'text-slate-600 border-slate-300'}`}
                style={(srn.modes || []).includes(m.key) ? { background: NAVY } : {}}>{m.label}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold text-slate-600">Zones Safe Ride Night (vide = toutes)</span>
            <button onClick={() => setSrn({ zones: [...(srn.zones || []), { country: '', state: '', city: '' }] })} className="text-xs font-semibold text-[#0A2540]" data-testid="access-srn-add-zone">+ Ajouter une zone</button></div>
          {(srn.zones || []).map((z, i) => (
            <div key={i} className="flex items-end gap-2 mb-2">
              <div className="flex-1"><ScopeEditor scope={z} testidPrefix={`access-srn-zone-${i}`} onChange={(nz) => setSrn({ zones: srn.zones.map((x, j) => j === i ? nz : x) })} /></div>
              <button onClick={() => setSrn({ zones: srn.zones.filter((_, j) => j !== i) })} className="px-2 py-2 text-xs text-red-600">✕</button>
            </div>
          ))}
        </div>
      </div>

      <button onClick={save} data-testid="access-settings-save" className="px-6 py-2.5 text-sm font-bold text-white rounded-lg" style={{ background: NAVY }}>Enregistrer les réglages</button>
    </div>
  );
};

const Drivers = () => {
  const [items, setItems] = useState([]);
  const load = useCallback(() => { accessAPI.adminDrivers().then((r) => setItems(r.data.items || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const certify = async (id, approved) => {
    try { await accessAPI.adminCertifyDriver(id, { approved }); toast.success(approved ? 'Chauffeur certifié' : 'Certification retirée'); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Échec'); }
  };
  return (
    <div data-testid="admin-access-drivers" className="space-y-2">
      {items.length === 0 && <p className="text-slate-400 text-sm">Aucun chauffeur.</p>}
      {items.map((d) => (
        <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3" data-testid={`access-driver-${d.id}`}>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900">{d.name || 'Chauffeur'} {d.access_certified && <span className="ml-1 text-xs px-2 py-0.5 rounded-full text-white" style={{ background: NAVY }}>Certifié Access</span>}</p>
            <p className="text-xs text-slate-500">{d.phone || '—'} · {d.vehicle_type || 'véhicule n/c'}</p>
          </div>
          {d.access_certified
            ? <button onClick={() => certify(d.id, false)} data-testid={`access-revoke-${d.id}`} className="px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg">Retirer</button>
            : <button onClick={() => certify(d.id, true)} data-testid={`access-certify-${d.id}`} className="px-3 py-1.5 text-xs font-bold text-white rounded-lg" style={{ background: NAVY }}>Certifier</button>}
        </div>
      ))}
    </div>
  );
};

const Bookings = () => {
  const [items, setItems] = useState([]);
  useEffect(() => { accessAPI.adminBookings().then((r) => setItems(r.data.items || [])).catch(() => {}); }, []);
  return (
    <div data-testid="admin-access-bookings" className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-200">
          <th className="py-2 pr-3">Véhicule</th><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Trajet</th><th className="py-2 pr-3">Tarif</th><th className="py-2 pr-3">Chauffeur</th><th className="py-2 pr-3">Statut</th>
        </tr></thead>
        <tbody>
          {items.map((b) => (
            <tr key={b.id} className="border-b border-slate-100" data-testid={`access-booking-${b.id}`}>
              <td className="py-2 pr-3 font-semibold">{b.category_name}</td>
              <td className="py-2 pr-3">{b.trip_type}{b.recurring_id ? ' (auto)' : ''}</td>
              <td className="py-2 pr-3 text-xs text-slate-500 max-w-[220px] truncate">{b.pickup?.address || '—'} → {b.dropoff?.address || '—'}</td>
              <td className="py-2 pr-3">{Number(b.fare_estimate || 0).toFixed(2)} €</td>
              <td className="py-2 pr-3 text-xs">{b.certified_driver ? (b.matched_driver_name || 'Certifié') : '—'}</td>
              <td className="py-2 pr-3"><span className="text-xs px-2 py-0.5 rounded-full bg-slate-100">{b.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="text-slate-400 text-sm mt-3">Aucune réservation.</p>}
    </div>
  );
};

export default AdminAccess;
