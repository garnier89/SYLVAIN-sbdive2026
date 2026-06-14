/**
 * MarketChatPanel — messagerie acheteur↔vendeur intégrée au hub SB Market.
 * Réutilise l'infra de threads marketplace (généralisée immobilier + marketplace).
 * Temps réel via WebSocket (event 'marketplace_message') + filet de sécurité poll 5s.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { marketplaceAPI } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { useWebSocket } from '../../../hooks/useWebSocket';

const FONT = "font-['Manrope']";

const MarketChatPanel = ({ open, onClose, listingId, itemType, listing }) => {
  const { user } = useAuth();
  const { on } = useWebSocket(user?.id);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const threadRef = useRef(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }, []);

  // Ouverture : crée/récupère le thread + charge les messages.
  useEffect(() => {
    if (!open || !listingId) return undefined;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const tr = await marketplaceAPI.startThread(listingId, itemType);
        if (!alive) return;
        const th = tr.data;
        setThread(th);
        threadRef.current = th.id;
        const mr = await marketplaceAPI.threadMessages(th.id);
        if (!alive) return;
        setMessages(mr.data?.messages || []);
        scrollToEnd();
      } catch (e) {
        if (alive) toast.error(e?.response?.data?.detail || 'Conversation indisponible');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; threadRef.current = null; };
  }, [open, listingId, itemType, scrollToEnd]);

  // Temps réel WS + filet poll 5s.
  useEffect(() => {
    if (!open || !thread?.id) return undefined;
    const off = on('marketplace_message', (data) => {
      if (data.thread_id !== thread.id || !data.message) return;
      setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
      if (data.message.sender_id !== user?.id) marketplaceAPI.markThreadRead(thread.id).catch(() => {});
      scrollToEnd();
    });
    const iv = setInterval(async () => {
      try {
        const mr = await marketplaceAPI.threadMessages(thread.id);
        setMessages((prev) => {
          const incoming = mr.data?.messages || [];
          return incoming.length !== prev.length ? incoming : prev;
        });
      } catch { /* ignore */ }
    }, 5000);
    return () => { off(); clearInterval(iv); };
  }, [open, thread?.id, on, user?.id, scrollToEnd]);

  const send = async () => {
    const t = text.trim();
    if (!t || !thread?.id || sending) return;
    setSending(true);
    setText('');
    try {
      const r = await marketplaceAPI.sendMessage(thread.id, t);
      setMessages((prev) => (prev.some((m) => m.id === r.data.id) ? prev : [...prev, r.data]));
      scrollToEnd();
    } catch (e) {
      toast.error('Message non envoyé');
      setText(t);
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[3200] bg-black/40 flex items-end" onClick={onClose} data-testid="market-chat-panel"
        >
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md mx-auto bg-slate-50 rounded-t-3xl flex flex-col h-[85vh] ${FONT}`}
          >
            {/* En-tête */}
            <div className="flex items-center gap-3 p-4 border-b border-slate-100 bg-white rounded-t-3xl">
              <div className="w-11 h-11 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                {listing?.image
                  ? <img src={listing.image} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-slate-300"><MessageCircle size={20} /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{thread?.seller_name || 'Vendeur'}</p>
                <p className="text-xs text-slate-500 truncate">{listing?.title || thread?.listing_title}</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center" data-testid="market-chat-close">
                <X size={16} className="text-slate-600" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" data-testid="market-chat-messages">
              {loading ? (
                <div className="flex items-center justify-center h-full text-sm text-slate-400">Chargement…</div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <MessageCircle className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="text-sm font-semibold text-slate-700">Démarrez la conversation</p>
                  <p className="text-xs text-slate-500 mt-1">Posez une question, négociez le prix ou planifiez une visite.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const mine = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-sm ${mine ? 'bg-rose-500 text-white rounded-br-md' : 'bg-white text-slate-800 border border-slate-100 rounded-bl-md'}`}>
                        {m.text}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>

            {/* Saisie */}
            <div className="p-3 border-t border-slate-100 bg-white flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                placeholder="Votre message…"
                disabled={loading}
                data-testid="market-chat-input"
                className="flex-1 bg-slate-100 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-500"
              />
              <button onClick={send} disabled={sending || !text.trim()} data-testid="market-chat-send"
                className="w-10 h-10 rounded-full bg-rose-500 text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform">
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MarketChatPanel;
