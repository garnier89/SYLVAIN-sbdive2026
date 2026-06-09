import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Robot } from '@phosphor-icons/react';
import { SupportChatPanel } from '../../components/SupportChatPanel';

const LiveChatPage = () => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container min-h-screen bg-[#F2F2F7] flex flex-col" data-testid="livechat-page">
      <div className="bg-[#FF4500] px-5 pt-5 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div className="flex items-center gap-2">
          <Robot size={22} weight="fill" className="text-white" />
          <div>
            <h1 className="text-lg font-bold text-white">Parler en direct</h1>
            <p className="text-white/70 text-xs">Assistant SB Drive · 24h/24</p>
          </div>
        </div>
        <div className="ml-auto w-3 h-3 rounded-full bg-green-400 border-2 border-white" />
      </div>

      <SupportChatPanel accent="#FF4500" />
    </div>
  );
};

export default LiveChatPage;
