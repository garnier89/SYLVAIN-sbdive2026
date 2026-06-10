import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PaperPlaneTilt, Sparkle, Storefront, ForkKnife, Clock, Star } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;
const SUGGESTIONS = ['Un restaurant ouvert', 'Je veux une pizza', 'Un vin rouge pas cher', 'Une épicerie près de moi'];

const MerchantCard = ({ m, onClick }) => (
  <button onClick={onClick} className="w-full text-left rounded-xl border border-gray-200 bg-white p-3 flex items-center gap-3 hover:border-indigo-300 transition-colors" data-testid={`assistant-merchant-${m.id}`}>
    {m.image_url ? <img src={m.image_url} alt="" className="w-12 h-12 rounded-lg object-cover" /> : <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center"><Storefront size={22} className="text-indigo-500" /></div>}
    <div className="flex-1 min-w-0">
      <p className="font-bold text-sm text-gray-900 truncate">{m.store_name}</p>
      <p className="text-xs text-gray-500 flex items-center gap-2">
        {m.rating ? <span className="flex items-center gap-0.5"><Star size={11} weight="fill" className="text-amber-400" />{m.rating}</span> : null}
        {m.eta_min ? <span className="flex items-center gap-0.5"><Clock size={11} />{m.eta_min} min</span> : null}
        <span className={m.open ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>{m.open ? 'Ouvert' : 'Fermé'}</span>
      </p>
    </div>
  </button>
);

const ProductCard = ({ p, onClick }) => (
  <button onClick={onClick} className="w-full text-left rounded-xl border border-gray-200 bg-white p-3 flex items-center gap-3 hover:border-indigo-300 transition-colors" data-testid={`assistant-product-${p.id}`}>
    {p.image_url ? <img src={p.image_url} alt="" className="w-12 h-12 rounded-lg object-cover" /> : <div className="w-12 h-12 rounded-lg bg-orange-50 flex items-center justify-center"><ForkKnife size={20} className="text-orange-500" /></div>}
    <div className="flex-1 min-w-0">
      <p className="font-bold text-sm text-gray-900 truncate">{p.name}</p>
      <p className="text-xs text-gray-500 truncate">{p.merchant_name}{p.category ? ` · ${p.category}` : ''}</p>
    </div>
    <span className="font-extrabold text-sm text-gray-900 shrink-0">{Number(p.price).toFixed(2)} €</span>
  </button>
);

const AssistantPage = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: msg }]);
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const r = await fetch(`${API}/api/assistant/chat`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, session_id: sessionId }),
        signal: controller.signal,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Erreur');
      setSessionId(d.session_id);
      setMessages((m) => [...m, { role: 'assistant', content: d.reply, products: d.products || [], merchants: d.merchants || [] }]);
    } catch (e) {
      const msgErr = e.name === 'AbortError' ? "L'assistant met trop de temps à répondre. Réessayez." : "Désolé, une erreur est survenue. Réessayez.";
      setMessages((m) => [...m, { role: 'assistant', content: msgErr }]);
    } finally { clearTimeout(timer); setLoading(false); }
  };

  return (
    <div className="mobile-container bg-gray-50 min-h-screen flex flex-col" data-testid="assistant-page">
      <div className="sticky top-0 z-50 bg-white border-b">
        <div className="p-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1" data-testid="assistant-back-btn"><ArrowLeft size={22} className="text-gray-700" /></button>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Sparkle size={18} weight="fill" className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">SB Assistant</h1>
            <p className="text-[11px] text-gray-400">Votre shopping, en un message</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-28">
        {messages.length === 0 && (
          <div className="text-center mt-8" data-testid="assistant-empty">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4">
              <Sparkle size={32} weight="fill" className="text-white" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Bonjour ! 👋</h2>
            <p className="text-sm text-gray-500 mb-5 px-6">Demandez-moi un plat, un produit ou un commerce — je trouve et vous commandez.</p>
            <div className="flex flex-col gap-2 max-w-xs mx-auto">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:border-indigo-300" data-testid={`assistant-suggestion-${s.slice(0, 8)}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i}>
            <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'}`} data-testid={`assistant-msg-${m.role}-${i}`}>
                {m.content}
              </div>
            </div>
            {(m.products?.length > 0 || m.merchants?.length > 0) && (
              <div className="mt-2 space-y-2">
                {m.products?.map((p) => <ProductCard key={p.id} p={p} onClick={() => navigate(`/food/${p.merchant_id}`)} />)}
                {m.merchants?.map((mc) => <MerchantCard key={mc.id} m={mc} onClick={() => navigate(`/food/${mc.id}`)} />)}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start" data-testid="assistant-typing">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Demandez-moi quelque chose…"
            className="flex-1 px-4 py-3 rounded-full border border-gray-200 text-sm focus:outline-none focus:border-indigo-400"
            data-testid="assistant-input"
          />
          <button onClick={() => send()} disabled={loading || !input.trim()} className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center disabled:opacity-50 shrink-0" data-testid="assistant-send-btn">
            <PaperPlaneTilt size={20} weight="fill" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssistantPage;
