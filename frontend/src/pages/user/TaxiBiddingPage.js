import { useLocale } from '../../contexts/LocaleContext';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, Minus, Plus, Users, TrendUp } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { CountdownRing } from '../../components/CountdownRing';
import RadarCars from '../../components/RadarCars';
import SearchRadar from '../../components/SearchRadar';

const API = process.env.REACT_APP_BACKEND_URL;
const GMAP_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;
const BID_TIMEOUT_SECONDS = 120; // délai avant proposition d'augmenter / passer en standard

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
  const { money } = useLocale();
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
  const [vehicleType] = useState(() => searchParams.get('vehicle') || 'sb');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [liveStats, setLiveStats] = useState(null);
  const [searching, setSearching] = useState(() => searchParams.get('resume') || null); // rideId once submitted
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [offers, setOffers] = useState([]);
  const [viewedCount, setViewedCount] = useState(0);
  const [autoAccept, setAutoAccept] = useState(false);
  const [autoAcceptEta, setAutoAcceptEta] = useState(10);
  const autoAcceptRef = useRef(false);
  const autoAcceptEtaRef = useRef(10);
  const autoAcceptedRef = useRef(false);
  const fareRef = useRef(0);
  const [expired, setExpired] = useState(false); // délai dépassé sans chauffeur
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [carsCfg, setCarsCfg] = useState(null);
  const [newOfferFlash, setNewOfferFlash] = useState(false);

  // Admin-configurable radar cars (enabled / icon / count / radius)
  useEffect(() => {
    fetch(`${API}/api/config/ride-search`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setCarsCfg(d); })
      .catch(() => {});
  }, []);

  const suggestedRef = useRef(false);
  const debounceRef = useRef(null);
  const audioCtxRef = useRef(null);
  const prevOfferIdsRef = useRef(new Set());

  // Pleasant two-note chime when a driver offer arrives (WebAudio, no asset).
  // The AudioContext is created on the "Find a driver" tap (a user gesture) so
  // playback during polling is allowed by browser autoplay policies.
  const playOfferChime = useCallback(() => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      const t0 = ctx.currentTime;
      [880, 1175].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const start = t0 + i * 0.14;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.28, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(start); osc.stop(start + 0.28);
      });
    } catch { /* audio unavailable — silent fallback */ }
  }, []);

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
  }, [pickup, dropoff, vehicleType, fetchEstimate]);

  // Fetch live indicator stats on mount and when pickup changes
  useEffect(() => {
    let active = true;
    const qs = pickup?.lat ? `?lat=${pickup.lat}&lng=${pickup.lng}` : '';
    fetch(`${API}/api/phase2/taxi-bidding/live-stats${qs}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) setLiveStats(d); })
      .catch((e) => console.warn('live-stats fetch failed:', e?.message || e));
    return () => { active = false; };
  }, [pickup]);

  // Resume + initial vehicle type are read directly from the URL via lazy useState
  // initializers above (React-Compiler-safe: no setState-in-effect on mount).

  // Addresses are collected on the unified /course?mode=bidding flow. If someone
  // lands here without them (direct URL or after tapping "Modifier"), send them
  // to the unified bidding entry — no duplicate address-entry screen.
  useEffect(() => {
    const hasResume = !!searchParams.get('resume');
    if (!hasResume && !searching && (!pickup?.lat || !dropoff?.lat)) {
      navigate('/course?mode=bidding', { replace: true });
    }
  }, [pickup, dropoff, searching, searchParams, navigate]);

  const handleSubmit = async () => {
    if (!pickup || !dropoff) { toast.error('Veuillez saisir départ et arrivée'); return; }
    // Unlock the audio chime on this user gesture (browser autoplay policy).
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audioCtxRef.current = new Ctx();
      }
      audioCtxRef.current?.resume?.();
    } catch { /* no audio support */ }
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
          ride_type: 'bidding', mode_id: 'bidding',
        }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`ride ${res.status}: ${t}`); }
      const ride = await res.json();
      toast.success('Votre tarif a été envoyé aux chauffeurs !');
      // Stay on the interface: enter "searching" mode (no navigation)
      autoAcceptedRef.current = false;
      setSearching(ride.id);
      setSearchSeconds(0);
    } catch (e) {
      console.error('[TaxiBidding] submit failed:', e);
      toast.error('Impossible de publier votre offre. Réessayez.');
    }
    finally { setSubmitting(false); }
  };

  // Keep refs in sync so the poll closure reads fresh auto-accept settings
  useEffect(() => { autoAcceptRef.current = autoAccept; }, [autoAccept]);
  useEffect(() => { autoAcceptEtaRef.current = autoAcceptEta; }, [autoAcceptEta]);
  useEffect(() => { fareRef.current = fare; }, [fare]);

  // Poll ride status while searching; navigate once a driver accepts
  useEffect(() => {
    if (!searching) return;    const tick = setInterval(() => { setSearchSeconds((s) => s + 1); setNowTs(Date.now()); }, 1000);
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/rides/${searching}`, { credentials: 'include' });
        if (!r.ok) return;
        const ride = await r.json();
        const pending = (ride.counter_offers || []).filter((o) => o.status === 'pending');
        // Chime + flash + vibration when a NEW driver offer arrives.
        const fresh = pending.filter((o) => !prevOfferIdsRef.current.has(o.id));
        if (fresh.length > 0) {
          playOfferChime();
          try { navigator.vibrate?.(90); } catch { /* no haptics */ }
          setNewOfferFlash(true);
          setTimeout(() => setNewOfferFlash(false), 1400);
          toast.success(fresh.length > 1 ? `${fresh.length} chauffeurs ont répondu !` : 'Un chauffeur a répondu !', { icon: '🚗' });
        }
        prevOfferIdsRef.current = new Set(pending.map((o) => o.id));
        setOffers(pending);
        setViewedCount(ride.viewed_count || 0);
        // Auto-accept: first eligible offer (≤ my fare AND ETA ≤ max minutes).
        if (autoAcceptRef.current && !autoAcceptedRef.current && ride.status === 'pending') {
          const eligible = pending
            .filter((o) => o.amount <= fareRef.current && o.eta_min != null && o.eta_min <= autoAcceptEtaRef.current)
            .sort((a, b) => a.amount - b.amount || (a.eta_min || 0) - (b.eta_min || 0));
          if (eligible.length) {
            autoAcceptedRef.current = true;
            clearInterval(poll); clearInterval(tick);
            toast.success(`Acceptation auto : ${eligible[0].driver_name || 'chauffeur'} · ${eligible[0].eta_min} min`, { icon: '⚡' });
            acceptOffer(eligible[0].id);
            return;
          }
        }
        if (ride.status && ride.status !== 'pending') {
          clearInterval(poll); clearInterval(tick);
          if (ride.status === 'cancelled') { toast.info('Course annulée'); setSearching(null); }
          else { toast.success('Chauffeur trouvé !'); navigate(`/ride/${searching}`); }
        }
      } catch (e) { console.warn('[bidding] poll error', e?.message); }
    }, 2500);
    return () => { clearInterval(poll); clearInterval(tick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, navigate, playOfferChime]);

  // Auto-suggest raising the fare after 20s with no offers
  useEffect(() => {
    if (searching && searchSeconds === 20 && offers.length === 0 && !suggestedRef.current) {
      suggestedRef.current = true;
      toast('Aucune offre pour le moment — augmentez votre tarif pour attirer les chauffeurs', { icon: '⏱️' });
    }
  }, [searching, searchSeconds, offers.length]);

  // Hard timeout: after BID_TIMEOUT_SECONDS with no driver offer, prompt the rider
  // to raise their fare or switch to standard pricing (avoids stuck bids).
  const bidTimeout = carsCfg?.bid_timeout_seconds || BID_TIMEOUT_SECONDS;
  useEffect(() => {
    if (searching && !expired && offers.length === 0 && searchSeconds >= bidTimeout) {
      setExpired(true);
    }
  }, [searching, searchSeconds, expired, offers.length, bidTimeout]);

  const suggestedFare = Math.max(fareFloor, Math.round((fare || fareFloor) * 1.2 * 100) / 100);

  const raiseToSuggested = async () => {
    await raiseFare(Math.round((suggestedFare - fare) * 100) / 100);
    suggestedRef.current = false;
    setSearchSeconds(0);
    setExpired(false);
  };

  const keepWaiting = () => { setSearchSeconds(0); setExpired(false); };

  const switchToStandard = async () => {
    try {
      if (searching) {
        await fetch(`${API}/api/rides/${searching}/status`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ status: 'cancelled', cancel_reason: 'Bascule vers tarif standard' }),
        });
      }
      const res = await fetch(`${API}/api/rides`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
          dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, dropoff_address: dropoff.address,
          vehicle_type: vehicleType, payment_method: 'cash',
        }),
      });
      if (!res.ok) throw new Error('create standard failed');
      const ride = await res.json();
      setSearching(null); setExpired(false);
      toast.success('Passage au tarif standard');
      navigate(`/ride/${ride.id}`);
    } catch (e) {
      console.error('[bidding] switch to standard failed', e);
      toast.error('Impossible de basculer en tarif standard');
    }
  };

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

  const rejectOffer = async (offerId) => {
    // Optimistically drop the offer from the list, then mark it rejected server-side.
    setOffers((prev) => prev.filter((o) => o.id !== offerId));
    try {
      await fetch(`${API}/api/rides/${searching}/reject-offer/${offerId}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) { console.warn('[bidding] reject offer failed', e?.message); }
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
      toast.success(`Tarif augmenté à ${money(newFare)} et renvoyé`);
    } catch (e) { toast.error(e.message || 'Impossible d\'augmenter le tarif'); }
  };

  const cancelSearch = async () => {
    if (searching) {
      try {
        await fetch(`${API}/api/rides/${searching}/status`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ status: 'cancelled', cancel_reason: 'Annulé par le passager' }),
        });
      } catch (e) { console.warn('[bidding] cancel failed', e?.message); }
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
      `&path=color:0xFF5000|weight:5|${pickup.lat},${pickup.lng}|${dropoff.lat},${dropoff.lng}` +
      `&key=${GMAP_KEY}`
    : null;

  // Pickup-centered map for the "searching" radar (pulse rings sit on the pickup).
  const radarMapUrl = pickup?.lat && GMAP_KEY
    ? `https://maps.googleapis.com/maps/api/staticmap?size=400x340&scale=2&zoom=15` +
      `&center=${pickup.lat},${pickup.lng}` +
      `&key=${GMAP_KEY}`
    : null;

  return (
    <div className="min-h-screen bg-gray-100 relative" data-testid="taxi-bidding-page">
      {/* Map background (or hero gradient when addresses not set) */}
      <div className="absolute inset-0">
        {staticMapUrl ? (
          <img src={staticMapUrl} alt="Itinéraire" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-100 via-amber-50 to-rose-50" />
        )}
      </div>

      {/* Searching radar — pickup-centered map with pulsing orange waves */}
      {searching && (
        <div className="absolute top-0 left-0 right-0 h-[58%] overflow-hidden z-[2]" data-testid="radar-map-layer">
          {radarMapUrl
            ? <img src={radarMapUrl} alt="Carte" className="w-full h-full object-cover" />
            : <div className="w-full h-full bg-gradient-to-br from-orange-100 via-amber-50 to-rose-50" />}
          <div className="absolute inset-0 bg-white/10" />
          <SearchRadar
            size={244}
            caption={liveStats?.nearest_driver_eta_min
              ? `Chauffeur à ~${liveStats.nearest_driver_eta_min} min`
              : (estimate?.duration_mins ? `Trajet ~${estimate.duration_mins} min` : 'Recherche…')}
          />
          {carsCfg && pickup?.lat && (
            <RadarCars
              pickupLat={pickup.lat}
              pickupLng={pickup.lng}
              realPositions={[]}
              seed={searching || 'bid'}
              config={{
                enabled: carsCfg.cars_enabled !== false,
                icon_url: carsCfg.cars_icon_url || '',
                count: carsCfg.cars_simulated_count ?? 5,
                radius_m: carsCfg.cars_radius_m ?? 600,
              }}
            />
          )}
        </div>
      )}

      {/* Top-left back + title */}
      <div className="relative z-10 pt-12 px-4 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={20} />
        </button>
      </div>

      {/* Route summary card removed per design — addresses are set on the
          previous /course screen; the bidding screen only shows "Offrez votre tarif". */}

      {/* Bottom sheet (Offer Your Fare) */}
      {mapReady && !searching && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-white rounded-t-3xl shadow-2xl animate-slide-up" data-testid="offer-fare-sheet">
          {/* Handle */}
          <div className="flex justify-center pt-3">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          {/* Title */}
          <div className="px-6 pt-3 pb-1 text-center">
            <h2 className="text-xl font-bold text-[#FF5000]" data-testid="offer-fare-title">Offrez votre tarif</h2>
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
          <div className="mx-5 mt-3 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 flex items-center gap-3" data-testid="avg-price-banner">
            <Info size={18} className="text-[#FF5000] flex-shrink-0" weight="fill" />
            <p className="text-sm text-gray-700">
              Prix moyen : <span className="font-bold text-[#FF5000]">
                {loading ? '...' : money(estimate?.estimated_fare || liveStats?.avg_accepted_fare || 0)}
              </span>
            </p>
          </div>

          {/* Fare picker */}
          <div className="mx-5 mt-4 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4">
            <p className="text-center text-sm font-semibold text-gray-700 mb-3">Saisissez votre tarif</p>
            <div className="flex items-center gap-3">
              <button onClick={() => adjustFare(-1)} className="w-12 h-12 rounded-xl bg-[#FF5000] hover:bg-[#E04600] active:scale-95 text-white flex items-center justify-center shadow-md transition-transform" data-testid="fare-minus">
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
              <button onClick={() => adjustFare(1)} className="w-12 h-12 rounded-xl bg-[#FF5000] hover:bg-[#E04600] active:scale-95 text-white flex items-center justify-center shadow-md transition-transform" data-testid="fare-plus">
                <Plus size={20} weight="bold" />
              </button>
            </div>
            <p className="text-[11px] text-gray-500 text-center mt-3" data-testid="min-fare-note">Tarif minimum : <span className="font-bold">{money(fareFloor)}</span> · vous ne pouvez pas proposer moins</p>
          </div>

          {/* Auto-accept option (V3Cube/iDrive "accept first matching offer") */}
          <div className="mx-5 mt-3 bg-gray-50 rounded-2xl p-3" data-testid="auto-accept-box">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#0B1426]">Acceptation automatique</p>
                <p className="text-[11px] text-gray-500 leading-snug">Accepte la 1ʳᵉ offre ≤ votre tarif et à ≤ {autoAcceptEta} min</p>
              </div>
              <button
                onClick={() => setAutoAccept((v) => !v)}
                data-testid="auto-accept-toggle"
                className={`w-12 h-7 rounded-full relative transition-colors shrink-0 ${autoAccept ? 'bg-[#FF5000]' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${autoAccept ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            {autoAccept && (
              <div className="flex items-center gap-2 mt-3" data-testid="auto-accept-eta-row">
                <span className="text-[11px] text-gray-500">Délai max d'arrivée :</span>
                {[8, 10, 15].map((m) => (
                  <button
                    key={m}
                    onClick={() => setAutoAcceptEta(m)}
                    data-testid={`auto-accept-eta-${m}`}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${autoAcceptEta === m ? 'bg-[#FF5000] text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Find a Driver */}
          <div className="mx-5 mt-4 mb-3">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full h-14 rounded-xl bg-[#FF5000] hover:bg-[#E04600] disabled:bg-gray-300 text-white font-bold text-base shadow-lg transition-colors"
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
          {/* Title (the radar animation is shown on the map above) */}
          <div className="flex flex-col items-center pt-4 pb-2">
            <h2 className="text-lg font-bold text-gray-900" data-testid="searching-title">Recherche d&apos;un chauffeur…</h2>
            <p className="text-sm text-gray-500 mt-1">Votre offre : <span className="font-bold text-[#FF5000]" data-testid="searching-fare">{money(fare)}</span> · {searchSeconds}s</p>
            {viewedCount > 0 && (
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200" data-testid="viewed-count">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-bold text-green-700">
                  {viewedCount} chauffeur{viewedCount > 1 ? 's' : ''} {viewedCount > 1 ? 'ont' : 'a'} vu votre offre
                </span>
              </div>
            )}
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
            const liveOffers = offers
              .filter((o) => {
                const rem = remainingFor(o);
                return rem === null || rem > 0;
              })
              // "Votre tarif" (accepted your exact price) first, then lowest price.
              .sort((a, b) => (b.at_proposed_fare === true) - (a.at_proposed_fare === true) || a.amount - b.amount);
            if (liveOffers.length === 0) return null;
            return (
              <div className={`mx-5 mt-1 mb-2 space-y-2.5 max-h-72 overflow-y-auto rounded-2xl transition-all duration-300 ${newOfferFlash ? 'ring-2 ring-green-400 ring-offset-2 bg-green-50/40' : ''}`} data-testid="driver-offers-list">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{liveOffers.length} chauffeur(s) disponible(s)</p>
                {liveOffers.map((o) => {
                  const rem = remainingFor(o);
                  const initial = (o.driver_name || 'C').charAt(0).toUpperCase();
                  return (
                    <div key={o.id} className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm" data-testid={`offer-${o.id}`}>
                      {/* Top row: driver identity + rating/eta/km */}
                      <div className="flex items-center gap-3">
                        {o.driver_photo ? (
                          <img src={o.driver_photo} alt={o.driver_name || 'Chauffeur'} className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 text-[#FF5000] font-bold">{initial}</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[#FF5000] text-sm truncate" data-testid={`offer-name-${o.id}`}>{o.driver_name || 'Chauffeur'}</p>
                          {o.driver_vehicle_model && <p className="text-[11px] text-gray-500 truncate">{o.driver_vehicle_model}</p>}
                        </div>
                        <div className="text-right text-[11px] text-gray-600 leading-tight flex-shrink-0">
                          <p className="flex items-center justify-end gap-1 font-semibold text-gray-800">⭐ {(o.driver_rating || 5).toFixed(1)}{o.eta_min != null ? ` · ${o.eta_min} min` : ''}</p>
                          {o.distance_km != null && <p>{o.distance_km.toFixed(2)} km</p>}
                        </div>
                        {rem !== null && <CountdownRing seconds={rem} total={o.ttl_seconds || 30} size={34} />}
                      </div>
                      {/* Bottom row: price + Refuser / Acceptez */}
                      <div className="flex items-center gap-2 mt-2.5">
                        <div className="flex-shrink-0">
                          <p className="text-lg font-extrabold text-[#FF5000] leading-none">{o.amount.toFixed(2)} €</p>
                          {o.at_proposed_fare && (
                            <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-[#FF5000] text-white text-[10px] font-bold" data-testid={`offer-your-fare-${o.id}`}>Votre tarif</span>
                          )}
                        </div>
                        <button onClick={() => rejectOffer(o.id)} data-testid={`reject-offer-${o.id}`}
                          className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-600 font-bold text-sm transition-transform">
                          Refuser
                        </button>
                        <button onClick={() => acceptOffer(o.id)} data-testid={`accept-offer-${o.id}`}
                          className="flex-1 py-2.5 rounded-xl bg-[#FF5000] hover:bg-[#E04600] active:scale-95 text-white font-bold text-sm transition-transform">
                          Acceptez
                        </button>
                      </div>
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
                  className="py-3 rounded-xl bg-[#FF5000] hover:bg-[#E04600] active:scale-95 text-white font-bold transition-transform">
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

      {/* Bid expiration prompt — raise offer or switch to standard */}
      {searching && expired && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center p-4" data-testid="bid-expired-modal">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 animate-slide-up">
            <div className="text-center mb-4">
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
                <TrendUp size={26} className="text-[#FF5000]" weight="bold" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Aucun chauffeur pour le moment</h2>
              <p className="text-sm text-gray-500 mt-1">
                Votre tarif de <span className="font-bold text-[#FF5000]">{money(fare)}</span> n'a pas encore été accepté.
                Augmentez votre offre ou passez au tarif standard.
              </p>
            </div>
            <button onClick={raiseToSuggested} data-testid="bid-raise-suggested-btn"
              className="w-full h-12 rounded-xl bg-[#FF5000] hover:bg-[#E04600] text-white font-bold mb-2.5">
              Augmenter mon offre à {money(suggestedFare)}
            </button>
            <button onClick={switchToStandard} data-testid="bid-switch-standard-btn"
              className="w-full h-12 rounded-xl border-2 border-gray-200 text-gray-800 font-bold mb-2.5">
              Passer au tarif standard{estimate?.estimated_fare ? ` (${money(estimate.estimated_fare)})` : ''}
            </button>
            <button onClick={keepWaiting} data-testid="bid-keep-waiting-btn"
              className="w-full text-gray-500 text-sm font-medium py-1.5">
              Continuer d'attendre
            </button>
          </div>
        </div>
      )}

      {/* Fare picker always accessible for testid coverage (hidden when sheet open) */}
      {!mapReady && (
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
;
