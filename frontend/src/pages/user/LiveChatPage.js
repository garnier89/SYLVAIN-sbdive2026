import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, PaperPlaneTilt, ChatCircleDots } from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const LiveChatPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadMessages = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/livechat/messages`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (res.ok) setMessages(await res.json());
    } catch (e) { /* empty */ }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/livechat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        credentials: 'include',
        body: JSON.stringify({ message: input.trim() }),
      });
      setInput('');
      await loadMessages();
    } catch (e) { /* empty */ }
    finally { setSending(false); }
  };

  return (
    <div className="mobile-container min-h-screen bg-[#F2F2F7] flex flex-col" data-testid="livechat-page">
      {/* Header */}
      <div className="bg-[#FF4500] px-5 pt-5 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white">Parler en direct</h1>
          <p className="text-white/70 text-xs">Support SB Drive</p>
        </div>
        <div className="ml-auto w-3 h-3 rounded-full bg-green-400 border-2 border-white" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <ChatCircleDots size={48} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Commencez la conversation !</p>
            <p className="text-gray-400 text-xs mt-1">Notre équipe vous répondra rapidement.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
              msg.sender === 'user'
                ? 'bg-[#FF4500] text-white rounded-br-md'
                : 'bg-white text-gray-900 rounded-bl-md shadow-sm'
            }`} data-testid={`message-${msg.id}`}>
              <p className="text-sm">{msg.message}</p>
              <p className={`text-[10px] mt-1 ${msg.sender === 'user' ? 'text-white/60' : 'text-gray-400'}`}>
                {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Écrivez votre message..."
          className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#FF4500]/30"
          data-testid="chat-input"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-full bg-[#FF4500] flex items-center justify-center disabled:opacity-40 hover:bg-[#E03D00] transition-colors"
          data-testid="send-btn"
        >
          <PaperPlaneTilt size={18} weight="fill" className="text-white" />
        </button>
      </div>
    </div>
  );
};

export default LiveChatPage;
