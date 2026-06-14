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
  ArrowLeft, NavigationArrow, Car, House, Briefcase,
  Lightning, Info, Clock, BellRinging,
} from '@phosphor-icons/react';
import GooglePlacesInput from '../../components/GooglePlacesInput';
import ScheduleCalendarModal from '../../components/ScheduleCalendarModal';
import RideRouteMap from '../../components/RideRouteMap';
import ModePanel, { ModeSpecificPanel } from './taxihub/RideModePanels';
import { RideVehicleList, RidePaymentMethod, RideVehicleInfoModal } from './taxihub/RideVehicleSection';
import StudentPromoBanner from '../../components/StudentPromoBanner';
import DynamicIcon, { CategoryGlyph } from '../../components/DynamicIcon';
import { cachedServiceCategories, loadServiceCategories } from '../../lib/serviceCategoriesCache';
import { configAPI, rideAPI, placesAPI, corporateAPI, homeCategoriesAPI, geoAPI, walletAPI, debtsAPI } from '../../services/api';
import { MODES, RENTAL_PACKAGES } from './taxihub/taxiHubConstants';
import { getGeocoder } from '../../lib/googleMaps';
import { getStoredLocation } from '../../lib/userLocation';
import { useLocale } from '../../contexts/LocaleContext';

const COMPARISON_EXCLUDE = ['pool', 'airport', 'pets', 'assist', 'accessible'];

const DEFAULT_PAYMENTS = [
  { id: 'cash', label: 'Espèces', icon: 'Money' },
  { id: 'card', label: 'CB', icon: 'CreditCard' },
  { id: 'wallet', label: 'Portefeuille', icon: 'Wallet' },
  { id: 'sbpaygo', label: 'SB PayGo', icon: 'Lightning' },
];

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
  const [carriedDebt, setCarriedDebt] = useState(0);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState({ home: null, work: null, recent: [] });
  const [taxiOpts, setTaxiOpts] = useState(null);
  const [poolCfg, setPoolCfg] = useState(null); // GLOBAL « Configuration Pool » admin policy
  const [modeCms, setModeCms] = useState(null); // admin CMS override for label/sub/icon
  const [allCats, setAllCats] = useState(cachedServiceCategories()); // « Catégories » (service_categories) — single source of truth

  // Mode-specific state
  const [scheduledAt, setScheduledAt] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [noDrivers, setNoDrivers] = useState(false);
  const [flightNumber, setFlightNumber] = useState(() => params.get('flight') || '');
  const [airports, setAirports] = useState([]);
  const [airportId, setAirportId] = useState('');
  const [airportTerminal, setAirportTerminal] = useState(() => params.get('term') || '');
  const [flightArrivalTime, setFlightArrivalTime] = useState(() => params.get('farr') || '');
  const [luggageAssist, setLuggageAssist] = useState(false);
  const [luggageCount, setLuggageCount] = useState(1);
  const [sharedShuttle, setSharedShuttle] = useState(false);
  const [rentalPkg, setRentalPkg] = useState('2h_20km');
  const [rentalStops, setRentalStops] = useState([]);
  const [vehPackages, setVehPackages] = useState([]); // forfaits par véhicule (db.rental_packages)

  // Charge les forfaits dédiés au véhicule du mode (moto, confort…) pour la « Mise à dispo ».
  useEffect(() => {
    if (!isRental) { setVehPackages([]); return; }
    let on = true;
    configAPI.getRentalPackages(mode.vehicle)
      .then((r) => {
        if (!on) return;
        const list = r.data || [];
        setVehPackages(list);
        if (list.length) setRentalPkg(list[0].id);
      })
      .catch(() => { if (on) setVehPackages([]); });
    return () => { on = false; };
  }, [isRental, mode.vehicle]);
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
    loadServiceCategories()
      .then(setAllCats)
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
  useEffect(() => {
    if (pickup) return;
    // Prefer the user's manually-pinned zone (from the home location selector),
    // then GPS, then IP — keeps pickup coherent with the rest of the app.
    const stored = getStoredLocation();
    if (stored) { setPickup({ lat: stored.lat, lng: stored.lng, address: stored.label || '' }); return; }
    autoLocate(); /* eslint-disable-next-line */
  }, []);

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
    debtsAPI.me()
      .then((r) => setCarriedDebt(r.data?.has_debt ? Number(r.data.total) || 0 : 0))
      .catch(() => {});
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
        // Deep-link: pré-sélectionne l'aéroport par code (acode) si fourni.
        const acode = (params.get('acode') || '').toUpperCase();
        const match = acode ? list.find((a) => (a.code || '').toUpperCase() === acode) : null;
        if (match) setAirportId(match.id);
        else if (list.length && !airportId) setAirportId(list[0].id);
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
  // Exception: deep-link transfert aéroport (mode=airport&acode=...) — on reste sur
  // le formulaire pour que l'utilisateur voie/confirme le panneau vol (n° de vol,
  // heure) avant de continuer, même si départ + destination sont déjà remplis.
  const autoAdvancedRef = useRef(false);
  const airportDeepLink = mode.id === 'airport' && !!params.get('acode');
  useEffect(() => {
    if (needsDropoff && bothSet && !autoAdvancedRef.current && !airportDeepLink) {
      autoAdvancedRef.current = true;
      Promise.resolve().then(() => setShowMap(true));
    }
  }, [needsDropoff, bothSet, airportDeepLink]);

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
    const veh = vehPackages.find((p) => p.id === rentalPkg);
    if (veh) return veh.price;
    const pkg = RENTAL_PACKAGES.find((p) => p.slug === rentalPkg);
    const adminPrice = taxiOpts?.rental_packages?.packages?.find((p) => p.slug === rentalPkg)?.price;
    return adminPrice ?? (pkg?.hours || 2) * 18;
  }, [rentalPkg, taxiOpts, vehPackages]);
  const buddyPrice = useMemo(() => buddyHours * (taxiOpts?.personal_driver?.hourly_rate || 20), [buddyHours, taxiOpts]);

  const selectedSlug = isRental || isBuddy ? mode.vehicle : selected;

  const displayPrice = useMemo(() => {
    if (isRental) return rentalPrice;
    if (isBuddy) return buddyPrice;
    if (isBidding) return biddingFare ? parseFloat(biddingFare) : (selected && estimates[selected]?.fare) || null;
    return selected ? estimates[selected]?.fare ?? null : null;
  }, [isRental, isBuddy, isBidding, rentalPrice, buddyPrice, biddingFare, selected, estimates]);

  // ── Submit ───────────────────────────────────────────────────────────
  const [safeNight, setSafeNight] = useState(false);
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
    if (isRental) {
      const veh = vehPackages.find((x) => x.id === rentalPkg);
      const pkg = RENTAL_PACKAGES.find((x) => x.slug === rentalPkg);
      base.rental_package = rentalPkg;
      base.rental_hours = veh?.hours || pkg?.hours || 2;
      base.stops = rentalStops.filter((s) => s?.lat);
    }
    if (isBuddy) base.buddy_hours = buddyHours;
    if (mode.id === 'corporate') base.corporate_account_id = corpId || null;
    if (mode.id === 'pets') { base.pets_count = petsCount; base.pets_size = petsSize; }
    if (mode.id === 'assist') base.assist_needs = assistNeeds;
    if (mode.id === 'access') base.handicap_accessibility = true;
    if (mode.id === 'pool') { base.pool_enabled = true; base.seats_required = poolSeats; }
    if (isIntercity && roundTrip) { base.round_trip = true; if (scheduledAt) base.return_at = scheduledAt; }
    if (mode.id === 'book_for_someone') { base.book_for_name = bookForName; base.book_for_phone = bookForPhone; }
    if (safeNight) base.safe_ride_night = true;
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
    rentalStops, setRentalStops, taxiOpts, vehPackages,
    goSelfDrive: () => navigate('/moto-location'),
    goSelfDriveCar: () => navigate('/location-voiture'),
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

  // Build the pre-filled WhatsApp message (admin-configured template) for a vehicle.
  const buildWaMsg = (vehSlug) => {
    const slug = vehSlug || selected;
    const veh = effectiveVtypes.find((v) => v.slug === slug);
    const fare = slug ? estimates[slug]?.fare : null;
    const payLabel = payments.find((p) => p.id === payment)?.label || payment;
    const when = (scheduleLater && scheduledAt)
      ? new Date(scheduledAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
      : 'Maintenant';
    return String(cfg.whatsapp_message_template || '')
      .replace(/{mode}/g, catName || mode.label || '')
      .replace(/{pickup}/g, pickup?.address || '—')
      .replace(/{dropoff}/g, dropoff?.address || '—')
      .replace(/{vehicle}/g, veh?.name_fr || veh?.name || veh?.slug || '—')
      .replace(/{price}/g, fare != null ? money(Number(fare)) : 'à confirmer')
      .replace(/{when}/g, when)
      .replace(/{payment}/g, payLabel || '—');
  };

  // Open WhatsApp pre-filled. On mobile we use the `whatsapp://` app scheme which
  // opens the installed app directly (avoids the `wa.me` → api.whatsapp.com web
  // redirect that some networks/devices block). On desktop we fall back to wa.me.
  const openWhatsApp = (vehSlug, e) => {
    if (e) e.stopPropagation();
    const num = String(cfg.whatsapp_number || '').replace(/[^0-9]/g, '');
    if (!cfg.whatsapp_enabled || !num) return;
    const text = encodeURIComponent(buildWaMsg(vehSlug));
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    if (isMobile) {
      window.location.href = `whatsapp://send?phone=${num}&text=${text}`;
    } else {
      window.open(`https://wa.me/${num}?text=${text}`, '_blank', 'noopener');
    }
  };

  const waActive = !!(cfg.whatsapp_enabled && String(cfg.whatsapp_number || '').replace(/[^0-9]/g, ''));

  // Prop bundles spread into the extracted vehicle-section components (RideVehicleSection).
  const vehicleListProps = {
    effectiveVtypes, estimates, selected, setSelected, nearby, badgeCfg,
    waActive, openWhatsApp, setInfoVehicle, money, isBidding, avgFares, isPool,
  };
  const paymentProps = {
    payments, payment, setPayment, payOpen, setPayOpen, effectivePayments,
    walletBalance, displayPrice, carriedDebt, navigate, money,
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
  const vehicleInfoModal = (
    <RideVehicleInfoModal
      vehicle={infoVehicle}
      onClose={() => setInfoVehicle(null)}
      onSelect={(slug) => { setSelected(slug); setInfoVehicle(null); }}
      money={money}
    />
  );

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
            {showVehicles && <RideVehicleList {...vehicleListProps} />}
          </div>
          {/* Pinned footer: payment + CTA always visible */}
          <div className="px-4 pt-2 pb-4 border-t border-gray-100 shrink-0 space-y-2 bg-white rounded-b-3xl">
            <RidePaymentMethod {...paymentProps} />
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
          {activeCat?.icon ? (
            <CategoryGlyph icon={activeCat.icon} Fallback={ModeIcon} size={15} className="text-white" />
          ) : modeCms ? (
            <DynamicIcon name={modeCms.icon_name} imageUrl={modeCms.image_url} size={15} weight="duotone" className="text-white" />
          ) : (
            <ModeIcon size={15} weight="duotone" className="text-white" />
          )}
          <span className="text-xs font-bold text-white">{catName || (modeCms?.label_fr ? modeCms.label_fr.replace(/\n/g, ' ') : mode.label)}</span>
          <span className="text-[10px] text-white/70">{modeCms?.subtitle_fr || mode.sub}</span>
        </div>
      </div>

      <div className="flex-1 bg-gray-50 px-4 pt-4 pb-36 overflow-y-auto">
        <StudentPromoBanner />
        <button onClick={() => setSafeNight((v) => !v)} data-testid="safe-ride-night-toggle"
          className={`w-full mb-3 rounded-2xl p-3 flex items-center gap-3 border transition-colors ${safeNight ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: safeNight ? '#4F46E5' : '#EEF2FF' }}>
            <span className={`text-base ${safeNight ? 'text-white' : 'text-indigo-500'}`}>🌙</span>
          </span>
          <span className="flex-1 text-left">
            <span className="text-sm font-bold text-gray-900 block leading-tight">Safe Ride Night</span>
            <span className="text-[11px] text-gray-500 block leading-tight">Priorité aux chauffeurs les mieux notés + suivi partagé</span>
          </span>
          <span className={`w-10 h-6 rounded-full relative shrink-0 transition-colors ${safeNight ? 'bg-indigo-600' : 'bg-gray-200'}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${safeNight ? 'left-[18px]' : 'left-0.5'}`} />
          </span>
        </button>
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

        {/* Moto-Taxi — sécurité (casque fourni, 1 passager) */}
        {mode.id === 'moto' && (
          <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3.5" data-testid="moto-safety-card">
            <p className="flex items-center gap-2 text-sm font-bold text-red-600"><Info size={16} weight="fill" /> Sécurité Moto-Taxi</p>
            <ul className="mt-1.5 space-y-1 text-[12.5px] text-red-700/90">
              <li>• Casque passager fourni par le chauffeur</li>
              <li>• 1 passager maximum</li>
              <li>• Bagage à main uniquement</li>
            </ul>
          </div>
        )}

        {/* Choose a ride — vehicles/payment now live on the map step (step 2) for
            destination modes; rental/buddy (no dropoff) keep an inline price + payment. */}

        {/* Single price card (rental / buddy) */}
        {(isRental || isBuddy) && pickup?.lat && (
          <div className="mt-5 bg-[#0B1426] text-white p-4 rounded-2xl flex items-center justify-between" data-testid="single-price-card">
            <div>
              <p className="text-[10px] tracking-wider uppercase text-[#FF5000] font-bold">{catName || mode.label}</p>
              <p className="text-xs text-white/60 mt-0.5">{isRental ? `Forfait ${(vehPackages.find((p) => p.id === rentalPkg)?.label) || RENTAL_PACKAGES.find((p) => p.slug === rentalPkg)?.label || ''}` : `${buddyHours}h de chauffeur dédié`}</p>
            </div>
            <p className="text-3xl font-black" data-testid="single-price-value">{money(Number(displayPrice))}</p>
          </div>
        )}

        {/* Inline payment for rental/buddy (these modes have no map step) */}
        {!needsDropoff && bothSet && <div className="mt-1"><RidePaymentMethod {...paymentProps} /></div>}
      </div>

      {/* Sticky bottom bar */}
      {needsDropoff && bothSet ? (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 p-4 z-40">
          <button onClick={() => setShowMap(true)} className="w-full py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform" style={{ backgroundColor: '#FF5000', color: '#0B1426' }} data-testid="continue-to-map-btn">
            <NavigationArrow size={20} weight="fill" /> Continuer · Voir les tarifs
          </button>
        </div>
      ) : (!needsDropoff && bothSet && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 p-4 z-40">
          {renderCta()}
        </div>
      ))}

      {scheduleModal}{noDriversModal}
    </div>
  );
};

export default RideChoosePage;
