import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { toast } from 'sonner';
import { driverAPI, rideAPI } from '../../services/api';
import { DriverBottomNav } from './DriverProfilePage';
import {
  MapPin, Bell, X, NavigationArrow, Gift, Plus, CalendarCheck, List, UsersThree,
  Sparkle, Taxi, Fire, ArrowUUpLeft, Car
} from '@phosphor-icons/react';
import AdminGoogleMap from '../../components/admin/AdminGoogleMap';
import { decodePolyline } from '../../utils/polyline';
import SideMenuDrawer from '../../components/SideMenuDrawer';
import EarningsBreakdownModal from '../../components/EarningsBreakdownModal';
import IncomingRequestSheet from '../../components/driver/IncomingRequestSheet';
import DriverRideFlow from '../../components/driver/DriverRideFlow';
import ScheduledReservationsSheet from '../../components/driver/ScheduledReservationsSheet';
import TaxiHallModal from '../../components/driver/TaxiHallModal';

const API = process.env.REACT_APP_BACKEND_URL;
const DriverHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [driver, setDriver] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [currentRide, setCurrentRide] = useState(null);
  const activeRestoredRef = useRef(false);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [myOffer, setMyOffer] = useState(null); // { rideId, amount, expires_at, ttl_seconds }
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [rewardsActive, setRewardsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mapCenter, setMapCenter] = useState({ lat: 48.8566, lng: 2.3522 });
  const [showMenu, setShowMenu] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatPoints, setHeatPoints] = useState([]);
  const [showEarningsBreakdown, setShowEarningsBreakdown] = useState(false);
  const [showDestModal, setShowDestModal] = useState(false);
  const [destMode, setDestMode] = useState(null); // { enabled, destination_lat, destination_lng, address, expires_at }
  const [destInput, setDestInput] = useState({ address: '', lat: '', lng: '' });
  const [poolRoute, setPoolRoute] = useState(null); // { passenger_count, stops, newPassenger }
  const [zoneBonuses, setZoneBonuses] = useState([]);
  const [fabOpen, setFabOpen] = useState(false);
  const [homeFeed, setHomeFeed] = useState({ scheduled_pending: [], upcoming: [], available_rides: [], available_deliveries: [], next_scheduled_at: null });
  const [showScheduled, setShowScheduled] = useState(false);
  const [showTaxiHall, setShowTaxiHall] = useState(false);
  const seenScheduledRef = useRef(null); // Set of known scheduled ids (null = not yet primed)
  const alerted40Ref = useRef(new Set());

  const { isLoaded: gmapLoaded } = { isLoaded: true };

  // Load heat map demand cells when toggled
  useEffect(() => {
    if (!showHeatmap) return;
    const load = async () => {
      try {
        const res = await fetch(`${API}/api/phase2/heatmap`, { credentials: 'include' });
        if (!res.ok) return;
        const d = await res.json();
        setHeatPoints(d.points || []);
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [showHeatmap]);

  // V3Cube driver home feed: scheduled (RED) / upcoming circle / available (YELLOW)
  // / deliveries (BLUE), with sound+vibration alerts on new reservations and T-40min.
  useEffect(() => {
    let alive = true;
    const beep = () => {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
        o.start(); o.stop(ctx.currentTime + 0.55);
      } catch { /* audio blocked until first interaction */ }
      if (navigator.vibrate) navigator.vibrate([200, 90, 200]);
    };
    const loadFeed = async () => {
      try {
        const res = await rideAPI.driverHomeFeed();
        if (!alive) return;
        const feed = res.data;
        setHomeFeed(feed);
        const ids = (feed.scheduled_pending || []).map((r) => r.id);
        if (seenScheduledRef.current === null) {
          seenScheduledRef.current = new Set(ids); // prime without alerting
        } else {
          const fresh = ids.filter((id) => !seenScheduledRef.current.has(id));
          if (fresh.length) {
            fresh.forEach((id) => seenScheduledRef.current.add(id));
            beep();
            toast.success(`Nouvelle réservation planifiée (${fresh.length})`, { description: 'En attente de votre acceptation.' });
          }
        }
        (feed.upcoming || []).forEach((r) => {
          if (!r.scheduled_at || alerted40Ref.current.has(r.id)) return;
          const mins = (new Date(r.scheduled_at).getTime() - Date.now()) / 60000;
          if (mins > 0 && mins <= 40) {
            alerted40Ref.current.add(r.id);
            beep();
            toast.warning(`Course à venir dans ${Math.round(mins)} min`, { description: r.pickup_address });
          }
        });
      } catch { /* ignore */ }
    };
    loadFeed();
    const id = setInterval(loadFeed, 12000);
    return () => { alive = false; clearInterval(id); };
  }, []);


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
    // Poll active rewards every 60s
    const checkRewards = async () => {
      try {
        const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/drivers/my-active-rewards`, { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          setRewardsActive(!!d.any_active);
        }
      } catch (e) { console.warn('rewards check failed:', e?.message || e); }
    };
    checkRewards();
    const rewardInterval = setInterval(checkRewards, 60000);
    return () => { if (watchId != null) navigator.geolocation.clearWatch(watchId); clearInterval(rewardInterval); };
  }, [loadDriverProfile, sendLocation]);

  useEffect(() => {
    const unsub1 = on('new_ride_request', (msg) => {
      if (!currentRide && isOnline) setIncomingRequest(msg);
    });
    // Priority offers from auto-dispatch escalation (tier 1/2). Reuse the same UI as a regular request,
    // but flag it as priority so the driver knows it's escalated.
    const unsub3 = on('priority_ride_offer', (msg) => {
      if (!currentRide && isOnline) {
        setIncomingRequest({ ...msg, is_priority: true });
      }
    });
    const unsub2 = on('ride_status_update', (msg) => {
      if (currentRide && msg.ride_id === currentRide.id) {
        if (msg.status === 'cancelled') setCurrentRide(null);
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

  // Active zone bonuses (driver-shortage incentives)
  useEffect(() => {
    let active = true;
    const fetchBonuses = async () => {
      try {
        const res = await fetch(`${API}/api/rides/active-zone-bonuses`, { credentials: 'include' });
        if (active && res.ok) { const d = await res.json(); setZoneBonuses(d.bonuses || []); }
      } catch { /* non-blocking */ }
    };
    fetchBonuses();
    const id = setInterval(fetchBonuses, 30000);
    return () => { active = false; clearInterval(id); };
  }, []);

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
    } catch (err) { console.error('Failed to accept ride:', err); setIncomingRequest(null); }
  };

  const sendCounterOffer = async (rideId, amount) => {
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
    if (myOffer) sendCounterOffer(myOffer.rideId, myOffer.amount);
  };

  const cancelOffer = () => {
    setMyOffer(null);
    setIncomingRequest(null);
  };

  const finishRide = () => {
    setCurrentRide(null);
    loadDriverProfile();
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
        <div className="w-10 h-10 border-3 rounded-full animate-spin" style={{ borderColor: '#e5e7eb', borderTopColor: '#00B578' }} />
      </div>
    );
  }

  if (!driver) return null;

  return (
    <div className="mobile-container bg-white min-h-screen relative pb-20" data-testid="driver-home-page">
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
      {/* GREEN HEADER */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ background: '#00B578' }}>
        <button onClick={() => setShowMenu(true)} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center" data-testid="driver-menu-btn">
          <List size={20} className="text-white" />
        </button>
        <button onClick={toggleOnline}
          className={`flex items-center gap-2 px-5 py-2 rounded-full border-2 ${
            isOnline ? 'bg-white border-white' : 'bg-white/20 border-white/40'
          }`} data-testid="online-toggle">
          <span className={`text-sm font-bold ${isOnline ? 'text-green-700' : 'text-white'}`}>
            {isOnline ? 'En ligne' : 'Hors ligne'}
          </span>
          <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowScheduled(true)} className="relative w-10 h-10 rounded-full bg-white/20 flex items-center justify-center" data-testid="scheduled-reservations-btn" aria-label="Réservations planifiées">
            <CalendarCheck size={20} className="text-white" />
            {homeFeed.scheduled_pending.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center animate-pulse ring-2 ring-white" data-testid="scheduled-badge">
                {homeFeed.scheduled_pending.length}
              </span>
            )}
          </button>
          <button onClick={() => navigate('/chauffeur/notifications')} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center" data-testid="notifications-btn">
            <Bell size={20} className="text-white" />
          </button>
        </div>
      </div>

      {/* GAINS D'AUJOURD'HUI */}
      <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-gray-100">
        <span className="text-base font-bold text-gray-800">Gains d&apos;aujourd&apos;hui</span>
        <button
          type="button"
          onClick={() => setShowEarningsBreakdown(true)}
          className="flex items-center gap-1.5 group"
          data-testid="open-earnings-breakdown-btn"
          aria-label="Voir le détail des revenus"
        >
          <span className="text-base font-bold text-gray-800 group-hover:text-[#FF4500] transition-colors">
            {(driver.earnings || 0).toFixed(2)} EUR
          </span>
          <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[11px] font-bold group-hover:bg-blue-200">
            i
          </span>
        </button>
      </div>

      {/* 4 STAT CARDS */}
      <div className="grid grid-cols-4 gap-3 px-4 py-3 bg-white">
        {[
          { value: driver.total_trips || 0, label: 'Voyages/ emplois\nd\'aujourd\'hui', color: '#D1E8E2' },
          { value: (driver.rating || 5.0).toFixed(1), label: 'Moy.\nEvaluation', color: '#F8D7DA' },
          { value: homeFeed.upcoming.length, label: 'Emplois a\nvenir', color: '#FFF3CD',
            testId: 'stat-upcoming', onClick: () => navigate('/chauffeur/reservations?filter=upcoming'),
            blink: homeFeed.upcoming.length > 0 ? '#F59E0B' : null },
          { value: homeFeed.available_rides.length + homeFeed.available_deliveries.length, label: 'Emplois en\nattente', color: '#D4EDDA',
            testId: 'stat-pending', onClick: () => navigate('/chauffeur/reservations?filter=pending'),
            dots: [
              ...(homeFeed.available_rides.length ? [{ c: '#F59E0B', t: 'pending-yellow-dot' }] : []),
              ...(homeFeed.available_deliveries.length ? [{ c: '#2F9BFF', t: 'pending-blue-dot' }] : []),
            ] },
        ].map((stat) => (
          <button key={stat.label} type="button" onClick={stat.onClick} disabled={!stat.onClick}
            className="flex flex-col items-center text-center disabled:cursor-default" data-testid={stat.testId}>
            <div className="relative w-16 h-16 rounded-full flex items-center justify-center mb-1"
              style={{ backgroundColor: stat.color, boxShadow: stat.blink ? `0 0 0 3px ${stat.blink}` : 'none' }}>
              <span className={`text-lg font-bold text-gray-800 ${stat.blink ? 'animate-pulse' : ''}`}>{stat.value}</span>
              {(stat.dots || []).map((d, i) => (
                <span key={d.t} data-testid={d.t} className="absolute w-3 h-3 rounded-full ring-2 ring-white animate-pulse"
                  style={{ background: d.c, top: 0, right: i * 12 }} />
              ))}
            </div>
            <span className="text-[10px] text-gray-500 leading-tight whitespace-pre-line">{stat.label}</span>
          </button>
        ))}
      </div>

      {/* MAP */}
      <div className="flex-1 relative" style={{ height: '45vh' }}>
        <AdminGoogleMap
          center={mapCenter}
          zoom={15}
          driver={mapCenter}
          pickup={currentRide ? { lat: currentRide.pickup_lat, lng: currentRide.pickup_lng } : undefined}
          dropoff={currentRide ? { lat: currentRide.dropoff_lat, lng: currentRide.dropoff_lng } : undefined}
          markers={(currentRide?.stops || []).filter((s) => s?.lat).map((s, i) => ({ id: `wp-${i}`, lat: s.lat, lng: s.lng, label: String(i + 1), color: '#64748B' }))}
          routePath={currentRide ? (
            decodePolyline(currentRide.route_polyline).length
              ? decodePolyline(currentRide.route_polyline)
              : [
                { lat: currentRide.pickup_lat, lng: currentRide.pickup_lng },
                ...(currentRide.stops || []).filter((s) => s?.lat).map((s) => ({ lat: s.lat, lng: s.lng })),
                { lat: currentRide.dropoff_lat, lng: currentRide.dropoff_lng },
              ]
          ) : []}
          heatmapData={showHeatmap ? heatPoints.map((p) => [p.lat, p.lng, p.count || 1]) : undefined}
        />
        {/* Heat View toggle button */}
        <button
          onClick={() => setShowHeatmap(v => !v)}
          className={`absolute top-4 right-4 z-[500] px-3 py-2 rounded-full shadow-lg flex items-center gap-1.5 text-xs font-bold ${showHeatmap ? 'bg-red-500 text-white' : 'bg-white text-gray-800'}`}
          data-testid="heat-view-toggle"
        >
          <span className="text-base">🔥</span>
          {showHeatmap ? `Heat View ON · ${heatPoints.length}` : 'Heat View'}
        </button>
        {/* Destination Mode toggle button */}
        <button
          onClick={() => setShowDestModal(true)}
          className={`absolute top-16 right-4 z-[500] px-3 py-2 rounded-full shadow-lg flex items-center gap-1.5 text-xs font-bold ${destMode?.active ? 'bg-emerald-600 text-white' : 'bg-white text-gray-800'}`}
          data-testid="destination-mode-toggle"
        >
          <NavigationArrow size={14} weight="fill" />
          {destMode?.active ? 'Destination ON' : 'Mode Destination'}
        </button>
      </div>

      {/* FLOATING BUTTONS */}
      <div className="absolute bottom-28 left-0 right-0 z-[1000] px-4 flex items-end justify-between pointer-events-none">
        {rewardsActive ? (
          <button onClick={() => navigate('/chauffeur/rewards')} className="pointer-events-auto flex items-center gap-2 px-5 py-3 rounded-full shadow-lg animate-pulse-subtle" style={{ background: '#00B578' }} data-testid="rewards-floating-btn">
            <Gift size={18} className="text-white" />
            <span className="text-white text-sm font-bold">Recompenses</span>
          </button>
        ) : (
          <button onClick={() => navigate('/chauffeur/rewards')} className="pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-full shadow-lg bg-white border border-amber-300" data-testid="rewards-floating-btn">
            <Gift size={18} style={{ color: '#F59E0B' }} weight="fill" />
            <span className="text-amber-600 text-sm font-bold">Bonus</span>
          </button>
        )}

        {/* Radial speed-dial FAB */}
        <div className="pointer-events-auto flex flex-col items-end gap-2.5" data-testid="driver-fab">
          {fabOpen && (
            <div className="flex flex-col items-end gap-2.5 mb-1" data-testid="driver-fab-menu">
              {[
                { label: "Planificateur de demande basé sur l'IA", Icon: Sparkle, onClick: () => toast.info('Planificateur IA bientôt disponible.') },
                { label: 'Appelez un taxi', Icon: Taxi, onClick: () => setShowTaxiHall(true) },
                { label: 'Chaleur', Icon: Fire, onClick: () => setShowHeatmap((v) => !v) },
                { label: 'Revenir', Icon: ArrowUUpLeft, onClick: () => setShowDestModal(true) },
                { label: 'Emplacements', Icon: MapPin, onClick: () => toast.info('Emplacements favoris — bientôt disponible.') },
                { label: 'Informations sur le véhicule', Icon: Car, onClick: () => navigate('/chauffeur/vehicles') },
              ].map(({ label, Icon, onClick }, i) => (
                <button key={label} onClick={() => { setFabOpen(false); onClick(); }}
                  className="flex items-center gap-2.5 animate-in slide-in-from-bottom-2 fade-in" style={{ animationDelay: `${i * 30}ms` }}
                  data-testid={`fab-action-${i}`}>
                  <span className="bg-white text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full shadow-md whitespace-nowrap">{label}</span>
                  <span className="w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center flex-shrink-0">
                    <Icon size={20} weight="fill" style={{ color: '#00B578' }} />
                  </span>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setFabOpen((v) => !v)} className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-transform" style={{ background: fabOpen ? '#0B0B0B' : '#00B578', transform: fabOpen ? 'rotate(135deg)' : 'none' }} data-testid="driver-fab-toggle">
            <Plus size={26} className="text-white" weight="bold" />
          </button>
        </div>
      </div>

        {/* Active ride — full-screen V3Cube flow */}
        {currentRide && (
          <DriverRideFlow
            ride={currentRide}
            driverPos={mapCenter}
            onFinished={finishRide}
            onMinimize={() => setCurrentRide(null)}
          />
        )}

      {/* Incoming Request — V3Cube PARTNER APP sheet */}
      {incomingRequest && !currentRide && (
        <IncomingRequestSheet
          request={incomingRequest}
          driverPos={mapCenter}
          onAccept={acceptRide}
          onDecline={() => setIncomingRequest(null)}
          myOffer={myOffer}
          nowTs={nowTs}
          onSendCounterOffer={sendCounterOffer}
          onRenewOffer={renewOffer}
          onCancelOffer={cancelOffer}
        />
      )}

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

      {/* Bottom Nav */}
      <DriverBottomNav active="home" />

      {/* Earnings Breakdown Modal */}
      <EarningsBreakdownModal
        open={showEarningsBreakdown}
        onClose={() => setShowEarningsBreakdown(false)}
      />

      {/* Destination Mode Modal */}
      {showDestModal && (
        <div className="fixed inset-0 z-[10000] bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowDestModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} data-testid="destination-mode-modal">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Mode Destination</h2>
              <button onClick={() => setShowDestModal(false)} className="text-gray-400"><X size={20} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">Définissez votre destination pour ne recevoir que les courses qui vont dans cette direction (rentrer à la maison, fin de service, etc.).</p>
            {destMode?.active ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 mb-3">
                <div className="text-xs text-emerald-700 font-semibold">ACTIF</div>
                <div className="text-sm text-gray-900 mt-1">{destMode.target?.address || `${destMode.target?.lat?.toFixed(4)}, ${destMode.target?.lng?.toFixed(4)}`}</div>
              </div>
            ) : (
              <div className="space-y-2 mb-3">
                <input type="text" placeholder="Adresse (ex: 10 Rue de Rivoli, Paris)" value={destInput.address}
                  onChange={(e) => setDestInput({ ...destInput, address: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" data-testid="dest-address-input" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" step="0.0001" placeholder="Latitude" value={destInput.lat}
                    onChange={(e) => setDestInput({ ...destInput, lat: e.target.value })}
                    className="border border-gray-300 rounded-xl px-3 py-2.5 text-sm" data-testid="dest-lat-input" />
                  <input type="number" step="0.0001" placeholder="Longitude" value={destInput.lng}
                    onChange={(e) => setDestInput({ ...destInput, lng: e.target.value })}
                    className="border border-gray-300 rounded-xl px-3 py-2.5 text-sm" data-testid="dest-lng-input" />
                </div>
              </div>
            )}
            <div className="flex gap-2">
              {destMode?.active ? (
                <button onClick={() => saveDestinationMode(false)}
                  className="flex-1 bg-red-500 text-white rounded-full h-11 font-bold text-sm" data-testid="dest-disable-btn">
                  Désactiver
                </button>
              ) : (
                <button onClick={() => saveDestinationMode(true)}
                  disabled={!destInput.lat || !destInput.lng}
                  className="flex-1 bg-emerald-600 text-white rounded-full h-11 font-bold text-sm disabled:opacity-50" data-testid="dest-enable-btn">
                  Activer
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverHome;
