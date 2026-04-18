import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { UserCircle, Plus, MagnifyingGlass, ShieldCheck, Trash, PencilSimple } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminManageAdmins = () => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const res = await fetch(`${API}/api/users?role=admin`, { credentials: 'include' });
      if (res.ok) { const d = await res.json(); setAdmins(Array.isArray(d) ? d : d.users || []); }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const filtered = admins.filter(a => (a.name || '').toLowerCase().includes(filter.toLowerCase()) || (a.email || '').toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="p-6" data-testid="admin-manage-admins">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Manage Sub Admins</h1>
        <Button className="bg-[#3b82f6] text-white"><Plus size={16} className="mr-1" /> Ajouter un admin</Button>
      </div>
      <div className="relative mb-5 max-w-md">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Rechercher..." className="pl-9" value={filter} onChange={e => setFilter(e.target.value)} />
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b"><tr>
            <th className="text-left py-3 px-4 font-semibold text-gray-600">Nom</th>
            <th className="text-left py-3 px-4 font-semibold text-gray-600">Email</th>
            <th className="text-center py-3 px-4 font-semibold text-gray-600">Role</th>
            <th className="text-center py-3 px-4 font-semibold text-gray-600">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 font-medium text-gray-800">{a.name}</td>
                <td className="py-3 px-4 text-gray-600">{a.email}</td>
                <td className="py-3 px-4 text-center"><Badge className="bg-blue-100 text-blue-700">{a.role}</Badge></td>
                <td className="py-3 px-4 text-center"><Button size="icon" variant="ghost" className="h-7 w-7"><PencilSimple size={14} /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="p-8 text-center text-gray-400">Chargement...</div>}
        {!loading && filtered.length === 0 && <div className="p-8 text-center text-gray-400">Aucun administrateur</div>}
      </div>
    </div>
  );
};

export default AdminManageAdmins;
