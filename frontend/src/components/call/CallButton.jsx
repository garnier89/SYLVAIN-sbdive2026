import React from 'react';
import { Phone } from '@phosphor-icons/react';
import { useCall } from '../../contexts/CallContext';

/**
 * Bouton « Appeler » masqué (WebRTC + repli relais Twilio).
 * Affiché dans les réservations à venir (chauffeur ET client). Nécessite qu'une
 * course soit assignée (rideId) et un correspondant (chauffeur/client).
 */
const CallButton = ({ rideId, label = 'Appeler', compact = false, className = '', testId }) => {
  const { startCall, callState } = useCall();
  if (!rideId) return null;
  const busy = callState && callState !== 'idle';
  return (
    <button
      onClick={(e) => { e.stopPropagation(); startCall(rideId); }}
      disabled={busy}
      data-testid={testId || `call-btn-${rideId}`}
      className={className || `inline-flex items-center justify-center gap-1.5 rounded-full font-bold transition-colors disabled:opacity-50 ${compact ? 'w-9 h-9 bg-emerald-500 text-white' : 'px-4 py-2 bg-emerald-500 text-white text-sm'}`}
      aria-label="Appeler (numéro masqué)"
    >
      <Phone size={compact ? 17 : 16} weight="fill" />
      {!compact && <span>{label}</span>}
    </button>
  );
};

export default CallButton;
