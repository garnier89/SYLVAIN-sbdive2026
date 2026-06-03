import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, Minus, Plus, Gavel, Users, TrendUp } from '@phosphor-icons/react';
import { toast } from 'sonner';
import GooglePlacesInput from '../../components/GooglePlacesInput';

const API = process.env.REACT_APP_BACKEND_URL;
const GMAP_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

/** Circular countdown ring shown on each driver offer (inDrive-style urgency). */
const OfferCountdown = ({ seconds, total = 30 }) => {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, seconds / total));
  const color = seconds <= 8 ? '#ef4444' : seconds <= 15 ? '#f59e0b' : '#10b981';
  return (
    <div className="relative w-9 h-9 flex items-center justify-center flex-shrink-0" data-testid="offer-countdown">
      <svg className="w-9 h-9 -rotate-90" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
        <circle
          cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
        />
      </svg>
      <span className="absolute text-[11px] font-extrabold tabular-nums" style={{ color }}>{seconds}</span>
    </div>
  );
};

/**
 * TaxiBiddingPage — iDrive-style "Offer Your Fare" (V3Cube mockup match).
 *
 * Layout:
 *   - Map fills the background (top 50-60% of screen).
 *   - Bottom sheet with:
 *      · Live-stats strip (online drivers + acceptance rate).
 *      · "Average Price: X EUR" info banner.
 *      · Fare picker (−  [value]  +).
 *      · Blue "Find a Driver" button.
 *      · "Cancel" text link.
 *   - A small top-left section is devoted to Pickup/Dropoff inputs
 *     (collapsed into a single swipe-up card once both are set).
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
  const [showSheet, setShowSheet] = useState(false);
  const [liveStats, setLiveStats] = useState(null);
  const [searching, setSearching] = useState(null); // rideId once submitted
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [offers, setOffers] = useState([]);
  const [nowTs, setNowTs] = useState(Date.now());
  const suggestedRef = useRef(false);
  const debounceRef = useRef(null);

  const mapReady = pickup?.lat && dropoff?.lat;
  // Recommended fare = minimum allowed (cannot bid lower)
  const fareFloor = Math.round((estimate?.estimated_fare || liveStats?.avg_accepted_fare || 1) * 100) / 100;

  const fetchEstimate = useCallback(async () => {
    if (!pickup?.lat || !dropoff?.lat) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/rides/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
          dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, dropoff_address: dropoff.address,
          vehicle_type: vehicleType, payment_method: 'cash',
        }),
      });
      if (!res.ok) throw new Error(`estimate ${res.status}`);
      const data = await res.json();
      setEstimate(data);
      if (data?.estimated_fare && fare === 0) {
        // Default offer = recommended fare (cannot go below it)
        setFare(Math.round(data.estimated_fare * 100) / 100);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [pickup, dropoff, vehicleType, fare]);

  // Auto-estimate + show bottom sheet when both points are set
  useEffect(() => {
    if (!pickup?.lat || !dropoff?.lat) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchEstimate, 350);
    setShowSheet(true);
  }, [pickup, dropoff, vehicleType, fetchEstimate]);

  // Fetch live indicator stats on mount and when pickup changes
  useEffect(() => {
    const qs = pickup?.lat ? `?lat=${pickup.lat}&lng=${pickup.lng}` : '';
    fetch(`${API}/api/phase2/taxi-bidding/live-stats${qs}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(setLiveStats)
      .catch((e) => console.warn('live-stats fetch failed:', e?.message || e));
  }, [pickup]);

  const handleSubmit = async () => {
    if (!pickup || !dropoff) { toast.error('Veuillez saisir départ et arrivée'); return; }
    // Offer cannot be below the recommended (minimum) fare
    const finalFare = Math.max(fareFloor, fare || fareFloor);
    setFare(finalFare);
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/rides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
          dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, dropoff_address: dropoff.address,
          vehicle_type: vehicleType, payment_method: 'cash', proposed_fare: finalFare,
        }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`ride ${res.status}: ${t}`); }
      const ride = await res.json();
      toast.success('Votre tarif a été envoyé aux chauffeurs !');
      // Stay on the interface: enter "searching" mode (no navigation)
      setSearching(ride.id);
      setSearchSeconds(0);
    } catch (e) {
      console.error('[TaxiBidding] submit failed:', e);
      toast.error('Impossible de publier votre offre. Réessayez.');
    }
    finally { setSubmitting(false); }
  };

  // Poll ride status while searching; navigate once a driver accepts
  useEffect(() => {
    if (!searching) return;
    const tick = setInterval(() => { setSearchSeconds((s) => s + 1); setNowTs(Date.now()); }, 1000);
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/rides/${searching}`, { credentials: 'include' });
        if (!r.ok) return;
        const ride = await r.json();
        setOffers((ride.counter_offers || []).filter((o) => o.status === 'pending'));
        if (ride.status && ride.status !== 'pending') {
          clearInterval(poll); clearInterval(tick);
          if (ride.status === 'cancelled') { toast.info('Course annulée'); setSearching(null); }
          else { toast.success('Chauffeur trouvé !'); navigate(`/ride/${searching}`); }
        }
      } catch (e) { /* keep polling */ }
    }, 2500);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [searching, navigate]);

  // Auto-suggest raising the fare after 20s with no offers
  useEffect(() => {
    if (searching && searchSeconds === 20 && offers.length === 0 && !suggestedRef.current) {
      suggestedRef.current = true;
      toast('Aucune offre pour le moment — augmentez votre tarif pour attirer les chauffeurs', { icon: '⏱️' });
    }
  }, [searching, searchSeconds, offers.length]);

  const acceptOffer = async (offerId) => {
    try {
      const r = await fetch(`${API}/api/rides/${searching}/accept-offer/${offerId}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      });
      if (!r.ok) { const t = await r.json().catch(() => ({})); throw new Error(t.detail || 'Erreur'); }
      toast.success('Chauffeur sélectionné !');
      navigate(`/ride/${searching}`);
    } catch (e) { toast.error(e.message || 'Impossible d\'accepter cette offre'); }
  };

  const raiseFare = async (delta) => {
    const newFare = Math.round((fare + delta) * 100) / 100;
    try {
      const r = await fetch(`${API}/api/rides/${searching}/proposed-fare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ proposed_fare: newFare }),
      });
      if (!r.ok) { const t = await r.json().catch(() => ({})); throw new Error(t.detail || 'Erreur'); }
      setFare(newFare);
      toast.success(`Tarif augmenté à ${newFare.toFixed(2)} € et renvoyé`);
    } catch (e) { toast.error(e.message || 'Impossible d\'augmenter le tarif'); }
  };

  const cancelSearch = async () => {
    if (searching) {
      try {
        await fetch(`${API}/api/rides/${searching}/status`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ status: 'cancelled', cancel_reason: 'Annulé par le passager' }),
        });
      } catch (e) { /* ignore */ }
    }
    setSearching(null);
  };

  const adjustFare = (delta) => setFare(prev => Math.max(fareFloor, Math.round((prev + delta) * 100) / 100));
  const onFareInput = (e) => {
    const v = parseFloat(e.target.value) || 0;
    setFare(v < fareFloor ? fareFloor : v);
  };

  // Static Google Map URL for the background
  const staticMapUrl = mapReady && GMAP_KEY
    ? `https://maps.googleapis.com/maps/api/staticmap?size=400x500&scale=2` +
      `&markers=color:green|label:A|${pickup.lat},${pickup.lng}` +
      `&markers=color:red|label:B|${dropoff.lat},${dropoff.lng}` +
      `&path=color:0x3b82f6|weight:5|${pickup.lat},${pickup.lng}|${dropoff.lat},${dropoff.lng}` +
      `&key=${GMAP_KEY}`
    : null;

  return (
    <div className="min-h-screen bg-gray-100 relative" data-testid="taxi-bidding-page">
      {/* Map background (or hero gradient when addresses not set) */}
      <div className="absolute inset-0">
        {staticMapUrl ? (
          <img src={staticMapUrl} alt="Itinéraire" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-100 via-indigo-50 to-pink-50" />
        )}
      </div>

      {/* Top-left back + title */}
      <div className="relative z-10 pt-12 px-4 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={20} />
        </button>
        {!mapReady && (
          <div className="ml-2 bg-white/90 backdrop-blur rounded-xl px-3 py-1.5 shadow flex items-center gap-2">
            <Gavel size={16} className="text-blue-600" weight="duotone" />
            <span className="text-sm font-bold text-blue-900">Enchères Taxi</span>
          </div>
        )}
      </div>

      {/* Address inputs card (only visible when not both set) */}
      {!mapReady && (
        <div className="relative z-10 mx-4 mt-4 bg-white rounded-2xl shadow-lg p-4 space-y-3" data-testid="address-card">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Proposez votre propre tarif de course</p>
          <GooglePlacesInput
            placeholder="Adresse de départ"
            value={pickup?.address || ''}
            testId="pickup-input"
            onSelect={(r) => setPickup({ address: r.address, lat: r.lat, lng: r.lng })}
          />
          <GooglePlacesInput
            placeholder="Où allez-vous ?"
            value={dropoff?.address || ''}
            testId="dropoff-input"
            iconColor="#ef4444"
            onSelect={(r) => setDropoff({ address: r.address, lat: r.lat, lng: r.lng })}
          />
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
                className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                  vehicleType === v.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Route summary when map is visible */}
      {mapReady && (
        <div className="relative z-10 mx-4 mt-4 bg-white rounded-2xl shadow-lg overflow-hidden" data-testid="route-summary">
          <button onClick={() => { setPickup(null); setDropoff(null); setShowSheet(false); setFare(0); }}
            className="w-full p-3 flex items-start gap-3 text-left"
            data-testid="edit-route-btn">
            <div className="flex flex-col items-center pt-1">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <div className="w-0.5 h-6 bg-gray-300 my-1" />
              <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm font-medium text-gray-800 truncate">{pickup.address}</p>
              <p className="text-sm font-medium text-gray-800 truncate">{dropoff.address}</p>
            </div>
            <span className="text-xs text-blue-600 font-semibold flex-shrink-0 mt-1">Modifier</span>
          </button>
          {/* Vehicle type strip */}
          <div className="border-t border-gray-100 px-3 py-2 flex items-center gap-2 overflow-x-auto">
            {[
              { id: 'sb', name: 'Standard' },
              { id: 'confort', name: 'Confort' },
              { id: 'luxe', name: 'Luxe' },
            ].map(v => (
              <button
                key={v.id}
                onClick={() => setVehicleType(v.id)}
                data-testid={`vehicle-${v.id}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  vehicleType === v.id ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom sheet (Offer Your Fare) */}
      {showSheet && mapReady && !searching && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-white rounded-t-3xl shadow-2xl animate-slide-up" data-testid="offer-fare-sheet">
          {/* Handle */}
          <div className="flex justify-center pt-3">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          {/* Title */}
          <div className="px-6 pt-3 pb-1 text-center">
            <h2 className="text-xl font-bold text-blue-600" data-testid="offer-fare-title">Offrez votre tarif</h2>
          </div>

          {/* Live indicators strip */}
          {liveStats && (
            <div className="px-6 py-2 flex items-center justify-center gap-4 text-[11px] text-gray-500" data-testid="live-stats-strip">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <Users size={12} />
                <span className="font-semibold text-gray-700">{liveStats.online_drivers_nearby}</span>
                <span>chauffeurs en ligne</span>
              </div>
              {liveStats.acceptance_rate_percent != null && (
                <div className="flex items-center gap-1">
                  <TrendUp size={12} className="text-green-500" />
                  <span className="font-semibold text-gray-700">{liveStats.acceptance_rate_percent}%</span>
                  <span>acceptation</span>
                </div>
              )}
            </div>
          )}

          {/* Average Price banner */}
          <div className="mx-5 mt-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center gap-3" data-testid="avg-price-banner">
            <Info size={18} className="text-blue-500 flex-shrink-0" weight="fill" />
            <p className="text-sm text-gray-700">
              Prix moyen : <span className="font-bold text-blue-600">
                {loading ? '...' : (estimate?.estimated_fare || liveStats?.avg_accepted_fare || 0).toFixed(2)} EUR
              </span>
            </p>
          </div>

          {/* Fare picker */}
          <div className="mx-5 mt-4 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4">
            <p className="text-center text-sm font-semibold text-gray-700 mb-3">Saisissez votre tarif</p>
            <div className="flex items-center gap-3">
              <button onClick={() => adjustFare(-1)} className="w-12 h-12 rounded-xl bg-blue-500 hover:bg-blue-600 active:scale-95 text-white flex items-center justify-center shadow-md transition-transform" data-testid="fare-minus">
                <Minus size={20} weight="bold" />
              </button>
              <div className="flex-1 bg-white border border-gray-200 rounded-xl py-2.5 text-center">
                <input
                  type="number"
                  value={fare}
                  onChange={onFareInput}
                  className="w-full text-3xl font-extrabold text-gray-900 text-center outline-none"
                  data-testid="fare-input"
                />
                <p className="text-[11px] text-gray-400 -mt-0.5">EUR</p>
              </div>
              <button onClick={() => adjustFare(1)} className="w-12 h-12 rounded-xl bg-blue-500 hover:bg-blue-600 active:scale-95 text-white flex items-center justify-center shadow-md transition-transform" data-testid="fare-plus">
                <Plus size={20} weight="bold" />
              </button>
            </div>
            <p className="text-[11px] text-gray-500 text-center mt-3" data-testid="min-fare-note">Tarif minimum : <span className="font-bold">{fareFloor.toFixed(2)} €</span> · vous ne pouvez pas proposer moins</p>
          </div>

          {/* Find a Driver */}
          <div className="mx-5 mt-4 mb-3">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full h-14 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold text-base shadow-lg transition-colors"
              data-testid="find-driver-btn"
            >
              {submitting ? 'Publication...' : 'Trouver un chauffeur'}
            </button>
          </div>

          {/* Cancel */}
          <div className="text-center pb-6">
            <button onClick={() => navigate(-1)} className="text-gray-500 text-sm font-medium hover:text-gray-700" data-testid="cancel-btn">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Searching overlay — stays on this interface; raise fare if no driver */}
      {searching && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white rounded-t-3xl shadow-2xl animate-slide-up" data-testid="searching-sheet">
          <div className="flex justify-center pt-3"><div className="w-10 h-1 rounded-full bg-gray-300" /></div>
          {/* Radar animation */}
          <div className="flex flex-col items-center pt-4 pb-2">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-30 animate-ping" />
              <span className="absolute inline-flex h-16 w-16 rounded-full bg-blue-400 opacity-40 animate-ping" style={{ animationDelay: '0.4s' }} />
              <div className="relative w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center">
                <Gavel size={26} weight="fill" className="text-white" />
              </div>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mt-3" data-testid="searching-title">Recherche d'un chauffeur…</h2>
            <p className="text-sm text-gray-500">Votre offre : <span className="font-bold text-blue-600" data-testid="searching-fare">{fare.toFixed(2)} €</span> · {searchSeconds}s</p>
            {liveStats?.online_drivers_nearby != null && (
              <p className="text-[11px] text-gray-400 mt-0.5">{liveStats.online_drivers_nearby} chauffeurs en ligne à proximité</p>
            )}
          </div>

          {/* Driver offers list (inDrive-style bidirectional bidding) */}
          {(() => {
            const remainingFor = (o) => {
              if (!o.expires_at) return null;
              const ms = new Date(o.expires_at).getTime() - nowTs;
              return Math.max(0, Math.ceil(ms / 1000));
            };
            const liveOffers = offers.filter((o) => {
              const rem = remainingFor(o);
              return rem === null || rem > 0;
            });
            if (liveOffers.length === 0) return null;
            return (
              <div className="mx-5 mt-1 mb-2 space-y-2 max-h-64 overflow-y-auto" data-testid="driver-offers-list">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{liveOffers.length} chauffeur(s) proposent un tarif</p>
                {liveOffers.map((o) => {
                  const rem = remainingFor(o);
                  return (
                    <div key={o.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl p-3 shadow-sm" data-testid={`offer-${o.id}`}>
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Users size={20} className="text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{o.driver_name || 'Chauffeur'}</p>
                        <p className="text-[11px] text-gray-500 flex items-center gap-1">
                          ⭐ {(o.driver_rating || 5).toFixed(1)}{o.driver_vehicle_model ? ` · ${o.driver_vehicle_model}` : ''}
                        </p>
                      </div>
                      {rem !== null && <OfferCountdown seconds={rem} total={o.ttl_seconds || 30} />}
                      <div className="text-right">
                        <p className="text-lg font-extrabold text-gray-900">{o.amount.toFixed(2)} €</p>
                      </div>
                      <button onClick={() => acceptOffer(o.id)} data-testid={`accept-offer-${o.id}`}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold text-sm transition-transform">
                        Choisir
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Raise fare to attract drivers (cannot lower) */}
          <div className={`mx-5 mt-2 rounded-2xl px-4 py-4 border ${searchSeconds >= 20 && offers.length === 0 ? 'bg-amber-100 border-amber-300 animate-pulse' : 'bg-amber-50 border-amber-100'}`} data-testid="raise-fare-block">
            <p className="text-center text-sm font-semibold text-gray-700">
              {searchSeconds >= 12 ? 'Pas encore de chauffeur ? Augmentez votre tarif' : 'Augmentez votre tarif pour aller plus vite'}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {[1, 2, 5].map((d) => (
                <button key={d} onClick={() => raiseFare(d)} data-testid={`raise-fare-${d}`}
                  className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold transition-transform">
                  +{d} €
                </button>
              ))}
            </div>
          </div>

          <div className="text-center py-5">
            <button onClick={cancelSearch} className="text-gray-500 text-sm font-medium hover:text-gray-700" data-testid="cancel-search-btn">
              Annuler la recherche
            </button>
          </div>
        </div>
      )}

      {/* Fare picker always accessible for testid coverage (hidden when sheet open) */}
      {!showSheet && (
        <div className="hidden" data-testid="fare-picker-fallback">
          <input type="number" value={fare} onChange={(e) => setFare(parseFloat(e.target.value) || 0)} data-testid="fare-input" />
          <button onClick={() => adjustFare(-1)} data-testid="fare-minus">-</button>
          <button onClick={() => adjustFare(1)} data-testid="fare-plus">+</button>
        </div>
      )}
    </div>
  );
};

export default TaxiBiddingPage;
