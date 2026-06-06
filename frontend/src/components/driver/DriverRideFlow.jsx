import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  DotsThreeVertical, Phone, ChatCircleDots, NavigationArrow, Siren, Star, X,
  VideoCamera, Microphone, ShareNetwork, FileText, UserCircle, Clock, MapPin,
} from '@phosphor-icons/react';
import AdminGoogleMap from '../admin/AdminGoogleMap';
import { decodePolyline } from '../../utils/polyline';
import { rideAPI } from '../../services/api';
import SlideToConfirm from './SlideToConfirm';
import RideCompletionFlow from './RideCompletionFlow';

const API = process.env.REACT_APP_BACKEND_URL;
const WAITING_RATE_PER_MIN = 0.5;

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
const DriverRideFlow = ({ ride, driverPos, connected = true, onFinished }) => {
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
  const [recordVideo, setRecordVideo] = useState(false);
  const [startedAt, setStartedAt] = useState(() => ride.started_at || null);
  const [elapsed, setElapsed] = useState(() => (ride.started_at ? Math.max(0, Math.floor((Date.now() - new Date(ride.started_at).getTime()) / 1000)) : 0));
  const [waitingStart, setWaitingStart] = useState(null);
  const [waitingAccum, setWaitingAccum] = useState(0);
  const [waitingNow, setWaitingNow] = useState(0);
  const [completing, setCompleting] = useState(false);

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

  const waitingSecs = waitingAccum + waitingNow;
  const waitingCharge = Math.round((waitingSecs / 60) * WAITING_RATE_PER_MIN * 100) / 100;

  const toggleWaiting = useCallback(() => {
    if (waitingStart) {
      setWaitingAccum((a) => a + Math.floor((Date.now() - waitingStart) / 1000));
      setWaitingStart(null);
      setWaitingNow(0);
    } else {
      setWaitingStart(Date.now());
    }
  }, [waitingStart]);

  const goArriving = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try { await rideAPI.updateStatus(ride.id, 'arriving'); setStatus('arriving'); }
    catch { toast.error('Action impossible. Réessayez.'); }
    finally { setBusy(false); }
  }, [busy, ride.id]);

  const verifyOtpAndStart = useCallback(async () => {
    if (otpInput.length !== 4) return;
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/phase1/rides/${ride.id}/start-otp/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ otp: otpInput }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); setOtpError(e.detail || 'Code OTP invalide'); setBusy(false); return; }
      setShowOtp(false); setOtpInput(''); setOtpError('');
      const now = new Date().toISOString();
      setStartedAt(now); setStatus('in_progress');
    } catch { setOtpError('Erreur réseau'); }
    finally { setBusy(false); }
  }, [otpInput, ride.id]);

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

  if (completing) {
    return <RideCompletionFlow ride={{ ...ride, status: 'in_progress' }} waitingCharge={waitingCharge} onDone={onFinished} />;
  }

  return (
    <div className="fixed inset-0 z-[1500] bg-white flex flex-col" data-testid="driver-ride-flow">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ background: headerBg }}>
        <div className="w-9" />
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
          center={driverPos || { lat: ride.pickup_lat, lng: ride.pickup_lng }}
          zoom={14}
          driver={driverPos}
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
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[600] bg-[#0B0B0B] text-white rounded-full px-4 py-1.5 font-extrabold tabular-nums shadow-lg" data-testid="ride-flow-timer">
            {fmtClock(elapsed)}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex justify-center gap-5 py-3 bg-white">
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

      {/* Waiting timer (in progress) */}
      {inProgress && (
        <div className="px-5 pb-1">
          <button onClick={toggleWaiting} className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 ${waitingStart ? 'bg-amber-500 text-white' : 'bg-gray-900 text-white'}`} data-testid="ride-flow-waiting-btn">
            <Clock size={18} weight="fill" />
            {waitingStart ? `Attente en cours · ${fmtClock(waitingSecs)} (${waitingCharge.toFixed(2)} €)` : 'Démarrer la minuterie d\'attente'}
          </button>
        </div>
      )}

      {/* Slider */}
      <div className="px-5 pb-6 pt-1">
        {isPickupPhase && <SlideToConfirm label="GLISSEZ POUR ARRIVER" color="#00B578" onConfirm={goArriving} testId="slide-arrive" disabled={busy} />}
        {isArrived && <SlideToConfirm label="GLISSEZ POUR COMMENCER LE VOYAGE" color="#00B578" onConfirm={() => { setOtpError(''); setShowOtp(true); }} testId="slide-start" disabled={busy} />}
        {inProgress && <SlideToConfirm label="GLISSER POUR TERMINER LE VOYAGE" color="#E11900" onConfirm={() => { if (waitingStart) toggleWaiting(); setCompleting(true); }} testId="slide-finish" disabled={busy} />}
      </div>

      {/* 3-dot menu */}
      {showMenu && (
        <div className="fixed inset-0 z-[2600] bg-black/40 flex items-start justify-end p-3 pt-14" onClick={() => setShowMenu(false)} data-testid="ride-flow-menu">
          <div className="bg-white rounded-2xl w-60 overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setShowMenu(false); navigate(`/ride/${ride.id}/chat`); }} className="w-full text-left px-4 py-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 flex items-center gap-3" data-testid="menu-passenger-details"><UserCircle size={20} /> Voir les détails du passager</button>
            <button onClick={() => { setShowMenu(false); toast.info('Lettre de voiture bientôt disponible.'); }} className="w-full text-left px-4 py-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 flex items-center gap-3 border-t border-gray-100" data-testid="menu-waybill"><FileText size={20} /> Lettre de voiture</button>
            <button onClick={() => { setShowMenu(false); cancelRide(); }} className="w-full text-left px-4 py-3.5 text-sm font-semibold text-red-600 hover:bg-red-50 flex items-center gap-3 border-t border-gray-100" data-testid="menu-cancel-trip"><X size={20} /> Annuler le voyage</button>
          </div>
        </div>
      )}

      {/* Call type chooser */}
      {showCallType && (
        <div className="fixed inset-0 z-[2600] bg-black/40 flex items-end" onClick={() => setShowCallType(false)} data-testid="call-type-sheet">
          <div className="w-full bg-white rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-extrabold text-gray-900 mb-4 text-center">Choisissez le type d&apos;appel</p>
            <button onClick={() => { setShowCallType(false); toast.info('Appel vidéo bientôt disponible.'); }} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50 mb-3" data-testid="call-video-btn"><VideoCamera size={24} className="text-[#2F9BFF]" weight="fill" /> <span className="font-bold text-gray-800">Appel vidéo</span></button>
            <button onClick={callPassenger} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50" data-testid="call-voice-btn"><Phone size={24} className="text-[#00B578]" weight="fill" /> <span className="font-bold text-gray-800">Appel vocal</span></button>
          </div>
        </div>
      )}

      {/* Navigation chooser */}
      {showNav && (
        <div className="fixed inset-0 z-[2600] bg-black/40 flex items-end" onClick={() => setShowNav(false)} data-testid="nav-chooser-sheet">
          <div className="w-full bg-white rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-extrabold text-gray-900 mb-4 text-center">Choisissez une option</p>
            <button onClick={() => openNav('inapp')} className="w-full text-left px-4 py-4 rounded-2xl bg-gray-50 mb-3 font-bold text-gray-800" data-testid="nav-inapp-btn">Navigation Google avancée dans l&apos;application <span className="text-[#00B578] text-xs">(recommandé)</span></button>
            <button onClick={() => openNav('gmaps')} className="w-full text-left px-4 py-4 rounded-2xl bg-gray-50 mb-3 font-bold text-gray-800" data-testid="nav-gmaps-btn">Navigation sur Google Map</button>
            <button onClick={() => openNav('waze')} className="w-full text-left px-4 py-4 rounded-2xl bg-gray-50 font-bold text-gray-800" data-testid="nav-waze-btn">Navigation Waze</button>
          </div>
        </div>
      )}

      {/* Safety sheet */}
      {showSafety && (
        <div className="fixed inset-0 z-[2600] bg-black/40 flex items-end" onClick={() => setShowSafety(false)} data-testid="safety-sheet">
          <div className="w-full bg-white rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-extrabold text-gray-900 mb-4 text-center">Outils de sécurité</p>
            <a href="tel:112" className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-red-50 mb-3 font-bold text-red-700" data-testid="safety-call-112"><Phone size={22} weight="fill" /> Appel 112</a>
            <button onClick={() => { setShowSafety(false); toast.success('Message SOS envoyé à vos contacts et au support.'); }} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50 mb-3 font-bold text-gray-800" data-testid="safety-sos-message"><Siren size={22} weight="fill" className="text-red-600" /> Envoyer un message SOS</button>
            <button onClick={() => { setShowSafety(false); toast.info('Enregistrement audio démarré.'); }} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50 mb-3 font-bold text-gray-800" data-testid="safety-audio"><Microphone size={22} weight="fill" /> Enregistrement audio</button>
            <button onClick={() => { setShowSafety(false); const url = `${window.location.origin}/track/${ride.id}`; if (navigator.share) navigator.share({ title: 'Suivi de voyage', url }).catch(() => {}); else { navigator.clipboard?.writeText(url); toast.success('Lien de suivi copié.'); } }} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50 font-bold text-gray-800" data-testid="safety-share"><ShareNetwork size={22} weight="fill" /> Partager le statut du voyage</button>
          </div>
        </div>
      )}

      {/* OTP modal */}
      {showOtp && (
        <div className="fixed inset-0 z-[2700] bg-black/60 flex items-center justify-center p-5" data-testid="ride-flow-otp-modal">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-1">Code de démarrage</h3>
            <p className="text-xs text-gray-500 mb-4">Demandez au passager son code à 4 chiffres pour démarrer la course.</p>
            <input type="text" inputMode="numeric" maxLength="4" value={otpInput} autoFocus
              onChange={(e) => { setOtpInput(e.target.value.replace(/\D/g, '')); setOtpError(''); }}
              placeholder="0000" className="w-full text-center text-3xl tracking-[0.5em] py-3 bg-gray-50 rounded-xl border border-gray-200 font-bold mb-2" data-testid="ride-flow-otp-input" />
            {otpError && <p className="text-xs text-red-500 mb-2 text-center" data-testid="ride-flow-otp-error">{otpError}</p>}
            <div className="flex gap-2 mt-2">
              <button onClick={() => { setShowOtp(false); setOtpInput(''); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-bold text-sm text-gray-600">Annuler</button>
              <button onClick={verifyOtpAndStart} disabled={otpInput.length !== 4 || busy} className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50" style={{ background: '#00B578' }} data-testid="ride-flow-otp-verify-btn">Démarrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverRideFlow;
