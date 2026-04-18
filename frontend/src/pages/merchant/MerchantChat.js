import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ChatCircleDots, PaperPlaneRight, ArrowLeft } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const MerchantChat = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    { id: 1, sender: 'system', text: 'Bienvenue dans le support marchand ! Comment pouvons-nous vous aider ?', time: new Date().toISOString() },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    setMessages(prev => [...prev, { id: Date.now(), sender: 'user', text, time: new Date().toISOString() }]);
    try {
      await fetch(`${API_URL}/api/livechat/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ message: text }),
      });
    } catch (err) { console.error('Send error:', err); }
    setTimeout(() => {
      setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'system', text: 'Merci pour votre message. Un agent vous repondra sous peu.', time: new Date().toISOString() }]);
      setSending(false);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]" data-testid="merchant-chat">
      <div className="p-4 border-b bg-white flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/merchant')} className="lg:hidden"><ArrowLeft size={20} /></Button>
        <ChatCircleDots size={24} className="text-orange-500" />
        <div>
          <h1 className="text-lg font-bold text-gray-800">Support Marchand</h1>
          <p className="text-xs text-green-500">En ligne</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
              msg.sender === 'user' ? 'bg-orange-500 text-white' : 'bg-white text-gray-800 border border-gray-200'
            }`}>
              <p className="text-sm">{msg.text}</p>
              <p className={`text-[10px] mt-1 ${msg.sender === 'user' ? 'text-orange-200' : 'text-gray-400'}`}>
                {new Date(msg.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 bg-white border-t">
        <div className="flex gap-2">
          <Input
            value={input} onChange={e => setInput(e.target.value)} placeholder="Ecrivez votre message..."
            onKeyDown={e => e.key === 'Enter' && sendMessage()} className="flex-1" data-testid="chat-input"
          />
          <Button onClick={sendMessage} disabled={!input.trim() || sending} className="bg-orange-500 hover:bg-orange-600 text-white" data-testid="send-btn">
            <PaperPlaneRight size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MerchantChat;
