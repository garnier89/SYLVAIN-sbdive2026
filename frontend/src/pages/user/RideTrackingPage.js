import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { rideAPI } from '../../services/api';
import { Button } from '../../components/ui/button';
import {
  Check, NavigationArrow, Car, Star, Clock, X, Warning, Shield, UsersThree,
} from '@phosphor-icons/react';
import TipModal from '../../components/TipModal';
import RideTrackingMap from './ride-tracking/RideTrackingMap';
import DriverInfoCard from './ride-tracking/DriverInfoCard';
import { CancelRideModal, RatingModal } from './ride-tracking/RideActions';

const API = process.env.REACT_APP_BACKEND_URL;

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
  const [showTipModal, setShowTipModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [markAsFavorite, setMarkAsFavorite] = useState(false);
  const [startOtp, setStartOtp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelReasons, setCancelReasons] = useState([]);
  const [poolEnabled, setPoolEnabled] = useState(false);
  const [poolLoading, setPoolLoading] = useState(false);

  const togglePool = useCallback(async () => {
    if (poolLoading) return;
    setPoolLoading(true);
    try {
      const next = !poolEnabled;
      const res = await fetch(`${API}/api/phase2/pool/enable/${rideId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) {
        setPoolEnabled(next);
        const d = await res.json();
        if (d.new_fare != null) {
          setRide((r) => (r ? { ...r, estimated_fare: d.new_fare, pool_enabled: next } : r));
        }
      }
    } catch (err) {
      console.warn('[RideTracking] pool toggle failed:', err?.message || err);
    }
    setPoolLoading(false);
  }, [poolEnabled, poolLoading, rideId]);

  const fetchRide = useCallback(async () => {
    try {
      const res = await rideAPI.get(rideId);
      setRide(res.data);
      if (res.data.driver_lat && res.data.driver_lng) {
        setDriverPos({ lat: res.data.driver_lat, lng: res.data.driver_lng });
      }
      if (res.data.status === 'completed') setShowRating(true);
    } catch (err) {
      console.error('Failed to fetch ride:', err);
    } finally {
      setLoading(false);
    }
  }, [rideId]);

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

  // Subscribe to live ride events
  useEffect(() => {
    const unsub1 = on('ride_status_update', (msg) => {
      if (msg.ride_id !== rideId) return;
      setRide((prev) =>
        prev ? { ...prev, status: msg.status, otp: msg.otp || prev.otp, final_fare: msg.final_fare || prev.final_fare } : prev
      );
      if (msg.status === 'completed') setShowRating(true);
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

  return (
    <div className="mobile-container min-h-screen bg-white flex flex-col" data-testid="ride-tracking-page">
      <RideTrackingMap
        ride={ride}
        driverPos={driverPos}
        connected={connected}
        onBack={() => navigate('/home')}
      />

      <div className="flex-1 bg-white rounded-t-3xl -mt-6 relative z-10 px-4 pt-5 pb-24 overflow-y-auto">
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

        {/* Cancelled Banner */}
        {isCancelled && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 text-center" data-testid="ride-cancelled-banner">
            <X size={32} className="text-red-500 mx-auto mb-2" />
            <p className="font-bold text-red-700">Course annulée</p>
            {ride.cancel_reason && <p className="text-xs text-red-500 mt-1">{ride.cancel_reason}</p>}
            {ride.cancellation_fee > 0 && (
              <p className="text-xs text-red-600 mt-1 font-medium">
                Frais d'annulation : {ride.cancellation_fee?.toFixed(2)} EUR
              </p>
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

        {/* Taxi Pool toggle */}
        {ride.status === 'pending' && (
          <button
            onClick={togglePool}
            disabled={poolLoading}
            className={`w-full rounded-2xl p-3 mb-4 flex items-center gap-3 border ${
              poolEnabled ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'
            }`}
            data-testid="toggle-taxi-pool-btn"
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                poolEnabled ? 'bg-emerald-500' : 'bg-gray-100'
              }`}
            >
              <UsersThree size={20} weight="duotone" className={poolEnabled ? 'text-white' : 'text-gray-500'} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-gray-900">
                Taxi Pool <span className="text-xs font-semibold text-emerald-700">−30%</span>
              </p>
              <p className="text-[11px] text-gray-500">
                {poolEnabled ? 'Activé — vous partagez la course' : 'Partagez votre course pour économiser'}
              </p>
            </div>
            <div
              className={`w-10 h-6 rounded-full relative transition-colors ${
                poolEnabled ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${poolEnabled ? 'left-4' : 'left-0.5'}`} />
            </div>
          </button>
        )}

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
    </div>
  );
};

export default RideTrackingPage;
