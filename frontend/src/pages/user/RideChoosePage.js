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
  Money, CreditCard, Wallet, CheckCircle, Lightning,
  CalendarPlus, AirplaneTilt, PawPrint, HandHeart, UserPlus, Gavel, Clock, Plus, Minus,
} from '@phosphor-icons/react';
import GooglePlacesInput from '../../components/GooglePlacesInput';
import ScheduleCalendarModal from '../../components/ScheduleCalendarModal';
import DynamicIcon from '../../components/DynamicIcon';
import { configAPI, rideAPI, placesAPI, corporateAPI, homeCategoriesAPI, geoAPI, walletAPI } from '../../services/api';
import { MODES, RENTAL_PACKAGES } from './taxihub/taxiHubConstants';
import { getGeocoder } from '../../lib/googleMaps';

const COMPARISON_EXCLUDE = ['pool', 'airport', 'pets', 'assist', 'accessible'];

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
  const [params] = useSearchParams();
  const routerLocation = useLocation();
  const modeId = params.get('mode') || 'standard';
  const mode = useMemo(() => MODES.find((m) => m.id === modeId) || MODES[0], [modeId]);

  const isRental = mode.ride_type === 'rental';
  const isBuddy = mode.id === 'buddy_driver';
  const isBidding = mode.id === 'bidding';
  const needsDropoff = !isRental && !isBuddy;
  const showComparison = needsDropoff && !isBidding;

  const [cfg, setCfg] = useState({ unified_flow_enabled: true, whatsapp_enabled: false, whatsapp_number: '', whatsapp_message_template: '' });
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [schedConfig, setSchedConfig] = useState({ enabled: true, min_advance_minutes: 60, max_advance_days: 30, disabled_modes: ['pool', 'bidding'] });

  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [vtypes, setVtypes] = useState([]);
  const [estimates, setEstimates] = useState({}); // slug -> { fare, duration, distance, loading, error }
  const [selected, setSelected] = useState(null);
  const [payment, setPayment] = useState('cash');
  const [payments, setPayments] = useState(DEFAULT_PAYMENTS);
  const [walletBalance, setWalletBalance] = useState(null);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState({ home: null, work: null, recent: [] });
  const [taxiOpts, setTaxiOpts] = useState(null);
  const [modeCms, setModeCms] = useState(null); // admin CMS override for label/sub/icon
  const [allCats, setAllCats] = useState([]); // « Catégories » (service_categories) — single source of truth

  // Mode-specific state
  const [scheduledAt, setScheduledAt] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [flightNumber, setFlightNumber] = useState('');
  const [rentalPkg, setRentalPkg] = useState('2h_20km');
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
  const [scheduleLater, setScheduleLater] = useState(mode.panel === 'datetime');

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

  // Auto-localize the departure on mount
  useEffect(() => { autoLocate(); /* eslint-disable-next-line */ }, []);

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

  const applySaved = (place) => { if (place?.address) setDropoff({ address: place.address, lat: place.lat, lng: place.lng }); };

  const bothSet = !!(pickup?.lat && (needsDropoff ? dropoff?.lat : true));

  // ── Live estimates per vehicle (comparison modes only) ────────────────
  const fetchEstimates = useCallback(async () => {
    if (!showComparison || !pickup?.lat || !dropoff?.lat || vtypes.length === 0) return;
    setEstimates(Object.fromEntries(vtypes.map((v) => [v.slug, { loading: true }])));
    const base = {
      pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address,
      dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, dropoff_address: dropoff.address,
      payment_method: 'cash', ride_type: 'instant', pool_enabled: mode.id === 'pool',
    };
    await Promise.all(vtypes.map(async (v) => {
      try {
        const res = await rideAPI.estimate({ ...base, vehicle_type: v.slug });
        setEstimates((p) => ({ ...p, [v.slug]: { fare: res.data.estimated_fare, duration: res.data.duration_mins, distance: res.data.distance_km, maxPoolSeats: res.data.max_seats_per_booking, loading: false } }));
      } catch {
        setEstimates((p) => ({ ...p, [v.slug]: { loading: false, error: true } }));
      }
    }));
  }, [showComparison, vtypes, pickup, dropoff, mode.id]);

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
      base.scheduled_at = scheduledAt;
      if (base.ride_type === 'instant') base.ride_type = 'scheduled';
    }
    if (mode.id === 'airport') base.flight_number = flightNumber || null;
    if (isRental) { const pkg = RENTAL_PACKAGES.find((p) => p.slug === rentalPkg); base.rental_package = rentalPkg; base.rental_hours = pkg?.hours || 2; }
    if (isBuddy) base.buddy_hours = buddyHours;
    if (mode.id === 'corporate') base.corporate_account_id = corpId || null;
    if (mode.id === 'pets') { base.pets_count = petsCount; base.pets_size = petsSize; }
    if (mode.id === 'assist') base.assist_needs = assistNeeds;
    if (mode.id === 'access') base.handicap_accessibility = true;
    if (mode.id === 'pool') { base.pool_enabled = true; base.seats_required = poolSeats; }
    if (mode.id === 'book_for_someone') { base.book_for_name = bookForName; base.book_for_phone = bookForPhone; }
    return base;
  };

  const onRequest = async () => {
    if (!pickup?.lat) return toast.error('Renseignez le départ');
    if (needsDropoff && !dropoff?.lat) return toast.error('Renseignez la destination');

    if (isBidding) {
      const q = new URLSearchParams({
        pickup: pickup.address, plat: pickup.lat, plng: pickup.lng,
        dropoff: dropoff.address, dlat: dropoff.lat, dlng: dropoff.lng,
      });
      if (biddingFare) q.set('fare', biddingFare);
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
        toast.info(`Dette d'annulation de ${Number(cd.amount).toFixed(2)} € ajoutée à cette course.`, {
          description: 'À régler avec le paiement de la course (espèces, carte ou portefeuille).',
        });
      }
      if (scheduled) { toast.success('Course programmée !'); navigate('/scheduled-rides'); }
      else navigate(`/ride/${res.data.id}`);
    } catch (e) {
      setSearching(false);
      toast.error(e?.response?.data?.detail || 'Échec de la demande');
    }
  };

  const ModeIcon = mode.icon || Car;

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
            <GooglePlacesInput placeholder="Lieu de départ" value={pickup?.address || ''} iconColor="#22C55E" testId="ride-choose-pickup" onSelect={(p) => setPickup(p)} />
          </div>
          {needsDropoff && (
            <div>
              <p className="text-[10px] font-bold uppercase text-gray-400 mb-1 ml-1">Destination</p>
              <GooglePlacesInput placeholder="Où allez-vous ?" value={dropoff?.address || ''} iconColor="#EF4444" testId="ride-choose-dropoff" onSelect={(p) => setDropoff(p)} />
            </div>
          )}
          <button onClick={() => autoLocate(true)} disabled={locating} className="flex items-center gap-2 text-sm font-semibold text-[#2563EB] pl-1 pt-1" data-testid="ride-choose-locate">
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
        <ModePanel
          mode={mode} isRental={isRental} isBuddy={isBuddy} isBidding={isBidding}
          scheduleLater={scheduleLater} setScheduleLater={setScheduleLater} schedulingAllowed={schedulingAllowed}
          scheduledAt={scheduledAt} setCalendarOpen={setCalendarOpen}
          flightNumber={flightNumber} setFlightNumber={setFlightNumber}
          rentalPkg={rentalPkg} setRentalPkg={setRentalPkg}
          buddyHours={buddyHours} setBuddyHours={setBuddyHours}
          petsCount={petsCount} setPetsCount={setPetsCount} petsSize={petsSize} setPetsSize={setPetsSize}
          assistNeeds={assistNeeds} setAssistNeeds={setAssistNeeds}
          corpAccounts={corpAccounts} corpId={corpId} setCorpId={setCorpId}
          bookForName={bookForName} setBookForName={setBookForName} bookForPhone={bookForPhone} setBookForPhone={setBookForPhone}
          biddingFare={biddingFare} setBiddingFare={setBiddingFare}
          poolSeats={poolSeats} setPoolSeats={setPoolSeats}
          poolMax={(selected && estimates[selected]?.maxPoolSeats) || 2}
        />

        {/* Choose a ride (comparison) */}
        {showComparison && bothSet && (
          <div className="mt-5" data-testid="choose-ride-section">
            <h2 className="text-base font-black text-[#0B1426] mb-1">Choisissez un voyage</h2>
            <p className="text-xs text-gray-500 mb-3">{mode.id === 'pool' ? 'Tarif partagé estimé par véhicule.' : 'Tarif estimé en direct pour chaque véhicule.'}</p>
            <div className="space-y-2.5">
              {vtypes.map((v) => {
                const Icon = vehicleIcon(v);
                const est = estimates[v.slug] || {};
                const active = selected === v.slug;
                return (
                  <button key={v.slug} onClick={() => setSelected(v.slug)} data-testid={`choose-vehicle-${v.slug}`}
                    className={`w-full flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${active ? 'border-[#FF5000] bg-[#FFF3EC]' : 'border-transparent bg-white shadow-sm'}`}>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-[#FF5000]/15' : 'bg-gray-100'}`}>
                      <Icon size={26} weight={active ? 'fill' : 'regular'} className={active ? 'text-[#FF5000]' : 'text-gray-600'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-[#0B1426] truncate">{v.name_fr || v.name || v.slug}</p>
                        <span className="flex items-center gap-0.5 text-[11px] text-gray-400 shrink-0"><UsersThree size={13} weight="fill" /> {v.person_capacity || 4}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">
                        {est.loading ? 'Calcul du tarif…' : est.error ? 'Tarif indisponible' : `${est.duration ?? '–'} min · ${est.distance ?? '–'} km`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {est.loading ? <div className="h-5 w-14 bg-gray-100 rounded animate-pulse" />
                        : est.error ? <span className="text-xs text-gray-300">—</span>
                        : <p className="text-base font-black text-[#0B1426]" data-testid={`price-${v.slug}`}>{est.fare?.toFixed(2)} €</p>}
                      {active && <CheckCircle size={16} weight="fill" className="text-[#FF5000] inline-block mt-0.5" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Single price card (rental / buddy / bidding) */}
        {(isRental || isBuddy) && pickup?.lat && (
          <div className="mt-5 bg-[#0B1426] text-white p-4 rounded-2xl flex items-center justify-between" data-testid="single-price-card">
            <div>
              <p className="text-[10px] tracking-wider uppercase text-[#FF5000] font-bold">{catName || mode.label}</p>
              <p className="text-xs text-white/60 mt-0.5">{isRental ? `Forfait ${RENTAL_PACKAGES.find((p) => p.slug === rentalPkg)?.label}` : `${buddyHours}h de chauffeur dédié`}</p>
            </div>
            <p className="text-3xl font-black" data-testid="single-price-value">{Number(displayPrice).toFixed(0)} <span className="text-base">€</span></p>
          </div>
        )}

        {/* Payment */}
        {bothSet && (
          <>
            <h3 className="text-xs font-bold uppercase text-gray-400 mt-5 mb-2">Moyen de paiement</h3>
            <div className="grid grid-cols-2 gap-2">
              {payments.map((p) => {
                const Icon = PAYMENT_ICONS[p.icon] || Money; const active = payment === p.id;
                return (
                  <button key={p.id} onClick={() => setPayment(p.id)} data-testid={`ride-choose-pay-${p.id}`}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 text-sm font-bold transition-colors ${active ? 'border-[#0B1426] bg-[#0B1426] text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
                    <Icon size={16} weight={active ? 'fill' : 'regular'} /> {p.label}
                  </button>
                );
              })}
            </div>
            {payment === 'wallet' && walletBalance != null && displayPrice != null && walletBalance < displayPrice && (
              <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 p-2.5 flex items-start gap-2" data-testid="wallet-shortfall-notice">
                <Wallet size={16} weight="duotone" className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[12px] text-amber-800 leading-snug">
                  Solde portefeuille : <b>{Number(walletBalance).toFixed(2)} €</b>. Insuffisant — la différence de <b>{(displayPrice - walletBalance).toFixed(2)} €</b> sera réglée en espèces.
                </p>
              </div>
            )}
            {payment === 'wallet' && walletBalance != null && displayPrice != null && walletBalance >= displayPrice && (
              <p className="mt-2 text-[12px] font-semibold text-emerald-700" data-testid="wallet-ok-notice">Solde portefeuille : {Number(walletBalance).toFixed(2)} € · suffisant ✓</p>
            )}
          </>
        )}
      </div>

      {/* Sticky CTA */}
      {bothSet && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 p-4 z-20 space-y-2">
          <button onClick={onRequest} disabled={searching || (showComparison && (!selected || estimates[selected]?.loading || estimates[selected]?.error))}
            className="w-full py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
            style={{ backgroundColor: '#FF5000', color: '#0B1426' }} data-testid="ride-choose-request-btn">
            <Lightning size={20} weight="fill" />
            {searching ? 'Recherche…' : `${isBidding ? 'Proposer mon tarif' : mode.cta || 'Demander'}${displayPrice != null && !isBidding ? ` · ${Number(displayPrice).toFixed(2)} €` : ''}`}
          </button>
        </div>
      )}

      {/* Searching overlay removed: the orange tracking radar (/ride/:id) is shown directly. */}

      <ScheduleCalendarModal
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        minAdvanceMinutes={schedConfig.min_advance_minutes}
        maxAdvanceDays={schedConfig.max_advance_days}
        initialValue={scheduledAt}
        onConfirm={(iso) => { setScheduledAt(iso); setScheduleLater(true); setCalendarOpen(false); }}
      />
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
  const { mode } = p;
  const card = 'mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-3';

  if (mode.id === 'airport') {
    return (
      <div className={card} data-testid="panel-flight">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-1.5"><AirplaneTilt size={18} className="text-[#0EA5E9]" /> Numéro de vol</label>
        <input value={p.flightNumber} onChange={(e) => p.setFlightNumber(e.target.value)} placeholder="ex: AF1234" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="panel-flight-input" />
      </div>
    );
  }
  if (p.isRental) {
    return (
      <div className={card} data-testid="panel-rental">
        <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-2"><Clock size={18} className="text-[#F59E0B]" /> Forfait</label>
        <div className="grid grid-cols-3 gap-2">
          {RENTAL_PACKAGES.map((pk) => (
            <button key={pk.slug} onClick={() => p.setRentalPkg(pk.slug)} data-testid={`panel-rental-${pk.slug}`}
              className={`rounded-xl border-2 py-2.5 text-center transition-colors ${p.rentalPkg === pk.slug ? 'border-[#FF5000] bg-[#FFF3EC]' : 'border-gray-200'}`}>
              <p className="font-black text-[#0B1426]">{pk.label}</p><p className="text-[10px] text-gray-400">{pk.km} km</p>
            </button>
          ))}
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
