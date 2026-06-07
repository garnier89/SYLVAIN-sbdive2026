import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavigationArrow, X, ArrowBendUpRight, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import AdminGoogleMap from '../admin/AdminGoogleMap';

const stripHtml = (h) => (h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// Rough metres between two lat/lng points.
const distM = (a, b) => {
  if (!a?.lat || !b?.lat) return Infinity;
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLng = (b.lng - a.lng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/**
 * In-app "advanced Google navigation" (Uber-style driving mode): full-screen
 * follow map (auto-recenter + tight zoom), live next-maneuver banner that
 * advances with the driver's position, spoken turn-by-turn (French), ETA /
 * remaining distance and a one-tap switch to Waze.
 */
const InAppNav = ({ origin, destination, driverPos, label, onClose, onWaze }) => {
  const [route, setRoute] = useState(null); // { path, steps:[{instr,dist,loc}], eta, distance }
  const [muted, setMuted] = useState(false);
  const spokenRef = useRef(-1);

  // Compute the route once for this destination.
  useEffect(() => {
    if (!window.google?.maps || !destination?.lat) return;
    const ds = new window.google.maps.DirectionsService();
    ds.route(
      {
        origin: driverPos?.lat ? driverPos : origin,
        destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (res, status) => {
        if (status === 'OK' && res.routes?.[0]) {
          const leg = res.routes[0].legs[0];
          setRoute({
            path: res.routes[0].overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() })),
            steps: leg.steps.map((s) => ({
              instr: stripHtml(s.instructions),
              dist: s.distance?.text,
              loc: { lat: s.start_location.lat(), lng: s.start_location.lng() },
            })),
            eta: leg.duration?.text,
            distance: leg.distance?.text,
          });
        }
      }
    );
  }, [destination?.lat, destination?.lng]);

  // Current maneuver = the step nearest to the driver (derived, advances live).
  const stepIdx = useMemo(() => {
    if (!route?.steps?.length || !driverPos?.lat) return 0;
    let best = 0, bestD = Infinity;
    route.steps.forEach((s, i) => {
      const d = distM(driverPos, s.loc);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }, [driverPos?.lat, driverPos?.lng, route]);

  const step = route?.steps?.[stepIdx];

  // Speak the maneuver (French) whenever it changes — unless muted.
  useEffect(() => {
    if (muted || !step?.instr || !window.speechSynthesis) return;
    if (spokenRef.current === stepIdx) return;
    spokenRef.current = stepIdx;
    const u = new SpeechSynthesisUtterance(step.instr);
    u.lang = 'fr-FR';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [stepIdx, step, muted]);

  // Stop any speech when leaving navigation.
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* noop */ } }, []);

  return (
    <div className="fixed inset-0 z-[2750] bg-black flex flex-col" data-testid="inapp-nav">
      {/* Next maneuver banner */}
      <div className="bg-[#1f6feb] text-white px-4 pt-9 pb-4 flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
          <ArrowBendUpRight size={26} weight="bold" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-extrabold leading-tight" data-testid="inapp-nav-instruction">
            {step ? step.instr : "Calcul de l'itinéraire…"}
          </p>
          <p className="text-xs text-white/80">{step?.dist ? `Dans ${step.dist}` : `Vers ${label || 'la destination'}`}</p>
        </div>
        <button onClick={() => setMuted((m) => !m)} className="w-9 h-9 flex items-center justify-center" data-testid="inapp-nav-mute" aria-label="Activer/couper la voix">
          {muted ? <SpeakerSlash size={22} weight="bold" /> : <SpeakerHigh size={22} weight="bold" />}
        </button>
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center" data-testid="inapp-nav-close" aria-label="Quitter la navigation">
          <X size={26} weight="bold" />
        </button>
      </div>

      {/* Follow map — driving mode: recenters on the driver with a tight zoom */}
      <div className="flex-1 relative">
        <AdminGoogleMap
          center={driverPos?.lat ? driverPos : origin}
          zoom={18}
          driver={driverPos}
          routePath={route?.path}
          dropoff={destination}
        />
      </div>

      {/* ETA + Waze switch */}
      <div className="bg-white px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-lg font-extrabold text-gray-900 leading-tight" data-testid="inapp-nav-eta">{route?.eta || '—'}</p>
          <p className="text-xs text-gray-500">{route?.distance ? `${route.distance} restants` : 'Itinéraire en direct'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onWaze} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white font-bold text-sm" style={{ background: '#05C8FB' }} data-testid="inapp-nav-waze">
            <NavigationArrow size={16} weight="fill" /> Waze
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm" data-testid="inapp-nav-quit">Quitter</button>
        </div>
      </div>
    </div>
  );
};

export default InAppNav;
