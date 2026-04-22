import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MapPin, CurrencyEur, Clock, User, Gavel, Minus, Plus } from '@phosphor-icons/react';
import { toast } from 'sonner';
import GooglePlacesInput from '../../components/GooglePlacesInput';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * TaxiBiddingPage — iDrive-style "Offer Your Fare" for a taxi ride.
 * 1. User enters pickup + destination.
 * 2. App computes average/suggested price via /api/rides/estimate.
 * 3. User sets the fare they're willing to pay.
 * 4. Ride is posted with `proposed_fare` — drivers can accept or counter-offer.
 *
 * This is distinct from Services Bidding (/services-bidding) which is
 * for posting jobs to electricians/plumbers/carpenters.
 */
const TaxiBiddingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pickup, setPickup] = useState(() => {
    const addr = searchParams.get('pickup');
    const lat = parseFloat(searchParams.get('plat'));
    const lng = parseFloat(searchParams.get('plng'));
    return (addr && lat && lng) ? { address: addr, lat, lng } : null;
  });
  const [dropoff, setDropoff] = useState(() => {
    const addr = searchParams.get('dropoff');
    const lat = parseFloat(searchParams.get('dlat'));
    const lng = parseFloat(searchParams.get('dlng'));
    return (addr && lat && lng) ? { address: addr, lat, lng } : null;
  });
  const [estimate, setEstimate] = useState(null);
  const [fare, setFare] = useState(0);
  const [vehicleType, setVehicleType] = useState('sb');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef(null);

  // Auto-estimate when both points set
  useEffect(() => {
    if (!pickup?.lat || !dropoff?.lat) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchEstimate, 350);
  }, [pickup, dropoff, vehicleType]);

  const fetchEstimate = async () => {
    if (!pickup?.lat || !dropoff?.lat) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/rides/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pickup_lat: pickup.lat, pickup_lng: pickup.lng,
          pickup_address: pickup.address,
          dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
          dropoff_address: dropoff.address,
          vehicle_type: vehicleType,
          payment_method: 'cash',
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`estimate ${res.status}: ${t}`);
      }
      const data = await res.json();
      setEstimate(data);
      if (data?.estimated_fare) setFare(Math.round(data.estimated_fare * 0.95 * 100) / 100);
    } catch (e) { console.error(e); toast.error("Impossible d'estimer le trajet"); }
    finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    if (!pickup || !dropoff) { toast.error('Veuillez saisir départ et arrivée'); return; }
    if (fare <= 0) { toast.error('Tarif invalide'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/rides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
          dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, dropoff_address: dropoff.address,
          vehicle_type: vehicleType,
          payment_method: 'cash',
          proposed_fare: fare,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`ride ${res.status}: ${t}`);
      }
      const ride = await res.json();
      toast.success("Votre tarif a été envoyé aux chauffeurs !");
      navigate(`/ride/${ride.id}`);
    } catch (e) { console.error(e); toast.error("Impossible de publier votre offre"); }
    finally { setSubmitting(false); }
  };

  const adjustFare = (delta) => setFare(prev => Math.max(1, Math.round((prev + delta) * 100) / 100));

  return (
    <div className="min-h-screen bg-white pb-8" data-testid="taxi-bidding-page">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Gavel size={18} className="text-pink-500" weight="duotone" />
            Enchères Taxi
          </h1>
          <p className="text-xs text-gray-500">Proposez votre propre tarif de course</p>
        </div>
      </div>

      <div className="px-4 py-5 space-y-5">
        {/* Info banner */}
        <div className="bg-pink-50 border border-pink-100 rounded-xl p-3 flex gap-3">
          <Gavel size={24} className="text-pink-500 flex-shrink-0 mt-0.5" weight="duotone" />
          <div className="text-sm">
            <p className="font-semibold text-pink-900">Comment ça marche ?</p>
            <ol className="text-pink-800 mt-1 space-y-0.5 list-decimal list-inside text-xs">
              <li>Saisissez votre destination</li>
              <li>Proposez votre propre tarif</li>
              <li>Les chauffeurs acceptent ou font une contre-offre</li>
              <li>Vous choisissez la meilleure offre</li>
            </ol>
          </div>
        </div>

        {/* Addresses */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Lieu de départ</label>
            <GooglePlacesInput
              placeholder="Adresse de départ"
              value={pickup?.address || ''}
              testId="pickup-input"
              onSelect={(r) => setPickup({ address: r.address, lat: r.lat, lng: r.lng })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Destination</label>
            <GooglePlacesInput
              placeholder="Où allez-vous ?"
              value={dropoff?.address || ''}
              testId="dropoff-input"
              onSelect={(r) => setDropoff({ address: r.address, lat: r.lat, lng: r.lng })}
            />
          </div>
        </div>

        {/* Vehicle type */}
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">Type de véhicule</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'sb', name: 'Standard' },
              { id: 'confort', name: 'Confort' },
              { id: 'luxe', name: 'Luxe' },
            ].map(v => (
              <button
                key={v.id}
                onClick={() => setVehicleType(v.id)}
                data-testid={`vehicle-${v.id}`}
                className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${
                  vehicleType === v.id
                    ? 'border-pink-500 bg-pink-50 text-pink-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>

        {/* Estimate */}
        {estimate && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-3" data-testid="estimate-banner">
            <CurrencyEur size={20} className="text-blue-500" weight="duotone" />
            <div className="flex-1 text-sm">
              <span className="text-blue-900 font-semibold">Prix moyen estimé : </span>
              <span className="text-blue-900 font-bold">{estimate.estimated_fare?.toFixed(2)} EUR</span>
              {estimate.distance_km && <span className="text-blue-700 text-xs ml-2">· {estimate.distance_km.toFixed(1)} km</span>}
            </div>
          </div>
        )}

        {/* Fare picker — always rendered for accessibility */}
        <div className={`border border-gray-200 rounded-2xl p-5 bg-gradient-to-br from-white to-gray-50 ${(!pickup || !dropoff) ? 'opacity-60' : ''}`} data-testid="fare-picker">
          <p className="text-center text-sm font-semibold text-gray-700 mb-3">
            {(!pickup || !dropoff) ? 'Saisissez les adresses pour continuer' : 'Saisissez votre tarif'}
          </p>
          <div className="flex items-center justify-center gap-3 mb-3">
            <button onClick={() => adjustFare(-1)} disabled={!pickup || !dropoff} className="w-12 h-12 rounded-xl bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center disabled:bg-gray-300" data-testid="fare-minus">
              <Minus size={20} weight="bold" />
            </button>
            <div className="flex-1 max-w-[180px] bg-white border-2 border-gray-200 rounded-xl py-3 text-center">
              <input
                type="number"
                value={fare}
                onChange={(e) => setFare(parseFloat(e.target.value) || 0)}
                className="w-full text-3xl font-bold text-gray-900 text-center outline-none"
                disabled={!pickup || !dropoff}
                data-testid="fare-input"
              />
              <p className="text-xs text-gray-400">EUR</p>
            </div>
            <button onClick={() => adjustFare(1)} disabled={!pickup || !dropoff} className="w-12 h-12 rounded-xl bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center disabled:bg-gray-300" data-testid="fare-plus">
              <Plus size={20} weight="bold" />
            </button>
          </div>
          <p className="text-[11px] text-gray-400 text-center">Taxe appliquée sur le montant final</p>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!pickup || !dropoff || fare <= 0 || submitting}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-4 rounded-xl font-bold text-base transition-colors"
          data-testid="submit-bid-btn"
        >
          {submitting ? 'Publication...' : 'Trouver un chauffeur'}
        </button>

        {loading && <p className="text-center text-xs text-gray-400">Calcul du tarif moyen...</p>}
      </div>
    </div>
  );
};

export default TaxiBiddingPage;
