/**
 * Admin Corporate Accounts (Pack C — B2B).
 * List + create corporate accounts, manage members, view monthly invoice.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Buildings, Plus, Pencil, Trash, Users, Receipt, Copy, X } from '@phosphor-icons/react';
import { corporateAPI } from '../../services/api';

const initForm = {
  name: '', join_code: '', billing_email: '', contact_phone: '', address: '',
  discount_pct: 0, monthly_credit_limit: 0, is_active: true, notes: '',
};

export default function AdminCorporate() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initForm);
  const [detail, setDetail] = useState(null); // {account, members, charges}
  const [invoice, setInvoice] = useState(null);
  const [newMemberEmail, setNewMemberEmail] = useState('');

  const load = async () => {
    setLoading(true);
    try { const r = await corporateAPI.adminList(); setItems(r.data.items || []); }
    catch (e) { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(initForm); setShowForm(true); };
  const openEdit = (o) => { setEditing(o); setForm({ ...initForm, ...o }); setShowForm(true); };

  const save = async () => {
    if (!form.name) { toast.error('Nom requis'); return; }
    try {
      if (editing) { await corporateAPI.adminUpdate(editing.id, form); toast.success('Mis à jour'); }
      else { await corporateAPI.adminCreate(form); toast.success('Compte créé'); }
      setShowForm(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const remove = async (o) => {
    if (!window.confirm(`Supprimer "${o.name}" ?`)) return;
    try { await corporateAPI.adminDelete(o.id); toast.success('Supprimé'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const openDetail = async (o) => {
    try {
      const [d, inv] = await Promise.all([corporateAPI.adminDetail(o.id), corporateAPI.adminInvoice(o.id)]);
      setDetail(d.data); setInvoice(inv.data); setNewMemberEmail('');
    } catch (e) { toast.error('Erreur chargement détail'); }
  };

  const addMember = async () => {
    if (!newMemberEmail) { toast.error('Email requis'); return; }
    try {
      await corporateAPI.adminAddMember(detail.account.id, newMemberEmail.trim(), 'employee');
      toast.success('Membre ajouté');
      setNewMemberEmail('');
      openDetail(detail.account);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const removeMember = async (memberId) => {
    try {
      await corporateAPI.adminRemoveMember(detail.account.id, memberId);
      toast.success('Membre retiré'); openDetail(detail.account); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const copyCode = (code) => { navigator.clipboard?.writeText(code); toast.success(`Code "${code}" copié`); };

  return (
    <div className="p-6" data-testid="admin-corporate-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Buildings size={28} weight="duotone" className="text-indigo-600" /> Comptes Entreprise (B2B)
          </h1>
          <p className="text-sm text-gray-500 mt-1">Facturation centralisée des courses, remises négociées et plafond mensuel</p>
        </div>
        <button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-2" data-testid="add-corporate-btn">
          <Plus size={18} weight="bold" /> Nouveau compte
        </button>
      </div>

      {loading ? <p>Chargement…</p> : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Entreprise</th>
                <th className="text-left">Code</th>
                <th className="text-left">Remise</th>
                <th className="text-left">Crédit utilisé</th>
                <th className="text-left">Membres</th>
                <th className="text-left">Courses</th>
                <th className="text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan="7" className="text-center text-gray-400 py-12">Aucun compte entreprise.</td></tr>}
              {items.map(o => (
                <tr key={o.id} className="border-t hover:bg-indigo-50/30" data-testid={`corporate-row-${o.id}`}>
                  <td className="px-4 py-3 font-semibold">{o.name}{!o.is_active && <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">inactif</span>}<br /><span className="text-xs text-gray-500">{o.billing_email}</span></td>
                  <td>
                    <button onClick={() => copyCode(o.join_code)} className="text-xs font-mono bg-indigo-100 text-indigo-700 px-2 py-1 rounded flex items-center gap-1 hover:bg-indigo-200" data-testid={`copy-code-${o.id}`}>
                      {o.join_code} <Copy size={12} />
                    </button>
                  </td>
                  <td className="text-sm font-bold">{o.discount_pct}%</td>
                  <td className="text-sm">{(o.credit_used || 0).toFixed(2)} € {o.monthly_credit_limit ? <span className="text-xs text-gray-400">/ {o.monthly_credit_limit} €</span> : null}</td>
                  <td className="text-sm">{o.member_count || 0}</td>
                  <td className="text-sm">{o.total_rides || 0}</td>
                  <td className="text-right pr-4 space-x-1">
                    <button onClick={() => openDetail(o)} className="p-2 rounded hover:bg-indigo-50 text-indigo-600" title="Membres & facturation" data-testid={`detail-corporate-${o.id}`}><Users size={16} /></button>
                    <button onClick={() => openEdit(o)} className="p-2 rounded hover:bg-amber-50 text-amber-600"><Pencil size={16} /></button>
                    <button onClick={() => remove(o)} className="p-2 rounded hover:bg-red-50 text-red-600"><Trash size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" data-testid="corporate-form-modal">
            <h2 className="text-xl font-bold mb-4">{editing ? 'Modifier le compte' : 'Nouveau compte entreprise'}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="text-sm font-medium">Nom de l'entreprise *</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full border rounded px-3 py-2 mt-1" data-testid="corporate-name-input" /></div>
              <div><label className="text-sm font-medium">Code d'adhésion {editing ? '' : '(auto si vide)'}</label><input value={form.join_code} onChange={e => setForm({...form, join_code: e.target.value.toUpperCase()})} placeholder="ACME-2026" className="w-full border rounded px-3 py-2 mt-1 font-mono" data-testid="corporate-code-input" /></div>
              <div><label className="text-sm font-medium">Remise %</label><input type="number" step="0.5" value={form.discount_pct} onChange={e => setForm({...form, discount_pct: parseFloat(e.target.value) || 0})} className="w-full border rounded px-3 py-2 mt-1" data-testid="corporate-discount-input" /></div>
              <div><label className="text-sm font-medium">Email de facturation</label><input type="email" value={form.billing_email} onChange={e => setForm({...form, billing_email: e.target.value})} className="w-full border rounded px-3 py-2 mt-1" /></div>
              <div><label className="text-sm font-medium">Téléphone</label><input value={form.contact_phone} onChange={e => setForm({...form, contact_phone: e.target.value})} className="w-full border rounded px-3 py-2 mt-1" /></div>
              <div className="col-span-2"><label className="text-sm font-medium">Plafond mensuel (€, 0 = illimité)</label><input type="number" value={form.monthly_credit_limit} onChange={e => setForm({...form, monthly_credit_limit: parseFloat(e.target.value) || 0})} className="w-full border rounded px-3 py-2 mt-1" /></div>
              <div className="col-span-2"><label className="text-sm font-medium">Adresse</label><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="w-full border rounded px-3 py-2 mt-1" /></div>
              <div className="col-span-2"><label className="text-sm font-medium">Notes</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className="w-full border rounded px-3 py-2 mt-1" /></div>
              <label className="flex items-center gap-2 col-span-2"><input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} /> Actif</label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-5 py-2 border rounded-lg">Annuler</button>
              <button onClick={save} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg" data-testid="corporate-save-btn">{editing ? 'Mettre à jour' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail (members + invoice) modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setDetail(null); setInvoice(null); }}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto" data-testid="corporate-detail-modal">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{detail.account.name}</h2>
              <button onClick={() => { setDetail(null); setInvoice(null); }} className="p-2 rounded hover:bg-gray-100"><X size={20} /></button>
            </div>

            {invoice && (
              <div className="grid grid-cols-4 gap-3 mb-6">
                <div className="bg-indigo-50 rounded-lg p-3"><p className="text-xs text-gray-500">Courses ({invoice.month})</p><p className="text-lg font-bold">{invoice.rides}</p></div>
                <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">Brut</p><p className="text-lg font-bold">{invoice.total_gross} €</p></div>
                <div className="bg-amber-50 rounded-lg p-3"><p className="text-xs text-gray-500">Remise</p><p className="text-lg font-bold text-amber-600">-{invoice.total_discount} €</p></div>
                <div className="bg-emerald-50 rounded-lg p-3"><p className="text-xs text-gray-500">Net à facturer</p><p className="text-lg font-bold text-emerald-700">{invoice.total_net} €</p></div>
              </div>
            )}

            <h3 className="font-semibold mb-2 flex items-center gap-2"><Users size={18} /> Membres</h3>
            <div className="flex gap-2 mb-3">
              <input value={newMemberEmail} onChange={e => setNewMemberEmail(e.target.value)} placeholder="email@entreprise.com" className="flex-1 border rounded px-3 py-2 text-sm" data-testid="add-member-email-input" />
              <button onClick={addMember} className="bg-indigo-600 text-white px-4 rounded-lg text-sm font-semibold" data-testid="add-member-btn">Ajouter</button>
            </div>
            <div className="border rounded-lg divide-y mb-6">
              {(detail.members || []).filter(m => m.status === 'active').length === 0 && <p className="text-sm text-gray-400 p-3">Aucun membre actif.</p>}
              {(detail.members || []).filter(m => m.status === 'active').map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 text-sm">
                  <div><span className="font-medium">{m.user_name}</span> <span className="text-gray-500">{m.user_email}</span> <span className="text-xs bg-gray-100 px-2 py-0.5 rounded ml-1">{m.member_role}</span></div>
                  <button onClick={() => removeMember(m.id)} className="text-red-600 hover:bg-red-50 p-1 rounded"><Trash size={14} /></button>
                </div>
              ))}
            </div>

            <h3 className="font-semibold mb-2 flex items-center gap-2"><Receipt size={18} /> Dernières courses facturées</h3>
            <div className="border rounded-lg divide-y">
              {(detail.charges || []).length === 0 && <p className="text-sm text-gray-400 p-3">Aucune course facturée pour le moment.</p>}
              {(detail.charges || []).map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 text-sm">
                  <div><span className="font-medium">{c.user_name}</span><br /><span className="text-xs text-gray-500">{c.pickup_address} → {c.dropoff_address}</span></div>
                  <div className="text-right"><span className="font-bold">{c.net_fare} €</span><br /><span className="text-xs text-gray-400">brut {c.gross_fare} € · -{c.discount} €</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
