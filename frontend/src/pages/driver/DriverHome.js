import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { driverAPI, rideAPI } from '../../services/api';
import { DriverBottomNav } from './DriverProfilePage';
import {
  Car, MapPin, Star, Bell, Power, X, Check, NavigationArrow, User, ChatCircleDots, ChatCircle,
  Gift, Plus, CalendarCheck
} from '@phosphor-icons/react';
import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';

const GMAP_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;
const DriverHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [driver, setDriver] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [currentRide, setCurrentRide] = useState(null);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [showOtpVerify, setShowOtpVerify] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [rewardsActive, setRewardsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mapCenter, setMapCenter] = useState({ lat: 48.8566, lng: 2.3522 });
  const locationWatchId = useRef(null);

  const { isLoaded: gmapLoaded } = useJsApiLoader({ googleMapsApiKey: GMAP_KEY || '' });

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
      } catch { /* ignore */ }
    };
    checkRewards();
    const rewardInterval = setInterval(checkRewards, 60000);
    return () => { if (locationWatchId.current) navigator.geolocation.clearWatch(locationWatchId.current); clearInterval(rewardInterval); };
  }, [loadDriverProfile, setupLocation]);

  useEffect(() => {
    const unsub1 = on('new_ride_request', (msg) => {
      if (!currentRide && isOnline) setIncomingRequest(msg);
    });
    const unsub2 = on('ride_status_update', (msg) => {
      if (currentRide && msg.ride_id === currentRide.id) {
        if (msg.status === 'cancelled') setCurrentRide(null);
        else setCurrentRide(prev => prev ? { ...prev, status: msg.status } : null);
      }
    });
    return () => { unsub1(); unsub2(); };
  }, [on, currentRide, isOnline]);

  useEffect(() => {
    if (isOnline && !currentRide) {
      const interval = setInterval(loadPendingRides, 8000);
      return () => clearInterval(interval);
    }
  }, [isOnline, currentRide, loadPendingRides]);

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
      setIncomingRequest(null);
    } catch (err) { console.error('Counter offer failed:', err); }
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
    } catch { /* ignore */ }
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
        <button onClick={() => navigate('/chauffeur/profile')} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center" data-testid="profile-btn">
          <User size={20} className="text-white" />
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
        <span className="text-base font-bold text-gray-800">{(driver.earnings || 0).toFixed(2)} EUR</span>
      </div>

      {/* 4 STAT CARDS */}
      <div className="grid grid-cols-4 gap-3 px-4 py-3 bg-white">
        {[
          { value: driver.total_trips || 0, label: 'Voyages/ emplois\nd\'aujourd\'hui', color: '#D1E8E2' },
          { value: (driver.rating || 5.0).toFixed(1), label: 'Moy.\nEvaluation', color: '#F8D7DA' },
          { value: 0, label: 'Emplois a\nvenir', color: '#FFF3CD' },
          { value: 0, label: 'Emplois en\nattente', color: '#D4EDDA' },
        ].map((stat, i) => (
          <div key={i} className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-1" style={{ backgroundColor: stat.color }}>
              <span className="text-lg font-bold text-gray-800">{stat.value}</span>
            </div>
            <span className="text-[10px] text-gray-500 leading-tight whitespace-pre-line">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* MAP */}
      <div className="flex-1" style={{ height: '45vh' }}>
        {gmapLoaded ? (
          <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={mapCenter} zoom={15} options={{ disableDefaultUI: true, zoomControl: false }}>
            <MarkerF position={mapCenter} />
          </GoogleMap>
        ) : (
          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
            <span className="text-gray-400 text-sm">Chargement de la carte...</span>
          </div>
        )}
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
              <h3 className="text-xl font-bold text-gray-800">Nouvelle course</h3>
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
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <DriverBottomNav active="home" />
    </div>
  );
};

export default DriverHome;
