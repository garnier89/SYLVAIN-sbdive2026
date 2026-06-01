/**
 * Admin ACL — CRUD rôles + assignment users (V3Cube admin_groups + admin_permissions).
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash, ShieldCheck, UsersThree, Check, X } from '@phosphor-icons/react';
import { aclAPI } from '../../api/v3cubeAPI';

export default function AdminACL() {
  const [tab, setTab] = useState('roles'); // roles | users
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [registry, setRegistry] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState(null);
  const [assigningUser, setAssigningUser] = useState(null);
  const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [] });

  const load = async () => {
    setLoading(true);
    try {
      const [r, u, reg] = await Promise.all([aclAPI.listRoles(), aclAPI.listAdminUsers(), aclAPI.permissionsRegistry().catch(() => ({ items: [] }))]);
      setRoles(r.items || []);
      setUsers(u.items || []);
      setRegistry(reg.items || []);
    } catch (e) { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreateRole = () => { setEditingRole({}); setRoleForm({ name: '', description: '', permissions: [] }); };
  const openEditRole = (r) => { setEditingRole(r); setRoleForm({ name: r.name, description: r.description || '', permissions: r.permissions || [] }); };

  const saveRole = async () => {
    if (!roleForm.name) { toast.error('Nom requis'); return; }
    try {
      if (editingRole?.id) {
        await aclAPI.updateRole(editingRole.id, roleForm);
        toast.success('Rôle mis à jour');
      } else {
        await aclAPI.createRole(roleForm);
        toast.success('Rôle créé');
      }
      setEditingRole(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const deleteRole = async (r) => {
    if (r.is_system) { toast.error('Rôle système non supprimable'); return; }
    if (!window.confirm(`Supprimer le rôle "${r.name}" ?`)) return;
    try {
      await aclAPI.deleteRole(r.id);
      toast.success('Rôle supprimé');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const togglePerm = (key) => {
    setRoleForm(f => ({ ...f, permissions: f.permissions.includes(key) ? f.permissions.filter(p => p !== key) : [...f.permissions, key] }));
  };

  const saveUserRoles = async (selectedRoleIds) => {
    try {
      await aclAPI.assignRoles(assigningUser.id, selectedRoleIds);
      toast.success('Rôles assignés');
      setAssigningUser(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  // Group permissions by domain (panel name before the dot)
  const permsByDomain = registry.reduce((acc, p) => {
    const dom = p.key.split('.')[0];
    (acc[dom] = acc[dom] || []).push(p);
    return acc;
  }, {});

  return (
    <div className="p-6" data-testid="admin-acl-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck size={28} weight="duotone" className="text-indigo-600" /> Gestion ACL (Rôles & Permissions)</h1>
          <p className="text-sm text-gray-500 mt-1">Contrôle d'accès granulaire — V3Cube admin_groups + admin_permissions</p>
        </div>
        {tab === 'roles' && (
          <button onClick={openCreateRole} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-2" data-testid="add-role-btn">
            <Plus size={18} weight="bold" /> Nouveau rôle
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-6 border-b">
        <button onClick={() => setTab('roles')} className={`px-4 py-2 -mb-px ${tab === 'roles' ? 'border-b-2 border-indigo-600 text-indigo-600 font-semibold' : 'text-gray-500'}`} data-testid="tab-roles">
          🎭 Rôles ({roles.length})
        </button>
        <button onClick={() => setTab('users')} className={`px-4 py-2 -mb-px ${tab === 'users' ? 'border-b-2 border-indigo-600 text-indigo-600 font-semibold' : 'text-gray-500'}`} data-testid="tab-users">
          👥 Utilisateurs admin ({users.length})
        </button>
      </div>

      {loading ? <p>Chargement…</p> : tab === 'roles' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {roles.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5" data-testid={`role-card-${r.name}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-800">{r.name}</h3>
                    {r.is_system && <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">SYSTÈME</span>}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{r.description}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEditRole(r)} disabled={r.is_system} className="p-2 rounded hover:bg-amber-50 text-amber-600 disabled:opacity-40" title="Modifier"><Pencil size={16} /></button>
                  <button onClick={() => deleteRole(r)} disabled={r.is_system} className="p-2 rounded hover:bg-red-50 text-red-600 disabled:opacity-40" title="Supprimer"><Trash size={16} /></button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(r.permissions || []).map(p => (
                  <span key={p} className="text-[10px] bg-gray-100 text-gray-700 px-2 py-1 rounded">{p}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr><th className="px-4 py-3 text-left">Email</th><th className="text-left">Nom</th><th className="text-left">Rôles assignés</th><th className="text-right pr-4">Action</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t hover:bg-indigo-50/30" data-testid={`user-row-${u.email}`}>
                  <td className="px-4 py-3 font-mono text-sm">{u.email}</td>
                  <td className="text-sm">{u.name}</td>
                  <td className="text-sm">
                    {(u.roles_resolved || []).map(r => r && (
                      <span key={r.id} className="inline-block bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded mr-1">{r.name}</span>
                    ))}
                    {(!u.roles_resolved || u.roles_resolved.length === 0) && <span className="text-gray-400 text-xs italic">aucun rôle</span>}
                  </td>
                  <td className="text-right pr-4">
                    <button onClick={() => setAssigningUser(u)} className="text-indigo-600 hover:underline text-sm font-medium" data-testid={`assign-${u.email}`}>
                      <UsersThree size={16} className="inline mr-1" /> Assigner
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Role Edit Modal */}
      {editingRole && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditingRole(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" data-testid="role-edit-modal">
            <h2 className="text-xl font-bold mb-4">{editingRole?.id ? 'Modifier le rôle' : 'Nouveau rôle'}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nom *</label>
                <input value={roleForm.name} onChange={e => setRoleForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded px-3 py-2 mt-1 font-mono" placeholder="ex: dispatcher_night_shift" data-testid="role-name-input" />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea value={roleForm.description} onChange={e => setRoleForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border rounded px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Permissions ({roleForm.permissions.length} sélectionnées)</label>
                <div className="mt-2 space-y-3">
                  {Object.entries(permsByDomain).map(([dom, perms]) => (
                    <div key={dom} className="border rounded p-3 bg-gray-50">
                      <p className="text-xs font-bold uppercase text-gray-500 mb-2">{dom}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {perms.map(p => (
                          <label key={p.key} className="flex items-start gap-2 cursor-pointer hover:bg-white p-1 rounded">
                            <input type="checkbox" checked={roleForm.permissions.includes(p.key)} onChange={() => togglePerm(p.key)} className="mt-1" />
                            <div className="text-xs">
                              <p className="font-mono font-semibold">{p.key}</p>
                              <p className="text-gray-500">{p.label}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setEditingRole(null)} className="px-5 py-2 border rounded-lg">Annuler</button>
              <button onClick={saveRole} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg" data-testid="role-save-btn">Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* User Roles Assignment Modal */}
      {assigningUser && (
        <UserRolesAssignModal user={assigningUser} roles={roles} onSave={saveUserRoles} onClose={() => setAssigningUser(null)} />
      )}
    </div>
  );
}

const UserRolesAssignModal = ({ user, roles, onSave, onClose }) => {
  const [selected, setSelected] = useState(() => (user.roles_resolved || []).map(r => r?.id).filter(Boolean));
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" data-testid="assign-roles-modal">
        <h2 className="text-xl font-bold mb-1">Assigner des rôles</h2>
        <p className="text-sm text-gray-500 mb-4">{user.email}</p>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {roles.map(r => (
            <label key={r.id} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${selected.includes(r.id) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
              <div className="flex-1">
                <p className="font-semibold">{r.name}</p>
                <p className="text-xs text-gray-500">{r.description}</p>
              </div>
              {selected.includes(r.id) && <Check size={18} className="text-indigo-600" weight="bold" />}
            </label>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 border rounded-lg">Annuler</button>
          <button onClick={() => onSave(selected)} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg" data-testid="assign-save-btn">Enregistrer</button>
        </div>
      </div>
    </div>
  );
};
