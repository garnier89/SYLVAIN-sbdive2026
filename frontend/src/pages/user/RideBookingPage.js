import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { rideAPI } from '../../services/api';
import { useJsApiLoader } from '@react-google-maps/api';
import { usePaymentMethods } from '../../hooks/usePaymentMethods';

import RidePlanStep from './ride/RidePlanStep';
import RideMapStep from './ride/RideMapStep';
import RideNegotiationStep from './ride/RideNegotiationStep';
import RideSearchingStep from './ride/RideSearchingStep';

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

// French display labels + descriptions for each vehicle slug
const VEHICLE_META = {
  sb:      { label: 'Standard',  desc: "Berline économique pour vos trajets quotidiens." },
  confort: { label: 'Confort',   desc: "Véhicule spacieux avec plus de confort." },
  luxe:    { label: 'Luxe',      desc: "Mercedes, Audi, BMW — chauffeurs d'élite." },
  berline: { label: 'Berline',   desc: "Berline 4 places — business & longs trajets." },
  van:     { label: 'Van',       desc: "Grande capacité jusqu'à 7 passagers." },
  moto:    { label: 'Moto-taxi', desc: "Rapide aux heures de pointe." },
};

const RideBookingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState('plan'); // plan | map | negotiation | searching
  const [stopovers, setStopovers] = useState([]);
  const [bookFor, setBookFor] = useState({ name: '', phone: '' });
  const [showBookForModal, setShowBookForModal] = useState(false);
  const [pickup, setPickup] = useState({ lat: null, lng: null, address: '' });
  const [dropoff, setDropoff] = useState({ lat: null, lng: null, address: '' });
  const [selectingLocation, setSelectingLocation] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState('sb');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [estimate, setEstimate] = useState(null);
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [proposedFare] = useState('');
  const [counterOffers, setCounterOffers] = useState([]);
  const [mapCenter, setMapCenter] = useState({ lat: 48.8566, lng: 2.3522 });
  const [routePath, setRoutePath] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const { isLoaded: gmapLoaded } = useJsApiLoader({ googleMapsApiKey: GMAP_KEY || '' });
  const { methods: paymentMethods } = usePaymentMethods();
  const [recentLocations] = useState([
    { address: 'Gare du Nord, 18 Rue de Dunkerque, 75010 Paris' },
    { address: 'Tour Eiffel, Champ de Mars, 75007 Paris' },
  ]);

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

  // ===== Render appropriate step =====
  if (step === 'plan') {
    return (
      <RidePlanStep
        navigate={navigate}
        bookFor={bookFor} setBookFor={setBookFor}
        showBookForModal={showBookForModal} setShowBookForModal={setShowBookForModal}
        pickup={pickup} setPickup={setPickup}
        dropoff={dropoff} setDropoff={setDropoff}
        setMapCenter={setMapCenter}
        stopovers={stopovers} setStopovers={setStopovers}
        recentLocations={recentLocations}
        handleSetOnMap={handleSetOnMap}
        handleDestinationFromRecent={handleDestinationFromRecent}
      />
    );
  }

  if (step === 'map') {
    return (
      <RideMapStep
        pickup={pickup} dropoff={dropoff} mapCenter={mapCenter}
        routePath={routePath} estimate={estimate}
        vehicleTypes={vehicleTypes} selectedVehicle={selectedVehicle} setSelectedVehicle={setSelectedVehicle}
        paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
        paymentMethods={paymentMethods}
        scheduleMode={scheduleMode}
        scheduleDate={scheduleDate} setScheduleDate={setScheduleDate}
        scheduleTime={scheduleTime} setScheduleTime={setScheduleTime}
        selectingLocation={selectingLocation}
        handleLocationSelect={handleLocationSelect}
        getEstimate={getEstimate}
        gmapLoaded={gmapLoaded}
        confirmRide={confirmRide}
        loading={loading}
        vehicleMeta={VEHICLE_META}
        setStep={setStep}
      />
    );
  }

  if (step === 'negotiation') {
    return (
      <RideNegotiationStep
        proposedFare={proposedFare} estimate={estimate}
        counterOffers={counterOffers} loading={loading}
        acceptOffer={acceptOffer} cancelNegotiation={cancelNegotiation}
      />
    );
  }

  return <RideSearchingStep pickup={pickup} dropoff={dropoff} ride={ride} />;
};

export default RideBookingPage;
