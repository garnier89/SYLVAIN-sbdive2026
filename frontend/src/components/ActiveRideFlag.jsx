import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { NavigationArrow, CaretRight } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;
const ACTIVE = ['accepted', 'arriving', 'in_progress'];

// Libellé contextuel selon l'état de la course (côté client).
const CLIENT_LABEL = {
  accepted: 'Chauffeur confirmé — il arrive',
  arriving: 'Votre chauffeur arrive',
  in_progress: 'Course en cours',
};

/**
 * Bande de suivi persistante (style Uber/Bolt) affichée pendant une course active,
 * client comme chauffeur. Permet de quitter librement l'écran de course et d'y
 * revenir à tout moment d'un simple tap — l'utilisateur n'est jamais « bloqué ».
 * Les réservations programmées encore lointaines ne déclenchent PAS la bande
 * (gérées côté backend via /rides/active/current).
 */
const ActiveRideFlag = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [ride, setRide] = useState(null);

  const fetchActive = useCallback(async () => {
    if (!user || !['user', 'driver'].includes(user.role)) { setRide(null); return; }
    try {
      const { data } = await axios.get(`${API}/api/rides/active/current`, { withCredentials: true });
      setRide(data && data.id && ACTIVE.includes(data.status) ? data : null);
    } catch {
      setRide(null);
    }
  }, [user]);

  useEffect(() => {
    fetchActive();
    const iv = setInterval(fetchActive, 15000);
    return () => clearInterval(iv);
  }, [fetchActive, location.pathname]);

  if (!ride) return null;

  const isDriver = user.role === 'driver';
  const target = isDriver ? '/chauffeur/home' : `/ride/${ride.id}`;
  // Masquer quand on est déjà sur l'écran de course.
  if (location.pathname === target || location.pathname === `/ride/${ride.id}`) return null;

  const label = isDriver ? 'Course en cours' : (CLIENT_LABEL[ride.status] || 'Suivre ma course');

  return (
    <button
      onClick={() => navigate(target)}
      className="fixed left-1/2 -translate-x-1/2 bottom-[72px] z-[1350] w-[calc(100%-1.5rem)] max-w-[472px] flex items-center gap-3 bg-[#0B1426] text-white rounded-2xl shadow-2xl pl-3 pr-2 py-2.5 active:scale-[0.99] transition-transform"
      data-testid="active-ride-flag"
      aria-label={label}
    >
      <span className="relative flex h-9 w-9 items-center justify-center shrink-0">
        <span className="absolute inline-flex h-9 w-9 rounded-full bg-[#FF5000]/40 animate-ping" />
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#FF5000]">
          <NavigationArrow size={18} weight="fill" className="text-white" />
        </span>
      </span>
      <div className="flex-1 text-left min-w-0">
        <p className="text-[11px] font-semibold text-[#FF8A5B] uppercase tracking-wide leading-tight">SB Drive</p>
        <p className="text-sm font-bold truncate">{label}</p>
      </div>
      <span className="flex items-center gap-1 text-[12px] font-bold text-white/90 bg-white/10 rounded-full px-2.5 py-1 shrink-0">
        {isDriver ? 'Ouvrir' : 'Suivre'} <CaretRight size={13} weight="bold" />
      </span>
    </button>
  );
};

export default ActiveRideFlag;
