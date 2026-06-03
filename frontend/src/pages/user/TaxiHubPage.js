/**
 * TaxiHubPage — Iter 86
 * Hub de réservation taxi unifié et moderne (16 modes V3Cube).
 * Design: "Swiss & High-Contrast" Tactical Bento Grid (cf. design_guidelines.json).
 * Prix live affiché dès que l'adresse est saisie. Chaque mode est spécifique.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, MapPin, FlagCheckered, CarProfile, UsersThree, Leaf, Motorcycle,
  Clock, MapTrifold, CalendarPlus, Key, Gavel, AirplaneTilt, PawPrint, UserPlus,
  Van, HandHeart, Briefcase, Wheelchair, Lightning, Plus, Minus,
  Money, CreditCard, Wallet, Tag, CheckCircle,
  House, NavigationArrow, Pencil, CaretRight, X, User,
} from '@phosphor-icons/react';
import GooglePlacesInput from '../../components/GooglePlacesInput';
import MapLocationPicker from '../../components/MapLocationPicker';
import { corporateAPI, couponAPI, placesAPI } from '../../services/api';

const API = process.env.REACT_APP_BACKEND_URL;

// ── 16 modes configuration ───────────────────────────────────────────────
const MODES = [
  // Everyday
  { id: 'standard', cat: 'everyday', label: 'Taxi VTC', sub: 'Course standard', icon: CarProfile, color: '#0B1426', vehicle: 'sb', ride_type: 'instant', panel: null, badge: null, cta: 'Commander' },
  { id: 'pool', cat: 'everyday', label: 'Pool', sub: 'Partagé, -30%', icon: UsersThree, color: '#3B82F6', vehicle: 'pool', ride_type: 'instant', panel: null, badge: '-30%', cta: 'Commander Pool' },
  { id: 'electric', cat: 'everyday', label: 'Green', sub: '100% électrique', icon: Leaf, color: '#10B981', vehicle: 'electric', ride_type: 'instant', panel: null, badge: 'Eco', cta: 'Commander Green' },
  { id: 'moto', cat: 'everyday', label: 'Moto', sub: 'Rapide en ville', icon: Motorcycle, color: '#EF4444', vehicle: 'moto', ride_type: 'instant', panel: null, badge: 'Fast', cta: 'Commander Moto' },
  // Time & Distance
  { id: 'rental', cat: 'time', label: 'Mise à Dispo', sub: 'Forfait horaire', icon: Clock, color: '#F59E0B', vehicle: 'confort', ride_type: 'rental', panel: 'rental', badge: null, cta: 'Réserver' },
  { id: 'intercity', cat: 'time', label: 'Intercité', sub: 'Longue distance', icon: MapTrifold, color: '#8B5CF6', vehicle: 'confort', ride_type: 'intercity', panel: 'datetime', badge: null, cta: 'Planifier le voyage' },
  { id: 'book_later', cat: 'time', label: 'Plus Tard', sub: 'Programmer', icon: CalendarPlus, color: '#0EA5E9', vehicle: 'sb', ride_type: 'scheduled', panel: 'datetime', badge: null, cta: 'Planifier' },
  { id: 'moto_rental', cat: 'time', label: 'Loc Moto', sub: 'Moto à l\'heure', icon: Key, color: '#DC2626', vehicle: 'moto', ride_type: 'rental', panel: 'rental', badge: null, cta: 'Louer Moto' },
  { id: 'buddy_driver', cat: 'time', label: 'Chauffeur Privé', sub: 'À l\'heure', icon: User, color: '#10B981', vehicle: 'confort', ride_type: 'buddy_driver', panel: 'buddy', badge: null, cta: 'Réserver' },
  // Specialty & Inclusive
  { id: 'bidding', cat: 'special', label: 'Enchères', sub: 'Proposez votre prix', icon: Gavel, color: '#EC4899', vehicle: 'sb', ride_type: 'instant', panel: 'bidding', badge: null, cta: 'Proposer un prix' },
  { id: 'airport', cat: 'special', label: 'Aéroport', sub: 'Suivi de vol', icon: AirplaneTilt, color: '#0EA5E9', vehicle: 'airport', ride_type: 'airport', panel: 'flight', badge: 'Fixe', cta: 'Réserver Aéroport' },
  { id: 'pets', cat: 'special', label: 'Animaux', sub: 'Pet friendly', icon: PawPrint, color: '#F97316', vehicle: 'pets', ride_type: 'instant', panel: 'pets', badge: null, cta: 'Commander' },
  { id: 'book_for_someone', cat: 'special', label: 'Pour un proche', sub: 'Réserver pour autrui', icon: UserPlus, color: '#14B8A6', vehicle: 'sb', ride_type: 'instant', panel: 'contact', badge: null, cta: 'Commander' },
  { id: 'tuktuk', cat: 'special', label: 'TukTuk', sub: 'Fun & local', icon: Van, color: '#84CC16', vehicle: 'tuktuk', ride_type: 'instant', panel: null, badge: null, cta: 'Commander TukTuk' },
  { id: 'assist', cat: 'special', label: 'Assistance', sub: 'Aide à la personne', icon: HandHeart, color: '#F43F5E', vehicle: 'assist', ride_type: 'instant', panel: 'assist', badge: null, cta: 'Demander Assistance' },
  { id: 'corporate', cat: 'special', label: 'Corporate', sub: 'Facturé entreprise', icon: Briefcase, color: '#334155', vehicle: 'confort', ride_type: 'corporate', panel: 'corporate', badge: null, cta: 'Commander Pro' },
  { id: 'access', cat: 'special', label: 'PMR', sub: 'Accès fauteuil', icon: Wheelchair, color: '#6366F1', vehicle: 'accessible', ride_type: 'instant', panel: null, badge: null, cta: 'Commander PMR' },
];

const CATS = [
  { key: 'everyday', title: 'Au quotidien' },
  { key: 'time', title: 'Temps & Distance' },
  { key: 'special', title: 'Spécialisé & Inclusif' },
];

const RENTAL_PACKAGES = [
  { slug: '2h_20km', label: '2h', km: 20, hours: 2 },
  { slug: '4h_40km', label: '4h', km: 40, hours: 4 },
  { slug: '8h_80km', label: '8h', km: 80, hours: 8 },
];

const ASSIST_OPTIONS = [
  { k: 'wheelchair', l: 'Fauteuil roulant' },
  { k: 'elderly', l: 'Personne âgée' },
  { k: 'medical', l: 'Sortie médicale' },
  { k: 'luggage', l: 'Aide bagages' },
];

const PAYMENT_METHODS = [
  { k: 'cash', l: 'Espèces', icon: Money },
  { k: 'card', l: 'Carte', icon: CreditCard },
  { k: 'sbpaygo', l: 'SB PayGo', icon: Wallet },
];

const TaxiHubPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const cameFromGrid = !params.get('mode');
  const [view, setView] = useState(params.get('mode') ? 'booking' : 'grid');
  const [modeId, setModeId] = useState(params.get('mode') || 'standard');
  const mode = useMemo(() => MODES.find((m) => m.id === modeId) || MODES[0], [modeId]);

  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [stops, setStops] = useState([]);
  const [pickupTiming, setPickupTiming] = useState('now'); // now | later
  const [forWho, setForWho] = useState('me'); // me | other
  const [topMenu, setTopMenu] = useState(null); // 'timing' | 'who' | null
  const [scheduledAt, setScheduledAt] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [rentalPkg, setRentalPkg] = useState('2h_20km');
  const [corpAccounts, setCorpAccounts] = useState([]);
  const [corpId, setCorpId] = useState('');
  const [petsCount, setPetsCount] = useState(1);
  const [petsSize, setPetsSize] = useState('small');
  const [assistNeeds, setAssistNeeds] = useState('wheelchair');
  const [bookForName, setBookForName] = useState('');
  const [bookForPhone, setBookForPhone] = useState('');
  const [biddingFare, setBiddingFare] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoApplied, setPromoApplied] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState({ home: null, work: null, recent: [] });
  const [locating, setLocating] = useState(false);
  const [buddyHours, setBuddyHours] = useState(4);
  const [mapPicker, setMapPicker] = useState({ open: false, target: 'dropoff' });

  const needsDropoff = !['rental', 'buddy_driver'].includes(mode.ride_type);
  const isRental = mode.ride_type === 'rental';
  const isBuddy = mode.id === 'buddy_driver';

  // ── Geolocation + reverse geocoding (auto-localize departure) ──
  const reverseGeocode = (lat, lng) => new Promise((resolve) => {
    const tryGeocode = () => {
      if (!window.google?.maps) return resolve(null);
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        resolve(status === 'OK' && results?.[0] ? results[0].formatted_address : null);
      });
    };
    if (window.google?.maps) return tryGeocode();
    let tries = 0;
    const iv = setInterval(() => {
      tries += 1;
      if (window.google?.maps) { clearInterval(iv); tryGeocode(); }
      else if (tries > 25) { clearInterval(iv); resolve(null); }
    }, 300);
  });

  const detectCurrentLocation = useCallback((announce = false) => {
    if (!navigator.geolocation) { if (announce) toast.error('Géolocalisation non supportée'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const address = (await reverseGeocode(latitude, longitude)) || 'Ma position actuelle';
        setPickup({ lat: latitude, lng: longitude, address });
        setLocating(false);
        if (announce) toast.success('Position actuelle définie comme départ');
      },
      () => { setLocating(false); if (announce) toast.error('Localisation indisponible (autorisez l\'accès)'); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  // Auto-localize departure + load saved places once on mount
  useEffect(() => {
    placesAPI.getSaved().then((r) => setSavedPlaces(r.data || { recent: [] })).catch(() => {});
    detectCurrentLocation(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySavedDestination = (place) => {
    if (!place?.address) return;
    setDropoff({ address: place.address, lat: place.lat, lng: place.lng });
  };

  const saveCurrentDestinationAs = async (kind) => {
    if (!dropoff?.lat) { toast.error('Entrez d\'abord une destination à enregistrer'); return; }
    try {
      await placesAPI.setSaved(kind, { address: dropoff.address, lat: dropoff.lat, lng: dropoff.lng });
      const r = await placesAPI.getSaved();
      setSavedPlaces(r.data);
      toast.success(kind === 'home' ? 'Adresse maison enregistrée' : 'Adresse travail enregistrée');
    } catch (e) { toast.error('Erreur enregistrement'); }
  };

  const selectMode = (id) => { setModeId(id); setTopMenu(null); setView('booking'); };
  const goBack = () => {
    if (view === 'booking' && cameFromGrid) { setView('grid'); setTopMenu(null); }
    else navigate('/home');
  };
  const addStop = () => setStops((s) => [...s, { address: '', lat: null, lng: null }]);
  const setStop = (idx, place) => setStops((s) => s.map((st, i) => (i === idx ? place : st)));
  const removeStop = (idx) => setStops((s) => s.filter((_, i) => i !== idx));

  // Default schedule time when switching to "later"
  useEffect(() => {
    if (pickupTiming === 'later' && !scheduledAt) {
      const d = new Date();
      d.setHours(d.getHours() + 1, 0, 0, 0);
      setScheduledAt(d.toISOString().slice(0, 16));
    }
  }, [pickupTiming, scheduledAt]);

  // default scheduled date
  useEffect(() => {
    if (mode.panel === 'datetime' && !scheduledAt) {
      const d = new Date();
      d.setHours(d.getHours() + 1, 0, 0, 0);
      setScheduledAt(d.toISOString().slice(0, 16));
    }
  }, [mode.panel, scheduledAt]);

  // load corporate accounts when corporate mode
  useEffect(() => {
    if (mode.id !== 'corporate') return;
    corporateAPI.my()
      .then((r) => {
        const items = r.data.items || [];
        setCorpAccounts(items);
        if (items.length && !corpId) setCorpId(items[0].join_code);
      })
      .catch((e) => console.warn('corp load:', e?.message || e));
  }, [mode.id, corpId]);

  // live estimate
  const fetchEstimate = useCallback(async () => {
    if (!pickup?.lat) { setEstimate(null); return; }
    if (needsDropoff && !dropoff?.lat) { setEstimate(null); return; }
    try {
      const dest = dropoff || pickup;
      const validStops = stops.filter((s) => s?.lat).map((s) => ({ address: s.address, lat: s.lat, lng: s.lng }));
      const r = await fetch(`${API}/api/rides/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
          dropoff_lat: dest.lat, dropoff_lng: dest.lng, dropoff_address: dest.address,
          vehicle_type: mode.vehicle, payment_method: 'cash',
          stops: validStops.length ? validStops : undefined,
        }),
      });
      if (r.ok) setEstimate(await r.json());
    } catch (e) { console.warn('estimate:', e?.message || e); }
  }, [pickup, dropoff, stops, mode.vehicle, needsDropoff]);

  useEffect(() => {
    const t = setTimeout(fetchEstimate, 350);
    return () => clearTimeout(t);
  }, [fetchEstimate]);

  // corporate discount preview
  const corpDiscount = useMemo(() => {
    if (mode.id !== 'corporate') return 0;
    const acc = corpAccounts.find((a) => a.join_code === corpId);
    return acc ? acc.discount_pct : 0;
  }, [mode.id, corpAccounts, corpId]);

  const displayPrice = useMemo(() => {
    if (!estimate?.estimated_fare) return null;
    let p = estimate.estimated_fare;
    if (corpDiscount) p = p * (1 - corpDiscount / 100);
    if (promoDiscount) p = Math.max(0, p - promoDiscount);
    return p;
  }, [estimate, corpDiscount, promoDiscount]);

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    const fareBase = estimate?.estimated_fare || 0;
    if (!fareBase) { toast.error('Saisissez d\'abord vos adresses'); return; }
    try {
      const r = await couponAPI.validate(promoCode.trim().toUpperCase(), fareBase, 'Ride');
      if (r.data?.valid) {
        setPromoDiscount(r.data.discount_amount || 0);
        setPromoApplied(true);
        toast.success(r.data.message || 'Code promo appliqué');
      } else {
        setPromoDiscount(0); setPromoApplied(false);
        toast.error(r.data?.message || 'Code invalide');
      }
    } catch (e) {
      setPromoDiscount(0); setPromoApplied(false);
      toast.error(e.response?.data?.detail || 'Code promo invalide');
    }
  };
  const clearPromo = () => { setPromoCode(''); setPromoDiscount(0); setPromoApplied(false); };

  const ctaLabel = useMemo(() => {
    if (mode.id === 'rental' || mode.id === 'moto_rental') {
      const pkg = RENTAL_PACKAGES.find((p) => p.slug === rentalPkg);
      return `${mode.cta} ${pkg?.label || ''}`.trim();
    }
    if (isBuddy) return `Réserver ${buddyHours}h`;
    if (mode.id === 'book_for_someone' && bookForName) return `Commander pour ${bookForName}`;
    return mode.cta;
  }, [mode, rentalPkg, bookForName]);

  const buildPayload = () => {
    const dest = dropoff || pickup;
    const base = {
      pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
      dropoff_lat: dest.lat, dropoff_lng: dest.lng, dropoff_address: dest.address,
      vehicle_type: mode.vehicle, payment_method: paymentMethod, ride_type: mode.ride_type,
    };
    if (promoApplied && promoCode) base.coupon_code = promoCode.trim().toUpperCase();
    if (mode.panel === 'datetime') base.scheduled_at = scheduledAt || null;
    if (mode.id === 'airport') base.flight_number = flightNumber || null;
    if (isRental) {
      const pkg = RENTAL_PACKAGES.find((p) => p.slug === rentalPkg);
      base.rental_package = rentalPkg;
      base.rental_hours = pkg?.hours || 2;
    }
    if (isBuddy) base.buddy_hours = buddyHours;
    if (mode.id === 'corporate') base.corporate_account_id = corpId || null;
    if (mode.id === 'pets') { base.pets_count = petsCount; base.pets_size = petsSize; }
    if (mode.id === 'assist') base.assist_needs = assistNeeds;
    if (mode.id === 'access') base.handicap_accessibility = true;
    if (mode.id === 'pool') base.pool_enabled = true;
    if (mode.id === 'book_for_someone') { base.book_for_name = bookForName; base.book_for_phone = bookForPhone; }
    // Top controls (apply to any mode)
    if (pickupTiming === 'later') {
      base.scheduled_at = scheduledAt || null;
      if (base.ride_type === 'instant') base.ride_type = 'scheduled';
    }
    if (forWho === 'other') { base.book_for_name = bookForName; base.book_for_phone = bookForPhone; }
    // Multi-stop waypoints
    const validStops = stops.filter((s) => s?.lat);
    if (validStops.length) base.stops = validStops.map((s) => ({ address: s.address, lat: s.lat, lng: s.lng }));
    return base;
  };

  const onSubmit = async () => {
    if (!pickup?.lat) return toast.error('Choisissez un lieu de départ');
    if (needsDropoff && !dropoff?.lat) return toast.error('Choisissez une destination');

    // Bidding delegates to the dedicated negotiation page
    if (mode.id === 'bidding') {
      const q = new URLSearchParams({
        pickup: pickup.address, plat: pickup.lat, plng: pickup.lng,
        dropoff: dropoff.address, dlat: dropoff.lat, dlng: dropoff.lng,
      });
      if (biddingFare) q.set('fare', biddingFare);
      return navigate(`/taxi-bidding?${q.toString()}`);
    }
    if ((mode.id === 'book_for_someone' || forWho === 'other') && !bookForName) return toast.error('Indiquez le nom du passager');

    setSubmitting(true);
    try {
      const r = await fetch(`${API}/api/rides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(buildPayload()),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      toast.success('Réservation enregistrée !');
      if (dropoff?.lat) placesAPI.addRecent({ address: dropoff.address, lat: dropoff.lat, lng: dropoff.lng }).catch(() => {});
      if (mode.panel === 'datetime') navigate('/scheduled-rides');
      else navigate(`/ride/${data.id}`);
    } catch (e) {
      toast.error('Échec : ' + (e.message || 'erreur'));
    } finally { setSubmitting(false); }
  };

  const Icon = mode.icon;

  return (
    <div className="mobile-container min-h-screen bg-[#F8F9FA] pb-40" data-testid="taxi-hub-page">
      {/* Header */}
      <div className="bg-[#0B1426] text-white px-5 pt-12 pb-6">
        <button onClick={goBack} className="mb-4" data-testid="taxi-hub-back"><ArrowLeft size={24} /></button>
        <p className="text-xs tracking-[0.2em] uppercase font-bold text-[#FFC107]">SB Drive · Se déplacer</p>
        <h1 className="text-3xl font-black tracking-tight mt-1">
          {view === 'grid' ? 'Choisissez un service' : 'Planifiez votre trajet'}
        </h1>

        {/* Top controls (booking view) — Ramassage / Pour qui */}
        {view === 'booking' && (
          <div className="flex gap-2 mt-4" data-testid="trip-top-controls">
            <div className="relative flex-1">
              <button onClick={() => setTopMenu(topMenu === 'timing' ? null : 'timing')}
                className="w-full bg-white/10 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 text-left" data-testid="timing-toggle">
                <span className="flex items-center gap-2 min-w-0"><Clock size={18} className="text-[#FFC107] flex-shrink-0" />
                  <span className="text-sm font-semibold truncate">{pickupTiming === 'now' ? 'Ramassage maintenant' : 'Plus tard'}</span>
                </span>
                <CaretRight size={14} className={`transition-transform ${topMenu === 'timing' ? 'rotate-90' : ''}`} />
              </button>
              {topMenu === 'timing' && (
                <div className="absolute z-30 mt-1 left-0 right-0 bg-white text-[#0B1426] rounded-xl shadow-xl overflow-hidden">
                  <button onClick={() => { setPickupTiming('now'); setTopMenu(null); }} className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50" data-testid="timing-now">Ramassage maintenant</button>
                  <button onClick={() => { setPickupTiming('later'); setTopMenu(null); }} className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 border-t" data-testid="timing-later">Programmer plus tard</button>
                </div>
              )}
            </div>
            <div className="relative flex-1">
              <button onClick={() => setTopMenu(topMenu === 'who' ? null : 'who')}
                className="w-full bg-white/10 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 text-left" data-testid="who-toggle">
                <span className="flex items-center gap-2 min-w-0"><UserPlus size={18} className="text-[#FFC107] flex-shrink-0" />
                  <span className="text-sm font-semibold truncate">{forWho === 'me' ? 'Pour moi' : 'Pour un proche'}</span>
                </span>
                <CaretRight size={14} className={`transition-transform ${topMenu === 'who' ? 'rotate-90' : ''}`} />
              </button>
              {topMenu === 'who' && (
                <div className="absolute z-30 mt-1 left-0 right-0 bg-white text-[#0B1426] rounded-xl shadow-xl overflow-hidden">
                  <button onClick={() => { setForWho('me'); setTopMenu(null); }} className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50" data-testid="who-me">Pour moi</button>
                  <button onClick={() => { setForWho('other'); setTopMenu(null); }} className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 border-t" data-testid="who-other">Pour un proche</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== GRID VIEW — only when choosing a service ("Plus de Services") ===== */}
      {view === 'grid' && (
      <div className="px-5 -mt-3" data-testid="mode-grid-view">
        {CATS.map((cat) => (
          <div key={cat.key} className="mb-5">
            <p className="text-[11px] tracking-[0.12em] uppercase font-bold text-slate-500 mb-2">{cat.title}</p>
            <div className={cat.key === 'everyday' ? 'grid grid-cols-2 gap-3' : cat.key === 'time' ? 'flex overflow-x-auto gap-3 pb-2 hide-scrollbar' : 'flex flex-wrap gap-2'}>
              {MODES.filter((m) => m.cat === cat.key).map((m) => {
                const MIcon = m.icon;
                if (cat.key === 'special') {
                  return (
                    <button key={m.id} data-testid={`mode-select-${m.id}`} onClick={() => selectMode(m.id)}
                      className="px-3.5 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5 border transition-colors bg-white text-[#0B1426] border-[#E2E8F0]">
                      <MIcon size={16} style={{ color: m.color }} /> {m.label}
                    </button>
                  );
                }
                return (
                  <button key={m.id} data-testid={`mode-select-${m.id}`} onClick={() => selectMode(m.id)}
                    className={`relative ${cat.key === 'everyday' ? 'aspect-[1.4]' : 'min-w-[136px]'} rounded-xl p-3 flex flex-col justify-between border text-left transition-all bg-white text-[#0B1426] border-[#E2E8F0] hover:border-[#0B1426]`}>
                    {m.badge && <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#FFC107] text-[#0B1426]">{m.badge}</span>}
                    <MIcon size={26} weight={cat.key === 'everyday' ? 'duotone' : 'regular'} style={{ color: m.color }} />
                    <div>
                      <p className="font-bold text-sm leading-tight">{m.label}</p>
                      <p className="text-[10px] text-slate-400">{m.sub}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* ===== BOOKING VIEW — "Planifiez votre trajet" (no other services shown) ===== */}
      {view === 'booking' && (
      <>
      {/* Selected service chip */}
      <div className="px-5 -mt-3 mb-2">
        <div className="bg-white rounded-xl border border-[#E2E8F0] px-3 py-2.5 flex items-center justify-between shadow-sm" data-testid="selected-service-chip">
          <span className="flex items-center gap-2">
            <Icon size={20} weight="duotone" style={{ color: mode.color }} />
            <span className="text-sm font-bold text-[#0B1426]">{mode.label}</span>
            <span className="text-[11px] text-slate-400">{mode.sub}</span>
          </span>
          <button onClick={() => { setView('grid'); setTopMenu(null); }} className="text-xs font-semibold text-indigo-600" data-testid="change-service-btn">Changer</button>
        </div>
      </div>

      {/* Booking sheet */}
      <div className="px-5">
        <div className="bg-white rounded-2xl shadow-[0_-2px_24px_rgba(11,20,38,0.06)] p-4 border border-[#E2E8F0]">
          {/* Date picker when "later" */}
          {pickupTiming === 'later' && (
            <div className="mb-3" data-testid="timing-datetime">
              <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Date & heure de ramassage</label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} min={new Date().toISOString().slice(0, 16)} className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="timing-datetime-input" />
            </div>
          )}
          {/* Passenger contact when "other" */}
          {forWho === 'other' && (
            <div className="mb-3 grid grid-cols-2 gap-2" data-testid="who-contact">
              <input value={bookForName} onChange={(e) => setBookForName(e.target.value)} placeholder="Nom du passager" className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm" data-testid="who-name-input" />
              <input value={bookForPhone} onChange={(e) => setBookForPhone(e.target.value)} placeholder="Téléphone" className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm" data-testid="who-phone-input" />
            </div>
          )}
          {/* Address entry */}
          <div className="mb-4" data-testid="address-block">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="border-l-4 border-[#0B1426] pl-3 py-1 mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500 flex items-center gap-1"><MapPin size={11} /> Départ</label>
                  <GooglePlacesInput value={pickup?.address || ''} onSelect={setPickup} placeholder="Lieu de prise en charge" testId="pickup-address-input" />
                </div>
                {needsDropoff && stops.map((s, idx) => (
                  <div key={`stop-${idx}`} className="border-l-4 border-slate-300 pl-3 py-1 mb-2 flex items-end gap-1" data-testid={`stop-row-${idx}`}>
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-400">Arrêt {idx + 1}</label>
                      <GooglePlacesInput value={s?.address || ''} onSelect={(p) => setStop(idx, p)} placeholder="Arrêt intermédiaire" testId={`stop-input-${idx}`} />
                    </div>
                    <button onClick={() => removeStop(idx)} className="p-1.5 text-gray-400 hover:text-red-500" data-testid={`remove-stop-${idx}`}><X size={16} /></button>
                  </div>
                ))}
                {needsDropoff && (
                  <div className="border-l-4 border-[#FFC107] pl-3 py-1">
                    <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500 flex items-center gap-1"><FlagCheckered size={11} /> Destination</label>
                    <GooglePlacesInput value={dropoff?.address || ''} onSelect={setDropoff} placeholder="Où allez-vous ?" testId="dropoff-address-input" />
                  </div>
                )}
              </div>
              {needsDropoff && (
                <button onClick={addStop} className="mt-7 w-9 h-9 rounded-full bg-blue-500 text-white flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform" title="Ajouter un arrêt" data-testid="add-stop-btn">
                  <Plus size={18} weight="bold" />
                </button>
              )}
            </div>

            {/* Lieux favoris / raccourcis (style V3Cube) */}
            {needsDropoff && (
              <div className="mt-3" data-testid="places-shortcuts">
                <button onClick={() => detectCurrentLocation(true)} disabled={locating}
                  className="w-full flex items-center gap-3 py-2.5 text-left active:opacity-70" data-testid="use-current-location-btn">
                  <span className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <NavigationArrow size={18} weight="fill" className="text-blue-500" />
                  </span>
                  <span className="text-sm font-semibold text-[#0B1426]">{locating ? 'Localisation…' : 'Utiliser ma localisation actuelle'}</span>
                </button>

                <button onClick={() => setMapPicker({ open: true, target: 'dropoff' })}
                  className="w-full flex items-center gap-3 py-2.5 text-left active:opacity-70 border-t border-gray-100" data-testid="set-on-map-btn">
                  <span className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <MapTrifold size={18} className="text-[#FFC107]" />
                  </span>
                  <span className="text-sm font-semibold text-[#0B1426]">Définir l'emplacement sur la carte</span>
                </button>

                {[{ kind: 'home', label: 'Maison', icon: House, place: savedPlaces.home },
                  { kind: 'work', label: 'Travail', icon: Briefcase, place: savedPlaces.work }].map(({ kind, label, icon: PIcon, place }) => (
                  <div key={kind} className="flex items-center gap-3 py-2.5 border-t border-gray-100" data-testid={`place-${kind}-row`}>
                    <span className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <PIcon size={18} className="text-gray-600" />
                    </span>
                    {place?.address ? (
                      <button onClick={() => applySavedDestination(place)} className="flex-1 text-left min-w-0" data-testid={`place-${kind}-use`}>
                        <p className="text-sm font-semibold text-[#0B1426] leading-tight">{label}</p>
                        <p className="text-xs text-gray-400 truncate">{place.address}</p>
                      </button>
                    ) : (
                      <span className="flex-1 text-sm font-semibold text-[#0B1426]">{label}</span>
                    )}
                    <button onClick={() => saveCurrentDestinationAs(kind)} className="p-1.5 text-gray-400 hover:text-[#0B1426]" title={place?.address ? 'Mettre à jour' : 'Enregistrer la destination actuelle'} data-testid={`place-${kind}-save`}>
                      {place?.address ? <Pencil size={16} /> : <Plus size={18} weight="bold" />}
                    </button>
                  </div>
                ))}

                {savedPlaces.recent?.length > 0 && (
                  <div className="border-t border-gray-100 pt-2 mt-1">
                    <p className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-400 mb-1">Lieux récents</p>
                    {savedPlaces.recent.slice(0, 4).map((rp, i) => (
                      <button key={`${rp.address}-${i}`} onClick={() => applySavedDestination(rp)} className="w-full flex items-center gap-3 py-2 text-left active:opacity-70" data-testid={`recent-place-${i}`}>
                        <MapPin size={16} className="text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-700 truncate flex-1">{rp.address}</span>
                        <CaretRight size={14} className="text-gray-300" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Live price card */}
          <AnimatePresence>
            {(displayPrice || isRental || isBuddy) && (
              <motion.div
                initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
                className="bg-[#0B1426] text-white p-4 rounded-xl flex items-center justify-between mb-4 relative overflow-hidden"
                data-testid="live-price-card">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#FFC107] to-transparent opacity-60" />
                <div>
                  <p className="text-[10px] tracking-[0.1em] uppercase text-[#FFC107] font-bold">{mode.label}</p>
                  {isRental ? (
                    <p className="text-xs text-white/60 mt-0.5">Forfait {RENTAL_PACKAGES.find((p) => p.slug === rentalPkg)?.label}</p>
                  ) : isBuddy ? (
                    <p className="text-xs text-white/60 mt-0.5">{buddyHours}h de chauffeur dédié</p>
                  ) : (
                    <p className="text-xs text-white/60 mt-0.5">{estimate?.distance_km?.toFixed(1)} km · {estimate?.duration_mins} min</p>
                  )}
                  {corpDiscount > 0 && <p className="text-[10px] text-emerald-400 font-bold mt-0.5">Remise entreprise -{corpDiscount}%</p>}
                  {promoDiscount > 0 && <p className="text-[10px] text-emerald-400 font-bold mt-0.5">Code promo -{promoDiscount.toFixed(2)} €</p>}
                </div>
                <div className="text-right">
                  <p className="text-4xl font-black tracking-tighter" data-testid="live-price-value">
                    {isRental ? `${(RENTAL_PACKAGES.find((p) => p.slug === rentalPkg)?.hours || 2) * 18}` : isBuddy ? `${buddyHours * 20}` : displayPrice?.toFixed(2)}<span className="text-lg"> €</span>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Dynamic mode-specific panels */}
          <AnimatePresence mode="wait">
            <motion.div key={mode.panel || 'none'} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              {mode.panel === 'datetime' && (
                <div data-testid="panel-datetime" className="mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Date & heure</label>
                  <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} min={new Date().toISOString().slice(0, 16)} className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="datetime-input" />
                </div>
              )}
              {mode.panel === 'flight' && (
                <div data-testid="panel-flight" className="mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">N° de vol (optionnel)</label>
                  <input value={flightNumber} onChange={(e) => setFlightNumber(e.target.value.toUpperCase())} placeholder="AF1234" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="flight-number-input" />
                  <p className="text-[10px] text-slate-400 mt-1">Nous suivons votre vol pour ajuster la prise en charge.</p>
                </div>
              )}
              {mode.panel === 'rental' && (
                <div data-testid="panel-rental" className="mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Forfait</label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {RENTAL_PACKAGES.map((p) => (
                      <button key={p.slug} onClick={() => setRentalPkg(p.slug)} data-testid={`rental-pkg-${p.slug}`}
                        className={`p-3 rounded-lg border text-center ${rentalPkg === p.slug ? 'border-[#F59E0B] bg-amber-50' : 'border-[#E2E8F0]'}`}>
                        <p className="font-bold">{p.label}</p><p className="text-[10px] text-slate-400">{p.km} km</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {mode.panel === 'buddy' && (
                <div data-testid="panel-buddy" className="mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Durée (heures)</label>
                  <div className="grid grid-cols-4 gap-2 mt-1">
                    {[1, 2, 4, 8].map((h) => (
                      <button key={h} onClick={() => setBuddyHours(h)} data-testid={`buddy-hours-${h}`}
                        className={`p-3 rounded-lg border text-center font-bold ${buddyHours === h ? 'border-[#10B981] bg-emerald-50 text-emerald-700' : 'border-[#E2E8F0]'}`}>{h}h</button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Un chauffeur dédié reste à votre disposition pendant toute la durée.</p>
                </div>
              )}
              {mode.panel === 'pets' && (
                <div data-testid="panel-pets" className="mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Nombre d'animaux</label>
                  <div className="flex items-center gap-4 mt-1 mb-3">
                    <button onClick={() => setPetsCount(Math.max(1, petsCount - 1))} className="w-9 h-9 rounded-full border border-[#E2E8F0] flex items-center justify-center" data-testid="pets-minus"><Minus size={16} /></button>
                    <span className="text-lg font-bold w-6 text-center" data-testid="pets-count">{petsCount}</span>
                    <button onClick={() => setPetsCount(petsCount + 1)} className="w-9 h-9 rounded-full border border-[#E2E8F0] flex items-center justify-center" data-testid="pets-plus"><Plus size={16} /></button>
                  </div>
                  <div className="flex gap-2">
                    {[{ k: 'small', l: 'Petit' }, { k: 'large', l: 'Grand' }].map((s) => (
                      <button key={s.k} onClick={() => setPetsSize(s.k)} data-testid={`pets-size-${s.k}`}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium ${petsSize === s.k ? 'border-[#F97316] bg-orange-50' : 'border-[#E2E8F0]'}`}>{s.l}</button>
                    ))}
                  </div>
                </div>
              )}
              {mode.panel === 'assist' && (
                <div data-testid="panel-assist" className="mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Type d'assistance</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {ASSIST_OPTIONS.map((o) => (
                      <button key={o.k} onClick={() => setAssistNeeds(o.k)} data-testid={`assist-${o.k}`}
                        className={`py-2 rounded-lg border text-sm font-medium ${assistNeeds === o.k ? 'border-[#F43F5E] bg-rose-50' : 'border-[#E2E8F0]'}`}>{o.l}</button>
                    ))}
                  </div>
                </div>
              )}
              {mode.panel === 'corporate' && (
                <div data-testid="panel-corporate" className="mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Compte entreprise</label>
                  {corpAccounts.length > 0 ? (
                    <select value={corpId} onChange={(e) => setCorpId(e.target.value)} className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="corporate-account-select">
                      {corpAccounts.map((a) => <option key={a.id} value={a.join_code}>{a.name} (-{a.discount_pct}%)</option>)}
                    </select>
                  ) : (
                    <button onClick={() => navigate('/corporate')} className="text-xs text-indigo-600 font-semibold mt-1" data-testid="join-corporate-link">Rejoindre une entreprise →</button>
                  )}
                </div>
              )}
              {mode.panel === 'contact' && (
                <div data-testid="panel-contact" className="mb-2 space-y-2">
                  <div>
                    <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Nom du passager</label>
                    <input value={bookForName} onChange={(e) => setBookForName(e.target.value)} placeholder="Ex: Marie" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="book-for-name-input" />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Téléphone</label>
                    <input value={bookForPhone} onChange={(e) => setBookForPhone(e.target.value)} placeholder="+33..." className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="book-for-phone-input" />
                  </div>
                </div>
              )}
              {mode.panel === 'bidding' && (
                <div data-testid="panel-bidding" className="mb-2">
                  <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Votre prix proposé (€)</label>
                  <input type="number" value={biddingFare} onChange={(e) => setBiddingFare(e.target.value)} placeholder={estimate?.estimated_fare ? `Suggéré: ${estimate.estimated_fare.toFixed(2)}` : '15.00'} className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="bidding-fare-input" />
                  <p className="text-[10px] text-slate-400 mt-1">Les chauffeurs proches verront votre offre et pourront l'accepter.</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Payment method — horizontal selector */}
          <div className="mt-1 mb-3" data-testid="payment-selector">
            <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Moyen de paiement</label>
            <div className="flex gap-2 mt-1.5 overflow-x-auto hide-scrollbar">
              {PAYMENT_METHODS.map((pm) => {
                const PmIcon = pm.icon;
                const active = paymentMethod === pm.k;
                return (
                  <button key={pm.k} onClick={() => setPaymentMethod(pm.k)} data-testid={`payment-${pm.k}`}
                    className={`flex-1 min-w-[96px] flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${active ? 'bg-[#0B1426] text-white border-transparent' : 'bg-white text-[#0B1426] border-[#E2E8F0]'}`}>
                    <PmIcon size={18} weight={active ? 'fill' : 'regular'} className={active ? 'text-[#FFC107]' : ''} /> {pm.l}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Promo code */}
          <div data-testid="promo-block">
            <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500 flex items-center gap-1"><Tag size={11} /> Code promo</label>
            {promoApplied ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 mt-1.5">
                <span className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5" data-testid="promo-applied-label">
                  <CheckCircle size={16} weight="fill" /> {promoCode.toUpperCase()} · -{promoDiscount.toFixed(2)} €
                </span>
                <button onClick={clearPromo} className="text-xs text-emerald-700 underline" data-testid="promo-clear-btn">Retirer</button>
              </div>
            ) : (
              <div className="flex gap-2 mt-1.5">
                <input value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder="Ex: SB10" className="flex-1 border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm" data-testid="promo-code-input" />
                <button onClick={applyPromo} className="px-4 rounded-xl bg-[#0B1426] text-white text-sm font-semibold" data-testid="promo-apply-btn">Appliquer</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky adaptive CTA */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-[#E2E8F0] p-4">
        <button onClick={onSubmit} disabled={submitting} data-testid="cta-book-button"
          className="w-full py-4 font-black text-lg flex items-center justify-center gap-2 rounded-xl active:scale-[0.98] transition-transform disabled:opacity-60"
          style={{ backgroundColor: '#FFC107', color: '#0B1426' }}>
          <Lightning size={20} weight="fill" /> {submitting ? 'Envoi…' : ctaLabel}
        </button>
      </div>
      </>
      )}

      <MapLocationPicker
        open={mapPicker.open}
        target={mapPicker.target}
        initial={mapPicker.target === 'pickup' ? pickup : dropoff}
        onClose={() => setMapPicker({ ...mapPicker, open: false })}
        onConfirm={(place, target) => {
          if (target === 'pickup') setPickup(place); else setDropoff(place);
          setMapPicker({ open: false, target });
        }}
      />
    </div>
  );
};

export default TaxiHubPage;
