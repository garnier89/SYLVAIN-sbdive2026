import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Car, Motorcycle, Bicycle, Taxi, Package, PersonSimpleRun,
  Plus, PencilSimple, Trash, FileText, ArrowLeft, Eye, EyeSlash,
  Copy, ArrowUp, ArrowDown, DotsSixVertical,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { adminAPI } from '../../services/api';

const SERVICE_META = {
  taxi: { label: 'Taxi / Transport', icon: Taxi, color: 'text-[#FF5000]', bg: 'bg-orange-50' },
  courier: { label: 'Coursier', icon: PersonSimpleRun, color: 'text-teal-600', bg: 'bg-teal-50' },
  delivery: { label: 'Livreur', icon: Package, color: 'text-indigo-600', bg: 'bg-indigo-50' },
};
const VEHICLE_META = {
  car: { label: 'Voiture', icon: Car },
  moto: { label: 'Moto', icon: Motorcycle },
  velo: { label: 'Vélo', icon: Bicycle },
};
const SUB_LABELS = { particulier: 'Particulier', vtc: 'VTC', taxi: 'Taxi (licence)' };
const EMPTY_CAT = {
  id: '', label: '', service: 'taxi', vehicle_class: 'car', taxi_sub: 'particulier',
  order: 99, active: true, documents: [{ key: '', label: '' }],
};

// ── Inline editor ──────────────────────────────────────────────────────────
const CategoryEditor = ({ item, onSaved, onCancel }) => {
  const isNew = !item._isExisting;
  const [form, setForm] = useState(() => ({
    ...EMPTY_CAT, ...item,
    documents: (item.documents && item.documents.length ? item.documents : [{ key: '', label: '' }]).map((d) => ({ ...d })),
    taxi_sub: item.taxi_sub || (item.service === 'taxi' && item.vehicle_class === 'car' ? 'particulier' : null),
  }));
  const [saving, setSaving] = useState(false);
  const showSub = form.service === 'taxi' && form.vehicle_class === 'car';

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setDoc = (i, k, v) => setForm((f) => ({ ...f, documents: f.documents.map((d, idx) => (idx === i ? { ...d, [k]: v } : d)) }));
  const addDoc = () => setForm((f) => ({ ...f, documents: [...f.documents, { key: '', label: '' }] }));
  const removeDoc = (i) => setForm((f) => ({ ...f, documents: f.documents.filter((_, idx) => idx !== i) }));

  const save = async () => {
    const docs = form.documents.filter((d) => d.key.trim() && d.label.trim());
    if (!form.label.trim()) return toast.error('Le libellé est requis');
    if (!docs.length) return toast.error('Ajoutez au moins un document requis');
    const payload = {
      label: form.label.trim(), service: form.service, vehicle_class: form.vehicle_class,
      taxi_sub: showSub ? form.taxi_sub : null, order: Number(form.order) || 99,
      active: form.active, documents: docs,
    };
    setSaving(true);
    try {
      if (isNew) {
        if (form.id.trim()) payload.id = form.id.trim();
        await adminAPI.createDriverCategory(payload);
        toast.success('Catégorie créée');
      } else {
        await adminAPI.updateDriverCategory(item.id, payload);
        toast.success('Catégorie mise à jour');
      }
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl" data-testid="driver-category-editor">
      <button onClick={onCancel} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4" data-testid="dc-editor-back">
        <ArrowLeft size={16} /> Retour à la liste
      </button>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">{isNew ? 'Nouvelle catégorie de chauffeur' : 'Modifier la catégorie'}</h1>
      <p className="text-sm text-gray-500 mb-6">Définissez le service, le véhicule et les documents requis à l&apos;inscription.</p>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Libellé affiché</label>
          <Input value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="Ex. Taxi · VTC" data-testid="dc-label" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Service</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(SERVICE_META).map(([k, m]) => {
                const I = m.icon; const on = form.service === k;
                return (
                  <button key={k} onClick={() => set('service', k)} data-testid={`dc-service-${k}`}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${on ? 'border-[#FF5000] bg-orange-50 text-[#FF5000]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <I size={16} weight={on ? 'fill' : 'regular'} />{m.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Type de véhicule</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(VEHICLE_META).map(([k, m]) => {
                const I = m.icon; const on = form.vehicle_class === k;
                return (
                  <button key={k} onClick={() => set('vehicle_class', k)} data-testid={`dc-vehicle-${k}`}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${on ? 'border-[#FF5000] bg-orange-50 text-[#FF5000]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <I size={16} weight={on ? 'fill' : 'regular'} />{m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {showSub && (
          <div data-testid="dc-sub-row">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Sous-catégorie Taxi</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(SUB_LABELS).map(([k, l]) => {
                const on = form.taxi_sub === k;
                return (
                  <button key={k} onClick={() => set('taxi_sub', k)} data-testid={`dc-sub-${k}`}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${on ? 'border-[#FF5000] bg-orange-50 text-[#FF5000]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {l}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Ordre d&apos;affichage</label>
            <Input type="number" value={form.order} onChange={(e) => set('order', e.target.value)} data-testid="dc-order" />
          </div>
          {isNew && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Identifiant (optionnel)</label>
              <Input value={form.id} onChange={(e) => set('id', e.target.value)} placeholder="auto" data-testid="dc-id" />
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><FileText size={16} /> Documents requis</label>
            <Button size="sm" variant="outline" onClick={addDoc} data-testid="dc-add-doc"><Plus size={14} className="mr-1" />Ajouter</Button>
          </div>
          <div className="space-y-2">
            {form.documents.map((d, i) => (
              <div key={i} className="flex items-center gap-2" data-testid={`dc-doc-row-${i}`}>
                <Input value={d.key} onChange={(e) => setDoc(i, 'key', e.target.value)} placeholder="clé (ex. permis_b)" className="flex-1 font-mono text-xs" data-testid={`dc-doc-key-${i}`} />
                <Input value={d.label} onChange={(e) => setDoc(i, 'label', e.target.value)} placeholder="Libellé (ex. Permis B)" className="flex-1" data-testid={`dc-doc-label-${i}`} />
                <button onClick={() => removeDoc(i)} className="text-red-500 hover:bg-red-50 rounded p-2" data-testid={`dc-doc-remove-${i}`}><Trash size={16} /></button>
              </div>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} data-testid="dc-active" className="w-4 h-4 accent-[#FF5000]" />
          <span className="text-sm font-medium text-gray-700">Catégorie active (visible à l&apos;inscription)</span>
        </label>

        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <Button onClick={save} disabled={saving} className="bg-[#FF5000] text-white" data-testid="dc-save"> {saving ? 'Enregistrement…' : 'Enregistrer'} </Button>
          <Button variant="outline" onClick={onCancel} data-testid="dc-cancel">Annuler</Button>
        </div>
      </div>
    </div>
  );
};

// ── List ─────────────────────────────────────────────────────────────────────
const AdminDriverCategories = () => {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = () => {
    adminAPI.listDriverCategories()
      .then((res) => setCats(res.data))
      .catch(() => toast.error('Erreur de chargement'))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    let active = true;
    adminAPI.listDriverCategories()
      .then((res) => { if (active) setCats(res.data); })
      .catch(() => { if (active) toast.error('Erreur de chargement'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const handleDelete = async (cat) => {
    if (!window.confirm(`Supprimer la catégorie « ${cat.label} » ?`)) return;
    try {
      await adminAPI.deleteDriverCategory(cat.id);
      toast.success('Catégorie supprimée'); load();
    } catch { toast.error('Échec de la suppression'); }
  };

  const toggleActive = async (cat) => {
    try {
      await adminAPI.updateDriverCategory(cat.id, { ...cat, active: !cat.active });
      toast.success(cat.active ? 'Catégorie désactivée' : 'Catégorie activée'); load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
  };

  const [dragId, setDragId] = useState(null);

  // Duplicate a category in one click → opens the editor pre-filled (new id auto-assigned on save).
  const duplicate = (cat) => setEditing({
    ...cat, id: '', label: `${cat.label} (copie)`,
    documents: (cat.documents || []).map((d) => ({ ...d })),
    _isExisting: false,
  });

  // Persist a new global order from the reordered items of one service group.
  const persistOrder = async (service, newItems) => {
    const orderedIds = ['taxi', 'courier', 'delivery'].flatMap((s) =>
      (s === service ? newItems : cats.filter((c) => c.service === s)).map((c) => c.id),
    );
    setCats((prev) => orderedIds.map((id, i) => ({ ...prev.find((c) => c.id === id), order: i + 1 })));
    try {
      await adminAPI.reorderDriverCategories(orderedIds);
    } catch { toast.error('Échec du classement'); load(); }
  };

  // Arrow ↑/↓ reorder within a service group.
  const move = (service, idx, dir) => {
    const items = cats.filter((c) => c.service === service);
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    persistOrder(service, next);
  };

  // Drag & drop reorder within a service group (cross-group drops are ignored).
  const onDrop = (service, targetId) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const items = cats.filter((c) => c.service === service);
    const from = items.findIndex((c) => c.id === dragId);
    const to = items.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) { setDragId(null); return; }
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragId(null);
    persistOrder(service, next);
  };

  if (editing) {
    return <CategoryEditor item={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />;
  }

  const grouped = ['taxi', 'courier', 'delivery'].map((s) => ({ service: s, items: cats.filter((c) => c.service === s) }));

  return (
    <div className="p-6" data-testid="admin-driver-categories">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Car size={26} weight="duotone" /> Catégories de chauffeurs</h1>
          <p className="text-sm text-gray-500 mt-1">{cats.length} catégorie(s) · gérez les documents requis et le type de véhicule par activité (repris à l&apos;inscription chauffeur).</p>
        </div>
        <Button onClick={() => setEditing({ ...EMPTY_CAT, _isExisting: false })} className="bg-[#FF5000] text-white" data-testid="dc-add-new"><Plus size={16} className="mr-1.5" />Nouvelle catégorie</Button>
      </div>

      {loading && <p className="text-center text-gray-400 py-10">Chargement...</p>}
      {!loading && cats.length === 0 && <p className="text-center text-gray-400 py-10">Aucune catégorie. Créez-en une.</p>}

      {!loading && grouped.map(({ service, items }) => {
        if (!items.length) return null;
        const m = SERVICE_META[service];
        const SI = m.icon;
        return (
          <div key={service} className="mb-8" data-testid={`dc-group-${service}`}>
            <h2 className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wide mb-3 ${m.color}`}>
              <SI size={18} weight="fill" />{m.label} <span className="text-gray-400 font-normal normal-case">· {items.length}</span>
              {items.length > 1 && <span className="text-gray-300 font-normal normal-case text-[11px] flex items-center gap-1"><DotsSixVertical size={13} /> glissez pour réordonner</span>}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {items.map((cat, idx) => {
                const vm = VEHICLE_META[cat.vehicle_class] || {};
                const VI = vm.icon || Car;
                return (
                  <div key={cat.id}
                    draggable
                    onDragStart={() => setDragId(cat.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(service, cat.id)}
                    onDragEnd={() => setDragId(null)}
                    style={{ opacity: dragId === cat.id ? 0.4 : undefined }}
                    className={`bg-white border rounded-xl p-4 hover:shadow-md transition-shadow cursor-move ${dragId === cat.id ? 'ring-2 ring-[#FF5000]' : ''} ${cat.active ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-70'}`}
                    data-testid={`dc-card-${cat.id}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-11 h-11 rounded-xl ${m.bg} flex items-center justify-center shrink-0`}>
                        <VI size={22} weight="duotone" className={m.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-800 truncate">{cat.label}</h3>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          <Badge variant="outline" className="text-[10px]">{vm.label || cat.vehicle_class}</Badge>
                          {cat.taxi_sub && <Badge variant="outline" className="text-[10px] text-[#FF5000] border-orange-300">{SUB_LABELS[cat.taxi_sub] || cat.taxi_sub}</Badge>}
                          {!cat.active && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Inactif</Badge>}
                        </div>
                        <Badge variant="outline" className="font-mono text-[10px] mt-1.5">{cat.id}</Badge>
                      </div>
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <button onClick={() => move(service, idx, -1)} disabled={idx === 0} title="Monter" data-testid={`dc-up-${cat.id}`}
                          className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center disabled:opacity-30"><ArrowUp size={12} weight="bold" /></button>
                        <span className="text-[10px] font-bold text-gray-400">{idx + 1}</span>
                        <button onClick={() => move(service, idx, 1)} disabled={idx === items.length - 1} title="Descendre" data-testid={`dc-down-${cat.id}`}
                          className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center disabled:opacity-30"><ArrowDown size={12} weight="bold" /></button>
                      </div>
                    </div>

                    <div className="mt-3 bg-gray-50 rounded-lg p-2.5">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1 flex items-center gap-1"><FileText size={12} /> {cat.documents?.length || 0} document(s)</p>
                      <div className="flex flex-wrap gap-1">
                        {(cat.documents || []).map((d) => (
                          <span key={d.key} className="text-[11px] bg-white border border-gray-200 text-gray-600 px-1.5 py-0.5 rounded">{d.label}</span>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-1 mt-3 pt-3 border-t border-gray-100">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing({ ...cat, _isExisting: true })} data-testid={`dc-edit-${cat.id}`}><PencilSimple size={14} className="mr-1" />Modifier</Button>
                      <Button size="sm" variant="ghost" onClick={() => duplicate(cat)} title="Dupliquer" data-testid={`dc-dup-${cat.id}`}><Copy size={15} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(cat)} title={cat.active ? 'Désactiver' : 'Activer'} data-testid={`dc-toggle-${cat.id}`}>{cat.active ? <Eye size={16} /> : <EyeSlash size={16} className="text-amber-500" />}</Button>
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDelete(cat)} data-testid={`dc-delete-${cat.id}`}><Trash size={15} /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AdminDriverCategories;
