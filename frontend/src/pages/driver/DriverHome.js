import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAppSettings } from '../../hooks/useAppSettings';
import { toast } from 'sonner';
import { driverAPI, rideAPI } from '../../services/api';
import { DriverBottomNav } from './DriverProfilePage';
import { X, Gift, UsersThree } from '@phosphor-icons/react';
import SideMenuDrawer from '../../components/SideMenuDrawer';
import EarningsBreakdownModal from '../../components/EarningsBreakdownModal';
import IncomingRequestSheet from '../../components/driver/IncomingRequestSheet';
import DriverRideFlow from '../../components/driver/DriverRideFlow';
import ScheduledReservationsSheet from '../../components/driver/ScheduledReservationsSheet';
import TaxiHallModal from '../../components/driver/TaxiHallModal';
import DriverHomeHeader from '../../components/driver/home/DriverHomeHeader';
import DriverStatsRow from '../../components/driver/home/DriverStatsRow';
import DriverHomeMap from '../../components/driver/home/DriverHomeMap';
import DriverFab from '../../components/driver/home/DriverFab';
import DestinationModeModal from '../../components/driver/home/DestinationModeModal';

const API = process.env.REACT_APP_BACKEND_URL;
const DriverHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { settings: appSettings } = useAppSettings();
  const [driver, setDriver] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [currentRide, setCurrentRide] = useState(null);
  const activeRestoredRef = useRef(false);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [myOffer, setMyOffer] = useState(null); // { rideId, amount, expires_at, ttl_seconds }
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [rewardsActive, setRewardsActive] = useState(false);
  const [rewardsCount, setRewardsCount] = useState(0);
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
          setRewardsCount((d.vehicle_rewards?.length || 0) + (d.guarantees?.length || 0));
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
      <DriverHomeHeader
        isOnline={isOnline}
        onToggleOnline={toggleOnline}
        onMenu={() => setShowMenu(true)}
        scheduledCount={homeFeed.scheduled_pending.length}
        onScheduled={() => setShowScheduled(true)}
        onNotifications={() => navigate('/chauffeur/notifications')}
      />

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
        onAiPlanner={() => toast.info('Planificateur IA bientôt disponible.')}
        onTaxiHall={() => setShowTaxiHall(true)}
        onHeatmap={() => setShowHeatmap((v) => !v)}
        onDest={() => setShowDestModal(true)}
        onLocations={() => toast.info('Emplacements favoris — bientôt disponible.')}
        onVehicleInfo={() => navigate('/chauffeur/vehicles')}
      />

        {/* Active ride — full-screen V3Cube flow */}
        {currentRide && (
          <DriverRideFlow
            ride={currentRide}
            driverPos={mapCenter}
            askOtp={appSettings.ask_otp_before_start !== false}
            onFinished={finishRide}
            onMinimize={() => setCurrentRide(null)}
          />
        )}

      {/* Incoming Request — V3Cube PARTNER APP sheet */}
      {incomingRequest && !currentRide && (
        <IncomingRequestSheet
          request={incomingRequest}
          driverPos={mapCenter}
          windowSeconds={Math.max(10, appSettings.driver_timeout || 35)}
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
