import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { rideAPI } from '../../services/api';
import { Button } from '../../components/ui/button';
import {
  MapPin, Phone, ChatCircle, X, Star,
  NavigationArrow, Car, Check, Warning,
  ArrowLeft, Shield, Clock, CaretRight
} from '@phosphor-icons/react';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API = process.env.REACT_APP_BACKEND_URL;

const driverIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const pickupIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const dropoffIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

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
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(5);
  const [markAsFavorite, setMarkAsFavorite] = useState(false);
  const [startOtp, setStartOtp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelReasons, setCancelReasons] = useState([]);

  // Load ride data
  const fetchRide = useCallback(async () => {
    try {
      const res = await rideAPI.get(rideId);
      setRide(res.data);
      if (res.data.driver_lat && res.data.driver_lng) {
        setDriverPos({ lat: res.data.driver_lat, lng: res.data.driver_lng });
      }
      if (res.data.status === 'completed' && !showRating) {
        setShowRating(true);
      }
    } catch (err) {
      console.error('Failed to fetch ride:', err);
    } finally {
      setLoading(false);
    }
  }, [rideId, showRating]);

  useEffect(() => {
    fetchRide();
    // Load cancel reasons
    fetch(`${API}/api/config/cancel-reasons?user_type=User`)
      .then(r => r.json())
      .then(data => setCancelReasons(data))
      .catch(() => {});
  }, [fetchRide]);

  // Join WS ride room
  useEffect(() => {
    if (connected && rideId) {
      joinRide(rideId);
    }
  }, [connected, rideId, joinRide]);

  // Listen to WS events
  useEffect(() => {
    const unsub1 = on('ride_status_update', (msg) => {
      if (msg.ride_id === rideId) {
        setRide(prev => prev ? { ...prev, status: msg.status, otp: msg.otp || prev.otp, final_fare: msg.final_fare || prev.final_fare } : prev);
        if (msg.status === 'completed') setShowRating(true);
      }
    });
    const unsub2 = on('ride_accepted', (msg) => {
      if (msg.ride_id === rideId) {
        setRide(prev => prev ? {
          ...prev,
          status: 'accepted',
          driver_id: msg.driver_id,
          driver_name: msg.driver_name,
          driver_phone: msg.driver_phone,
          driver_rating: msg.driver_rating,
          driver_vehicle_model: msg.driver_vehicle_model,
          driver_vehicle_number: msg.driver_vehicle_number,
        } : prev);
      }
    });
    const unsub3 = on('driver_location', (msg) => {
      if (msg.ride_id === rideId) {
        setDriverPos({ lat: msg.lat, lng: msg.lng });
      }
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [on, rideId]);

  const handleCancel = async (reason) => {
    try {
      await rideAPI.cancel(rideId, reason);
      setRide(prev => prev ? { ...prev, status: 'cancelled' } : prev);
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
          await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/phase1/favorite-drivers/${ride.driver_id}`, {
            method: 'POST', credentials: 'include',
          });
        } catch { /* ignore */ }
      }
      navigate('/home');
    } catch {
      navigate('/home');
    }
  };

  const requestStartOtp = async () => {
    try {
      const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/phase1/rides/${rideId}/start-otp/request`, {
        method: 'POST', credentials: 'include',
      });
      if (r.ok) {
        const d = await r.json();
        setStartOtp(d.otp);
      }
    } catch { /* ignore */ }
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
        <Button onClick={() => navigate('/home')} variant="outline">Retour</Button>
      </div>
    );
  }

  const currentStepIdx = STATUS_STEPS.findIndex(s => s.key === ride.status);
  const mapCenter = driverPos || { lat: ride.pickup_lat, lng: ride.pickup_lng };
  const isCancelled = ride.status === 'cancelled';
  const isCompleted = ride.status === 'completed';
  const canCancel = ['pending', 'accepted', 'arriving'].includes(ride.status);

  return (
    <div className="mobile-container min-h-screen bg-white flex flex-col" data-testid="ride-tracking-page">
      {/* Map */}
      <div className="h-[45vh] relative">
        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={[ride.pickup_lat, ride.pickup_lng]} icon={pickupIcon} />
          <Marker position={[ride.dropoff_lat, ride.dropoff_lng]} icon={dropoffIcon} />
          {driverPos && (
            <Marker position={[driverPos.lat, driverPos.lng]} icon={driverIcon} />
          )}
          <Polyline
            positions={[[ride.pickup_lat, ride.pickup_lng], [ride.dropoff_lat, ride.dropoff_lng]]}
            pathOptions={{ color: '#3b82f6', weight: 3, dashArray: '8 8' }}
          />
        </MapContainer>

        {/* Back button */}
        <button
          className="absolute top-4 left-4 z-[1000] bg-white rounded-full p-2 shadow-lg"
          onClick={() => navigate('/home')}
          data-testid="tracking-back-btn"
        >
          <ArrowLeft size={20} className="text-gray-700" />
        </button>

        {/* Connection indicator */}
        <div className={`absolute top-4 right-4 z-[1000] px-2 py-1 rounded-full text-[10px] font-medium ${connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {connected ? 'En direct' : 'Reconnexion...'}
        </div>
      </div>

      {/* Status + Details */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-6 relative z-10 px-4 pt-5 pb-24 overflow-y-auto">

        {/* Status Progress Bar */}
        {!isCancelled && (
          <div className="flex items-center justify-between mb-5" data-testid="ride-status-bar">
            {STATUS_STEPS.filter(s => s.key !== 'completed' || isCompleted).map((step, i) => {
              const isActive = i <= currentStepIdx;
              const Icon = step.icon;
              return (
                <React.Fragment key={step.key}>
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isActive ? 'bg-[#FF4500] text-white' : 'bg-gray-100 text-gray-400'}`}>
                      <Icon size={16} weight={isActive ? 'fill' : 'regular'} />
                    </div>
                    <span className={`text-[9px] font-medium ${isActive ? 'text-[#FF4500]' : 'text-gray-400'}`}>{step.label}</span>
                  </div>
                  {i < (isCompleted ? STATUS_STEPS.length - 1 : STATUS_STEPS.length - 2) && (
                    <div className={`flex-1 h-0.5 mx-1 ${i < currentStepIdx ? 'bg-[#FF4500]' : 'bg-gray-200'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Cancelled Banner */}
        {isCancelled && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 text-center" data-testid="ride-cancelled-banner">
            <X size={32} className="text-red-500 mx-auto mb-2" />
            <p className="font-bold text-red-700">Course annulée</p>
            {ride.cancel_reason && <p className="text-xs text-red-500 mt-1">{ride.cancel_reason}</p>}
            {ride.cancellation_fee > 0 && (
              <p className="text-xs text-red-600 mt-1 font-medium">Frais d'annulation : {ride.cancellation_fee?.toFixed(2)} EUR</p>
            )}
          </div>
        )}

        {/* Searching animation */}
        {ride.status === 'pending' && (
          <div className="bg-blue-50 border border-orange-200 rounded-2xl p-5 mb-4 text-center" data-testid="ride-searching">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" />
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
            </div>
            <p className="font-semibold text-blue-800">Recherche d'un chauffeur...</p>
            <p className="text-xs text-[#FF4500] mt-1">Veuillez patienter</p>
          </div>
        )}

        {/* Driver Info (when accepted) */}
        {ride.driver_name && !isCancelled && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4" data-testid="driver-info-card">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                <Car size={24} className="text-gray-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900">{ride.driver_name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Star size={12} weight="fill" className="text-yellow-500" />
                  <span className="text-xs text-gray-500">{ride.driver_rating?.toFixed(1) || '5.0'}</span>
                </div>
                {ride.driver_vehicle_model && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {ride.driver_vehicle_model} &middot; {ride.driver_vehicle_number}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center" data-testid="call-driver-btn">
                  <Phone size={18} className="text-[#FF4500]" />
                </button>
                <button onClick={() => navigate(`/ride/${rideId}/chat`)} className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center" data-testid="chat-driver-btn">
                  <ChatCircle size={18} className="text-[#FF4500]" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* OTP Display (passenger) */}
        {ride.status === 'arriving' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-4 text-center" data-testid="ride-otp-display">
            <Shield size={24} className="text-yellow-600 mx-auto mb-1" />
            <p className="text-xs text-yellow-700">Partagez ce code avec le chauffeur pour demarrer</p>
            {startOtp ? (
              <p className="text-3xl font-bold text-gray-900 tracking-[0.5em] mt-1" data-testid="start-otp-value">{startOtp}</p>
            ) : (
              <button onClick={requestStartOtp} className="mt-2 px-5 py-2 rounded-full bg-yellow-500 text-white text-sm font-bold" data-testid="generate-start-otp-btn">
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

        {/* Cancel Button */}
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

        {/* Done button */}
        {(isCompleted || isCancelled) && (
          <Button className="w-full mt-2" onClick={() => navigate('/home')} data-testid="ride-done-btn">
            Retour à l'accueil
          </Button>
        )}
      </div>

      {/* Cancel Modal */}
      {showCancel && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end" data-testid="cancel-modal">
          <div className="w-full max-w-[430px] mx-auto bg-white rounded-t-3xl p-5 pb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Annuler la course</h3>
              <button onClick={() => setShowCancel(false)}><X size={24} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Choisissez une raison :</p>
            <div className="space-y-2">
              {cancelReasons.map(r => (
                <button
                  key={r.slug}
                  className="w-full text-left p-3 rounded-xl border border-gray-200 hover:bg-red-50 hover:border-red-200 transition-colors flex items-center justify-between"
                  onClick={() => handleCancel(r.reason_fr)}
                  data-testid={`cancel-reason-${r.slug}`}
                >
                  <span className="text-sm">{r.reason_fr}</span>
                  <CaretRight size={16} className="text-gray-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {showRating && isCompleted && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" data-testid="rating-modal">
          <div className="w-[90%] max-w-[380px] bg-white rounded-3xl p-6 text-center">
            <h3 className="text-lg font-bold mb-2">Évaluer votre course</h3>
            <p className="text-sm text-gray-500 mb-4">Comment était votre chauffeur ?</p>
            <div className="flex items-center justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setRating(n)} data-testid={`star-${n}`}>
                  <Star size={36} weight={n <= rating ? 'fill' : 'regular'} className={n <= rating ? 'text-yellow-500' : 'text-gray-300'} />
                </button>
              ))}
            </div>
            <label className="flex items-center justify-center gap-2 mb-5 text-sm cursor-pointer" data-testid="mark-favorite-label">
              <input type="checkbox" checked={markAsFavorite} onChange={(e) => setMarkAsFavorite(e.target.checked)} className="w-4 h-4 accent-red-500" data-testid="mark-favorite-checkbox" />
              <span className="text-gray-700">Ajouter ce chauffeur en favori</span>
            </label>
            <Button className="w-full" onClick={handleRate} data-testid="submit-rating-btn">
              Envoyer ({rating}/5)
            </Button>
            <button className="text-sm text-gray-400 mt-3" onClick={() => { setShowRating(false); navigate('/home'); }}>
              Passer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RideTrackingPage;
