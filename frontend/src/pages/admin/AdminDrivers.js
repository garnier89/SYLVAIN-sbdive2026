import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { CaretUp, CaretDown, Check, X, Eye, Gear } from '@phosphor-icons/react';

const AdminDrivers = () => {
  const [drivers, setDrivers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => { loadDrivers(); }, []);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const r = await adminAPI.listDrivers({});
      setDrivers(r.data.drivers); setTotal(r.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const approveDriver = async (id) => {
    try { await adminAPI.approveDriver(id); loadDrivers(); } catch (e) { console.error(e); }
  };

  const rejectDriver = async (id) => {
    try { await adminAPI.rejectDriver(id, 'Documents not valid'); loadDrivers(); } catch (e) { console.error(e); }
  };

  const handleReset = () => { setSearch(''); setStatusFilter(''); };

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

  let filtered = drivers;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(d => (d.user?.name || '').toLowerCase().includes(q) || (d.user?.email || '').toLowerCase().includes(q));
  }
  if (statusFilter) filtered = filtered.filter(d => d.status === statusFilter);

  return (
    <div className="p-6" data-testid="admin-drivers-page">
      <h1 className="text-3xl font-light text-gray-800 mb-1" style={{ fontFamily: 'Georgia, Times, serif' }}>Drivers / Service Providers</h1>
      <hr className="border-gray-200 mb-5" />

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <span className="font-bold text-gray-700 text-sm">Search:</span>
        <select className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none">
          <option>All</option>
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder=""
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48 outline-none focus:border-blue-400" data-testid="search-input" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none" data-testid="status-filter">
          <option value="">Select Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button className="border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="search-btn">SEARCH</button>
        <button onClick={handleReset} className="border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="reset-btn">RESET</button>
        <button className="ml-auto border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="export-btn">EXPORT</button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" data-testid="drivers-table">
              <thead>
                <tr className="border-t border-b border-gray-200 bg-white">
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700"><input type="checkbox" className="rounded border-gray-300" /></th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort('name')}>
                    Service Provider <SortIcon field="name" />
                  </th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Contact</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Vehicle</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">License</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort('rating')}>
                    Rating <SortIcon field="rating" />
                  </th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Trips</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Status</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-400">No drivers found</td></tr>
                ) : filtered.map((d, i) => (
                  <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors" data-testid={`driver-row-${i}`}>
                    <td className="py-3 px-3"><input type="checkbox" className="rounded border-gray-300" /></td>
                    <td className="py-3 px-3">
                      <span className="text-sm text-blue-600 hover:underline cursor-pointer font-medium">{d.user?.name || 'Unknown'}</span>
                    </td>
                    <td className="py-3 px-3 text-sm text-gray-600">{d.user?.email || '-'}</td>
                    <td className="py-3 px-3">
                      <div>
                        <p className="text-sm text-gray-700 capitalize">{d.vehicle_type || '-'}</p>
                        <p className="text-xs text-gray-400">{d.vehicle_number || ''}</p>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-sm text-gray-600 font-mono">{d.license_number || '-'}</td>
                    <td className="py-3 px-3 text-sm text-gray-700 font-medium">{(d.rating || 0).toFixed(1)}</td>
                    <td className="py-3 px-3 text-sm text-gray-700">{d.total_trips || 0}</td>
                    <td className="py-3 px-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        d.status === 'approved' ? 'bg-green-100 text-green-700' :
                        d.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>{d.status}</span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        {d.status === 'pending' && (
                          <>
                            <button onClick={() => approveDriver(d.id)} className="w-7 h-7 rounded bg-green-50 hover:bg-green-100 flex items-center justify-center text-green-600 transition-colors" data-testid={`approve-${i}`} title="Approve">
                              <Check size={14} weight="bold" />
                            </button>
                            <button onClick={() => rejectDriver(d.id)} className="w-7 h-7 rounded bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 transition-colors" data-testid={`reject-${i}`} title="Reject">
                              <X size={14} weight="bold" />
                            </button>
                          </>
                        )}
                        <button className="w-7 h-7 rounded bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors" data-testid={`view-${i}`} title="View Details">
                          <Gear size={14} />
                        </button>
                      </div>
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

export default AdminDrivers;
