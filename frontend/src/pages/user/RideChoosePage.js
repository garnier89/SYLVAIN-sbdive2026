/**
 * RideChoosePage — Flux de réservation taxi UNIFIÉ (parité V3Cube).
 * Point d'entrée unique pour TOUTES les commandes taxi (`/course?mode=<id>`).
 * Flux : départ + destination → écran « Choisissez un voyage » (tous les
 * véhicules avec prix + ETA en direct) → « Demander » → radar « Recherche
 * d'un chauffeur » → suivi (/ride/:id).
 * - Mode-aware : panneaux spécifiques (aéroport, programmation, animaux,
 *   assistance, corporate, pour un proche, enchères, location, chauffeur privé).
 * - Réservation via WhatsApp (numéro + message configurés par l'admin).
 * - Tout est piloté par l'admin via /admin/taxi-booking-config.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, NavigationArrow, UsersThree, Car, Motorcycle, Van, House, Briefcase,
  Money, CreditCard, Wallet, CheckCircle, Lightning, Info,
  CalendarPlus, AirplaneTilt, PawPrint, HandHeart, UserPlus, Gavel, Clock, Plus, Minus,
  CaretDown, MapTrifold, BellRinging,
} from '@phosphor-icons/react';
import GooglePlacesInput from '../../components/GooglePlacesInput';
import ScheduleCalendarModal from '../../components/ScheduleCalendarModal';
import RideRouteMap from '../../components/RideRouteMap';
import DynamicIcon from '../../components/DynamicIcon';
import { configAPI, rideAPI, placesAPI, corporateAPI, homeCategoriesAPI, geoAPI, walletAPI } from '../../services/api';
import { MODES, RENTAL_PACKAGES } from './taxihub/taxiHubConstants';
import { getGeocoder } from '../../lib/googleMaps';
import { useLocale } from '../../contexts/LocaleContext';

const COMPARISON_EXCLUDE = ['pool', 'airport', 'pets', 'assist', 'accessible'];

// Admin-configurable "Meilleur choix" badge colours → Tailwind classes.
const BADGE_COLOR_CLASSES = {
  Vert: 'bg-emerald-100 text-emerald-700',
  Orange: 'bg-orange-100 text-orange-700',
  Bleu: 'bg-blue-100 text-blue-700',
  Rouge: 'bg-red-100 text-red-700',
};

const PAYMENT_ICONS = { Money, CreditCard, Wallet, Lightning };

const DEFAULT_PAYMENTS = [
  { id: 'cash', label: 'Espèces', icon: 'Money' },
  { id: 'card', label: 'CB', icon: 'CreditCard' },
  { id: 'wallet', label: 'Portefeuille', icon: 'Wallet' },
  { id: 'sbpaygo', label: 'SB PayGo', icon: 'Lightning' },
];

const ASSIST_OPTIONS = [
  { k: 'wheelchair', l: 'Fauteuil roulant' },
  { k: 'elderly', l: 'Personne âgée' },
  { k: 'medical', l: 'Sortie médicale' },
  { k: 'luggage', l: 'Aide bagages' },
];

const vehicleIcon = (vt) => {
  const slug = (vt.slug || '').toLowerCase();
  const t = (vt.icon_type || '').toLowerCase();
  if (slug === 'moto' || slug === 'tuktuk' || t.includes('moto')) return Motorcycle;
  if (slug === 'van' || slug === 'suv' || t.includes('van') || (vt.person_capacity || 0) >= 6) return Van;
  return Car;
};

const formatScheduled = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }) +
    ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const RideChoosePage = () => {
  const navigate = useNavigate();
  const { money } = useLocale();
  const [params] = useSearchParams();
  const routerLocation = useLocation();
  const modeId = params.get('mode') || 'standard';
  const mode = useMemo(() => MODES.find((m) => m.id === modeId) || MODES[0], [modeId]);

  const isRental = mode.ride_type === 'rental';
  const isBuddy = mode.id === 'buddy_driver';
  const isBidding = mode.id === 'bidding';
  const isPool = mode.id === 'pool';
  const isIntercity = mode.id === 'intercity';
  const needsDropoff = !isRental && !isBuddy;
  const showComparison = needsDropoff && !isBidding;
  // Rich vehicle list (map + cards with live price, like the standard flow) —
  // used for ALL destination modes, including bidding (parité image client).
  const showVehicles = needsDropoff;

  const [cfg, setCfg] = useState({ unified_flow_enabled: true, whatsapp_enabled: false, whatsapp_number: '', whatsapp_message_template: '' });
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [schedConfig, setSchedConfig] = useState({ enabled: true, min_advance_minutes: 60, max_advance_days: 30, disabled_modes: ['pool', 'bidding'] });

  const [pickup, setPickup] = useState(() => {
    // Pre-filled départ via query params (deep-links + deterministic E2E).
    const plat = params.get('plat'), plng = params.get('plng');
    return (plat && plng)
      ? { lat: parseFloat(plat), lng: parseFloat(plng), address: params.get('paddr') || 'Départ' }
      : null;
  });
  const [dropoff, setDropoff] = useState(() => {
    // Pre-filled destination via query params (e.g. "Réserver un VTC jusqu'à cet arrêt")
    const dlat = params.get('dlat'), dlng = params.get('dlng');
    return (dlat && dlng)
      ? { lat: parseFloat(dlat), lng: parseFloat(dlng), address: params.get('daddr') || 'Arrêt' }
      : null;
  });
  const [vtypes, setVtypes] = useState([]);
  const [estimates, setEstimates] = useState({}); // slug -> { fare, duration, distance, loading, error }
  const [avgFares, setAvgFares] = useState({}); // slug -> avg accepted bidding fare (enchère hint)
  const [selected, setSelected] = useState(null);
  const [infoVehicle, setInfoVehicle] = useState(null); // ⓘ vehicle detail popup
  const [badgeCfg, setBadgeCfg] = useState({ enabled: true, label: 'Meilleur choix', color: 'Vert' });
  const [payOpen, setPayOpen] = useState(false); // payment method dropdown
  const [payment, setPayment] = useState('cash');
  const [payments, setPayments] = useState(DEFAULT_PAYMENTS);
  const [walletBalance, setWalletBalance] = useState(null);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState({ home: null, work: null, recent: [] });
  const [taxiOpts, setTaxiOpts] = useState(null);
  const [poolCfg, setPoolCfg] = useState(null); // GLOBAL « Configuration Pool » admin policy
  const [modeCms, setModeCms] = useState(null); // admin CMS override for label/sub/icon
  const [allCats, setAllCats] = useState([]); // « Catégories » (service_categories) — single source of truth

  // Mode-specific state
  const [scheduledAt, setScheduledAt] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [noDrivers, setNoDrivers] = useState(false);
  const [flightNumber, setFlightNumber] = useState('');
  const [airports, setAirports] = useState([]);
  const [airportId, setAirportId] = useState('');
  const [airportTerminal, setAirportTerminal] = useState('');
  const [flightArrivalTime, setFlightArrivalTime] = useState('');
  const [luggageAssist, setLuggageAssist] = useState(false);
  const [luggageCount, setLuggageCount] = useState(1);
  const [sharedShuttle, setSharedShuttle] = useState(false);
  const [rentalPkg, setRentalPkg] = useState('2h_20km');
  const [rentalStops, setRentalStops] = useState([]);
  const [buddyHours, setBuddyHours] = useState(4);
  const [petsCount, setPetsCount] = useState(1);
  const [petsSize, setPetsSize] = useState('small');
  const [assistNeeds, setAssistNeeds] = useState('wheelchair');
  const [corpAccounts, setCorpAccounts] = useState([]);
  const [corpId, setCorpId] = useState('');
  const [bookForName, setBookForName] = useState('');
  const [bookForPhone, setBookForPhone] = useState('');
  const [biddingFare, setBiddingFare] = useState('');
  const [poolSeats, setPoolSeats] = useState(1);
  const [roundTrip, setRoundTrip] = useState(false); // Intercity — aller-retour
  const [scheduleLater, setScheduleLater] = useState(mode.panel === 'datetime');
  const [showMap, setShowMap] = useState(false); // 2-step flow: address form → map + bottom sheet
  const [nearby, setNearby] = useState({ count: 0, etaMins: null, positions: [] }); // online drivers near pickup
  const [sheetExpanded, setSheetExpanded] = useState(false); // draggable bottom sheet (collapsed shows ~3 vehicles)
  const dragStartY = useRef(null);

  const schedulingAllowed = schedConfig.enabled && !(schedConfig.disabled_modes || []).includes(isBidding ? 'bidding' : mode.id);

  // ── Load config + reference data ──────────────────────────────────────
  useEffect(() => {
    configAPI.getTaxiBooking().then((r) => { if (r.data) setCfg(r.data); }).catch(() => {}).finally(() => setCfgLoaded(true));
    configAPI.getScheduling().then((r) => r.data && setSchedConfig(r.data)).catch(() => {});
    configAPI.getTaxiOptions().then((r) => r.data && setTaxiOpts(r.data)).catch(() => {});
    placesAPI.getSaved().then((r) => setSavedPlaces(r.data || { recent: [] })).catch(() => {});
    // Admin CMS entry for this mode (label/subtitle/icon) — edited in « Catégories accueil ».
    homeCategoriesAPI.public('taxi')
      .then((r) => {
        const items = r.data?.items || [];
        const match = items.find((it) => (it.target_route || '').includes(`mode=${mode.id}`));
        if (match) setModeCms(match);
      })
      .catch(() => {});
    // « Catégories de service » (service_categories) = SINGLE SOURCE OF TRUTH for the
    // mode name, shared with the home tiles and the /taxi hub. Fetched once; the active
    // category + its name are derived per-mode below (so SPA mode switches stay correct).
    configAPI.getServiceCategories()
      .then((r) => setAllCats(Array.isArray(r.data) ? r.data : (r.data?.items || [])))
      .catch(() => {});
    configAPI.getVehicleTypes()
      .then((res) => {
        const list = (res.data || [])
          .filter((v) => !COMPARISON_EXCLUDE.includes(v.slug))
          .sort((a, b) => (a.display_order || 99) - (b.display_order || 99));
        setVtypes(list);
        // Pre-select the mode's natural vehicle if present, else the first
        const preferred = list.find((v) => v.slug === mode.vehicle)?.slug || list[0]?.slug || null;
        setSelected(preferred);
      })
      .catch(() => toast.error('Impossible de charger les véhicules'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If admin disabled the unified flow → fall back to the legacy hub
  useEffect(() => {
    if (cfgLoaded && cfg.unified_flow_enabled === false) {
      navigate(`/taxi?mode=${mode.id}`, { replace: true });
    }
  }, [cfgLoaded, cfg.unified_flow_enabled, mode.id, navigate]);

  // Per-mode category (service_categories) — authoritative name, recomputed on mode switch.
  const activeCat = useMemo(() => allCats.find((c) => c.key === mode.id) || null, [allCats, mode.id]);
  const catName = activeCat?.name ? String(activeCat.name).trim() : null;
  // A category disabled by the admin is not bookable in the unified flow.
  useEffect(() => {
    if (activeCat && activeCat.active === false) {
      toast.error('Ce service est actuellement indisponible');
      navigate('/taxi', { replace: true });
    }
  }, [activeCat, navigate]);

  // Auto-localize the departure on mount (skip when pre-filled via URL params)
  useEffect(() => { if (!pickup) autoLocate(); /* eslint-disable-next-line */ }, []);

  // Admin-configurable "Meilleur choix" badge (enabled + label)
  useEffect(() => {
    configAPI.getVehicleBadge()
      .then((r) => { const d = r.data; if (d) setBadgeCfg({ enabled: !!d.enabled, label: d.label || 'Meilleur choix', color: d.color || 'Vert' }); })
      .catch(() => {});
  }, []);

  // Voice-assistant prefill (forwarded from the legacy /ride redirect): geocode
  // the spoken destination (and pickup) so the booking is ready to confirm.
  const voicePrefillRef = useRef(false);
  const applyVoicePrefill = (prefill) => {
    const vehicleMap = { 'vtc-taxi': 'sb', premium: 'luxe', van: 'van', 'moto-taxi': 'moto' };
    if (prefill.vehicle_type && vehicleMap[prefill.vehicle_type]) setSelected(vehicleMap[prefill.vehicle_type]);
    const geocode = (addr) => new Promise((resolve) => {
      if (!addr || addr === 'current_location') return resolve(null);
      getGeocoder().then((geocoder) => {
        if (!geocoder) return resolve(null);
        geocoder.geocode({ address: `${addr}, France` }, (res, status) => {
          if (status === 'OK' && res?.[0]) {
            const loc = res[0].geometry.location;
            resolve({ lat: loc.lat(), lng: loc.lng(), address: res[0].formatted_address || addr });
          } else resolve(null);
        });
      }).catch(() => resolve(null));
    });
    const waitMaps = (cb, tries = 0) => {
      if (window.google?.maps) return cb();
      if (tries > 30) return undefined;
      return setTimeout(() => waitMaps(cb, tries + 1), 200);
    };
    waitMaps(async () => {
      if (prefill.pickup && prefill.pickup !== 'current_location') {
        const p = await geocode(prefill.pickup); if (p) setPickup(p);
      }
      if (prefill.dropoff) { const d = await geocode(prefill.dropoff); if (d) setDropoff(d); }
    });
  };
  useEffect(() => {
    const prefill = routerLocation.state?.prefill;
    if (prefill && routerLocation.state?.source === 'voice' && !voicePrefillRef.current) {
      voicePrefillRef.current = true;
      // Defer to a microtask so no setState runs synchronously inside the effect
      // (React-Compiler `set-state-in-effect` safe — same pattern as LocaleContext).
      Promise.resolve().then(() => applyVoicePrefill(prefill));
    }
  }, [routerLocation.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default scheduled date (= now + minimum advance) when scheduling activates
  useEffect(() => {
    if (scheduleLater && !scheduledAt) {
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date(Date.now() + (schedConfig.min_advance_minutes || 60) * 60000);
      setScheduledAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    }
  }, [scheduleLater, scheduledAt, schedConfig.min_advance_minutes]);

  // For dedicated scheduling modes (Programmer Course / Intercity), open the
  // calendar immediately on landing — pre-filled at now + minimum advance.
  const calendarAutoOpened = useRef(false);
  useEffect(() => {
    if (cfgLoaded && mode.panel === 'datetime' && !calendarAutoOpened.current) {
      calendarAutoOpened.current = true;
      setScheduleLater(true);
      setCalendarOpen(true);
    }
  }, [cfgLoaded, mode.panel]);

  // Load corporate accounts for corporate mode
  useEffect(() => {
    if (mode.id !== 'corporate') return;
    corporateAPI.my().then((r) => {
      const items = r.data.items || [];
      setCorpAccounts(items);
      if (items.length && !corpId) setCorpId(items[0].join_code);
    }).catch((e) => console.warn('corp load:', e?.message || e));
  }, [mode.id, corpId]);

  const reverseGeocode = (lat, lng, attempt = 0) => new Promise((resolve) => {
    // Prefer the Google Maps JS Geocoder (no CORS/referrer issues unlike the REST
    // endpoint). Loaded via importLibrary fallback to survive the async loader.
    // Retry on throttling before falling back to coords.
    getGeocoder().then((geocoder) => {
      if (!geocoder) { resolve(`${lat.toFixed(5)}, ${lng.toFixed(5)}`); return; }
      geocoder.geocode(
        { location: { lat, lng } },
        (results, status) => {
          if (status === 'OK' && results?.[0]) { resolve(results[0].formatted_address); return; }
          if (status === 'OVER_QUERY_LIMIT' && attempt < 2) {
            setTimeout(() => reverseGeocode(lat, lng, attempt + 1).then(resolve), 1000 + attempt * 800);
            return;
          }
          resolve(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        },
      );
    }).catch((e) => { console.warn('[ride-choose] geocoder failed', e?.message); resolve(`${lat.toFixed(5)}, ${lng.toFixed(5)}`); });
  });

  // Load enabled payment methods (admin-configurable) + wallet balance.
  useEffect(() => {
    configAPI.getPaymentMethods()
      .then((r) => { if (Array.isArray(r.data?.methods) && r.data.methods.length) setPayments(r.data.methods); })
      .catch((e) => console.warn('payment methods load:', e?.message || e));
    walletAPI.get()
      .then((r) => setWalletBalance(typeof r.data?.balance === 'number' ? r.data.balance : 0))
      .catch((e) => console.warn('wallet load:', e?.message || e));
  }, []);

  // Load GLOBAL Pool config (eligible vehicles, payment methods, capacity, max stops).
  useEffect(() => {
    configAPI.getPoolConfig().then((r) => r.data && setPoolCfg(r.data)).catch(() => {});
  }, []);

  // Airport directory (admin-managed) — loaded for the Airport Transfer mode.
  useEffect(() => {
    if (mode.id !== 'airport') return;
    rideAPI.airports()
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        setAirports(list);
        if (list.length && !airportId) setAirportId(list[0].id);
      })
      .catch(() => {});
  }, [mode.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enchère only: average ACCEPTED fare per vehicle (recent rides) → fair-price hint.
  useEffect(() => {
    if (!isBidding) return;
    rideAPI.biddingAvgFares().then((r) => setAvgFares(r.data?.fares || {})).catch(() => {});
  }, [isBidding]);

  // In Pool mode, restrict the vehicle list & payment methods to the admin's policy.
  const effectiveVtypes = useMemo(() => {
    if (isPool && poolCfg?.eligible_vehicle_slugs?.length) {
      const set = new Set(poolCfg.eligible_vehicle_slugs);
      const f = vtypes.filter((v) => set.has(v.slug));
      return f.length ? f : vtypes;
    }
    return vtypes;
  }, [isPool, poolCfg, vtypes]);

  const effectivePayments = useMemo(() => {
    if (isPool && poolCfg?.payment_methods?.length) {
      const set = new Set(poolCfg.payment_methods);
      const f = payments.filter((p) => set.has(p.id));
      return f.length ? f : payments;
    }
    return payments;
  }, [isPool, poolCfg, payments]);

  // Keep the selected vehicle / payment valid within the Pool-restricted lists.
  useEffect(() => {
    if (selected && effectiveVtypes.length && !effectiveVtypes.some((v) => v.slug === selected)) {
      setSelected(effectiveVtypes[0].slug);
    }
  }, [effectiveVtypes, selected]);
  useEffect(() => {
    if (effectivePayments.length && !effectivePayments.some((p) => p.id === payment)) {
      setPayment(effectivePayments[0].id);
    }
  }, [effectivePayments, payment]);

  // IP-based approximate location — works even when the browser GPS is blocked
  // (e.g. inside the preview iframe, or when location permission is denied/off).
  // Resolved server-side (reads the real client IP) to avoid CORS / mixed-content.
  const ipLocate = async () => {
    try {
      const { data: d } = await geoAPI.ipLocate();
      if (d?.ok && d.lat != null && d.lng != null) {
        return { lat: d.lat, lng: d.lng, address: d.address };
      }
    } catch (e) { console.warn('[ride-choose] ip locate failed', e?.message); }
    return null;
  };

  async function autoLocate(announce = false) {
    setLocating(true);
    const fallbackToIp = async (errMsg) => {
      const ip = await ipLocate();
      setLocating(false);
      if (ip) {
        setPickup(ip);
        if (announce) toast.success('Position approximative définie (activez le GPS pour plus de précision)');
      } else if (announce) {
        toast.error(errMsg || 'Position introuvable');
      }
    };
    if (!navigator.geolocation) { await fallbackToIp('Géolocalisation indisponible'); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const address = await reverseGeocode(lat, lng);
        setPickup({ lat, lng, address });
        setLocating(false);
        if (announce) toast.success('Position actuelle définie comme départ');
      },
      () => { fallbackToIp('Position introuvable'); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }

  const applySaved = (place) => {
    if (place?.address) {
      setDropoff({ address: place.address, lat: place.lat, lng: place.lng });
    }
  };

  // Selecting an address (or geolocation resolving) advances to the map step via
  // the effect below — robust to the IP-geolocation race (pickup may resolve after
  // the destination is picked).
  const onPickupSelect = (p) => setPickup(p);
  const onDropoffSelect = (p) => setDropoff(p);

  const bothSet = !!(pickup?.lat && (needsDropoff ? dropoff?.lat : true));

  // Auto-advance to the map step ONCE both points are set (2-step flow). A ref
  // guards re-entry so the back button (← → form) is not immediately overridden;
  // re-entry from the form then uses the explicit « Continuer » button.
  const autoAdvancedRef = useRef(false);
  useEffect(() => {
    if (needsDropoff && bothSet && !autoAdvancedRef.current) {
      autoAdvancedRef.current = true;
      Promise.resolve().then(() => setShowMap(true));
    }
  }, [needsDropoff, bothSet]);

  // On the map step, poll online drivers near the pickup to reassure the rider
  // ('Chauffeur à ~X min') and drop car markers on the map.
  useEffect(() => {
    if (!(needsDropoff && bothSet && showMap) || !pickup?.lat) return undefined;
    let active = true;
    const load = () => rideAPI.nearbyDrivers(pickup.lat, pickup.lng)
      .then((r) => { if (active && r.data) setNearby({ count: r.data.count || 0, etaMins: r.data.eta_mins, positions: r.data.positions || [] }); })
      .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { active = false; clearInterval(t); };
  }, [needsDropoff, bothSet, showMap, pickup]);

  // ── Live estimates per vehicle (comparison modes only) ────────────────
  const fetchEstimates = useCallback(async () => {
    if (!showVehicles || !pickup?.lat || !dropoff?.lat || effectiveVtypes.length === 0) return;
    setEstimates(Object.fromEntries(effectiveVtypes.map((v) => [v.slug, { loading: true }])));
    const base = {
      pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
      dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, dropoff_address: dropoff.address,
      payment_method: 'cash', ride_type: mode.ride_type || 'instant', pool_enabled: isPool,
      seats_required: isPool ? poolSeats : 1, round_trip: isIntercity && roundTrip,
    };
    await Promise.all(effectiveVtypes.map(async (v) => {
      try {
        const res = await rideAPI.estimate({ ...base, vehicle_type: v.slug });
        const d = res.data;
        setEstimates((p) => ({ ...p, [v.slug]: { fare: d.estimated_fare, duration: d.duration_mins, distance: d.distance_km, maxPoolSeats: d.max_seats_per_booking, originalFare: d.original_fare, poolSavings: d.pool_savings, pricePerKm: d.price_per_km, loading: false } }));
      } catch {
        setEstimates((p) => ({ ...p, [v.slug]: { loading: false, error: true } }));
      }
    }));
  }, [showVehicles, effectiveVtypes, pickup, dropoff, mode.id, mode.ride_type, isPool, isIntercity, poolSeats, roundTrip]);

  useEffect(() => { const t = setTimeout(fetchEstimates, 350); return () => clearTimeout(t); }, [fetchEstimates]);

  // ── Pricing helpers ──────────────────────────────────────────────────
  const rentalPrice = useMemo(() => {
    const pkg = RENTAL_PACKAGES.find((p) => p.slug === rentalPkg);
    const adminPrice = taxiOpts?.rental_packages?.packages?.find((p) => p.slug === rentalPkg)?.price;
    return adminPrice ?? (pkg?.hours || 2) * 18;
  }, [rentalPkg, taxiOpts]);
  const buddyPrice = useMemo(() => buddyHours * (taxiOpts?.personal_driver?.hourly_rate || 20), [buddyHours, taxiOpts]);

  const selectedSlug = isRental || isBuddy ? mode.vehicle : selected;

  const displayPrice = useMemo(() => {
    if (isRental) return rentalPrice;
    if (isBuddy) return buddyPrice;
    if (isBidding) return biddingFare ? parseFloat(biddingFare) : (selected && estimates[selected]?.fare) || null;
    return selected ? estimates[selected]?.fare ?? null : null;
  }, [isRental, isBuddy, isBidding, rentalPrice, buddyPrice, biddingFare, selected, estimates]);

  // ── Submit ───────────────────────────────────────────────────────────
  const buildPayload = () => {
    const dest = dropoff || pickup;
    const base = {
      pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
      dropoff_lat: dest.lat, dropoff_lng: dest.lng, dropoff_address: dest.address,
      vehicle_type: selectedSlug, payment_method: payment, ride_type: mode.ride_type, mode_id: mode.id,
    };
    if ((mode.panel === 'datetime' || scheduleLater) && scheduledAt) {
      // Clamp to now + min advance: the value is pre-filled on mount and goes
      // stale while the user fills the form, otherwise the backend rejects (400).
      const pad = (n) => String(n).padStart(2, '0');
      const minTime = Date.now() + (schedConfig.min_advance_minutes || 60) * 60000;
      let sched = new Date(scheduledAt).getTime();
      if (isNaN(sched) || sched < minTime) sched = minTime;
      const d = new Date(sched);
      base.scheduled_at = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      if (base.ride_type === 'instant') base.ride_type = 'scheduled';
    }
    if (mode.id === 'airport') {
      base.flight_number = flightNumber || null;
      base.airport_id = airportId || null;
      base.airport_terminal = airportTerminal || null;
      base.flight_arrival_time = flightArrivalTime || null;
      base.luggage_assist = luggageAssist;
      base.luggage_count = luggageAssist ? luggageCount : null;
      base.shared_shuttle = sharedShuttle;
    }
    if (isRental) { const pkg = RENTAL_PACKAGES.find((p) => p.slug === rentalPkg); base.rental_package = rentalPkg; base.rental_hours = pkg?.hours || 2; base.stops = rentalStops.filter((s) => s?.lat); }
    if (isBuddy) base.buddy_hours = buddyHours;
    if (mode.id === 'corporate') base.corporate_account_id = corpId || null;
    if (mode.id === 'pets') { base.pets_count = petsCount; base.pets_size = petsSize; }
    if (mode.id === 'assist') base.assist_needs = assistNeeds;
    if (mode.id === 'access') base.handicap_accessibility = true;
    if (mode.id === 'pool') { base.pool_enabled = true; base.seats_required = poolSeats; }
    if (isIntercity && roundTrip) { base.round_trip = true; if (scheduledAt) base.return_at = scheduledAt; }
    if (mode.id === 'book_for_someone') { base.book_for_name = bookForName; base.book_for_phone = bookForPhone; }
    return base;
  };

  const onRequest = async () => {
    if (!pickup?.lat) return toast.error('Renseignez le départ');
    if (needsDropoff && !dropoff?.lat) return toast.error('Renseignez la destination');

    if (isBidding) {
      if (!selected) return toast.error('Choisissez un véhicule');
      const q = new URLSearchParams({
        pickup: pickup.address, plat: pickup.lat, plng: pickup.lng,
        dropoff: dropoff.address, dlat: dropoff.lat, dlng: dropoff.lng,
        vehicle: selectedSlug,
      });
      // Pre-fill the bid with the live estimate (or the rider's typed amount) as a reference.
      const refFare = biddingFare || (selected && estimates[selected]?.fare);
      if (refFare) q.set('fare', refFare);
      return navigate(`/taxi-bidding?${q.toString()}`);
    }
    if (showComparison && !selected) return toast.error('Choisissez un véhicule');
    if (showComparison && estimates[selected]?.error) return toast.error('Tarif indisponible pour ce véhicule');
    if (mode.id === 'book_for_someone' && !bookForName) return toast.error('Indiquez le nom du passager');

    const scheduled = (mode.panel === 'datetime' || scheduleLater) && scheduledAt;
    setSearching(true);
    try {
      const res = await rideAPI.create(buildPayload());
      if (dropoff?.lat) placesAPI.addRecent({ address: dropoff.address, lat: dropoff.lat, lng: dropoff.lng }).catch(() => {});
      const cd = res.data?.carried_debt;
      if (cd && Number(cd.amount) > 0) {
        toast.info(`Dette d'annulation de ${money(Number(cd.amount))} ajoutée à cette course.`, {
          description: 'À régler avec le paiement de la course (espèces, carte ou portefeuille).',
        });
      }
      if (scheduled) { toast.success('Course programmée !'); navigate('/scheduled-rides'); }
      else navigate(`/ride/${res.data.id}`);
    } catch (e) {
      setSearching(false);
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 409 && detail?.code === 'no_drivers_available') {
        setNoDrivers(true);
      } else {
        toast.error((typeof detail === 'string' ? detail : detail?.message) || 'Échec de la demande');
      }
    }
  };

  const ModeIcon = mode.icon || Car;

  const modePanelProps = {
    mode, isRental, isBuddy, isBidding,
    scheduleLater, setScheduleLater, schedulingAllowed,
    scheduledAt, setCalendarOpen,
    flightNumber, setFlightNumber,
    airports, airportId, setAirportId,
    airportTerminal, setAirportTerminal,
    flightArrivalTime, setFlightArrivalTime,
    luggageAssist, setLuggageAssist, luggageCount, setLuggageCount,
    sharedShuttle, setSharedShuttle,
    rentalPkg, setRentalPkg,
    rentalStops, setRentalStops, taxiOpts,
    buddyHours, setBuddyHours,
    petsCount, setPetsCount, petsSize, setPetsSize,
    assistNeeds, setAssistNeeds,
    corpAccounts, corpId, setCorpId,
    bookForName, setBookForName, bookForPhone, setBookForPhone,
    biddingFare, setBiddingFare,
    poolSeats, setPoolSeats,
    poolMax: (selected && estimates[selected]?.maxPoolSeats) || poolCfg?.max_seats_per_booking || 2,
    isIntercity, roundTrip, setRoundTrip,
    intercityEst: selected ? estimates[selected] : null,
  };

  // 2-step flow: the map step is shown once a destination is set (modes with a dropoff).
  const mapStep = needsDropoff && bothSet && showMap;

  const scheduleModal = (
    <ScheduleCalendarModal
      open={calendarOpen}
      onClose={() => setCalendarOpen(false)}
      minAdvanceMinutes={schedConfig.min_advance_minutes}
      maxAdvanceDays={schedConfig.max_advance_days}
      initialValue={scheduledAt}
      onConfirm={(iso) => { setScheduledAt(iso); setScheduleLater(true); setCalendarOpen(false); }}
    />
  );

  const requestAvailabilityAlert = async () => {
    try {
      await rideAPI.availabilityAlert({
        pickup_lat: pickup?.lat, pickup_lng: pickup?.lng, pickup_address: pickup?.address,
      });
      setNoDrivers(false);
      toast.success('Parfait ! Vous serez prévenu dès qu\'un chauffeur passe en ligne.');
    } catch {
      toast.error('Impossible d\'enregistrer l\'alerte. Réessayez.');
    }
  };

  const noDriversModal = noDrivers ? (
    <div className="fixed inset-0 z-[1700] bg-black/50 flex items-center justify-center p-6" data-testid="no-drivers-overlay">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
        <h3 className="text-lg font-extrabold text-gray-900 mb-1">Aucun chauffeur disponible</h3>
        <p className="text-sm text-gray-600 mb-4">
          Aucun chauffeur n'est en ligne pour le moment. Vous pouvez planifier votre course, ou être alerté dès qu'un chauffeur passe en ligne.
        </p>
        <div className="space-y-2">
          <button
            onClick={requestAvailabilityAlert}
            className="w-full py-2.5 rounded-xl bg-[#0B1426] text-white font-bold text-sm flex items-center justify-center gap-2"
            data-testid="no-drivers-notify"
          >
            <BellRinging size={18} weight="duotone" /> Me prévenir dès qu'un chauffeur est dispo
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => setNoDrivers(false)}
              className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm"
              data-testid="no-drivers-close"
            >
              Fermer
            </button>
            {schedulingAllowed && (
              <button
                onClick={() => { setNoDrivers(false); setScheduleLater(true); setCalendarOpen(true); }}
                className="flex-1 py-2.5 rounded-xl bg-[#FF5000] text-white font-bold text-sm"
                data-testid="no-drivers-schedule"
              >
                Planifier
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // Fallback descriptions when a vehicle has no admin-set `info`.
  const DEFAULT_VEHICLE_INFO = {
    sb: 'Taxi de base et de routine pour les trajets quotidiens.',
    confort: 'Confort supérieur pour vos trajets quotidiens.',
    luxe: 'Berline haut de gamme, chauffeur en costume.',
    moto: 'Déplacements rapides en moto, idéal en ville.',
    pool: 'Trajet partagé à prix réduit avec d\'autres passagers.',
    suv: 'Véhicule spacieux pour les voyages en groupe.',
    electric: 'Véhicule électrique, trajet propre et silencieux.',
    van: 'Grand véhicule pour les groupes et les bagages.',
  };
  const vehicleDesc = (v) => v.info || DEFAULT_VEHICLE_INFO[v.slug] || 'Trajet confortable jusqu\'à destination.';

  const renderVehicleList = () => {
    // "Meilleur choix" badge = best price-per-seat ratio among real cars
    // (capacity ≥ 4 — excludes Moto/TukTuk), e.g. SB at 10€/4. Shown when ≥2 eligible.
    let bestSlug = null; let _min = Infinity; let _pricedCount = 0;
    effectiveVtypes.forEach((v) => {
      const e = estimates[v.slug];
      const cap = v.person_capacity || 1;
      if (e && !e.loading && !e.error && e.fare != null && cap >= 4) {
        _pricedCount += 1;
        const ratio = e.fare / cap;
        if (ratio < _min) { _min = ratio; bestSlug = v.slug; }
      }
    });
    if (_pricedCount < 2) bestSlug = null;
    return (
    <div data-testid="choose-ride-section" className="space-y-2.5">
      {effectiveVtypes.map((v) => {
        const Icon = vehicleIcon(v);
        const est = estimates[v.slug] || {};
        const active = selected === v.slug;
        const img = active ? (v.image_selected || v.image_unselected) : (v.image_unselected || v.image_selected);
        const pickupEta = nearby.etaMins;
        const pickupTime = pickupEta != null
          ? new Date(Date.now() + pickupEta * 60000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          : null;
        return (
          <div key={v.slug} onClick={() => setSelected(v.slug)} data-testid={`choose-vehicle-${v.slug}`}
            className={`flex items-center gap-3 rounded-2xl border-2 p-3 cursor-pointer transition-colors ${active ? 'border-[#0B1426] bg-white' : 'border-transparent bg-gray-50'}`}>
            <div className="w-20 h-16 flex items-center justify-center shrink-0">
              {img ? <img src={img} alt={v.name_fr || v.slug} className="max-h-16 object-contain" /> : <Icon size={36} weight={active ? 'fill' : 'regular'} className={active ? 'text-[#FF5000]' : 'text-gray-500'} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <p className="font-black text-[#0B1426] text-base truncate">{v.name_fr || v.name || v.slug}</p>
                  <span className="flex items-center gap-0.5 text-xs text-gray-500 shrink-0"><UsersThree size={14} weight="fill" />{v.person_capacity || 4}</span>
                  {badgeCfg.enabled && v.slug === bestSlug && (
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide shrink-0 ${BADGE_COLOR_CLASSES[badgeCfg.color] || BADGE_COLOR_CLASSES.Vert}`} data-testid={`best-choice-${v.slug}`}>{badgeCfg.label}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {est.loading ? <div className="h-5 w-14 bg-gray-100 rounded animate-pulse" />
                    : est.error ? <span className="text-xs text-gray-300">—</span>
                    : <p className="font-black text-[#0B1426] text-base" data-testid={`price-${v.slug}`}>{est.fare != null ? money(est.fare) : '—'}</p>}
                  <button type="button" onClick={(e) => { e.stopPropagation(); setInfoVehicle(v); }} data-testid={`vehicle-info-${v.slug}`} className="text-gray-400 active:scale-90 transition-transform" aria-label="Détails du véhicule">
                    <Info size={17} weight="bold" />
                  </button>
                </div>
              </div>
              <p className="text-[12px] text-gray-500 mt-0.5">{pickupTime ? `${pickupTime} · ${pickupEta} min` : (est.duration != null ? `${est.duration} min` : '')}</p>
              <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">{vehicleDesc(v)}</p>
              {isBidding && avgFares[v.slug] != null && (
                <p className="text-[11px] font-semibold text-emerald-600 mt-0.5 flex items-center gap-1" data-testid={`avg-fare-${v.slug}`}>
                  <Gavel size={12} weight="fill" /> Tarif moyen accepté : {money(avgFares[v.slug])}
                </p>
              )}
              {isPool && est.originalFare && est.originalFare > est.fare && (
                <p className="text-[11px] text-gray-400 line-through leading-none mt-0.5" data-testid={`orig-price-${v.slug}`}>{money(est.originalFare)}</p>
              )}
              {isPool && est.poolSavings > 0 && (
                <p className="text-[11px] font-bold text-emerald-600 leading-none mt-0.5" data-testid={`savings-${v.slug}`}>-{money(est.poolSavings)}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
    );
  };

  const renderPayment = () => {
    const sel = payments.find((pm) => pm.id === payment) || payments[0];
    const SelIcon = PAYMENT_ICONS[sel?.icon] || Money;
    return (
      <>
        <h3 className="text-xs font-bold uppercase text-gray-400 mt-4 mb-2">Moyen de paiement</h3>
        <div className="relative" data-testid="payment-dropdown-wrap">
          <button type="button" onClick={() => setPayOpen((o) => !o)} data-testid="payment-dropdown"
            className="w-full flex items-center justify-between rounded-xl border-2 border-gray-200 bg-white py-3 px-3">
            <span className="flex items-center gap-2 text-sm font-bold text-[#0B1426]"><SelIcon size={18} weight="fill" /> {sel?.label}</span>
            <CaretDown size={16} weight="bold" className={`text-gray-400 transition-transform ${payOpen ? 'rotate-180' : ''}`} />
          </button>
          {payOpen && (
            <div className="absolute z-30 left-0 right-0 bottom-full mb-1.5 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden" data-testid="payment-dropdown-list">
              {effectivePayments.map((pm) => {
                const Icon = PAYMENT_ICONS[pm.icon] || Money; const active = payment === pm.id;
                return (
                  <button key={pm.id} type="button" onClick={() => { setPayment(pm.id); setPayOpen(false); }} data-testid={`ride-choose-pay-${pm.id}`}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left ${active ? 'bg-[#FFF3EC] text-[#FF5000] font-bold' : 'text-[#0B1426]'}`}>
                    <Icon size={18} weight={active ? 'fill' : 'regular'} /> {pm.label}
                    {active && <CheckCircle size={15} weight="fill" className="ml-auto text-[#FF5000]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {payment === 'wallet' && walletBalance != null && displayPrice != null && walletBalance < displayPrice && (
          <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 p-2.5 flex items-start gap-2" data-testid="wallet-shortfall-notice">
            <Wallet size={16} weight="duotone" className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[12px] text-amber-800 leading-snug">
              Solde portefeuille : <b>{money(Number(walletBalance))}</b>. Insuffisant — la différence de <b>{money(displayPrice - walletBalance)}</b> sera réglée en espèces.
            </p>
          </div>
        )}
        {payment === 'wallet' && walletBalance != null && displayPrice != null && walletBalance >= displayPrice && (
          <p className="mt-2 text-[12px] font-semibold text-emerald-700" data-testid="wallet-ok-notice">Solde portefeuille : {Number(walletBalance).toFixed(2)} € · suffisant ✓</p>
        )}
      </>
    );
  };

  const renderCta = () => {
    const selName = effectiveVtypes.find((v) => v.slug === selected)?.name_fr || effectiveVtypes.find((v) => v.slug === selected)?.name;
    const label = searching
      ? 'Recherche…'
      : isBidding
        ? 'Proposer mon tarif'
        : (showComparison && selName)
          ? `Choisir ${selName}`
          : `${mode.cta || 'Demander'}${displayPrice != null ? ` · ${money(Number(displayPrice))}` : ''}`;
    return (
      <button onClick={onRequest} disabled={searching || (showComparison && (!selected || estimates[selected]?.loading || estimates[selected]?.error)) || (isBidding && !selected)}
        className="w-full py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
        style={{ backgroundColor: '#FF5000', color: '#0B1426' }} data-testid="ride-choose-request-btn">
        <Lightning size={20} weight="fill" />
        {label}
      </button>
    );
  };

  // ── Step 2: full-screen map + bottom sheet (Uber/V3Cube style) ──
  const vehicleInfoModal = infoVehicle ? (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-end" onClick={() => setInfoVehicle(null)} data-testid="vehicle-info-modal">
      <div className="w-full bg-white rounded-t-3xl p-5 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
        <div className="flex items-center gap-4 mb-3">
          <div className="w-24 h-18 flex items-center justify-center shrink-0">
            {(infoVehicle.image_selected || infoVehicle.image_unselected)
              ? <img src={infoVehicle.image_selected || infoVehicle.image_unselected} alt={infoVehicle.name_fr || infoVehicle.slug} className="max-h-20 object-contain" />
              : <Car size={44} className="text-gray-400" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-black text-[#0B1426] truncate">{infoVehicle.name_fr || infoVehicle.name || infoVehicle.slug}</h3>
            <span className="flex items-center gap-1 text-sm text-gray-500 mt-0.5"><UsersThree size={16} weight="fill" /> {infoVehicle.person_capacity || 4} passagers</span>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-4 leading-snug">{vehicleDesc(infoVehicle)}</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-gray-400">Prise en charge</p>
            <p className="font-black text-[#0B1426] text-sm mt-0.5">{money(Number(infoVehicle.base_fare || infoVehicle.pickup_price || 0))}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-gray-400">Par km</p>
            <p className="font-black text-[#0B1426] text-sm mt-0.5">{money(Number(infoVehicle.price_per_km || 0))}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-gray-400">Par min</p>
            <p className="font-black text-[#0B1426] text-sm mt-0.5">{money(Number(infoVehicle.price_per_min || 0))}</p>
          </div>
        </div>
        <button onClick={() => { setSelected(infoVehicle.slug); setInfoVehicle(null); }} data-testid="vehicle-info-select-btn"
          className="w-full py-3.5 rounded-xl bg-[#FF5000] text-white font-black active:scale-[0.98] transition-transform">
          Choisir {infoVehicle.name_fr || infoVehicle.name || infoVehicle.slug}
        </button>
      </div>
    </div>
  ) : null;

  if (mapStep) {
    return (
      <div className="mobile-container h-[100dvh] bg-gray-100 flex flex-col overflow-hidden" data-testid="ride-choose-page">
        <div className="relative flex-1 min-h-0">
          <RideRouteMap pickup={pickup} dropoff={dropoff} drivers={nearby.positions} />
          <button onClick={() => { setShowMap(false); setPayOpen(false); }} className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center z-20" data-testid="map-back-btn">
            <ArrowLeft size={20} className="text-[#0B1426]" />
          </button>
          <div className="absolute top-4 right-4 left-16 bg-white rounded-xl shadow-lg px-3 py-2 z-20" data-testid="map-dest-chip">
            <p className="text-[9px] uppercase text-gray-400 font-bold leading-none mb-0.5">Destination</p>
            <p data-testid="ride-choose-dropoff-display" className="text-xs font-semibold text-[#0B1426] truncate">{dropoff?.address}</p>
          </div>
          {nearby.etaMins != null ? (
            <div className="absolute left-4 bottom-3 bg-[#0B1426] text-white rounded-full pl-2.5 pr-3.5 py-1.5 shadow-lg z-20 flex items-center gap-2" data-testid="driver-eta-chip">
              <Car size={16} weight="fill" className="text-[#FF5000]" />
              <span className="text-xs font-bold">Chauffeur à ~{nearby.etaMins} min</span>
            </div>
          ) : (
            <div className="absolute left-4 bottom-3 bg-white/90 backdrop-blur rounded-full px-3 py-1.5 shadow-lg z-20 flex items-center gap-2" data-testid="driver-eta-chip">
              <Car size={15} weight="regular" className="text-gray-400" />
              <span className="text-[11px] font-semibold text-gray-500">Recherche de chauffeurs proches…</span>
            </div>
          )}
        </div>
        <div className={`bg-white rounded-t-3xl -mt-5 z-10 flex flex-col shrink-0 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] transition-[height] duration-300 ${sheetExpanded ? 'h-[88vh]' : 'h-[52vh]'}`} data-testid="map-bottom-sheet">
          {/* Drag handle — tap or swipe up/down to expand/collapse the sheet */}
          <div
            className="pt-2.5 pb-2 flex flex-col items-center shrink-0 cursor-grab active:cursor-grabbing select-none"
            data-testid="sheet-drag-handle"
            onClick={() => { if (dragStartY.current === 'dragged') { dragStartY.current = null; return; } setSheetExpanded((v) => !v); }}
            onTouchStart={(e) => { dragStartY.current = e.touches[0].clientY; }}
            onTouchMove={(e) => {
              if (typeof dragStartY.current !== 'number') return;
              const dy = dragStartY.current - e.touches[0].clientY;
              if (dy > 28) { setSheetExpanded(true); dragStartY.current = 'dragged'; }
              else if (dy < -28) { setSheetExpanded(false); dragStartY.current = 'dragged'; }
            }}
            onPointerDown={(e) => { dragStartY.current = e.clientY; }}
            onPointerMove={(e) => {
              if (typeof dragStartY.current !== 'number') return;
              const dy = dragStartY.current - e.clientY;
              if (dy > 28) { setSheetExpanded(true); dragStartY.current = 'dragged'; }
              else if (dy < -28) { setSheetExpanded(false); dragStartY.current = 'dragged'; }
            }}
          >
            <div className="w-10 h-1.5 rounded-full bg-gray-300" />
          </div>
          <div className="px-4 overflow-y-auto flex-1 min-h-0">
            <h2 className="text-base font-black text-[#0B1426] mb-3">{isBidding ? 'Proposez votre prix' : 'Choisissez un voyage'}</h2>
            {showVehicles && selected && estimates[selected]?.duration != null && (
              <div className="flex items-center gap-1.5 -mt-2 mb-3 text-[11px] text-gray-500" data-testid="arrival-estimate">
                <Clock size={13} weight="bold" className="text-[#FF5000]" />
                <span>Trajet ~{estimates[selected].duration} min
                  {` · arrivée vers ${new Date(Date.now() + ((nearby.etaMins || 0) + estimates[selected].duration) * 60000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                </span>
              </div>
            )}
            {(isPool || isIntercity) && <ModeSpecificPanel {...modePanelProps} />}
            {showVehicles && renderVehicleList()}
          </div>
          {/* Pinned footer: payment + CTA always visible */}
          <div className="px-4 pt-2 pb-4 border-t border-gray-100 shrink-0 space-y-2 bg-white rounded-b-3xl">
            {renderPayment()}
            {renderCta()}
          </div>
        </div>
        {vehicleInfoModal}
        {scheduleModal}{noDriversModal}
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 flex flex-col" data-testid="ride-choose-page">
      {/* Compact orange header (admin-editable texts) */}
      <div className="bg-[#FF5000] px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/home')} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0" data-testid="ride-choose-back">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <div className="min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-white/90 block leading-none" data-testid="ride-choose-eyebrow">{cfg.booking_header_eyebrow || 'SB Drive · Se déplacer'}</span>
            <h1 className="text-lg font-black text-white leading-tight truncate" data-testid="ride-choose-title">{catName || cfg.booking_header_title || mode.label}</h1>
          </div>
        </div>
        <div className="mt-2 inline-flex items-center gap-2 bg-white/15 border border-white/25 rounded-full px-3 py-1" data-testid="ride-choose-mode-chip">
          {modeCms ? (
            <DynamicIcon name={modeCms.icon_name} imageUrl={modeCms.image_url} size={15} weight="duotone" className="text-white" />
          ) : (
            <ModeIcon size={15} weight="duotone" className="text-white" />
          )}
          <span className="text-xs font-bold text-white">{catName || (modeCms?.label_fr ? modeCms.label_fr.replace(/\n/g, ' ') : mode.label)}</span>
          <span className="text-[10px] text-white/70">{modeCms?.subtitle_fr || mode.sub}</span>
        </div>
      </div>

      <div className="flex-1 bg-gray-50 px-4 pt-4 pb-36 overflow-y-auto">
        {/* Address card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-2">
          <div>
            <p className="text-[10px] font-bold uppercase text-gray-400 mb-1 ml-1">
              Départ{locating && !pickup?.address ? ' · Localisation…' : ''}
            </p>
            <GooglePlacesInput placeholder="Lieu de départ" value={pickup?.address || ''} iconColor="#22C55E" testId="ride-choose-pickup" onSelect={onPickupSelect} />
          </div>
          {needsDropoff && (
            <div>
              <p className="text-[10px] font-bold uppercase text-gray-400 mb-1 ml-1">Destination</p>
              <GooglePlacesInput placeholder="Où allez-vous ?" value={dropoff?.address || ''} iconColor="#EF4444" testId="ride-choose-dropoff" onSelect={onDropoffSelect} />
            </div>
          )}
          <button onClick={() => autoLocate(true)} disabled={locating} className="flex items-center gap-2 text-sm font-semibold text-[#FF5000] pl-1 pt-1" data-testid="ride-choose-locate">
            <NavigationArrow size={16} weight="fill" />
            {locating ? 'Localisation…' : 'Utiliser ma position actuelle'}
          </button>

          {/* Favourite places shortcuts */}
          {needsDropoff && (savedPlaces.home || savedPlaces.work || savedPlaces.recent?.length > 0) && (
            <div className="pt-1 border-t border-gray-100" data-testid="ride-choose-favourites">
              {[{ k: 'home', l: 'Maison', Icon: House, place: savedPlaces.home }, { k: 'work', l: 'Travail', Icon: Briefcase, place: savedPlaces.work }]
                .filter((x) => x.place?.address)
                .map(({ k, l, Icon, place }) => (
                  <button key={k} onClick={() => applySaved(place)} className="w-full flex items-center gap-3 py-2 text-left active:opacity-70" data-testid={`ride-choose-fav-${k}`}>
                    <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><Icon size={16} className="text-gray-600" /></span>
                    <span className="min-w-0"><span className="text-sm font-semibold text-[#0B1426] block leading-tight">{l}</span><span className="text-[11px] text-gray-400 truncate block">{place.address}</span></span>
                  </button>
                ))}
              {savedPlaces.recent?.slice(0, 3).map((rp, i) => (
                <button key={`${rp.address}-${i}`} onClick={() => applySaved(rp)} className="w-full flex items-center gap-3 py-1.5 text-left active:opacity-70" data-testid={`ride-choose-recent-${i}`}>
                  <span className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center shrink-0"><Clock size={15} className="text-gray-400" /></span>
                  <span className="text-sm text-gray-700 truncate">{rp.address}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mode-specific panels */}
        <ModePanel {...modePanelProps} />

        {/* Choose a ride — vehicles/payment now live on the map step (step 2) for
            destination modes; rental/buddy (no dropoff) keep an inline price + payment. */}

        {/* Single price card (rental / buddy) */}
        {(isRental || isBuddy) && pickup?.lat && (
          <div className="mt-5 bg-[#0B1426] text-white p-4 rounded-2xl flex items-center justify-between" data-testid="single-price-card">
            <div>
              <p className="text-[10px] tracking-wider uppercase text-[#FF5000] font-bold">{catName || mode.label}</p>
              <p className="text-xs text-white/60 mt-0.5">{isRental ? `Forfait ${RENTAL_PACKAGES.find((p) => p.slug === rentalPkg)?.label}` : `${buddyHours}h de chauffeur dédié`}</p>
            </div>
            <p className="text-3xl font-black" data-testid="single-price-value">{money(Number(displayPrice))}</p>
          </div>
        )}

        {/* Inline payment for rental/buddy (these modes have no map step) */}
        {!needsDropoff && bothSet && <div className="mt-1">{renderPayment()}</div>}
      </div>

      {/* Sticky bottom bar */}
      {needsDropoff && bothSet ? (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 p-4 z-20">
          <button onClick={() => setShowMap(true)} className="w-full py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform" style={{ backgroundColor: '#FF5000', color: '#0B1426' }} data-testid="continue-to-map-btn">
            <NavigationArrow size={20} weight="fill" /> Continuer · Voir les tarifs
          </button>
        </div>
      ) : (!needsDropoff && bothSet && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 p-4 z-20">
          {renderCta()}
        </div>
      ))}

      {scheduleModal}{noDriversModal}
    </div>
  );
};

// ── Mode-specific compact panels ────────────────────────────────────────
// Renders the mode-specific panel AND (independently) an optional schedule
// card — the two are siblings so neither shadows the other.
const ModePanel = (p) => (
  <>
    <ModeSpecificPanel {...p} />
    <SchedulePanel {...p} />
  </>
);

const SchedulePanel = (p) => {
  const { mode } = p;
  const isDatetimeMode = mode.panel === 'datetime';
  const canScheduleToggle = !p.isRental && !p.isBuddy && !p.isBidding && p.schedulingAllowed;
  if (!isDatetimeMode && !canScheduleToggle) return null;
  const showPicker = isDatetimeMode || p.scheduleLater;
  return (
    <div className="mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-3" data-testid="panel-schedule">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-bold text-[#0B1426]"><CalendarPlus size={18} className="text-[#FF5000]" /> {isDatetimeMode ? 'Date & heure' : 'Programmer plus tard'}</span>
        {!isDatetimeMode && (
          <button onClick={() => { const nv = !p.scheduleLater; p.setScheduleLater(nv); if (nv) p.setCalendarOpen(true); }} className={`w-11 h-6 rounded-full relative transition-colors ${p.scheduleLater ? 'bg-[#FF5000]' : 'bg-gray-300'}`} data-testid="panel-schedule-toggle">
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${p.scheduleLater ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        )}
      </div>
      {showPicker && (
        <button onClick={() => p.setCalendarOpen(true)} className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-left flex items-center justify-between hover:border-[#0B1426]" data-testid="panel-schedule-trigger">
          <span className={p.scheduledAt ? 'text-[#0B1426] font-semibold' : 'text-gray-400'}>{formatScheduled(p.scheduledAt) || 'Choisir une date'}</span>
          <CalendarPlus size={16} className="text-[#FF5000]" />
        </button>
      )}
    </div>
  );
};

const ModeSpecificPanel = (p) => {
  const { money } = useLocale();
  const { mode } = p;
  const card = 'mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-3';

  if (mode.id === 'airport') {
    const sel = (p.airports || []).find((a) => a.id === p.airportId);
    const freeWait = sel?.free_wait_minutes || 45;
    return (
      <div className={card} data-testid="panel-flight">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-1.5"><AirplaneTilt size={18} className="text-[#0EA5E9]" /> Transfert aéroport</label>
        {(p.airports || []).length > 0 && (
          <select value={p.airportId} onChange={(e) => p.setAirportId(e.target.value)} data-testid="panel-airport-select"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2">
            {p.airports.map((a) => <option key={a.id} value={a.id}>{a.name}{a.code ? ` (${a.code})` : ''}</option>)}
          </select>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input value={p.flightNumber} onChange={(e) => p.setFlightNumber(e.target.value)} placeholder="N° de vol (ex: AF1234)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="panel-flight-input" />
          <input value={p.airportTerminal} onChange={(e) => p.setAirportTerminal(e.target.value)} placeholder="Terminal (ex: T1)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="panel-flight-terminal" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Clock size={16} className="text-[#0EA5E9] shrink-0" />
          <input type="time" value={p.flightArrivalTime} onChange={(e) => p.setFlightArrivalTime(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="panel-flight-arrival" />
        </div>
        {/* Luggage assistance */}
        <div className="mt-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-gray-700"><Briefcase size={16} className="text-[#0EA5E9]" /> Aide bagages {sel?.luggage_fee ? `(+${money(Number(sel.luggage_fee || 5))})` : ''}</span>
          <button onClick={() => p.setLuggageAssist(!p.luggageAssist)} data-testid="panel-luggage-toggle"
            className={`w-11 h-6 rounded-full relative transition-colors ${p.luggageAssist ? 'bg-[#FF5000]' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${p.luggageAssist ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
        {p.luggageAssist && (
          <div className="mt-2 flex items-center justify-between" data-testid="panel-luggage-count-row">
            <span className="text-sm text-gray-600">Nombre de bagages</span>
            <div className="flex items-center gap-3">
              <button onClick={() => p.setLuggageCount(Math.max(1, p.luggageCount - 1))} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="panel-luggage-minus"><Minus size={14} /></button>
              <span className="font-black text-lg w-6 text-center" data-testid="panel-luggage-count">{p.luggageCount}</span>
              <button onClick={() => p.setLuggageCount(p.luggageCount + 1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="panel-luggage-plus"><Plus size={14} /></button>
            </div>
          </div>
        )}
        {/* Shared shuttle */}
        <div className="mt-2 flex items-center justify-between">
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-sm text-gray-700"><Van size={16} className="text-[#10B981]" /> Navette partagée</span>
            <span className="text-[11px] text-gray-400 block ml-6">Jusqu'à -{Number(sel?.shuttle_discount_pct || 30)}% en partageant le trajet</span>
          </span>
          <button onClick={() => p.setSharedShuttle(!p.sharedShuttle)} data-testid="panel-shuttle-toggle"
            className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${p.sharedShuttle ? 'bg-[#FF5000]' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${p.sharedShuttle ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
        <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-sky-50 border border-sky-100 p-2.5" data-testid="panel-airport-freewait">
          <Clock size={15} weight="duotone" className="text-[#0EA5E9] mt-0.5 shrink-0" />
          <p className="text-[11px] text-sky-800 leading-snug"><b>{freeWait} min d'attente offertes</b> après l'atterrissage. Suivi de vol automatique : l'heure de prise en charge s'ajuste en cas de retard.</p>
        </div>
      </div>
    );
  }
  if (p.isRental) {
    const pkg = RENTAL_PACKAGES.find((pk) => pk.slug === p.rentalPkg);
    const adminPkg = p.taxiOpts?.rental_packages?.packages?.find((x) => x.slug === p.rentalPkg);
    const hr = adminPkg?.extra_hour_rate ?? 18;
    const km = adminPkg?.extra_km_rate ?? 0.8;
    const stops = p.rentalStops || [];
    const addStop = () => p.setRentalStops([...stops, { address: '', lat: null, lng: null }]);
    const setStop = (i, val) => p.setRentalStops(stops.map((s, idx) => (idx === i ? val : s)));
    const removeStop = (i) => p.setRentalStops(stops.filter((_, idx) => idx !== i));
    return (
      <div className={card} data-testid="panel-rental">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-2"><Clock size={18} className="text-[#F59E0B]" /> Forfait</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {RENTAL_PACKAGES.map((pk) => (
            <button key={pk.slug} onClick={() => p.setRentalPkg(pk.slug)} data-testid={`panel-rental-${pk.slug}`}
              className={`rounded-xl border-2 py-2.5 text-center transition-colors ${p.rentalPkg === pk.slug ? 'border-[#FF5000] bg-[#FFF3EC]' : 'border-gray-200'}`}>
              <p className="font-black text-[#0B1426]">{pk.label}</p><p className="text-[10px] text-gray-400">{pk.km} km</p>
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-100 p-2" data-testid="rental-overage-info">
          <Info size={14} className="text-amber-600 shrink-0" />
          <p className="text-[11px] text-amber-800 leading-snug">Inclus : <b>{pkg?.hours}h / {pkg?.km} km</b>. Au-delà : <b>{money(hr)}/h</b> et <b>{money(km)}/km</b> (facturation au compteur).</p>
        </div>
        {/* Multi-stop (optional, can also be added live during the ride) */}
        <div className="mt-3">
          <p className="text-xs font-bold text-[#0B1426] mb-1.5">Arrêts prévus (optionnel)</p>
          {stops.map((s, i) => (
            <div key={i} className="flex items-center gap-2 mb-2" data-testid={`rental-stop-row-${i}`}>
              <div className="flex-1">
                <GooglePlacesInput placeholder={`Arrêt ${i + 1}`} value={s?.address || ''} iconColor="#F59E0B" testId={`rental-stop-${i}`} onSelect={(loc) => setStop(i, loc)} />
              </div>
              <button onClick={() => removeStop(i)} className="text-red-500 shrink-0" data-testid={`rental-stop-remove-${i}`}><Minus size={18} /></button>
            </div>
          ))}
          <button onClick={addStop} data-testid="rental-add-stop" className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-sm font-semibold text-gray-600 flex items-center justify-center gap-1.5">
            <Plus size={15} /> Ajouter un arrêt
          </button>
        </div>
      </div>
    );
  }
  if (p.isBuddy) {
    return (
      <div className={card} data-testid="panel-buddy">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-2"><Clock size={18} className="text-[#10B981]" /> Durée</label>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 4, 8].map((h) => (
            <button key={h} onClick={() => p.setBuddyHours(h)} data-testid={`panel-buddy-${h}`}
              className={`rounded-xl border-2 py-2.5 text-center font-black transition-colors ${p.buddyHours === h ? 'border-[#FF5000] bg-[#FFF3EC] text-[#FF5000]' : 'border-gray-200 text-[#0B1426]'}`}>{h}h</button>
          ))}
        </div>
      </div>
    );
  }
  if (mode.id === 'pets') {
    return (
      <div className={card} data-testid="panel-pets">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-2"><PawPrint size={18} className="text-[#F97316]" /> Animaux</label>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Nombre</span>
          <div className="flex items-center gap-3">
            <button onClick={() => p.setPetsCount(Math.max(1, p.petsCount - 1))} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="panel-pets-minus"><Minus size={14} /></button>
            <span className="font-black text-lg w-6 text-center" data-testid="panel-pets-count">{p.petsCount}</span>
            <button onClick={() => p.setPetsCount(p.petsCount + 1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="panel-pets-plus"><Plus size={14} /></button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {[{ k: 'small', l: 'Petit' }, { k: 'large', l: 'Grand' }].map((s) => (
            <button key={s.k} onClick={() => p.setPetsSize(s.k)} data-testid={`panel-pets-size-${s.k}`}
              className={`rounded-xl border-2 py-2 text-sm font-bold transition-colors ${p.petsSize === s.k ? 'border-[#FF5000] bg-[#FFF3EC] text-[#FF5000]' : 'border-gray-200 text-gray-600'}`}>{s.l}</button>
          ))}
        </div>
      </div>
    );
  }
  if (mode.id === 'assist') {
    return (
      <div className={card} data-testid="panel-assist">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-2"><HandHeart size={18} className="text-[#F43F5E]" /> Type d&apos;assistance</label>
        <div className="grid grid-cols-2 gap-2">
          {ASSIST_OPTIONS.map((a) => (
            <button key={a.k} onClick={() => p.setAssistNeeds(a.k)} data-testid={`panel-assist-${a.k}`}
              className={`rounded-xl border-2 py-2 text-sm font-bold transition-colors ${p.assistNeeds === a.k ? 'border-[#FF5000] bg-[#FFF3EC] text-[#FF5000]' : 'border-gray-200 text-gray-600'}`}>{a.l}</button>
          ))}
        </div>
      </div>
    );
  }
  if (mode.id === 'corporate') {
    return (
      <div className={card} data-testid="panel-corporate">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-2"><Briefcase size={18} className="text-[#334155]" /> Compte entreprise</label>
        {p.corpAccounts.length === 0 ? (
          <p className="text-xs text-gray-400">Aucune entreprise. Rejoignez-en une depuis votre profil.</p>
        ) : (
          <select value={p.corpId} onChange={(e) => p.setCorpId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="panel-corporate-select">
            {p.corpAccounts.map((a) => <option key={a.join_code} value={a.join_code}>{a.name} (-{a.discount_pct}%)</option>)}
          </select>
        )}
      </div>
    );
  }
  if (mode.id === 'book_for_someone') {
    return (
      <div className={card} data-testid="panel-contact">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-2"><UserPlus size={18} className="text-[#14B8A6]" /> Passager</label>
        <div className="grid grid-cols-2 gap-2">
          <input value={p.bookForName} onChange={(e) => p.setBookForName(e.target.value)} placeholder="Nom" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="panel-contact-name" />
          <input value={p.bookForPhone} onChange={(e) => p.setBookForPhone(e.target.value)} placeholder="Téléphone" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="panel-contact-phone" />
        </div>
      </div>
    );
  }
  if (mode.id === 'intercity') {
    const est = p.intercityEst || {};
    return (
      <div className={card} data-testid="panel-intercity">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-1.5"><MapTrifold size={18} className="text-[#8B5CF6]" /> Trajet longue distance</label>
        {est.distance ? (
          <div className="flex items-center gap-2 flex-wrap mb-2" data-testid="intercity-info">
            <span className="text-[11px] font-bold text-[#8B5CF6] bg-[#8B5CF6]/10 rounded-full px-2 py-0.5">{est.distance} km</span>
            {est.pricePerKm ? <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{money(Number(est.pricePerKm))}/km</span> : null}
            {est.duration ? <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">≈ {Math.round(est.duration / 60)}h{String(est.duration % 60).padStart(2, '0')}</span> : null}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 mb-2">Renseignez départ et destination pour estimer le tarif au kilomètre.</p>
        )}
        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
          <span className="min-w-0">
            <span className="text-sm font-bold text-[#0B1426] block leading-tight">Aller-retour</span>
            <span className="text-[11px] text-gray-400">Tarif majoré · le chauffeur vous ramène</span>
          </span>
          <button onClick={() => p.setRoundTrip(!p.roundTrip)} className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${p.roundTrip ? 'bg-[#FF5000]' : 'bg-gray-300'}`} data-testid="intercity-roundtrip-toggle">
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${p.roundTrip ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      </div>
    );
  }
  if (mode.id === 'pool') {
    const seats = p.poolSeats || 1;
    const poolMax = Math.max(1, p.poolMax || 2);
    const capped = Math.min(seats, poolMax);
    return (
      <div className={card} data-testid="panel-pool">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-1"><UsersThree size={18} className="text-[#3B82F6]" /> Taxi partagé (Pool)</label>
        <p className="text-[11px] text-gray-500 mb-2.5">Vous partagez le trajet avec d&apos;autres passagers allant dans la même direction. Le tarif est réduit mais le temps de trajet peut être un peu plus long.</p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Places à réserver</span>
          <div className="flex items-center gap-3">
            <button onClick={() => p.setPoolSeats(Math.max(1, capped - 1))} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center disabled:opacity-40" disabled={capped <= 1} data-testid="panel-pool-minus"><Minus size={14} /></button>
            <span className="font-black text-lg w-6 text-center" data-testid="panel-pool-seats">{capped}</span>
            <button onClick={() => p.setPoolSeats(Math.min(poolMax, capped + 1))} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center disabled:opacity-40" disabled={capped >= poolMax} data-testid="panel-pool-plus"><Plus size={14} /></button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">Maximum {poolMax} place{poolMax > 1 ? 's' : ''} par réservation Pool.</p>
      </div>
    );
  }
  if (p.isBidding) {
    return (
      <div className={card} data-testid="panel-bidding">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-1.5"><Gavel size={18} className="text-[#EC4899]" /> Proposez votre tarif (€)</label>
        <input type="number" value={p.biddingFare} onChange={(e) => p.setBiddingFare(e.target.value)} placeholder="ex: 15" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="panel-bidding-input" />
        <p className="text-[11px] text-gray-400 mt-1">Les chauffeurs proches verront votre offre et pourront l&apos;accepter ou contre-proposer.</p>
      </div>
    );
  }
  return null;
};

export default RideChoosePage;
