import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { driverAPI, rideAPI } from '../../services/api';
import { DriverBottomNav } from './DriverEarningsPage';
import {
  Car, MapPin, Star, Bell, Power, X, Check, NavigationArrow, User, ChatCircleDots
} from '@phosphor-icons/react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const DriverHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [driver, setDriver] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [currentRide, setCurrentRide] = useState(null);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapCenter, setMapCenter] = useState([48.8566, 2.3522]);
  const locationWatchId = useRef(null);

  const { on, sendLocation, joinRide } = useWebSocket(user?.id);

  useEffect(() => {
    loadDriverProfile();
    setupLocation();
    return () => { if (locationWatchId.current) navigator.geolocation.clearWatch(locationWatchId.current); };
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

  const loadDriverProfile = useCallback(async () => {
    try {
      const res = await driverAPI.getProfile();
      setDriver(res.data);
      setIsOnline(res.data.is_online);
    } catch (err) {
      if (err.response?.status === 404) navigate('/driver/register');
    } finally { setLoading(false); }
  }, [navigate]);

  const setupLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        setMapCenter([latitude, longitude]);
        driverAPI.updateLocation(latitude, longitude).catch(() => {});
        sendLocation(latitude, longitude);
      }, () => {}
    );
    locationWatchId.current = navigator.geolocation.watchPosition(
      ({ coords: { latitude, longitude } }) => {
        setMapCenter([latitude, longitude]);
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
      <div className="mobile-container min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center animate-pulse">
          <Car size={32} weight="duotone" className="text-amber-500" />
        </div>
      </div>
    );
  }

  if (!driver) return null;

  return (
    <div className="mobile-container bg-gray-950 min-h-screen relative" data-testid="driver-home-page">
      {/* Map */}
      <div className="h-[55vh]">
        <MapContainer center={mapCenter} zoom={15} className="w-full h-full" zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={mapCenter} />
        </MapContainer>
      </div>

      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 bg-gray-900/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg border border-gray-800">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center">
              <User size={18} className="text-amber-500" />
            </div>
            <div>
              <p className="font-semibold text-sm text-white">{user?.name}</p>
              <div className="flex items-center gap-1">
                <Star size={10} weight="fill" className="text-amber-500" />
                <span className="text-xs text-gray-400">{driver.rating.toFixed(1)}</span>
              </div>
            </div>
          </div>
          <button className="w-10 h-10 rounded-full bg-gray-900/90 backdrop-blur-sm shadow-lg border border-gray-800 flex items-center justify-center" data-testid="notifications-btn">
            <Bell size={18} className="text-white" />
          </button>
        </div>
      </div>

      {/* Bottom Sheet */}
      <div className="absolute bottom-16 left-0 right-0 z-[1000] px-4 space-y-3">
        {/* Pending Approval */}
        {driver.status === 'pending' && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Car size={20} className="text-amber-500" />
            </div>
            <div>
              <p className="font-semibold text-amber-400 text-sm">Compte en cours de v&eacute;rification</p>
              <p className="text-amber-500/60 text-xs">Vos documents sont en cours d'examen</p>
            </div>
          </div>
        )}

        {driver.status === 'rejected' && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
            <p className="font-semibold text-red-400 text-sm">Demande rejet&eacute;e</p>
            <p className="text-red-500/60 text-xs">{driver.rejection_reason || 'Contactez le support'}</p>
          </div>
        )}

        {/* Online/Offline Toggle */}
        {driver.status === 'approved' && !currentRide && (
          <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={toggleOnline}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${
                    isOnline ? 'bg-amber-500 shadow-amber-500/30' : 'bg-gray-700'}`}
                  data-testid="online-toggle">
                  <Power size={26} className="text-white" weight="bold" />
                </button>
                <div>
                  <p className="font-bold text-white text-sm">{isOnline ? 'Vous \u00eates en ligne' : 'Vous \u00eates hors ligne'}</p>
                  <p className="text-gray-500 text-xs">{isOnline ? 'Pr\u00eat \u00e0 recevoir des courses' : 'Appuyez pour passer en ligne'}</p>
                </div>
              </div>
            </div>
            {/* Mini Stats */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="bg-gray-800 rounded-xl p-2.5 text-center">
                <p className="text-white font-bold text-base">{driver.total_trips}</p>
                <p className="text-gray-500 text-[10px]">Courses</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-2.5 text-center">
                <p className="text-white font-bold text-base">{driver.earnings.toFixed(0)}&euro;</p>
                <p className="text-gray-500 text-[10px]">Gains</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-2.5 text-center">
                <p className="text-white font-bold text-base">{driver.rating.toFixed(1)}</p>
                <p className="text-gray-500 text-[10px]">Note</p>
              </div>
            </div>
          </div>
        )}

        {/* Current Ride */}
        {currentRide && (
          <div className="bg-gray-900/95 backdrop-blur-sm border border-amber-500/30 rounded-2xl p-4 shadow-xl" data-testid="current-ride">
            <div className="flex items-center justify-between mb-3">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                currentRide.status === 'accepted' ? 'bg-blue-500/10 text-blue-400' :
                currentRide.status === 'arriving' ? 'bg-amber-500/10 text-amber-400' :
                'bg-emerald-500/10 text-emerald-400'}`}>
                {currentRide.status === 'accepted' ? 'Accept\u00e9e' : currentRide.status === 'arriving' ? 'En route' : 'En cours'}
              </span>
              <span className="font-bold text-amber-500 text-lg">{currentRide.estimated_fare?.toFixed(2)} &euro;</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </div>
                <div>
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider">D\u00e9part</p>
                  <p className="text-white text-sm font-medium">{currentRide.pickup_address}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <MapPin size={10} className="text-red-400" />
                </div>
                <div>
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider">Arriv\u00e9e</p>
                  <p className="text-white text-sm font-medium">{currentRide.dropoff_address}</p>
                </div>
              </div>
            </div>
            {currentRide.status === 'in_progress' && currentRide.otp && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-center mt-3">
                <p className="text-gray-400 text-[10px] uppercase">Code OTP</p>
                <p className="font-bold text-2xl tracking-widest text-blue-400">{currentRide.otp}</p>
              </div>
            )}
            <div className="flex gap-2 mt-3">
              {currentRide.status === 'accepted' && (
                <button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white rounded-full py-3 text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
                  onClick={() => updateRideStatus('arriving')} data-testid="arriving-btn">
                  <NavigationArrow size={16} /> En route
                </button>
              )}
              {currentRide.status === 'arriving' && (
                <button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white rounded-full py-3 text-sm font-bold transition-colors"
                  onClick={() => updateRideStatus('in_progress')} data-testid="start-trip-btn">
                  D\u00e9marrer la course
                </button>
              )}
              {currentRide.status === 'in_progress' && (
                <button className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full py-3 text-sm font-bold transition-colors"
                  onClick={() => updateRideStatus('completed')} data-testid="complete-trip-btn">
                  Terminer la course
                </button>
              )}
              <button className="px-4 border border-gray-700 text-gray-400 rounded-full py-3 text-sm font-medium hover:bg-gray-800 transition-colors"
                onClick={() => updateRideStatus('cancelled')} data-testid="cancel-btn">
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Incoming Request Modal */}
      {incomingRequest && !currentRide && (
        <div className="absolute inset-0 z-[2000] bg-black/60 flex items-end" data-testid="incoming-request-modal">
          <div className="w-full bg-gray-900 border-t border-amber-500/30 rounded-t-3xl p-6 space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Nouvelle course</h3>
              <span className="text-2xl font-bold text-amber-500">{incomingRequest.estimated_fare?.toFixed(2)} &euro;</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                </div>
                <div>
                  <p className="text-gray-500 text-xs">D\u00e9part</p>
                  <p className="font-medium text-white">{incomingRequest.pickup_address}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center mt-0.5">
                  <MapPin size={12} className="text-red-400" />
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Arriv\u00e9e</p>
                  <p className="font-medium text-white">{incomingRequest.dropoff_address}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{incomingRequest.distance_km?.toFixed(1)} km</span>
              <span>{incomingRequest.duration_mins} min</span>
              <span className="capitalize">{incomingRequest.vehicle_type}</span>
            </div>
            <div className="flex gap-3">
              <button className="flex-1 border border-gray-700 text-gray-300 rounded-full h-14 font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors"
                onClick={() => setIncomingRequest(null)} data-testid="reject-ride-btn">
                <X size={20} /> Refuser
              </button>
              <button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white rounded-full h-14 font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-amber-500/20"
                onClick={() => acceptRide(incomingRequest.id)} data-testid="accept-ride-btn">
                <Check size={20} /> Accepter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Live Chat Button */}
      <button onClick={() => navigate('/chauffeur/livechat')}
        className="fixed z-[1001] bottom-20 right-4 w-14 h-14 rounded-full bg-[#10b981] shadow-lg shadow-emerald-500/30 flex items-center justify-center hover:bg-emerald-600 transition-all active:scale-95"
        data-testid="livechat-btn">
        <ChatCircleDots size={26} weight="fill" className="text-white" />
      </button>

      {/* Bottom Nav */}
      <DriverBottomNav active="home" navigate={navigate} />
    </div>
  );
};

export default DriverHome;
