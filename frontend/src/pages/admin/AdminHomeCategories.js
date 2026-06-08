/**
 * AdminHomeCategories — CMS des catégories de l'écran d'accueil (Iter 87).
 * L'admin gère toutes les sections : ajout/édition/suppression, icône (bibliothèque
 * ou image uploadée), nom FR/EN, sous-titre, ordre, visibilité accueil, route cible.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash, ArrowUp, ArrowDown, Eye, EyeSlash, X, Image as ImageIcon, DeviceMobile } from '@phosphor-icons/react';
import { homeCategoriesAPI, adminAPI } from '../../services/api';
import DynamicIcon, { ICON_MAP } from '../../components/DynamicIcon';

// Section keys that render as a tile grid on the Home (taxi + the CMS tile sections).
const TILE_SECTIONS = new Set(['taxi', 'delivery', 'ondemand', 'beauty', 'pet', 'carcare', 'towing', 'nearby']);

const BG_OPTIONS = ['bg-amber-50', 'bg-teal-50', 'bg-blue-50', 'bg-orange-50', 'bg-pink-50', 'bg-green-50', 'bg-cyan-50', 'bg-rose-50', 'bg-purple-50', 'bg-indigo-50', 'bg-emerald-50', 'bg-sky-50', 'bg-lime-50', 'bg-slate-50', 'bg-gray-50', 'bg-red-50', 'bg-fuchsia-50', 'bg-yellow-50'];
const COLOR_OPTIONS = ['text-amber-500', 'text-teal-500', 'text-blue-500', 'text-orange-500', 'text-pink-500', 'text-green-600', 'text-cyan-600', 'text-rose-500', 'text-purple-500', 'text-indigo-600', 'text-emerald-600', 'text-sky-500', 'text-lime-600', 'text-slate-600', 'text-gray-600', 'text-red-600'];

const emptyForm = {
  section: 'delivery', label_fr: '', label_en: '', subtitle_fr: '', icon_name: 'GridFour',
  image_url: null, bg_class: 'bg-gray-50', icon_color_class: 'text-gray-600',
  target_route: '/food', visible_home: true, status: 'active', badge: '',
};

const isImg = (s) => typeof s === 'string' && (s.startsWith('http') || s.startsWith('data:'));

const PreviewTile = ({ t }) => (
  <div className="flex flex-col items-center gap-1 w-1/4 mb-3 px-0.5">
    <div className={`w-12 h-12 rounded-xl ${t.bg || 'bg-orange-50'} flex items-center justify-center`}>
      {t.iconName
        ? <DynamicIcon name={t.iconName} imageUrl={t.imageUrl} size={22} className={t.color || 'text-[#FF5000]'} />
        : isImg(t.emoji)
          ? <img src={t.emoji} alt="" className="w-6 h-6 object-contain" />
          : <span className="text-xl leading-none">{t.emoji || '🚕'}</span>}
    </div>
    <span className="text-[9px] text-center leading-tight whitespace-pre-line text-[#1F2430]">{(t.label || '').replace(/\\n/g, '\n')}</span>
  </div>
);

// Read-only preview of the client Home reflecting the saved order/visibility — lets
// the admin verify changes without leaving the panel (the real /home is user-only).
function HomePreviewModal({ secLayout, items, taxiCats, onClose }) {
  const tilesFor = (key) => {
    if (key === 'taxi') {
      const home = (taxiCats || [])
        .filter((c) => c.active !== false && c.visible_home === true)
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
        .map((c) => ({ id: c.key, label: c.name, emoji: c.icon }));
      home.push({ id: 'more-taxi', label: 'Tous les\nTaxis', iconName: 'GridFour', bg: 'bg-orange-50', color: 'text-orange-500' });
      return home;
    }
    return (items || [])
      .filter((i) => i.section === key && i.status === 'active' && i.visible_home)
      .sort((a, b) => a.display_order - b.display_order)
      .map((i) => ({ id: i.id, label: i.label_fr, iconName: i.icon_name, imageUrl: i.image_url, bg: i.bg_class, color: i.icon_color_class }));
  };
  const visibleSections = (secLayout || []).filter((s) => s.visible);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-sm max-h-[92vh] flex flex-col overflow-hidden" data-testid="home-preview-modal">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-bold text-[#0B1426] flex items-center gap-2"><DeviceMobile size={18} /> Aperçu de l&apos;accueil</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100" data-testid="home-preview-close"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-4 bg-[#F8F9FA]">
          {visibleSections.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Toutes les sections sont masquées.</p>}
          {visibleSections.map((s) => {
            const tiles = TILE_SECTIONS.has(s.key) ? tilesFor(s.key) : null;
            return (
              <div key={s.key} className="mb-5" data-testid={`preview-section-${s.key}`}>
                <p className="text-sm font-bold text-[#0B1426] mb-2">{s.title_fr}</p>
                {tiles ? (
                  tiles.length ? (
                    <div className="flex flex-wrap bg-white rounded-xl p-2 border border-slate-100">
                      {tiles.map((t) => <PreviewTile key={t.id} t={t} />)}
                    </div>
                  ) : <p className="text-[11px] text-slate-400 italic">Aucune tuile visible</p>
                ) : (
                  <div className="rounded-lg bg-slate-100 text-slate-400 text-[11px] py-2 text-center">Bloc dynamique</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AdminHomeCategories() {
  const [items, setItems] = useState([]);
  const [sections, setSections] = useState([]);
  const [secLayout, setSecLayout] = useState([]);
  const [taxiCats, setTaxiCats] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([homeCategoriesAPI.adminList(), homeCategoriesAPI.adminSections()]);
      setItems(r.data.items || []);
      setSections(r.data.sections || []);
      setSecLayout(s.data.sections || []);
      // Taxi tiles for the preview come from service_categories (managed elsewhere).
      try { const t = await adminAPI.listServiceCategories(); setTaxiCats(Array.isArray(t.data) ? t.data : (t.data.items || [])); }
      catch { /* preview will just skip taxi tiles */ }
    } catch (e) { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Reorder a whole home section (↑/↓) — reflected in the client Home block order.
  const moveSection = async (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= secLayout.length) return;
    const next = [...secLayout];
    [next[idx], next[j]] = [next[j], next[idx]];
    setSecLayout(next);
    try { await homeCategoriesAPI.reorderSections(next.map((s) => s.key)); }
    catch { toast.error('Échec du classement'); load(); }
  };

  // Show/hide an entire home section.
  const toggleSection = async (key) => {
    try {
      const r = await homeCategoriesAPI.toggleSection(key);
      setSecLayout((ls) => ls.map((s) => (s.key === key ? { ...s, visible: r.data.visible } : s)));
      toast.success(r.data.visible ? 'Section affichée' : 'Section masquée');
    } catch { toast.error('Erreur'); }
  };

  const openCreate = (section) => { setEditing(null); setForm({ ...emptyForm, section: section || 'delivery' }); setShowForm(true); };
  // Show stored line-breaks as literal "\n" in the single-line inputs so admins can
  // edit two-line labels (round-tripped back to real newlines on save).
  const openEdit = (it) => {
    setEditing(it);
    setForm({
      ...emptyForm, ...it,
      label_fr: (it.label_fr || '').replace(/\n/g, '\\n'),
      label_en: (it.label_en || '').replace(/\n/g, '\\n'),
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.label_fr) { toast.error('Nom (FR) requis'); return; }
    // Round-trip: convert the literal "\n" admins type into real newlines so the
    // client renders two-line labels (whitespace-pre-line).
    const payload = {
      ...form,
      label_fr: form.label_fr.replace(/\\n/g, '\n'),
      label_en: (form.label_en || '').replace(/\\n/g, '\n'),
    };
    try {
      if (editing) { await homeCategoriesAPI.update(editing.id, payload); toast.success('Catégorie mise à jour'); }
      else { await homeCategoriesAPI.create(payload); toast.success('Catégorie créée'); }
      setShowForm(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const remove = async (it) => {
    if (!window.confirm(`Supprimer "${it.label_fr.replace(/\n/g, ' ')}" ?`)) return;
    try { await homeCategoriesAPI.remove(it.id); toast.success('Supprimé'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const toggleVisible = async (it) => {
    try { await homeCategoriesAPI.update(it.id, { visible_home: !it.visible_home }); load(); }
    catch (e) { toast.error('Erreur'); }
  };

  const move = async (sectionItems, idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= sectionItems.length) return;
    const reordered = [...sectionItems];
    const [m] = reordered.splice(idx, 1);
    reordered.splice(j, 0, m);
    setItems((prev) => {
      const others = prev.filter((p) => p.section !== sectionItems[0].section);
      return [...others, ...reordered];
    });
    try { await homeCategoriesAPI.reorder(reordered.map((x) => x.id)); }
    catch (e) { toast.error('Erreur réordonnancement'); load(); }
  };

  const onImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error('Image trop volumineuse (max 8 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, image_url: reader.result }));
    reader.readAsDataURL(file);
  };

  // Taxi tiles are now driven by "Catégories de service (Taxi)" (service_categories),
  // not this CMS — exclude the stale taxi section to avoid confusion.
  const managedSections = sections.filter((s) => s.key !== 'taxi');
  const grouped = managedSections.map((s) => ({ ...s, list: items.filter((i) => i.section === s.key).sort((a, b) => a.display_order - b.display_order) }));

  return (
    <div className="p-6" data-testid="admin-home-categories-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Catégories de l&apos;accueil</h1>
          <p className="text-sm text-gray-500 mt-1">Configurez l&apos;écran d&apos;accueil : icônes, noms, ordre, visibilité. Les catégories masquées vont dans « Plus de services ».</p>
        </div>
        <button onClick={() => openCreate('delivery')} className="bg-[#0B1426] text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-2" data-testid="add-category-btn">
          <Plus size={18} weight="bold" /> Nouvelle catégorie
        </button>
      </div>

      <div className="-mt-3 mb-4">
        <button onClick={() => setShowPreview(true)} data-testid="home-preview-btn"
          className="inline-flex items-center gap-2 bg-[#FF5000] text-white font-semibold px-4 py-2 rounded-lg shadow-sm hover:bg-[#e64800] transition-colors">
          <DeviceMobile size={18} weight="bold" /> Aperçu de l&apos;accueil
        </button>
      </div>

      <div className="mb-6 flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm text-[#0B1426]" data-testid="taxi-managed-elsewhere-note">
        <span className="text-[#FF5000] font-bold">ℹ︎</span>
        <span>Les tuiles <b>Taxi</b> de l&apos;accueil se gèrent dans <b>« Catégories de service (Taxi) »</b> (toggle « Accueil »). Cette page contrôle toutes les <b>autres</b> sections (Livraison, Beauté, Auto, Animaux, Remorquage, À proximité…).</span>
      </div>

      {/* ===== Section layout: order + show/hide whole sections ===== */}
      {!loading && (
        <div className="mb-8 bg-white rounded-xl shadow p-4" data-testid="section-layout-panel">
          <h2 className="text-lg font-bold text-gray-800 mb-1">Ordre & visibilité des sections</h2>
          <p className="text-sm text-gray-500 mb-3">Réordonnez les sections de l&apos;accueil (↑/↓) et masquez-en une entièrement avec l&apos;œil. L&apos;ordre est reflété en direct dans l&apos;app client.</p>
          <div className="divide-y border rounded-lg">
            {secLayout.map((s, idx) => (
              <div key={s.key} className={`flex items-center gap-3 p-2.5 ${!s.visible ? 'opacity-50' : ''}`} data-testid={`section-layout-row-${s.key}`}>
                <span className="text-xs font-mono text-gray-400 w-6 text-center">{idx + 1}</span>
                <span className="flex-1 font-semibold text-sm text-gray-800">{s.title_fr}</span>
                <button onClick={() => moveSection(idx, -1)} disabled={idx === 0} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30" title="Monter" data-testid={`section-up-${s.key}`}><ArrowUp size={15} /></button>
                <button onClick={() => moveSection(idx, 1)} disabled={idx === secLayout.length - 1} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30" title="Descendre" data-testid={`section-down-${s.key}`}><ArrowDown size={15} /></button>
                <button onClick={() => toggleSection(s.key)} className={`p-1.5 rounded hover:bg-gray-100 ${s.visible ? 'text-emerald-600' : 'text-gray-400'}`} title="Afficher/Masquer la section" data-testid={`section-toggle-${s.key}`}>
                  {s.visible ? <Eye size={16} /> : <EyeSlash size={16} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? <p>Chargement…</p> : grouped.map((sec) => (
        <div key={sec.key} className="mb-8" data-testid={`section-${sec.key}`}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-gray-800">{sec.title_fr} <span className="text-xs text-gray-400 font-normal">({sec.list.length})</span></h2>
            <button onClick={() => openCreate(sec.key)} className="text-sm text-indigo-600 font-semibold" data-testid={`add-to-${sec.key}`}>+ Ajouter</button>
          </div>
          <div className="bg-white rounded-xl shadow divide-y">
            {sec.list.length === 0 && <p className="text-sm text-gray-400 p-4">Aucune catégorie.</p>}
            {sec.list.map((it, idx) => (
              <div key={it.id} className={`flex items-center gap-3 p-3 ${!it.visible_home ? 'opacity-50' : ''}`} data-testid={`category-row-${it.id}`}>
                <div className={`w-11 h-11 rounded-xl ${it.bg_class} flex items-center justify-center flex-shrink-0`}>
                  <DynamicIcon name={it.icon_name} imageUrl={it.image_url} size={24} className={it.icon_color_class} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{it.label_fr.replace(/\n/g, ' ')}</p>
                  <p className="text-xs text-gray-400 truncate">{it.target_route}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => move(sec.list, idx, -1)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Monter"><ArrowUp size={15} /></button>
                  <button onClick={() => move(sec.list, idx, 1)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Descendre"><ArrowDown size={15} /></button>
                  <button onClick={() => toggleVisible(it)} className={`p-1.5 rounded hover:bg-gray-100 ${it.visible_home ? 'text-emerald-600' : 'text-gray-400'}`} title="Visible accueil" data-testid={`toggle-visible-${it.id}`}>
                    {it.visible_home ? <Eye size={16} /> : <EyeSlash size={16} />}
                  </button>
                  <button onClick={() => openEdit(it)} className="p-1.5 rounded hover:bg-amber-50 text-amber-600"><Pencil size={15} /></button>
                  <button onClick={() => remove(it)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showPreview && (
        <HomePreviewModal secLayout={secLayout} items={items} taxiCats={taxiCats} onClose={() => setShowPreview(false)} />
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[92vh] overflow-y-auto" data-testid="category-form-modal">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{editing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded hover:bg-gray-100"><X size={20} /></button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Section</label>
                <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" data-testid="cat-section-select">
                  {managedSections.map((s) => <option key={s.key} value={s.key}>{s.title_fr}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Route cible</label>
                <input value={form.target_route} onChange={(e) => setForm({ ...form, target_route: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" placeholder="/taxi?mode=standard" data-testid="cat-route-input" />
              </div>
              <div>
                <label className="text-sm font-medium">Nom (FR) — utilisez \n pour 2 lignes</label>
                <input value={form.label_fr} onChange={(e) => setForm({ ...form, label_fr: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" data-testid="cat-label-fr-input" />
              </div>
              <div>
                <label className="text-sm font-medium">Nom (EN)</label>
                <input value={form.label_en} onChange={(e) => setForm({ ...form, label_en: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Sous-titre (optionnel)</label>
                <input value={form.subtitle_fr} onChange={(e) => setForm({ ...form, subtitle_fr: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" />
              </div>
            </div>

            {/* Icon library */}
            <div className="mt-4">
              <label className="text-sm font-medium">Icône (bibliothèque)</label>
              <div className="grid grid-cols-8 gap-2 mt-2 max-h-40 overflow-y-auto border rounded-lg p-2" data-testid="icon-picker">
                {Object.keys(ICON_MAP).map((name) => (
                  <button key={name} onClick={() => setForm({ ...form, icon_name: name, image_url: null })}
                    className={`aspect-square rounded-lg flex items-center justify-center border ${form.icon_name === name && !form.image_url ? 'border-[#0B1426] bg-amber-50' : 'border-transparent hover:bg-gray-50'}`}
                    data-testid={`icon-opt-${name}`} title={name}>
                    <DynamicIcon name={name} size={22} className="text-gray-700" />
                  </button>
                ))}
              </div>
            </div>

            {/* Image upload */}
            <div className="mt-4 flex items-center gap-3">
              <label className="text-sm font-medium flex items-center gap-1"><ImageIcon size={16} /> ou image perso</label>
              <input type="file" accept="image/*" onChange={onImageUpload} className="text-xs" data-testid="cat-image-upload" />
              {form.image_url && (
                <div className="flex items-center gap-2">
                  <img src={form.image_url} alt="" className="w-9 h-9 object-contain rounded" />
                  <button onClick={() => setForm({ ...form, image_url: null })} className="text-xs text-red-600 underline">retirer</button>
                </div>
              )}
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-sm font-medium">Fond</label>
                <select value={form.bg_class} onChange={(e) => setForm({ ...form, bg_class: e.target.value })} className="w-full border rounded px-3 py-2 mt-1">
                  {BG_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Couleur icône</label>
                <select value={form.icon_color_class} onChange={(e) => setForm({ ...form, icon_color_class: e.target.value })} className="w-full border rounded px-3 py-2 mt-1">
                  {COLOR_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Badge (Nouveau / Promo) */}
            <div className="mt-4">
              <label className="text-sm font-medium">Badge</label>
              <select value={form.badge || ''} onChange={(e) => setForm({ ...form, badge: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" data-testid="cat-badge-select">
                <option value="">Aucun</option>
                <option value="Nouveau">Nouveau</option>
                <option value="Promo">Promo</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">Affiche une pastille « Nouveau » ou « Promo » sur la tuile du service.</p>
            </div>

            {/* Preview + visibility */}
            <div className="flex items-center justify-between mt-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl ${form.bg_class} flex items-center justify-center`}>
                  <DynamicIcon name={form.icon_name} imageUrl={form.image_url} size={26} className={form.icon_color_class} />
                </div>
                <span className="text-xs whitespace-pre-line text-center font-medium">{(form.label_fr || 'Aperçu').replace(/\\n/g, '\n')}</span>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.visible_home} onChange={(e) => setForm({ ...form, visible_home: e.target.checked })} data-testid="cat-visible-checkbox" /> Visible sur l&apos;accueil
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-5 py-2 border rounded-lg">Annuler</button>
              <button onClick={save} className="px-5 py-2 bg-[#0B1426] text-white font-semibold rounded-lg" data-testid="cat-save-btn">{editing ? 'Mettre à jour' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
