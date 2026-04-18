import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, PaperPlaneTilt, User } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * RideChatPage — chat entre passager et chauffeur pour une course (ride_id)
 * Utilise WebSocket + polling de secours.
 */
const RideChatPage = () => {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [me, setMe] = useState(null);
  const scrollRef = useRef(null);
  const wsRef = useRef(null);

  const fetchMe = useCallback(async () => {
    const r = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
    if (r.ok) setMe(await r.json());
  }, []);

  const fetchMessages = useCallback(async () => {
    const r = await fetch(`${API}/api/phase1/rides/${rideId}/messages`, { credentials: 'include' });
    if (r.ok) setMessages(await r.json());
  }, [rideId]);

  useEffect(() => { fetchMe(); fetchMessages(); }, [fetchMe, fetchMessages]);

  // WebSocket connection
  useEffect(() => {
    if (!me) return;
    const wsBase = API.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/ws/ride/${rideId}/${me.id}`);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'chat_message' && data.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        }
      } catch { /* ignore */ }
    };
    wsRef.current = ws;
    return () => ws.close();
  }, [me, rideId]);

  // Polling fallback every 5s
  useEffect(() => {
    const id = setInterval(fetchMessages, 5000);
    return () => clearInterval(id);
  }, [fetchMessages]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim()) return;
    try {
      const r = await fetch(`${API}/api/phase1/rides/${rideId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ text: input.trim() }),
      });
      if (!r.ok) throw new Error('send failed');
      const m = await r.json();
      setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
      setInput('');
    } catch { toast.error('Echec d envoi'); }
  };

  return (
    <div className="mobile-container min-h-screen bg-[#F2F2F7] flex flex-col" data-testid="ride-chat-page">
      <div className="bg-white px-4 py-3 flex items-center gap-3 border-b border-gray-200 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center" data-testid="chat-back">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <p className="font-bold text-gray-800">Discussion course</p>
          <p className="text-[11px] text-gray-500">Course #{rideId.slice(-6)}</p>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2" data-testid="chat-scroll">
        {messages.length === 0 && <p className="text-center text-gray-400 text-sm py-8">Aucun message. Dites bonjour !</p>}
        {messages.map((m) => {
          const mine = me && m.sender_id === me.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`} data-testid={`msg-${m.id}`}>
              <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl ${mine ? 'bg-[#FF4500] text-white rounded-br-sm' : 'bg-white text-gray-800 rounded-bl-sm shadow-sm'}`}>
                {!mine && <p className="text-[10px] font-bold text-gray-500 mb-0.5">{m.sender_name}</p>}
                <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>
                <p className={`text-[9px] mt-1 ${mine ? 'text-orange-100' : 'text-gray-400'}`}>
                  {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="p-3 bg-white border-t border-gray-200 flex items-center gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Votre message..." className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-sm outline-none focus:bg-white focus:ring-2 focus:ring-orange-500/30"
          data-testid="chat-input" />
        <button onClick={send} className="w-10 h-10 rounded-full bg-[#FF4500] flex items-center justify-center" data-testid="chat-send">
          <PaperPlaneTilt size={18} className="text-white" weight="fill" />
        </button>
      </div>
    </div>
  );
};

export default RideChatPage;
