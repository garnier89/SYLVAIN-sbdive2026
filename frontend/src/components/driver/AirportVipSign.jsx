import React, { useState, useEffect, useCallback } from 'react';
import { X, PencilSimple, Check, ArrowsClockwise } from '@phosphor-icons/react';

/**
 * AirportVipSign — fullscreen, high-contrast "name sign" the driver brandishes
 * at the airport arrivals hall to greet a VIP client. Premium dark theme + SB
 * logo, an editable greeting, the client's name and a customizable subtitle
 * (flight / terminal / company). Auto-rotates to landscape when the phone is
 * held in portrait so the panel always reads wide.
 */
export const AirportVipSign = ({ ride, onClose }) => {
  const defaultName = ride.passenger_name || ride.book_for_name || 'Client';
  const defaultSubtitle = ride.flight_number
    ? `Vol ${ride.flight_number}${ride.airport_terminal ? ` · ${ride.airport_terminal}` : ''}`
    : 'SB Drive — Service VIP';

  const [greeting, setGreeting] = useState('Bienvenue');
  const [name, setName] = useState(defaultName);
  const [subtitle, setSubtitle] = useState(defaultSubtitle);
  const [editing, setEditing] = useState(false);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  // Try to lock landscape on devices that support the Screen Orientation API.
  const tryRotate = useCallback(async () => {
    try {
      if (window.screen?.orientation?.lock) {
        await window.screen.orientation.lock('landscape');
      }
    } catch (_) {
      /* unsupported — CSS rotation below handles it */
    }
  }, []);

  // When portrait, rotate the panel 90° and size it to the swapped viewport.
  const rotatedStyle = portrait
    ? {
        transform: 'rotate(90deg)',
        width: '100vh',
        height: '100vw',
      }
    : { width: '100vw', height: '100vh' };

  return (
    <div
      className="fixed inset-0 z-[2000] bg-black flex items-center justify-center overflow-hidden"
      data-testid="airport-vip-sign"
    >
      {/* Top controls (kept upright in viewport, never rotated) */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between p-3">
        <button
          onClick={() => setEditing((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 text-white text-xs font-bold backdrop-blur active:scale-95"
          data-testid="vip-sign-edit-toggle"
        >
          {editing ? <Check size={16} weight="bold" /> : <PencilSimple size={16} weight="bold" />}
          {editing ? 'Terminer' : 'Modifier'}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={tryRotate}
            className="p-2 rounded-full bg-white/10 text-white backdrop-blur active:scale-95"
            data-testid="vip-sign-rotate"
            aria-label="Pivoter"
          >
            <ArrowsClockwise size={18} weight="bold" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 text-white backdrop-blur active:scale-95"
            data-testid="vip-sign-close"
            aria-label="Fermer"
          >
            <X size={20} weight="bold" />
          </button>
        </div>
      </div>

      {/* Rotating sign panel */}
      <div
        className="flex flex-col items-center justify-center text-center px-10"
        style={rotatedStyle}
      >
        <img
          src="/sb-logo-driver.png"
          alt="SB Drive"
          className="h-16 sm:h-20 object-contain mb-6 drop-shadow-[0_0_18px_rgba(212,175,55,0.45)]"
        />

        {editing ? (
          <div className="w-full max-w-xl space-y-3">
            <input
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Message d'accueil"
              className="w-full text-center bg-white/10 text-amber-300 text-2xl font-semibold rounded-xl px-4 py-2 outline-none border border-white/15 focus:border-amber-400"
              data-testid="vip-sign-greeting-input"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom du client"
              className="w-full text-center bg-white/10 text-white text-4xl font-black rounded-xl px-4 py-3 outline-none border border-white/15 focus:border-amber-400"
              data-testid="vip-sign-name-input"
            />
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Vol / Société / Note"
              className="w-full text-center bg-white/10 text-gray-300 text-lg rounded-xl px-4 py-2 outline-none border border-white/15 focus:border-amber-400"
              data-testid="vip-sign-subtitle-input"
            />
          </div>
        ) : (
          <>
            {greeting ? (
              <p
                className="text-amber-300 text-3xl sm:text-4xl font-semibold tracking-wide mb-3"
                data-testid="vip-sign-greeting"
              >
                {greeting}
              </p>
            ) : null}
            <h1
              className="text-white font-black leading-tight tracking-tight max-w-[92%] break-words"
              style={{ fontSize: `clamp(2.25rem, ${name.length > 14 ? 8 : 12}vmin, ${name.length > 14 ? 4.5 : 6}rem)`, textShadow: '0 2px 24px rgba(255,255,255,0.18)' }}
              data-testid="vip-sign-name"
            >
              {name}
            </h1>
            {subtitle ? (
              <p
                className="text-gray-300 text-lg sm:text-2xl font-medium mt-5"
                data-testid="vip-sign-subtitle"
              >
                {subtitle}
              </p>
            ) : null}
            <div className="mt-8 h-1 w-28 rounded-full bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
          </>
        )}
      </div>
    </div>
  );
};

export default AirportVipSign;
