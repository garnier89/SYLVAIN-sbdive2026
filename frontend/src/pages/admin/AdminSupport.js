import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { CaretUp, CaretDown, PencilSimple } from '@phosphor-icons/react';

const AdminSupport = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('providers');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { loadTickets(); }, []);

  const loadTickets = async () => {
    try { const r = await adminAPI.listTickets(); setTickets(r.data || []); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    setSending(true);
    try {
      await adminAPI.replyTicket(selected.id, reply.trim());
      setReply(''); setSelected(null); loadTickets();
    } catch (e) { console.error(e); }
    finally { setSending(false); }
  };

  const handleReset = () => { setSearch(''); };

  let filtered = tickets;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(t => (t.subject || '').toLowerCase().includes(q) || (t.message || '').toLowerCase().includes(q));
  }

  return (
    <div className="p-6" data-testid="admin-support-page">
      <h1 className="text-3xl font-light text-gray-800 mb-1" style={{ fontFamily: 'Georgia, Times, serif' }}>Trips / Jobs Reviews</h1>
      <hr className="border-gray-200 mb-5" />

      {/* Search */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <span className="font-bold text-gray-700 text-sm">Search:</span>
        <select className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none">
          <option>All</option>
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder=""
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48 outline-none focus:border-blue-400" data-testid="search-input" />
        <button className="border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="search-btn">SEARCH</button>
        <button onClick={handleReset} className="border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="reset-btn">RESET</button>
        <button className="border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="export-btn">EXPORT</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-5">
        <button onClick={() => setTab('providers')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'providers' ? 'border-gray-800 text-gray-800' : 'border-transparent text-[#17a2b8] hover:text-gray-800'}`}
          data-testid="tab-providers">
          Service Providers
        </button>
        <button onClick={() => setTab('users')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'users' ? 'border-gray-800 text-gray-800' : 'border-transparent text-[#17a2b8] hover:text-gray-800'}`}
          data-testid="tab-users">
          Users
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" data-testid="reviews-table">
              <thead>
                <tr className="border-t border-b border-gray-200 bg-white">
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Ride/Job Number</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Service Provider Name</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Rating By (User Name)</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Rating</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Date</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Comment</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">No reviews found</td></tr>
                ) : filtered.map((t, i) => (
                  <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors" data-testid={`review-row-${i}`}>
                    <td className="py-3 px-3">
                      <span className="text-sm text-blue-600 hover:underline cursor-pointer">{t.related_id || t.id?.slice(0, 10)}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-sm text-blue-600 hover:underline cursor-pointer">{t.subject || 'Service Provider'}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-sm text-blue-600 hover:underline cursor-pointer">{t.user_id?.slice(0, 12) || 'User'}</span>
                    </td>
                    <td className="py-3 px-3 text-sm text-gray-700 font-medium">5.0</td>
                    <td className="py-3 px-3 text-sm text-gray-600">
                      {t.created_at ? new Date(t.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                    </td>
                    <td className="py-3 px-3 text-sm text-gray-600 max-w-[200px] truncate">{t.message || '-'}</td>
                    <td className="py-3 px-3">
                      <button onClick={() => setSelected(t)}
                        className="w-8 h-8 rounded-full bg-[#5bc0de] hover:bg-[#46b8da] flex items-center justify-center text-white transition-colors" data-testid={`edit-review-${i}`}>
                        <PencilSimple size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500 mt-4">Showing 1 to {filtered.length} of {filtered.length} entries</p>
        </>
      )}

      {/* Reply Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()} data-testid="reply-modal">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Reply to: {selected.subject}</h3>
            <p className="text-sm text-gray-500 mb-3">{selected.message}</p>
            {(selected.replies || []).map((r, i) => (
              <div key={r.message || `reply-${i}`} className="bg-gray-50 rounded p-2 mb-2 text-sm text-gray-700">{r.message}</div>
            ))}
            <textarea value={reply} onChange={e => setReply(e.target.value)} rows={3} placeholder="Your reply..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-400 mb-3" data-testid="reply-input" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</button>
              <button onClick={sendReply} disabled={sending || !reply.trim()}
                className="px-4 py-2 bg-[#3b82f6] text-white rounded text-sm font-bold disabled:opacity-50" data-testid="send-reply-btn">
                {sending ? 'Sending...' : 'Send Reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSupport;
