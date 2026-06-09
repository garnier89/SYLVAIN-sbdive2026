import React from 'react';
import { List, CalendarCheck, Bell } from '@phosphor-icons/react';
import { useLocale } from '../../../contexts/LocaleContext';

/** Black top bar: side-menu, online toggle, scheduled-reservations (with badge), notifications. */
export const DriverHomeHeader = ({
  isOnline,
  onToggleOnline,
  onMenu,
  scheduledCount,
  onScheduled,
  onNotifications,
  notifCount = 0,
}) => {
  const { t } = useLocale();
  return (
  <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ background: '#0B0B0B' }}>
    <button onClick={onMenu} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center" data-testid="driver-menu-btn">
      <List size={20} className="text-[#2E3B5B]" />
    </button>
    <button
      onClick={onToggleOnline}
      className="relative flex items-center gap-2.5 pl-5 pr-4 py-2.5 rounded-full transition-all duration-300 active:scale-95"
      style={{
        background: isOnline ? 'linear-gradient(135deg, #00C766 0%, #00A86B 100%)' : '#FFFFFF',
        border: isOnline ? 'none' : '1px solid #E5E7EB',
        boxShadow: isOnline
          ? '0 0 0 3px rgba(0,181,120,0.22), 0 6px 18px rgba(0,181,120,0.40)'
          : '0 1px 3px rgba(0,0,0,0.12)',
      }}
      data-testid="online-toggle"
    >
      <span className={`text-sm font-extrabold tracking-tight ${isOnline ? 'text-white' : 'text-gray-500'}`}>
        {isOnline ? t('driver.online') : t('driver.offline')}
      </span>
      <span className="relative flex items-center justify-center w-3.5 h-3.5">
        {isOnline && (
          <span className="absolute inline-flex w-full h-full rounded-full bg-white opacity-60 animate-ping" />
        )}
        <span className={`relative inline-flex rounded-full w-2.5 h-2.5 ${isOnline ? 'bg-white' : 'bg-gray-300'}`} />
      </span>
    </button>
    <div className="flex items-center gap-2">
      <button onClick={onScheduled} className={`relative w-10 h-10 rounded-full bg-[#2E3B5B] flex items-center justify-center ${scheduledCount > 0 ? 'animate-blink-ring' : ''}`} data-testid="scheduled-reservations-btn" aria-label="Réservations planifiées">
        <CalendarCheck size={20} className={scheduledCount > 0 ? 'text-white animate-blink-turn' : 'text-white'} weight={scheduledCount > 0 ? 'fill' : 'regular'} />
        {scheduledCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-white animate-blink-turn" data-testid="scheduled-badge">
            {scheduledCount}
          </span>
        )}
      </button>
      <button onClick={onNotifications} className="relative w-10 h-10 rounded-full bg-[#2E3B5B] flex items-center justify-center" data-testid="notifications-btn">
        <Bell size={20} className="text-white" />
        {notifCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-white animate-blink-turn" data-testid="notifications-badge">
            {notifCount}
          </span>
        )}
      </button>
    </div>
  </div>
  );
};

export default DriverHomeHeader;
