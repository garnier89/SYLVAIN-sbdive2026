import React, { useState, useEffect } from 'react';
import { BellRinging, X } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { isPushSupported, subscribeToPush } from '../lib/webpush';

const DISMISS_KEY = 'sb_notif_banner_dismissed';

/**
 * Slim opt-in banner nudging logged-in users to enable push notifications so
 * they never miss a ride/order. Self-hides when unsupported, already granted,
 * denied, or dismissed.
 */
const EnableNotificationsBanner = () => {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !isPushSupported()) { setShow(false); return; }
    if (Notification.permission !== 'default') { setShow(false); return; }
    if (localStorage.getItem(DISMISS_KEY) === '1') { setShow(false); return; }
    const t = setTimeout(() => setShow(true), 1500);
    return () => clearTimeout(t);
  }, [user]);

  if (!show) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const res = await subscribeToPush();
      if (res?.ok) setShow(false);
    } finally {
      setBusy(false);
      // Whatever the outcome, the OS dialog has shown — don't keep nagging.
      setShow(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  };

  return (
    <div
      className="fixed bottom-20 inset-x-3 z-[1400] max-w-md mx-auto bg-[#0B1426] text-white rounded-2xl shadow-2xl border border-white/10 px-4 py-3 flex items-center gap-3 animate-fade-in"
      data-testid="enable-notifications-banner"
    >
      <div className="w-10 h-10 rounded-full bg-[#FF5000]/20 flex items-center justify-center flex-shrink-0">
        <BellRinging size={20} weight="duotone" className="text-[#FF7A3D]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight">Activez les notifications</p>
        <p className="text-xs text-gray-400 leading-tight">Ne ratez aucune course ni message, même app fermée.</p>
      </div>
      <button
        onClick={enable}
        disabled={busy}
        className="flex-shrink-0 bg-[#FF5000] hover:bg-[#e64600] text-white text-xs font-bold px-3 py-2 rounded-xl disabled:opacity-60"
        data-testid="enable-notifications-btn"
      >
        {busy ? '...' : 'Activer'}
      </button>
      <button onClick={dismiss} className="flex-shrink-0 text-gray-400 hover:text-white" data-testid="dismiss-notifications-btn" aria-label="Fermer">
        <X size={18} />
      </button>
    </div>
  );
};

export default EnableNotificationsBanner;
