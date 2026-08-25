import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { House, ListBullets, ChatCircleDots, User, QrCode } from '@phosphor-icons/react';

const TABS = [
  { key: 'home', label: 'Accueil', icon: House, path: '/home' },
  { key: 'activity', label: 'Activités', icon: ListBullets, path: '/history' },
];
const TABS_RIGHT = [
  { key: 'messages', label: 'Messages', icon: ChatCircleDots, path: '/livechat' },
  { key: 'profile', label: 'Profil', icon: User, path: '/profile' },
];

// Persistent bottom navigation — Accueil / Activités / scan / Messages / Profil.
const BottomTabBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = (path) => location.pathname === path;

  const Tab = ({ tab }) => {
    const active = isActive(tab.path);
    return (
      <button
        onClick={() => navigate(tab.path)}
        className="flex flex-col items-center gap-1 px-3 py-1.5"
        data-testid={`tab-${tab.key}`}
      >
        <tab.icon size={22} weight={active ? 'fill' : 'regular'} className={active ? 'text-[#FF5000]' : 'text-white/70'} />
        <span className={`text-[10px] font-bold ${active ? 'text-[#FF5000]' : 'text-white/70'}`}>{tab.label}</span>
      </button>
    );
  };

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-40 px-4 pb-4"
      data-testid="bottom-tab-bar"
    >
      <div className="relative flex items-center justify-between bg-[#0B1426] rounded-[28px] pl-3 pr-3 py-2 shadow-[0_16px_40px_-14px_rgba(11,20,38,0.55)]">
        {TABS.map((tab) => <Tab key={tab.key} tab={tab} />)}
        <div className="w-14 shrink-0" aria-hidden="true" />
        {TABS_RIGHT.map((tab) => <Tab key={tab.key} tab={tab} />)}
        <button
          onClick={() => navigate('/pay')}
          className="absolute left-1/2 -top-5 -translate-x-1/2 w-14 h-14 rounded-full bg-[#FF5000] border-4 border-[#0B1426] flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          data-testid="tab-scan"
          aria-label="Scanner un code"
        >
          <QrCode size={24} weight="bold" className="text-white" />
        </button>
      </div>
    </nav>
  );
};

export default BottomTabBar;
