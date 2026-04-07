import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { CaretUp, CaretDown, Eye } from '@phosphor-icons/react';

const datePresets = [
  { label: 'Today', key: 'today' }, { label: 'Yesterday', key: 'yesterday' },
  { label: 'Current Week', key: 'week' }, { label: 'Previous Week', key: 'prev_week' },
  { label: 'Current Month', key: 'month' }, { label: 'Previous Month', key: 'prev_month' },
  { label: 'Current Year', key: 'year' }, { label: 'Previous Year', key: 'prev_year' },
];

const statusConfig = {
  pending: { label: 'Pending', cls: 'bg-yellow-100 text-yellow-700' },
  accepted: { label: 'Accepted', cls: 'bg-blue-100 text-blue-700' },
  arriving: { label: 'Arriving', cls: 'bg-cyan-100 text-cyan-700' },
  in_progress: { label: 'In Progress', cls: 'bg-indigo-100 text-indigo-700' },
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-700' },
};

const AdminRides = () => {
  const [rides, setRides] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [tripNumber, setTripNumber] = useState('');
  const [activeDatePreset, setActiveDatePreset] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => { loadRides(); }, []);

  const loadRides = async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (statusFilter) params.status = statusFilter;
      const r = await adminAPI.listRides(params);
      setRides(r.data.rides); setTotal(r.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSearch = () => { loadRides(); };
  const handleReset = () => { setStatusFilter(''); setTripNumber(''); setActiveDatePreset(''); setFromDate(''); setToDate(''); loadRides(); };

  const handleDatePreset = (key) => {
    setActiveDatePreset(key);
    // Client-side date filtering is handled in the filtered array below
  };

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

  let filtered = rides;
  if (tripNumber) {
    filtered = filtered.filter(r => (r.booking_no || r.id || '').toString().includes(tripNumber));
  }

  // Date preset filtering
  if (activeDatePreset) {
    const now = new Date();
    let start, end;
    if (activeDatePreset === 'today') { start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); end = new Date(start); end.setDate(end.getDate() + 1); }
    else if (activeDatePreset === 'yesterday') { end = new Date(now.getFullYear(), now.getMonth(), now.getDate()); start = new Date(end); start.setDate(start.getDate() - 1); }
    else if (activeDatePreset === 'week') { start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0,0,0,0); end = new Date(now); end.setDate(end.getDate() + 1); }
    if (start) filtered = filtered.filter(r => { const d = new Date(r.created_at); return d >= start && d < end; });
  }

  return (
    <div className="p-6" data-testid="admin-rides-page">
      <h1 className="text-3xl font-light text-gray-800 mb-1" style={{ fontFamily: 'Georgia, Times, serif' }}>Trips / Jobs</h1>
      <hr className="border-gray-200 mb-4" />

      {/* Search label */}
      <p className="text-gray-600 text-sm font-medium mb-3">Search Trips/Jobs ...</p>

      {/* Date Presets */}
      <div className="flex flex-wrap items-center gap-1 mb-4">
        {datePresets.map((p, i) => (
          <React.Fragment key={p.key}>
            <button onClick={() => handleDatePreset(p.key)}
              className={`text-sm transition-colors ${activeDatePreset === p.key ? 'text-blue-700 font-bold' : 'text-[#17a2b8] hover:text-blue-700'}`}>
              {p.label}
            </button>
            {i < datePresets.length - 1 && <span className="text-gray-300 mx-1">|</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Filter Row 1 */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex flex-col">
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-600 outline-none w-40" placeholder="From Date" data-testid="from-date" />
        </div>
        <div className="flex flex-col">
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-600 outline-none w-40" placeholder="To Date" data-testid="to-date" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none" data-testid="status-filter">
          <option value="">All Status</option>
          {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input value={tripNumber} onChange={e => setTripNumber(e.target.value)} placeholder="Trip/Job Number"
          className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none w-40" data-testid="trip-number" />
      </div>

      {/* Filter Row 2 */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none">
          <option>Select Service Provider</option>
        </select>
        <select className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none">
          <option>Select User</option>
        </select>
        <select className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none">
          <option>Service Type</option>
          <option value="taxi">Taxi</option>
          <option value="parcel">Parcel</option>
        </select>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={handleSearch} className="border border-gray-300 rounded px-5 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="search-btn">SEARCH</button>
        <button onClick={handleReset} className="border border-gray-300 rounded px-5 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="reset-btn">RESET</button>
        <button className="border border-gray-300 rounded px-5 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="export-btn">EXPORT</button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" data-testid="rides-table">
              <thead>
                <tr className="border-t border-b border-gray-200 bg-white">
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Booked By</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Booking No</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Address</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort('created_at')}>
                    Trip/Job Date <SortIcon field="created_at" />
                  </th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Service Provider</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort('fare')}>
                    Fare <SortIcon field="fare" />
                  </th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Type</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Status</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">View Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-400">No trips/jobs found</td></tr>
                ) : filtered.map((ride, i) => {
                  const s = statusConfig[ride.status] || statusConfig.pending;
                  return (
                    <tr key={ride.id || i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors" data-testid={`ride-row-${i}`}>
                      <td className="py-3 px-3 text-sm text-gray-600">User</td>
                      <td className="py-3 px-3 text-sm text-gray-700 font-mono">{ride.booking_no || ride.id?.slice(0, 10) || '-'}</td>
                      <td className="py-3 px-3 text-sm text-gray-600 max-w-[200px]">
                        <p className="truncate">{ride.pickup_address || 'N/A'}</p>
                      </td>
                      <td className="py-3 px-3 text-sm text-gray-600">
                        {ride.created_at ? new Date(ride.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-sm text-blue-600 hover:underline cursor-pointer">{ride.driver_name || '-'}</span>
                      </td>
                      <td className="py-3 px-3 text-sm text-gray-700 font-medium">${(ride.final_fare || ride.estimated_fare || 0).toFixed(2)}</td>
                      <td className="py-3 px-3 text-sm text-gray-600 capitalize">{ride.vehicle_type || 'Taxi'}</td>
                      <td className="py-3 px-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${s.cls}`}>{s.label}</span>
                      </td>
                      <td className="py-3 px-3">
                        <button className="bg-[#3b82f6] text-white text-xs px-3 py-1 rounded hover:bg-blue-600 flex items-center gap-1" data-testid={`view-ride-${i}`}>
                          <Eye size={12} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500 mt-4" data-testid="pagination-info">Showing 1 to {filtered.length} of {total} entries</p>
        </>
      )}
    </div>
  );
};

export default AdminRides;
