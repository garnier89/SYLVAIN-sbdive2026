/**
 * AdminRideProfiles — V3Cube "Manage Ride Profiles".
 * Onglets : Ride Profile Type + Business Trip Reason.
 * Tables avec statut (toggle), édition et suppression.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { PencilSimple, Trash, Plus, X, Check } from '@phosphor-icons/react';
import { adminAPI } from '../../services/api';

const StatusPill = ({ active }) => (
  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
    {active ? 'Actif' : 'Inactif'}
  </span>
);

// Field definitions per resource
const RESOURCES = {
  profile: {
    title: 'Type de profil de course',
    cols: [
      { key: 'short_name', label: 'Nom court' },
      { key: 'org_type', label: 'Type d\'organisation' },
      { key: 'profile_title', label: 'Titre du profil' },
      { key: 'title_description', label: 'Description' },
    ],
    api: {
      list: () => adminAPI.getRideProfiles(),
      create: (d) => adminAPI.createRideProfile(d),
      update: (id, d) => adminAPI.updateRideProfile(id, d),
      del: (id) => adminAPI.deleteRideProfile(id),
      toggle: (id) => adminAPI.toggleRideProfile(id),
    },
    empty: { short_name: '', org_type: 'Business', profile_title: '', title_description: '' },
  },
  reason: {
    title: 'Motif de déplacement professionnel',
    cols: [
      { key: 'trip_reason', label: 'Motif' },
      { key: 'profile_short_name', label: 'Nom court' },
      { key: 'org_type', label: 'Type d\'organisation' },
      { key: 'profile_title', label: 'Titre du profil' },
      { key: 'title_description', label: 'Description' },
    ],
    api: {
      list: () => adminAPI.getTripReasons(),
      create: (d) => adminAPI.createTripReason(d),
      update: (id, d) => adminAPI.updateTripReason(id, d),
      del: (id) => adminAPI.deleteTripReason(id),
      toggle: (id) => adminAPI.toggleTripReason(id),
    },
    empty: { trip_reason: '', profile_short_name: 'Business', org_type: 'Business', profile_title: '', title_description: '' },
  },
};

const AdminRideProfiles = () => {
  const [tab, setTab] = useState('profile');
  return (
    <div className="p-6 max-w-5xl" data-testid="admin-ride-profiles-page">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Profils de course</h1>
      <p className="text-sm text-slate-500 mb-5">Gérez les types de profils et les motifs de déplacement professionnel.</p>
      <div className="flex gap-2 mb-5">
        <button onClick={() => setTab('profile')} data-testid="profiles-tab-type"
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'profile' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>Type de profil</button>
        <button onClick={() => setTab('reason')} data-testid="profiles-tab-reason"
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'reason' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>Motif pro</button>
      </div>
      <ResourceTable key={tab} resource={RESOURCES[tab]} resourceKey={tab} />
    </div>
  );
};

const ResourceTable = ({ resource, resourceKey }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    resource.api.list().then((r) => setItems(r.data || [])).catch(() => toast.error('Erreur')).finally(() => setLoading(false));
  }, [resource]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (id) => { try { await resource.api.toggle(id); load(); } catch { toast.error('Échec'); } };
  const remove = async (id) => { try { await resource.api.del(id); toast.success('Supprimé'); load(); } catch { toast.error('Échec'); } };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="font-bold text-slate-900">{resource.title}</p>
        <button onClick={() => setEditing(resource.empty)} data-testid={`${resourceKey}-add-btn`}
          className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold flex items-center gap-1"><Plus size={16} /> Ajouter</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b">
              {resource.cols.map((c) => <th key={c.key} className="py-2 pr-3">{c.label}</th>)}
              <th className="pr-3">Statut</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={resource.cols.length + 2} className="text-center text-slate-400 py-6">Chargement…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={resource.cols.length + 2} className="text-center text-slate-400 py-6">Aucun élément</td></tr>
            ) : items.map((it) => (
              <tr key={it.id} className="border-b last:border-0" data-testid={`${resourceKey}-row-${it.id}`}>
                {resource.cols.map((c) => <td key={c.key} className="py-2.5 pr-3 text-slate-700">{it[c.key]}</td>)}
                <td className="pr-3"><button onClick={() => toggle(it.id)} data-testid={`${resourceKey}-toggle-${it.id}`}><StatusPill active={it.status === 'active'} /></button></td>
                <td>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditing(it)} data-testid={`${resourceKey}-edit-${it.id}`} className="text-slate-400 hover:text-slate-700"><PencilSimple size={16} /></button>
                    <button onClick={() => remove(it.id)} data-testid={`${resourceKey}-del-${it.id}`} className="text-slate-400 hover:text-rose-500"><Trash size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditModal resource={resource} resourceKey={resourceKey} item={editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
};

const EditModal = ({ resource, resourceKey, item, onClose, onSaved }) => {
  const [form, setForm] = useState({ ...resource.empty, ...item });
  const [saving, setSaving] = useState(false);
  const isNew = !item.id;

  const save = async () => {
    const payload = {};
    resource.cols.forEach((c) => { payload[c.key] = form[c.key] || ''; });
    payload.status = form.status || 'active';
    setSaving(true);
    try {
      if (isNew) await resource.api.create(payload);
      else await resource.api.update(item.id, payload);
      toast.success('Enregistré'); onSaved();
    } catch { toast.error('Échec'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose} data-testid={`${resourceKey}-edit-modal`}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">{isNew ? 'Ajouter' : 'Modifier'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={20} /></button>
        </div>
        {resource.cols.map((c) => (
          <div key={c.key} className="mb-3">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">{c.label}</label>
            <input value={form[c.key] || ''} onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
              data-testid={`${resourceKey}-field-${c.key}`} className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm" />
          </div>
        ))}
        <button onClick={save} disabled={saving} data-testid={`${resourceKey}-save`}
          className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 mt-2">
          <Check size={18} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
};

export default AdminRideProfiles;
