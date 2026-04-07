import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { CaretUp, CaretDown } from '@phosphor-icons/react';

const datePresets = [
  { label: 'Today', key: 'today' }, { label: 'Yesterday', key: 'yesterday' },
  { label: 'Current Week', key: 'week' }, { label: 'Previous Week', key: 'prev_week' },
  { label: 'Current Month', key: 'month' }, { label: 'Previous Month', key: 'prev_month' },
  { label: 'Current Year', key: 'year' }, { label: 'Previous Year', key: 'prev_year' },
];

const AdminRevenue = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeDatePreset, setActiveDatePreset] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => { loadRevenue(); }, []);

  const loadRevenue = async () => {
    try { const r = await adminAPI.revenue(); setData(r.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return (
    <div className="p-6"><div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div></div>
  );

  const transactions = data?.recent_transactions || [];

  return (
    <div className="p-6" data-testid="admin-revenue-page">
      <h1 className="text-3xl font-light text-gray-800 mb-1" style={{ fontFamily: 'Georgia, Times, serif' }}>Service Provider Payment Report (Trips/Jobs)</h1>
      <hr className="border-gray-200 mb-4" />

      {/* Top link */}
      <div className="flex justify-between items-center mb-4">
        <p className="text-gray-600 text-sm font-medium">Search by Date...</p>
        <button className="bg-[#17a2b8] text-white text-sm px-4 py-2 rounded font-bold hover:bg-[#138496] transition-colors" data-testid="cancelled-report-btn">
          View Cancelled Trips/Jobs Payment Report
        </button>
      </div>

      {/* Date Presets */}
      <div className="flex flex-wrap items-center gap-1 mb-4">
        {datePresets.map((p, i) => (
          <React.Fragment key={p.key}>
            <button onClick={() => setActiveDatePreset(p.key)}
              className={`text-sm transition-colors ${activeDatePreset === p.key ? 'text-blue-700 font-bold' : 'text-[#17a2b8] hover:text-blue-700'}`}>
              {p.label}
            </button>
            {i < datePresets.length - 1 && <span className="text-gray-300 mx-1">|</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-600 outline-none w-40" data-testid="from-date" />
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-600 outline-none w-40" data-testid="to-date" />
        <select className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none">
          <option>Select Company</option>
        </select>
        <select className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none">
          <option>Select Service Provider</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none">
          <option>Payment Status - Unsettled</option>
          <option>Payment Status - Settled</option>
        </select>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 mb-5">
        <button className="border border-gray-300 rounded px-5 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="search-btn">SEARCH</button>
        <button className="border border-gray-300 rounded px-5 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="reset-btn">RESET</button>
        <button className="ml-auto border border-gray-300 rounded px-5 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="export-btn">EXPORT</button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Today" total={data?.today?.total || 0} commission={data?.today?.commission || 0} rides={data?.today?.rides || 0} />
        <SummaryCard label="This Week" total={data?.week?.total || 0} commission={data?.week?.commission || 0} rides={data?.week?.rides || 0} />
        <SummaryCard label="This Month" total={data?.month?.total || 0} commission={data?.month?.commission || 0} rides={data?.month?.rides || 0} />
        <SummaryCard label="All Time" total={data?.all_time?.total || 0} commission={data?.all_time?.commission || 0} rides={data?.all_time?.rides || 0} active />
      </div>

      {/* Transactions Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" data-testid="revenue-table">
          <thead>
            <tr className="border-t border-b border-gray-200 bg-white">
              <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Service Provider Name</th>
              <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Total Fare</th>
              <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Total Cash Received</th>
              <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Commission Take From SP</th>
              <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Amount Pay to SP</th>
              <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Total Tax</th>
              <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Final Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">No transactions found</td></tr>
            ) : transactions.map((t, i) => {
              const fare = t.final_fare || t.estimated_fare || 0;
              const commission = fare * ((t.commission_percent || 10) / 100);
              const payout = fare - commission;
              return (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-3">
                    <span className="text-sm text-blue-600 hover:underline cursor-pointer">{t.driver_name || 'Driver'}</span>
                  </td>
                  <td className="py-3 px-3 text-sm text-gray-700">${fare.toFixed(2)}</td>
                  <td className="py-3 px-3 text-sm text-gray-700">${fare.toFixed(2)}</td>
                  <td className="py-3 px-3 text-sm text-gray-700">${commission.toFixed(2)}</td>
                  <td className="py-3 px-3 text-sm text-gray-700">${payout.toFixed(2)}</td>
                  <td className="py-3 px-3 text-sm text-gray-700">$0.00</td>
                  <td className="py-3 px-3 text-sm text-gray-800 font-semibold">${payout.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-gray-500 mt-4">Showing 1 to {transactions.length} of {transactions.length} entries</p>
    </div>
  );
};

const SummaryCard = ({ label, total, commission, rides, active }) => (
  <div className={`rounded-lg border p-4 ${active ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{label}</p>
    <p className="text-xl font-bold text-gray-800">${total.toFixed(2)}</p>
    <div className="flex justify-between mt-2 text-xs text-gray-500">
      <span>Commission: ${commission.toFixed(2)}</span>
      <span>{rides} rides</span>
    </div>
  </div>
);

export default AdminRevenue;
