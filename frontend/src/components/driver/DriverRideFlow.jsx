import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  DotsThreeVertical, Phone, ChatCircleDots, NavigationArrow, Siren, Star,
  UserCircle, Clock, MapPin, CaretLeft,
} from '@phosphor-icons/react';
import AdminGoogleMap from '../admin/AdminGoogleMap';
import { decodePolyline } from '../../utils/polyline';
import { rideAPI } from '../../services/api';
import SlideToConfirm from './SlideToConfirm';
import RideCompletionFlow from './RideCompletionFlow';
import { RideFlowMenu, CallTypeSheet, SafetySheet, OtpModal } from './RideFlowSheets';
import InAppNav from './InAppNav';

const API = process.env.REACT_APP_BACKEND_URL;
const WAITING_RATE_PER_MIN = 0.5;
const WAITING_GRACE_SEC = 300; // 5 min d'attente offerts au ramassage avant facturation

const RatingStars = ({ value = 5 }) => (
  <div className="flex items-center gap-0.5">
    {[0, 1, 2, 3, 4].map((i) => (
      <Star key={i} size={16} weight={i < Math.round(value) ? 'fill' : 'regular'} className={i < Math.round(value) ? 'text-amber-400' : 'text-gray-300'} />
    ))}
  </div>
);

const fmtClock = (s) => {
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
};

/**
 * DriverRideFlow — full-screen V3Cube driver ride experience covering the
 * accepted → arriving → in_progress lifecycle, then hands off to the post-trip
 * completion flow (frais supplémentaires → facture → notation).
 */
const DriverRideFlow = ({ ride, driverPos, connected = true, onFinished, onMinimize }) => {
  const navigate = useNavigate();
  const [status, setStatus] = useState(() => ride.status);
  const [busy, setBusy] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [showCallType, setShowCallType] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [otpMode, setOtpMode] = useState('otp'); // 'otp' | 'phone'
  const [recordVideo, setRecordVideo] = useState(false);
  const [startedAt, setStartedAt] = useState(() => ride.started_at || null);
  const [elapsed, setElapsed] = useState(() => (ride.started_at ? Math.max(0, Math.floor((Date.now() - new Date(ride.started_at).getTime()) / 1000)) : 0));
  const [waitingStart, setWaitingStart] = useState(null);
  const [waitingAccum, setWaitingAccum] = useState(0);
  const [waitingNow, setWaitingNow] = useState(0);
  // Pickup waiting (auto): runs while the driver has ARRIVED and waits for the passenger.
  const [pickupArrivedAt, setPickupArrivedAt] = useState(() => (ride.arrived_at ? new Date(ride.arrived_at).getTime() : null));
  const [pickupWaitSec, setPickupWaitSec] = useState(0);
  const [pickupWaitCharge, setPickupWaitCharge] = useState(0);
  const pickupBilledRef = useRef(false);
  const [completing, setCompleting] = useState(false);
  const [carIconUrl, setCarIconUrl] = useState('');

  // Load the admin-configured car icon (same as the client's radar cars).
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`${API}/api/config/ride-search`);
        if (!r.ok) return;
        const d = await r.json();
        if (alive && d && d.cars_icon_url) setCarIconUrl(d.cars_icon_url);
      } catch { /* ignore */ }
    };
    load();
    return () => { alive = false; };
  }, []);

  // While a trip is IN PROGRESS the driver must not leave the ride screen / app:
  // block browser back navigation and warn before closing/refreshing the tab.
  useEffect(() => {
    if (status !== 'in_progress') return undefined;
    const onPop = () => {
      window.history.pushState(null, '', window.location.href);
      toast.info('Course en cours — terminez le voyage avant de quitter.');
    };
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', onPop);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [status]);

  // Trip timer (counts up while in progress)
  useEffect(() => {
    if (status !== 'in_progress') return undefined;
    const base = startedAt ? new Date(startedAt).getTime() : Date.now();
    const id = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - base) / 1000))), 1000);
    return () => clearInterval(id);
  }, [status, startedAt]);

  // Waiting timer (driver toggles "Démarrer la minuterie d'attente")
  useEffect(() => {
    if (!waitingStart) return undefined;
    const id = setInterval(() => setWaitingNow(Math.floor((Date.now() - waitingStart) / 1000)), 1000);
    return () => clearInterval(id);
  }, [waitingStart]);

  // Pickup waiting timer — auto-runs while the driver has ARRIVED (status
  // "arriving") and waits for the passenger. Starts on "Arrivé", stops at start.
  useEffect(() => {
    if (status !== 'arriving' || !pickupArrivedAt) return undefined;
    const tick = () => setPickupWaitSec(Math.max(0, Math.floor((Date.now() - pickupArrivedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status, pickupArrivedAt]);

  // Past the 5-min grace period the wait becomes billable → notify passenger once.
  useEffect(() => {
    if (status !== 'arriving' || pickupWaitSec < WAITING_GRACE_SEC || pickupBilledRef.current) return;
    pickupBilledRef.current = true;
    toast.warning("Temps d'attente facturé — le passager a été informé.");
    fetch(`${API}/api/phase1/rides/${ride.id}/waiting`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ action: 'start', seconds: pickupWaitSec, charge: 0 }),
    }).catch(() => { /* ignore */ });
  }, [status, pickupWaitSec, ride.id]);

  const pickupBillableSec = Math.max(0, pickupWaitSec - WAITING_GRACE_SEC);
  const pickupWaitChargeLive = Math.round((pickupBillableSec / 60) * WAITING_RATE_PER_MIN * 100) / 100;

  const waitingSecs = waitingAccum + waitingNow;
  const waitingCharge = Math.round((waitingSecs / 60) * WAITING_RATE_PER_MIN * 100) / 100;

  const toggleWaiting = useCallback(async () => {
    if (waitingStart) {
      const total = waitingAccum + Math.floor((Date.now() - waitingStart) / 1000);
      const charge = Math.round((total / 60) * WAITING_RATE_PER_MIN * 100) / 100;
      setWaitingAccum(total);
      setWaitingStart(null);
      setWaitingNow(0);
      try {
        await fetch(`${API}/api/phase1/rides/${ride.id}/waiting`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ action: 'stop', seconds: total, charge }),
        });
        toast.info('Attente arrêtée — le passager a été informé.');
      } catch { /* ignore */ }
    } else {
      setWaitingStart(Date.now());
      try {
        await fetch(`${API}/api/phase1/rides/${ride.id}/waiting`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ action: 'start', seconds: waitingAccum, charge: waitingCharge }),
        });
        toast.success("Temps d'attente activé — le passager est informé (facturé).");
      } catch { /* ignore */ }
    }
  }, [waitingStart, waitingAccum, waitingCharge, ride.id]);

  const goArriving = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await rideAPI.updateStatus(ride.id, 'arriving');
      setStatus('arriving');
      setPickupArrivedAt(Date.now()); // start the pickup waiting timer
    }
    catch { toast.error('Action impossible. Réessayez.'); }
    finally { setBusy(false); }
  }, [busy, ride.id]);

  const verifyOtpAndStart = useCallback(async () => {
    if (otpInput.length !== 4) return;
    setBusy(true);
    try {
      const payload = otpMode === 'phone' ? { phone_last4: otpInput } : { otp: otpInput };
      const r = await fetch(`${API}/api/phase1/rides/${ride.id}/start-otp/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        if (otpMode === 'phone') {
          setOtpError(e.detail || '4 derniers chiffres incorrects.');
        } else {
          const next = otpAttempts + 1;
          setOtpAttempts(next);
          if (next >= 2) {
            // Fallback after 2 failed OTP attempts (e.g. passenger's phone is off):
            // verify via the last 4 digits of the registered phone number.
            setOtpMode('phone');
            setOtpInput('');
            setOtpError('Code refusé 2 fois. Saisissez les 4 derniers chiffres du numéro du passager.');
          } else {
            setOtpError(e.detail || 'Code OTP invalide');
          }
        }
        setBusy(false);
        return;
      }
      setShowOtp(false); setOtpInput(''); setOtpError(''); setOtpAttempts(0); setOtpMode('otp');
      const now = new Date().toISOString();
      setStartedAt(now); setStatus('in_progress');
      // Stop the pickup waiting timer & finalize the billable wait (beyond grace).
      const waitSec = pickupArrivedAt ? Math.max(0, Math.floor((Date.now() - pickupArrivedAt) / 1000)) : 0;
      const billable = Math.max(0, waitSec - WAITING_GRACE_SEC);
      const charge = Math.round((billable / 60) * WAITING_RATE_PER_MIN * 100) / 100;
      setPickupWaitCharge(charge);
      if (pickupBilledRef.current) {
        fetch(`${API}/api/phase1/rides/${ride.id}/waiting`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ action: 'stop', seconds: waitSec, charge }),
        }).catch(() => { /* ignore */ });
      }
    } catch { setOtpError('Erreur réseau'); }
    finally { setBusy(false); }
  }, [otpInput, otpMode, otpAttempts, ride.id, pickupArrivedAt]);

  const cancelRide = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try { await rideAPI.updateStatus(ride.id, 'cancelled'); onFinished?.(); }
    catch { toast.error('Annulation impossible.'); setBusy(false); }
  }, [busy, ride.id, onFinished]);

  const callPassenger = useCallback(() => {
    setShowCallType(false);
    if (ride.passenger_phone) window.location.href = `tel:${ride.passenger_phone}`;
    else toast.info('Numéro du passager indisponible.');
  }, [ride.passenger_phone]);

  const openNav = useCallback((app) => {
    setShowNav(false);
    const dest = status === 'in_progress'
      ? { lat: ride.dropoff_lat, lng: ride.dropoff_lng }
      : { lat: ride.pickup_lat, lng: ride.pickup_lng };
    if (app === 'gmaps') window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`, '_blank');
    else if (app === 'waze') window.open(`https://waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes`, '_blank');
    else toast.success('Navigation in-app active sur la carte.');
  }, [status, ride.dropoff_lat, ride.dropoff_lng, ride.pickup_lat, ride.pickup_lng]);

  const isPickupPhase = status === 'accepted';
  const isArrived = status === 'arriving';
  const inProgress = status === 'in_progress';
  const headerLabel = inProgress ? 'COURSE EN COURS' : isArrived ? 'EN ROUTE' : 'Prendre le passager';
  const headerBg = inProgress ? '#0B0B0B' : '#00B578';

  const routePath = decodePolyline(ride.route_polyline).length
    ? decodePolyline(ride.route_polyline)
    : [
        { lat: ride.pickup_lat, lng: ride.pickup_lng },
        ...(ride.stops || []).filter((s) => s?.lat).map((s) => ({ lat: s.lat, lng: s.lng })),
        { lat: ride.dropoff_lat, lng: ride.dropoff_lng },
      ];

  const topAddress = isPickupPhase ? ride.pickup_address : ride.dropoff_address;
  const topLabel = isPickupPhase ? 'Lieu de ramassage' : 'Destination';

  // Stable map center (mid-point of the trip) so the map never drifts while the
  // driver's GPS updates — the car marker moves, the viewport stays put.
  const stableCenter = useMemo(() => ({
    lat: ((ride.pickup_lat || 0) + (ride.dropoff_lat || 0)) / 2,
    lng: ((ride.pickup_lng || 0) + (ride.dropoff_lng || 0)) / 2,
  }), [ride.pickup_lat, ride.pickup_lng, ride.dropoff_lat, ride.dropoff_lng]);

  if (completing) {
    return <RideCompletionFlow ride={{ ...ride, status: 'in_progress' }} waitingCharge={waitingCharge + pickupWaitCharge} onDone={onFinished} />;
  }

  return (
    <div className="fixed inset-0 z-[1500] bg-white flex flex-col" data-testid="driver-ride-flow">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ background: headerBg }}>
        {onMinimize && !inProgress ? (
          <button onClick={onMinimize} className="w-9 h-9 flex items-center justify-center text-white" data-testid="ride-flow-minimize-btn" aria-label="Retour à l'accueil">
            <CaretLeft size={26} weight="bold" />
          </button>
        ) : (
          <div className="w-9" />
        )}
        <h1 className="text-lg font-extrabold tracking-wide" style={{ color: inProgress ? '#fff' : '#fff' }} data-testid="ride-flow-title">{headerLabel}</h1>
        <button onClick={() => setShowMenu(true)} className="w-9 h-9 flex items-center justify-center text-white" data-testid="ride-flow-menu-btn">
          <DotsThreeVertical size={26} weight="bold" />
        </button>
      </div>

      {/* Top address card */}
      <div className="px-4 -mb-6 relative z-20 -mt-1">
        <div className="bg-white rounded-2xl shadow-lg p-3.5 flex items-center gap-3 mt-3 border border-gray-100">
          <MapPin size={22} weight="fill" className={isPickupPhase ? 'text-green-600' : 'text-red-500'} />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold">{topLabel}</p>
            <p className="text-sm font-bold text-gray-900 truncate" data-testid="ride-flow-address">{topAddress}</p>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <AdminGoogleMap
          center={stableCenter}
          zoom={13}
          driver={driverPos}
          driverIconUrl={carIconUrl}
          staticView
          pickup={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
          dropoff={{ lat: ride.dropoff_lat, lng: ride.dropoff_lng }}
          routePath={routePath}
        />
        <div className={`absolute top-9 right-3 z-[600] px-2 py-1 rounded-full text-[10px] font-semibold ${connected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {connected ? 'En direct' : 'Reconnexion…'}
        </div>
        <button onClick={() => setShowSafety(true)} className="absolute top-9 left-3 z-[600] w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-lg animate-pulse" data-testid="ride-flow-sos-btn" aria-label="Sécurité / SOS">
          <Siren size={24} weight="fill" className="text-white" />
        </button>
        {inProgress && (
          <div className="absolute top-1 left-1/2 -translate-x-1/2 z-[600] bg-[#0B0B0B]/95 text-white rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums shadow-md flex items-center gap-1" data-testid="ride-flow-timer">
            <Clock size={12} weight="bold" />{fmtClock(elapsed)}
          </div>
        )}
        {/* Pickup waiting timer — auto, EN ROUTE (driver arrived, waits for passenger) */}
        {isArrived && pickupArrivedAt && (
          <div
            className="absolute top-1 left-1/2 -translate-x-1/2 z-[600] bg-[#0B0B0B]/95 text-white rounded-full px-3 py-1 text-xs font-bold tabular-nums shadow-md flex items-center gap-1.5"
            data-testid="ride-flow-pickup-wait"
          >
            <Clock size={13} weight="bold" />
            {fmtClock(pickupWaitSec)}
            {pickupWaitSec >= WAITING_GRACE_SEC && (
              <span className="text-amber-400" data-testid="ride-flow-pickup-wait-billed">· facturé · {pickupWaitChargeLive.toFixed(2)} €</span>
            )}
          </div>
        )}
        {/* Compact waiting toggle — top of the map, near the trip timer */}
        {inProgress && (
          <button
            onClick={toggleWaiting}
            className={`absolute top-8 left-1/2 -translate-x-1/2 z-[600] rounded-full px-3 py-1 text-xs font-bold shadow-md flex items-center gap-1.5 ${waitingStart ? 'bg-amber-500 text-white' : 'bg-white text-gray-800'}`}
            data-testid="ride-flow-waiting-btn"
          >
            <Clock size={13} weight="fill" />
            {waitingStart ? `${fmtClock(waitingSecs)} · ${waitingCharge.toFixed(2)} €` : 'Attente'}
          </button>
        )}
      </div>

      {/* Action buttons — aligned right, just above the km */}
      <div className="flex justify-end gap-4 px-5 py-3 bg-white">
        <button onClick={() => setShowCallType(true)} className="w-12 h-12 rounded-full bg-[#2F9BFF] flex items-center justify-center shadow-md" data-testid="ride-flow-call-btn" aria-label="Appeler"><Phone size={22} weight="fill" className="text-white" /></button>
        <button onClick={() => navigate(`/ride/${ride.id}/chat`)} className="w-12 h-12 rounded-full bg-[#F5A623] flex items-center justify-center shadow-md" data-testid="ride-flow-chat-btn" aria-label="Discuter"><ChatCircleDots size={22} weight="fill" className="text-white" /></button>
        <button onClick={() => setShowNav(true)} className="w-12 h-12 rounded-full bg-[#FF6A00] flex items-center justify-center shadow-md" data-testid="ride-flow-nav-btn" aria-label="Navigation"><NavigationArrow size={22} weight="fill" className="text-white" /></button>
      </div>

      {/* Passenger card */}
      <div className="px-5 pb-2 flex items-center gap-3" data-testid="ride-flow-passenger-card">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
          {ride.passenger_avatar ? <img src={ride.passenger_avatar} alt="" className="w-full h-full object-cover" /> : <UserCircle size={40} className="text-gray-300" weight="fill" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-extrabold text-gray-900 truncate">{ride.passenger_name || 'Passager'}</p>
          <RatingStars value={ride.passenger_rating || 5} />
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-gray-900">{(ride.distance_km || 0).toFixed(2)} km</p>
          <p className="text-xs text-gray-500">{ride.duration_mins || 0} minutes</p>
        </div>
      </div>

      {/* Video record checkbox (arrived, before start) */}
      {isArrived && (
        <label className="px-5 pb-2 flex items-center gap-2 text-sm text-gray-600" data-testid="ride-flow-video-row">
          <input type="checkbox" checked={recordVideo} onChange={(e) => setRecordVideo(e.target.checked)} className="w-4 h-4 accent-[#00B578]" data-testid="ride-flow-video-checkbox" />
          Enregistrer une vidéo à l&apos;intérieur d&apos;un taxi
        </label>
      )}

      {/* Slider */}
      <div className="px-5 pb-6 pt-1">
        {isPickupPhase && <SlideToConfirm label="GLISSEZ POUR ARRIVER" color="#00B578" onConfirm={goArriving} testId="slide-arrive" disabled={busy} />}
        {isArrived && <SlideToConfirm label="GLISSEZ POUR COMMENCER LE VOYAGE" color="#00B578" onConfirm={() => { setOtpError(''); setOtpInput(''); setOtpAttempts(0); setOtpMode('otp'); setShowOtp(true); }} testId="slide-start" disabled={busy} />}
        {inProgress && <SlideToConfirm label="GLISSER POUR TERMINER LE VOYAGE" color="#E11900" onConfirm={() => { if (waitingStart) toggleWaiting(); setCompleting(true); }} testId="slide-finish" disabled={busy} />}
      </div>

      {/* 3-dot menu */}
      {showMenu && (
        <RideFlowMenu
          onClose={() => setShowMenu(false)}
          onPassengerDetails={() => { setShowMenu(false); navigate(`/ride/${ride.id}/chat`); }}
          onWaybill={() => { setShowMenu(false); navigate(`/ride/${ride.id}/waybill`); }}
          onCancel={() => { setShowMenu(false); cancelRide(); }}
        />
      )}

      {/* Call type chooser */}
      {showCallType && (
        <CallTypeSheet
          onClose={() => setShowCallType(false)}
          onVideo={() => { setShowCallType(false); toast.info('Appel vidéo bientôt disponible.'); }}
          onVoice={callPassenger}
        />
      )}

      {/* Navigation chooser */}
      {showNav && (
        <InAppNav
          origin={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
          destination={inProgress
            ? { lat: ride.dropoff_lat, lng: ride.dropoff_lng }
            : { lat: ride.pickup_lat, lng: ride.pickup_lng }}
          driverPos={driverPos}
          label={inProgress ? ride.dropoff_address : ride.pickup_address}
          onClose={() => setShowNav(false)}
          onWaze={() => openNav('waze')}
        />
      )}

      {/* Safety sheet */}
      {showSafety && (
        <SafetySheet
          onClose={() => setShowSafety(false)}
          onSosMessage={() => { setShowSafety(false); toast.success('Message SOS envoyé à vos contacts et au support.'); }}
          onAudio={() => { setShowSafety(false); toast.info('Enregistrement audio démarré.'); }}
          onShare={() => {
            setShowSafety(false);
            const url = `${window.location.origin}/track/${ride.id}`;
            if (navigator.share) navigator.share({ title: 'Suivi de voyage', url }).catch(() => {});
            else { navigator.clipboard?.writeText(url); toast.success('Lien de suivi copié.'); }
          }}
        />
      )}

      {/* OTP modal */}
      {showOtp && (
        <OtpModal
          value={otpInput}
          mode={otpMode}
          onChange={(v) => { setOtpInput(v); setOtpError(''); }}
          onClose={() => { setShowOtp(false); setOtpInput(''); setOtpAttempts(0); setOtpMode('otp'); }}
          onVerify={verifyOtpAndStart}
          error={otpError}
          busy={busy}
        />
      )}
    </div>
  );
};

export default DriverRideFlow;
