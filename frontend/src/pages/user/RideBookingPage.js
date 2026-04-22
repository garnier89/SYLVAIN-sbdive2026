import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { rideAPI } from '../../services/api';
import { useLocale } from '../../contexts/LocaleContext';
import {
  MapPin, CaretDown, X, Plus, House, Briefcase,
  NavigationArrow, MapTrifold, Clock, User,
  PencilSimple, Car, CreditCard, CaretRight, Motorcycle,
  Jeep, Lightning, Van, Wheelchair, AirplaneTilt,
  Users, Percent, Calendar, Info, Money, ArrowLeft, Gavel
} from '@phosphor-icons/react';
import GooglePlacesInput from '../../components/GooglePlacesInput';
import { GoogleMap, useJsApiLoader, MarkerF, PolylineF } from '@react-google-maps/api';

const API = process.env.REACT_APP_BACKEND_URL;
const GMAP_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

function decodePolyline(encoded) {
  if (!encoded) return [];
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

const VehicleIcon = ({ iconType, slug, selected }) => {
  const cls = selected ? 'text-[#FF4500]' : 'text-gray-600';
  const size = 32;
  if (iconType === 'Bike') return <Motorcycle size={size} weight="duotone" className={cls} />;
  if (slug === 'suv') return <Jeep size={size} weight="duotone" className={cls} />;
  if (slug === 'electric') return <Lightning size={size} weight="duotone" className={cls} />;
  if (slug === 'van') return <Van size={size} weight="duotone" className={cls} />;
  if (slug === 'accessible') return <Wheelchair size={size} weight="duotone" className={cls} />;
  if (slug === 'airport') return <AirplaneTilt size={size} weight="duotone" className={cls} />;
  if (slug === 'pool') return <Users size={size} weight="duotone" className={cls} />;
  return <Car size={size} weight="duotone" className={cls} />;
};

const RideBookingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState('plan'); // plan, map, searching
  const [stopovers, setStopovers] = useState([]); // [{address, lat, lng}]
  const [bookFor, setBookFor] = useState({ name: '', phone: '' }); // empty = for me
  const [showBookForModal, setShowBookForModal] = useState(false);
  const [pickup, setPickup] = useState({ lat: null, lng: null, address: '' });
  const [dropoff, setDropoff] = useState({ lat: null, lng: null, address: '' });
  const [selectingLocation, setSelectingLocation] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState('sb');
  const [paymentMethod, setPaymentMethod] = useState('cash'); // cash | card | wallet
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [estimate, setEstimate] = useState(null);
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [proposedFare, setProposedFare] = useState('');
  const [counterOffers, setCounterOffers] = useState([]);
  const [mapCenter, setMapCenter] = useState({ lat: 48.8566, lng: 2.3522 });
  const [routePath, setRoutePath] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const { isLoaded: gmapLoaded } = useJsApiLoader({ googleMapsApiKey: GMAP_KEY || '' });
  const [recentLocations] = useState([
    { address: 'Gare du Nord, 18 Rue de Dunkerque, 75010 Paris' },
    { address: 'Tour Eiffel, Champ de Mars, 75007 Paris' },
  ]);

  // French display labels + descriptions for each vehicle slug
  const VEHICLE_META = {
    sb:      { label: 'Standard',  desc: "Berline économique pour vos trajets quotidiens." },
    confort: { label: 'Confort',   desc: "Véhicule spacieux avec plus de confort." },
    luxe:    { label: 'Luxe',      desc: "Mercedes, Audi, BMW — chauffeurs d'élite." },
    berline: { label: 'Berline',   desc: "Berline 4 places — business & longs trajets." },
    van:     { label: 'Van',       desc: "Grande capacité jusqu'à 7 passagers." },
    moto:    { label: 'Moto-taxi', desc: "Rapide aux heures de pointe." },
  };

  useEffect(() => {
    if (searchParams.get('type') === 'schedule') setScheduleMode(true);
  }, [searchParams]);

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
          setMapCenter({ lat: latitude, lng: longitude });
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
      if (response.data.route_polyline) setRoutePath(decodePolyline(response.data.route_polyline));
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
      if (response.data.route_polyline) setRoutePath(decodePolyline(response.data.route_polyline));
    } catch {
      setEstimate({ distance_km: 5.2, duration_mins: 18, estimated_fare: 23.81, currency: 'EUR' });
    } finally {
      setLoading(false);
    }
  }, [pickup, dropoff, selectedVehicle]);

  const confirmRide = async () => {
    setLoading(true);
    try {
      const offerAmount = parseFloat(proposedFare);
      const response = await rideAPI.create({
        pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, dropoff_address: dropoff.address,
        vehicle_type: selectedVehicle, payment_method: paymentMethod,
        proposed_fare: offerAmount > 0 ? offerAmount : (estimate?.estimated_fare || null),
        book_for_name: bookFor.name || null,
        book_for_phone: bookFor.phone || null,
      });
      const createdRide = response.data;
      setRide(createdRide);
      // Push stopovers if any
      if (stopovers.length > 0 && createdRide?.id) {
        try {
          await fetch(`${API}/api/phase1/rides/${createdRide.id}/stopovers`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ stopovers: stopovers.filter((s) => s.lat && s.lng) }),
          });
        } catch { /* ignore */ }
      }
      setCounterOffers([]);
      setStep('negotiation');
    } catch {
      setRide({ otp: '4521' });
      setStep('searching');
    } finally {
      setLoading(false);
    }
  };

  // Poll for counter-offers and ride status during negotiation
  useEffect(() => {
    if (step !== 'negotiation' || !ride?.id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await rideAPI.get(ride.id);
        if (cancelled) return;
        const r = res.data;
        setCounterOffers(r.counter_offers || []);
        if (r.status === 'accepted') {
          navigate(`/ride/${r.id}`);
        } else if (r.status === 'cancelled') {
          setStep('plan');
        }
      } catch { /* keep polling */ }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [step, ride?.id, navigate]);

  const acceptOffer = async (offerId) => {
    setLoading(true);
    try {
      await fetch(`${API}/api/rides/${ride.id}/accept-offer/${offerId}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      });
      navigate(`/ride/${ride.id}`);
    } catch { /* stay on page */ }
    finally { setLoading(false); }
  };

  const cancelNegotiation = async () => {
    if (!ride?.id) { setStep('plan'); return; }
    try {
      await rideAPI.cancel(ride.id, 'Passenger cancelled during negotiation');
    } catch { /* ignore */ }
    setStep('plan'); setRide(null); setCounterOffers([]);
  };

  // ===== STEP 1: PLAN YOUR RIDE =====
  if (step === 'plan') {
    return (
      <div className="mobile-container min-h-screen bg-white">
        {/* Header */}
        <div className="bg-blue-600 px-4 py-4 flex items-center justify-between">
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
          <button onClick={() => setShowBookForModal(true)} className="flex items-center gap-2 text-sm text-gray-700" data-testid="for-me-dropdown">
            <User size={16} className="text-gray-500" />
            <span className="font-medium">{bookFor.name ? `Pour ${bookFor.name.split(' ')[0]}` : 'Pour moi'}</span>
            <CaretDown size={12} className="text-gray-400" />
          </button>
        </div>

        {/* Pickup / Destination Card */}
        <div className="px-4 py-3">
          <div className="flex gap-3">
            {/* Route line */}
            <div className="flex flex-col items-center pt-3 gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <div className="w-0.5 flex-1 bg-gray-300" />
              <div className="w-3 h-3 rounded-sm bg-slate-800" />
            </div>
            {/* Inputs */}
            <div className="flex-1 space-y-2">
              <GooglePlacesInput
                placeholder="Adresse de depart"
                value={pickup.address}
                iconColor="#22C55E"
                onSelect={(result) => {
                  setPickup({ lat: result.lat, lng: result.lng, address: result.address });
                  setMapCenter({ lat: result.lat, lng: result.lng });
                }}
                testId="ride-pickup-input"
                inputClassName="h-11 !rounded-lg !border-gray-200 !py-2"
              />
              <GooglePlacesInput
                placeholder="Ou allez-vous ?"
                value={dropoff.address}
                iconColor="#EF4444"
                onSelect={(result) => {
                  setDropoff({ lat: result.lat, lng: result.lng, address: result.address });
                }}
                testId="ride-dropoff-input"
                inputClassName="h-11 !rounded-lg !border-gray-200 !py-2"
              />
            </div>
            {/* + Button */}
            <div className="flex items-center pt-3">
              <button
                onClick={() => {
                  if (stopovers.length >= 5) return;
                  setStopovers((s) => [...s, { address: '', lat: null, lng: null }]);
                }}
                className="w-9 h-9 rounded-full bg-[#FF4500] flex items-center justify-center disabled:opacity-50"
                data-testid="ride-add-stop-btn"
                disabled={stopovers.length >= 5}
              >
                <Plus size={18} className="text-white" weight="bold" />
              </button>
            </div>
          </div>

          {/* Stopovers list */}
          {stopovers.length > 0 && (
            <div className="mt-3 space-y-2" data-testid="stopovers-list">
              {stopovers.map((s, i) => (
                <div key={i} className="flex items-center gap-2" data-testid={`stopover-${i}`}>
                  <div className="w-3 h-3 rounded-full bg-orange-400 flex-shrink-0" />
                  <GooglePlacesInput
                    placeholder={`Arret ${i + 1}`}
                    value={s.address}
                    iconColor="#F97316"
                    onSelect={(r) => setStopovers((arr) => arr.map((x, idx) => idx === i ? { address: r.address, lat: r.lat, lng: r.lng } : x))}
                    testId={`stopover-input-${i}`}
                    inputClassName="h-10 !rounded-lg !border-gray-200"
                  />
                  <button onClick={() => setStopovers((arr) => arr.filter((_, idx) => idx !== i))} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid={`remove-stopover-${i}`}>
                    <X size={14} className="text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
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

        {/* Promo Banner V3Cube */}
        <div className="px-4 py-3">
          <div className="bg-gradient-to-r from-[#FF4500] to-orange-400 rounded-2xl p-4 flex items-center gap-3" data-testid="promo-banner">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <Percent size={24} className="text-white" weight="bold" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">-20% sur votre premiere course</p>
              <p className="text-xs text-white/80 mt-0.5">Code: SB20 - Valable 7 jours</p>
            </div>
          </div>
        </div>

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
          {recentLocations.map((loc) => (
            <button
              key={loc.address}
              className="w-full flex items-center gap-3 py-3 border-b border-gray-50 last:border-0"
              onClick={() => handleDestinationFromRecent(loc)}
              data-testid={`recent-location-${loc.address.slice(0, 15).replace(/\s/g, '-')}`}
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <MapPin size={20} className="text-gray-500" />
              </div>
              <p className="text-xs text-gray-600 text-left leading-relaxed">{loc.address}</p>
            </button>
          ))}
        </div>

        {/* Book For Someone Else Modal */}
        {showBookForModal && (
          <div className="fixed inset-0 z-[3000] flex items-end" data-testid="book-for-modal">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowBookForModal(false)} />
            <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl pb-6 mx-auto">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h3 className="text-lg font-bold text-gray-900">Pour qui est cette course ?</h3>
                <button onClick={() => setShowBookForModal(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="close-book-for-btn">
                  <X size={16} className="text-gray-600" />
                </button>
              </div>
              <div className="px-5 space-y-3">
                <button onClick={() => { setBookFor({ name: '', phone: '' }); setShowBookForModal(false); }}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 ${!bookFor.name ? 'border-[#FF4500] bg-orange-50' : 'border-gray-200'}`}
                  data-testid="book-for-me-btn">
                  <User size={22} className="text-[#FF4500]" weight="fill" />
                  <span className="flex-1 text-left font-bold text-gray-800">Pour moi</span>
                </button>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs font-bold text-gray-700 mb-2">Reserver pour quelqu'un d'autre</p>
                  <input value={bookFor.name} onChange={(e) => setBookFor({ ...bookFor, name: e.target.value })}
                    placeholder="Nom du passager" className="w-full mb-2 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm" data-testid="book-for-name" />
                  <input value={bookFor.phone} onChange={(e) => setBookFor({ ...bookFor, phone: e.target.value })}
                    placeholder="Telephone (+33...)" className="w-full mb-3 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm" data-testid="book-for-phone" />
                  <button onClick={() => {
                    if (!bookFor.name.trim() || !bookFor.phone.trim()) return;
                    setShowBookForModal(false);
                  }} className="w-full py-2.5 rounded-lg bg-[#FF4500] text-white font-bold text-sm disabled:opacity-50"
                    disabled={!bookFor.name.trim() || !bookFor.phone.trim()}
                    data-testid="book-for-confirm-btn">
                    Confirmer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== STEP 2: MAP VIEW + VEHICLE SELECTION =====
  if (step === 'map') {
    const gmapCenter = pickup.lat && dropoff.lat
      ? { lat: (pickup.lat + dropoff.lat) / 2, lng: (pickup.lng + dropoff.lng) / 2 }
      : pickup.lat ? { lat: pickup.lat, lng: pickup.lng } : mapCenter;

    return (
      <div className="mobile-container min-h-screen bg-white relative">
        {/* Google Map with Route */}
        <div className="h-[55vh]">
          {gmapLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={gmapCenter}
              zoom={pickup.lat && dropoff.lat ? 12 : 14}
              options={{ disableDefaultUI: true, zoomControl: true }}
              onClick={(e) => {
                if (selectingLocation) {
                  handleLocationSelect({ lat: e.latLng.lat(), lng: e.latLng.lng() });
                  if (selectingLocation === 'dropoff' && pickup.lat) getEstimate();
                }
              }}
            >
              {pickup.lat && (
                <MarkerF
                  position={{ lat: pickup.lat, lng: pickup.lng }}
                  icon={{ url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' }}
                />
              )}
              {dropoff.lat && (
                <MarkerF
                  position={{ lat: dropoff.lat, lng: dropoff.lng }}
                  icon={{ url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' }}
                />
              )}
              {routePath.length > 0 && (
                <PolylineF
                  path={routePath}
                  options={{ strokeColor: '#3b82f6', strokeOpacity: 0.9, strokeWeight: 5 }}
                />
              )}
            </GoogleMap>
          ) : (
            <div className="w-full h-full bg-gray-100 flex items-center justify-center">
              <span className="text-gray-400 text-sm">Chargement de la carte...</span>
            </div>
          )}

          {/* Floating back button */}
          <button
            className="absolute top-4 left-4 z-[1000] w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center"
            onClick={() => setStep('plan')}
            data-testid="map-back-btn"
          >
            <ArrowLeft size={20} className="text-gray-700" weight="bold" />
          </button>

          {/* Destination address label over the map */}
          {dropoff.lat && dropoff.address && (
            <div className="absolute top-[35%] left-1/2 -translate-x-1/2 z-[500] bg-white px-3 py-2 rounded-lg shadow-lg max-w-[60%] pointer-events-none">
              <p className="text-xs font-medium text-gray-800 leading-tight line-clamp-2">{dropoff.address}</p>
            </div>
          )}

          {/* Floating "Location Taxi" shortcut (V3Cube "Rent A Taxi") */}
          <button
            onClick={() => navigate('/ride?type=rental')}
            className="absolute top-4 right-4 z-[1000] bg-white px-3.5 py-2 rounded-xl shadow-lg flex items-center gap-1.5 active:scale-95 transition-transform"
            data-testid="rent-a-taxi-btn"
          >
            <Car size={18} className="text-blue-600" weight="duotone" />
            <span className="text-sm font-bold text-gray-800">Location Taxi</span>
          </button>

          {/* ETA bubble */}
          {estimate?.duration_mins && (
            <div className="absolute top-6 right-4 z-[500] flex items-stretch gap-0 rounded-lg shadow-lg overflow-hidden">
              <div className="bg-slate-800 text-white px-3 py-2 flex flex-col items-center justify-center">
                <span className="text-lg font-bold leading-none">{Math.round(estimate.duration_mins)}</span>
                <span className="text-[9px] font-semibold">min(s)</span>
              </div>
              <div className="bg-white px-3 py-2 max-w-[180px]">
                <p className="text-[11px] text-gray-500 leading-tight truncate">@Pour</p>
                <p className="text-[11px] font-semibold text-blue-600 leading-tight truncate">{dropoff.address}</p>
              </div>
            </div>
          )}

          {selectingLocation && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-md">
              <p className="text-xs font-medium text-gray-700">
                Touchez la carte pour {selectingLocation === 'pickup' ? 'le départ' : 'la destination'}
              </p>
            </div>
          )}
        </div>

        {/* Bottom Sheet */}
        <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: '65vh' }} data-testid="booking-bottom-sheet">
          <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mt-2.5 mb-1" />

          {!estimate && selectingLocation && (
            <div className="p-5 text-center">
              <p className="text-sm text-gray-500">Selectionnez un point sur la carte</p>
            </div>
          )}

          {estimate && (
            <>
              {/* Title */}
              <div className="px-5 pt-3 pb-3">
                <p className="text-center text-base font-semibold text-slate-800">
                  Choisir une gamme ou faites glisser vers le haut
                </p>
              </div>

              {/* Vehicle list - V3Cube/Gojek style */}
              <div className="flex-1 overflow-y-auto border-t border-gray-100">
                {vehicleTypes.map((v) => {
                  const fare = selectedVehicle === v.slug && estimate
                    ? estimate.estimated_fare?.toFixed(2) || v.min_fare?.toFixed(2)
                    : v.min_fare?.toFixed(2) || '--';
                  const isSelected = selectedVehicle === v.slug;
                  const meta = VEHICLE_META[v.slug] || { label: v.name_fr, desc: v.description || 'Véhicule pour vos trajets' };
                  return (
                    <button
                      key={v.slug}
                      onClick={() => setSelectedVehicle(v.slug)}
                      className={`w-full flex items-center gap-3 px-5 py-3 border-b border-gray-100 transition-colors ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'}`}
                      data-testid={`vehicle-${v.slug}`}
                    >
                      <div className="w-16 h-14 flex items-center justify-center flex-shrink-0">
                        <VehicleIcon iconType={v.icon_type} slug={v.slug} selected={isSelected} />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-bold text-slate-800 text-[15px]">{meta.label}</p>
                        <p className="text-[11px] text-gray-500 leading-tight mt-0.5 line-clamp-2">
                          {meta.desc}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          <User size={12} className="text-gray-500" weight="fill" />
                          <span className="text-xs text-gray-600">{v.person_capacity || 4}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="font-bold text-lg text-blue-600">{fare} &euro;</span>
                        <Info size={14} className="text-blue-600" />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Schedule option (hidden by default, collapsible) */}
              {scheduleMode && (
                <div className="flex gap-2 px-5 py-2 border-t border-gray-100" data-testid="schedule-inputs">
                  <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl p-2.5 text-sm" data-testid="schedule-date" />
                  <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                    className="w-28 border border-gray-200 rounded-xl p-2.5 text-sm" data-testid="schedule-time" />
                </div>
              )}

              {/* Payment + Offer + CTA */}
              <div className="border-t border-gray-100 px-5 py-3">
                {/* Negotiate fare redirect (hybrid V3Cube Taxi Bidding flow) */}
                <button
                  onClick={() => {
                    const q = new URLSearchParams();
                    if (pickup?.address) q.set('pickup', pickup.address);
                    if (pickup?.lat) q.set('plat', pickup.lat);
                    if (pickup?.lng) q.set('plng', pickup.lng);
                    if (dropoff?.address) q.set('dropoff', dropoff.address);
                    if (dropoff?.lat) q.set('dlat', dropoff.lat);
                    if (dropoff?.lng) q.set('dlng', dropoff.lng);
                    navigate(`/taxi-bidding?${q.toString()}`);
                  }}
                  className="w-full mb-3 py-2.5 rounded-xl bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-700 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  data-testid="open-taxi-bidding-btn"
                >
                  <Gavel size={16} weight="duotone" />
                  Proposer un prix différent
                  <span className="text-[10px] text-pink-500 font-normal">(Enchères Taxi)</span>
                </button>

                <button
                  className="w-full flex items-center gap-3 py-3 border-b border-gray-100"
                  data-testid="payment-method-btn"
                  onClick={() => {
                    const next = paymentMethod === 'cash' ? 'card' : paymentMethod === 'card' ? 'wallet' : 'cash';
                    setPaymentMethod(next);
                  }}
                >
                  {paymentMethod === 'cash' ? (
                    <Money size={32} className="text-green-500" weight="fill" />
                  ) : paymentMethod === 'card' ? (
                    <CreditCard size={32} className="text-blue-500" weight="fill" />
                  ) : (
                    <CreditCard size={32} className="text-purple-500" weight="fill" />
                  )}
                  <span className="flex-1 text-base font-medium text-slate-800 text-left">
                    {paymentMethod === 'cash' ? 'Paiement en especes' : paymentMethod === 'card' ? 'Carte bancaire' : 'Portefeuille SB'}
                  </span>
                  <CaretRight size={18} className="text-gray-400" />
                </button>

                <button
                  className="w-full mt-3 h-14 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base disabled:opacity-60"
                  onClick={confirmRide}
                  disabled={loading}
                  data-testid="request-now-btn"
                >
                  {loading ? 'Reservation en cours...' : scheduleMode ? 'Programmer la course' : 'Demander maintenant'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ===== STEP 2.5: NEGOTIATION (waiting for counter-offers) =====
  if (step === 'negotiation') {
    const mine = parseFloat(proposedFare) || (estimate?.estimated_fare || 0);
    return (
      <div className="mobile-container min-h-screen bg-gray-50 flex flex-col" data-testid="negotiation-step">
        <div className="bg-gradient-to-r from-[#FF4500] to-[#FF6B35] px-5 pt-6 pb-8 text-white">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={cancelNegotiation} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="cancel-negotiation-btn">
              <ArrowLeft size={18} className="text-white" weight="bold" />
            </button>
            <h1 className="text-lg font-bold">Negociation en cours</h1>
          </div>
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4">
            <p className="text-xs text-white/80 mb-1">Votre offre</p>
            <p className="text-4xl font-black">{mine.toFixed(2)} &euro;</p>
            <p className="text-xs text-white/80 mt-2 flex items-center gap-1.5">
              <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
              Envoyee aux chauffeurs a proximite
            </p>
          </div>
        </div>

        <div className="flex-1 px-5 py-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-800">Propositions recues</h2>
            <span className="text-xs text-gray-500" data-testid="offers-count">{counterOffers.filter(o => o.status === 'pending').length} proposition(s)</span>
          </div>

          {counterOffers.filter(o => o.status === 'pending').length === 0 && (
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm" data-testid="waiting-state">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-orange-100 flex items-center justify-center animate-pulse">
                <Car size={28} className="text-[#FF4500]" weight="duotone" />
              </div>
              <p className="font-semibold text-slate-800 mb-1">En attente des chauffeurs...</p>
              <p className="text-xs text-gray-500">Les chauffeurs vont accepter ou contre-proposer dans quelques secondes</p>
            </div>
          )}

          <div className="space-y-3">
            {counterOffers.filter(o => o.status === 'pending').map(o => {
              const diff = o.amount - mine;
              const isHigher = diff > 0;
              return (
                <div key={o.id} className="bg-white rounded-2xl p-4 shadow-sm" data-testid={`offer-${o.id}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-base">
                      {o.driver_name?.charAt(0).toUpperCase() || 'C'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 truncate">{o.driver_name}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-2">
                        <span className="flex items-center gap-0.5"><Info size={10} weight="fill" className="text-amber-400" />{o.driver_rating?.toFixed(1) || '5.0'}</span>
                        {o.driver_vehicle_model && <span>&middot; {o.driver_vehicle_model}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-slate-800">{o.amount.toFixed(2)} &euro;</p>
                      {diff !== 0 && (
                        <p className={`text-[10px] font-bold ${isHigher ? 'text-red-500' : 'text-green-600'}`}>
                          {isHigher ? '+' : ''}{diff.toFixed(2)} &euro; vs votre offre
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => acceptOffer(o.id)}
                    disabled={loading}
                    className="w-full h-11 rounded-xl bg-[#FF4500] hover:bg-[#E53E00] text-white font-bold text-sm disabled:opacity-60"
                    data-testid={`accept-offer-${o.id}`}
                  >
                    Accepter cette offre
                  </button>
                </div>
              );
            })}
          </div>
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
          <div className="w-3 h-3 rounded-full bg-[#FF4500]" />
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
