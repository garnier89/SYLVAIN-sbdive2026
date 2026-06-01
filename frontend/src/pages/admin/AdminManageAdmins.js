import React, { useState, useEffect, useCallback } from 'react';
import { Plus, MagnifyingGlass, PencilSimple, Trash, Export, ToggleLeft, ToggleRight, X, ArrowsClockwise } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
// Auth: rely on httpOnly cookies (set by backend on login). credentials:'include' carries them automatically — XSS-safe.

const initialForm = { first_name: '', last_name: '', email: '', password: '', role_id: '' };

const AdminManageAdmins = () => {
  const [admins, setAdmins] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [admRes, rolesRes] = await Promise.all([
        fetch(`${API}/api/acl/users`, { credentials: 'include' }),
        fetch(`${API}/api/acl/roles`, { credentials: 'include' }),
      ]);
      if (admRes.ok) {
        const d = await admRes.json();
        setAdmins(d.items || []);
      }
      if (rolesRes.ok) {
        const d = await rolesRes.json();
        setRoles(d.items || []);
      }
    } catch (e) { toast.error('Erreur chargement'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = admins.filter((a) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || (a.name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q);
    const matchesStatus = !statusFilter || (statusFilter === 'active' ? a.is_active !== false : a.is_active === false);
    const matchesRole = !roleFilter || (a.role_ids || []).includes(roleFilter);
    return matchesSearch && matchesStatus && matchesRole;
  });

  const openCreate = () => { setEditing(null); setForm(initialForm); setShowForm(true); };
  const openEdit = (a) => {
    setEditing(a);
    setForm({
      first_name: a.first_name || (a.name || '').split(' ')[0] || '',
      last_name: a.last_name || (a.name || '').split(' ').slice(1).join(' ') || '',
      email: a.email || '',
      password: '',
      role_id: (a.role_ids && a.role_ids[0]) || '',
    });
    setShowForm(true);
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.first_name || !form.last_name || !form.email || !form.role_id) {
      toast.error('Tous les champs sont requis');
      return;
    }
    if (!editing && !form.password) {
      toast.error('Mot de passe requis pour création');
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `${API}/api/acl/admins/${editing.id}` : `${API}/api/acl/admins`;
      const method = editing ? 'PUT' : 'POST';
      const payload = { ...form };
      if (editing && !payload.password) delete payload.password;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success(editing ? 'Admin mis à jour' : 'Admin créé');
        setShowForm(false);
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.detail || 'Erreur');
      }
    } catch { toast.error('Erreur réseau'); }
    setSaving(false);
  };

  const toggleStatus = async (a) => {
    const res = await fetch(`${API}/api/acl/admins/${a.id}/toggle-status`, {
      method: 'POST', credentials: 'include',
    });
    if (res.ok) { toast.success('Statut mis à jour'); load(); }
    else toast.error('Erreur');
  };

  const remove = async (a) => {
    if (!window.confirm(`Supprimer l'admin ${a.email} ?`)) return;
    const res = await fetch(`${API}/api/acl/admins/${a.id}`, {
      method: 'DELETE', credentials: 'include',
    });
    if (res.ok) { toast.success('Admin supprimé'); load(); }
    else { const d = await res.json().catch(() => ({})); toast.error(d.detail || 'Erreur'); }
  };

  const exportCsv = () => {
    const rows = [['Name', 'Email', 'Role', 'Status', 'Created At']];
    filtered.forEach((a) => rows.push([a.name, a.email, a.role_name || '', a.is_active === false ? 'Inactive' : 'Active', a.created_at || '']));
    const csv = rows.map((r) => r.map((c) => `"${(c || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `administrators_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen" data-testid="admin-manage-admins">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Administrateur</h1>
        <p className="text-sm text-gray-500">Gérez les administrateurs, leurs rôles et accès.</p>
      </div>

      {/* Filters bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
          <select value="all" onChange={() => {}} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" data-testid="filter-scope">
            <option value="all">Tous</option>
          </select>
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..." className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm" data-testid="filter-search" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" data-testid="filter-status">
            <option value="">Statut</option>
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
          </select>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" data-testid="filter-role">
            <option value="">Rôle</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <button onClick={load} className="w-9 h-9 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center" data-testid="filter-refresh"><ArrowsClockwise size={16} /></button>
          <button onClick={() => { setSearch(''); setStatusFilter(''); setRoleFilter(''); }} className="w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center" data-testid="filter-clear">
            <X size={16} />
          </button>
          <button onClick={exportCsv} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold flex items-center gap-1.5 bg-white" data-testid="export-btn">
            <Export size={14} /> Exporter
          </button>
          <button onClick={openCreate} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold flex items-center gap-1.5" data-testid="add-admin-btn">
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-8"><input type="checkbox" /></th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Nom</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Rôles</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700">Statut</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`admin-row-${a.id}`}>
                <td className="py-3 px-4"><input type="checkbox" /></td>
                <td className="py-3 px-4 font-medium text-gray-900 underline cursor-pointer" onClick={() => openEdit(a)}>{a.name || '—'}</td>
                <td className="py-3 px-4 text-gray-600">{a.email}</td>
                <td className="py-3 px-4 text-gray-700">{a.role_name || (a.roles_resolved && a.roles_resolved[0]?.name) || '—'}</td>
                <td className="py-3 px-4 text-center">
                  <span className={`inline-block px-3 py-0.5 text-xs rounded-md font-semibold ${a.is_active === false ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`} data-testid={`admin-status-${a.id}`}>
                    {a.is_active === false ? 'Inactif' : 'Actif'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => openEdit(a)} className="text-gray-500 hover:text-blue-600" data-testid={`edit-admin-${a.id}`} title="Modifier"><PencilSimple size={16} /></button>
                    <button onClick={() => toggleStatus(a)} className="text-gray-500 hover:text-emerald-600" data-testid={`toggle-admin-${a.id}`} title="Activer/Désactiver">
                      {a.is_active === false ? <ToggleLeft size={18} /> : <ToggleRight size={18} />}
                    </button>
                    <button onClick={() => remove(a)} className="text-gray-500 hover:text-red-600" data-testid={`delete-admin-${a.id}`} title="Supprimer"><Trash size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="p-8 text-center text-gray-400">Chargement...</div>}
        {!loading && filtered.length === 0 && <div className="p-8 text-center text-gray-400">Aucun administrateur</div>}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()} data-testid="admin-form-modal">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{editing ? `Modifier l'admin ${editing.name || ''}` : 'Ajouter un administrateur'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400"><X size={20} /></button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Groupe (rôle) <span className="text-red-500">*</span></label>
                  <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" data-testid="form-role-id">
                    <option value="">— Choisir un rôle —</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Prénom <span className="text-red-500">*</span></label>
                  <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" data-testid="form-first-name" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Nom <span className="text-red-500">*</span></label>
                  <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" data-testid="form-last-name" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" data-testid="form-email" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Mot de passe {editing ? <span className="text-gray-400 font-normal">(laisser vide pour conserver)</span> : <span className="text-red-500">*</span>}</label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="Mot de passe" data-testid="form-password" />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-lg bg-emerald-500 text-white font-semibold disabled:opacity-50" data-testid="form-submit-btn">
                  {saving ? 'Enregistrement...' : (editing ? 'Mettre à jour' : 'Créer')}
                </button>
                <button type="button" onClick={() => setForm(initialForm)} className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold" data-testid="form-reset-btn">
                  Réinitialiser
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminManageAdmins;
