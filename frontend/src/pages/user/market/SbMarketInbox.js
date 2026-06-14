/**
 * SbMarketInbox — inbox unifiée des conversations SB Market (acheteur↔vendeur).
 * Réutilise marketplaceAPI.myThreads() (marketplace + immobilier) et rouvre le
 * chat via MarketChatPanel. Temps réel WS + badge non-lus.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, MessageCircle } from 'lucide-react';
import { marketplaceAPI } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { useWebSocket } from '../../../hooks/useWebSocket';
import MarketChatPanel from './MarketChatPanel';

const FONT = "font-['Manrope']";

const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
};

const SbMarketInbox = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { on } = useWebSocket(user?.id);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  const load = useCallback(() => {
    marketplaceAPI.myThreads()
      .then((r) => setThreads(r.data?.threads || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!on) return undefined;
    return on('marketplace_message', () => load());
  }, [on, load]);

  const closeChat = () => { setActive(null); load(); };

  return (
    <div className={`min-h-screen bg-slate-50 max-w-md mx-auto w-full text-slate-900 ${FONT}`} data-testid="sb-market-inbox">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-slate-100 flex items-center gap-3">
        <button onClick={() => navigate('/sb-market')} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0" data-testid="inbox-back-btn">
          <ChevronLeft size={20} className="text-slate-700" />
        </button>
        <h1 className="text-lg font-extrabold tracking-tight text-slate-900">Mes conversations</h1>
      </header>

      {loading ? (
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-4">
              <div className="w-12 h-12 rounded-xl bg-slate-100 animate-pulse" />
              <div className="flex-1 space-y-2"><div className="h-3 w-1/2 bg-slate-100 rounded animate-pulse" /><div className="h-3 w-3/4 bg-slate-100 rounded animate-pulse" /></div>
            </div>
          ))}
        </div>
      ) : threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center" data-testid="inbox-empty">
          <MessageCircle className="w-16 h-16 text-slate-300 mb-4" />
          <p className="text-lg font-bold text-slate-900 mb-2">Aucune conversation</p>
          <p className="text-sm text-slate-500 mb-6 max-w-xs">Contactez un vendeur depuis une annonce pour démarrer une discussion.</p>
          <button onClick={() => navigate('/sb-market')} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm" data-testid="inbox-browse-btn">
            Parcourir les annonces
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100" data-testid="inbox-thread-list">
          {threads.map((t) => {
            const other = user?.id === t.buyer_id ? t.seller_name : t.buyer_name;
            return (
              <button key={t.id} onClick={() => setActive(t)} data-testid={`inbox-thread-${t.id}`}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-white transition-colors active:bg-slate-100">
                <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                  {t.listing_image
                    ? <img src={t.listing_image} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-slate-300"><MessageCircle size={20} /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900 truncate">{other || 'Vendeur'}</p>
                    <span className="text-[11px] text-slate-400 shrink-0">{fmtTime(t.last_message_at)}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{t.listing_title}</p>
                  <p className={`text-xs truncate mt-0.5 ${t.unread > 0 ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
                    {t.last_message || 'Nouvelle conversation'}
                  </p>
                </div>
                {t.unread > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0" data-testid={`inbox-unread-${t.id}`}>
                    {t.unread > 9 ? '9+' : t.unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {active && (
        <MarketChatPanel
          open={!!active}
          onClose={closeChat}
          listingId={active.listing_id}
          itemType={active.item_type || 'marketplace'}
          listing={{ title: active.listing_title, image: active.listing_image }}
        />
      )}
    </div>
  );
};

export default SbMarketInbox;
