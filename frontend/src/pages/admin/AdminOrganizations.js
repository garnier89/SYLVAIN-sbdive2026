/**
 * Admin Organizations page — multi-tenant (V3Cube company/organization).
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Buildings, Plus, Pencil, Trash, Link as LinkIcon } from '@phosphor-icons/react';
import api from '../../services/api';

const initForm = { name: '', type: 'company', contact_email: '', contact_phone: '', address: '', commission_pct: 15.0, parent_org_id: '', is_active: true, notes: '' };

export default function AdminOrganizations() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initForm);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get('/organizations/admin'); setItems(r.data.items || []); }
    catch (e) { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(initForm); setShowForm(true); };
  const openEdit = (o) => { setEditing(o); setForm({ ...initForm, ...o }); setShowForm(true); };

  const save = async () => {
    if (!form.name) { toast.error('Nom requis'); return; }
    try {
      const payload = { ...form, parent_org_id: form.parent_org_id || null };
      if (editing) { await api.put(`/organizations/admin/${editing.id}`, payload); toast.success('Mis à jour'); }
      else { await api.post('/organizations/admin', payload); toast.success('Créée'); }
      setShowForm(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const remove = async (o) => {
    if (!window.confirm(`Supprimer "${o.name}" ?`)) return;
    try { await api.delete(`/organizations/admin/${o.id}`); toast.success('Supprimée'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  return (
    <div className="p-6" data-testid="admin-organizations-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Buildings size={28} weight="duotone" className="text-violet-600" /> Organisations (multi-tenant)</h1>
          <p className="text-sm text-gray-500 mt-1">Hôtels, entreprises et flottes partenaires avec leurs tarifs spéciaux</p>
        </div>
        <button onClick={openCreate} className="bg-violet-600 hover:bg-violet-700 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-2" data-testid="add-org-btn">
          <Plus size={18} weight="bold" /> Nouvelle organisation
        </button>
      </div>

      {loading ? <p>Chargement…</p> : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr><th className="px-4 py-3 text-left">Nom</th><th className="text-left">Type</th><th className="text-left">Contact</th><th className="text-left">Commission</th><th className="text-left">Liens</th><th className="text-right pr-4">Actions</th></tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan="6" className="text-center text-gray-400 py-12">Aucune organisation.</td></tr>}
              {items.map(o => (
                <tr key={o.id} className="border-t hover:bg-violet-50/30" data-testid={`org-row-${o.id}`}>
                  <td className="px-4 py-3 font-semibold">{o.name}{!o.is_active && <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">inactive</span>}</td>
                  <td><span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded uppercase">{o.type}</span></td>
                  <td className="text-sm">{o.contact_email}<br /><span className="text-xs text-gray-500">{o.contact_phone}</span></td>
                  <td className="text-sm font-bold">{o.commission_pct}%</td>
                  <td className="text-xs"><span className="text-gray-500">🚗 {(o.linked_drivers || []).length} · 🏨 {(o.linked_kiosks || []).length}</span></td>
                  <td className="text-right pr-4 space-x-1">
                    <button onClick={() => openEdit(o)} className="p-2 rounded hover:bg-amber-50 text-amber-600"><Pencil size={16} /></button>
                    <button onClick={() => remove(o)} className="p-2 rounded hover:bg-red-50 text-red-600"><Trash size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" data-testid="org-form-modal">
            <h2 className="text-xl font-bold mb-4">{editing ? 'Modifier organisation' : 'Nouvelle organisation'}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="text-sm font-medium">Nom *</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full border rounded px-3 py-2 mt-1" data-testid="org-name-input" /></div>
              <div><label className="text-sm font-medium">Type</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full border rounded px-3 py-2 mt-1">
                  <option value="company">Company</option><option value="hotel">Hôtel</option><option value="airport">Aéroport</option><option value="corporate">Corporate</option>
                </select></div>
              <div><label className="text-sm font-medium">Commission %</label><input type="number" step="0.1" value={form.commission_pct} onChange={e => setForm({...form, commission_pct: parseFloat(e.target.value) || 0})} className="w-full border rounded px-3 py-2 mt-1" /></div>
              <div><label className="text-sm font-medium">Email contact</label><input type="email" value={form.contact_email} onChange={e => setForm({...form, contact_email: e.target.value})} className="w-full border rounded px-3 py-2 mt-1" /></div>
              <div><label className="text-sm font-medium">Téléphone</label><input value={form.contact_phone} onChange={e => setForm({...form, contact_phone: e.target.value})} className="w-full border rounded px-3 py-2 mt-1" /></div>
              <div className="col-span-2"><label className="text-sm font-medium">Adresse</label><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="w-full border rounded px-3 py-2 mt-1" /></div>
              <div className="col-span-2"><label className="text-sm font-medium">Notes</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className="w-full border rounded px-3 py-2 mt-1" /></div>
              <label className="flex items-center gap-2 col-span-2"><input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} /> Active</label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-5 py-2 border rounded-lg">Annuler</button>
              <button onClick={save} className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-lg" data-testid="org-save-btn">{editing ? 'Mettre à jour' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
