import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { Headset, Clock, CheckCircle, ChatCircle, PaperPlane } from '@phosphor-icons/react';

const AdminSupport = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
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
      setReply('');
      loadTickets();
    } catch (e) { console.error(e); }
    finally { setSending(false); }
  };

  return (
    <div className="p-5 lg:p-6 space-y-5" data-testid="admin-support-page">
      <div>
        <h1 className="text-2xl font-bold text-white">Support</h1>
        <p className="text-gray-500 text-sm">{tickets.length} ticket(s)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: '60vh' }}>
        {/* Ticket List */}
        <div className="lg:col-span-1 space-y-2 overflow-y-auto max-h-[70vh]">
          {loading ? (
            <div className="text-center py-12"><div className="w-8 h-8 border-2 border-[#FF4500]/30 border-t-[#FF4500] rounded-full animate-spin mx-auto" /></div>
          ) : tickets.length === 0 ? (
            <div className="bg-[#161923] border border-gray-800 rounded-xl p-8 text-center">
              <Headset size={36} className="text-gray-700 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Aucun ticket</p>
            </div>
          ) : tickets.map((t, i) => (
            <button key={t.id} onClick={() => setSelected(t)}
              className={`w-full text-left bg-[#161923] border rounded-xl p-4 transition-all ${
                selected?.id === t.id ? 'border-[#FF4500]' : 'border-gray-800 hover:border-gray-700'}`}
              data-testid={`ticket-${i}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  t.status === 'open' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                  {t.status === 'open' ? 'Ouvert' : 'Ferme'}
                </span>
                <span className="text-gray-600 text-[10px]">{t.created_at ? new Date(t.created_at).toLocaleDateString('fr-FR') : ''}</span>
              </div>
              <p className="text-white text-sm font-medium truncate">{t.subject}</p>
              <p className="text-gray-500 text-xs truncate mt-0.5">{t.message}</p>
            </button>
          ))}
        </div>

        {/* Ticket Detail */}
        <div className="lg:col-span-2 bg-[#161923] border border-gray-800 rounded-xl flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <ChatCircle size={48} className="text-gray-700 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Selectionnez un ticket</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-4 border-b border-gray-800">
                <h3 className="text-white font-semibold">{selected.subject}</h3>
                <p className="text-gray-500 text-xs mt-1">ID: {selected.id} &bull; Utilisateur: {selected.user_id?.slice(0, 12)}</p>
              </div>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[50vh]">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                  <p className="text-blue-400 text-xs font-medium mb-1">Client</p>
                  <p className="text-white text-sm">{selected.message}</p>
                </div>
                {(selected.replies || []).map((r, i) => (
                  <div key={i} className={`rounded-xl p-3 ${
                    r.user_id?.includes('admin') ? 'bg-[#FF4500]/10 border border-[#FF4500]/20 ml-8' : 'bg-blue-500/10 border border-blue-500/20'}`}>
                    <p className={`text-xs font-medium mb-1 ${r.user_id?.includes('admin') ? 'text-[#FF4500]' : 'text-blue-400'}`}>
                      {r.user_id?.includes('admin') ? 'Admin' : 'Client'}
                    </p>
                    <p className="text-white text-sm">{r.message}</p>
                  </div>
                ))}
              </div>
              {/* Reply */}
              <div className="p-3 border-t border-gray-800 flex items-center gap-2">
                <input value={reply} onChange={(e) => setReply(e.target.value)}
                  placeholder="Votre reponse..."
                  className="flex-1 bg-[#0f1117] border border-gray-800 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#FF4500] placeholder:text-gray-600"
                  onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                  data-testid="reply-input" />
                <button onClick={sendReply} disabled={sending || !reply.trim()}
                  className="w-10 h-10 rounded-lg bg-[#FF4500] flex items-center justify-center disabled:opacity-40 transition-colors hover:bg-[#FF6B35]"
                  data-testid="send-reply-btn">
                  <PaperPlane size={16} className="text-white" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminSupport;
