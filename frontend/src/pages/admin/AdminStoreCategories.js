/**
 * AdminStoreCategories — V3Cube "Services → Store Delivery".
 * Grille des verticales de livraison (Repas, Courses, Médicaments, Fleurs, Vin…)
 * avec toggle Actif/Inactif, édition (nom FR/EN + icône), vérification d'âge (18+/21+),
 * type de véhicule de livraison et classement.
 * Désactiver une catégorie la masque du hub de livraison de l'app client (/all-delivery, /food).
 */
import React, { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { MagnifyingGlass, ArrowsClockwise, PencilSimple, X, Check, ArrowUp, ArrowDown, Warning, Truck, MapPin } from '@phosphor-icons/react';
import { adminAPI } from '../../services/api';
import { ZoneScopePicker } from '../../components/admin/ZoneScopePicker';

const scopeLabel = (s) => (!s || !s.country ? '' : [s.city, s.state, s.country_name || s.country].filter(Boolean).join(', '));

const GROUP_LABELS = { food: 'Restauration', essentials: 'Essentiels', specialty: 'Spécialisé' };
const VEHICLE_LABELS = { any: 'Tous véhicules', moto: 'Moto / Scooter', car: 'Voiture / Fourgon' };
const AGE_OPTIONS = [{ v: 0, l: 'Aucune' }, { v: 18, l: '18 ans et +' }, { v: 21, l: '21 ans et +' }];

const isImage = (icon) => typeof icon === 'string' && (icon.startsWith('http') || icon.startsWith('data:'));

const StoreCategoryIcon = ({ icon }) => {
  if (isImage(icon)) return <img src={icon} alt="" className="w-10 h-10 object-contain" />;
  return <span className="text-3xl leading-none">{icon || '🛒'}</span>;
};

const AdminStoreCategories = () => {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState(null);

  const load = () => {
    adminAPI.listStoreCategories()
      .then((r) => setCats(r.data || []))
      .catch(() => toast.error('Erreur de chargement'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const toggle = async (key) => {
    try {
      const r = await adminAPI.toggleStoreCategory(key);
      setCats((cs) => cs.map((c) => (c.key === key ? { ...c, active: r.data.active } : c)));
      toast.success(r.data.active ? 'Catégorie activée' : 'Catégorie désactivée');
    } catch { toast.error('Échec de la mise à jour'); }
  };

  const move = async (key, dir) => {
    const idx = cats.findIndex((c) => c.key === key);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= cats.length) return;
    const next = [...cats];
    [next[idx], next[j]] = [next[j], next[idx]];
    setCats(next);
    try { await adminAPI.reorderStoreCategories(next.map((c) => c.key)); }
    catch { toast.error('Échec du classement'); load(); }
  };

  const filtered = useMemo(() => cats.filter((c) => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.name_en?.toLowerCase().includes(q);
    const matchStatus = !statusFilter || (statusFilter === 'active' ? c.active : !c.active);
    return matchSearch && matchStatus;
  }), [cats, search, statusFilter]);

  const canReorder = !search.trim() && !statusFilter;

  return (
    <div className="p-6" data-testid="admin-store-categories-page">
      <h1 className="text-2xl font-bold text-slate-900">Catégories de livraison (Boutiques)</h1>
      <p className="text-sm text-slate-500 mb-5">Activez/désactivez chaque verticale de livraison, personnalisez nom et icône, définissez une <b>vérification d&apos;âge</b> et le <b>type de véhicule</b>, puis <b>classez-les avec ↑/↓</b>. Les catégories désactivées disparaissent du hub de livraison de l&apos;app client.</p>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…"
            data-testid="store-cat-search" className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          data-testid="store-cat-status-filter" className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Tous les statuts</option>
          <option value="active">Actif</option>
          <option value="inactive">Inactif</option>
        </select>
        <button onClick={() => { setLoading(true); load(); }} data-testid="store-cat-refresh" className="p-2.5 rounded-lg bg-violet-100 text-violet-600"><ArrowsClockwise size={18} /></button>
      </div>

      {loading ? (
        <p className="text-slate-500" data-testid="store-cat-loading">Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div key={c.key} data-testid={`store-cat-card-${c.key}`} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
                  <StoreCategoryIcon icon={c.icon} />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {c.active ? 'Actif' : 'Inactif'}
                  </span>
                  <button onClick={() => toggle(c.key)} data-testid={`store-cat-toggle-${c.key}`}
                    className={`relative w-11 h-6 rounded-full transition-colors ${c.active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${c.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>
              <p className="font-bold text-slate-900">{c.name}</p>
              <p className="text-[11px] text-slate-400 mb-3">{GROUP_LABELS[c.group] || c.group}</p>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {c.age_restriction > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 bg-rose-100 text-rose-700" data-testid={`store-cat-age-badge-${c.key}`}>
                    <Warning size={11} weight="bold" /> {c.age_restriction}+
                  </span>
                )}
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 bg-slate-100 text-slate-600" data-testid={`store-cat-vehicle-badge-${c.key}`}>
                  <Truck size={11} weight="bold" /> {VEHICLE_LABELS[c.delivery_vehicle] || 'Tous véhicules'}
                </span>
                {c.scope?.country && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 bg-emerald-100 text-emerald-700" data-testid={`store-cat-zone-badge-${c.key}`}>
                    <MapPin size={11} weight="fill" /> {scopeLabel(c.scope)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => setEditing(c)} data-testid={`store-cat-edit-${c.key}`}
                  className="text-sm font-semibold text-violet-600 flex items-center gap-1">
                  Modifier <PencilSimple size={14} />
                </button>
                {canReorder && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => move(c.key, -1)} title="Monter" data-testid={`store-cat-up-${c.key}`}
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center">
                      <ArrowUp size={14} weight="bold" />
                    </button>
                    <button onClick={() => move(c.key, 1)} title="Descendre" data-testid={`store-cat-down-${c.key}`}
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center">
                      <ArrowDown size={14} weight="bold" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-slate-400 col-span-full text-center py-8">Aucune catégorie</p>}
        </div>
      )}

      {editing && (
        <EditStoreCategoryModal cat={editing} onClose={() => setEditing(null)}
          onSaved={(updated) => { setCats((cs) => cs.map((c) => (c.key === updated.key ? updated : c))); setEditing(null); }} />
      )}
    </div>
  );
};

const EditStoreCategoryModal = ({ cat, onClose, onSaved }) => {
  const [name, setName] = useState(cat.name || '');
  const [nameEn, setNameEn] = useState(cat.name_en || '');
  const [icon, setIcon] = useState(cat.icon || '');
  const [age, setAge] = useState(cat.age_restriction || 0);
  const [vehicle, setVehicle] = useState(cat.delivery_vehicle || 'any');
  const [scope, setScope] = useState(cat.scope || { country: '', state: '', city: '' });
  const [saving, setSaving] = useState(false);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image trop lourde (max 5 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = () => setIcon(reader.result);
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await adminAPI.updateStoreCategory(cat.key, {
        name, name_en: nameEn, icon, age_restriction: Number(age), delivery_vehicle: vehicle, scope,
      });
      toast.success('Catégorie mise à jour');
      onSaved(r.data);
    } catch { toast.error('Échec de l\'enregistrement'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose} data-testid="store-cat-edit-modal">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Catégorie de livraison</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100" data-testid="store-cat-edit-close"><X size={20} /></button>
        </div>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nom (FR)<span className="text-rose-500"> *</span></label>
        <input value={name} onChange={(e) => setName(e.target.value)} data-testid="store-cat-edit-name"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 mb-3 text-sm" />
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nom (EN)</label>
        <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} data-testid="store-cat-edit-name-en"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 mb-3 text-sm" />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Vérification d&apos;âge</label>
            <select value={age} onChange={(e) => setAge(Number(e.target.value))} data-testid="store-cat-edit-age"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm">
              {AGE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Véhicule</label>
            <select value={vehicle} onChange={(e) => setVehicle(e.target.value)} data-testid="store-cat-edit-vehicle"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm">
              {Object.entries(VEHICLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>

        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Icône</label>
        <div className="flex items-center gap-4 mt-1 mb-2">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center flex-shrink-0">
            <StoreCategoryIcon icon={icon} />
          </div>
          <div className="flex-1">
            <input value={isImage(icon) ? '' : icon} onChange={(e) => setIcon(e.target.value)} placeholder="Emoji (ex: 🛒)"
              data-testid="store-cat-edit-icon-emoji" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2" />
            <input type="file" accept="image/png,image/jpeg" onChange={onFile} data-testid="store-cat-edit-icon-file" className="text-xs" />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">Emoji OU image PNG/JPG (512×512 px recommandé, max 5 Mo).</p>
        <div className="mb-4">
          <ZoneScopePicker value={scope} onChange={setScope} />
          <p className="text-[11px] text-slate-400 mt-1">Vide = disponible partout. Choisissez une zone pour limiter cette catégorie (ex. Vin = métropole uniquement).</p>
        </div>
        <button onClick={save} disabled={saving || !name.trim()} data-testid="store-cat-edit-save"
          className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          <Check size={18} /> {saving ? 'Enregistrement…' : 'Mettre à jour'}
        </button>
      </div>
    </div>
  );
};

export default AdminStoreCategories;
