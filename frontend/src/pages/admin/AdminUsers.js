import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { Users, MagnifyingGlass, ShieldCheck, Prohibit, User, Phone, Envelope } from '@phosphor-icons/react';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { loadUsers(); }, [filter]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (filter) params.role = filter;
      const r = await adminAPI.listUsers(params);
      setUsers(r.data.users); setTotal(r.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const toggleSuspend = async (u) => {
    try {
      if (u.is_suspended) await adminAPI.unsuspendUser(u.id);
      else await adminAPI.suspendUser(u.id);
      loadUsers();
    } catch (e) { console.error(e); }
  };

  const filtered = search
    ? users.filter(u => (u.name || '').toLowerCase().includes(search.toLowerCase()) || (u.email || '').toLowerCase().includes(search.toLowerCase()) || (u.phone || '').includes(search))
    : users;

  return (
    <div className="p-5 lg:p-6 space-y-5" data-testid="admin-users-page">
      <div>
        <h1 className="text-2xl font-bold text-white">Utilisateurs</h1>
        <p className="text-gray-500 text-sm">{total} utilisateurs enregistres</p>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, email, telephone..."
            className="w-full pl-9 pr-4 py-2.5 bg-[#161923] border border-gray-800 rounded-lg text-white text-sm outline-none focus:border-[#FF4500] transition-colors placeholder:text-gray-600"
            data-testid="search-input" />
        </div>
        <div className="flex gap-2">
          {[{ key: '', label: 'Tous' }, { key: 'user', label: 'Clients' }, { key: 'driver', label: 'Chauffeurs' }, { key: 'admin', label: 'Admins' }].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                filter === f.key ? 'bg-[#FF4500] text-white' : 'bg-[#161923] text-gray-400 border border-gray-800'}`}
              data-testid={`filter-${f.key || 'all'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Users List */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-2 border-[#FF4500]/30 border-t-[#FF4500] rounded-full animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#161923] border border-gray-800 rounded-xl p-12 text-center">
            <Users size={40} className="text-gray-700 mx-auto mb-2" />
            <p className="text-gray-500">Aucun utilisateur trouve</p>
          </div>
        ) : filtered.map((u, i) => (
          <div key={u.id} className="bg-[#161923] border border-gray-800 rounded-xl p-4 flex items-center gap-4 hover:border-gray-700 transition-colors"
            data-testid={`user-row-${i}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              u.role === 'admin' ? 'bg-[#FF4500]/20 text-[#FF4500]' : u.role === 'driver' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'}`}>
              <User size={18} weight="bold" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-white font-medium text-sm truncate">{u.name || 'Sans nom'}</p>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  u.role === 'admin' ? 'bg-[#FF4500]/10 text-[#FF4500]' : u.role === 'driver' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                  {u.role === 'admin' ? 'Admin' : u.role === 'driver' ? 'Chauffeur' : 'Client'}
                </span>
                {u.is_suspended && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400">Suspendu</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                {u.email && <span className="text-gray-500 text-xs flex items-center gap-1"><Envelope size={10} /> {u.email}</span>}
                {u.phone && <span className="text-gray-500 text-xs flex items-center gap-1"><Phone size={10} /> {u.phone}</span>}
              </div>
            </div>
            {u.role !== 'admin' && (
              <button onClick={() => toggleSuspend(u)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  u.is_suspended ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}
                data-testid={`suspend-btn-${i}`}>
                {u.is_suspended ? <><ShieldCheck size={12} className="inline mr-1" />Reactiver</> : <><Prohibit size={12} className="inline mr-1" />Suspendre</>}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminUsers;
