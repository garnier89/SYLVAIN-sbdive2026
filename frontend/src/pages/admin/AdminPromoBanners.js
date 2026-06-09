/**
 * AdminPromoBanners — CMS des bannières promo de l'écran d'accueil.
 * L'admin gère le carrousel promo : ajout/édition/suppression, titre/sous-titre,
 * mise en avant (ex: "-50%"), code promo, bouton CTA + route, image, thème,
 * couleur de fond, ordre et statut actif. Aucune mise en production requise.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash, ArrowUp, ArrowDown, Eye, EyeSlash, X, Image as ImageIcon, MapPin, Globe } from '@phosphor-icons/react';
import { promoBannersAPI } from '../../services/api';
import { ZoneScopePicker } from '../../components/admin/ZoneScopePicker';

const emptyForm = {
  title: '', subtitle: '', highlight: '', promo_code: '', cta_label: '',
  target_route: '/food', image_url: null, theme: 'light', bg_color: '#FFFFFF', status: 'active',
  surfaces: ['home'],
  advertiser: '', advertiser_contact: '', pricing_model: 'free', price_per_day: '', cpm: '', starts_at: '', ends_at: '',
  scope: { country: '', state: '', city: '' },
};

const SURFACE_OPTIONS = [
  { key: 'home', label: 'Accueil' },
  { key: 'food', label: 'Livraison' },
  { key: 'marketplace', label: 'Marketplace' },
];

const scopeLabel = (scope) => {
  if (!scope || !scope.country) return '';
  return [scope.city, scope.state, scope.country_name || scope.country].filter(Boolean).join(', ');
};

function BannerPreview({ b }) {
  const dark = b.theme === 'dark';
  return (
    <div
      className="rounded-2xl overflow-hidden flex items-stretch h-[120px] border border-slate-100"
      style={{ background: dark ? (b.bg_color || '#FF5000') : '#FFFFFF' }}
      data-testid="banner-preview"
    >
      {b.image_url && (
        <div className="w-2/5 bg-cover bg-center" style={{ backgroundImage: `url('${b.image_url}')` }} />
      )}
      <div className="flex-1 p-4 flex flex-col justify-center">
        <p className={`font-bold text-base leading-tight ${dark ? 'text-white' : 'text-[#0B1426]'}`}>{b.title || 'Titre de la bannière'}</p>
        {b.highlight && <p className={`text-2xl font-extrabold mt-0.5 ${dark ? 'text-white' : 'text-[#FF5000]'}`}>{b.highlight}</p>}
        {b.subtitle && <p className={`text-sm mt-1 ${dark ? 'text-white/80' : 'text-[#64748B]'}`}>{b.subtitle}</p>}
        {b.promo_code && <p className={`text-xs mt-1 ${dark ? 'text-white/80' : 'text-[#64748B]'}`}>Code : {b.promo_code}</p>}
        {b.cta_label && (
          <span className={`mt-2 self-start px-4 py-1.5 text-xs font-semibold rounded-lg ${dark ? 'bg-white text-[#0B1426]' : 'bg-[#0B1426] text-white'}`}>{b.cta_label}</span>
        )}
      </div>
    </div>
  );
}

export default function AdminPromoBanners() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showPreview, setShowPreview] = useState(false);
  const [previewZone, setPreviewZone] = useState({ country: '', state: '', city: '' });
  const [previewItems, setPreviewItems] = useState(null);
  const [billing, setBilling] = useState(null);
  const [showBilling, setShowBilling] = useState(false);

  const toggleBilling = async () => {
    const next = !showBilling;
    setShowBilling(next);
    if (next) {
      try { const r = await promoBannersAPI.billing(); setBilling(r.data); }
      catch { setBilling({ advertisers: [], totals: {} }); }
    }
  };

  const loadPreview = async (zone) => {
    setPreviewZone(zone);
    try {
      const r = await promoBannersAPI.preview(zone);
      setPreviewItems(r.data.items || []);
    } catch { setPreviewItems([]); }
  };
  const togglePreview = () => {
    const next = !showPreview;
    setShowPreview(next);
    if (next && previewItems === null) loadPreview(previewZone);
  };

  const load = useCallback(async () => {
    try {
      const r = await promoBannersAPI.adminList();
      setItems(r.data.items || []);
    } catch (e) { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    promoBannersAPI.adminList()
      .then((r) => { if (active) setItems(r.data.items || []); })
      .catch(() => toast.error('Erreur chargement'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (it) => {
    setEditing(it);
    setForm({
      title: it.title || '', subtitle: it.subtitle || '', highlight: it.highlight || '',
      promo_code: it.promo_code || '', cta_label: it.cta_label || '',
      target_route: it.target_route || '/', image_url: it.image_url || null,
      theme: it.theme || 'light', bg_color: it.bg_color || '#FFFFFF', status: it.status || 'active',
      surfaces: it.surfaces && it.surfaces.length ? it.surfaces : ['home'],
      advertiser: it.advertiser || '', advertiser_contact: it.advertiser_contact || '',
      pricing_model: it.pricing_model || 'free',
      price_per_day: it.price_per_day || '', cpm: it.cpm || '',
      starts_at: it.starts_at || '', ends_at: it.ends_at || '',
      scope: it.scope || { country: '', state: '', city: '' },
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.title) { toast.error('Titre requis'); return; }
    try {
      if (editing) { await promoBannersAPI.update(editing.id, form); toast.success('Bannière mise à jour'); }
      else { await promoBannersAPI.create(form); toast.success('Bannière créée'); }
      setShowForm(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const remove = async (it) => {
    if (!window.confirm(`Supprimer "${it.title}" ?`)) return;
    try { await promoBannersAPI.remove(it.id); toast.success('Supprimé'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const toggleActive = async (it) => {
    try { await promoBannersAPI.update(it.id, { status: it.status === 'active' ? 'inactive' : 'active' }); load(); }
    catch (e) { toast.error('Erreur'); }
  };

  const move = async (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const reordered = [...items];
    const [m] = reordered.splice(idx, 1);
    reordered.splice(j, 0, m);
    setItems(reordered);
    try { await promoBannersAPI.reorder(reordered.map((x) => x.id)); }
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

  return (
    <div className="p-6" data-testid="admin-promo-banners-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Bannières promo</h1>
          <p className="text-sm text-gray-500 mt-1">Gérez le carrousel promo de l&apos;accueil : campagnes saisonnières, codes promo et CTA — sans redéploiement.</p>
        </div>
        <button onClick={openCreate} className="bg-[#0B1426] text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-2" data-testid="add-banner-btn">
          <Plus size={18} weight="bold" /> Nouvelle bannière
        </button>
      </div>

      {/* Zone preview — see exactly what a client in a given zone sees */}
      <div className="bg-white rounded-xl border border-slate-200 mb-6" data-testid="zone-preview-card">
        <button onClick={togglePreview} className="w-full flex items-center justify-between px-4 py-3" data-testid="preview-toggle-btn">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Globe size={18} weight="duotone" className="text-emerald-600" /> Aperçu par zone
            <span className="text-xs font-normal text-slate-400">— ce que voit un client de cette zone</span>
          </span>
          {showPreview ? <EyeSlash size={16} className="text-slate-400" /> : <Eye size={16} className="text-slate-400" />}
        </button>
        {showPreview && (
          <div className="px-4 pb-4 border-t border-slate-100 pt-4">
            <ZoneScopePicker value={previewZone} onChange={loadPreview} />
            <p className="text-xs text-slate-400 mt-2">Astuce : choisissez le pays <b>et la région/ville</b> pour un aperçu précis (ex. Martinique → Martinique). Vide = aperçu global.</p>
            <p className="text-sm font-semibold text-slate-700 mt-4" data-testid="preview-result-count">
              {previewItems === null ? 'Chargement…' : `${previewItems.length} bannière${previewItems.length > 1 ? 's' : ''} visible${previewItems.length > 1 ? 's' : ''} pour cette zone`}
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
              {(previewItems || []).map((b) => (
                <div key={b.id} data-testid={`preview-banner-${b.id}`}><BannerPreview b={b} /></div>
              ))}
              {previewItems !== null && previewItems.length === 0 && (
                <p className="text-sm text-slate-400">Aucune bannière visible dans cette zone.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Billing recap — per-advertiser impressions, clicks, CTR and estimated revenue */}
      <div className="bg-white rounded-xl border border-slate-200 mb-6" data-testid="billing-card">
        <button onClick={toggleBilling} className="w-full flex items-center justify-between px-4 py-3" data-testid="billing-toggle-btn">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            💶 Facturation publicitaire
            <span className="text-xs font-normal text-slate-400">— récap par commerçant (tarif/jour ou CPM)</span>
          </span>
          {showBilling ? <EyeSlash size={16} className="text-slate-400" /> : <Eye size={16} className="text-slate-400" />}
        </button>
        {showBilling && (
          <div className="px-4 pb-4 border-t border-slate-100 pt-4 overflow-x-auto">
            {!billing ? <p className="text-sm text-slate-400">Chargement…</p> : billing.advertisers.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune donnée. Renseignez un commerçant et un modèle de tarification sur vos bannières.</p>
            ) : (
              <table className="w-full text-sm" data-testid="billing-table">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="py-2 pr-3">Commerçant</th>
                    <th className="py-2 px-3">Bannières</th>
                    <th className="py-2 px-3">Impressions</th>
                    <th className="py-2 px-3">Clics</th>
                    <th className="py-2 px-3">CTR</th>
                    <th className="py-2 pl-3 text-right">Montant dû</th>
                  </tr>
                </thead>
                <tbody>
                  {billing.advertisers.map((a) => (
                    <tr key={a.advertiser} className="border-b border-slate-50" data-testid={`billing-row-${a.advertiser}`}>
                      <td className="py-2 pr-3 font-semibold text-slate-800">{a.advertiser}{a.contact ? <span className="block text-[11px] font-normal text-slate-400">{a.contact}</span> : null}</td>
                      <td className="py-2 px-3">{a.banners}</td>
                      <td className="py-2 px-3">{a.impressions}</td>
                      <td className="py-2 px-3">{a.clicks}</td>
                      <td className="py-2 px-3 font-semibold text-[#FF5000]">{a.ctr}%</td>
                      <td className="py-2 pl-3 text-right font-bold text-slate-900">{Number(a.cost).toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold text-slate-900">
                    <td className="py-2 pr-3">Total</td>
                    <td className="py-2 px-3">{billing.totals.banners}</td>
                    <td className="py-2 px-3">{billing.totals.impressions}</td>
                    <td className="py-2 px-3">{billing.totals.clicks}</td>
                    <td className="py-2 px-3" />
                    <td className="py-2 pl-3 text-right text-emerald-600" data-testid="billing-total">{Number(billing.totals.cost || 0).toFixed(2)} €</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
        <div className="space-y-4">
          {items.length === 0 && <p className="text-sm text-gray-400">Aucune bannière. Créez-en une pour l&apos;afficher sur l&apos;accueil.</p>}
          {items.map((it, idx) => (
            <div key={it.id} className={`bg-white rounded-xl shadow p-4 flex items-center gap-4 ${it.status !== 'active' ? 'opacity-50' : ''}`} data-testid={`banner-row-${it.id}`}>
              <div className="flex-1 min-w-0 max-w-md"><BannerPreview b={it} /></div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{it.title}</p>
                <p className="text-xs text-gray-400 truncate">{it.target_route}{it.promo_code ? ` · Code ${it.promo_code}` : ''}</p>
                {it.scope?.country && (
                  <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full" data-testid={`banner-zone-badge-${it.id}`}>
                    <MapPin size={10} weight="fill" /> {scopeLabel(it.scope)}
                  </span>
                )}
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500" data-testid={`banner-stats-${it.id}`}>
                  <span title="Impressions">👁 {it.impressions || 0}</span>
                  <span title="Clics">🖱 {it.clicks || 0}</span>
                  <span title="Taux de clic" className="font-semibold text-[#FF5000]">
                    CTR {it.impressions ? ((100 * (it.clicks || 0)) / it.impressions).toFixed(1) : '0.0'}%
                  </span>
                  {(it.surfaces || ['home']).map((s) => (
                    <span key={s} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px]">{s === 'home' ? 'Accueil' : s === 'food' ? 'Livraison' : 'Marketplace'}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => move(idx, -1)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Monter"><ArrowUp size={15} /></button>
                <button onClick={() => move(idx, 1)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Descendre"><ArrowDown size={15} /></button>
                <button onClick={() => toggleActive(it)} className={`p-1.5 rounded hover:bg-gray-100 ${it.status === 'active' ? 'text-emerald-600' : 'text-gray-400'}`} title="Actif" data-testid={`toggle-active-${it.id}`}>
                  {it.status === 'active' ? <Eye size={16} /> : <EyeSlash size={16} />}
                </button>
                <button onClick={() => openEdit(it)} className="p-1.5 rounded hover:bg-amber-50 text-amber-600"><Pencil size={15} /></button>
                <button onClick={() => remove(it)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[92vh] overflow-y-auto" data-testid="banner-form-modal">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{editing ? 'Modifier la bannière' : 'Nouvelle bannière'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded hover:bg-gray-100"><X size={20} /></button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium">Titre</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" data-testid="banner-title-input" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Sous-titre</label>
                <input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Mise en avant (ex: -50%)</label>
                <input value={form.highlight} onChange={(e) => setForm({ ...form, highlight: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Code promo</label>
                <input value={form.promo_code} onChange={(e) => setForm({ ...form, promo_code: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" placeholder="BIENVENUE" />
              </div>
              <div>
                <label className="text-sm font-medium">Libellé bouton (CTA)</label>
                <input value={form.cta_label} onChange={(e) => setForm({ ...form, cta_label: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" placeholder="Commander" />
              </div>
              <div>
                <label className="text-sm font-medium">Route cible</label>
                <input value={form.target_route} onChange={(e) => setForm({ ...form, target_route: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" placeholder="/food" data-testid="banner-route-input" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Emplacements d'affichage</label>
                <div className="flex flex-wrap gap-2 mt-1.5" data-testid="banner-surfaces">
                  {SURFACE_OPTIONS.map((s) => {
                    const checked = (form.surfaces || []).includes(s.key);
                    return (
                      <button
                        type="button"
                        key={s.key}
                        onClick={() => setForm((f) => {
                          const cur = new Set(f.surfaces || []);
                          if (cur.has(s.key)) cur.delete(s.key); else cur.add(s.key);
                          return { ...f, surfaces: Array.from(cur) };
                        })}
                        data-testid={`banner-surface-${s.key}`}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${checked ? 'bg-[#FF5000] text-white border-[#FF5000]' : 'bg-white text-gray-600 border-gray-300'}`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">« Livraison » et « Marketplace » affichent la bannière avec le label « Sponsorisé ».</p>
              </div>
              <div>
                <label className="text-sm font-medium">Thème</label>
                <select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" data-testid="banner-theme-select">
                  <option value="light">Clair (carte blanche)</option>
                  <option value="dark">Coloré (texte blanc)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Couleur de fond</label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={form.bg_color} onChange={(e) => setForm({ ...form, bg_color: e.target.value })} className="h-9 w-12 border rounded" />
                  <input value={form.bg_color} onChange={(e) => setForm({ ...form, bg_color: e.target.value })} className="flex-1 border rounded px-3 py-2" />
                </div>
              </div>
            </div>

            {/* Image upload */}
            <div className="mt-4 flex items-center gap-3">
              <label className="text-sm font-medium flex items-center gap-1"><ImageIcon size={16} /> Image (gauche)</label>
              <input type="file" accept="image/*" onChange={onImageUpload} className="text-xs" data-testid="banner-image-upload" />
              {form.image_url && (
                <div className="flex items-center gap-2">
                  <img src={form.image_url} alt="" className="w-12 h-9 object-cover rounded" />
                  <button onClick={() => setForm({ ...form, image_url: null })} className="text-xs text-red-600 underline">retirer</button>
                </div>
              )}
            </div>

            {/* Billing / advertiser (monetization) */}
            <div className="mt-4 border-t border-slate-100 pt-4" data-testid="banner-billing-fields">
              <p className="text-sm font-bold text-slate-700 mb-2">💶 Facturation publicitaire (optionnel)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Commerçant / Annonceur</label>
                  <input value={form.advertiser} onChange={(e) => setForm({ ...form, advertiser: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" placeholder="Ex. Boulangerie Martin" data-testid="banner-advertiser-input" />
                </div>
                <div>
                  <label className="text-sm font-medium">Contact (email/tél)</label>
                  <input value={form.advertiser_contact} onChange={(e) => setForm({ ...form, advertiser_contact: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" placeholder="contact@…" data-testid="banner-advertiser-contact" />
                </div>
                <div>
                  <label className="text-sm font-medium">Modèle de tarification</label>
                  <select value={form.pricing_model} onChange={(e) => setForm({ ...form, pricing_model: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" data-testid="banner-pricing-model">
                    <option value="free">Gratuit</option>
                    <option value="per_day">Par jour (€/jour)</option>
                    <option value="cpm">CPM (€ / 1000 impressions)</option>
                  </select>
                </div>
                {form.pricing_model === 'per_day' && (
                  <div>
                    <label className="text-sm font-medium">Tarif / jour (€)</label>
                    <input type="number" value={form.price_per_day} onChange={(e) => setForm({ ...form, price_per_day: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" placeholder="5" data-testid="banner-price-per-day" />
                  </div>
                )}
                {form.pricing_model === 'cpm' && (
                  <div>
                    <label className="text-sm font-medium">CPM (€ / 1000 vues)</label>
                    <input type="number" value={form.cpm} onChange={(e) => setForm({ ...form, cpm: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" placeholder="2" data-testid="banner-cpm" />
                  </div>
                )}
              </div>
              {form.pricing_model !== 'free' && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-sm font-medium">Début (optionnel)</label>
                    <input type="date" value={form.starts_at ? String(form.starts_at).slice(0, 10) : ''} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" data-testid="banner-starts-at" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Fin (optionnel)</label>
                    <input type="date" value={form.ends_at ? String(form.ends_at).slice(0, 10) : ''} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} className="w-full border rounded px-3 py-2 mt-1" data-testid="banner-ends-at" />
                  </div>
                </div>
              )}
            </div>

            {/* Geographic scope */}
            <div className="mt-4">
              <ZoneScopePicker value={form.scope} onChange={(scope) => setForm((f) => ({ ...f, scope }))} />
            </div>

            {/* Live preview */}
            <div className="mt-5">
              <label className="text-sm font-medium">Aperçu</label>
              <div className="mt-2 max-w-md"><BannerPreview b={form} /></div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-5 py-2 border rounded-lg">Annuler</button>
              <button onClick={save} className="px-5 py-2 bg-[#0B1426] text-white font-semibold rounded-lg" data-testid="banner-save-btn">{editing ? 'Mettre à jour' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
