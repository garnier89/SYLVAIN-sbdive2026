import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, PaperPlaneTilt, Camera, Star, UserCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { rideAPI } from '../services/api';

const API = process.env.REACT_APP_BACKEND_URL;

const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Aujourd'hui";
  if (same(d, yest)) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

// Downscale a selected image to a compact JPEG data URL for chat attachments.
const fileToCompactDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 1200;
      let { width, height } = img;
      if (width > max || height > max) {
        const r = Math.min(max / width, max / height);
        width = Math.round(width * r); height = Math.round(height * r);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = reject;
    img.src = reader.result;
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const RatingStars = ({ value = 5 }) => (
  <div className="flex items-center gap-0.5">
    {[0, 1, 2, 3, 4].map((i) => (
      <Star key={i} size={13} weight={i < Math.round(value) ? 'fill' : 'regular'} className={i < Math.round(value) ? 'text-amber-400' : 'text-white/40'} />
    ))}
  </div>
);

/**
 * RideChatPage — V3Cube ride chat (passenger ↔ driver). Green header with booking
 * number, party card, date separators, text + camera-image messages over WS+REST.
 */
const RideChatPage = () => {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [me, setMe] = useState(null);
  const [ride, setRide] = useState(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);

  // Load identity + ride once, then near-real-time messages via a fast poll.
  // Async work is defined *inside* the effect (no setState-bearing deps).
  useEffect(() => {
    const loadContext = async () => {
      try { const meR = await fetch(`${API}/api/auth/me`, { credentials: 'include' }); if (meR.ok) setMe(await meR.json()); } catch { /* ignore */ }
      try { const r = await rideAPI.get(rideId); setRide(r.data); } catch { /* ignore */ }
    };
    const loadMessages = async () => {
      try { const r = await fetch(`${API}/api/phase1/rides/${rideId}/messages`, { credentials: 'include' }); if (r.ok) setMessages(await r.json()); } catch { /* ignore */ }
    };
    loadContext();
    loadMessages();
    const id = setInterval(loadMessages, 2500);
    return () => clearInterval(id);
  }, [rideId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  const post = useCallback(async (payload) => {
    setSending(true);
    try {
      const r = await fetch(`${API}/api/phase1/rides/${rideId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error('send failed');
      const m = await r.json();
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    } catch { toast.error("Échec de l'envoi"); }
    finally { setSending(false); }
  }, [rideId]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await post({ text });
  };

  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const image = await fileToCompactDataUrl(file);
      await post({ image });
    } catch { toast.error("Image illisible"); }
  };

  const iAmDriver = me && ride && me.role === 'driver';
  const partyName = iAmDriver ? (ride?.passenger_name || 'Passager') : (ride?.driver_name || 'Chauffeur');
  const partyRating = iAmDriver ? (ride?.passenger_rating ?? 5) : (ride?.driver_rating ?? 5);
  const partyAvatar = iAmDriver ? ride?.passenger_avatar : ride?.driver_avatar;
  const rideLabel = ride?.driver_vehicle_model || (ride?.vehicle_type ? ride.vehicle_type.replace(/^./, (c) => c.toUpperCase()) : 'Balade');
  const bookingNo = ride?.booking_no || rideId.slice(-10);

  return (
    <div className="mobile-container min-h-screen bg-[#ECEFF1] flex flex-col" data-testid="ride-chat-page">
      {/* Green header */}
      <div className="bg-[#00B578] text-white sticky top-0 z-10">
        <div className="px-3 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center" data-testid="chat-back">
            <ArrowLeft size={18} weight="bold" />
          </button>
          <p className="font-extrabold tracking-wide" data-testid="chat-booking-no">#{bookingNo}</p>
        </div>
        {/* Party card */}
        <div className="px-4 pb-3 flex items-center gap-3" data-testid="chat-party-card">
          <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center overflow-hidden flex-shrink-0">
            {partyAvatar ? <img src={partyAvatar} alt="" className="w-full h-full object-cover" /> : <UserCircle size={36} weight="fill" className="text-white/80" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate" data-testid="chat-party-name">{partyName}</p>
            <RatingStars value={partyRating} />
          </div>
          <span className="px-3 py-1 rounded-full bg-white/15 text-xs font-semibold" data-testid="chat-ride-label">{rideLabel}</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2" data-testid="chat-scroll">
        {messages.length === 0 && <p className="text-center text-gray-400 text-sm py-8">Aucun message. Dites bonjour !</p>}
        {messages.map((m, idx) => {
          const mine = me && m.sender_id === me.id;
          const day = dayLabel(m.created_at);
          const prevDay = idx > 0 ? dayLabel(messages[idx - 1].created_at) : null;
          const showDay = day !== prevDay;
          return (
            <React.Fragment key={m.id}>
              {showDay && (
                <div className="flex justify-center my-3">
                  <span className="px-3 py-1 rounded-full bg-black/10 text-[11px] font-semibold text-gray-600" data-testid="chat-day-sep">{day}</span>
                </div>
              )}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`} data-testid={`msg-${m.id}`}>
                <div className={`max-w-[78%] px-3 py-2 rounded-2xl ${mine ? 'bg-[#00B578] text-white rounded-br-sm' : 'bg-white text-gray-800 rounded-bl-sm shadow-sm'}`}>
                  {!mine && <p className="text-[10px] font-bold text-gray-400 mb-0.5">{m.sender_name}</p>}
                  {m.image && <img src={m.image} alt="" className="rounded-xl mb-1 max-h-56 w-full object-cover" data-testid="chat-msg-image" />}
                  {m.text && <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>}
                  <p className={`text-[9px] mt-1 text-right ${mine ? 'text-white/70' : 'text-gray-400'}`}>
                    {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Input */}
      <div className="p-3 bg-white border-t border-gray-200 flex items-center gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Tapez votre message ici..." className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-sm outline-none focus:bg-white focus:ring-2 focus:ring-green-500/30"
          data-testid="chat-input" />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} data-testid="chat-image-file" />
        <button onClick={() => fileRef.current?.click()} disabled={sending} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center disabled:opacity-50" data-testid="chat-camera-btn" aria-label="Envoyer une photo">
          <Camera size={20} className="text-gray-600" weight="fill" />
        </button>
        <button onClick={send} disabled={sending || !input.trim()} className="w-10 h-10 rounded-full bg-[#00B578] flex items-center justify-center disabled:opacity-50" data-testid="chat-send">
          <PaperPlaneTilt size={18} className="text-white" weight="fill" />
        </button>
      </div>
    </div>
  );
};

export default RideChatPage;
