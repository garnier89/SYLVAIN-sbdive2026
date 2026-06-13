import React, { useState, useEffect, useCallback } from 'react';
import { Plus, PencilSimple, Trash, Eye, EyeSlash, CircleNotch, X, ArrowUp, ArrowDown, Megaphone, ChartBar, MapPin, CursorClick, EyeSlash as EyeClose } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { homeBannersAPI } from '../../services/api';

const EVENT_LABEL = { impression: 'Vue', click: 'Clic', dismiss: 'Fermeture' };
const EVENT_COLOR = { impression: 'text-slate-600 bg-slate-100', click: 'text-emerald-700 bg-emerald-50', dismiss: 'text-rose-700 bg-rose-50' };

const fmtTime = (iso) => {
  try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};

const StatPill = ({ icon: Icon, label, value, tone }) => (
  <div className={`rounded-xl px-3 py-2 ${tone}`}>
    <div className="flex items-center gap-1.5 text-[11px] font-semibold opacity-70"><Icon size={13} weight="fill" /> {label}</div>
    <div className="text-lg font-extrabold leading-tight">{value}</div>
  </div>
);

const AnalyticsModal = ({ banner, onClose }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    if (!banner) return;
    setLoading(true);
    homeBannersAPI.events(banner.id, { limit: 80, ...(filter ? { event: filter } : {}) })
      .then((r) => setEvents(r.data.events || []))
      .catch(() => toast.error('Échec du chargement'))
      .finally(() => setLoading(false));
  }, [banner, filter]);
  if (!banner) return null;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4" data-testid="banner-analytics-modal">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400" data-testid="analytics-close"><X size={20} /></button>
        <h3 className="text-lg font-extrabold text-gray-900 mb-1">📊 {banner.title}</h3>
        <p className="text-xs text-gray-400 mb-4">Performance détaillée — qui, quand, où.</p>

        <div className="grid grid-cols-4 gap-2 mb-4">
          <StatPill icon={Eye} label="Vues" value={banner.impressions} tone="bg-slate-50 text-slate-700" />
          <StatPill icon={CursorClick} label="Clics" value={banner.clicks} tone="bg-emerald-50 text-emerald-700" />
          <StatPill icon={ChartBar} label="CTR" value={`${banner.ctr}%`} tone="bg-indigo-50 text-indigo-700" />
          <StatPill icon={EyeClose} label="Ferm." value={`${banner.close_rate}%`} tone="bg-rose-50 text-rose-700" />
        </div>

        {banner.by_zone?.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1"><MapPin size={13} weight="fill" /> Par zone</p>
            <div className="space-y-1">
              {banner.by_zone.map((z) => (
                <div key={z.zone} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-1.5">
                  <span className="font-semibold text-gray-700">{z.zone}</span>
                  <span className="text-xs text-gray-500">{z.impressions} vues · {z.clicks} clics · CTR {z.ctr}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-bold text-gray-700">Journal des interactions</p>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="text-xs border border-gray-200 rounded px-2 py-1" data-testid="analytics-filter">
            <option value="">Tout</option>
            <option value="impression">Vues</option>
            <option value="click">Clics</option>
            <option value="dismiss">Fermetures</option>
          </select>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><CircleNotch size={22} className="animate-spin text-indigo-500" /></div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">Aucune interaction pour le moment.</div>
        ) : (
          <div className="border border-gray-100 rounded-xl overflow-hidden" data-testid="analytics-events">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase text-gray-400">
                <tr><th className="text-left px-3 py-2 font-bold">Utilisateur</th><th className="text-left px-3 py-2 font-bold">Action</th><th className="text-left px-3 py-2 font-bold">Lieu</th><th className="text-left px-3 py-2 font-bold">Heure</th></tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800 truncate max-w-[140px]">{e.user_name}</td>
                    <td className="px-3 py-2"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${EVENT_COLOR[e.event] || ''}`}>{EVENT_LABEL[e.event] || e.event}</span></td>
                    <td className="px-3 py-2 text-gray-600">{e.city || e.location_label || e.country || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtTime(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const EMPTY = {
  title: '', subtitle: '', variant: 'entry', icon: 'Sparkle', badge: '',
  bg_from: '#5B21B6', bg_to: '#7C3AED', target_route: '/', dismissible: true, active: true,
  starts_at: '', ends_at: '',
  scope: { country: '', state: '', city: '' },
};

const Field = ({ label, ...props }) => (
  <label className="block">
    <span className="text-xs font-semibold text-gray-600">{label}</span>
    <input {...props} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none" />
  </label>
);

const BannerModal = ({ open, initial, onClose, onSaved }) => {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setForm(initial
        ? { ...EMPTY, ...initial, scope: { ...EMPTY.scope, ...(initial.scope || {}) },
            starts_at: initial.starts_at ? String(initial.starts_at).slice(0, 16) : '',
            ends_at: initial.ends_at ? String(initial.ends_at).slice(0, 16) : '' }
        : EMPTY);
    }
  }, [open, initial]);
  if (!open) return null;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setScope = (k) => (e) => setForm({ ...form, scope: { ...form.scope, [k]: e.target.value } });

  const save = async () => {
    if (!form.title.trim()) { toast.error('Le titre est requis'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      };
      if (initial?.id) await homeBannersAPI.update(initial.id, payload);
      else await homeBannersAPI.create(payload);
      toast.success(initial?.id ? 'Bannière mise à jour' : 'Bannière ajoutée');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de l’enregistrement');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4" data-testid="home-banner-modal">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400" data-testid="home-banner-modal-close"><X size={20} /></button>
        <h3 className="text-lg font-extrabold text-gray-900 mb-4">{initial?.id ? 'Modifier la bannière' : 'Nouvelle bannière'}</h3>

        {/* Live preview */}
        <div className="mb-4 rounded-2xl p-4 flex items-center gap-3 text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${form.bg_from}, ${form.bg_to})` }} data-testid="home-banner-preview">
          <div className="w-10 h-10 rounded-full bg-white/20 shrink-0" />
          <div className="min-w-0">
            {form.variant === 'hero' && form.badge && <span className="inline-block text-[9px] font-extrabold bg-white/20 px-2 py-0.5 rounded-full mb-1">{form.badge}</span>}
            <p className="font-black text-sm leading-tight truncate">{form.title || 'Titre de la bannière'}</p>
            {form.subtitle && <p className="text-white/85 text-xs leading-tight truncate">{form.subtitle}</p>}
          </div>
        </div>

        <div className="space-y-3">
          <Field label="Titre" value={form.title} onChange={set('title')} data-testid="home-banner-title" placeholder="SB Student 🎓" />
          <Field label="Sous-titre" value={form.subtitle} onChange={set('subtitle')} data-testid="home-banner-subtitle" placeholder="Marketplace, tarifs étudiants…" />
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Style</span>
              <select value={form.variant} onChange={set('variant')} data-testid="home-banner-variant" className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="entry">Entrée (ligne compacte)</option>
                <option value="hero">Hero (grande carte)</option>
              </select>
            </label>
            <Field label="Icône (nom Phosphor)" value={form.icon} onChange={set('icon')} data-testid="home-banner-icon" placeholder="GraduationCap / Lightning" />
          </div>
          {form.variant === 'hero' && (
            <Field label="Badge (hero)" value={form.badge} onChange={set('badge')} data-testid="home-banner-badge" placeholder="EXPRESS · DÈS 30 MIN" />
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-semibold text-gray-600">Couleur 1</span>
              <input type="color" value={form.bg_from} onChange={set('bg_from')} data-testid="home-banner-bgfrom" className="w-full mt-1 h-10 border border-gray-200 rounded-lg" /></label>
            <label className="block"><span className="text-xs font-semibold text-gray-600">Couleur 2</span>
              <input type="color" value={form.bg_to} onChange={set('bg_to')} data-testid="home-banner-bgto" className="w-full mt-1 h-10 border border-gray-200 rounded-lg" /></label>
          </div>
          <Field label="Lien (route)" value={form.target_route} onChange={set('target_route')} data-testid="home-banner-route" placeholder="/sb-student" />

          <div className="bg-indigo-50/60 rounded-xl p-3 space-y-3">
            <p className="text-xs font-bold text-gray-700">Période d’affichage (optionnel)</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Début" type="datetime-local" value={form.starts_at} onChange={set('starts_at')} data-testid="home-banner-starts" />
              <Field label="Fin" type="datetime-local" value={form.ends_at} onChange={set('ends_at')} data-testid="home-banner-ends" />
            </div>
            <p className="text-xs font-bold text-gray-700">Zone (vide = partout)</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Pays (code)" value={form.scope.country} onChange={setScope('country')} data-testid="home-banner-country" placeholder="FR / MQ" />
              <Field label="Région" value={form.scope.state} onChange={setScope('state')} data-testid="home-banner-state" placeholder="Martinique" />
              <Field label="Ville" value={form.scope.city} onChange={setScope('city')} data-testid="home-banner-city" placeholder="Fort-de-France" />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={form.dismissible} onChange={(e) => setForm({ ...form, dismissible: e.target.checked })} data-testid="home-banner-dismissible" /> Fermable (×)
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} data-testid="home-banner-active" /> Visible
            </label>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 font-semibold text-sm" data-testid="home-banner-cancel">Annuler</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60" data-testid="home-banner-save">
            {saving ? <CircleNotch size={16} className="animate-spin" /> : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminHomeBanners = () => {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, initial: null });
  const [stats, setStats] = useState({ map: {}, totals: null });
  const [analyticsFor, setAnalyticsFor] = useState(null);

  const loadStats = useCallback(() => {
    homeBannersAPI.analytics()
      .then((r) => {
        const map = {};
        (r.data.banners || []).forEach((b) => { map[b.id] = b; });
        setStats({ map, totals: r.data.totals });
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    homeBannersAPI.adminList()
      .then((r) => setBanners(r.data.banners || []))
      .catch(() => toast.error('Échec du chargement'))
      .finally(() => setLoading(false));
    loadStats();
  }, [loadStats]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (id) => { try { await homeBannersAPI.toggle(id); load(); } catch { toast.error('Échec'); } };
  const remove = async (b) => {
    if (!window.confirm(`Supprimer « ${b.title} » ?`)) return;
    try { await homeBannersAPI.remove(b.id); toast.success('Supprimé'); load(); } catch { toast.error('Échec'); }
  };
  const move = async (idx, dir) => {
    const next = [...banners];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setBanners(next);
    try { await homeBannersAPI.reorder(next.map((b) => b.id)); } catch { toast.error('Échec du tri'); load(); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto" data-testid="admin-home-banners-page">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2"><Megaphone size={26} weight="fill" className="text-indigo-600" /> Bannières d’accueil</h1>
        <button onClick={() => setModal({ open: true, initial: null })} className="flex items-center gap-1.5 bg-indigo-600 text-white font-bold text-sm px-4 py-2 rounded-lg" data-testid="home-banner-add-btn">
          <Plus size={16} weight="bold" /> Ajouter
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">Pilotez l’ordre, la visibilité, la zone et la période d’affichage des bannières de l’accueil (SB Student, Livraison Instantanée…), sans redéploiement.</p>

      {stats.totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6" data-testid="home-banner-totals">
          <StatPill icon={Eye} label="Vues totales" value={stats.totals.impressions} tone="bg-slate-50 text-slate-700" />
          <StatPill icon={CursorClick} label="Clics totaux" value={stats.totals.clicks} tone="bg-emerald-50 text-emerald-700" />
          <StatPill icon={ChartBar} label="CTR moyen" value={`${stats.totals.ctr}%`} tone="bg-indigo-50 text-indigo-700" />
          <StatPill icon={EyeClose} label="Taux fermeture" value={`${stats.totals.close_rate}%`} tone="bg-rose-50 text-rose-700" />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><CircleNotch size={28} className="animate-spin text-indigo-500" /></div>
      ) : banners.length === 0 ? (
        <div className="text-center py-16 text-gray-400" data-testid="home-banner-empty">Aucune bannière. Cliquez sur « Ajouter ».</div>
      ) : (
        <div className="space-y-2" data-testid="home-banner-list">
          {banners.map((b, idx) => (
            <div key={b.id} className={`bg-white rounded-xl shadow-sm border p-3 flex items-center gap-3 ${b.active === false ? 'opacity-60' : ''}`} data-testid={`home-banner-card-${b.id}`}>
              <span className="w-10 h-10 rounded-lg shrink-0" style={{ background: `linear-gradient(135deg, ${b.bg_from}, ${b.bg_to})` }} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{b.title} <span className="text-[10px] uppercase font-bold text-indigo-500 ml-1">{b.variant}</span></p>
                <p className="text-xs text-gray-400 truncate">
                  {b.target_route} · {b.dismissible ? 'fermable' : 'non fermable'}
                  {(b.scope?.country) ? ` · ${b.scope.country}${b.scope.city ? '/' + b.scope.city : ''}` : ' · partout'}
                  {(b.starts_at || b.ends_at) ? ' · planifiée' : ''}
                  {stats.map[b.id] ? ` · ${stats.map[b.id].impressions} vues · CTR ${stats.map[b.id].ctr}% · ferm. ${stats.map[b.id].close_rate}%` : ''}
                </p>
              </div>
              <div className="flex flex-col">
                <button onClick={() => move(idx, -1)} className="p-1 text-gray-400 hover:text-gray-700" title="Monter" data-testid={`home-banner-up-${b.id}`}><ArrowUp size={14} /></button>
                <button onClick={() => move(idx, 1)} className="p-1 text-gray-400 hover:text-gray-700" title="Descendre" data-testid={`home-banner-down-${b.id}`}><ArrowDown size={14} /></button>
              </div>
              <button onClick={() => setAnalyticsFor(stats.map[b.id] || { id: b.id, title: b.title, impressions: 0, clicks: 0, ctr: 0, close_rate: 0, by_zone: [] })} className="p-2 rounded-lg text-violet-600 bg-violet-50" title="Statistiques" data-testid={`home-banner-stats-${b.id}`}><ChartBar size={16} /></button>
              <button onClick={() => toggle(b.id)} className={`p-2 rounded-lg ${b.active !== false ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 bg-gray-100'}`} title="Afficher/Masquer" data-testid={`home-banner-toggle-${b.id}`}>
                {b.active !== false ? <Eye size={16} /> : <EyeSlash size={16} />}
              </button>
              <button onClick={() => setModal({ open: true, initial: b })} className="p-2 rounded-lg text-indigo-600 bg-indigo-50" title="Modifier" data-testid={`home-banner-edit-${b.id}`}><PencilSimple size={16} /></button>
              <button onClick={() => remove(b)} className="p-2 rounded-lg text-red-600 bg-red-50" title="Supprimer" data-testid={`home-banner-delete-${b.id}`}><Trash size={16} /></button>
            </div>
          ))}
        </div>
      )}

      <BannerModal open={modal.open} initial={modal.initial} onClose={() => setModal({ open: false, initial: null })} onSaved={load} />
      <AnalyticsModal banner={analyticsFor} onClose={() => setAnalyticsFor(null)} />
    </div>
  );
};

export default AdminHomeBanners;
