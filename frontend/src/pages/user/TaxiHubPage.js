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
  ArrowLeft, MapPin, FlagCheckered, Clock, MapTrifold, CalendarPlus,
  UserPlus, Briefcase, Lightning, Plus, Bell, UsersThree,
  House, NavigationArrow, Pencil, CaretRight, X, Tag,
} from '@phosphor-icons/react';
import GooglePlacesInput from '../../components/GooglePlacesInput';
import MapLocationPicker from '../../components/MapLocationPicker';
import ScheduleCalendarModal from '../../components/ScheduleCalendarModal';
import { corporateAPI, couponAPI, placesAPI, configAPI } from '../../services/api';
import { MODES, RENTAL_PACKAGES } from './taxihub/taxiHubConstants';
import { TaxiModeGrid } from './taxihub/TaxiModeGrid';
import { TaxiModePanels } from './taxihub/TaxiModePanels';
import { TaxiCheckoutSection } from './taxihub/TaxiCheckoutSection';

const API = process.env.REACT_APP_BACKEND_URL;

const TaxiHubPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const cameFromGrid = !params.get('mode');
  // Redirect legacy /taxi?mode=X entries (incl. CMS-driven home tiles) to the
  // unified /course flow when the admin has it enabled.
  const [unifiedRedirecting, setUnifiedRedirecting] = useState(!!params.get('mode'));
  useEffect(() => {
    const m = params.get('mode');
    if (!m) { setUnifiedRedirecting(false); return; }
    configAPI.getTaxiBooking()
      .then((r) => {
        if (r.data?.unified_flow_enabled !== false) navigate(`/course?mode=${m}`, { replace: true });
        else setUnifiedRedirecting(false);
      })
      // On a transient config error, default to the unified flow (it is the
      // default-enabled state) so the old booking page never re-appears.
      .catch(() => navigate(`/course?mode=${m}`, { replace: true }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  const [poolSheetOpen, setPoolSheetOpen] = useState(false);
  const [poolSeats, setPoolSeats] = useState(1);
  const [savedPlaces, setSavedPlaces] = useState({ home: null, work: null, recent: [] });
  const [locating, setLocating] = useState(false);
  const [buddyHours, setBuddyHours] = useState(4);
  const [mapPicker, setMapPicker] = useState({ open: false, target: 'dropoff' });
  const [schedConfig, setSchedConfig] = useState({ enabled: true, min_advance_minutes: 60, max_advance_days: 30, disabled_modes: ['pool', 'bidding'] });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [catConfig, setCatConfig] = useState({}); // key -> { active, available, hint, name }
  const [remindedKeys, setRemindedKeys] = useState(new Set()); // services the user asked to be notified about
  const [taxiOpts, setTaxiOpts] = useState(null); // rental_packages / personal_driver / taxi_bid / ride_profiles
  const [rideProfiles, setRideProfiles] = useState([]); // Business / Personnel
  const [rideProfileId, setRideProfileId] = useState('');
  const [businessReasons, setBusinessReasons] = useState([]);
  const [businessReasonId, setBusinessReasonId] = useState('');

  // Scheduling allowance for the current mode (pool/bidding disabled by default)
  const modeSchedKey = mode.id === 'pool' ? 'pool' : (mode.id === 'bidding' ? 'bidding' : mode.id);
  const schedulingAllowed = schedConfig.enabled && !(schedConfig.disabled_modes || []).includes(modeSchedKey);
  // Admin can disable a Taxi mode or restrict it to time windows (service_categories)
  const modeDisabled = catConfig[mode.id]?.available === false;

  const needsDropoff = !['rental', 'buddy_driver'].includes(mode.ride_type);
  const isRental = mode.ride_type === 'rental';  const isBuddy = mode.id === 'buddy_driver';

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
    configAPI.getScheduling().then((r) => r.data && setSchedConfig(r.data)).catch(() => {});
    configAPI.getServiceCategories().then((r) => {
      const map = {};
      (r.data || []).forEach((c) => { map[c.key] = { active: c.active !== false, available: c.available_now !== false, hint: c.availability_hint || '', name: c.name }; });
      setCatConfig(map);
    }).catch(() => {});
    configAPI.getTaxiOptions().then((r) => r.data && setTaxiOpts(r.data)).catch(() => {});
    configAPI.getRideProfiles().then((r) => setRideProfiles(r.data || [])).catch(() => {});
    configAPI.getBusinessTripReasons().then((r) => setBusinessReasons(r.data || [])).catch(() => {});
    // Reminders: subscribed services + any that just reopened (in-app toast)
    configAPI.getServiceReminders().then((r) => {
      setRemindedKeys(new Set(r.data?.subscribed || []));
      (r.data?.ready || []).forEach((s) => toast.success(`🔔 ${s.name} est de nouveau disponible !`, { duration: 6000 }));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If scheduling not allowed for this mode, force "now"
  useEffect(() => {
    if (!schedulingAllowed && pickupTiming === 'later') setPickupTiming('now');
  }, [schedulingAllowed, pickupTiming]);

  // Auto-detect departure when the user starts on the destination (if pickup empty)
  const ensurePickupDetected = useCallback(() => {
    if (!pickup?.lat && !locating) detectCurrentLocation(false);
  }, [pickup, locating, detectCurrentLocation]);

  const applySavedDestination = (place) => {
    if (!place?.address) return;
    setDropoff({ address: place.address, lat: place.lat, lng: place.lng });
  };

  const formatScheduled = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }) +
      ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
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

  const selectMode = (id) => { navigate(`/course?mode=${id}`); };
  const toggleRemind = async (key, name) => {
    const isOn = remindedKeys.has(key);
    setRemindedKeys((prev) => { const n = new Set(prev); if (isOn) n.delete(key); else n.add(key); return n; });
    try {
      if (isOn) { await configAPI.unsubscribeServiceReminder(key); toast('Rappel annulé'); }
      else { await configAPI.subscribeServiceReminder(key); toast.success(`Vous serez prévenu à l'ouverture de ${name}`); }
    } catch {
      setRemindedKeys((prev) => { const n = new Set(prev); if (isOn) n.add(key); else n.delete(key); return n; }); // revert
      toast.error('Action impossible');
    }
  };
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
          pool_enabled: mode.id === 'pool',
          stops: validStops.length ? validStops : undefined,
        }),
      });
      if (r.ok) setEstimate(await r.json());
    } catch (e) { console.warn('estimate:', e?.message || e); }
  }, [pickup, dropoff, stops, mode.vehicle, mode.id, needsDropoff]);

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

  // Pool — V3Cube seat pricing: 1st seat = full fare, each extra seat = pool_percentage% of 1st
  const poolPercentage = estimate?.pool_percentage ?? 90;
  const poolMaxSeats = estimate?.available_seats ?? 4;
  const poolMult = (seats) => {
    const n = Math.max(1, seats);
    return 1 + (n - 1) * (poolPercentage / 100);
  };
  const poolFullFare = estimate?.original_fare ?? estimate?.estimated_fare ?? 0;
  const POOL_SEAT_OPTIONS = Array.from({ length: Math.max(1, Math.min(poolMaxSeats, 6)) }, (_, i) => i + 1);

  const displayPrice = useMemo(() => {
    if (!estimate?.estimated_fare) return null;
    let p = estimate.estimated_fare;
    if (mode.id === 'pool' && estimate.original_fare) p = estimate.original_fare * poolMult(poolSeats);
    if (corpDiscount) p = p * (1 - corpDiscount / 100);
    if (promoDiscount) p = Math.max(0, p - promoDiscount);
    return p;
  }, [estimate, corpDiscount, promoDiscount, mode.id, poolSeats, poolPercentage]);

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
      mode_id: mode.id,
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
    if (mode.id === 'pool') { base.pool_enabled = true; base.seats_required = poolSeats; }
    if (mode.id === 'book_for_someone') { base.book_for_name = bookForName; base.book_for_phone = bookForPhone; }
    // Top controls (apply to any mode)
    if (pickupTiming === 'later') {
      base.scheduled_at = scheduledAt || null;
      if (base.ride_type === 'instant') base.ride_type = 'scheduled';
    }
    if (forWho === 'other') { base.book_for_name = bookForName; base.book_for_phone = bookForPhone; }
    // Ride profile (Business / Personnel) + business trip reason
    if (rideProfileId) {
      const prof = rideProfiles.find((p) => p.id === rideProfileId);
      if (prof) {
        base.ride_profile = prof.short_name;
        base.ride_profile_org_type = prof.org_type;
        if (prof.org_type === 'Business' && businessReasonId) {
          const reason = businessReasons.find((b) => b.id === businessReasonId);
          if (reason) base.business_trip_reason = reason.trip_reason;
        }
      }
    }
    // Multi-stop waypoints
    const validStops = stops.filter((s) => s?.lat);
    if (validStops.length) base.stops = validStops.map((s) => ({ address: s.address, lat: s.lat, lng: s.lng }));
    return base;
  };

  const onSubmit = async () => {
    if (!pickup?.lat) return toast.error('Choisissez un lieu de départ');
    if (needsDropoff && !dropoff?.lat) return toast.error('Choisissez une destination');
    if (modeDisabled) return toast.error('Ce service est actuellement indisponible.');

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

  if (unifiedRedirecting) return <div className="mobile-container min-h-screen bg-[#F8F9FA]" data-testid="taxi-hub-redirecting" />;

  return (
    <div className="mobile-container min-h-screen bg-[#F8F9FA] pb-40" data-testid="taxi-hub-page">
      {/* Header */}
      <div className="bg-[#0B1426] text-white px-5 pt-12 pb-6">
        <button onClick={goBack} className="mb-4" data-testid="taxi-hub-back"><ArrowLeft size={24} /></button>
        <p className="text-xs tracking-[0.2em] uppercase font-bold text-[#FF5000]">SB Drive · Se déplacer</p>
        <h1 className="text-3xl font-black tracking-tight mt-1">
          {view === 'grid' ? 'Choisissez un service' : 'Planifiez votre trajet'}
        </h1>

        {/* Top controls (booking view) — Ramassage / Pour qui */}
        {view === 'booking' && (
          <div className="flex gap-2 mt-4" data-testid="trip-top-controls">
            <div className="relative flex-1">
              <button onClick={() => setTopMenu(topMenu === 'timing' ? null : 'timing')}
                className="w-full bg-white/10 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 text-left" data-testid="timing-toggle">
                <span className="flex items-center gap-2 min-w-0"><Clock size={18} className="text-[#FF5000] flex-shrink-0" />
                  <span className="text-sm font-semibold truncate">{pickupTiming === 'now' ? 'Ramassage maintenant' : 'Plus tard'}</span>
                </span>
                <CaretRight size={14} className={`transition-transform ${topMenu === 'timing' ? 'rotate-90' : ''}`} />
              </button>
              {topMenu === 'timing' && (
                <div className="absolute z-30 mt-1 left-0 right-0 bg-white text-[#0B1426] rounded-xl shadow-xl overflow-hidden">
                  <button onClick={() => { setPickupTiming('now'); setTopMenu(null); }} className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50" data-testid="timing-now">Ramassage maintenant</button>
                  {schedulingAllowed ? (
                    <button onClick={() => { setPickupTiming('later'); setTopMenu(null); setCalendarOpen(true); }} className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 border-t" data-testid="timing-later">Programmer plus tard</button>
                  ) : (
                    <div className="px-3 py-2.5 text-xs text-slate-400 border-t" data-testid="timing-later-disabled">Planification indisponible pour ce mode</div>
                  )}
                </div>
              )}
            </div>
            <div className="relative flex-1">
              <button onClick={() => setTopMenu(topMenu === 'who' ? null : 'who')}
                className="w-full bg-white/10 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 text-left" data-testid="who-toggle">
                <span className="flex items-center gap-2 min-w-0"><UserPlus size={18} className="text-[#FF5000] flex-shrink-0" />
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
      {view === 'grid' && <TaxiModeGrid catConfig={catConfig} onSelect={selectMode} remindedKeys={remindedKeys} onToggleRemind={toggleRemind} />}

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
        {modeDisabled && (
          <div className="mt-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5" data-testid="mode-unavailable-banner">
            <div className="flex items-center gap-2">
              <X size={16} weight="bold" className="text-rose-500 flex-shrink-0" />
              <span className="text-xs font-semibold text-rose-700">
                Ce service est actuellement indisponible.{catConfig[mode.id]?.hint ? ` ${catConfig[mode.id].hint}.` : ' Choisissez un autre service.'}
              </span>
            </div>
            <button onClick={() => toggleRemind(mode.id, catConfig[mode.id]?.name || mode.label)} data-testid={`remind-btn-${mode.id}`}
              className={`mt-2 w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${remindedKeys.has(mode.id) ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}>
              <Bell size={13} weight={remindedKeys.has(mode.id) ? 'fill' : 'bold'} />
              {remindedKeys.has(mode.id) ? 'Vous serez prévenu à l\'ouverture' : 'Me prévenir à l\'ouverture'}
            </button>
          </div>
        )}
      </div>

      {/* Booking sheet */}
      <div className="px-5">
        <div className="bg-white rounded-2xl shadow-[0_-2px_24px_rgba(11,20,38,0.06)] p-4 border border-[#E2E8F0]">
          {/* Date picker when "later" */}
          {pickupTiming === 'later' && (
            <div className="mb-3" data-testid="timing-datetime">
              <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Date & heure de ramassage</label>
              <button onClick={() => setCalendarOpen(true)} data-testid="timing-datetime-trigger"
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 mt-1 text-sm text-left flex items-center justify-between hover:border-[#0B1426]">
                <span className={scheduledAt ? 'text-[#0B1426] font-semibold' : 'text-slate-400'}>{formatScheduled(scheduledAt) || 'Choisir une date'}</span>
                <CalendarPlus size={16} className="text-[#FF5000]" />
              </button>
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
                  <div className="border-l-4 border-[#FF5000] pl-3 py-1">
                    <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500 flex items-center gap-1"><FlagCheckered size={11} /> Destination</label>
                    <GooglePlacesInput value={dropoff?.address || ''} onSelect={setDropoff} onFocus={ensurePickupDetected} placeholder="Où allez-vous ?" testId="dropoff-address-input" />
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
                    <MapTrifold size={18} className="text-[#FF5000]" />
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
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#FF5000] to-transparent opacity-60" />
                <div>
                  <p className="text-[10px] tracking-[0.1em] uppercase text-[#FF5000] font-bold">{mode.label}</p>
                  {isRental ? (
                    <p className="text-xs text-white/60 mt-0.5">Forfait {RENTAL_PACKAGES.find((p) => p.slug === rentalPkg)?.label}</p>
                  ) : isBuddy ? (
                    <p className="text-xs text-white/60 mt-0.5">{buddyHours}h de chauffeur dédié</p>
                  ) : (
                    <p className="text-xs text-white/60 mt-0.5">{estimate?.distance_km?.toFixed(1)} km · {estimate?.duration_mins} min</p>
                  )}
                  {corpDiscount > 0 && <p className="text-[10px] text-emerald-400 font-bold mt-0.5">Remise entreprise -{corpDiscount}%</p>}
                  {promoDiscount > 0 && <p className="text-[10px] text-emerald-400 font-bold mt-0.5">Code promo -{promoDiscount.toFixed(2)} €</p>}
                  {(estimate?.pricing_reasons || []).map((reason, i) => (
                    <p key={`pr-${i}`} className="text-[10px] text-amber-400 font-bold mt-0.5" data-testid={`pricing-reason-${i}`}>⚡ {reason}</p>
                  ))}
                </div>
                <div className="text-right">
                  <p className="text-4xl font-black tracking-tighter" data-testid="live-price-value">
                    {isRental ? `${(taxiOpts?.rental_packages?.packages?.find((p) => p.slug === rentalPkg)?.price ?? (RENTAL_PACKAGES.find((p) => p.slug === rentalPkg)?.hours || 2) * 18)}` : isBuddy ? `${buddyHours * (taxiOpts?.personal_driver?.hourly_rate || 20)}` : displayPrice?.toFixed(2)}<span className="text-lg"> €</span>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Dynamic mode-specific panels */}
          <TaxiModePanels
            mode={mode} scheduledAt={scheduledAt} formatScheduled={formatScheduled} setCalendarOpen={setCalendarOpen}
            flightNumber={flightNumber} setFlightNumber={setFlightNumber}
            rentalPkg={rentalPkg} setRentalPkg={setRentalPkg}
            buddyHours={buddyHours} setBuddyHours={setBuddyHours}
            petsCount={petsCount} setPetsCount={setPetsCount} petsSize={petsSize} setPetsSize={setPetsSize}
            assistNeeds={assistNeeds} setAssistNeeds={setAssistNeeds}
            corpAccounts={corpAccounts} corpId={corpId} setCorpId={setCorpId} navigate={navigate}
            bookForName={bookForName} setBookForName={setBookForName} bookForPhone={bookForPhone} setBookForPhone={setBookForPhone}
            biddingFare={biddingFare} setBiddingFare={setBiddingFare} estimate={estimate}
          />

          {/* Ride profile + payment + promo */}
          <TaxiCheckoutSection
            rideProfiles={rideProfiles} rideProfileId={rideProfileId} setRideProfileId={setRideProfileId}
            businessReasons={businessReasons} businessReasonId={businessReasonId} setBusinessReasonId={setBusinessReasonId}
            paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
            promoCode={promoCode} setPromoCode={setPromoCode} promoApplied={promoApplied}
            promoDiscount={promoDiscount} applyPromo={applyPromo} clearPromo={clearPromo}
          />
        </div>
      </div>

      {/* Sticky adaptive CTA */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-[#E2E8F0] p-4">
        <button
          onClick={() => (mode.id === 'pool' && estimate?.estimated_fare ? setPoolSheetOpen(true) : onSubmit())}
          disabled={submitting || modeDisabled} data-testid="cta-book-button"
          className="w-full py-4 font-black text-lg flex items-center justify-center gap-2 rounded-xl active:scale-[0.98] transition-transform disabled:opacity-60"
          style={{ backgroundColor: '#FF5000', color: '#0B1426' }}>
          <Lightning size={20} weight="fill" /> {submitting ? 'Envoi…' : modeDisabled ? 'Indisponible' : (mode.id === 'pool' ? 'Confirmer les détails' : ctaLabel)}
        </button>
      </div>

      {/* Pool — seat selection sheet (V3Cube parity) */}
      <AnimatePresence>
        {poolSheetOpen && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setPoolSheetOpen(false)} data-testid="pool-seats-sheet">
            <motion.div
              className="w-full max-w-[430px] bg-white rounded-t-2xl p-5 pb-8"
              initial={{ y: 320 }} animate={{ y: 0 }} exit={{ y: 320 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}>
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
              <h3 className="text-lg font-black text-[#0B1426] text-center">De combien de places avez-vous besoin ?</h3>
              <p className="text-xs text-gray-500 text-center mt-1">Service de taxi partagé rentable</p>

              <div className="grid grid-cols-2 gap-3 mt-5">
                {POOL_SEAT_OPTIONS.map((s) => {
                  const price = poolFullFare * poolMult(s);
                  const active = poolSeats === s;
                  return (
                    <button key={s} onClick={() => setPoolSeats(s)} data-testid={`pool-seat-${s}`}
                      className={`rounded-xl border-2 p-4 text-center transition-colors ${active ? 'border-[#FF5000] bg-[#FFF3EC]' : 'border-gray-200 bg-white'}`}>
                      <div className="flex items-center justify-center gap-1.5">
                        <UsersThree size={20} weight={active ? 'fill' : 'regular'} className={active ? 'text-[#FF5000]' : 'text-gray-500'} />
                        <span className={`text-2xl font-black ${active ? 'text-[#FF5000]' : 'text-[#0B1426]'}`}>{s}</span>
                      </div>
                      <p className="text-sm font-bold text-[#0B1426] mt-2">{price.toFixed(2)} €</p>
                      <p className="text-[10px] text-gray-400">{s === 1 ? 'place' : 'places'}</p>
                    </button>
                  );
                })}
              </div>

              {(() => {
                const poolTotal = poolFullFare * poolMult(poolSeats);
                const separateTotal = poolFullFare * poolSeats;
                const savings = separateTotal - poolTotal;
                if (poolSeats < 2 || savings < 0.01 || poolFullFare <= 0) return null;
                return (
                  <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-[#E9F9EF] border border-[#10B981]/30 p-3" data-testid="pool-savings-banner">
                    <Tag size={18} weight="fill" className="text-[#0B8A4B] mt-0.5 shrink-0" />
                    <p className="text-xs text-[#0B6B3A] leading-snug">
                      <span className="font-black">Vous économisez {savings.toFixed(2)} €</span>{' '}
                      en partageant&nbsp;: vous payez <span className="font-bold">{poolTotal.toFixed(2)} €</span>{' '}
                      au lieu de <span className="line-through text-[#0B6B3A]/70">{separateTotal.toFixed(2)} €</span>{' '}
                      ({poolSeats} places réservées séparément).
                    </p>
                  </div>
                );
              })()}

              <p className="text-[11px] text-gray-400 text-center mt-4">
                Ceci est juste un tarif estimé. Le montant final peut varier pendant le voyage.
              </p>

              <button
                onClick={() => { setPoolSheetOpen(false); onSubmit(); }}
                disabled={submitting} data-testid="pool-confirm-seats-btn"
                className="w-full mt-4 py-4 font-black text-lg rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
                style={{ backgroundColor: '#FF5000', color: '#0B1426' }}>
                {submitting ? 'Recherche…' : 'Confirmer les sièges'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </>
      )}

      <ScheduleCalendarModal
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        minAdvanceMinutes={schedConfig.min_advance_minutes}
        maxAdvanceDays={schedConfig.max_advance_days}
        initialValue={scheduledAt}
        onConfirm={(iso) => { setScheduledAt(iso); if (mode.panel !== 'datetime') setPickupTiming('later'); setCalendarOpen(false); }}
      />

      <MapLocationPicker
        open={mapPicker.open}
        target={mapPicker.target}
        initial={mapPicker.target === 'pickup' ? pickup : dropoff}
        onClose={() => setMapPicker({ ...mapPicker, open: false })}
        onConfirm={(place, target) => {
          if (target === 'pickup') setPickup(place); else setDropoff(place);
          // Mémoriser le point choisi dans les lieux récents
          if (place?.lat) {
            placesAPI.addRecent({ address: place.address, lat: place.lat, lng: place.lng })
              .then(() => placesAPI.getSaved().then((r) => setSavedPlaces(r.data)))
              .catch(() => {});
          }
          setMapPicker({ open: false, target });
        }}
      />
    </div>
  );
};

export default TaxiHubPage;
