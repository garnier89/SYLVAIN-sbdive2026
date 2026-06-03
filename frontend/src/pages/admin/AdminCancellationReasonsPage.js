/**
 * AdminCancellationReasonsPage — V3Cube Pack B
 * Admin CRUD for cancellation reasons (separate User/Driver lists).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Trash, PencilSimple, X, Check } from '@phosphor-icons/react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminCancellationReasonsPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState('Driver');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ reason_fr: '', reason_en: '', user_type: 'Driver', active: true, display_order: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/driver-pro/admin/cancellation-reasons`, { credentials: 'include' });
      if (r.ok) setItems(await r.json());
    } catch (e) { console.warn(e?.message || e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.reason_fr) return toast.error('Texte en français requis');
    try {
      const url = editing
        ? `${API}/api/driver-pro/admin/cancellation-reasons/${editing}`
        : `${API}/api/driver-pro/admin/cancellation-reasons`;
      const r = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (r.ok) {
        toast.success(editing ? 'Modifié' : 'Ajouté');
        setEditing(null);
        setForm({ reason_fr: '', reason_en: '', user_type: tab, active: true, display_order: 0 });
        load();
      } else {
        const e = await r.json();
        toast.error(e.detail || 'Erreur');
      }
    } catch (e) { toast.error('Erreur réseau'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Supprimer ce motif ?')) return;
    try {
      const r = await fetch(`${API}/api/driver-pro/admin/cancellation-reasons/${id}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (r.ok) { toast.success('Supprimé'); load(); }
    } catch (e) { toast.error('Erreur'); }
  };

  const toggleActive = async (it) => {
    try {
      await fetch(`${API}/api/driver-pro/admin/cancellation-reasons/${it.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !it.active }),
      });
      load();
    } catch (e) { toast.error('Erreur'); }
  };

  const filtered = items.filter((i) => i.user_type === tab);

  return (
    <div className="p-6" data-testid="admin-cancellation-reasons-page">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-light text-gray-800" style={{ fontFamily: 'Georgia, Times, serif' }}>
            Motifs d&apos;annulation
          </h1>
          <p className="text-sm text-gray-500 mt-1">Gérez les motifs proposés aux utilisateurs et chauffeurs</p>
        </div>
      </div>
      <hr className="border-gray-200 mb-5" />

      <div className="flex gap-2 mb-4">
        {['Driver', 'User'].map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setForm((f) => ({ ...f, user_type: t })); }}
            data-testid={`tab-${t}`}
            className={`px-4 py-2 rounded-lg text-sm font-bold ${tab === t ? 'bg-[#0B1426] text-white' : 'bg-white border border-gray-300 text-gray-600'}`}
          >
            {t === 'Driver' ? 'Chauffeurs' : 'Clients'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-3">Texte (FR)</th>
              <th className="text-left p-3">Texte (EN)</th>
              <th className="text-left p-3 w-24">Ordre</th>
              <th className="text-center p-3 w-24">Actif</th>
              <th className="text-right p-3 w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="5" className="p-6 text-center text-gray-400">Chargement...</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan="5" className="p-6 text-center text-gray-400">Aucun motif</td></tr>
            )}
            {filtered.map((it) => (
              <tr key={it.id} className="border-b hover:bg-gray-50" data-testid={`reason-row-${it.id}`}>
                <td className="p-3">{it.reason_fr}</td>
                <td className="p-3 text-gray-500">{it.reason_en}</td>
                <td className="p-3">{it.display_order}</td>
                <td className="p-3 text-center">
                  <button onClick={() => toggleActive(it)} data-testid={`toggle-${it.id}`}>
                    {it.active ? (
                      <Check size={18} weight="bold" className="text-emerald-600 inline" />
                    ) : (
                      <X size={18} className="text-gray-400 inline" />
                    )}
                  </button>
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => { setEditing(it.id); setForm({ ...it }); }} className="text-blue-600 mr-2" data-testid={`edit-${it.id}`}>
                    <PencilSimple size={16} />
                  </button>
                  <button onClick={() => remove(it.id)} className="text-red-500" data-testid={`remove-${it.id}`}>
                    <Trash size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg p-4 border-2 border-dashed border-amber-200" data-testid="reason-form">
        <h3 className="font-bold mb-3">{editing ? 'Modifier' : 'Ajouter'} un motif</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Texte FR</label>
            <Input value={form.reason_fr} onChange={(e) => setForm({ ...form, reason_fr: e.target.value })} data-testid="form-reason-fr" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Texte EN</label>
            <Input value={form.reason_en} onChange={(e) => setForm({ ...form, reason_en: e.target.value })} data-testid="form-reason-en" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Cible</label>
            <select value={form.user_type} onChange={(e) => setForm({ ...form, user_type: e.target.value })} className="border rounded-lg px-2 py-2 text-sm w-full" data-testid="form-user-type">
              <option value="Driver">Chauffeur</option>
              <option value="User">Client</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Ordre d&apos;affichage</label>
            <Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })} data-testid="form-order" />
          </div>
        </div>
        <Button onClick={submit} className="mt-3" data-testid="submit-reason">
          <Plus size={16} className="mr-1" /> {editing ? 'Mettre à jour' : 'Ajouter'}
        </Button>
        {editing && (
          <Button variant="ghost" onClick={() => { setEditing(null); setForm({ reason_fr: '', reason_en: '', user_type: tab, active: true, display_order: 0 }); }} className="mt-3 ml-2">
            Annuler
          </Button>
        )}
      </div>
    </div>
  );
};

export default AdminCancellationReasonsPage;
