/**
 * AdminNews — Actualités / News (parité V3Cube) zone-aware.
 * L'admin publie des articles (titre, contenu, image, audience rider/chauffeur),
 * avec une portée géographique optionnelle (ZoneScopePicker). Un encart
 * « Aperçu par zone » montre exactement ce qu'un client d'une zone verra.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash, Eye, EyeSlash, X, Image as ImageIcon, MapPin, Globe, PushPin } from '@phosphor-icons/react';
import { newsAPI } from '../../services/api';
import { ZoneScopePicker } from '../../components/admin/ZoneScopePicker';

const emptyForm = {
  title: '', body: '', image_url: '', audience: 'all', pinned: false, status: 'published',
  scope: { country: '', state: '', city: '' },
};

const AUDIENCE_LABEL = { all: 'Tous', rider: 'Clients', driver: 'Chauffeurs', merchant: 'Marchands' };
const scopeLabel = (s) => (!s || !s.country ? '' : [s.city, s.state, s.country_name || s.country].filter(Boolean).join(', '));

function NewsCard({ n }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-100 bg-white" data-testid="news-preview-card">
      {n.image_url && <div className="h-28 bg-cover bg-center" style={{ backgroundImage: `url('${n.image_url}')` }} />}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          {n.pinned && <PushPin size={13} weight="fill" className="text-amber-500" />}
          <p className="font-bold text-slate-900 text-sm leading-tight">{n.title}</p>
        </div>
        <p className="text-xs text-slate-500 line-clamp-3">{n.body}</p>
      </div>
    </div>
  );
}

export default function AdminNews() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  // Aperçu par zone
  const [showPreview, setShowPreview] = useState(false);
  const [previewZone, setPreviewZone] = useState({ country: '', state: '', city: '' });
  const [previewAudience, setPreviewAudience] = useState('rider');
  const [previewItems, setPreviewItems] = useState(null);

  const load = async () => {
    try {
      const r = await newsAPI.adminList();
      setItems(r.data || []);
    } catch { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    newsAPI.adminList()
      .then((r) => { if (active) setItems(r.data || []); })
      .catch(() => toast.error('Erreur chargement'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const loadPreview = async (zone, audience) => {
    setPreviewZone(zone); setPreviewAudience(audience);
    try {
      const r = await newsAPI.adminPreview(zone, audience);
      setPreviewItems(r.data || []);
    } catch { setPreviewItems([]); }
  };
  const togglePreview = () => {
    const next = !showPreview;
    setShowPreview(next);
    if (next && previewItems === null) loadPreview(previewZone, previewAudience);
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (it) => {
    setEditing(it);
    setForm({
      title: it.title || '', body: it.body || '', image_url: it.image_url || '',
      audience: it.audience || 'all', pinned: !!it.pinned, status: it.status || 'published',
      scope: it.scope || { country: '', state: '', city: '' },
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error('Titre requis'); return; }
    try {
      if (editing) { await newsAPI.update(editing.id, form); toast.success('Article mis à jour'); }
      else { await newsAPI.create(form); toast.success('Article publié'); }
      setShowForm(false); load(); if (showPreview) loadPreview(previewZone, previewAudience);
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const remove = async (it) => {
    if (!window.confirm(`Supprimer "${it.title}" ?`)) return;
    try { await newsAPI.remove(it.id); toast.success('Supprimé'); load(); }
    catch { toast.error('Erreur'); }
  };

  const toggleStatus = async (it) => {
    try { await newsAPI.toggle(it.id); load(); }
    catch { toast.error('Erreur'); }
  };

  const onImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error('Image trop volumineuse (max 8 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, image_url: reader.result }));
    reader.readAsDataURL(file);
  };

  return (
    <div className="p-6" data-testid="admin-news-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Actualités</h1>
          <p className="text-sm text-gray-500 mt-1">Publiez des actualités in-app pour les clients et/ou chauffeurs, ciblées par zone géographique — sans redéploiement.</p>
        </div>
        <button onClick={openCreate} className="bg-[#0B1426] text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-2" data-testid="add-news-btn">
          <Plus size={18} weight="bold" /> Nouvel article
        </button>
      </div>

      {/* Zone preview */}
      <div className="bg-white rounded-xl border border-slate-200 mb-6" data-testid="news-zone-preview-card">
        <button onClick={togglePreview} className="w-full flex items-center justify-between px-4 py-3" data-testid="news-preview-toggle-btn">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Globe size={18} weight="duotone" className="text-emerald-600" /> Aperçu par zone
            <span className="text-xs font-normal text-slate-400">— ce que voit un client de cette zone</span>
          </span>
          {showPreview ? <EyeSlash size={16} className="text-slate-400" /> : <Eye size={16} className="text-slate-400" />}
        </button>
        {showPreview && (
          <div className="px-4 pb-4 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-slate-500">Audience :</span>
              {['rider', 'driver', 'merchant'].map((a) => (
                <button key={a} onClick={() => loadPreview(previewZone, a)} data-testid={`news-preview-audience-${a}`}
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${previewAudience === a ? 'bg-[#0B1426] text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {AUDIENCE_LABEL[a]}
                </button>
              ))}
            </div>
            <ZoneScopePicker value={previewZone} onChange={(zone) => loadPreview(zone, previewAudience)} />
            <p className="text-sm font-semibold text-slate-700 mt-4" data-testid="news-preview-result-count">
              {previewItems === null ? 'Chargement…' : `${previewItems.length} article${previewItems.length > 1 ? 's' : ''} visible${previewItems.length > 1 ? 's' : ''} pour cette zone`}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {(previewItems || []).map((n) => <div key={n.id} data-testid={`news-preview-${n.id}`}><NewsCard n={n} /></div>)}
              {previewItems !== null && previewItems.length === 0 && <p className="text-sm text-slate-400">Aucun article visible dans cette zone.</p>}
            </div>
          </div>
        )}
      </div>

      {loading ? <p>Chargement…</p> : (
        <div className="space-y-3">
          {items.length === 0 && <p className="text-sm text-gray-400">Aucun article. Créez-en un.</p>}
          {items.map((it) => (
            <div key={it.id} className={`bg-white rounded-xl shadow p-4 flex items-center gap-4 ${it.status !== 'published' ? 'opacity-50' : ''}`} data-testid={`news-row-${it.id}`}>
              {it.image_url
                ? <img src={it.image_url} alt="" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                : <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><ImageIcon size={22} className="text-slate-300" /></div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {it.pinned && <PushPin size={13} weight="fill" className="text-amber-500" />}
                  <p className="font-semibold text-sm truncate">{it.title}</p>
                </div>
                <p className="text-xs text-gray-400 truncate">{it.body}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{AUDIENCE_LABEL[it.audience] || it.audience}</span>
                  {it.scope?.country && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full" data-testid={`news-zone-badge-${it.id}`}>
                      <MapPin size={10} weight="fill" /> {scopeLabel(it.scope)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => toggleStatus(it)} className={`p-1.5 rounded hover:bg-gray-100 ${it.status === 'published' ? 'text-emerald-600' : 'text-gray-400'}`} title="Publié" data-testid={`news-toggle-${it.id}`}>
                  {it.status === 'published' ? <Eye size={16} /> : <EyeSlash size={16} />}
                </button>
                <button onClick={() => openEdit(it)} className="p-1.5 rounded hover:bg-amber-50 text-amber-600" data-testid={`news-edit-${it.id}`}><Pencil size={15} /></button>
                <button onClick={() => remove(it)} className="p-1.5 rounded hover:bg-red-50 text-red-600" data-testid={`news-delete-${it.id}`}><Trash size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[92vh] overflow-y-auto" data-testid="news-form-modal">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{editing ? 'Modifier l\'article' : 'Nouvel article'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded hover:bg-gray-100"><X size={20} /></button>
            </div>

            <label className="text-sm font-medium">Titre</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border rounded px-3 py-2 mt-1 mb-3" data-testid="news-title-input" />

            <label className="text-sm font-medium">Contenu</label>
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} className="w-full border rounded px-3 py-2 mt-1 mb-3" data-testid="news-body-input" />

            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className="text-sm font-medium">Audience</label>
                <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" data-testid="news-audience-select">
                  <option value="all">Tous</option>
                  <option value="rider">Clients</option>
                  <option value="driver">Chauffeurs</option>
                  <option value="merchant">Marchands</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Statut</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" data-testid="news-status-select">
                  <option value="published">Publié</option>
                  <option value="draft">Brouillon</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 mb-3 cursor-pointer">
              <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} data-testid="news-pinned-checkbox" />
              <span className="text-sm font-medium flex items-center gap-1"><PushPin size={14} weight="fill" className="text-amber-500" /> Épingler en haut du fil</span>
            </label>

            <div className="flex items-center gap-3 mb-3">
              <label className="text-sm font-medium flex items-center gap-1"><ImageIcon size={16} /> Image</label>
              <input type="file" accept="image/*" onChange={onImageUpload} className="text-xs" data-testid="news-image-upload" />
              {form.image_url && (
                <div className="flex items-center gap-2">
                  <img src={form.image_url} alt="" className="w-12 h-9 object-cover rounded" />
                  <button onClick={() => setForm({ ...form, image_url: '' })} className="text-xs text-red-600 underline">retirer</button>
                </div>
              )}
            </div>

            <ZoneScopePicker value={form.scope} onChange={(scope) => setForm((f) => ({ ...f, scope }))} />

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-5 py-2 border rounded-lg">Annuler</button>
              <button onClick={save} className="px-5 py-2 bg-[#0B1426] text-white font-semibold rounded-lg" data-testid="news-save-btn">{editing ? 'Mettre à jour' : 'Publier'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
