import React from 'react';
import { List, CalendarCheck, Bell } from '@phosphor-icons/react';
import { useLocale } from '../../../contexts/LocaleContext';
import LocaleSelector from '../../LocaleSelector';

/** Green top bar: side-menu, online toggle, scheduled-reservations (with badge), notifications. */
export const DriverHomeHeader = ({
  isOnline,
  onToggleOnline,
  onMenu,
  scheduledCount,
  onScheduled,
  onNotifications,
}) => {
  const { t } = useLocale();
  return (
  <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ background: '#00B578' }}>
    <button onClick={onMenu} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center" data-testid="driver-menu-btn">
      <List size={20} className="text-white" />
    </button>
    <button
      onClick={onToggleOnline}
      className={`flex items-center gap-2 px-5 py-2 rounded-full border-2 ${isOnline ? 'bg-white border-white' : 'bg-white/20 border-white/40'}`}
      data-testid="online-toggle"
    >
      <span className={`text-sm font-bold ${isOnline ? 'text-green-700' : 'text-white'}`}>
        {isOnline ? t('driver.online') : t('driver.offline')}
      </span>
      <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
    </button>
    <div className="flex items-center gap-2">
      <div data-testid="driver-locale-selector"><LocaleSelector variant="dark" /></div>
      <button onClick={onScheduled} className="relative w-10 h-10 rounded-full bg-white/20 flex items-center justify-center" data-testid="scheduled-reservations-btn" aria-label="Réservations planifiées">
        <CalendarCheck size={20} className="text-white" />
        {scheduledCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center animate-pulse ring-2 ring-white" data-testid="scheduled-badge">
            {scheduledCount}
          </span>
        )}
      </button>
      <button onClick={onNotifications} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center" data-testid="notifications-btn">
        <Bell size={20} className="text-white" />
      </button>
    </div>
  </div>
  );
};

export default DriverHomeHeader;
