import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import DebtBanner from '../../components/DebtBanner';
import { useAuth } from '../../contexts/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { rideAPI } from '../../services/api';
import { Button } from '../../components/ui/button';
import {
  Check, NavigationArrow, Car, Star, Clock, X, Warning, Shield, ArrowLeft,
} from '@phosphor-icons/react';
import TipModal from '../../components/TipModal';
import RideTrackingMap from './ride-tracking/RideTrackingMap';
import RadarCars from '../../components/RadarCars';
import SearchRadar from '../../components/SearchRadar';
import DriverInfoCard from './ride-tracking/DriverInfoCard';
import DriverEnRouteView from './ride-tracking/DriverEnRouteView';
import RouteEditModal from './ride-tracking/RouteEditModal';
import ScheduleCalendarModal from '../../components/ScheduleCalendarModal';
import { CancelRideModal, RatingModal } from './ride-tracking/RideActions';

const API = process.env.REACT_APP_BACKEND_URL;
const GMAP_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;
const RELANCE_INTERVAL_SEC = 20;
const MAX_RELANCES = 3;

// V3Cube-style status notification dialog ("Le chauffeur est arrivé.", etc.)
const StatusDialog = ({ dialog }) => {
  if (!dialog) return null;
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/40 px-8" data-testid="status-dialog">
      <div className="bg-white rounded-2xl w-full max-w-xs p-6 text-center shadow-2xl">
        <p className="text-base font-bold text-gray-900 mb-5" data-testid="status-dialog-text">{dialog.title}</p>
        <button onClick={dialog.onOk} className="text-[#4361EE] font-extrabold text-sm uppercase tracking-wide" data-testid="status-dialog-ok">
          D'accord
        </button>
      </div>
    </div>
  );
};

const STATUS_STEPS = [
  { key: 'pending', label: 'Recherche', icon: Clock },
  { key: 'accepted', label: 'Acceptée', icon: Check },
  { key: 'arriving', label: 'En route', icon: NavigationArrow },
  { key: 'in_progress', label: 'En cours', icon: Car },
  { key: 'completed', label: 'Terminée', icon: Star },
];

const RideTrackingPage = () => {
  const { rideId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { connected, on, joinRide } = useWebSocket(user?.id);

  const [ride, setRide] = useState(null);
  const [driverPos, setDriverPos] = useState(null);
  const [showCancel, setShowCancel] = useState(false);
  const [payMethods, setPayMethods] = useState([
    { id: 'cash', label: 'Espèces' }, { id: 'card', label: 'CB' },
    { id: 'wallet', label: 'Portefeuille' }, { id: 'sbpaygo', label: 'SB PayGo' },
  ]);
  const [showPayPicker, setShowPayPicker] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [cancelPolicy, setCancelPolicy] = useState({ fee: 5, free_min: 5, popup_enabled: true, popup_max_shows: 5, popup_zone: '', count: 0, loaded: false });
  const policyHandledRef = useRef(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [markAsFavorite, setMarkAsFavorite] = useState(false);
  const [startOtp, setStartOtp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelReasons, setCancelReasons] = useState([]);
  const [poolEnabled, setPoolEnabled] = useState(false);
  const [poolMatches, setPoolMatches] = useState([]);
  const [poolGroupMembers, setPoolGroupMembers] = useState(0);
  const [poolSavings, setPoolSavings] = useState(0);
  const [poolDiscountPct, setPoolDiscountPct] = useState(0);
  const [joiningRideId, setJoiningRideId] = useState(null);
  const [statusDialog, setStatusDialog] = useState(null);
  const [showRouteEdit, setShowRouteEdit] = useState(false);
  const [relanceCount, setRelanceCount] = useState(0);
  const [showNoDriver, setShowNoDriver] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [converting, setConverting] = useState(false);
  const [searchCfg, setSearchCfg] = useState({ enabled: true, relance_interval_seconds: RELANCE_INTERVAL_SEC, max_relances: MAX_RELANCES });
  const [nearbyDrivers, setNearbyDrivers] = useState(null);
  const [nearbyPositions, setNearbyPositions] = useState([]);
  const prevStatusRef = useRef(null);
  const relanceRef = useRef(0);

  // Admin-configurable relance cadence & threshold
  useEffect(() => {
    fetch(`${API}/api/config/ride-search`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setSearchCfg(d); })
      .catch(() => {});
  }, []);

  // Live count of nearby online drivers (reassures the passenger while searching)
  useEffect(() => {
    if (ride?.status !== 'pending') { setNearbyDrivers(null); return undefined; }
    let active = true;
    const fetchNearby = async () => {
      try {
        const res = await fetch(`${API}/api/rides/${rideId}/nearby-drivers`, { credentials: 'include' });
        if (active && res.ok) { const d = await res.json(); setNearbyDrivers(d.count ?? 0); setNearbyPositions(d.positions || []); }
      } catch (err) { console.warn('[RideTracking] nearby drivers failed:', err?.message || err); }
    };
    fetchNearby();
    const t = setInterval(fetchNearby, 6000);
    return () => { active = false; clearInterval(t); };
  }, [ride?.status, rideId]);

  // Load admin-configured payment methods for the in-ride switcher
  useEffect(() => {
    fetch(`${API}/api/config/payment-methods`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.methods) && d.methods.length) setPayMethods(d.methods); })
      .catch(() => {});
  }, []);

  // Per-user cancellation-policy popup state (count stored server-side)
  useEffect(() => {
    fetch(`${API}/api/config/cancel-policy/state`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setCancelPolicy({
          fee: d.fee ?? 5,
          free_min: d.free_min ?? 5,
          popup_enabled: d.enabled !== false,
          popup_max_shows: d.max_shows ?? 5,
          popup_zone: d.zone || '',
          count: d.count ?? 0,
          loaded: true,
        });
      })
      .catch(() => {});
  }, []);

  // Cancellation-policy popup — shown for the first N rides per user (admin-set,
  // counted server-side so the limit holds across devices), and only when the
  // pickup is inside the admin-configured zone (country/region).
  useEffect(() => {
    if (!cancelPolicy.loaded || ride?.status !== 'pending' || !rideId || policyHandledRef.current) return;
    if (!cancelPolicy.popup_enabled) return;
    const zone = (cancelPolicy.popup_zone || '').trim().toLowerCase();
    if (zone && !((ride?.pickup_address || '').toLowerCase().includes(zone))) return;
    if ((cancelPolicy.count ?? 0) >= (cancelPolicy.popup_max_shows ?? 5)) return;
    policyHandledRef.current = true;
    setShowPolicy(true);
    fetch(`${API}/api/config/cancel-policy/seen`, { method: 'POST', credentials: 'include' }).catch(() => {});
  }, [cancelPolicy, ride?.status, ride?.pickup_address, rideId]);

  const payLabel = (id) => payMethods.find((m) => m.id === id)?.label || 'Espèces';

  const changePay = async (method) => {
    if (payBusy) return;
    setPayBusy(true);
    try {
      const res = await fetch(`${API}/api/rides/${rideId}/payment-method`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: method }),
      });
      if (res.ok) {
        const d = await res.json();
        setRide((r) => (r ? { ...r, payment_method: method, payment_shortfall: d.shortfall, difference_in_cash: d.difference_in_cash } : r));
        setShowPayPicker(false);
        if (d.difference_in_cash) toast.warning(`Solde insuffisant — différence de ${Number(d.shortfall).toFixed(2)} € à régler en espèces.`);
        else toast.success('Moyen de paiement mis à jour');
      } else { toast.error('Échec du changement de paiement'); }
    } catch (err) {
      console.warn('[RideTracking] change pay failed:', err?.message || err);
      toast.error('Erreur réseau');
    }
    setPayBusy(false);
  };

  const isBiddingMode = ride?.mode === 'bidding' || ride?.is_bidding;

  const doRebroadcast = useCallback(async () => {
    try {
      await fetch(`${API}/api/rides/${rideId}/rebroadcast`, { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.warn('[RideTracking] rebroadcast failed:', err?.message || err);
    }
  }, [rideId]);

  // Auto-relance: re-broadcast the request every cycle; after max_relances, offer alternatives
  useEffect(() => {
    const maxR = searchCfg.max_relances;
    if (!searchCfg.enabled || ride?.status !== 'pending' || isBiddingMode || relanceRef.current >= maxR) return undefined;
    const id = setInterval(async () => {
      relanceRef.current += 1;
      setRelanceCount(relanceRef.current);
      await doRebroadcast();
      if (relanceRef.current >= maxR) {
        setShowNoDriver(true);
        clearInterval(id);
      }
    }, Math.max(5, searchCfg.relance_interval_seconds) * 1000);
    return () => clearInterval(id);
  }, [ride?.status, isBiddingMode, doRebroadcast, searchCfg]);

  const handleManualRelance = useCallback(async () => {
    const maxR = searchCfg.max_relances;
    if (relanceRef.current >= maxR) { if (searchCfg.enabled) setShowNoDriver(true); return; }
    relanceRef.current += 1;
    setRelanceCount(relanceRef.current);
    await doRebroadcast();
    toast.success('Recherche relancée');
    if (searchCfg.enabled && relanceRef.current >= maxR) setShowNoDriver(true);
  }, [doRebroadcast, searchCfg]);

  const handleProposeFare = useCallback(async () => {
    if (!ride) return;
    setConverting(true);
    try {
      const res = await fetch(`${API}/api/rides/${rideId}/convert-to-bidding`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('convert failed');
      const params = new URLSearchParams({
        resume: rideId,
        pickup: ride.pickup_address || '', plat: String(ride.pickup_lat), plng: String(ride.pickup_lng),
        dropoff: ride.dropoff_address || '', dlat: String(ride.dropoff_lat), dlng: String(ride.dropoff_lng),
        vehicle: ride.vehicle_type || 'sb',
      });
      navigate(`/taxi-bidding?${params.toString()}`);
    } catch (err) {
      toast.error('Conversion en enchères impossible');
    }
    setConverting(false);
  }, [ride, rideId, navigate]);

  const handleReschedule = useCallback(async (scheduledAt) => {
    try {
      const res = await fetch(`${API}/api/rides/${rideId}/reschedule`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at: scheduledAt }),
      });
      if (!res.ok) throw new Error('reschedule failed');
      toast.success('Course planifiée');
      setShowSchedule(false);
      setShowNoDriver(false);
      navigate('/scheduled-rides');
    } catch (err) {
      toast.error('Planification impossible');
    }
  }, [rideId, navigate]);

  // Live Taxi Pool matching: poll nearby pending pool rides while pool is on & ride pending
  useEffect(() => {
    if (!poolEnabled || ride?.status !== 'pending') {
      setPoolMatches([]);
      setPoolGroupMembers(0);
      setPoolSavings(0);
      return undefined;
    }
    let active = true;
    const fetchMatches = async () => {
      try {
        const res = await fetch(`${API}/api/phase2/pool/matches/${rideId}`, { credentials: 'include' });
        if (active && res.ok) {
          const d = await res.json();
          setPoolMatches(d.matches || []);
          setPoolGroupMembers(d.group_members || 0);
          setPoolSavings(d.your_savings || 0);
          setPoolDiscountPct(d.discount_percent || 0);
        }
      } catch (err) {
        console.warn('[RideTracking] pool matches failed:', err?.message || err);
      }
    };
    fetchMatches();
    const t = setInterval(fetchMatches, 8000);
    return () => { active = false; clearInterval(t); };
  }, [poolEnabled, ride?.status, rideId]);

  const joinPool = useCallback(async (targetRideId) => {
    if (joiningRideId) return;
    setJoiningRideId(targetRideId);
    try {
      const res = await fetch(`${API}/api/phase2/pool/join/${targetRideId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ride_id: rideId }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Course Pool rejointe · ${d.members || 2} passagers`);
        setPoolMatches((ms) => ms.map((m) => (m.ride_id === targetRideId ? { ...m, joined: true } : m)));
        setPoolGroupMembers(d.members || 0);
        if (d.pool_savings != null) setPoolSavings(d.pool_savings);
        if (d.discount_percent != null) setPoolDiscountPct(d.discount_percent);
        if (d.shared_fare != null) setRide((r) => (r ? { ...r, estimated_fare: d.shared_fare } : r));
      } else {
        toast.error(d.detail || 'Impossible de rejoindre cette course Pool');
      }
    } catch (err) {
      toast.error('Échec du jumelage Pool');
    }
    setJoiningRideId(null);
  }, [joiningRideId, rideId]);

  const poolInitRef = useRef(false);
  const fetchRide = useCallback(async () => {
    try {
      const res = await rideAPI.get(rideId);
      setRide(res.data);
      if (!poolInitRef.current) {
        poolInitRef.current = true;
        setPoolEnabled(!!res.data.pool_enabled);
      }
      if (res.data.driver_lat && res.data.driver_lng) {
        setDriverPos({ lat: res.data.driver_lat, lng: res.data.driver_lng });
      }
      if (res.data.start_otp) setStartOtp(res.data.start_otp);
    } catch (err) {
      console.error('Failed to fetch ride:', err);
    } finally {
      setLoading(false);
    }
  }, [rideId]);

  // Detect status transitions → notification dialogs + navigate to receipt on completion
  useEffect(() => {
    if (!ride) return;
    const prev = prevStatusRef.current;
    const cur = ride.status;
    if (prev === null) {
      prevStatusRef.current = cur;
      if (cur === 'completed') navigate(`/ride/${rideId}/receipt`);
      return;
    }
    if (prev === cur) return;
    prevStatusRef.current = cur;
    if (cur === 'arriving') setStatusDialog({ title: 'Le chauffeur est arrivé.', onOk: () => setStatusDialog(null) });
    else if (cur === 'in_progress') setStatusDialog({ title: 'Votre voyage a commencé.', onOk: () => setStatusDialog(null) });
    else if (cur === 'completed') setStatusDialog({ title: 'Votre voyage est terminé.', onOk: () => navigate(`/ride/${rideId}/receipt`) });
  }, [ride, rideId, navigate]);

  // Initial load + cancel reasons (run once per rideId change)
  useEffect(() => {
    fetchRide();
    fetch(`${API}/api/config/cancel-reasons?user_type=User`)
      .then((r) => r.json())
      .then(setCancelReasons)
      .catch((e) => console.warn('cancel reasons load failed:', e?.message || e));
  }, [fetchRide]);

  // Join WS ride room when connected
  useEffect(() => {
    if (connected && rideId) joinRide(rideId);
  }, [connected, rideId, joinRide]);

  // Polling fallback (covers environments where the WebSocket is unavailable):
  // keep the ride status fresh so notifications + receipt navigation always fire.
  useEffect(() => {
    if (!ride || ['completed', 'cancelled'].includes(ride.status)) return undefined;
    const id = setInterval(fetchRide, 5000);
    return () => clearInterval(id);
  }, [ride?.status, fetchRide]);

  // Subscribe to live ride events
  useEffect(() => {
    const unsub1 = on('ride_status_update', (msg) => {
      if (msg.ride_id !== rideId) return;
      setRide((prev) =>
        prev ? { ...prev, status: msg.status, otp: msg.otp || prev.otp, final_fare: msg.final_fare || prev.final_fare } : prev
      );
    });
    const unsubStarted = on('ride_started', (msg) => {
      if (msg.ride_id !== rideId) return;
      setRide((prev) => (prev ? { ...prev, status: 'in_progress', started_at: msg.started_at } : prev));
    });
    const unsub2 = on('ride_accepted', (msg) => {
      if (msg.ride_id !== rideId) return;
      setRide((prev) =>
        prev
          ? {
              ...prev,
              status: 'accepted',
              driver_id: msg.driver_id,
              driver_name: msg.driver_name,
              driver_phone: msg.driver_phone,
              driver_rating: msg.driver_rating,
              driver_vehicle_model: msg.driver_vehicle_model,
              driver_vehicle_number: msg.driver_vehicle_number,
            }
          : prev
      );
    });
    const unsub3 = on('driver_location', (msg) => {
      if (msg.ride_id === rideId) setDriverPos({ lat: msg.lat, lng: msg.lng });
    });
    const unsub4 = on('ride_auto_cancelled', (msg) => {
      if (msg.ride_id !== rideId) return;
      toast.error('Course annulée automatiquement', {
        description: msg.reason || 'Aucun chauffeur disponible dans votre zone.',
        duration: 7000,
      });
      setRide((prev) => (prev ? { ...prev, status: 'cancelled', cancel_reason: msg.reason } : prev));
      setTimeout(() => navigate('/home'), 4000);
    });
    return () => {
      unsub1();
      unsubStarted();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [on, rideId, navigate]);

  const handleCancel = async (reason) => {
    try {
      await rideAPI.cancel(rideId, reason);
      setRide((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
      setShowCancel(false);
    } catch (err) {
      console.error('Cancel error:', err);
    }
  };

  const handleRate = async () => {
    try {
      await rideAPI.rate(rideId, { rating, comment: '' });
      if (markAsFavorite && ride?.driver_id) {
        try {
          await fetch(`${API}/api/phase1/favorite-drivers/${ride.driver_id}`, {
            method: 'POST',
            credentials: 'include',
          });
        } catch (err) {
          console.warn('[RideTracking] favorite driver failed:', err?.message || err);
        }
      }
    } catch (err) {
      console.warn('[RideTracking] rating failed:', err?.message || err);
    }
    navigate('/home');
  };

  const requestStartOtp = async () => {
    try {
      const r = await fetch(`${API}/api/phase1/rides/${rideId}/start-otp/request`, {
        method: 'POST',
        credentials: 'include',
      });
      if (r.ok) {
        const d = await r.json();
        setStartOtp(d.otp);
      }
    } catch (err) {
      console.warn('[RideTracking] start OTP failed:', err?.message || err);
    }
  };

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Chargement...</div>
      </div>
    );
  }

  if (!ride) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <Warning size={48} className="text-gray-300" />
        <p className="text-gray-500">Course introuvable</p>
        <Button onClick={() => navigate('/home')} variant="outline">
          Retour
        </Button>
      </div>
    );
  }

  const currentStepIdx = STATUS_STEPS.findIndex((s) => s.key === ride.status);
  const isCancelled = ride.status === 'cancelled';
  const isCompleted = ride.status === 'completed';
  const canCancel = ['pending', 'accepted', 'arriving'].includes(ride.status);
  const isAssigned = ['accepted', 'arriving', 'in_progress'].includes(ride.status) && ride.driver_name;

  const handleShare = async () => {
    const text = `Je suis en route avec SB Drive VTC.\nChauffeur : ${ride.driver_name || ''} ${ride.driver_vehicle_number ? `(${ride.driver_vehicle_number})` : ''}\nDestination : ${ride.dropoff_address}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Ma course SB Drive', text });
      else { await navigator.clipboard.writeText(text); toast.success('Détails copiés dans le presse-papier'); }
    } catch (err) { console.warn('[share] cancelled:', err?.message || err); }
  };

  // Immersive V3Cube-style "EN ARRIVANT / EN ROUTE" experience once a driver is assigned
  if (isAssigned) {
    return (
      <div data-testid="ride-tracking-page">
        <DriverEnRouteView
          ride={ride}
          driverPos={driverPos}
          connected={connected}
          otp={startOtp || ride.start_otp}
          onRequestOtp={requestStartOtp}
          onBack={() => navigate('/home')}
          onCall={() => { if (ride.driver_phone) window.location.href = `tel:${ride.driver_phone}`; else toast.info('Numéro du chauffeur indisponible'); }}
          onChat={() => navigate(`/ride/${rideId}/chat`)}
          onShare={handleShare}
          onSos={() => { toast.error("Alerte d'urgence envoyée au support et à vos contacts."); navigate('/safety'); }}
          onCancel={() => (canCancel ? setShowCancel(true) : toast.info('La course est déjà en cours'))}
          onEditDest={() => setShowRouteEdit(true)}
        />
        <RouteEditModal
          open={showRouteEdit}
          ride={ride}
          onClose={() => setShowRouteEdit(false)}
          onUpdated={(updated) => setRide((prev) => ({ ...prev, ...updated }))}
        />
        <CancelRideModal
          open={showCancel}
          reasons={cancelReasons}
          onCancel={handleCancel}
          onClose={() => setShowCancel(false)}
        />
        <StatusDialog dialog={statusDialog} />
      </div>
    );
  }

  // ── V3Cube full-screen "Recherche d'un chauffeur" experience (pending) ──
  if (ride.status === 'pending') {
    const radarMapUrl = ride.pickup_lat && GMAP_KEY
      ? `https://maps.googleapis.com/maps/api/staticmap?size=400x340&scale=2&zoom=15` +
        `&center=${ride.pickup_lat},${ride.pickup_lng}` +
        `&key=${GMAP_KEY}`
      : null;
    // Estimated wait from the nearest notified driver (~25 km/h urban speed).
    let etaCaption = null;
    if (ride.pickup_lat && nearbyPositions.length) {
      const toR = Math.PI / 180;
      let best = Infinity;
      for (const p of nearbyPositions) {
        const dLat = (p.lat - ride.pickup_lat) * toR;
        const dLng = (p.lng - ride.pickup_lng) * toR;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(ride.pickup_lat * toR) * Math.cos(p.lat * toR) * Math.sin(dLng / 2) ** 2;
        best = Math.min(best, 2 * 6371 * Math.asin(Math.sqrt(a)));
      }
      if (isFinite(best)) etaCaption = `~${Math.min(15, Math.max(1, Math.round((best / 25) * 60)))} min`;
    }
    return (
      <div className="mobile-container min-h-screen flex flex-col relative overflow-hidden bg-gray-100" data-testid="ride-tracking-page">
        {showPolicy && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" data-testid="cancel-policy-popup">
            <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-6 pb-8">
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4" />
              <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mb-3"><Warning size={28} weight="fill" className="text-amber-600" /></div>
              <h3 className="text-lg font-black text-[#0B1426]">Politique d'annulation</h3>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                Si vous souhaitez annuler, il est préférable de le faire <b>maintenant</b> (gratuit). Passé <b>{cancelPolicy.free_min} min</b> après l'acceptation par un chauffeur, des <b>frais de {Number(cancelPolicy.fee).toFixed(2)} €</b> s'appliqueront.
              </p>
              <button onClick={() => setShowPolicy(false)} className="mt-5 w-full py-3.5 rounded-xl bg-[#0B1426] text-white font-bold" data-testid="cancel-policy-ok">J'ai compris</button>
            </div>
          </div>
        )}

        {/* Pickup-centered map with pulsing orange radar waves */}
        <div className="absolute top-0 left-0 right-0 h-[56%] overflow-hidden" data-testid="radar-map-layer">
          {radarMapUrl
            ? <img src={radarMapUrl} alt="Carte" className="w-full h-full object-cover" />
            : <div className="w-full h-full bg-gradient-to-br from-orange-100 via-amber-50 to-rose-50" />}
          <div className="absolute inset-0 bg-white/10" />
          <SearchRadar size={244} caption={etaCaption} />
          <RadarCars
            pickupLat={ride.pickup_lat}
            pickupLng={ride.pickup_lng}
            realPositions={nearbyPositions}
            seed={rideId}
            config={{
              enabled: searchCfg.cars_enabled !== false,
              icon_url: searchCfg.cars_icon_url || '',
              count: searchCfg.cars_simulated_count ?? 5,
              radius_m: searchCfg.cars_radius_m ?? 600,
            }}
          />
        </div>

        <button onClick={() => navigate('/home')} className="absolute top-12 left-4 z-20 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center" data-testid="ride-searching-back">
          <ArrowLeft size={20} className="text-[#0B1426]" />
        </button>

        {/* Bottom white sheet */}
        <div className="mt-auto relative z-10 bg-white rounded-t-3xl shadow-2xl px-5 pt-3 pb-8" data-testid="ride-searching">
          <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-black text-[#0B1426] text-center">Recherche d'un chauffeur...</h1>
          <p className="text-sm text-gray-500 text-center mt-1">Nous contactons les chauffeurs proches</p>
          {nearbyDrivers != null && (
            <div className="mt-3 flex justify-center" data-testid="nearby-drivers-badge">
              <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-full px-4 py-1.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                <span className="text-sm font-bold text-[#0B1426]" data-testid="nearby-drivers-count">
                  {nearbyDrivers > 0
                    ? `${nearbyDrivers} chauffeur${nearbyDrivers > 1 ? 's' : ''} notifié${nearbyDrivers > 1 ? 's' : ''} à proximité`
                    : 'Recherche de chauffeurs à proximité…'}
                </span>
              </div>
            </div>
          )}
          {!isBiddingMode && relanceCount > 0 && relanceCount < searchCfg.max_relances && (
            <p className="text-[#FF5000] text-xs font-bold mt-3 text-center" data-testid="relance-count">Relance {relanceCount}/{searchCfg.max_relances}…</p>
          )}

          <div className="mt-4 w-full bg-gray-50 border border-gray-100 rounded-2xl p-3 text-left" data-testid="ride-searching-route">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
              <p className="text-sm text-[#0B1426] truncate">{ride.pickup_address}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF5000] shrink-0" />
              <p className="text-sm text-[#0B1426] truncate">{ride.dropoff_address}</p>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
              <span className="text-[11px] text-gray-500 capitalize">{ride.vehicle_type} · {ride.distance_km?.toFixed(1)} km</span>
              <span className="text-sm font-black text-[#0B1426]">{(ride.final_fare || ride.estimated_fare)?.toFixed(2)} €</span>
            </div>
          </div>

          {/* Live Taxi Pool matches (kept functional) */}
          {poolEnabled && poolMatches.length > 0 && (
            <div className="mt-3" data-testid="pool-matches-panel">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
                <p className="text-sm font-bold text-emerald-700 mb-2" data-testid="pool-matches-count">
                  {poolMatches.length} place{poolMatches.length > 1 ? 's' : ''} sur une course Pool proche
                </p>
                {poolMatches.slice(0, 2).map((m, i) => (
                  <div key={m.ride_id} className="flex items-center gap-2 py-1" data-testid={`pool-match-${i}`}>
                    <p className="flex-1 min-w-0 text-[11px] text-gray-600 truncate">{m.pickup_address || 'Ramassage proche'} → {m.dropoff_address || 'Destination'}</p>
                    {m.joined ? (
                      <span className="text-[10px] font-bold text-emerald-700" data-testid={`pool-match-joined-${i}`}>Rejoint</span>
                    ) : (
                      <button onClick={() => joinPool(m.ride_id)} disabled={joiningRideId === m.ride_id} className="text-[10px] font-bold text-white bg-orange-500 px-3 py-1 rounded-full disabled:opacity-60" data-testid={`pool-join-btn-${i}`}>
                        {joiningRideId === m.ride_id ? '…' : 'Rejoindre'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom actions */}
          <div className="mt-4 space-y-2">
            {!isBiddingMode && (
              <button onClick={handleManualRelance} className="w-full rounded-xl py-3.5 text-sm font-bold bg-[#FF5000] text-white shadow-md active:scale-[0.98] transition-transform" data-testid="relancer-recherche-btn">
                Relancer la recherche
              </button>
            )}
            {canCancel && (
              <button onClick={() => setShowCancel(true)} className="w-full rounded-xl py-3 text-sm font-bold text-gray-500" data-testid="cancel-ride-btn">
                Annuler la course
              </button>
            )}
          </div>
        </div>

        <CancelRideModal open={showCancel} reasons={cancelReasons} onCancel={handleCancel} onClose={() => setShowCancel(false)} />
        <StatusDialog dialog={statusDialog} />

        {/* No-driver alternatives modal (after max relances) */}
        {showNoDriver && (
          <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/50" data-testid="no-driver-modal">
            <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-6 pb-8">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-3">
                <Clock size={26} weight="duotone" className="text-[#FF5000]" />
              </div>
              <h3 className="text-lg font-black text-gray-900 text-center mb-1">Aucun chauffeur disponible</h3>
              <p className="text-sm text-gray-500 text-center mb-5">
                Aucun chauffeur n'a accepté après plusieurs relances. Essayez l'une de ces options :
              </p>
              <button onClick={handleProposeFare} disabled={converting} className="w-full py-3.5 rounded-xl font-black text-base flex items-center justify-center gap-2 mb-3 disabled:opacity-60" style={{ backgroundColor: '#FF5000', color: '#0B1426' }} data-testid="propose-fare-btn">
                <Star size={20} weight="fill" /> {converting ? 'Conversion…' : 'Proposer votre tarif'}
              </button>
              <button onClick={() => { setShowNoDriver(false); setShowSchedule(true); }} className="w-full py-3.5 rounded-xl font-black text-base flex items-center justify-center gap-2 mb-3 bg-[#0B1426] text-white" data-testid="schedule-trip-btn">
                <NavigationArrow size={20} weight="fill" /> Planifier le trajet
              </button>
              <button onClick={() => { relanceRef.current = 0; setRelanceCount(0); setShowNoDriver(false); }} className="w-full py-2.5 text-sm font-semibold text-gray-500" data-testid="continue-search-btn">
                Continuer la recherche
              </button>
            </div>
          </div>
        )}

        <ScheduleCalendarModal open={showSchedule} onClose={() => setShowSchedule(false)} onConfirm={handleReschedule} />
      </div>
    );
  }

  // ── Cancelled / no-driver state — same full-screen dark style as the radar ──
  if (isCancelled) {
    const retrySearch = async () => {
      try {
        const res = await rideAPI.create({
          pickup_lat: ride.pickup_lat, pickup_lng: ride.pickup_lng, pickup_address: ride.pickup_address,
          dropoff_lat: ride.dropoff_lat, dropoff_lng: ride.dropoff_lng, dropoff_address: ride.dropoff_address,
          vehicle_type: ride.vehicle_type, payment_method: ride.payment_method || 'cash', ride_type: 'instant',
        });
        toast.success('Nouvelle recherche lancée');
        navigate(`/ride/${res.data.id}`, { replace: true });
      } catch (e) { toast.error(e?.response?.data?.detail || 'Impossible de relancer la recherche'); }
    };
    const proposeFare = () => {
      const q = new URLSearchParams({
        pickup: ride.pickup_address, plat: ride.pickup_lat, plng: ride.pickup_lng,
        dropoff: ride.dropoff_address, dlat: ride.dropoff_lat, dlng: ride.dropoff_lng,
      });
      navigate(`/taxi-bidding?${q.toString()}`);
    };
    return (
      <div className="mobile-container min-h-screen flex flex-col relative overflow-hidden" style={{ backgroundColor: '#FF5000' }} data-testid="ride-tracking-page">
        <button onClick={() => navigate('/home')} className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center" data-testid="ride-cancelled-back">
          <ArrowLeft size={20} className="text-white" />
        </button>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center" data-testid="ride-cancelled-banner">
          <div className="w-20 h-20 rounded-full bg-white/15 border border-white/30 flex items-center justify-center">
            <X size={40} weight="bold" className="text-white" />
          </div>
          <h1 className="text-white font-black text-2xl mt-6">Course annulée</h1>
          <p className="text-white/80 text-sm mt-2 max-w-xs">
            {ride.cancel_reason || 'Aucun chauffeur disponible pour le moment.'}
          </p>
          {ride.cancellation_fee > 0 && (
            <p className="text-white text-xs font-bold mt-2">Frais d'annulation : {ride.cancellation_fee?.toFixed(2)} €</p>
          )}

          <div className="mt-8 w-full max-w-sm bg-white/10 border border-white/25 rounded-2xl p-3 text-left" data-testid="ride-cancelled-route">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-400 shrink-0" />
              <p className="text-sm text-white truncate">{ride.pickup_address}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-white shrink-0" />
              <p className="text-sm text-white truncate">{ride.dropoff_address}</p>
            </div>
          </div>
        </div>

        <div className="px-4 pb-8 pt-2 space-y-2 relative z-10">
          <button onClick={retrySearch} className="w-full py-3.5 rounded-xl font-black text-base flex items-center justify-center gap-2 bg-white text-[#FF5000]" data-testid="retry-search-btn">
            <NavigationArrow size={20} weight="fill" /> Réessayer la recherche
          </button>
          <button onClick={proposeFare} className="w-full py-3.5 rounded-xl font-black text-base flex items-center justify-center gap-2 bg-white/20 text-white border border-white/40" data-testid="propose-fare-cancelled-btn">
            <Star size={20} weight="fill" /> Proposer votre tarif
          </button>
          <button onClick={() => navigate('/home')} className="w-full py-3 text-sm font-semibold text-white/80" data-testid="ride-done-btn">
            Retour à l'accueil
          </button>
        </div>

        <StatusDialog dialog={statusDialog} />
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-white flex flex-col" data-testid="ride-tracking-page">
      <RideTrackingMap
        ride={ride}
        driverPos={driverPos}
        connected={connected}
        onBack={() => navigate('/home')}
      />

      <div className="flex-1 bg-white rounded-t-3xl -mt-6 relative z-10 px-4 pt-5 pb-24 overflow-y-auto">
        <DebtBanner />
        {/* Status Progress Bar */}
        {!isCancelled && (
          <div className="flex items-center justify-between mb-5" data-testid="ride-status-bar">
            {STATUS_STEPS.filter((s) => s.key !== 'completed' || isCompleted).map((step, i) => {
              const isActive = i <= currentStepIdx;
              const Icon = step.icon;
              return (
                <React.Fragment key={step.key}>
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isActive ? 'bg-[#FF4500] text-white' : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      <Icon size={16} weight={isActive ? 'fill' : 'regular'} />
                    </div>
                    <span className={`text-[9px] font-medium ${isActive ? 'text-[#FF4500]' : 'text-gray-400'}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < (isCompleted ? STATUS_STEPS.length - 1 : STATUS_STEPS.length - 2) && (
                    <div className={`flex-1 h-0.5 mx-1 ${i < currentStepIdx ? 'bg-[#FF4500]' : 'bg-gray-200'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Cancelled state handled by the full-screen dark early-return */}

        {/* Searching state is handled by the full-screen radar (pending early-return) */}

        <DriverInfoCard
          ride={!isCancelled ? ride : null}
          onCall={() => {}}
          onChat={() => navigate(`/ride/${rideId}/chat`)}
        />

        {/* OTP Display */}
        {ride.status === 'arriving' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-4 text-center" data-testid="ride-otp-display">
            <Shield size={24} className="text-yellow-600 mx-auto mb-1" />
            <p className="text-xs text-yellow-700">Partagez ce code avec le chauffeur pour demarrer</p>
            {startOtp ? (
              <p className="text-3xl font-bold text-gray-900 tracking-[0.5em] mt-1" data-testid="start-otp-value">
                {startOtp}
              </p>
            ) : (
              <button
                onClick={requestStartOtp}
                className="mt-2 px-5 py-2 rounded-full bg-yellow-500 text-white text-sm font-bold"
                data-testid="generate-start-otp-btn"
              >
                Generer mon code OTP
              </button>
            )}
          </div>
        )}

        {/* Route Info */}
        <div className="space-y-3 mb-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 w-3 h-3 rounded-full bg-green-500 border-2 border-green-200 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-gray-400 uppercase">Départ</p>
              <p className="text-sm text-gray-800">{ride.pickup_address}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-1 w-3 h-3 rounded-full bg-red-500 border-2 border-red-200 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-gray-400 uppercase">Destination</p>
              <p className="text-sm text-gray-800">{ride.dropoff_address}</p>
            </div>
          </div>
        </div>

        {/* Fare Details */}
        <div className="bg-gray-50 rounded-2xl p-4 mb-4" data-testid="ride-fare-details">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Distance</span>
            <span className="text-sm font-medium">{ride.distance_km?.toFixed(1)} km</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-gray-500">Durée estimée</span>
            <span className="text-sm font-medium">{ride.duration_mins} min</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-gray-500">Type</span>
            <span className="text-sm font-medium capitalize">{ride.vehicle_type}</span>
          </div>
          <div className="border-t border-gray-200 mt-3 pt-3 flex items-center justify-between">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="text-xl font-bold text-gray-900">
              {(ride.final_fare || ride.estimated_fare)?.toFixed(2)} EUR
            </span>
          </div>
        </div>

        {/* Payment method — changeable at any time during the ride */}
        {!isCompleted && !isCancelled && (
          <div className="bg-gray-50 rounded-2xl p-4 mb-4" data-testid="ride-payment-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-400 uppercase">Moyen de paiement</p>
                <p className="text-sm font-semibold text-gray-900" data-testid="ride-payment-current">{payLabel(ride.payment_method)}</p>
              </div>
              <button onClick={() => setShowPayPicker((v) => !v)} className="px-3 py-1.5 rounded-full bg-[#0B1426] text-white text-xs font-bold" data-testid="change-payment-btn">
                Changer
              </button>
            </div>
            {ride.difference_in_cash && ride.payment_shortfall > 0 && (
              <p className="mt-2 text-[12px] text-amber-700 font-medium" data-testid="ride-payment-shortfall">
                Solde insuffisant — différence de {Number(ride.payment_shortfall).toFixed(2)} € à régler en espèces.
              </p>
            )}
            {showPayPicker && (
              <div className="mt-3 grid grid-cols-2 gap-2" data-testid="ride-payment-options">
                {payMethods.map((m) => (
                  <button key={m.id} disabled={payBusy} onClick={() => changePay(m.id)}
                    className={`rounded-xl border-2 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${ride.payment_method === m.id ? 'border-[#0B1426] bg-[#0B1426] text-white' : 'border-gray-200 bg-white text-gray-700'}`}
                    data-testid={`ride-pay-opt-${m.id}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {canCancel && (
          <Button
            variant="outline"
            className="w-full border-red-200 text-red-600 hover:bg-red-50"
            onClick={() => setShowCancel(true)}
            data-testid="cancel-ride-btn"
          >
            Annuler la course
          </Button>
        )}

        {(isCompleted || isCancelled) && (
          <Button className="w-full mt-2" onClick={() => navigate('/home')} data-testid="ride-done-btn">
            Retour à l'accueil
          </Button>
        )}
      </div>

      <CancelRideModal
        open={showCancel}
        reasons={cancelReasons}
        onCancel={handleCancel}
        onClose={() => setShowCancel(false)}
      />

      <RatingModal
        open={showRating && isCompleted}
        rating={rating}
        setRating={setRating}
        markAsFavorite={markAsFavorite}
        setMarkAsFavorite={setMarkAsFavorite}
        onSubmit={handleRate}
        onTip={() => setShowTipModal(true)}
        onWaybill={() => navigate(`/ride/${rideId}/waybill`)}
        onSkip={() => {
          setShowRating(false);
          navigate('/home');
        }}
      />

      <TipModal
        open={showTipModal}
        rideId={rideId}
        onClose={() => setShowTipModal(false)}
        onSuccess={() => setShowTipModal(false)}
      />

      <StatusDialog dialog={statusDialog} />

      <ScheduleCalendarModal
        open={showSchedule}
        onClose={() => setShowSchedule(false)}
        onConfirm={handleReschedule}
      />
    </div>
  );
};

export default RideTrackingPage;
