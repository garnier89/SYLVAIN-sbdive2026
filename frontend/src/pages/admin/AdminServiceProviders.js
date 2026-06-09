import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Plus, PencilSimple, Trash, X, FloppyDisk, Wrench, Star } from '@phosphor-icons/react';
import { ImageUpload, GalleryUpload } from '../../components/ImageUpload';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
const EMPTY = { name: '', category_slug: '', rating: 5, reviews_count: 0, lat: 48.8566, lng: 2.3522, address: 'Paris, Île-de-France', phone: '', photo: '', bio: '', gallery: [], services: [], is_active: true };

const AdminServiceProviders = () => {
  const [tab, setTab] = useState('providers');
  const [providers, setProviders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null); // provider draft or null
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        fetch(`${API}/api/services/admin/providers`, { credentials: 'include' }),
        fetch(`${API}/api/services/admin/ondemand-categories`, { credentials: 'include' }),
      ]);
      if (pRes.ok) setProviders(await pRes.json());
      if (cRes.ok) setCategories(await cRes.json());
    } catch { toast.error('Erreur de chargement'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing.name || !editing.category_slug) { toast.error('Nom et catégorie requis'); return; }
    setSaving(true);
    try {
      const isNew = !editing.id;
      const res = await fetch(`${API}/api/services/admin/providers${isNew ? '' : '/' + editing.id}`, {
        method: isNew ? 'POST' : 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing),
      });
      if (res.ok) { toast.success(isNew ? 'Prestataire créé' : 'Prestataire mis à jour'); setEditing(null); load(); }
      else toast.error('Échec de l\'enregistrement');
    } catch { toast.error('Erreur réseau'); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Supprimer ce prestataire ?')) return;
    const res = await fetch(`${API}/api/services/admin/providers/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) { toast.success('Supprimé'); load(); }
  };

  const toggleCategory = async (slug, is_active) => {
    const res = await fetch(`${API}/api/services/admin/ondemand-categories/${slug}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active }),
    });
    if (res.ok) { setCategories((cs) => cs.map((c) => c.slug === slug ? { ...c, is_active } : c)); }
  };

  // service sub-editor helpers
  const addService = () => setEditing((e) => ({ ...e, services: [...e.services, { id: `s${Date.now()}`, name: '', price: 0, duration_min: 30 }] }));
  const updateService = (i, field, val) => setEditing((e) => ({ ...e, services: e.services.map((s, idx) => idx === i ? { ...s, [field]: field === 'price' || field === 'duration_min' ? parseFloat(val) || 0 : val } : s) }));
  const removeService = (i) => setEditing((e) => ({ ...e, services: e.services.filter((_, idx) => idx !== i) }));

  const catName = (slug) => categories.find((c) => c.slug === slug)?.name || slug;

  return (
    <div className="p-6 space-y-5" data-testid="admin-service-providers">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Wrench size={24} weight="fill" className="text-fuchsia-500" /> Services à la demande
        </h1>
        <p className="text-sm text-gray-500 mt-1">Gérez les prestataires, leurs prestations et les catégories.</p>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {[{ k: 'providers', l: 'Prestataires' }, { k: 'categories', l: 'Catégories' }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === t.k ? 'border-fuchsia-500 text-fuchsia-600' : 'border-transparent text-gray-500'}`}
            data-testid={`tab-${t.k}`}>{t.l}</button>
        ))}
      </div>

      {tab === 'providers' && (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setEditing({ ...EMPTY })} className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white" data-testid="add-provider-btn">
              <Plus size={16} weight="bold" className="mr-1" /> Nouveau prestataire
            </Button>
          </div>
          <Card>
            <CardContent className="p-0 divide-y divide-gray-100">
              {providers.length === 0 && <div className="p-6 text-sm text-gray-400">Aucun prestataire.</div>}
              {providers.map((p) => (
                <div key={p.id} className="p-4 flex items-center gap-3" data-testid={`provider-row-${p.id}`}>
                  <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                    {p.photo && <img src={p.photo} alt={p.name} className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{p.name}
                      {!p.is_active && <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Inactif</span>}
                    </p>
                    <p className="text-xs text-gray-500">{catName(p.category_slug)} · {(p.services || []).length} prestations · <Star size={10} weight="fill" className="inline text-amber-500" /> {(p.rating || 5).toFixed(1)}</p>
                  </div>
                  <button onClick={() => setEditing({ ...EMPTY, ...p })} className="p-2 text-gray-500 hover:text-fuchsia-600" data-testid={`edit-${p.id}`}><PencilSimple size={18} /></button>
                  <button onClick={() => remove(p.id)} className="p-2 text-gray-500 hover:text-red-600" data-testid={`delete-${p.id}`}><Trash size={18} /></button>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {tab === 'categories' && (
        <Card>
          <CardContent className="p-0 divide-y divide-gray-100">
            {categories.map((c) => (
              <div key={c.slug} className="p-4 flex items-center justify-between" data-testid={`category-row-${c.slug}`}>
                <div>
                  <p className="font-semibold text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.slug}</p>
                </div>
                <Switch checked={c.is_active} onCheckedChange={(v) => toggleCategory(c.slug, v)} className="data-[state=checked]:bg-fuchsia-500" data-testid={`toggle-cat-${c.slug}`} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Provider editor modal */}
      {editing && (
        <div className="fixed inset-0 z-[2800] bg-black/50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="provider-editor">
            <div className="sticky top-0 bg-white flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">{editing.id ? 'Modifier' : 'Nouveau'} prestataire</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400"><X size={22} /></button>
            </div>
            <div className="p-4 space-y-3">
              <Field label="Nom"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="field-name" /></Field>
              <Field label="Catégorie">
                <select value={editing.category_slug} onChange={(e) => setEditing({ ...editing, category_slug: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="field-category">
                  <option value="">— Choisir —</option>
                  {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Note"><Input type="number" step="0.1" value={editing.rating} onChange={(e) => setEditing({ ...editing, rating: parseFloat(e.target.value) || 0 })} /></Field>
                <Field label="Nb avis"><Input type="number" value={editing.reviews_count} onChange={(e) => setEditing({ ...editing, reviews_count: parseInt(e.target.value) || 0 })} /></Field>
              </div>
              <ImageUpload label="Photo du prestataire" value={editing.photo} onChange={(url) => setEditing({ ...editing, photo: url })} testId="provider-photo-upload" />
              <GalleryUpload label="Galerie" value={editing.gallery || []} onChange={(g) => setEditing({ ...editing, gallery: g })} testId="provider-gallery-upload" />
              <Field label="Photo (URL)"><Input value={editing.photo} onChange={(e) => setEditing({ ...editing, photo: e.target.value })} /></Field>
              <Field label="Téléphone"><Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
              <Field label="Bio"><Input value={editing.bio} onChange={(e) => setEditing({ ...editing, bio: e.target.value })} /></Field>

              <div className="flex items-center justify-between pt-2">
                <span className="text-sm font-semibold text-gray-700">Prestations</span>
                <button onClick={addService} className="text-xs font-semibold text-fuchsia-600 flex items-center gap-1" data-testid="add-service-btn"><Plus size={14} /> Ajouter</button>
              </div>
              {editing.services.map((s, i) => (
                <div key={s.id} className="flex gap-2 items-center" data-testid={`service-edit-${i}`}>
                  <Input placeholder="Nom" value={s.name} onChange={(e) => updateService(i, 'name', e.target.value)} className="flex-1" />
                  <Input placeholder="Prix" type="number" step="0.01" value={s.price} onChange={(e) => updateService(i, 'price', e.target.value)} className="w-24" />
                  <button onClick={() => removeService(i)} className="text-gray-400 hover:text-red-500"><Trash size={16} /></button>
                </div>
              ))}

              <div className="flex items-center gap-2 pt-2">
                <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} className="data-[state=checked]:bg-fuchsia-500" />
                <span className="text-sm text-gray-600">Actif</span>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white p-4 border-t border-gray-100">
              <Button onClick={save} disabled={saving} className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white" data-testid="save-provider-btn">
                <FloppyDisk size={16} weight="fill" className="mr-2" />{saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Field = ({ label, children }) => (
  <div>
    <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
    {children}
  </div>
);

export default AdminServiceProviders;
