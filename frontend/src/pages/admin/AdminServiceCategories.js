/**
 * AdminServiceCategories — V3Cube "Service Category (Taxi Service)".
 * Grille de catégories taxi avec toggle Actif/Inactif + édition (nom FR/EN + icône).
 * Désactiver une catégorie la masque dans le hub client /taxi.
 */
import React, { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { MagnifyingGlass, ArrowsClockwise, PencilSimple, X, Check } from '@phosphor-icons/react';
import { adminAPI } from '../../services/api';

const GROUP_LABELS = { everyday: 'Au quotidien', time: 'Temps & Distance', special: 'Spécialisé & Inclusif' };

const isImage = (icon) => typeof icon === 'string' && (icon.startsWith('http') || icon.startsWith('data:'));

const ServiceCategoryIcon = ({ icon }) => {
  if (isImage(icon)) return <img src={icon} alt="" className="w-10 h-10 object-contain" />;
  return <span className="text-3xl leading-none">{icon || '🚕'}</span>;
};

const AdminServiceCategories = () => {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState(null);

  const load = () => {
    setLoading(true);
    adminAPI.listServiceCategories()
      .then((r) => setCats(r.data || []))
      .catch(() => toast.error('Erreur de chargement'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const toggle = async (key) => {
    try {
      const r = await adminAPI.toggleServiceCategory(key);
      setCats((cs) => cs.map((c) => (c.key === key ? { ...c, active: r.data.active } : c)));
      toast.success(r.data.active ? 'Catégorie activée' : 'Catégorie désactivée');
    } catch { toast.error('Échec de la mise à jour'); }
  };

  const filtered = useMemo(() => cats.filter((c) => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.name_en?.toLowerCase().includes(q);
    const matchStatus = !statusFilter || (statusFilter === 'active' ? c.active : !c.active);
    return matchSearch && matchStatus;
  }), [cats, search, statusFilter]);

  return (
    <div className="p-6" data-testid="admin-service-categories-page">
      <h1 className="text-2xl font-bold text-slate-900">Catégories de service (Taxi)</h1>
      <p className="text-sm text-slate-500 mb-5">Activez/désactivez chaque mode de réservation et personnalisez son nom et son icône. Les catégories désactivées disparaissent de l'app client.</p>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…"
            data-testid="svc-cat-search" className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          data-testid="svc-cat-status-filter" className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Tous les statuts</option>
          <option value="active">Actif</option>
          <option value="inactive">Inactif</option>
        </select>
        <button onClick={load} data-testid="svc-cat-refresh" className="p-2.5 rounded-lg bg-violet-100 text-violet-600"><ArrowsClockwise size={18} /></button>
      </div>

      {loading ? (
        <p className="text-slate-500" data-testid="svc-cat-loading">Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div key={c.key} data-testid={`svc-cat-card-${c.key}`} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
                  <ServiceCategoryIcon icon={c.icon} />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {c.active ? 'Actif' : 'Inactif'}
                  </span>
                  <button onClick={() => toggle(c.key)} data-testid={`svc-cat-toggle-${c.key}`}
                    className={`relative w-11 h-6 rounded-full transition-colors ${c.active ? 'bg-[#0B1426]' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${c.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>
              <p className="font-bold text-slate-900">{c.name}</p>
              <p className="text-[11px] text-slate-400 mb-3">{GROUP_LABELS[c.group] || c.group}</p>
              <button onClick={() => setEditing(c)} data-testid={`svc-cat-edit-${c.key}`}
                className="text-sm font-semibold text-violet-600 flex items-center gap-1">
                Modifier <PencilSimple size={14} />
              </button>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-slate-400 col-span-full text-center py-8">Aucune catégorie</p>}
        </div>
      )}

      {editing && (
        <EditCategoryModal cat={editing} onClose={() => setEditing(null)}
          onSaved={(updated) => { setCats((cs) => cs.map((c) => (c.key === updated.key ? updated : c))); setEditing(null); }} />
      )}
    </div>
  );
};

const EditCategoryModal = ({ cat, onClose, onSaved }) => {
  const [name, setName] = useState(cat.name || '');
  const [nameEn, setNameEn] = useState(cat.name_en || '');
  const [icon, setIcon] = useState(cat.icon || '');
  const [saving, setSaving] = useState(false);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) { toast.error('Image trop lourde (max 512 Ko)'); return; }
    const reader = new FileReader();
    reader.onload = () => setIcon(reader.result);
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await adminAPI.updateServiceCategory(cat.key, { name, name_en: nameEn, icon });
      toast.success('Catégorie mise à jour');
      onSaved(r.data);
    } catch { toast.error('Échec de l\'enregistrement'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose} data-testid="svc-cat-edit-modal">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Catégorie de service</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100" data-testid="svc-cat-edit-close"><X size={20} /></button>
        </div>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nom (FR)<span className="text-rose-500"> *</span></label>
        <input value={name} onChange={(e) => setName(e.target.value)} data-testid="svc-cat-edit-name"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 mb-3 text-sm" />
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nom (EN)</label>
        <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} data-testid="svc-cat-edit-name-en"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 mb-3 text-sm" />
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Icône</label>
        <div className="flex items-center gap-4 mt-1 mb-2">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center flex-shrink-0">
            <ServiceCategoryIcon icon={icon} />
          </div>
          <div className="flex-1">
            <input value={isImage(icon) ? '' : icon} onChange={(e) => setIcon(e.target.value)} placeholder="Emoji (ex: 🚕)"
              data-testid="svc-cat-edit-icon-emoji" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2" />
            <input type="file" accept="image/png,image/jpeg" onChange={onFile} data-testid="svc-cat-edit-icon-file" className="text-xs" />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">Emoji OU image PNG/JPG (512×512 px recommandé, max 512 Ko).</p>
        <button onClick={save} disabled={saving || !name.trim()} data-testid="svc-cat-edit-save"
          className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          <Check size={18} /> {saving ? 'Enregistrement…' : 'Mettre à jour'}
        </button>
      </div>
    </div>
  );
};

export default AdminServiceCategories;
