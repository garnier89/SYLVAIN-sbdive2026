import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PaperPlaneTilt, ChatCircleDots, Headset, Robot, UserCircle } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Reusable support chat (« Parler en direct ») with AI agent + human escalation.
 * Works for any authenticated role (client, chauffeur, marchand).
 * @param {string} accent - hex color for the user bubble / send button.
 */
export const SupportChatPanel = ({ accent = '#FF4500' }) => {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('ai');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const bottomRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/support/me`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        if (data.thread?.status) setStatus(data.thread.status);
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // poll for agent replies
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    // optimistic
    setMessages((m) => [...m, { id: `tmp_${Date.now()}`, sender: 'user', text, created_at: new Date().toISOString() }]);
    try {
      const res = await fetch(`${API}/api/support/message`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) { const d = await res.json(); setStatus(d.status); }
      await load();
    } catch { /* noop */ }
    finally { setSending(false); }
  };

  const escalate = async () => {
    setEscalating(true);
    try {
      await fetch(`${API}/api/support/escalate`, { method: 'POST', credentials: 'include' });
      setStatus('escalated');
      await load();
    } catch { /* noop */ }
    finally { setEscalating(false); }
  };

  const senderMeta = (s) => {
    if (s === 'user') return null;
    if (s === 'agent') return { label: 'Conseiller', Icon: Headset, color: 'text-blue-500' };
    return { label: 'Assistant IA', Icon: Robot, color: 'text-emerald-500' };
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" data-testid="support-messages">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <ChatCircleDots size={48} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Posez votre question à notre assistant</p>
            <p className="text-gray-400 text-xs mt-1">Réponse immédiate, 24h/24.</p>
          </div>
        )}
        {messages.map((msg) => {
          const meta = senderMeta(msg.sender);
          const isUser = msg.sender === 'user';
          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[82%]">
                {meta && (
                  <div className="flex items-center gap-1 mb-0.5 ml-1">
                    <meta.Icon size={13} weight="fill" className={meta.color} />
                    <span className="text-[10px] font-semibold text-gray-400">{meta.label}</span>
                  </div>
                )}
                <div
                  className={`rounded-2xl px-4 py-2.5 ${isUser ? 'text-white rounded-br-md' : 'bg-white text-gray-900 rounded-bl-md shadow-sm'}`}
                  style={isUser ? { background: accent } : undefined}
                  data-testid={`support-msg-${msg.sender}`}
                >
                  <p className="text-sm whitespace-pre-line">{msg.text}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {status === 'escalated' ? (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 flex items-center gap-2 text-blue-700" data-testid="escalated-banner">
          <Headset size={16} weight="fill" />
          <span className="text-xs font-medium">Vous discutez avec le support. Un conseiller vous répond ici.</span>
        </div>
      ) : (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
          <button onClick={escalate} disabled={escalating} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900" data-testid="escalate-btn">
            <UserCircle size={15} weight="fill" /> {escalating ? 'Transfert…' : 'Parler à un conseiller'}
          </button>
        </div>
      )}

      <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Écrivez votre message..."
          className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm outline-none"
          data-testid="support-input"
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40"
          style={{ background: accent }}
          data-testid="support-send"
        >
          <PaperPlaneTilt size={18} weight="fill" className="text-white" />
        </button>
      </div>
    </div>
  );
};

export default SupportChatPanel;
