import React, { useEffect, useState, useCallback } from 'react';
import { Plus, MagnifyingGlass, PencilSimple, Trash, ArrowsClockwise, X, Check } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const AdminGroupsPage = () => {
  const [groups, setGroups] = useState([]);
  const [registry, setRegistry] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', permissions: [] });
  const [showView, setShowView] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, regRes] = await Promise.all([
        fetch(`${API}/api/acl/roles`, { credentials: 'include', headers: authHeaders() }),
        fetch(`${API}/api/acl/permissions/registry`, { credentials: 'include', headers: authHeaders() }),
      ]);
      if (rolesRes.ok) {
        const d = await rolesRes.json();
        setGroups(d.items || []);
      }
      if (regRes.ok) {
        const d = await regRes.json();
        setRegistry(d.items || []);
      }
    } catch { toast.error('Erreur chargement'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = groups.filter((g) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || (g.name || '').toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q);
    const matchesStatus = !statusFilter || (statusFilter === 'active' ? g.is_active !== false : g.is_active === false);
    return matchesSearch && matchesStatus;
  });

  const openCreate = () => { setEditing(null); setForm({ name: '', description: '', permissions: [] }); setShowForm(true); };
  const openEdit = (g) => {
    setEditing(g);
    setForm({ name: g.name || '', description: g.description || '', permissions: g.permissions || [] });
    setShowForm(true);
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.name) { toast.error('Nom requis'); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/api/acl/roles/${editing.id}` : `${API}/api/acl/roles`;
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success(editing ? 'Groupe mis à jour' : 'Groupe créé');
        setShowForm(false);
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.detail || 'Erreur');
      }
    } catch { toast.error('Erreur réseau'); }
    setSaving(false);
  };

  const remove = async (g) => {
    if (!window.confirm(`Supprimer le groupe "${g.name}" ?`)) return;
    const res = await fetch(`${API}/api/acl/roles/${g.id}`, { method: 'DELETE', credentials: 'include', headers: authHeaders() });
    if (res.ok) { toast.success('Groupe supprimé'); load(); }
    else { const d = await res.json().catch(() => ({})); toast.error(d.detail || 'Erreur'); }
  };

  const togglePerm = (key) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key) ? f.permissions.filter((p) => p !== key) : [...f.permissions, key],
    }));
  };

  // Group permissions by category (prefix before the dot)
  const groupedRegistry = registry.reduce((acc, p) => {
    const cat = (p.key || '').split('.')[0] || 'other';
    (acc[cat] = acc[cat] || []).push(p);
    return acc;
  }, {});

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen" data-testid="admin-groups-page">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Groupes d'administrateurs</h1>
        <p className="text-sm text-gray-500">Gérer les groupes d'administrateurs et leurs permissions.</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"><option>Tous</option></select>
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..." className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm" data-testid="filter-search" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" data-testid="filter-status">
            <option value="">Sélectionner le statut</option>
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
          </select>
          <div />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button onClick={load} className="w-9 h-9 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center" data-testid="filter-refresh"><ArrowsClockwise size={16} /></button>
          <button onClick={() => { setSearch(''); setStatusFilter(''); }} className="w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center" data-testid="filter-clear"><X size={16} /></button>
          <button onClick={openCreate} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold flex items-center gap-1.5" data-testid="add-group-btn">
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
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Nom du groupe</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Permissions</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700">Statut</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`group-row-${g.id}`}>
                <td className="py-3 px-4"><input type="checkbox" /></td>
                <td className="py-3 px-4 font-medium text-gray-900">{g.name}{g.is_system && <span className="ml-2 text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Système</span>}</td>
                <td className="py-3 px-4">
                  <button onClick={() => setShowView(g)} className="px-3 py-1.5 rounded-md bg-gray-900 text-white text-xs font-semibold" data-testid={`view-perms-${g.id}`}>
                    Voir ({(g.permissions || []).length})
                  </button>
                </td>
                <td className="py-3 px-4 text-center">
                  <span className="inline-block px-3 py-0.5 text-xs rounded-md font-semibold bg-emerald-50 text-emerald-700">Actif</span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => openEdit(g)} className="text-gray-500 hover:text-blue-600" data-testid={`edit-group-${g.id}`} title="Modifier" disabled={g.is_system}>
                      <PencilSimple size={16} className={g.is_system ? 'opacity-30' : ''} />
                    </button>
                    <button onClick={() => remove(g)} className="text-gray-500 hover:text-red-600" data-testid={`delete-group-${g.id}`} title="Supprimer" disabled={g.is_system}>
                      <Trash size={16} className={g.is_system ? 'opacity-30' : ''} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="p-8 text-center text-gray-400">Chargement...</div>}
        {!loading && filtered.length === 0 && <div className="p-8 text-center text-gray-400">Aucun groupe</div>}
      </div>

      {/* View permissions modal */}
      {showView && (
        <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowView(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} data-testid="view-permissions-modal">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Permissions de "{showView.name}"</h2>
              <button onClick={() => setShowView(null)} className="text-gray-400"><X size={20} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3">{(showView.permissions || []).length} permissions actives</p>
            <div className="flex flex-wrap gap-1.5">
              {(showView.permissions || []).map((p) => (
                <span key={p} className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-mono">{p}</span>
              ))}
              {(showView.permissions || []).length === 0 && <span className="text-sm text-gray-400">Aucune permission</span>}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} data-testid="group-form-modal">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{editing ? `Modifier le groupe ${editing.name}` : 'Ajouter un groupe'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400"><X size={20} /></button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Nom du groupe <span className="text-red-500">*</span></label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" data-testid="form-name" disabled={editing?.is_system} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                  <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" data-testid="form-description" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Permissions ({form.permissions.length})</label>
                <div className="border border-gray-200 rounded-lg max-h-80 overflow-y-auto p-3 space-y-3">
                  {Object.entries(groupedRegistry).map(([cat, perms]) => (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-xs font-bold text-gray-800 uppercase">{cat}</h4>
                        <button type="button" onClick={() => {
                          const allKeys = perms.map((p) => p.key);
                          const allChecked = allKeys.every((k) => form.permissions.includes(k));
                          setForm((f) => ({ ...f, permissions: allChecked ? f.permissions.filter((k) => !allKeys.includes(k)) : [...new Set([...f.permissions, ...allKeys])] }));
                        }} className="text-[11px] text-blue-600">Tout</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                        {perms.map((p) => (
                          <label key={p.key} className="flex items-start gap-2 text-xs cursor-pointer p-1 rounded hover:bg-gray-50">
                            <input type="checkbox" checked={form.permissions.includes(p.key)} onChange={() => togglePerm(p.key)}
                              className="mt-0.5" data-testid={`perm-checkbox-${p.key}`} />
                            <span className="font-mono text-gray-700">{p.key}</span>
                            <span className="text-gray-400">— {p.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button type="submit" disabled={saving || editing?.is_system} className="px-6 py-2.5 rounded-lg bg-emerald-500 text-white font-semibold disabled:opacity-50" data-testid="form-submit-btn">
                  {saving ? 'Enregistrement...' : (editing ? 'Mettre à jour' : 'Créer')}
                </button>
                <button type="button" onClick={() => setForm({ name: '', description: '', permissions: [] })} className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold" data-testid="form-reset-btn">
                  Réinitialiser
                </button>
                {editing?.is_system && <span className="text-xs text-amber-600 ml-2"><Check size={12} className="inline" /> Groupe système (lecture seule)</span>}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminGroupsPage;
