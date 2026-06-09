import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Headset, Robot, UserCircle, PaperPlaneTilt, CheckCircle, ArrowLeft } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
const ROLE_BADGE = {
  client: 'bg-blue-100 text-blue-700',
  chauffeur: 'bg-green-100 text-green-700',
  marchand: 'bg-orange-100 text-orange-700',
};

const AdminLiveSupport = () => {
  const [threads, setThreads] = useState([]);
  const [filter, setFilter] = useState('escalated');
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const loadThreads = useCallback(async () => {
    try {
      const q = filter === 'all' ? '' : `?status=${filter}`;
      const res = await fetch(`${API}/api/support/admin/threads${q}`, { credentials: 'include' });
      if (res.ok) setThreads(await res.json());
    } catch { /* noop */ }
  }, [filter]);

  const loadMessages = useCallback(async (id) => {
    try {
      const res = await fetch(`${API}/api/support/admin/threads/${id}`, { credentials: 'include' });
      if (res.ok) { const d = await res.json(); setMessages(d.messages || []); }
    } catch { /* noop */ }
  }, []);

  useEffect(() => { loadThreads(); const t = setInterval(loadThreads, 6000); return () => clearInterval(t); }, [loadThreads]);
  useEffect(() => {
    if (!active) return;
    loadMessages(active);
    const t = setInterval(() => loadMessages(active), 5000);
    return () => clearInterval(t);
  }, [active, loadMessages]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true); setReply('');
    try {
      const res = await fetch(`${API}/api/support/admin/threads/${active}/reply`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) { await loadMessages(active); loadThreads(); }
      else toast.error('Échec de l\'envoi');
    } catch { toast.error('Erreur réseau'); }
    finally { setSending(false); }
  };

  const closeThread = async () => {
    await fetch(`${API}/api/support/admin/threads/${active}/close`, { method: 'POST', credentials: 'include' });
    toast.success('Conversation clôturée'); setActive(null); loadThreads();
  };

  const activeThread = threads.find((t) => t.id === active);

  return (
    <div className="p-6" data-testid="admin-live-support">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-1">
        <Headset size={24} weight="fill" className="text-blue-500" /> Support — Parler en direct
      </h1>
      <p className="text-sm text-gray-500 mb-4">Conversations clients, chauffeurs et marchands (IA + escalade vers conseiller).</p>

      <div className="flex gap-2 mb-4">
        {[{ k: 'escalated', l: 'À traiter' }, { k: 'ai', l: 'Avec IA' }, { k: 'closed', l: 'Clôturées' }, { k: 'all', l: 'Toutes' }].map((f) => (
          <button key={f.k} onClick={() => { setFilter(f.k); setActive(null); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium ${filter === f.k ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}
            data-testid={`support-filter-${f.k}`}>{f.l}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ minHeight: '70vh' }}>
        <div className={`bg-white border border-gray-200 rounded-xl overflow-hidden ${active ? 'hidden md:block' : ''}`}>
          <div className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
            {threads.length === 0 && <div className="p-6 text-sm text-gray-400">Aucune conversation.</div>}
            {threads.map((t) => (
              <button key={t.id} onClick={() => setActive(t.id)}
                className={`w-full text-left p-4 hover:bg-gray-50 ${active === t.id ? 'bg-blue-50' : ''}`}
                data-testid={`support-thread-${t.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900 truncate">{t.user_name}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ROLE_BADGE[t.user_role] || 'bg-gray-100 text-gray-600'}`}>{t.user_role}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{t.last_preview || '—'}</p>
                <div className="flex items-center gap-2 mt-1">
                  {t.status === 'escalated' && <span className="text-[10px] text-blue-600 font-semibold flex items-center gap-0.5"><Headset size={11} weight="fill" /> Humain</span>}
                  {t.status === 'ai' && <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5"><Robot size={11} weight="fill" /> IA</span>}
                  {t.status === 'closed' && <span className="text-[10px] text-gray-400">Clôturée</span>}
                  {t.unread_admin > 0 && <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5">{t.unread_admin}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={`md:col-span-2 bg-white border border-gray-200 rounded-xl flex flex-col ${active ? '' : 'hidden md:flex'}`}>
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Sélectionnez une conversation</div>
          ) : (
            <>
              <div className="p-3 border-b border-gray-100 flex items-center gap-3">
                <button onClick={() => setActive(null)} className="md:hidden text-gray-500"><ArrowLeft size={20} /></button>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{activeThread?.user_name}</p>
                  <p className="text-xs text-gray-400">{activeThread?.user_phone || activeThread?.user_role}</p>
                </div>
                <button onClick={closeThread} className="text-xs font-semibold text-gray-500 hover:text-red-500 flex items-center gap-1" data-testid="close-thread-btn">
                  <CheckCircle size={15} /> Clôturer
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[55vh]">
                {messages.map((m) => {
                  const isUser = m.sender === 'user';
                  return (
                    <div key={m.id} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
                      <div className="max-w-[75%]">
                        <div className="flex items-center gap-1 mb-0.5 text-[10px] text-gray-400 font-semibold">
                          {m.sender === 'user' && <><UserCircle size={12} weight="fill" /> Utilisateur</>}
                          {m.sender === 'ai' && <><Robot size={12} weight="fill" className="text-emerald-500" /> Assistant IA</>}
                          {m.sender === 'agent' && <><Headset size={12} weight="fill" className="text-blue-500" /> Vous</>}
                        </div>
                        <div className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${isUser ? 'bg-gray-100 text-gray-900' : m.sender === 'agent' ? 'bg-blue-500 text-white' : 'bg-emerald-50 text-gray-800'}`}>
                          {m.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <div className="p-3 border-t border-gray-100 flex items-center gap-2">
                <input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                  placeholder="Répondre en tant que conseiller…" className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm outline-none" data-testid="admin-reply-input" />
                <button onClick={sendReply} disabled={!reply.trim() || sending} className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center disabled:opacity-40" data-testid="admin-reply-send">
                  <PaperPlaneTilt size={18} weight="fill" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLiveSupport;
