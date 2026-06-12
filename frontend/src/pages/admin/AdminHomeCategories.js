/**
 * AdminHomeCategories — CMS des catégories de l'écran d'accueil (Iter 87).
 * L'admin gère toutes les sections : ajout/édition/suppression, icône (bibliothèque
 * ou image uploadée), nom FR/EN, sous-titre, ordre, visibilité accueil, route cible.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Pencil, Trash, ArrowUp, ArrowDown, Eye, EyeSlash, X, Image as ImageIcon, DeviceMobile, PencilSimple, ArrowSquareOut, MagnifyingGlass } from '@phosphor-icons/react';
import { homeCategoriesAPI, adminAPI } from '../../services/api';
import DynamicIcon, { ICON_MAP, resolveImageUrl } from '../../components/DynamicIcon';
import { ImageUpload } from '../../components/ImageUpload';

// Section keys that render as a tile grid on the Home (taxi + the CMS tile sections).
const TILE_SECTIONS = new Set(['taxi', 'delivery', 'parcel', 'marketplace', 'ondemand', 'beauty', 'pet', 'carcare', 'towing', 'nearby']);

const BG_OPTIONS = ['bg-amber-50', 'bg-teal-50', 'bg-blue-50', 'bg-orange-50', 'bg-pink-50', 'bg-green-50', 'bg-cyan-50', 'bg-rose-50', 'bg-purple-50', 'bg-indigo-50', 'bg-emerald-50', 'bg-sky-50', 'bg-lime-50', 'bg-slate-50', 'bg-gray-50', 'bg-red-50', 'bg-fuchsia-50', 'bg-yellow-50'];
const COLOR_OPTIONS = ['text-amber-500', 'text-teal-500', 'text-blue-500', 'text-orange-500', 'text-pink-500', 'text-green-600', 'text-cyan-600', 'text-rose-500', 'text-purple-500', 'text-indigo-600', 'text-emerald-600', 'text-sky-500', 'text-lime-600', 'text-slate-600', 'text-gray-600', 'text-red-600'];

const emptyForm = {
  section: 'delivery', label_fr: '', label_en: '', subtitle_fr: '', icon_name: 'GridFour',
  image_url: null, bg_class: 'bg-gray-50', icon_color_class: 'text-gray-600',
  target_route: '/food', visible_home: true, status: 'active', badge: '',
};

const isImg = (s) => typeof s === 'string' && (s.startsWith('http') || s.startsWith('data:') || s.startsWith('/api/'));

const PreviewTile = ({ t }) => (
  <div className="flex flex-col items-center gap-1 w-1/4 mb-3 px-0.5">
    <div className={`w-12 h-12 rounded-xl ${t.bg || 'bg-orange-50'} flex items-center justify-center`}>
      {t.iconName
        ? <DynamicIcon name={t.iconName} imageUrl={t.imageUrl} size={22} className={t.color || 'text-[#FF5000]'} />
        : isImg(t.emoji)
          ? <img src={resolveImageUrl(t.emoji)} alt="" className="w-6 h-6 object-contain" />
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

// Sections that are NOT editable tile-grids on this page: each is managed on its
// own dedicated admin page (route) — clicking "Gérer" routes there.
const SECTION_ROUTE = {
  taxi: '/admin/service-categories',
  promo: '/admin/promo-banners',
  medical: '/admin/medical',
  bid: '/admin/bids',
  genie: '/admin/genie',
  video: '/admin/video',
  giftcards: '/admin/giftcards',
  carpool: '/admin/rideshare',
  tracking: '/admin/tracking',
};

export default function AdminHomeCategories() {
  const navigate = useNavigate();
  const sectionRefs = useRef({});
  const [highlight, setHighlight] = useState('');
  const [query, setQuery] = useState('');
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
    try { await homeCategoriesAPI.reorderSections(next.map((s) => s.key)); toast.success('Ordre des sections mis à jour'); }
    catch { toast.error('Échec du classement'); load(); }
  };

  const [editingSecKey, setEditingSecKey] = useState(null);
  const [editingSecTitle, setEditingSecTitle] = useState('');
  const startEditSection = (s) => { setEditingSecKey(s.key); setEditingSecTitle(s.title_fr || ''); };
  const cancelEditSection = () => { setEditingSecKey(null); setEditingSecTitle(''); };
  const saveSectionTitle = async (key) => {
    const title = editingSecTitle.trim();
    if (!title) { toast.error('Le titre ne peut pas être vide'); return; }
    try {
      await homeCategoriesAPI.updateSection(key, { title_fr: title });
      setSecLayout((prev) => prev.map((s) => (s.key === key ? { ...s, title_fr: title } : s)));
      toast.success('Titre mis à jour');
      cancelEditSection();
    } catch { toast.error('Échec de la mise à jour'); }
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
    try { await homeCategoriesAPI.reorder(reordered.map((x) => x.id)); toast.success('Ordre mis à jour'); }
    catch (e) { toast.error('Erreur réordonnancement'); load(); }
  };

  // Image upload now goes through <ImageUpload> → POST /api/uploads/image, which
  // returns a small relative URL stored in form.image_url (no more base64 blobs
  // that overflowed the request body and silently failed to persist).

  // Taxi tiles are now driven by "Catégories de service (Taxi)" (service_categories),
  // not this CMS — exclude the stale taxi section to avoid confusion.
  const managedSections = sections.filter((s) => s.key !== 'taxi');
  const grouped = managedSections.map((s) => ({ ...s, list: items.filter((i) => i.section === s.key).sort((a, b) => a.display_order - b.display_order) }));
  const editableKeys = new Set(managedSections.map((s) => s.key));

  // Search/filter across all tiles by name (FR/EN) or route. When active, the
  // section-order panel is hidden and only matching tiles are shown.
  const q = query.trim().toLowerCase();
  const groupedFiltered = q
    ? grouped
        .map((s) => ({ ...s, list: s.list.filter((it) => `${it.label_fr} ${it.label_en} ${it.target_route}`.toLowerCase().includes(q)) }))
        .filter((s) => s.list.length)
    : grouped;
  const matchCount = q ? groupedFiltered.reduce((n, s) => n + s.list.length, 0) : 0;

  // From the section-order panel, jump to the right place to ADD/EDIT tiles:
  // a tile section editable here → scroll to its block; otherwise → its own page.
  const goManage = (key) => {
    if (editableKeys.has(key)) {
      const el = sectionRefs.current[key];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setHighlight(key);
        setTimeout(() => setHighlight(''), 1800);
      }
    } else if (SECTION_ROUTE[key]) {
      navigate(SECTION_ROUTE[key]);
    } else {
      toast.info('Cette section est un bloc dynamique : seuls l\u2019ordre et la visibilit\u00e9 sont configurables ici.');
    }
  };

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

      <div className="-mt-3 mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => setShowPreview(true)} data-testid="home-preview-btn"
          className="inline-flex items-center gap-2 bg-[#FF5000] text-white font-semibold px-4 py-2 rounded-lg shadow-sm hover:bg-[#e64800] transition-colors">
          <DeviceMobile size={18} weight="bold" /> Aperçu de l&apos;accueil
        </button>
        <div className="relative flex-1 min-w-[220px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un service par nom ou route…"
            className="w-full border rounded-lg pl-9 pr-9 py-2 text-sm"
            data-testid="cms-search-input"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 text-gray-400" data-testid="cms-search-clear"><X size={15} /></button>
          )}
        </div>
        {q && <span className="text-xs text-gray-500" data-testid="cms-search-count">{matchCount} résultat(s)</span>}
      </div>

      <div className="mb-6 flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm text-[#0B1426]" data-testid="taxi-managed-elsewhere-note">
        <span className="text-[#FF5000] font-bold">ℹ︎</span>
        <span>Les tuiles <b>Taxi</b> de l&apos;accueil se gèrent dans <b>« Catégories de service (Taxi) »</b> (toggle « Accueil »). Cette page contrôle toutes les <b>autres</b> sections (Livraison, Beauté, Auto, Animaux, Remorquage, À proximité…).</span>
      </div>

      {/* ===== Section layout: order + show/hide whole sections ===== */}
      {!loading && !q && (
        <div className="mb-8 bg-white rounded-xl shadow p-4" data-testid="section-layout-panel">
          <h2 className="text-lg font-bold text-gray-800 mb-1">Ordre & visibilité des sections</h2>
          <p className="text-sm text-gray-500 mb-3">Réordonnez les sections de l&apos;accueil (↑/↓) et masquez-en une entièrement avec l&apos;œil. L&apos;ordre est reflété en direct dans l&apos;app client. Cliquez sur <b>Gérer</b> pour <b>ajouter / modifier les services</b> d&apos;une section.</p>
          <div className="divide-y border rounded-lg">
            {secLayout.map((s, idx) => {
              const manageable = editableKeys.has(s.key);
              const hasPage = !!SECTION_ROUTE[s.key];
              return (
              <div key={s.key} className={`flex items-center gap-3 p-2.5 ${!s.visible ? 'opacity-50' : ''}`} data-testid={`section-layout-row-${s.key}`}>
                <span className="text-xs font-mono text-gray-400 w-6 text-center">{idx + 1}</span>
                {editingSecKey === s.key ? (
                  <div className="flex-1 flex items-center gap-1.5">
                    <input autoFocus value={editingSecTitle} onChange={(e) => setEditingSecTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveSectionTitle(s.key); if (e.key === 'Escape') cancelEditSection(); }}
                      className="flex-1 border rounded px-2 py-1 text-sm" data-testid={`section-title-input-${s.key}`} />
                    <button onClick={() => saveSectionTitle(s.key)} className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded px-2 py-1" data-testid={`section-title-save-${s.key}`}>OK</button>
                    <button onClick={cancelEditSection} className="text-xs text-gray-500 px-1"><X size={14} /></button>
                  </div>
                ) : (
                  <span className="flex-1 flex items-center gap-1.5 font-semibold text-sm text-gray-800">
                    {s.title_fr}
                    <button onClick={() => startEditSection(s)} title="Renommer le titre" className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-indigo-600" data-testid={`section-rename-${s.key}`}><Pencil size={13} /></button>
                  </span>
                )}
                {(manageable || hasPage) ? (
                  <button onClick={() => goManage(s.key)} title={manageable ? 'Ajouter / modifier les services' : 'Gérer sur sa page dédiée'}
                    className="flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md px-2 py-1" data-testid={`section-manage-${s.key}`}>
                    {manageable ? <PencilSimple size={13} /> : <ArrowSquareOut size={13} />} Gérer
                  </button>
                ) : (
                  <span className="text-[10px] text-gray-400 italic px-2" title="Bloc dynamique">ordre/visibilité</span>
                )}
                <button onClick={() => moveSection(idx, -1)} disabled={idx === 0} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30" title="Monter" data-testid={`section-up-${s.key}`}><ArrowUp size={15} /></button>
                <button onClick={() => moveSection(idx, 1)} disabled={idx === secLayout.length - 1} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30" title="Descendre" data-testid={`section-down-${s.key}`}><ArrowDown size={15} /></button>
                <button onClick={() => toggleSection(s.key)} className={`p-1.5 rounded hover:bg-gray-100 ${s.visible ? 'text-emerald-600' : 'text-gray-400'}`} title="Afficher/Masquer la section" data-testid={`section-toggle-${s.key}`}>
                  {s.visible ? <Eye size={16} /> : <EyeSlash size={16} />}
                </button>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? <p>Chargement…</p> : groupedFiltered.map((sec) => (
        <div key={sec.key} ref={(el) => { sectionRefs.current[sec.key] = el; }} className={`mb-8 rounded-xl transition-shadow ${highlight === sec.key ? 'ring-2 ring-indigo-400 ring-offset-2' : ''}`} data-testid={`section-${sec.key}`}>
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
                  <button onClick={() => move(sec.list, idx, -1)} disabled={idx === 0} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30" title="Monter" data-testid={`category-up-${it.id}`}><ArrowUp size={15} /></button>
                  <button onClick={() => move(sec.list, idx, 1)} disabled={idx === sec.list.length - 1} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30" title="Descendre" data-testid={`category-down-${it.id}`}><ArrowDown size={15} /></button>
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

      {!loading && q && groupedFiltered.length === 0 && (
        <p className="text-center text-gray-400 py-10" data-testid="cms-search-empty">Aucun service ne correspond à « {query} ».</p>
      )}

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

            {/* Image upload (uploads to /api/uploads/image, stores relative URL) */}
            <div className="mt-4">
              <label className="text-sm font-medium flex items-center gap-1 mb-1"><ImageIcon size={16} /> ou image perso (remplace l&apos;icône)</label>
              <ImageUpload
                value={form.image_url}
                onChange={(url) => setForm((f) => ({ ...f, image_url: url || null }))}
                label=""
                testId="cat-image-upload"
              />
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
