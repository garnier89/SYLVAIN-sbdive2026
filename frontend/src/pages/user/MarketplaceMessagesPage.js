import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, PaperPlaneRight, ChatCircleText } from '@phosphor-icons/react';
import { useAuth } from '../../contexts/AuthContext';
import { marketplaceAPI } from '../../services/api';

const MarketplaceMessagesPage = () => {
  const navigate = useNavigate();
  const { threadId } = useParams();
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [thread, setThread] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  // Thread list (when no thread is open)
  useEffect(() => {
    if (threadId) return undefined;
    let alive = true;
    (async () => {
      try {
        const r = await marketplaceAPI.myThreads();
        if (alive) setThreads(r.data?.threads || []);
      } catch { /* ignore */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [threadId]);

  // Open thread: load + poll messages
  useEffect(() => {
    if (!threadId) return undefined;
    let alive = true;
    const fetchMsgs = async () => {
      try {
        const r = await marketplaceAPI.threadMessages(threadId);
        if (!alive) return;
        setMessages(r.data?.messages || []);
        setThread(r.data?.thread || null);
      } catch { /* ignore */ }
      finally { if (alive) setLoading(false); }
    };
    fetchMsgs();
    const iv = setInterval(fetchMsgs, 4000);
    return () => { alive = false; clearInterval(iv); };
  }, [threadId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    setText('');
    try {
      const r = await marketplaceAPI.sendMessage(threadId, t);
      setMessages((prev) => [...prev, r.data]);
    } catch { setText(t); }
    finally { setSending(false); }
  };

  // ===== Thread view =====
  if (threadId) {
    const otherName = thread ? (user?.id === thread.buyer_id ? thread.seller_name : thread.buyer_name) : '';
    return (
      <div className="mobile-container h-[100dvh] flex flex-col bg-gray-50" data-testid="marketplace-thread-page">
        <div className="bg-white border-b px-4 py-3 flex items-center gap-3 shadow-sm">
          <button onClick={() => navigate('/marketplace/messages')} data-testid="thread-back"><ArrowLeft size={22} /></button>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{otherName || 'Conversation'}</p>
            {thread?.listing_title && <p className="text-xs text-gray-500 truncate">{thread.listing_title}</p>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2" data-testid="thread-messages">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-8">Chargement…</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Démarrez la conversation avec le vendeur.</p>
          ) : messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm ${mine ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-gray-800 border rounded-bl-sm'}`}>
                  {m.text}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        <div className="bg-white border-t p-3 flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Votre message…"
            className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 text-sm outline-none"
            data-testid="thread-input"
          />
          <button onClick={send} disabled={sending || !text.trim()} className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center disabled:opacity-40" data-testid="thread-send">
            <PaperPlaneRight size={18} weight="fill" />
          </button>
        </div>
      </div>
    );
  }

  // ===== Thread list =====
  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-20" data-testid="marketplace-messages-page">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10">
        <button onClick={() => navigate('/marketplace')} data-testid="messages-back"><ArrowLeft size={22} /></button>
        <h1 className="text-base font-bold text-gray-900">Mes messages</h1>
      </div>
      {loading ? (
        <p className="text-center text-sm text-gray-400 py-12">Chargement…</p>
      ) : threads.length === 0 ? (
        <div className="text-center text-gray-400 py-16" data-testid="messages-empty">
          <ChatCircleText size={36} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Aucune conversation.</p>
        </div>
      ) : (
        <div className="p-3 space-y-2" data-testid="threads-list">
          {threads.map((t) => {
            const otherName = user?.id === t.buyer_id ? t.seller_name : t.buyer_name;
            return (
              <button key={t.id} onClick={() => navigate(`/marketplace/messages/${t.id}`)} className="w-full bg-white rounded-2xl p-3 flex items-center gap-3 text-left shadow-sm" data-testid={`thread-${t.id}`}>
                {t.listing_image ? <img src={t.listing_image} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" /> : <div className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 truncate">{otherName}</p>
                  <p className="text-xs text-gray-400 truncate">{t.listing_title}</p>
                  {t.last_message && <p className="text-xs text-gray-500 truncate mt-0.5">{t.last_message}</p>}
                </div>
                {t.unread > 0 && <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">{t.unread}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MarketplaceMessagesPage;
