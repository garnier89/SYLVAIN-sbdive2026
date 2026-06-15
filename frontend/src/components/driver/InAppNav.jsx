import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavigationArrow, X, ArrowBendUpRight, SpeakerHigh, SpeakerSlash, Warning } from '@phosphor-icons/react';
import AdminGoogleMap from '../admin/AdminGoogleMap';
import { getDirectionsService } from '../../lib/googleMaps';

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

// Compass bearing (0=N, 90=E) from point a to b — used to rotate the car marker.
const bearing = (a, b) => {
  const toR = Math.PI / 180, toD = 180 / Math.PI;
  const y = Math.sin((b.lng - a.lng) * toR) * Math.cos(b.lat * toR);
  const x = Math.cos(a.lat * toR) * Math.sin(b.lat * toR)
    - Math.sin(a.lat * toR) * Math.cos(b.lat * toR) * Math.cos((b.lng - a.lng) * toR);
  return (Math.atan2(y, x) * toD + 360) % 360;
};

/**
 * In-app "advanced Google navigation" (Uber-style driving mode): full-screen
 * follow map (auto-recenter + tight zoom) with a LIVE TRAFFIC layer, traffic-aware
 * ETA (duration_in_traffic), a "bouchons" warning badge, a live next-maneuver
 * banner that advances with the driver's position, spoken turn-by-turn (French)
 * and a one-tap switch to Google Maps / Waze. The route is re-computed every 30 s
 * from the driver's current position so the ETA and maneuvers stay accurate.
 */
const InAppNav = ({ origin, destination, driverPos, label, onClose, onWaze, onGoogle }) => {
  const [route, setRoute] = useState(null); // { path, steps, eta, etaTraffic, distance, trafficDelaySec }
  const [muted, setMuted] = useState(false);
  const [rerouted, setRerouted] = useState(false);
  const spokenRef = useRef(-1);
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const voicesRef = useRef([]);
  const prevRouteRef = useRef(null); // { sig, durTraffic }
  const rerouteTimerRef = useRef(null);
  const driverRef = useRef(driverPos);
  driverRef.current = driverPos;
  const prevPosRef = useRef(null);
  const [heading, setHeading] = useState(null);

  // Vehicle heading (cap) from the last movement → rotates the car marker.
  useEffect(() => {
    if (!driverPos?.lat) return;
    const prev = prevPosRef.current;
    if (prev && (prev.lat !== driverPos.lat || prev.lng !== driverPos.lng) && distM(prev, driverPos) > 3) {
      setHeading(bearing(prev, driverPos));
    }
    prevPosRef.current = driverPos;
  }, [driverPos?.lat, driverPos?.lng]);

  // Keep the list of available speech voices fresh (loaded asynchronously).
  useEffect(() => {
    if (!window.speechSynthesis) return undefined;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices() || []; };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { try { window.speechSynthesis.onvoiceschanged = null; } catch { /* noop */ } };
  }, []);

  // Speak text with an explicit French voice (fr-FR).
  const speakFr = useCallback((text) => {
    if (mutedRef.current || !text || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    const fr = voicesRef.current.find((v) => (v.lang || '').toLowerCase().startsWith('fr'));
    if (fr) u.voice = fr;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, []);

  // Compute a traffic-aware route (with alternatives) from the driver's current
  // position, then pick the FASTEST one by live traffic. If a faster alternative
  // replaces the current route (bouchons), switch to it and announce it in French.
  const computeRoute = useCallback(async () => {
    if (!window.google?.maps || !destination?.lat) return;
    const ds = await getDirectionsService();
    if (!ds) return;
    const from = driverRef.current?.lat ? driverRef.current : origin;
    ds.route(
      {
        origin: from,
        destination,
        travelMode: window.google.maps.TravelMode?.DRIVING || 'DRIVING',
        drivingOptions: { departureTime: new Date(), trafficModel: 'bestguess' },
        provideRouteAlternatives: true,
      },
      (res, status) => {
        if (status !== 'OK' || !res.routes?.length) return;
        // Fastest route by live traffic duration (fallback to free-flow duration).
        const durOf = (r) => (r.legs?.[0]?.duration_in_traffic?.value || r.legs?.[0]?.duration?.value || Infinity);
        let best = res.routes[0];
        res.routes.forEach((r) => { if (durOf(r) < durOf(best)) best = r; });
        const leg = best.legs[0];
        const dur = leg.duration?.value || 0;
        const durTraffic = leg.duration_in_traffic?.value || dur;
        const path = best.overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() }));
        const sig = `${path.length}:${path[0]?.lat?.toFixed(3)}:${path[Math.floor(path.length / 2)]?.lat?.toFixed(3)}:${path[path.length - 1]?.lat?.toFixed(3)}`;

        // Detect a reroute: a different path that is meaningfully faster (≥ 60 s)
        // than the route we were previously following → "évite les bouchons".
        const prev = prevRouteRef.current;
        const isReroute = prev && prev.sig !== sig && durTraffic <= prev.durTraffic - 60;
        prevRouteRef.current = { sig, durTraffic };

        setRoute({
          path,
          steps: leg.steps.map((s) => ({
            instr: stripHtml(s.instructions),
            dist: s.distance?.text,
            loc: { lat: s.start_location.lat(), lng: s.start_location.lng() },
          })),
          eta: leg.duration?.text,
          etaTraffic: leg.duration_in_traffic?.text || leg.duration?.text,
          distance: leg.distance?.text,
          trafficDelaySec: Math.max(0, durTraffic - dur),
        });

        if (isReroute) {
          spokenRef.current = -1; // re-announce the new first maneuver
          setRerouted(true);
          if (rerouteTimerRef.current) clearTimeout(rerouteTimerRef.current);
          rerouteTimerRef.current = setTimeout(() => setRerouted(false), 12000);
          speakFr('Nouvel itinéraire plus rapide pour éviter les bouchons.');
        }
      }
    );
  }, [destination?.lat, destination?.lng, origin?.lat, origin?.lng, speakFr]);

  // Initial route + re-route every 30 s to keep ETA/maneuvers fresh with traffic.
  useEffect(() => {
    computeRoute();
    const id = setInterval(computeRoute, 30000);
    return () => { clearInterval(id); if (rerouteTimerRef.current) clearTimeout(rerouteTimerRef.current); };
  }, [computeRoute]);

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
  // Heavy traffic if the live ETA is ≥ 2 min slower than the free-flow ETA.
  const heavyTraffic = (route?.trafficDelaySec || 0) >= 120;

  // Speak the maneuver (French) whenever it changes — unless muted.
  useEffect(() => {
    if (!step?.instr) return;
    if (spokenRef.current === stepIdx) return;
    spokenRef.current = stepIdx;
    speakFr(step.instr);
  }, [stepIdx, step, speakFr]);

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

      {/* Live traffic / bouchons / reroute banner */}
      {rerouted ? (
        <div className="bg-emerald-600 text-white px-4 py-1.5 flex items-center gap-2 text-xs font-bold" data-testid="inapp-nav-reroute">
          <NavigationArrow size={16} weight="fill" />
          Itinéraire recalculé — route plus rapide pour éviter les bouchons
        </div>
      ) : heavyTraffic ? (
        <div className="bg-[#E11900] text-white px-4 py-1.5 flex items-center gap-2 text-xs font-bold" data-testid="inapp-nav-traffic-alert">
          <Warning size={16} weight="fill" />
          Bouchons sur l'itinéraire · +{Math.round((route.trafficDelaySec || 0) / 60)} min
        </div>
      ) : null}

      {/* Follow map — driving mode: recenters on the driver with a tight zoom + live traffic */}
      <div className="flex-1 relative">
        <AdminGoogleMap
          center={driverPos?.lat ? driverPos : origin}
          zoom={18}
          driver={driverPos}
          driverHeading={heading}
          routePath={route?.path}
          routeColor="#111111"
          dropoff={destination}
          showTraffic
          cleanUI
        />
      </div>

      {/* ETA (traffic-aware) + Google Maps / Waze switch */}
      <div className="bg-white px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-lg font-extrabold leading-tight ${heavyTraffic ? 'text-[#E11900]' : 'text-gray-900'}`} data-testid="inapp-nav-eta">{route?.etaTraffic || '—'}</p>
          <p className="text-xs text-gray-500 truncate">{route?.distance ? `${route.distance} restants` : 'Itinéraire en direct'}{heavyTraffic ? ' · trafic dense' : route ? ' · trafic fluide' : ''}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {onGoogle && (
            <button onClick={onGoogle} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-white font-bold text-sm" style={{ background: '#1f6feb' }} data-testid="inapp-nav-google">
              <NavigationArrow size={16} weight="fill" /> Google Maps
            </button>
          )}
          <button onClick={onWaze} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-white font-bold text-sm" style={{ background: '#05C8FB' }} data-testid="inapp-nav-waze">
            <NavigationArrow size={16} weight="fill" /> Waze
          </button>
          <button onClick={onClose} className="px-3.5 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm" data-testid="inapp-nav-quit">Quitter</button>
        </div>
      </div>
    </div>
  );
};

export default InAppNav;
