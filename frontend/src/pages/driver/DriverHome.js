import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLocale } from '../../contexts/LocaleContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAppSettings } from '../../hooks/useAppSettings';
import { useHeatmap, useDriverHomeFeed, useZoneBonuses } from '../../hooks/driverHome';
import { toast } from 'sonner';
import { driverAPI, rideAPI } from '../../services/api';
import { DriverBottomNav } from './DriverProfilePage';
import { X, Gift, UsersThree, Car, CaretRight } from '@phosphor-icons/react';
import SideMenuDrawer from '../../components/SideMenuDrawer';
import EarningsBreakdownModal from '../../components/EarningsBreakdownModal';
import IncomingRequestSheet from '../../components/driver/IncomingRequestSheet';
import DriverRideFlow from '../../components/driver/DriverRideFlow';
import RentalDriverFlow from '../../components/driver/RentalDriverFlow';
import ScheduledReservationsSheet from '../../components/driver/ScheduledReservationsSheet';
import TaxiHallModal from '../../components/driver/TaxiHallModal';
import DriverHomeHeader from '../../components/driver/home/DriverHomeHeader';
import DriverStatsRow from '../../components/driver/home/DriverStatsRow';
import DriverHomeMap from '../../components/driver/home/DriverHomeMap';
import DriverFab from '../../components/driver/home/DriverFab';
import DestinationModeModal from '../../components/driver/home/DestinationModeModal';
import DemandZonesModal from '../../components/driver/home/DemandZonesModal';
import DriverLocationsModal from '../../components/driver/home/DriverLocationsModal';
import { getBrowserLocationLabel } from '../../lib/browserZone';
import { startSiren, stopSiren, unlockAudio } from '../../lib/driverAlert';

const API = process.env.REACT_APP_BACKEND_URL;
const DriverHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLocale();
  const { settings: appSettings } = useAppSettings();
  const [driver, setDriver] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [currentRide, setCurrentRide] = useState(null);
  const activeRestoredRef = useRef(false);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [myOffer, setMyOffer] = useState(null); // { rideId, amount, expires_at, ttl_seconds }
  const [nowTs, setNowTs] = useState(() => Date.now());
  const renewCountRef = useRef(0); // renewals of the current pending offer (auto-close after 2)
  const [rewardsActive, setRewardsActive] = useState(false);
  const [rewardsCount, setRewardsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mapCenter, setMapCenter] = useState({ lat: 48.8566, lng: 2.3522 });
  const [showMenu, setShowMenu] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const heatPoints = useHeatmap(showHeatmap);
  const [showEarningsBreakdown, setShowEarningsBreakdown] = useState(false);
  const [showDestModal, setShowDestModal] = useState(false);
  const [destMode, setDestMode] = useState(null); // { enabled, destination_lat, destination_lng, address, expires_at }
  const [destInput, setDestInput] = useState({ address: '', lat: '', lng: '' });
  const [poolRoute, setPoolRoute] = useState(null); // { passenger_count, stops, newPassenger }
  const { zoneBonuses, setZoneBonuses } = useZoneBonuses();
  const [fabOpen, setFabOpen] = useState(false);
  const { homeFeed, setHomeFeed } = useDriverHomeFeed();
  const [showScheduled, setShowScheduled] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [nextRide, setNextRide] = useState(null);          // reserved next ride (starts after current)
  const [nextJobOffer, setNextJobOffer] = useState(null);  // pending "prochaine course" offer
  const [nextJobCfg, setNextJobCfg] = useState({ next_job_enabled: true, next_job_lead_minutes: 5 });
  const nextRideRef = useRef(null);
  const nextJobOfferRef = useRef(null);
  const canReceiveNextRef = useRef(false);
  const [showTaxiHall, setShowTaxiHall] = useState(false);
  const [showDemandZones, setShowDemandZones] = useState(false);
  const [showLocations, setShowLocations] = useState(false);
  const [rideMinimized, setRideMinimized] = useState(false);
  const [taxiHallElig, setTaxiHallElig] = useState({ eligible: true, require_competition: false, reason: null });

  useEffect(() => {
    let alive = true;
    rideAPI.taxiHallEligibility()
      .then((r) => { if (alive) setTaxiHallElig(r.data || { eligible: true }); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const openTaxiHall = useCallback(() => {
    if (!taxiHallElig.eligible) {
      toast.error(taxiHallElig.reason || 'Accès Auto-stop refusé.');
      if (taxiHallElig.need_recharge) {
        setTimeout(() => navigate('/chauffeur/wallet'), 1200);
      }
      return;
    }
    setShowTaxiHall(true);
  }, [taxiHallElig, navigate]);

  // Load current destination mode on mount
  useEffect(() => {
    fetch(`${API}/api/phase2/driver/destination-mode`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setDestMode(d); })
      .catch(() => {});
  }, []);

  const saveDestinationMode = async (active) => {
    try {
      const body = active
        ? { active: true, lat: parseFloat(destInput.lat), lng: parseFloat(destInput.lng), address: destInput.address, radius_km: 5 }
        : { active: false };
      const res = await fetch(`${API}/api/phase2/driver/destination-mode`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const d = await res.json();
        // Normalize response to {active, target} shape
        setDestMode({
          active: d.destination_mode_active ?? d.active ?? active,
          target: d.destination_mode_target ?? d.target ?? null,
        });
        setShowDestModal(false);
      }
    } catch (e) { console.warn('dest mode toggle failed:', e?.message || e); }
  };

  const { on, sendLocation, joinRide } = useWebSocket(user?.id);

  const loadDriverProfile = useCallback(async () => {
    const attempt = async (retries) => {
      try {
        const res = await driverAPI.getProfile();
        setDriver(res.data);
        setIsOnline(res.data.is_online);
        setLoading(false);
      } catch (err) {
        if (retries > 0) {
          setTimeout(() => attempt(retries - 1), 1500);
          return;
        }
        console.error('Driver profile error:', err.response?.status);
        setLoading(false);
      }
    };
    await attempt(2);
  }, []);

  useEffect(() => {
    loadDriverProfile();
    // Geolocation: report current position + watch for updates. watchId is a const captured for cleanup.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords: { latitude, longitude } }) => {
          setMapCenter({ lat: latitude, lng: longitude });
          driverAPI.updateLocation(latitude, longitude).catch(() => {});
          sendLocation(latitude, longitude);
        }, () => {}
      );
    }
    const watchId = navigator.geolocation
      ? navigator.geolocation.watchPosition(
          ({ coords: { latitude, longitude } }) => {
            setMapCenter({ lat: latitude, lng: longitude });
            sendLocation(latitude, longitude);
          }, () => {}, { enableHighAccuracy: true }
        )
      : null;
    // Poll active rewards every 60s (zone-aware via browser location)
    let rewardsLocation = '';
    getBrowserLocationLabel().then((l) => { rewardsLocation = l || ''; });
    const checkRewards = async () => {
      try {
        const qs = rewardsLocation ? `?location=${encodeURIComponent(rewardsLocation)}` : '';
        const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/drivers/my-active-rewards${qs}`, { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          setRewardsActive(!!d.any_active);
          setRewardsCount((d.vehicle_rewards?.length || 0) + (d.guarantees?.length || 0));
        }
      } catch (e) { console.warn('rewards check failed:', e?.message || e); }
    };
    checkRewards();
    const rewardInterval = setInterval(checkRewards, 60000);
    return () => { if (watchId != null) navigator.geolocation.clearWatch(watchId); clearInterval(rewardInterval); };
  }, [loadDriverProfile, sendLocation]);

  useEffect(() => {
    // WS request payloads carry `ride_id` (not `id`); normalize so the request
    // sheet's accept / decline / counter-offer actions get a valid ride id.
    const withId = (m) => ({ ...m, id: m.id || m.ride_id });
    const unsub1 = on('new_ride_request', (msg) => {
      if (!isOnline) return;
      if (!currentRide) { setIncomingRequest(withId(msg)); return; }
      // Busy but ~X min from finishing → offer it as the NEXT job (Phase 4 dispatch).
      if (canReceiveNextRef.current && !nextRideRef.current && !nextJobOfferRef.current) setNextJobOffer(withId(msg));
    });
    // Priority offers from auto-dispatch escalation (tier 1/2). Reuse the same UI as a regular request,
    // but flag it as priority so the driver knows it's escalated.
    const unsub3 = on('priority_ride_offer', (msg) => {
      if (!isOnline) return;
      if (!currentRide) { setIncomingRequest({ ...withId(msg), is_priority: true }); return; }
      if (canReceiveNextRef.current && !nextRideRef.current && !nextJobOfferRef.current) setNextJobOffer({ ...withId(msg), is_priority: true });
    });
    const unsub2 = on('ride_status_update', (msg) => {
      if (currentRide && msg.ride_id === currentRide.id) {
        if (msg.status === 'cancelled') { setCurrentRide(null); setRideMinimized(false); }
        else setCurrentRide(prev => prev ? { ...prev, status: msg.status } : null);
      }
    });
    const unsub4 = on('route_updated', (msg) => {
      if (currentRide && msg.ride_id === currentRide.id) {
        setCurrentRide(prev => prev ? { ...prev, ...msg } : null);
        toast.info('Le passager a modifié l\'itinéraire');
      }
    });
    const unsub5 = on('pool_passenger_added', (msg) => {
      toast.success(`+1 passager · trajet groupé (${msg.passenger_count} au total)`, { duration: 6000 });
      setPoolRoute({ passenger_count: msg.passenger_count, stops: msg.stops || [], newPassenger: msg.new_passenger });
    });
    const unsub6 = on('zone_bonus_active', (msg) => {
      toast.success(`Prime +${msg.bonus_amount} € active à ${msg.zone}`, { duration: 8000 });
      setZoneBonuses((prev) => [{ zone: msg.zone, bonus_amount: msg.bonus_amount, bonus_active_until: msg.bonus_active_until }, ...prev.filter((b) => b.zone !== msg.zone)]);
    });
    const unsub7 = on('driver_document_reviewed', (msg) => {
      if (msg?.status === 'approved') toast.success(msg.body || 'Document validé ✅', { duration: 6000 });
      else if (msg?.status === 'rejected') toast.error(msg.body || 'Document refusé', { duration: 8000 });
      else toast.info(msg?.body || 'Document mis à jour');
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); };
  }, [on, currentRide, isOnline]);

  // Audible "turn-signal" siren + vibration while an incoming request is on screen.
  useEffect(() => {
    if (incomingRequest && !currentRide) { unlockAudio(); startSiren(); }
    else stopSiren();
    return () => stopSiren();
  }, [incomingRequest, currentRide]);

  // Unread notifications count for the bell badge (blinks while > 0).
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await driverAPI.getNotifications();
        if (alive) setNotifCount((r.data || []).filter((n) => !(n.read || n.is_read || n.seen)).length);
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 20000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // ── "Prochaine course" (Phase 4): let a busy driver pre-book a next job when
  // they are within `next_job_lead_minutes` of finishing their in-progress ride.
  useEffect(() => { nextRideRef.current = nextRide; }, [nextRide]);
  useEffect(() => { nextJobOfferRef.current = nextJobOffer; }, [nextJobOffer]);
  // Zone-aware "Prochaine course" config (per-zone override → global fallback).
  // Coarse grid (~2 km) so we only refetch when the driver moves zones, not on
  // every GPS tick.
  const coarseLat = mapCenter?.lat != null ? Math.round(mapCenter.lat * 50) / 50 : null;
  const coarseLng = mapCenter?.lng != null ? Math.round(mapCenter.lng * 50) / 50 : null;
  useEffect(() => {
    let alive = true;
    const url = coarseLat != null
      ? `${API}/api/config/next-job?lat=${coarseLat}&lng=${coarseLng}`
      : `${API}/api/config/next-job`;
    fetch(url, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setNextJobCfg({ next_job_enabled: d.enabled !== false, next_job_lead_minutes: d.lead_minutes || 5 }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [coarseLat, coarseLng]);
  useEffect(() => {
    let ok = false;
    if (nextJobCfg.next_job_enabled && currentRide?.status === 'in_progress'
        && currentRide?.dropoff_lat && mapCenter?.lat) {
      const toR = Math.PI / 180;
      const dLat = (currentRide.dropoff_lat - mapCenter.lat) * toR;
      const dLng = (currentRide.dropoff_lng - mapCenter.lng) * toR;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(mapCenter.lat * toR) * Math.cos(currentRide.dropoff_lat * toR) * Math.sin(dLng / 2) ** 2;
      const km = 2 * 6371 * Math.asin(Math.sqrt(a));
      const thresholdKm = (nextJobCfg.next_job_lead_minutes / 60) * 25; // ~25 km/h urban speed
      ok = km <= thresholdKm;
    }
    canReceiveNextRef.current = ok;
  }, [currentRide, mapCenter, nextJobCfg]);

  // Restore an in-progress ride after a reload/navigation so the driver never
  // "loses" the course they are currently on (and can still start/finish it).
  useEffect(() => {
    if (activeRestoredRef.current) return undefined;
    let alive = true;
    const restore = async () => {
      try {
        const res = await rideAPI.getActive();
        const ride = res.data;
        if (alive && ride && ride.id && ['accepted', 'arriving', 'in_progress'].includes(ride.status)) {
          activeRestoredRef.current = true;
          setCurrentRide(ride);
          joinRide(ride.id);
        }
      } catch { /* ignore */ }
    };
    restore();
    return () => { alive = false; };
  }, [joinRide]);

  useEffect(() => {
    if (!(isOnline && !currentRide)) return undefined;
    const loadPending = async () => {
      if (!driver || driver.status !== 'approved') return;
      try {
        const res = await rideAPI.list({ status: 'pending' });
        if (res.data.length > 0 && !currentRide && !incomingRequest) setIncomingRequest(res.data[0]);
      } catch (err) { console.error('Failed to load pending rides:', err); }
    };
    const interval = setInterval(loadPending, 8000);
    return () => clearInterval(interval);
  }, [isOnline, currentRide, driver, incomingRequest]);

  // Acknowledge a bidding request as SEEN → powers the passenger's live
  // "X chauffeurs ont vu votre offre" counter. Best-effort, once per request.
  useEffect(() => {
    if (!incomingRequest) return;
    const isBid = incomingRequest.is_bidding === true
      || incomingRequest.mode === 'bidding'
      || incomingRequest.ride_type === 'bidding';
    if (!isBid) return;
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/rides/${incomingRequest.id}/seen`, {
      method: 'POST', credentials: 'include',
    }).catch(() => {});
  }, [incomingRequest]);

  // Auto-dismiss the incoming request if it's no longer 'pending' (passenger
  // cancelled, it expired, or another driver took it) so the sheet + siren never
  // stay stuck on the driver's screen after the client side has stopped.
  useEffect(() => {
    if (!incomingRequest || myOffer || currentRide) return undefined;
    const poll = setInterval(async () => {
      try {
        const res = await rideAPI.get(incomingRequest.id);
        const st = res?.data?.status;
        if (st && st !== 'pending') setIncomingRequest(null);
      } catch (e) {
        if (e?.response?.status === 404) setIncomingRequest(null);
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [incomingRequest, myOffer, currentRide]);

  // While our counter-offer is pending: tick the countdown + poll the ride.
  // If the passenger picks us, transition straight into the active ride.
  useEffect(() => {
    if (!myOffer) return;
    const tick = setInterval(() => setNowTs(Date.now()), 500);
    const poll = setInterval(async () => {
      try {
        const res = await rideAPI.get(myOffer.rideId);
        const ride = res.data;
        if (ride.status && ride.status !== 'pending') {
          clearInterval(poll); clearInterval(tick);
          if (ride.driver_id && driver && ride.driver_id === driver.id) {
            // Passenger accepted OUR offer
            setCurrentRide(ride);
            joinRide(myOffer.rideId);
          }
          // Otherwise the ride was taken by someone else or cancelled
          setMyOffer(null);
          setIncomingRequest(null);
        }
      } catch { /* keep polling */ }
    }, 2500);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [myOffer, driver, joinRide]);

  // Auto-close a pending offer the passenger never accepts, so the driver doesn't
  // stay stuck on the request sheet:
  //   • after 2 renewals (relances) without acceptance → close as soon as it expires;
  //   • otherwise, if the expired offer isn't renewed within 10 s → close.
  // "Close" returns the driver to the online map to wait for other requests.
  useEffect(() => {
    if (!myOffer || !myOffer.expires_at) return undefined;
    const expiresMs = new Date(myOffer.expires_at).getTime();
    const graceMs = renewCountRef.current >= 2 ? 0 : 10000;
    const delay = Math.max(0, (expiresMs + graceMs) - Date.now());
    const id = setTimeout(() => {
      toast.info('Aucune réponse du client. Retour en ligne.', { duration: 5000 });
      renewCountRef.current = 0;
      setMyOffer(null);
      setIncomingRequest(null);
    }, delay);
    return () => clearTimeout(id);
  }, [myOffer]);

  const toggleOnline = async () => {
    if (driver?.status !== 'approved') return;
    try {
      const res = await driverAPI.toggleOnline();
      setIsOnline(res.data.is_online);
    } catch (err) { console.error('Failed to toggle online status:', err); }
  };

  const acceptRide = async (rideId) => {
    try {
      await rideAPI.accept(rideId);
      const res = await rideAPI.get(rideId);
      setCurrentRide(res.data);
      setIncomingRequest(null);
      joinRide(rideId);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404 || status === 400) {
        toast.info('Cette course n\'est plus disponible (déjà prise ou annulée).');
      } else {
        toast.error('Impossible d\'accepter la course. Réessayez.');
        console.error('Failed to accept ride:', err);
      }
      setIncomingRequest(null);
    }
  };

  const declineRide = async (rideId) => {
    setIncomingRequest(null);
    if (!rideId) return;
    try {
      const res = await rideAPI.decline(rideId);
      if (res?.data?.went_offline) {
        setIsOnline(false);
        toast.warning(`Vous êtes passé hors-ligne après ${res.data.count} refus.`, { duration: 8000 });
      }
    } catch { /* best-effort, never block the UI */ }
  };

  const sendCounterOffer = async (rideId, amount, isRenew = false) => {
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/rides/${rideId}/counter-offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount: parseFloat(amount) }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const offer = data.offer || {};
      if (!isRenew) renewCountRef.current = 0; // fresh offer → reset renewal counter
      // Keep the request open and switch to "offer pending" state with a live countdown
      setMyOffer({
        rideId,
        amount: parseFloat(amount),
        expires_at: offer.expires_at,
        ttl_seconds: offer.ttl_seconds || 30,
      });
      setNowTs(Date.now());
    } catch (err) { console.error('Counter offer failed:', err); }
  };

  const renewOffer = () => {
    if (!myOffer) return;
    renewCountRef.current += 1;
    sendCounterOffer(myOffer.rideId, myOffer.amount, true);
  };

  const cancelOffer = () => {
    renewCountRef.current = 0;
    setMyOffer(null);
    setIncomingRequest(null);
  };

  const reserveNextJob = async (offer) => {
    const id = offer?.ride_id || offer?.id;
    if (!id) { setNextJobOffer(null); return; }
    try {
      await rideAPI.accept(id);
      const res = await rideAPI.get(id);
      setNextRide(res.data);
      setNextJobOffer(null);
      toast.success('Prochaine course réservée — elle démarrera après votre course actuelle.');
    } catch (err) {
      const s = err?.response?.status;
      toast.info(s === 404 || s === 400 ? "Cette course n'est plus disponible." : 'Réservation impossible, réessayez.');
      setNextJobOffer(null);
    }
  };

  const finishRide = () => {
    setRideMinimized(false);
    loadDriverProfile();
    if (nextRideRef.current) {
      const nx = nextRideRef.current;
      setNextRide(null);
      setCurrentRide(nx);
      joinRide(nx.id);
      toast.success('Course suivante démarrée.');
    } else {
      setCurrentRide(null);
    }
  };

  const acceptScheduled = useCallback(async (ride) => {
    try {
      await rideAPI.accept(ride.id);
      toast.success('Réservation acceptée — ajoutée à « Emplois à venir ».');
      setHomeFeed((f) => ({
        ...f,
        scheduled_pending: f.scheduled_pending.filter((r) => r.id !== ride.id),
        upcoming: [...f.upcoming, ride],
      }));
      setShowScheduled(false);
    } catch { toast.error('Cette réservation a déjà été prise.'); }
  }, []);

  const onTaxiHallStarted = useCallback((ride) => {
    setShowTaxiHall(false);
    setCurrentRide(ride);
  }, []);

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-white flex items-center justify-center">
        <div className="w-10 h-10 border-3 rounded-full animate-spin" style={{ borderColor: '#e5e7eb', borderTopColor: '#FF5000' }} />
      </div>
    );
  }

  if (!driver) return null;

  return (
    <div className="mobile-container bg-white h-[100dvh] flex flex-col relative pb-20 overflow-hidden" data-testid="driver-home-page">
      {/* Active zone bonus banner (driver-shortage incentive) */}
      {zoneBonuses.length > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[2400] w-[92%] max-w-md" data-testid="zone-bonus-banner">
          {zoneBonuses.slice(0, 1).map((b) => (
            <div key={b.zone} className="flex items-center gap-2 bg-emerald-500 text-white rounded-2xl shadow-xl px-4 py-2.5" data-testid={`zone-bonus-${b.zone}`}>
              <Gift size={20} weight="fill" className="flex-shrink-0" />
              <p className="text-xs font-bold flex-1">
                Prime +{b.bonus_amount} € active à {b.zone}
                {b.bonus_active_until && <span className="font-semibold opacity-90"> · jusqu&apos;à {new Date(b.bonus_active_until).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>}
              </p>
            </div>
          ))}
        </div>
      )}
      {/* Pool combined-route panel (trajet groupé multi-passagers) */}
      {poolRoute && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[2500] w-[92%] max-w-md bg-white rounded-2xl shadow-2xl border border-emerald-200 p-3" data-testid="pool-route-panel">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center">
                <UsersThree size={16} weight="duotone" className="text-white" />
              </div>
              <p className="text-sm font-extrabold text-gray-900">
                Trajet groupé · {poolRoute.passenger_count} passagers
              </p>
            </div>
            <button onClick={() => setPoolRoute(null)} className="text-gray-400" data-testid="pool-route-dismiss">
              <X size={18} />
            </button>
          </div>
          {poolRoute.newPassenger && (
            <p className="text-[11px] text-emerald-700 font-semibold mb-2">+ {poolRoute.newPassenger} vient de rejoindre</p>
          )}
          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            {(poolRoute.stops || []).map((s) => (
              <div key={`${s.ride_id}-${s.kind}`} className="flex items-center gap-2" data-testid={`pool-stop-${s.seq}`}>
                <span className={`w-5 h-5 flex-shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${s.kind === 'pickup' ? 'bg-emerald-500' : 'bg-gray-700'}`}>{s.seq}</span>
                <span className={`text-[10px] font-bold uppercase ${s.kind === 'pickup' ? 'text-emerald-600' : 'text-gray-500'}`}>{s.kind === 'pickup' ? 'Prise' : 'Dépose'}</span>
                <span className="text-[11px] text-gray-700 truncate flex-1">{s.name} · {s.address || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* SKY-BLUE HEADER */}
      <DriverHomeHeader
        isOnline={isOnline}
        onToggleOnline={toggleOnline}
        onMenu={() => setShowMenu(true)}
        scheduledCount={homeFeed.scheduled_pending.length}
        onScheduled={() => setShowScheduled(true)}
        onNotifications={() => navigate('/chauffeur/notifications')}
        notifCount={notifCount}
      />

      {/* « Devenir chauffeur Taxi » — CTA pour les chauffeurs sans le service taxi
          (sinon ils ne reçoivent pas les réservations taxi planifiées). */}
      {driver && !(driver.service_types || []).includes('taxi') && (
        <button
          onClick={() => navigate('/chauffeur/profile?services=1')}
          className="mx-4 mt-3 w-[calc(100%-2rem)] flex items-center gap-3 rounded-2xl border-2 border-[#FF5000] bg-sky-50 p-3 text-left shadow-sm"
          data-testid="become-taxi-cta"
        >
          <div className="w-9 h-9 rounded-full bg-[#FF5000] flex items-center justify-center shrink-0">
            <Car size={18} weight="fill" className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold text-[#0B1426]">Devenir chauffeur Taxi</p>
            <p className="text-[12px] text-gray-600 leading-snug">Activez le service Taxi pour recevoir des courses et réservations planifiées.</p>
          </div>
          <CaretRight size={18} className="text-[#FF5000] shrink-0" />
        </button>
      )}

      {/* "Prochaine course" — offered to a busy driver who is ~X min from finishing */}
      {nextJobOffer && (
        <div className="mx-4 mt-3 rounded-2xl border-2 border-[#FF5000] bg-sky-50 p-3 shadow-sm" data-testid="next-job-offer">
          <div className="flex items-center gap-2 mb-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF5000] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF5000]" />
            </span>
            <p className="text-sm font-extrabold text-[#0B1426] flex-1">Prochaine course disponible</p>
            <span className="text-sm font-extrabold text-[#FF5000]">{((nextJobOffer.estimated_fare || nextJobOffer.fare || 0)).toFixed(2)} €</span>
          </div>
          <p className="text-[12px] text-gray-600 truncate">{nextJobOffer.pickup_address || 'Ramassage proche'} → {nextJobOffer.dropoff_address || 'Destination'}</p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setNextJobOffer(null)} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-bold text-sm" data-testid="next-job-ignore">Ignorer</button>
            <button onClick={() => reserveNextJob(nextJobOffer)} className="flex-1 py-2.5 rounded-xl bg-[#FF5000] text-white font-bold text-sm" data-testid="next-job-reserve">Réserver pour après</button>
          </div>
        </div>
      )}

      {/* Reserved next ride indicator (starts automatically when the current ride ends) */}
      {nextRide && (
        <div className="mx-4 mt-3 rounded-2xl bg-[#FF5000] text-white p-3 shadow-sm flex items-center gap-3" data-testid="next-job-reserved">
          <Car size={20} weight="fill" className="text-white shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold leading-tight">Prochaine course réservée</p>
            <p className="text-[12px] text-white/85 truncate">{nextRide.pickup_address} → {nextRide.dropoff_address}</p>
          </div>
          <button onClick={() => { setNextRide(null); }} className="text-white/80 shrink-0" data-testid="next-job-cancel-reserved"><X size={18} /></button>
        </div>
      )}

      {/* GAINS + 4 STAT CARDS */}
      <DriverStatsRow
        earnings={driver.earnings}
        totalTrips={driver.total_trips}
        rating={driver.rating}
        upcomingCount={homeFeed.upcoming.length}
        availableRidesCount={homeFeed.available_rides.length}
        availableDeliveriesCount={homeFeed.available_deliveries.length}
        onEarningsBreakdown={() => setShowEarningsBreakdown(true)}
        onUpcoming={() => navigate('/chauffeur/reservations?filter=upcoming')}
        onPending={() => navigate('/chauffeur/reservations?filter=pending')}
      />

      {/* MAP */}
      <DriverHomeMap
        mapCenter={mapCenter}
        currentRide={currentRide}
        showHeatmap={showHeatmap}
        heatPoints={heatPoints}
        rewardsActive={rewardsActive && appSettings.enable_driver_reward_program !== false}
        rewardsCount={rewardsCount}
        onRewards={() => navigate('/chauffeur/rewards')}
      />

      {/* FLOATING BUTTONS — radial speed-dial FAB */}
      <DriverFab
        open={fabOpen}
        setOpen={setFabOpen}
        taxiHailEnabled={appSettings.taxi_hail_option !== false}
        onAiPlanner={() => setShowDemandZones(true)}
        onTaxiHall={openTaxiHall}
        onHeatmap={() => setShowHeatmap((v) => !v)}
        onDest={() => setShowDestModal(true)}
        onLocations={() => setShowLocations(true)}
        onVehicleInfo={() => navigate('/chauffeur/vehicles')}
      />

        {/* Active ride — full-screen V3Cube flow (rental uses the meter flow) */}
        {currentRide && !rideMinimized && (
          currentRide.ride_type === 'rental' ? (
            <RentalDriverFlow
              ride={currentRide}
              onFinished={finishRide}
              onMinimize={() => setRideMinimized(true)}
            />
          ) : (
            <DriverRideFlow
              ride={currentRide}
              driverPos={mapCenter}
              askOtp={appSettings.ask_otp_before_start !== false}
              onFinished={finishRide}
              onMinimize={() => setRideMinimized(true)}
            />
          )
        )}

        {/* Minimized active ride — resume banner so the driver can re-open the flow */}
        {currentRide && rideMinimized && (
          <button
            onClick={() => setRideMinimized(false)}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1400] bg-[#FF5000] text-white rounded-full pl-4 pr-5 py-3 shadow-2xl flex items-center gap-3 active:scale-95 transition-transform"
            data-testid="resume-ride-banner"
          >
            <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <Car size={20} weight="fill" />
            </span>
            <span className="text-left leading-tight">
              <span className="block text-[11px] font-semibold opacity-90">
                {currentRide.status === 'in_progress' ? t('driver.ride_in_progress') : t('driver.ride_active')}
              </span>
              <span className="block text-sm font-extrabold">{t('driver.resume')} →</span>
            </span>
          </button>
        )}

      {/* Incoming Request — V3Cube PARTNER APP sheet.
          Counter-offer (bidding) is ONLY available for bidding rides; instant,
          pool and scheduled requests are fixed-price → Accept / Decline only. */}
      {incomingRequest && !currentRide && (() => {
        const isBiddingReq = incomingRequest.is_bidding === true
          || incomingRequest.mode === 'bidding'
          || incomingRequest.ride_type === 'bidding';
        return (
          <IncomingRequestSheet
            request={incomingRequest}
            driverPos={mapCenter}
            windowSeconds={Math.max(10, appSettings.driver_timeout || 35)}
            onAccept={isBiddingReq
              ? (id) => sendCounterOffer(id, incomingRequest.proposed_fare || incomingRequest.estimated_fare)
              : acceptRide}
            onDecline={() => declineRide(incomingRequest.id)}
            myOffer={myOffer}
            nowTs={nowTs}
            onSendCounterOffer={isBiddingReq ? sendCounterOffer : null}
            onRenewOffer={renewOffer}
            onCancelOffer={cancelOffer}
          />
        );
      })()}

      {/* Scheduled reservations (RED indicator) */}
      {showScheduled && (
        <ScheduledReservationsSheet
          rides={homeFeed.scheduled_pending}
          onClose={() => setShowScheduled(false)}
          onAccept={acceptScheduled}
        />
      )}

      {/* Taxi Hall (street-hail client) */}
      <TaxiHallModal
        open={showTaxiHall}
        onClose={() => setShowTaxiHall(false)}
        origin={{ ...mapCenter, address: 'Position actuelle' }}
        onStarted={onTaxiHallStarted}
      />

      {/* AI demand planner — hot zones */}
      <DemandZonesModal
        open={showDemandZones}
        onClose={() => setShowDemandZones(false)}
        origin={mapCenter}
        onNavigate={async (z) => {
          setMapCenter({ lat: z.lat, lng: z.lng });
          setShowDemandZones(false);
          try {
            const res = await fetch(`${API}/api/phase2/driver/destination-mode`, {
              method: 'PUT', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ active: true, lat: z.lat, lng: z.lng, address: z.name, radius_km: 5 }),
            });
            if (res.ok) {
              const d = await res.json();
              setDestMode({
                active: d.destination_mode_active ?? true,
                target: d.destination_mode_target ?? { address: z.name, lat: z.lat, lng: z.lng },
              });
              toast.success(`Mode destination activé vers ${z.name} — vous ne recevrez que les courses dans cette direction.`);
            } else {
              toast.success(`Carte centrée sur ${z.name}`);
            }
          } catch {
            toast.success(`Carte centrée sur ${z.name}`);
          }
        }}
      />

      <DriverLocationsModal open={showLocations} onClose={() => setShowLocations(false)} />

      {/* Bottom Nav */}
      <DriverBottomNav active="home" />

      {/* Earnings Breakdown Modal */}
      <EarningsBreakdownModal
        open={showEarningsBreakdown}
        onClose={() => setShowEarningsBreakdown(false)}
      />

      {/* Destination Mode Modal */}
      <DestinationModeModal
        open={showDestModal}
        onClose={() => setShowDestModal(false)}
        destMode={destMode}
        destInput={destInput}
        setDestInput={setDestInput}
        onSave={saveDestinationMode}
      />
    </div>
  );
};

export default DriverHome;
