import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;
const ACTIVE = ['accepted', 'arriving', 'in_progress'];

/**
 * Floating SB "flag" bubble shown while a ride is active (client + driver).
 * Lets the user jump back to the ride screen from anywhere in the app — like
 * the persistent bubble in ride-hailing super-apps. Tap = return to the ride.
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

  const target = user.role === 'driver' ? '/chauffeur/home' : `/ride/${ride.id}`;
  // Hide while already on the ride screen.
  if (location.pathname === target || location.pathname === `/ride/${ride.id}`) return null;

  const label = user.role === 'driver' ? 'Course en cours' : 'Suivre ma course';

  return (
    <button
      onClick={() => navigate(target)}
      className="fixed bottom-28 right-3 z-[1350] flex items-center gap-2 group"
      data-testid="active-ride-flag"
      aria-label={label}
    >
      <span className="hidden group-active:block sm:group-hover:block bg-[#0B1426] text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg whitespace-nowrap">
        {label}
      </span>
      <span className="relative flex items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-[#FF5000]/40 animate-ping" />
        <span className="relative w-16 h-16 rounded-full bg-white shadow-2xl border-2 border-[#FF5000] flex items-center justify-center overflow-hidden">
          <img src="/sb-logo-driver.png" alt="SB" className="w-12 h-12 object-contain" />
        </span>
      </span>
    </button>
  );
};

export default ActiveRideFlag;
