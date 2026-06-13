import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, PencilSimple, Trash, Eye, EyeSlash, CircleNotch, X, Boat, CurrencyEur, Ticket, Percent, ChartBar, Receipt } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { ferryAPI } from '../../services/api';

const fmtEur = (n) => `${(Number(n) || 0).toFixed(2)} €`;

const STAT_COLORS = {
  slate: 'bg-slate-50 text-slate-700',
  sky: 'bg-sky-50 text-sky-700',
  indigo: 'bg-indigo-50 text-indigo-700',
};
const Stat = ({ label, value, color = 'slate' }) => (
  <div className={`rounded-lg px-3 py-2 ${STAT_COLORS[color] || STAT_COLORS.slate}`}>
    <p className="text-[11px] font-semibold opacity-70">{label}</p>
    <p className="text-base font-extrabold">{value}</p>
  </div>
);

const CommissionRevenue = ({ companies, config, revenue, onReload }) => {
  const [globalPct, setGlobalPct] = useState(12);
  const [compPct, setCompPct] = useState({});
  const [savingG, setSavingG] = useState(false);

  useEffect(() => { setGlobalPct(config?.commission_percent ?? 12); }, [config]);
  useEffect(() => {
    const m = {}; companies.forEach((c) => { m[c.id] = c.commission_percent ?? ''; }); setCompPct(m);
  }, [companies]);

  const saveGlobal = async () => {
    setSavingG(true);
    try { await ferryAPI.updateConfig({ commission_percent: Number(globalPct) }); toast.success('Commission globale enregistrée'); onReload(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); } finally { setSavingG(false); }
  };
  const saveCompany = async (id) => {
    try { await ferryAPI.updateCompany(id, { commission_percent: Number(compPct[id]) }); toast.success('Commission compagnie enregistrée'); onReload(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
  };

  const t = revenue?.totals || {};
  return (
    <div className="space-y-4 mb-6" data-testid="ferry-commission-panel">
      <div className="bg-white rounded-xl border p-4">
        <h2 className="font-extrabold text-gray-900 mb-1 flex items-center gap-2"><Percent size={18} weight="bold" className="text-sky-600" /> Commission SB Drive</h2>
        <p className="text-xs text-gray-500 mb-3">Part prélevée par SB Drive sur chaque billet. La valeur par compagnie prime sur la commission globale.</p>
        <div className="flex items-end gap-2 mb-4 flex-wrap">
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Commission globale (%)</span>
            <input type="number" min="0" max="100" step="0.5" value={globalPct} onChange={(e) => setGlobalPct(e.target.value)} data-testid="ferry-global-commission"
              className="block w-32 mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <button onClick={saveGlobal} disabled={savingG} data-testid="ferry-global-commission-save"
            className="px-4 py-2 rounded-lg bg-sky-600 text-white font-bold text-sm flex items-center gap-2 disabled:opacity-60">
            {savingG ? <CircleNotch size={14} className="animate-spin" /> : 'Enregistrer'}
          </button>
          {config && !config.stripe_enabled && <span className="text-[11px] text-amber-600 font-semibold">⚠ Carte bancaire désactivée (clé Stripe manquante)</span>}
        </div>
        <div className="border-t pt-3 space-y-2">
          <p className="text-xs font-bold text-gray-400 uppercase">Commission par compagnie</p>
          {companies.map((c) => (
            <div key={c.id} className="flex items-center gap-2" data-testid={`ferry-company-row-${c.id}`}>
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
              <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{c.name}</span>
              <input type="number" min="0" max="100" step="0.5" value={compPct[c.id] ?? ''} onChange={(e) => setCompPct({ ...compPct, [c.id]: e.target.value })} data-testid={`ferry-company-commission-${c.id}`}
                className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right" />
              <span className="text-xs text-gray-400">%</span>
              <button onClick={() => saveCompany(c.id)} data-testid={`ferry-company-save-${c.id}`} className="text-sky-600 text-sm font-bold px-2">OK</button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4" data-testid="ferry-revenue-panel">
        <h2 className="font-extrabold text-gray-900 mb-3 flex items-center gap-2"><ChartBar size={18} weight="fill" className="text-emerald-600" /> Revenus & règlements</h2>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Stat label="Chiffre d'affaires" value={fmtEur(t.gross)} color="slate" />
          <Stat label="Commission SB Drive" value={fmtEur(t.commission)} color="sky" />
          <Stat label="Revenu compagnies" value={fmtEur(t.company_revenue)} color="indigo" />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="rounded-lg bg-amber-50 p-3"><p className="text-[11px] text-amber-700 font-semibold">SB Drive doit aux compagnies</p><p className="text-lg font-extrabold text-amber-800" data-testid="ferry-platform-owes">{fmtEur(t.platform_owes_company)}</p></div>
          <div className="rounded-lg bg-emerald-50 p-3"><p className="text-[11px] text-emerald-700 font-semibold">Compagnies doivent à SB Drive</p><p className="text-lg font-extrabold text-emerald-800" data-testid="ferry-company-owes">{fmtEur(t.company_owes_platform)}</p></div>
        </div>
        <p className="text-xs font-bold text-gray-400 uppercase mb-1">Par compagnie</p>
        <div className="divide-y divide-gray-100" data-testid="ferry-revenue-by-company">
          {(revenue?.by_company || []).map((c) => (
            <div key={c.company_id} className="py-2 flex items-center justify-between text-sm gap-2">
              <span className="font-semibold text-gray-800 truncate">{c.company_name}</span>
              <span className="text-gray-500 text-xs text-right shrink-0">{c.tickets} billets · CA {fmtEur(c.gross)} · comm. {fmtEur(c.commission)}</span>
            </div>
          ))}
          {(!revenue?.by_company || revenue.by_company.length === 0) && <p className="text-xs text-gray-400 py-2">Aucune vente sur la période.</p>}
        </div>
        {(revenue?.by_method || []).length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="text-xs font-bold text-gray-400 uppercase mb-1">Par mode de paiement</p>
            <div className="flex flex-wrap gap-2" data-testid="ferry-revenue-by-method">
              {revenue.by_method.map((m) => (
                <span key={m.method} className="text-xs bg-slate-100 rounded-full px-3 py-1 font-semibold text-slate-600">
                  {m.method === 'sbpay' ? 'SB Pay' : m.method === 'cash' ? 'Espèces' : m.method === 'stripe' ? 'Carte' : m.method} · {m.tickets} · {fmtEur(m.gross)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const EMPTY = {
  company_id: '', company_name: '', from_port_id: '', from_label: '', to_port_id: '', to_label: '',
  route_type: 'inter_island', duration_min: 60, price_adult: 0, price_child: 0,
  departure_times: '', is_active: true,
};

const Field = ({ label, ...props }) => (
  <label className="block">
    <span className="text-xs font-semibold text-gray-600">{label}</span>
    <input {...props} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-300 outline-none" />
  </label>
);

const RouteModal = ({ open, initial, ports, companies, onClose, onSaved }) => {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setForm(initial
        ? { ...EMPTY, ...initial, departure_times: (initial.departure_times || []).join(', ') }
        : EMPTY);
    }
  }, [open, initial]);
  if (!open) return null;

  const portLabel = (id) => { const p = ports.find((x) => x.id === id); return p ? `${p.city} (${p.island})` : ''; };

  const save = async () => {
    if (!form.from_port_id || !form.to_port_id) { toast.error('Ports requis'); return; }
    setSaving(true);
    try {
      const comp = companies.find((c) => c.id === form.company_id);
      const payload = {
        ...form,
        company_name: comp?.name || form.company_name,
        from_label: portLabel(form.from_port_id),
        to_label: portLabel(form.to_port_id),
        duration_min: Number(form.duration_min),
        price_adult: Number(form.price_adult),
        price_child: Number(form.price_child),
        departure_times: form.departure_times,
      };
      if (initial?.id) await ferryAPI.updateRoute(initial.id, payload);
      else await ferryAPI.createRoute(payload);
      toast.success(initial?.id ? 'Ligne mise à jour' : 'Ligne ajoutée');
      onSaved(); onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); } finally { setSaving(false); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4" data-testid="ferry-route-modal">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400"><X size={20} /></button>
        <h3 className="text-lg font-extrabold text-gray-900 mb-4">{initial?.id ? 'Modifier la ligne' : 'Nouvelle ligne ferry'}</h3>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Compagnie</span>
            <select value={form.company_id} onChange={set('company_id')} data-testid="ferry-route-company" className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">—</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Port départ</span>
              <select value={form.from_port_id} onChange={set('from_port_id')} data-testid="ferry-route-from" className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">—</option>
                {ports.map((p) => <option key={p.id} value={p.id}>{p.city} ({p.island})</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Port arrivée</span>
              <select value={form.to_port_id} onChange={set('to_port_id')} data-testid="ferry-route-to" className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">—</option>
                {ports.map((p) => <option key={p.id} value={p.id}>{p.city} ({p.island})</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Type</span>
              <select value={form.route_type} onChange={set('route_type')} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="inter_island">Inter-îles</option>
                <option value="local">Navette locale</option>
              </select>
            </label>
            <Field label="Durée (min)" type="number" value={form.duration_min} onChange={set('duration_min')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix adulte (€)" type="number" step="0.5" value={form.price_adult} onChange={set('price_adult')} data-testid="ferry-route-adult" />
            <Field label="Prix enfant (€)" type="number" step="0.5" value={form.price_child} onChange={set('price_child')} data-testid="ferry-route-child" />
          </div>
          <Field label="Horaires (séparés par virgule)" value={form.departure_times} onChange={set('departure_times')} data-testid="ferry-route-times" placeholder="07:30, 14:00" />
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Ligne active
          </label>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 font-semibold text-sm">Annuler</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-sky-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60" data-testid="ferry-route-save">
            {saving ? <CircleNotch size={16} className="animate-spin" /> : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminFerry = () => {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [ports, setPorts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState({ count: 0, revenue: 0, commission: 0 });
  const [config, setConfig] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, initial: null });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([ferryAPI.adminRoutes(), ferryAPI.adminPorts(), ferryAPI.adminCompanies(),
      ferryAPI.adminBookings(), ferryAPI.adminConfig(), ferryAPI.adminRevenue()])
      .then(([r, p, c, b, cfg, rev]) => {
        setRoutes(r.data.routes || []);
        setPorts(p.data.ports || []);
        setCompanies(c.data.companies || []);
        setStats({ count: b.data.count || 0, revenue: b.data.revenue || 0, commission: b.data.commission || 0 });
        setConfig(cfg.data);
        setRevenue(rev.data);
      })
      .catch(() => toast.error('Échec du chargement'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (id) => { try { await ferryAPI.toggleRoute(id); load(); } catch { toast.error('Échec'); } };
  const remove = async (r) => {
    if (!window.confirm(`Supprimer ${r.from_label} → ${r.to_label} ?`)) return;
    try { await ferryAPI.deleteRoute(r.id); toast.success('Supprimé'); load(); } catch { toast.error('Échec'); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto" data-testid="admin-ferry-page">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2"><Boat size={26} weight="fill" className="text-sky-600" /> SB Ferry — Lignes maritimes</h1>
        <button onClick={() => setModal({ open: true, initial: null })} className="flex items-center gap-1.5 bg-sky-600 text-white font-bold text-sm px-4 py-2 rounded-lg" data-testid="ferry-add-btn">
          <Plus size={16} weight="bold" /> Ajouter
        </button>
      </div>
      <button onClick={() => navigate('/admin/ferry-settlements')} className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-600 mb-3" data-testid="ferry-settlements-link">
        <Receipt size={16} weight="fill" /> Règlements compagnies →
      </button>
      <p className="text-sm text-gray-500 mb-4">Gérez les lignes (inter-îles & navettes locales), compagnies, prix et horaires. Billetterie payée en SB Pay.</p>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="rounded-xl px-3 py-2 bg-sky-50 text-sky-700"><div className="flex items-center gap-1.5 text-[11px] font-semibold opacity-70"><Boat size={13} weight="fill" /> Lignes</div><div className="text-lg font-extrabold">{routes.length}</div></div>
        <div className="rounded-xl px-3 py-2 bg-indigo-50 text-indigo-700"><div className="flex items-center gap-1.5 text-[11px] font-semibold opacity-70"><Ticket size={13} weight="fill" /> Billets vendus</div><div className="text-lg font-extrabold">{stats.count}</div></div>
        <div className="rounded-xl px-3 py-2 bg-emerald-50 text-emerald-700"><div className="flex items-center gap-1.5 text-[11px] font-semibold opacity-70"><CurrencyEur size={13} weight="fill" /> Revenu</div><div className="text-lg font-extrabold">{stats.revenue} €</div></div>
      </div>

      <CommissionRevenue companies={companies} config={config} revenue={revenue} onReload={load} />

      {loading ? (
        <div className="flex justify-center py-16"><CircleNotch size={28} className="animate-spin text-sky-500" /></div>
      ) : (
        <div className="space-y-2" data-testid="ferry-route-list">
          {routes.map((r) => (
            <div key={r.id} className={`bg-white rounded-xl shadow-sm border p-3 flex items-center gap-3 ${r.is_active === false ? 'opacity-60' : ''}`} data-testid={`ferry-route-card-${r.id}`}>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{r.from_label} → {r.to_label}</p>
                <p className="text-xs text-gray-400 truncate">{r.company_name} · {r.route_type === 'local' ? 'Navette' : 'Inter-îles'} · {r.price_adult}€/{r.price_child}€ · {(r.departure_times || []).length} horaires</p>
              </div>
              <button onClick={() => toggle(r.id)} className={`p-2 rounded-lg ${r.is_active !== false ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 bg-gray-100'}`} data-testid={`ferry-toggle-${r.id}`}>
                {r.is_active !== false ? <Eye size={16} /> : <EyeSlash size={16} />}
              </button>
              <button onClick={() => setModal({ open: true, initial: r })} className="p-2 rounded-lg text-sky-600 bg-sky-50" data-testid={`ferry-edit-${r.id}`}><PencilSimple size={16} /></button>
              <button onClick={() => remove(r)} className="p-2 rounded-lg text-red-600 bg-red-50" data-testid={`ferry-delete-${r.id}`}><Trash size={16} /></button>
            </div>
          ))}
        </div>
      )}

      <RouteModal open={modal.open} initial={modal.initial} ports={ports} companies={companies} onClose={() => setModal({ open: false, initial: null })} onSaved={load} />
    </div>
  );
};

export default AdminFerry;
