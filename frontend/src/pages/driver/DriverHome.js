import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { driverAPI, rideAPI } from '../../services/api';
import { DriverBottomNav } from './DriverProfilePage';
import {
  Car, MapPin, Star, Bell, Power, X, Check, NavigationArrow, User, ChatCircleDots, ChatCircle,
  Gift, Plus, CalendarCheck, List
} from '@phosphor-icons/react';
import LeafletMap from '../../components/LeafletMap';
import { decodePolyline } from '../../utils/polyline';
import SideMenuDrawer from '../../components/SideMenuDrawer';
import EarningsBreakdownModal from '../../components/EarningsBreakdownModal';
import { CountdownRing } from '../../components/CountdownRing';

const API = process.env.REACT_APP_BACKEND_URL;
const DriverHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [driver, setDriver] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [currentRide, setCurrentRide] = useState(null);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [myOffer, setMyOffer] = useState(null); // { rideId, amount, expires_at, ttl_seconds }
  const [nowTs, setNowTs] = useState(Date.now());
  const [showOtpVerify, setShowOtpVerify] = useState(false);
  const [otpInput, setOtpInput] = useState('');
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
  const locationWatchId = useRef(null);

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

  const loadDriverProfile = useCallback(async (retries = 2) => {
    try {
      const res = await driverAPI.getProfile();
      setDriver(res.data);
      setIsOnline(res.data.is_online);
      setLoading(false);
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => loadDriverProfile(retries - 1), 1500);
        return;
      }
      console.error('Driver profile error:', err.response?.status);
      setLoading(false);
    }
  }, []);

  const setupLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        setMapCenter({ lat: latitude, lng: longitude });
        driverAPI.updateLocation(latitude, longitude).catch(() => {});
        sendLocation(latitude, longitude);
      }, () => {}
    );
    locationWatchId.current = navigator.geolocation.watchPosition(
      ({ coords: { latitude, longitude } }) => {
        setMapCenter({ lat: latitude, lng: longitude });
        sendLocation(latitude, longitude);
      }, () => {}, { enableHighAccuracy: true }
    );
  }, [sendLocation]);

  const loadPendingRides = useCallback(async () => {
    if (!driver || driver.status !== 'approved') return;
    try {
      const res = await rideAPI.list({ status: 'pending' });
      if (res.data.length > 0 && !currentRide && !incomingRequest) setIncomingRequest(res.data[0]);
    } catch (err) { console.error('Failed to load pending rides:', err); }
  }, [driver, currentRide, incomingRequest]);

  useEffect(() => {
    loadDriverProfile();
    setupLocation();
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
    return () => { if (locationWatchId.current) navigator.geolocation.clearWatch(locationWatchId.current); clearInterval(rewardInterval); };
  }, [loadDriverProfile, setupLocation]);

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
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [on, currentRide, isOnline]);

  useEffect(() => {
    if (isOnline && !currentRide) {
      const interval = setInterval(loadPendingRides, 8000);
      return () => clearInterval(interval);
    }
  }, [isOnline, currentRide, loadPendingRides]);

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

  const verifyStartOtp = async () => {
    if (!otpInput || otpInput.length !== 4) return;
    try {
      const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/phase1/rides/${currentRide.id}/start-otp/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ otp: otpInput }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        alert(e.detail || 'OTP invalide');
        return;
      }
      setShowOtpVerify(false);
      setOtpInput('');
      const res = await rideAPI.get(currentRide.id);
      setCurrentRide(res.data);
    } catch (e) { console.warn('refresh ride after OTP failed:', e?.message || e); }
  };

  const updateRideStatus = async (status) => {
    if (!currentRide) return;
    try {
      await rideAPI.updateStatus(currentRide.id, status);
      if (status === 'completed' || status === 'cancelled') setCurrentRide(null);
      else { const res = await rideAPI.get(currentRide.id); setCurrentRide(res.data); }
    } catch (err) { console.error('Failed to update ride status:', err); }
  };

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
          <button className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center" style={{ color: '#00B578' }}>
            <CalendarCheck size={20} className="text-white" />
          </button>
          <button onClick={() => navigate('/chauffeur/notifications')} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center" data-testid="notifications-btn">
            <Bell size={20} className="text-white" />
          </button>
        </div>
      </div>

      {/* GAINS D'AUJOURD'HUI */}
      <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-gray-100">
        <span className="text-base font-bold text-gray-800">Gains d'aujourd'hui</span>
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
          { value: 0, label: 'Emplois a\nvenir', color: '#FFF3CD' },
          { value: 0, label: 'Emplois en\nattente', color: '#D4EDDA' },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-1" style={{ backgroundColor: stat.color }}>
              <span className="text-lg font-bold text-gray-800">{stat.value}</span>
            </div>
            <span className="text-[10px] text-gray-500 leading-tight whitespace-pre-line">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* MAP */}
      <div className="flex-1 relative" style={{ height: '45vh' }}>
        <LeafletMap
          center={mapCenter}
          zoom={15}
          driver={mapCenter}
          pickup={currentRide ? { lat: currentRide.pickup_lat, lng: currentRide.pickup_lng } : undefined}
          dropoff={currentRide ? { lat: currentRide.dropoff_lat, lng: currentRide.dropoff_lng } : undefined}
          waypoints={(currentRide?.stops || []).filter((s) => s?.lat)}
          routePath={currentRide ? (
            decodePolyline(currentRide.route_polyline).length
              ? decodePolyline(currentRide.route_polyline)
              : [
                { lat: currentRide.pickup_lat, lng: currentRide.pickup_lng },
                ...(currentRide.stops || []).filter((s) => s?.lat).map((s) => ({ lat: s.lat, lng: s.lng })),
                { lat: currentRide.dropoff_lat, lng: currentRide.dropoff_lng },
              ]
          ) : []}
          heatPoints={showHeatmap ? heatPoints : []}
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
      <div className="absolute bottom-24 left-0 right-0 z-[1000] px-4 flex items-center justify-between">
        {rewardsActive ? (
          <button onClick={() => navigate('/chauffeur/rewards')} className="flex items-center gap-2 px-5 py-3 rounded-full shadow-lg animate-pulse-subtle" style={{ background: '#00B578' }} data-testid="rewards-floating-btn">
            <Gift size={18} className="text-white" />
            <span className="text-white text-sm font-bold">Recompenses</span>
          </button>
        ) : <div />}
        <button className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center" style={{ background: '#00B578' }}>
          <Plus size={22} className="text-white" weight="bold" />
        </button>
      </div>

        {/* Current Ride */}
        {currentRide && (
          <div className="mx-4 mt-2 bg-white rounded-2xl p-4 shadow-lg border border-gray-100" data-testid="current-ride">
            <div className="flex items-center justify-between mb-3">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                currentRide.status === 'accepted' ? 'bg-blue-100 text-blue-700' :
                currentRide.status === 'arriving' ? 'bg-amber-100 text-amber-700' :
                'bg-green-100 text-green-700'}`}>
                {currentRide.status === 'accepted' ? 'Acceptee' : currentRide.status === 'arriving' ? 'En route' : 'En cours'}
              </span>
              <span className="font-bold text-lg" style={{ color: '#00B578' }}>{currentRide.estimated_fare?.toFixed(2)} EUR</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                </div>
                <div>
                  <p className="text-gray-400 text-[10px] uppercase tracking-wider">Depart</p>
                  <p className="text-gray-800 text-sm font-medium">{currentRide.pickup_address}</p>
                </div>
              </div>
              {(currentRide.stops || []).filter((s) => s?.address).map((s, i) => (
                <div key={`cr-stop-${i}`} className="flex items-start gap-2.5" data-testid={`current-ride-stop-${i}`}>
                  <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center mt-0.5 flex-shrink-0 text-[10px] font-bold text-[#0B1426]">{i + 1}</div>
                  <div>
                    <p className="text-gray-400 text-[10px] uppercase tracking-wider">Arrêt {i + 1}</p>
                    <p className="text-gray-800 text-sm font-medium">{s.address}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <MapPin size={10} className="text-red-500" />
                </div>
                <div>
                  <p className="text-gray-400 text-[10px] uppercase tracking-wider">Arrivee</p>
                  <p className="text-gray-800 text-sm font-medium">{currentRide.dropoff_address}</p>
                </div>
              </div>
            </div>
            {currentRide.status === 'in_progress' && currentRide.otp && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center mt-3">
                <p className="text-gray-500 text-[10px] uppercase">Code OTP</p>
                <p className="font-bold text-2xl tracking-widest text-blue-600">{currentRide.otp}</p>
              </div>
            )}
            <div className="flex gap-2 mt-3">
              {currentRide.status === 'accepted' && (
                <button className="flex-1 text-white rounded-full py-3 text-sm font-bold flex items-center justify-center gap-1.5" style={{ background: '#00B578' }}
                  onClick={() => updateRideStatus('arriving')} data-testid="arriving-btn">
                  <NavigationArrow size={16} /> En route
                </button>
              )}
              {currentRide.status === 'arriving' && (
                <button className="flex-1 text-white rounded-full py-3 text-sm font-bold" style={{ background: '#00B578' }}
                  onClick={() => setShowOtpVerify(true)} data-testid="start-trip-btn">
                  Demarrer (OTP)
                </button>
              )}
              {currentRide.status === 'in_progress' && (
                <button className="flex-1 text-white rounded-full py-3 text-sm font-bold" style={{ background: '#00B578' }}
                  onClick={() => updateRideStatus('completed')} data-testid="complete-trip-btn">
                  Terminer la course
                </button>
              )}
              <button className="px-4 border border-gray-300 text-gray-600 rounded-full py-3 text-sm font-medium"
                onClick={() => updateRideStatus('cancelled')} data-testid="cancel-btn">
                Annuler
              </button>
            </div>

            {/* Chat button */}
            <button onClick={() => navigate(`/ride/${currentRide.id}/chat`)}
              className="w-full mt-3 bg-orange-50 text-[#FF4500] rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2" data-testid="open-chat-btn">
              <ChatCircle size={16} weight="fill" /> Discuter avec le passager
            </button>
          </div>
        )}

        {/* OTP Verify Modal */}
        {showOtpVerify && currentRide && (
          <div className="absolute inset-0 z-[2500] bg-black/60 flex items-center justify-center p-5" data-testid="otp-verify-modal">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
              <h3 className="text-lg font-bold text-gray-800 mb-1">Demander le code OTP</h3>
              <p className="text-xs text-gray-500 mb-4">Demandez au passager son code a 4 chiffres pour demarrer la course</p>
              <input type="text" inputMode="numeric" maxLength="4" value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                placeholder="0000"
                className="w-full text-center text-3xl tracking-[0.5em] py-3 bg-gray-50 rounded-xl border border-gray-200 font-bold mb-4"
                data-testid="otp-input" autoFocus />
              <div className="flex gap-2">
                <button onClick={() => { setShowOtpVerify(false); setOtpInput(''); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-bold text-sm text-gray-600">Annuler</button>
                <button onClick={verifyStartOtp} disabled={otpInput.length !== 4}
                  className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50" style={{ background: '#00B578' }}
                  data-testid="verify-otp-btn">
                  Verifier
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Incoming Request Modal */}
      {incomingRequest && !currentRide && (
        <div className="absolute inset-0 z-[2000] bg-black/50 flex items-end" data-testid="incoming-request-modal">
          <div className="w-full bg-white rounded-t-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-gray-800">{incomingRequest.is_priority ? 'Course prioritaire' : 'Nouvelle course'}</h3>
                {incomingRequest.is_priority && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300 animate-pulse" data-testid="priority-badge">
                    ⚡ TIER {incomingRequest.tier || 1}
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase font-bold">Prix propose</p>
                <span className="text-2xl font-bold" style={{ color: '#00B578' }}>
                  {(incomingRequest.proposed_fare || incomingRequest.estimated_fare)?.toFixed(2)} EUR
                </span>
                {incomingRequest.proposed_fare && incomingRequest.estimated_fare && incomingRequest.proposed_fare !== incomingRequest.estimated_fare && (
                  <p className="text-[10px] text-gray-500">Estime: {incomingRequest.estimated_fare.toFixed(2)} EUR</p>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Depart</p>
                  <p className="font-medium text-gray-800">{incomingRequest.pickup_address}</p>
                </div>
              </div>
              {(incomingRequest.stops || []).filter((s) => s?.address).map((s, i) => (
                <div key={`rq-stop-${i}`} className="flex items-start gap-3" data-testid={`request-stop-${i}`}>
                  <div className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center mt-0.5 text-[11px] font-bold text-[#0B1426]">{i + 1}</div>
                  <div>
                    <p className="text-gray-400 text-xs">Arrêt {i + 1}</p>
                    <p className="font-medium text-gray-800">{s.address}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center mt-0.5">
                  <MapPin size={12} className="text-red-500" />
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Arrivee</p>
                  <p className="font-medium text-gray-800">{incomingRequest.dropoff_address}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{incomingRequest.distance_km?.toFixed(1)} km</span>
              <span>{incomingRequest.duration_mins} min</span>
              <span className="capitalize">{incomingRequest.vehicle_type}</span>
            </div>

            {/* Counter-offer: input (before sending) OR pending panel with countdown (after) */}
            {myOffer && myOffer.rideId === incomingRequest.id ? (
              (() => {
                const rem = myOffer.expires_at
                  ? Math.max(0, Math.ceil((new Date(myOffer.expires_at).getTime() - nowTs) / 1000))
                  : null;
                const expired = rem === 0;
                return (
                  <div className={`rounded-xl p-4 border ${expired ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`} data-testid="my-offer-panel">
                    <div className="flex items-center gap-3">
                      {rem !== null && !expired && <CountdownRing seconds={rem} total={myOffer.ttl_seconds || 30} size={44} />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Votre offre envoyée</p>
                        <p className="text-2xl font-extrabold text-slate-900" data-testid="my-offer-amount">{myOffer.amount.toFixed(2)} EUR</p>
                        <p className={`text-xs font-semibold ${expired ? 'text-red-600' : 'text-emerald-700'}`} data-testid="my-offer-status">
                          {expired ? 'Offre expirée — renvoyez-la pour rester visible' : `Expire dans ${rem}s · en attente du client`}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={cancelOffer}
                        className="px-4 h-11 rounded-full border border-gray-300 text-gray-600 font-bold text-sm"
                        data-testid="cancel-offer-btn"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={renewOffer}
                        className={`flex-1 h-11 rounded-full text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg ${expired ? 'bg-red-500 animate-pulse' : 'bg-orange-500'}`}
                        data-testid="renew-offer-btn"
                      >
                        <Plus size={18} /> Renouveler mon offre
                      </button>
                    </div>
                  </div>
                );
              })()
            ) : (
              <>
                {/* Counter-offer input */}
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-slate-700 mb-2">Proposer un autre prix (optionnel)</p>
                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                      <span className="text-base">EUR</span>
                      <input
                        type="number"
                        step="0.50"
                        min="1"
                        placeholder={(incomingRequest.proposed_fare || incomingRequest.estimated_fare)?.toFixed(2)}
                        className="flex-1 outline-none text-base font-bold text-slate-800"
                        data-testid="counter-offer-input"
                        id={`counter-input-${incomingRequest.id}`}
                      />
                    </div>
                    <button
                      onClick={() => {
                        const val = document.getElementById(`counter-input-${incomingRequest.id}`)?.value;
                        if (val && parseFloat(val) > 0) sendCounterOffer(incomingRequest.id, val);
                      }}
                      className="px-4 rounded-lg bg-orange-500 text-white font-bold text-sm"
                      data-testid="send-counter-offer-btn"
                    >
                      Envoyer
                    </button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button className="flex-1 border border-gray-300 text-gray-600 rounded-full h-14 font-bold flex items-center justify-center gap-2"
                    onClick={() => setIncomingRequest(null)} data-testid="reject-ride-btn">
                    <X size={20} /> Refuser
                  </button>
                  <button className="flex-1 text-white rounded-full h-14 font-bold flex items-center justify-center gap-2 shadow-lg" style={{ background: '#00B578' }}
                    onClick={() => acceptRide(incomingRequest.id)} data-testid="accept-ride-btn">
                    <Check size={20} /> Accepter prix
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
