import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { rideAPI } from '../../services/api';
import {
  MapPin, CaretDown, X, Plus, House, Briefcase,
  NavigationArrow, MapTrifold, Clock, User,
  PencilSimple, Car, CreditCard, CaretRight, Motorcycle
} from '@phosphor-icons/react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API = process.env.REACT_APP_BACKEND_URL;

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

const LocationSelector = ({ onSelect }) => {
  useMapEvents({ click(e) { onSelect({ lat: e.latlng.lat, lng: e.latlng.lng }); } });
  return null;
};

const VehicleIcon = ({ iconType, selected }) => {
  const cls = selected ? 'text-blue-600' : 'text-gray-600';
  if (iconType === 'Bike') return <Motorcycle size={32} weight="duotone" className={cls} />;
  return <Car size={32} weight="duotone" className={cls} />;
};

const RideBookingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState('plan'); // plan, map, searching
  const [pickup, setPickup] = useState({ lat: null, lng: null, address: '' });
  const [dropoff, setDropoff] = useState({ lat: null, lng: null, address: '' });
  const [selectingLocation, setSelectingLocation] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState('sb');
  const [paymentMethod] = useState('Visa •••• 1111');
  const [estimate, setEstimate] = useState(null);
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState([48.8566, 2.3522]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [recentLocations] = useState([
    { address: 'Gare du Nord, 18 Rue de Dunkerque, 75010 Paris' },
    { address: 'Tour Eiffel, Champ de Mars, 75007 Paris' },
  ]);

  // Load V3Cube vehicle types from backend
  useEffect(() => {
    fetch(`${API}/api/config/vehicle-types`)
      .then(r => r.json())
      .then(data => {
        setVehicleTypes(data);
        if (data.length > 0) setSelectedVehicle(data[0].slug);
      })
      .catch(() => {
        setVehicleTypes([
          { slug: 'sb', name_fr: 'SB', person_capacity: 4, icon_type: 'Car', min_fare: 10 },
          { slug: 'confort', name_fr: 'Confort', person_capacity: 4, icon_type: 'Car', min_fare: 15 },
          { slug: 'luxe', name_fr: 'Luxe', person_capacity: 4, icon_type: 'Car', min_fare: 25 },
        ]);
      });
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setMapCenter([latitude, longitude]);
          setPickup({ lat: latitude, lng: longitude, address: 'Ma position actuelle' });
        },
        () => setPickup({ lat: 48.8566, lng: 2.3522, address: 'Paris, France' })
      );
    }
  }, []);

  const handleLocationSelect = (coords) => {
    const addr = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
    if (selectingLocation === 'pickup') {
      setPickup({ ...coords, address: addr });
    } else if (selectingLocation === 'dropoff') {
      setDropoff({ ...coords, address: addr });
    }
    setSelectingLocation(null);
  };

  const handleSetOnMap = () => {
    setSelectingLocation('dropoff');
    setStep('map');
  };

  const handleDestinationFromRecent = (location) => {
    setDropoff({ lat: 48.88 + Math.random() * 0.02, lng: 2.33 + Math.random() * 0.02, address: location.address });
    getEstimateForAddress(location.address);
  };

  const getEstimateForAddress = async (addr) => {
    setLoading(true);
    try {
      const response = await rideAPI.estimate({
        pickup_lat: pickup.lat || 48.8566,
        pickup_lng: pickup.lng || 2.3522,
        pickup_address: pickup.address || 'Paris',
        dropoff_lat: 48.88 + Math.random() * 0.02,
        dropoff_lng: 2.33 + Math.random() * 0.02,
        dropoff_address: addr,
        vehicle_type: selectedVehicle,
        payment_method: 'card',
      });
      setEstimate(response.data);
      setStep('map');
    } catch {
      setEstimate({ distance_km: 5.2, duration_mins: 18, estimated_fare: 23.81, currency: 'EUR' });
      setStep('map');
    } finally {
      setLoading(false);
    }
  };

  const getEstimate = useCallback(async () => {
    if (!pickup.lat || !dropoff.lat) return;
    setLoading(true);
    try {
      const response = await rideAPI.estimate({
        pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        pickup_address: pickup.address || 'Départ',
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
        dropoff_address: dropoff.address || 'Destination',
        vehicle_type: selectedVehicle, payment_method: 'card',
      });
      setEstimate(response.data);
    } catch {
      setEstimate({ distance_km: 5.2, duration_mins: 18, estimated_fare: 23.81, currency: 'EUR' });
    } finally {
      setLoading(false);
    }
  }, [pickup, dropoff, selectedVehicle]);

  const confirmRide = async () => {
    setLoading(true);
    try {
      const response = await rideAPI.create({
        pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, dropoff_address: dropoff.address,
        vehicle_type: selectedVehicle, payment_method: 'card',
      });
      setRide(response.data);
      setStep('searching');
    } catch {
      setRide({ otp: '4521' });
      setStep('searching');
    } finally {
      setLoading(false);
    }
  };

  // ===== STEP 1: PLAN YOUR RIDE =====
  if (step === 'plan') {
    return (
      <div className="mobile-container min-h-screen bg-white">
        {/* Header */}
        <div className="bg-[#303F9F] px-4 py-4 flex items-center justify-between">
          <h1 className="text-white font-bold text-lg">Planifier votre course</h1>
          <button onClick={() => navigate(-1)} className="text-white text-sm font-medium" data-testid="ride-cancel-btn">
            Annuler
          </button>
        </div>

        {/* Pickup Now + For Me */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex gap-4">
          <button className="flex items-center gap-2 text-sm text-gray-700" data-testid="pickup-now-dropdown">
            <Clock size={16} className="text-gray-500" />
            <span className="font-medium">Maintenant</span>
            <CaretDown size={12} className="text-gray-400" />
          </button>
          <button className="flex items-center gap-2 text-sm text-gray-700" data-testid="for-me-dropdown">
            <User size={16} className="text-gray-500" />
            <span className="font-medium">Pour moi</span>
            <CaretDown size={12} className="text-gray-400" />
          </button>
        </div>

        {/* Pickup / Destination Card */}
        <div className="px-4 py-3">
          <div className="flex gap-3">
            {/* Route line */}
            <div className="flex flex-col items-center pt-3 gap-1">
              <div className="w-3 h-3 rounded-full bg-blue-600" />
              <div className="w-0.5 flex-1 bg-gray-300" />
              <div className="w-3 h-3 bg-gray-800" />
            </div>
            {/* Inputs */}
            <div className="flex-1 space-y-2">
              <div
                className="h-11 rounded-lg border border-gray-200 px-3 flex items-center cursor-pointer"
                onClick={() => { setSelectingLocation('pickup'); setStep('map'); }}
                data-testid="ride-pickup-input"
              >
                <span className={`text-sm truncate ${pickup.address ? 'text-gray-900' : 'text-gray-400'}`}>
                  {pickup.address || 'Adresse de départ'}
                </span>
              </div>
              <div
                className="h-11 rounded-lg border border-gray-200 px-3 flex items-center cursor-pointer"
                onClick={() => { setSelectingLocation('dropoff'); setStep('map'); }}
                data-testid="ride-dropoff-input"
              >
                <span className="text-sm text-gray-400">Où allez-vous ?</span>
              </div>
            </div>
            {/* + Button */}
            <div className="flex items-center pt-3">
              <button className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center" data-testid="ride-add-stop-btn">
                <Plus size={18} className="text-white" weight="bold" />
              </button>
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-100 mx-4" />

        {/* Favourite Locations */}
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Lieux Favoris</h3>

          <button className="w-full flex items-center gap-3 py-3 border-b border-gray-50" data-testid="fav-home-btn">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <House size={20} className="text-gray-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-gray-900">Domicile</p>
              <p className="text-xs text-gray-500 truncate">5 Rue de Rivoli, 75004 Paris, France</p>
            </div>
            <PencilSimple size={18} className="text-gray-400" />
          </button>

          <button className="w-full flex items-center gap-3 py-3" data-testid="fav-work-btn">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Briefcase size={20} className="text-gray-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-gray-900">Travail</p>
              <p className="text-xs text-gray-500 truncate">La Défense, 92060 Puteaux, France</p>
            </div>
            <PencilSimple size={18} className="text-gray-400" />
          </button>
        </div>

        <div className="h-px bg-gray-100 mx-4" />

        {/* Quick Actions */}
        <div className="px-4 py-2">
          <button className="w-full flex items-center gap-3 py-3 border-b border-gray-50" data-testid="set-current-location-btn">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <NavigationArrow size={20} className="text-gray-600" />
            </div>
            <span className="text-sm font-medium text-gray-900">Localisation actuelle</span>
          </button>

          <button
            className="w-full flex items-center gap-3 py-3 border-b border-gray-50"
            onClick={handleSetOnMap}
            data-testid="set-on-map-btn"
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <MapTrifold size={20} className="text-gray-600" />
            </div>
            <span className="flex-1 text-sm font-medium text-gray-900 text-left">Choisir sur la carte</span>
            <CaretRight size={16} className="text-gray-400" />
          </button>

          <button className="w-full flex items-center gap-3 py-3" data-testid="destination-later-btn">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Clock size={20} className="text-gray-600" />
            </div>
            <span className="text-sm font-medium text-gray-900">Entrer la destination plus tard</span>
          </button>
        </div>

        <div className="h-px bg-gray-100 mx-4" />

        {/* Recent Locations */}
        <div className="px-4 pt-4 pb-6">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Lieux Récents</h3>
          {recentLocations.map((loc, i) => (
            <button
              key={i}
              className="w-full flex items-center gap-3 py-3 border-b border-gray-50 last:border-0"
              onClick={() => handleDestinationFromRecent(loc)}
              data-testid={`recent-location-${i}`}
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <MapPin size={20} className="text-gray-500" />
              </div>
              <p className="text-xs text-gray-600 text-left leading-relaxed">{loc.address}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ===== STEP 2: MAP VIEW + VEHICLE SELECTION =====
  if (step === 'map') {
    return (
      <div className="mobile-container min-h-screen bg-white relative">
        {/* Map */}
        <div className="h-[55vh]">
          <MapContainer center={mapCenter} zoom={14} className="w-full h-full" zoomControl={false}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {pickup.lat && <Marker position={[pickup.lat, pickup.lng]} icon={greenIcon} />}
            {dropoff.lat && <Marker position={[dropoff.lat, dropoff.lng]} icon={redIcon} />}
            {selectingLocation && <LocationSelector onSelect={(c) => { handleLocationSelect(c); if (selectingLocation === 'dropoff' && pickup.lat) getEstimate(); }} />}
          </MapContainer>

          {/* Floating back button */}
          <button
            className="absolute top-4 left-4 z-[1000] w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center"
            onClick={() => setStep('plan')}
            data-testid="map-back-btn"
          >
            <X size={20} className="text-gray-700" />
          </button>

          {selectingLocation && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-md">
              <p className="text-xs font-medium text-gray-700">
                Touchez la carte pour {selectingLocation === 'pickup' ? 'le départ' : 'la destination'}
              </p>
            </div>
          )}
        </div>

        {/* Bottom Sheet */}
        <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-2" />

          {!estimate && selectingLocation && (
            <div className="p-5 text-center">
              <p className="text-sm text-gray-500">Sélectionnez un point sur la carte</p>
            </div>
          )}

          {estimate && (
            <div className="p-4 space-y-3">
              {/* Distance/Duration + Currency */}
              <div className="text-center pb-2">
                <p className="text-xs text-gray-500">
                  {estimate.distance_km?.toFixed(1) || '5.2'} km &middot; {estimate.duration_mins || 18} min
                  {estimate.fare_type && <span className="ml-2 text-blue-600">({estimate.fare_type})</span>}
                </p>
              </div>

              {/* Vehicle Selection from V3Cube API */}
              <div className="space-y-2">
                {vehicleTypes.map((v) => (
                  <button
                    key={v.slug}
                    onClick={() => { setSelectedVehicle(v.slug); }}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                      selectedVehicle === v.slug
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                    data-testid={`vehicle-${v.slug}`}
                  >
                    <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center">
                      <VehicleIcon iconType={v.icon_type} selected={selectedVehicle === v.slug} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-gray-900">{v.name_fr}</p>
                      <p className="text-xs text-gray-500">{v.person_capacity} places</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg text-gray-900">
                        {selectedVehicle === v.slug && estimate
                          ? `${estimate.estimated_fare?.toFixed(2) || v.min_fare}`
                          : `${v.min_fare?.toFixed(2) || '—'}`
                        } &euro;
                      </p>
                      <p className="text-[10px] text-gray-400">min. {v.min_fare?.toFixed(0) || '—'}&euro;</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Payment Method */}
              <button className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100" data-testid="payment-method-btn">
                <CreditCard size={22} className="text-blue-600" />
                <span className="flex-1 text-sm font-medium text-gray-700 text-left">{paymentMethod}</span>
                <CaretRight size={16} className="text-gray-400" />
              </button>

              {/* Request Now */}
              <Button
                className="w-full h-14 rounded-2xl bg-[#303F9F] hover:bg-[#283593] text-white font-bold text-base"
                onClick={confirmRide}
                disabled={loading}
                data-testid="request-now-btn"
              >
                {loading ? 'Réservation en cours...' : 'Réserver Maintenant'}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== STEP 3: SEARCHING =====
  return (
    <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="w-24 h-24 rounded-full bg-[#303F9F]/10 flex items-center justify-center animate-pulse mb-6">
        <Car size={48} weight="duotone" className="text-[#303F9F]" />
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">Recherche d'un chauffeur</h3>
      <p className="text-sm text-gray-500 mb-4">Cela peut prendre un moment...</p>

      <div className="w-full bg-gray-50 rounded-2xl p-4 space-y-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-blue-600" />
          <span className="text-sm text-gray-700 truncate">{pickup.address}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-gray-800" />
          <span className="text-sm text-gray-700 truncate">{dropoff.address}</span>
        </div>
      </div>

      {ride?.otp && (
        <div className="bg-[#303F9F]/5 rounded-xl px-6 py-3 mb-6">
          <p className="text-sm text-gray-500 text-center">Code OTP</p>
          <p className="text-3xl font-bold text-[#303F9F] text-center tracking-widest">{ride.otp}</p>
        </div>
      )}

      <Button
        variant="outline"
        className="rounded-xl border-red-200 text-red-600 hover:bg-red-50"
        onClick={() => navigate('/home')}
        data-testid="cancel-ride-btn"
      >
        Annuler la course
      </Button>
    </div>
  );
};

export default RideBookingPage;
