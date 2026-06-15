import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AirplaneTilt, MapPin, IdentificationCard } from '@phosphor-icons/react';
import { AirportVipSign } from './AirportVipSign';
import { decodePolyline } from '../../utils/polyline';
import { rideAPI } from '../../services/api';
import RideCompletionFlow from './RideCompletionFlow';
import { RideFlowMenu, CallTypeSheet, OtpModal, RefundClientModal } from './RideFlowSheets';
import { SafetyToolsSheet } from '../safety/SafetyToolsSheet';
import { RideFlowHeader, RideFlowAddressCard, RideFlowMap, RideFlowFooter } from './RideFlowViews';
import InAppNav from './InAppNav';
import DriverVoiceControl from './DriverVoiceControl';
import { useLocale } from '../../contexts/LocaleContext';

const API = process.env.REACT_APP_BACKEND_URL;
const WAITING_RATE_PER_MIN = 0.5;
const WAITING_GRACE_SEC = 300; // 5 min d'attente offerts au ramassage avant facturation

const fmtClock = (s) => {
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
};

// Distance in metres between two lat/lng points (haversine).
const distanceMeters = (a, b) => {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const NEAR_DESTINATION_M = 200;

/**
 * DriverRideFlow — full-screen V3Cube driver ride experience covering the
 * accepted → arriving → in_progress lifecycle, then hands off to the post-trip
 * completion flow (frais supplémentaires → facture → notation).
 */
const DriverRideFlow = ({ ride, driverPos, connected = true, askOtp = true, onFinished, onMinimize }) => {
  const navigate = useNavigate();
  const { t } = useLocale();
  // Airport Transfer: longer free-wait window (default 45 min) + airport waiting rate.
  const isAirport = ride.ride_type === 'airport';
  const freeWaitSec = isAirport && ride.free_wait_minutes ? ride.free_wait_minutes * 60 : WAITING_GRACE_SEC;
  const waitRate = ride.waiting_rate_per_min || WAITING_RATE_PER_MIN;
  const [status, setStatus] = useState(() => ride.status);
  const [busy, setBusy] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [showVipSign, setShowVipSign] = useState(false);
  const [showCallType, setShowCallType] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [otpMode, setOtpMode] = useState('otp'); // 'otp' | 'phone'
  const [recordVideo, setRecordVideo] = useState(false);
  const [startedAt, setStartedAt] = useState(() => ride.started_at || null);
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
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showArrivalConfirm, setShowArrivalConfirm] = useState(false);

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
    if (status !== 'arriving' || pickupWaitSec < freeWaitSec || pickupBilledRef.current) return;
    pickupBilledRef.current = true;
    toast.warning("Temps d'attente facturé — le passager a été informé.");
    fetch(`${API}/api/phase1/rides/${ride.id}/waiting`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ action: 'start', seconds: pickupWaitSec, charge: 0 }),
    }).catch(() => { /* ignore */ });
  }, [status, pickupWaitSec, ride.id]);

  const pickupBillableSec = Math.max(0, pickupWaitSec - freeWaitSec);
  const pickupWaitChargeLive = Math.round((pickupBillableSec / 60) * waitRate * 100) / 100;

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

  // Guard against premature "arrived": if the driver is still far from the
  // pickup (wrong address / GPS drift happens), ask them to confirm.
  const requestArriving = useCallback(() => {
    if (busy) return;
    const dist = distanceMeters(driverPos, { lat: ride.pickup_lat, lng: ride.pickup_lng });
    if (dist != null && dist > NEAR_DESTINATION_M) setShowArrivalConfirm(true);
    else goArriving();
  }, [busy, driverPos, ride.pickup_lat, ride.pickup_lng, goArriving]);

  const applyStarted = useCallback(() => {
    const now = new Date().toISOString();
    setStartedAt(now); setStatus('in_progress');
    setShowNav(true); // GPS interne : lance automatiquement la navigation vers la destination
    // Stop the pickup waiting timer & finalize the billable wait (beyond grace).
    const waitSec = pickupArrivedAt ? Math.max(0, Math.floor((Date.now() - pickupArrivedAt) / 1000)) : 0;
    const billable = Math.max(0, waitSec - freeWaitSec);
    const charge = Math.round((billable / 60) * waitRate * 100) / 100;
    setPickupWaitCharge(charge);
    if (pickupBilledRef.current) {
      fetch(`${API}/api/phase1/rides/${ride.id}/waiting`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action: 'stop', seconds: waitSec, charge }),
      }).catch(() => { /* ignore */ });
    }
  }, [pickupArrivedAt, ride.id, ride.dropoff_lat, ride.dropoff_lng]);

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
      applyStarted();
    } catch { setOtpError('Erreur réseau'); }
    finally { setBusy(false); }
  }, [otpInput, otpMode, otpAttempts, ride.id, applyStarted]);

  // Start the trip directly when OTP is disabled in App Settings (ask_otp_before_start=false).
  const startTripDirect = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/phase1/rides/${ride.id}/start-otp/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ skip_otp: true }),
      });
      if (!r.ok) { toast.error('Démarrage impossible. Réessayez.'); setBusy(false); return; }
      applyStarted();
    } catch { toast.error('Erreur réseau'); }
    finally { setBusy(false); }
  }, [busy, ride.id, applyStarted]);

  const cancelRide = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try { await rideAPI.updateStatus(ride.id, 'cancelled'); onFinished?.(); }
    catch { toast.error('Annulation impossible.'); setBusy(false); }
  }, [busy, ride.id, onFinished]);

  const callPassenger = useCallback(() => {
    setShowCallType(false);
    fetch(`${API}/api/moderation/call-log`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ride_id: ride.id }) }).catch(() => {});
    if (ride.passenger_phone) window.location.href = `tel:${ride.passenger_phone}`;
    else if (ride.passenger_phone_hidden) {
      const at = ride.passenger_phone_reveal_at ? new Date(ride.passenger_phone_reveal_at).toLocaleString('fr-FR') : null;
      toast.info(at ? `Numéro disponible à partir de ${at}. En attendant, utilisez le chat in-app.` : 'Le numéro sera visible à l\'approche de la prise en charge. Utilisez le chat in-app.');
    }
    else toast.info('Numéro du passager indisponible.');
  }, [ride.passenger_phone, ride.passenger_phone_hidden, ride.passenger_phone_reveal_at, ride.id]);

  const beginStart = useCallback(() => {
    if (!askOtp) { startTripDirect(); return; }
    setOtpError(''); setOtpInput(''); setOtpAttempts(0); setOtpMode('otp'); setShowOtp(true);
  }, [askOtp, startTripDirect]);

  const openNav = useCallback((app) => {
    setShowNav(false);
    const dest = status === 'in_progress'
      ? { lat: ride.dropoff_lat, lng: ride.dropoff_lng }
      : { lat: ride.pickup_lat, lng: ride.pickup_lng };
    if (app === 'gmaps') window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`, '_blank');
    else if (app === 'waze') window.open(`https://waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes`, '_blank');
  }, [status, ride.dropoff_lat, ride.dropoff_lng, ride.pickup_lat, ride.pickup_lng]);

  const isPickupPhase = status === 'accepted';
  const isArrived = status === 'arriving';
  const inProgress = status === 'in_progress';
  const headerLabel = inProgress ? t('driver.header_in_progress') : isArrived ? t('driver.header_enroute') : t('driver.header_pickup');
  const headerBg = inProgress ? '#0B0B0B' : '#FF5000';

  // Distance from the driver to the drop-off — drives the "near destination"
  // finish hint (auto-nudge ≤ 200 m) and the "finish far away" confirmation.
  const distToDropoff = distanceMeters(driverPos, { lat: ride.dropoff_lat, lng: ride.dropoff_lng });
  const nearDestination = distToDropoff != null && distToDropoff <= NEAR_DESTINATION_M;

  // Slide-to-finish: complete directly when near the destination, otherwise ask
  // the driver to confirm finishing while still far away.
  const handleFinish = useCallback(() => {
    if (waitingStart) toggleWaiting();
    if (distToDropoff == null || distToDropoff <= NEAR_DESTINATION_M) {
      setCompleting(true);
    } else {
      setShowFinishConfirm(true);
    }
  }, [waitingStart, toggleWaiting, distToDropoff]);

  const routePath = decodePolyline(ride.route_polyline).length
    ? decodePolyline(ride.route_polyline)
    : [
        { lat: ride.pickup_lat, lng: ride.pickup_lng },
        ...(ride.stops || []).filter((s) => s?.lat).map((s) => ({ lat: s.lat, lng: s.lng })),
        { lat: ride.dropoff_lat, lng: ride.dropoff_lng },
      ];

  const topAddress = isPickupPhase ? ride.pickup_address : ride.dropoff_address;
  const topLabel = isPickupPhase ? t('driver.pickup_location') : t('driver.destination');

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
      <RideFlowHeader
        headerBg={headerBg}
        headerLabel={headerLabel}
        showMinimize={!!onMinimize}
        onMinimize={onMinimize}
        onMenu={() => setShowMenu(true)}
      />

      <RideFlowAddressCard label={topLabel} address={topAddress} isPickupPhase={isPickupPhase} />

      {isAirport && (
        <div className="mx-3 mb-1 rounded-xl bg-sky-50 border border-sky-200 p-2.5" data-testid="driver-airport-info">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-black text-sky-900">
              <AirplaneTilt size={18} weight="fill" className="text-[#0EA5E9]" /> Vol {ride.flight_number || '—'}
              {ride.airport_terminal ? <span className="text-xs font-bold text-sky-700">· {ride.airport_terminal}</span> : null}
            </span>
            {ride.flight_status?.status && (
              <span data-testid="driver-flight-status" className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                ride.flight_status.status === 'delayed' ? 'bg-amber-100 text-amber-700'
                : ride.flight_status.status === 'cancelled' ? 'bg-red-100 text-red-700'
                : ride.flight_status.status === 'early' ? 'bg-blue-100 text-blue-700'
                : 'bg-emerald-100 text-emerald-700'}`}>
                {ride.flight_status.status === 'delayed' ? `Retard ${ride.flight_status.delay_minutes} min`
                  : ride.flight_status.status === 'cancelled' ? 'Annulé'
                  : ride.flight_status.status === 'early' ? `Avance ${Math.abs(ride.flight_status.delay_minutes)} min`
                  : 'À l\'heure'}
              </span>
            )}
          </div>
          {ride.meeting_point && (
            <p className="text-[12px] text-sky-800 mt-1 flex items-start gap-1"><MapPin size={14} weight="fill" className="mt-0.5 shrink-0 text-[#0EA5E9]" /> {ride.meeting_point}</p>
          )}
          <p className="text-[11px] text-sky-600 mt-0.5">{ride.free_wait_minutes || 45} min d'attente offertes après arrivée.</p>
          {(isPickupPhase || isArrived) && (
            <button
              onClick={() => setShowVipSign(true)}
              className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-[#0EA5E9] text-white text-sm font-black active:scale-[0.99]"
              data-testid="open-vip-sign-btn"
            >
              <IdentificationCard size={18} weight="fill" /> Pancarte VIP — accueil client
            </button>
          )}
        </div>
      )}


      <RideFlowMap
        mapCenter={stableCenter}
        driver={driverPos}
        driverIconUrl={carIconUrl}
        pickup={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
        dropoff={{ lat: ride.dropoff_lat, lng: ride.dropoff_lng }}
        routePath={routePath}
        connected={connected}
        onSos={() => setShowSafety(true)}
        inProgress={inProgress}
        isArrived={isArrived}
        pickupArrivedAt={pickupArrivedAt}
        pickupWaitLabel={fmtClock(pickupWaitSec)}
        pickupBillable={pickupWaitSec >= freeWaitSec}
        pickupWaitChargeLabel={pickupWaitChargeLive.toFixed(2)}
        waitingActive={!!waitingStart}
        waitingLabel={waitingStart ? `${fmtClock(waitingSecs)} · ${waitingCharge.toFixed(2)} €` : t('driver.waiting')}
        onToggleWaiting={toggleWaiting}
      />

      <RideFlowFooter
        onCall={() => setShowCallType(true)}
        onChat={() => navigate(`/ride/${ride.id}/chat`)}
        onNav={() => setShowNav(true)}
        passengerName={ride.passenger_name}
        passengerAvatar={ride.passenger_avatar}
        passengerRating={ride.passenger_rating}
        distanceKm={ride.distance_km}
        durationMins={ride.duration_mins}
        isArrived={isArrived}
        recordVideo={recordVideo}
        onToggleVideo={(e) => setRecordVideo(e.target.checked)}
        isPickupPhase={isPickupPhase}
        inProgress={inProgress}
        busy={busy}
        nearDestination={nearDestination}
        onArrive={requestArriving}
        onStart={beginStart}
        onFinish={handleFinish}
      />

      {/* Contrôle vocal mains-libres (façon Uber Driver) — sécurité routière */}
      <DriverVoiceControl
        status={status}
        onNavigate={() => setShowNav(true)}
        onCall={callPassenger}
        onArrive={requestArriving}
        onStart={beginStart}
      />

      {/* 3-dot menu */}
      {showMenu && (
        <RideFlowMenu
          onClose={() => setShowMenu(false)}
          onPassengerDetails={() => { setShowMenu(false); navigate(`/ride/${ride.id}/chat`); }}
          onWaybill={() => { setShowMenu(false); navigate(`/ride/${ride.id}/waybill`); }}
          onRefundClient={() => { setShowMenu(false); setShowRefund(true); }}
          onCancel={() => { setShowMenu(false); cancelRide(); }}
        />
      )}

      {/* Refund the client from the driver's wallet (e.g. no cash change) */}
      {showRefund && (
        <RefundClientModal
          rideId={ride.id}
          passengerName={ride.passenger_name}
          onClose={() => setShowRefund(false)}
          onDone={() => setShowRefund(false)}
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
          onGoogle={() => openNav('gmaps')}
        />
      )}

      {/* Safety sheet */}
      {showSafety && (
        <SafetyToolsSheet
          ride={ride}
          onClose={() => setShowSafety(false)}
        />
      )}

      {/* VIP Airport welcome sign */}
      {showVipSign && (
        <AirportVipSign ride={ride} onClose={() => setShowVipSign(false)} />
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

      {/* Finish-far-from-destination confirmation */}
      {showFinishConfirm && (
        <div className="fixed inset-0 z-[1700] bg-black/50 flex items-center justify-center p-6" data-testid="finish-confirm-overlay">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-extrabold text-gray-900 mb-1">{t('driver.finish_trip_q')}</h3>
            <p className="text-sm text-gray-600 mb-4">
              {t('driver.finish_far_warn', { dist: distToDropoff != null ? `${(distToDropoff / 1000).toFixed(1)} km` : t('driver.no_distance') })}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFinishConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm"
                data-testid="finish-confirm-cancel"
              >
                {t('ride.cancel')}
              </button>
              <button
                onClick={() => { setShowFinishConfirm(false); setCompleting(true); }}
                className="flex-1 py-2.5 rounded-xl bg-[#E11900] text-white font-bold text-sm"
                data-testid="finish-confirm-ok"
              >
                {t('driver.yes_finish')}
              </button>
            </div>
          </div>
        </div>
      )}
      {showArrivalConfirm && (
        <div className="fixed inset-0 z-[1700] bg-black/50 flex items-center justify-center p-6" data-testid="arrival-confirm-overlay">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-extrabold text-gray-900 mb-1">Vous n'êtes pas encore à l'adresse</h3>
            <p className="text-sm text-gray-600 mb-4">
              Vous semblez encore loin du point de prise en charge{distanceMeters(driverPos, { lat: ride.pickup_lat, lng: ride.pickup_lng }) != null ? ` (~${(distanceMeters(driverPos, { lat: ride.pickup_lat, lng: ride.pickup_lng }) / 1000).toFixed(1)} km)` : ''}. Le client peut s'être trompé d'adresse. Êtes-vous sûr d'être arrivé&nbsp;?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowArrivalConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm"
                data-testid="arrival-confirm-cancel"
              >
                {t('ride.cancel')}
              </button>
              <button
                onClick={() => { setShowArrivalConfirm(false); goArriving(); }}
                className="flex-1 py-2.5 rounded-xl bg-[#FF5000] text-white font-bold text-sm"
                data-testid="arrival-confirm-ok"
              >
                Oui, je suis arrivé
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverRideFlow;
