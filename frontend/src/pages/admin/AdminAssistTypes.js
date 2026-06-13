import React, { useState, useEffect, useCallback } from 'react';
import { Plus, PencilSimple, Trash, Eye, EyeSlash, Wheelchair, CircleNotch, X } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { assistTypesAdminAPI } from '../../services/api';

const EMPTY = { label: '', key: '', active: true, display_order: '' };

const Field = ({ label, ...props }) => (
  <label className="block">
    <span className="text-xs font-semibold text-gray-600">{label}</span>
    <input {...props} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none" />
  </label>
);

const AssistModal = ({ open, initial, onClose, onSaved }) => {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm(initial ? { ...EMPTY, ...initial } : EMPTY); }, [open, initial]);
  if (!open) return null;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    if (!form.label.trim()) { toast.error('Le libellé est requis'); return; }
    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        active: !!form.active,
        ...(form.key ? { key: form.key.trim() } : {}),
        ...(form.display_order !== '' ? { display_order: Number(form.display_order) } : {}),
      };
      if (initial?.id) await assistTypesAdminAPI.update(initial.id, payload);
      else await assistTypesAdminAPI.create(payload);
      toast.success(initial?.id ? 'Type mis à jour' : 'Type ajouté');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de l’enregistrement');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4" data-testid="assist-modal">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400" data-testid="assist-modal-close"><X size={20} /></button>
        <h3 className="text-lg font-extrabold text-gray-900 mb-4">{initial?.id ? 'Modifier le type' : 'Nouveau type d’assistance'}</h3>
        <div className="space-y-3">
          <Field label="Libellé" value={form.label} onChange={set('label')} data-testid="assist-label" placeholder="Ex: Fauteuil roulant" />
          <Field label="Clé technique (optionnel — auto si vide)" value={form.key} onChange={set('key')} data-testid="assist-key" placeholder="wheelchair" />
          <Field label="Ordre d’affichage (optionnel)" type="number" value={form.display_order} onChange={set('display_order')} data-testid="assist-order" placeholder="0" />
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} data-testid="assist-active" /> Visible dans l’app client
          </label>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 font-semibold text-sm" data-testid="assist-cancel">Annuler</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60" data-testid="assist-save">
            {saving ? <CircleNotch size={16} className="animate-spin" /> : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminAssistTypes = () => {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, initial: null });

  const load = useCallback(() => {
    setLoading(true);
    assistTypesAdminAPI.list()
      .then((r) => setTypes(r.data.types || []))
      .catch(() => toast.error('Échec du chargement'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (id) => {
    try { await assistTypesAdminAPI.toggle(id); load(); } catch { toast.error('Échec'); }
  };
  const remove = async (t) => {
    if (!window.confirm(`Supprimer « ${t.label} » ?`)) return;
    try { await assistTypesAdminAPI.remove(t.id); toast.success('Supprimé'); load(); } catch { toast.error('Échec'); }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto" data-testid="admin-assist-types-page">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2"><Wheelchair size={26} weight="fill" className="text-indigo-600" /> Types d’assistance (SB Access)</h1>
        <button onClick={() => setModal({ open: true, initial: null })} className="flex items-center gap-1.5 bg-indigo-600 text-white font-bold text-sm px-4 py-2 rounded-lg" data-testid="assist-add-btn">
          <Plus size={16} weight="bold" /> Ajouter
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">Gérez les options « Type d’assistance » proposées au client (PMR, Accès, Fauteuil roulant…) sans toucher au code.</p>

      {loading ? (
        <div className="flex justify-center py-16"><CircleNotch size={28} className="animate-spin text-indigo-500" /></div>
      ) : types.length === 0 ? (
        <div className="text-center py-16 text-gray-400" data-testid="assist-empty">Aucun type. Cliquez sur « Ajouter ».</div>
      ) : (
        <div className="space-y-2" data-testid="assist-list">
          {types.map((t) => (
            <div key={t.id} className={`bg-white rounded-xl shadow-sm border p-3 flex items-center gap-3 ${t.active === false ? 'opacity-60' : ''}`} data-testid={`assist-card-${t.id}`}>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{t.label}</p>
                <p className="text-xs text-gray-400 truncate">clé: {t.key} · ordre: {t.display_order ?? 0}</p>
              </div>
              <button onClick={() => toggle(t.id)} className={`p-2 rounded-lg ${t.active !== false ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 bg-gray-100'}`} title="Afficher/Masquer" data-testid={`assist-toggle-${t.id}`}>
                {t.active !== false ? <Eye size={16} /> : <EyeSlash size={16} />}
              </button>
              <button onClick={() => setModal({ open: true, initial: t })} className="p-2 rounded-lg text-indigo-600 bg-indigo-50" title="Modifier" data-testid={`assist-edit-${t.id}`}><PencilSimple size={16} /></button>
              <button onClick={() => remove(t)} className="p-2 rounded-lg text-red-600 bg-red-50" title="Supprimer" data-testid={`assist-delete-${t.id}`}><Trash size={16} /></button>
            </div>
          ))}
        </div>
      )}

      <AssistModal open={modal.open} initial={modal.initial} onClose={() => setModal({ open: false, initial: null })} onSaved={load} />
    </div>
  );
};

export default AdminAssistTypes;
