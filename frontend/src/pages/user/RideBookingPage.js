import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { rideAPI } from '../../services/api';
import { usePaymentMethods } from '../../hooks/usePaymentMethods';

import RidePlanStep from './ride/RidePlanStep';
import RideMapStep from './ride/RideMapStep';
import RideNegotiationStep from './ride/RideNegotiationStep';
import RideSearchingStep from './ride/RideSearchingStep';

const API = process.env.REACT_APP_BACKEND_URL;

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
  const location = useLocation();

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
  const [autoPromo, setAutoPromo] = useState(null);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucher, setVoucher] = useState(null);
  const [applyingVoucher, setApplyingVoucher] = useState(false);
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [proposedFare] = useState('');
  const [counterOffers, setCounterOffers] = useState([]);
  const [poolEnabled, setPoolEnabled] = useState(false);
  const [airportSurcharge, setAirportSurcharge] = useState(null);
  const [mapCenter, setMapCenter] = useState({ lat: 48.8566, lng: 2.3522 });
  const [routePath, setRoutePath] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const { methods: paymentMethods } = usePaymentMethods();

  // Fetch the best auto-applied promotion for the current fare (double-price preview)
  useEffect(() => {
    const amt = estimate?.estimated_fare;
    if (!amt || amt <= 0) return undefined;
    let alive = true;
    rideAPI.getBestAutoPromo(amt, 'ride', pickup?.address || '')
      .then((r) => { if (alive) setAutoPromo(r.data?.promo || null); })
      .catch(() => { if (alive) setAutoPromo(null); });
    return () => { alive = false; };
  }, [estimate?.estimated_fare, pickup?.address]);

  const applyVoucher = async () => {
    const code = (voucherCode || '').trim();
    if (!code) return;
    const autoDisc = autoPromo?.discount_amount || 0;
    const amt = Math.max((estimate?.estimated_fare || 0) - autoDisc, 0);
    setApplyingVoucher(true);
    try {
      const r = await rideAPI.validateVoucher(code, amt, pickup?.address || '');
      if (r.data?.valid) {
        setVoucher({ code: r.data.code, discount: r.data.discount, title: r.data.title });
        toast.success(`Voucher ${r.data.code} appliqué : -${r.data.discount.toFixed(2)} €`);
      } else {
        setVoucher(null);
        toast.error(r.data?.message || 'Voucher invalide');
      }
    } catch (e) {
      setVoucher(null);
      toast.error(e?.response?.data?.detail || 'Voucher invalide');
    } finally {
      setApplyingVoucher(false);
    }
  };
  const removeVoucher = () => { setVoucher(null); setVoucherCode(''); };

  const [recentLocations] = useState([
    { address: 'Gare du Nord, 18 Rue de Dunkerque, 75010 Paris' },
    { address: 'Tour Eiffel, Champ de Mars, 75007 Paris' },
  ]);

  useEffect(() => {
    if (searchParams.get('type') === 'schedule') setScheduleMode(true);
  }, [searchParams]);

  // Voice-assistant prefill: geocode pickup/dropoff and select vehicle
  useEffect(() => {
    const prefill = location.state?.prefill;
    if (!prefill || location.state?.source !== 'voice') return;

    // Map LLM vehicle slug to our internal slug
    const vehicleMap = { 'vtc-taxi': 'sb', premium: 'luxe', van: 'van', 'moto-taxi': 'moto' };
    if (prefill.vehicle_type) {
      const v = vehicleMap[prefill.vehicle_type] || 'sb';
      setSelectedVehicle(v);
    }

    const waitForMaps = () => new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (window.google && window.google.maps && window.google.maps.Geocoder) return resolve(true);
        if (Date.now() - start > 5000) return resolve(false);
        setTimeout(check, 150);
      };
      check();
    });

    const geocode = (addr) => new Promise((resolve) => {
      if (!addr || addr === 'current_location') return resolve(null);
      const w = window;
      if (!w.google || !w.google.maps) return resolve(null);
      const geocoder = new w.google.maps.Geocoder();
      geocoder.geocode({ address: `${addr}, France` }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng(), address: results[0].formatted_address || addr });
        } else { resolve(null); }
      });
    });

    (async () => {
      await waitForMaps();
      let pickedUp = false;
      if (prefill.pickup === 'current_location' && navigator.geolocation) {
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => { setPickup({ lat: pos.coords.latitude, lng: pos.coords.longitude, address: 'Ma position' }); pickedUp = true; resolve(); },
            () => resolve(),
            { timeout: 4000 },
          );
        });
      } else if (prefill.pickup) {
        const p = await geocode(prefill.pickup);
        if (p) { setPickup(p); pickedUp = true; }
      }
      if (prefill.dropoff) {
        const d = await geocode(prefill.dropoff);
        if (d) setDropoff(d);
      }
      if (pickedUp) toast.success('Réservation pré-remplie par la voix');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

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

  // Auto-advance to the vehicle selection (map step) once both pickup & dropoff
  // are set via address autocomplete (parity with the "recent location" path).
  useEffect(() => {
    if (step === 'plan' && pickup.lat && dropoff.lat) {
      getEstimate();
      setStep('map');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng]);

  // Airport geofence — check for surcharge once pickup + dropoff are set
  useEffect(() => {
    if (!pickup.lat || !dropoff.lat) { setAirportSurcharge(null); return; }
    const ctl = new AbortController();
    fetch(`${API}/api/phase2/airport-flat-quote`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
      }),
      signal: ctl.signal,
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d && d.type === 'airport_surcharge') setAirportSurcharge(d);
        else setAirportSurcharge(null);
      })
      .catch(() => { /* ignore */ });
    return () => ctl.abort();
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng]);

  const confirmRide = async () => {
    setLoading(true);
    try {
      const offerAmount = parseFloat(proposedFare);
      const response = await rideAPI.create({
        pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, dropoff_address: dropoff.address,
        vehicle_type: selectedVehicle, payment_method: paymentMethod,
        proposed_fare: offerAmount > 0 ? offerAmount : (estimate?.estimated_fare || null),
        voucher_code: voucher?.code || null,
        book_for_name: bookFor.name || null,
        book_for_phone: bookFor.phone || null,
        pool_enabled: poolEnabled,
      });
      const createdRide = response.data;
      setRide(createdRide);
      if (stopovers.length > 0 && createdRide?.id) {
        try {
          await fetch(`${API}/api/phase1/rides/${createdRide.id}/stopovers`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ stopovers: stopovers.filter((s) => s.lat && s.lng) }),
          });
        } catch (_err) { console.warn('[RideBooking] silent error', _err); }
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
      } catch (_err) { console.warn('[RideBooking] poll error', _err); }
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
    } catch (_err) { console.warn('[RideBooking] navigation error', _err); }
    finally { setLoading(false); }
  };

  const cancelNegotiation = async () => {
    if (!ride?.id) { setStep('plan'); return; }
    try {
      await rideAPI.cancel(ride.id, 'Passenger cancelled during negotiation');
    } catch (_err) { console.warn('[RideBooking] silent error', _err); }
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
        routePath={routePath} estimate={estimate} autoPromo={autoPromo}
        voucherCode={voucherCode} setVoucherCode={setVoucherCode} voucher={voucher}
        onApplyVoucher={applyVoucher} onRemoveVoucher={removeVoucher} applyingVoucher={applyingVoucher}
        vehicleTypes={vehicleTypes} selectedVehicle={selectedVehicle} setSelectedVehicle={setSelectedVehicle}
        paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
        paymentMethods={paymentMethods}
        poolEnabled={poolEnabled} setPoolEnabled={setPoolEnabled}
        airportSurcharge={airportSurcharge}
        scheduleMode={scheduleMode}
        scheduleDate={scheduleDate} setScheduleDate={setScheduleDate}
        scheduleTime={scheduleTime} setScheduleTime={setScheduleTime}
        selectingLocation={selectingLocation}
        handleLocationSelect={handleLocationSelect}
        getEstimate={getEstimate}
        gmapLoaded={true}
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
