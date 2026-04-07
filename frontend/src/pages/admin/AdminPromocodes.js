import React, { useState, useEffect } from 'react';
import { couponAPI } from '../../services/api';
import { Gear, CaretUp, CaretDown } from '@phosphor-icons/react';

const AdminPromocodes = () => {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => { loadCodes(); }, []);

  const loadCodes = async () => {
    try {
      const r = await couponAPI.adminList();
      setCodes(r.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleReset = () => { setSearch(''); setStatusFilter(''); };

  let filtered = codes;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(c => (c.code || '').toLowerCase().includes(q));
  }

  return (
    <div className="p-6" data-testid="admin-promocodes">
      <h1 className="text-3xl font-light text-gray-800 mb-1" style={{ fontFamily: 'Georgia, Times, serif' }}>PromoCode</h1>
      <hr className="border-gray-200 mb-5" />

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="font-bold text-gray-700 text-sm">Search:</span>
        <select className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none">
          <option>All</option>
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder=""
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48 outline-none focus:border-blue-400" data-testid="search-input" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none">
          <option value="">Select Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className="border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="search-btn">SEARCH</button>
        <button onClick={handleReset} className="border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="reset-btn">RESET</button>
        <button className="ml-auto bg-[#17a2b8] text-white px-4 py-2 rounded text-sm font-bold hover:bg-[#138496] transition-colors" data-testid="add-promo-btn">
          ADD PROMO CODE
        </button>
      </div>

      {/* Bulk action & Export */}
      <div className="flex items-center gap-3 mb-4">
        <select className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none">
          <option>Select Action</option>
          <option>Activate</option>
          <option>Deactivate</option>
          <option>Delete</option>
        </select>
        <button className="ml-auto border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="export-btn">EXPORT</button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" data-testid="promo-table">
              <thead>
                <tr className="border-t border-b border-gray-200 bg-white">
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700"><input type="checkbox" className="rounded border-gray-300" /></th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Promo Code</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Discount</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Validity</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Promocode Type</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Expiry Date</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Usage Limit</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Used</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">System Type</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Status</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-12 text-gray-400">No promo codes found</td></tr>
                ) : filtered.map((c, i) => (
                  <tr key={c.id || i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors" data-testid={`promo-row-${i}`}>
                    <td className="py-3 px-3"><input type="checkbox" className="rounded border-gray-300" /></td>
                    <td className="py-3 px-3 text-sm text-gray-800 font-mono font-medium">{c.code}</td>
                    <td className="py-3 px-3 text-sm text-gray-700">{c.discount_percent || c.discount || 0}%</td>
                    <td className="py-3 px-3 text-sm text-gray-600">{c.validity || 'Permanent'}</td>
                    <td className="py-3 px-3 text-sm text-gray-600">{c.type || 'Public'}</td>
                    <td className="py-3 px-3 text-sm text-gray-600">{c.expiry_date || '-'}</td>
                    <td className="py-3 px-3 text-sm text-gray-700">{c.max_uses || 'Unlimited'}</td>
                    <td className="py-3 px-3">
                      <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded">{c.current_uses || 0}</span>
                    </td>
                    <td className="py-3 px-3 text-sm text-gray-600">{c.system_type || 'General'}</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center justify-center w-6 h-6">
                        <svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="#d4edda" stroke="#28a745" strokeWidth="1.5"/><path d="M6 11l3 3 6-6" stroke="#28a745" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <button className="text-gray-400 hover:text-gray-600 transition-colors" data-testid={`promo-action-${i}`}>
                        <Gear size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500 mt-4">Showing 1 to {filtered.length} of {filtered.length} entries</p>

          {/* Notes */}
          <div className="mt-6 border border-gray-200 rounded p-4 bg-gray-50">
            <p className="font-bold text-gray-800 text-sm mb-2">Notes:</p>
            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
              <li>Coupon module will list all coupons on this page.</li>
              <li>Administrator can Activate / Deactivate / Delete any coupon.</li>
              <li>Administrator can export data in XLS format.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminPromocodes;
