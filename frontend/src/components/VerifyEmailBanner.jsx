import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Envelope, X } from '@phosphor-icons/react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Hide the banner on auth/verification screens AND on transactional flows that have a
// fixed bottom action bar (so the reminder can never cover a primary CTA). It still
// shows on home/browse screens (home, profile, wallet, lists) where it blocks nothing.
const HIDDEN_PREFIXES = [
  '/login', '/register', '/verifier-email', '/mot-de-passe-oublie', '/reinitialiser-mot-de-passe', '/auth',
  '/course', '/taxi', '/checkout', '/food/', '/bidding', '/service-providers', '/rental',
  '/real-estate/post', '/real-estate/edit', '/marketplace/sell-vehicle', '/ma-galerie',
  '/parcel', '/runner', '/driver/register',
  '/parking', '/giftcards', '/carpool', '/covoiturage',
  '/events/', '/organizer', '/controle', '/sb-tracking', '/sb-market', '/towing', '/video-consult',
];

const DISMISS_KEY = 'verify_email_dismissed_for';

const VerifyEmailBanner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  // Restore a persisted dismissal (per user) so closing it sticks across navigations/reloads.
  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === (user?.id || '')); }
    catch { setDismissed(false); }
  }, [user?.id]);

  if (!user || user.is_verified || dismissed) return null;
  if (HIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p))) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, user?.id || ''); } catch { /* ignore */ }
  };

  const resend = async () => {
    setSending(true);
    try {
      await axios.post(`${API_URL}/api/auth/send-verification`, {}, { withCredentials: true });
    } catch (e) { /* silent */ }
    setSending(false);
    navigate('/verifier-email');
  };

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-30 mx-auto max-w-md px-3 pb-3"
      data-testid="verify-email-banner"
    >
      <div className="rounded-2xl bg-[#FF4500] text-white shadow-lg flex items-center gap-3 px-4 py-3">
        <Envelope size={22} weight="duotone" className="shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">Vérifiez votre email</p>
          <p className="text-xs text-white/85 leading-tight truncate">Activez votre compte pour le sécuriser.</p>
        </div>
        <button
          onClick={resend}
          disabled={sending}
          className="shrink-0 px-3 py-1.5 rounded-full bg-white text-[#FF4500] text-xs font-bold disabled:opacity-60"
          data-testid="verify-email-banner-btn"
        >
          {sending ? '...' : 'Vérifier'}
        </button>
        <button onClick={dismiss} className="shrink-0 text-white/80" data-testid="verify-email-banner-dismiss">
          <X size={18} />
        </button>
      </div>
    </div>
  );
};

export default VerifyEmailBanner;
