import React from 'react';
import { Robot } from '@phosphor-icons/react';
import { SupportChatPanel } from '../../components/SupportChatPanel';

const MerchantLiveSupport = () => (
  <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }} data-testid="merchant-livesupport">
    <div className="bg-[#FF4500] px-5 py-4 flex items-center gap-2">
      <Robot size={22} weight="fill" className="text-white" />
      <div>
        <h1 className="text-lg font-bold text-white">Parler en direct</h1>
        <p className="text-white/70 text-xs">Assistant SB Drive · support marchand</p>
      </div>
      <div className="ml-auto w-3 h-3 rounded-full bg-green-400 border-2 border-white" />
    </div>
    <div className="flex-1 min-h-0 bg-[#F2F2F7] flex flex-col">
      <SupportChatPanel accent="#FF4500" />
    </div>
  </div>
);

export default MerchantLiveSupport;
