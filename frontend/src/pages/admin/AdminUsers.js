import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { MagnifyingGlass, CaretUp, CaretDown, Prohibit, ShieldCheck } from '@phosphor-icons/react';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const r = await adminAPI.listUsers({ limit: 200 });
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

  const handleSearch = () => { /* filtering is done client-side below */ };
  const handleReset = () => { setSearch(''); setSearchField('all'); setStatusFilter(''); };

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }) => (
    <span className="inline-flex flex-col ml-1 cursor-pointer" onClick={() => toggleSort(field)}>
      <CaretUp size={8} className={sortField === field && sortDir === 'asc' ? 'text-gray-800' : 'text-gray-300'} />
      <CaretDown size={8} className={sortField === field && sortDir === 'desc' ? 'text-gray-800' : 'text-gray-300'} />
    </span>
  );

  let filtered = users;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(u => {
      if (searchField === 'name') return (u.name || '').toLowerCase().includes(q);
      if (searchField === 'email') return (u.email || '').toLowerCase().includes(q);
      if (searchField === 'phone') return (u.phone || '').includes(q);
      return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.phone || '').includes(q);
    });
  }
  if (statusFilter === 'active') filtered = filtered.filter(u => !u.is_suspended);
  if (statusFilter === 'suspended') filtered = filtered.filter(u => u.is_suspended);

  filtered.sort((a, b) => {
    const va = (a[sortField] || '').toString().toLowerCase();
    const vb = (b[sortField] || '').toString().toLowerCase();
    return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  return (
    <div className="p-6" data-testid="admin-users-page">
      <h1 className="text-3xl font-light text-gray-800 mb-1" style={{ fontFamily: 'Georgia, Times, serif' }}>Users</h1>
      <hr className="border-gray-200 mb-5" />

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <span className="font-bold text-gray-700 text-sm">Search:</span>
        <select value={searchField} onChange={e => setSearchField(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none" data-testid="search-field-select">
          <option value="all">All</option>
          <option value="name">Name</option>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder=""
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48 outline-none focus:border-blue-400" data-testid="search-input" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none" data-testid="status-filter">
          <option value="">Select Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button onClick={handleSearch} className="border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="search-btn">SEARCH</button>
        <button onClick={handleReset} className="border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="reset-btn">RESET</button>
        <button className="ml-auto border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="export-btn">EXPORT</button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" data-testid="users-table">
              <thead>
                <tr className="border-t border-b border-gray-200 bg-white">
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">
                    <input type="checkbox" className="rounded border-gray-300" />
                  </th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort('name')}>
                    Name <SortIcon field="name" />
                  </th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort('email')}>
                    Email <SortIcon field="email" />
                  </th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Phone</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort('role')}>
                    Role <SortIcon field="role" />
                  </th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Status</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">No users found</td></tr>
                ) : filtered.map((u, i) => (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors" data-testid={`user-row-${i}`}>
                    <td className="py-3 px-3"><input type="checkbox" className="rounded border-gray-300" /></td>
                    <td className="py-3 px-3">
                      <span className="text-sm text-blue-600 hover:underline cursor-pointer font-medium">{u.name || 'N/A'}</span>
                    </td>
                    <td className="py-3 px-3 text-sm text-gray-600">{u.email || '-'}</td>
                    <td className="py-3 px-3 text-sm text-gray-600">{u.phone || '-'}</td>
                    <td className="py-3 px-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                        u.role === 'driver' ? 'bg-orange-100 text-orange-700' :
                        u.role === 'merchant' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                      }`}>{u.role}</span>
                    </td>
                    <td className="py-3 px-3">
                      {u.is_suspended ? (
                        <span className="inline-flex items-center gap-1 text-red-500 text-xs font-semibold">
                          <Prohibit size={14} /> Suspended
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-6 h-6">
                          <svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="#d4edda" stroke="#28a745" strokeWidth="1.5"/><path d="M6 11l3 3 6-6" stroke="#28a745" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {u.role !== 'admin' && (
                        <button onClick={() => toggleSuspend(u)} className="text-gray-400 hover:text-gray-600 transition-colors" data-testid={`action-btn-${i}`} title={u.is_suspended ? 'Unsuspend' : 'Suspend'}>
                          {u.is_suspended ? <ShieldCheck size={20} className="text-green-500" /> : <Prohibit size={20} />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500 mt-4" data-testid="pagination-info">Showing 1 to {filtered.length} of {total} entries</p>
        </>
      )}
    </div>
  );
};

export default AdminUsers;
