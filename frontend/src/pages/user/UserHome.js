import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import SearchOverlay from '../../components/SearchOverlay';
import BottomTabBar from '../../components/BottomTabBar';
import DeliverySearchOverlay from '../../components/DeliverySearchOverlay';
import SideMenuDrawer from '../../components/SideMenuDrawer';
import { useLocale } from '../../contexts/LocaleContext';
import DynamicIcon, { CategoryGlyph, resolveImageUrl, isImgIcon } from '../../components/DynamicIcon';
import DebtBanner from '../../components/DebtBanner';
import { DisruptionBanner } from '../../components/transport/transportAlerts';
import { MODES } from './taxihub/taxiHubConstants';
import { prefetchPath } from '../../routes/useRoutePrefetch';
import { homeCategoriesAPI, promoBannersAPI, serviceTrendsAPI, zonesAPI, orderAPI, cartAPI, homeBannersAPI, nearbyPlacesAPI, rideAPI, couponAPI, walletAPI } from '../../services/api';
import { getBrowserLocationLabel, getBrowserZoneContext } from '../../lib/browserZone';
import LocationSelectorModal from '../../components/LocationSelectorModal';
import { resolveLocation, getStoredLocation } from '../../lib/userLocation';
import { LoyaltyStatusCard } from '../../components/LoyaltyStatusCard';
import { OffresDuMoment } from '../../components/OffresDuMoment';
import { useServiceShortcuts } from '../../hooks/useServiceShortcuts';
import { useHomeBanners } from '../../hooks/useHomeBanners';
import { cachedServiceCategories, loadServiceCategories } from '../../lib/serviceCategoriesCache';
import {
  TAXI_DEFAULT, TAXI_VISUAL, taxiServices, deliveryServices, videoCategories,
  onDemandServices, beautyServices, petServices, bidServices, carCareServices,
  towingServices, nearbyServices,
} from './userHomeServices';
import {
  MapPin,
  CaretRight, CaretDown, Star, UsersThree, Taxi, TrendUp,
  MagnifyingGlass, CalendarPlus,
  VideoCamera, FirstAid, ArrowRight, Lightning, ArrowClockwise,
  Stethoscope, UsersFour, Briefcase, Pill, Gift, CaretRight as ChevR,
  X, Ambulance, Bell, Tag, PaperPlaneTilt, ArrowDown, QrCode, ClockCounterClockwise,
  ForkKnife, Storefront, ShoppingBag, Coffee,
} from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;
const HEAD = "font-['Outfit']";
const BODY = "font-['Manrope']";

// Keep the Home "Services Taxi" order IN SYNC with the "/taxi" hub: the hub
// groups modes into sections (everyday → time → special), then sorts by the
// admin display_order within each group. We mirror that exact sequence here so
// the tiles never "jump" between the two screens.
const TAXI_CAT_RANK = { everyday: 0, time: 1, special: 2 };
const TAXI_MODE_CAT = MODES.reduce((acc, m) => { acc[m.id] = m.cat; return acc; }, {});

// Module-level cache (per session) so the home content — including the taxi tiles'
// dashboard icons — renders instantly when navigating back to Home, instead of
// briefly showing the hardcoded fallback icons before the API resolves.
const _homeCache = { cmsItems: null, sectionOrder: null };

// Illustrated glyph per "Catégories de services" tile on the Home "Nos services"
// grid (taxi-vtc excluded — it already has its own "Réserver un trajet" carousel).
const CATEGORY_EMOJI = {
  livraison: '🎁', marketplace: '🏪', sante: '❤️‍🩹', domicile: '🏠', voyage: '✈️',
  famille: '👨‍👩‍👧', 'auto-assistance': '🛠️', animaux: '🐾', emploi: '💼',
  evenements: '🎉', encheres: '🔨', wallet: '👛', 'bons-plans': '🏷️',
  'transport-public': '🚌', 'sb-ferry': '⛴️', 'courrier-express': '🛵',
  'reserver-proche': '🤝', covoiturage: '🚗', parking: '🅿️', 'autres-services': '✨',
};

// ── Signature "More Services" 4-coloured-squares mark (V3Cube) ──
const MoreSquares = () => (
  <div className="grid grid-cols-2 gap-1">
    {['#FF8A3D', '#F43F8E', '#84CC16', '#FB923C'].map((c) => (
      <span key={c} className="w-3.5 h-3.5 rounded-[4px]" style={{ background: c }} />
    ))}
  </div>
);

const Visual = ({ service, size = 34 }) => {
  if ((service.id || '').includes('more')) return <MoreSquares />;
  // Taxi tiles: render the dashboard-defined category icon (image or emoji),
  // falling back to the hardcoded Phosphor icon when none is set.
  if (service.customIcon) {
    return <CategoryGlyph icon={service.customIcon} Fallback={service.icon} size={size} className={service.iconColor} />;
  }
  if (service.iconName || service.imageUrl) {
    return <DynamicIcon name={service.iconName} imageUrl={service.imageUrl} size={size} className={service.iconColor} />;
  }
  return <service.icon size={size} weight="duotone" className={service.iconColor} />;
};

// Returns the uploaded-image URL for a tile (so it can fill the whole card),
// or null when the tile uses an emoji / Phosphor icon.
const tileImage = (service) => {
  if ((service.id || '').includes('more')) return null;
  if (service.imageUrl) return resolveImageUrl(service.imageUrl);
  if (isImgIcon(service.customIcon)) return resolveImageUrl(service.customIcon);
  return null;
};

// ── V3Cube-style service tile (CMS-driven icon / image / colors preserved) ──
// variant 'below'  → big pastel square, icon inside, bold label below (4-col grids)
// variant 'inside' → pastel tile with bold label on top + icon below (3-col grids)
const BADGE_STYLES = { Nouveau: 'bg-emerald-500', Promo: 'bg-rose-500' };
const TileBadge = ({ label }) => (label ? (
  <span className={`absolute -top-1.5 -right-1 z-10 px-1.5 py-0.5 rounded-full text-[8.5px] font-extrabold text-white leading-none shadow ${BADGE_STYLES[label] || 'bg-[#FF5000]'}`}>{label}</span>
) : null);

const ServiceTile = ({ service, variant = 'below', onSelect }) => {
  const warm = () => prefetchPath((service.path || '').split('?')[0]);
  const img = tileImage(service);
  if (variant === 'inside') {
    return (
      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={() => onSelect(service)}
        onPointerEnter={warm}
        onFocus={warm}
        data-prefetch={(service.path || '').split('?')[0]}
        data-testid={`service-${service.id}-btn`}
        className={`relative rounded-2xl ${service.bg} px-2 py-3 flex flex-col items-center justify-center gap-2.5 min-h-[112px] border border-white shadow-[0_6px_16px_-10px_rgba(11,20,38,0.22)]`}
      >
        <TileBadge label={service.badge} />
        <span className={`text-[12px] font-bold text-[#1F2430] text-center leading-[1.15] whitespace-pre-line ${HEAD}`}>{service.name}</span>
        <Visual service={service} size={36} />
      </motion.button>
    );
  }
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={() => onSelect(service)}
      onPointerEnter={warm}
      onFocus={warm}
      data-prefetch={(service.path || '').split('?')[0]}
      data-testid={`service-${service.id}-btn`}
      className="flex flex-col items-center group"
    >
      <div className={`relative w-full aspect-square rounded-2xl overflow-hidden ${img ? 'bg-white' : service.bg} flex items-center justify-center border border-white shadow-[0_6px_16px_-10px_rgba(11,20,38,0.22)] transition-transform group-hover:-translate-y-0.5`}>
        <TileBadge label={service.badge} />
        {img
          ? <img src={img} alt="" className={`absolute inset-0 w-full h-full ${service.imageFit === 'contain' ? 'object-contain p-2' : 'object-cover'}`} />
          : <Visual service={service} size={34} />}
      </div>
      <span className={`text-[11.5px] font-bold text-[#1F2430] text-center leading-[1.15] mt-2 whitespace-pre-line ${HEAD}`}>{service.name}</span>
    </motion.button>
  );
};

// ── Plain bold section title (V3Cube look) ──
const SectionHeader = ({ title, sub, actionLabel, onAction }) => (
  <div className="mb-3.5 flex items-end justify-between gap-3">
    <div className="min-w-0">
      <h3 className={`text-[20px] font-extrabold text-[#1F2430] tracking-tight ${HEAD}`}>{title}</h3>
      {sub && <p className={`text-xs text-[#64748B] mt-1 leading-snug ${BODY}`}>{sub}</p>}
    </div>
    {onAction && (
      <button
        onClick={onAction}
        data-testid="taxi-voir-tout"
        className={`shrink-0 text-sm font-bold text-[#FF5000] active:opacity-70 ${HEAD}`}
      >
        {actionLabel || 'Voir tout'}
      </button>
    )}
  </div>
);

// Banners dismissed by the user persist on the device (per announcement key)
// until the admin reprograms the campaign (key includes updated_at).
const DISMISS_KEY = 'sb_dismissed_banners';
const readDismissed = () => {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'); } catch { return []; }
};

// Small "×" overlay to dismiss a promotional banner (used inside clickable cards;
// uses a span + stopPropagation to avoid invalid nested-button markup).
const DismissX = ({ onDismiss, testid }) => (
  <span
    role="button"
    aria-label="Fermer le bandeau"
    data-testid={testid}
    onClick={(e) => { e.stopPropagation(); onDismiss(); }}
    className="absolute top-2 right-2 z-30 w-6 h-6 rounded-full bg-black/35 hover:bg-black/55 flex items-center justify-center backdrop-blur-sm"
  >
    <X size={12} weight="bold" className="text-white" />
  </span>
);

// Admin-piloted home feature banner. Two variants: "hero" (big gradient card)
// and "entry" (compact row). Icon resolved via DynamicIcon (Phosphor name/emoji).
const HomeFeatureBanner = ({ b, onClick, onDismiss }) => {
  const from = b.bg_from || '#5B21B6';
  const to = b.bg_to || '#7C3AED';
  if (b.variant === 'hero') {
    return (
      <button
        onClick={onClick}
        data-testid={`home-banner-${b.key}`}
        className="relative w-full overflow-hidden rounded-[24px] text-left active:scale-[0.99] transition-transform shadow-[0_14px_30px_-16px_rgba(79,70,229,0.7)]"
        style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 130%)` }}
      >
        {b.dismissible && onDismiss && <DismissX onDismiss={onDismiss} testid={`home-banner-dismiss-${b.key}`} />}
        <span className="absolute -right-6 -top-10 w-40 h-40 rounded-full bg-white/10" />
        <span className="absolute right-12 bottom-[-34px] w-28 h-28 rounded-full bg-white/10" />
        <div className="relative p-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
            <DynamicIcon name={b.icon || 'Lightning'} size={36} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            {b.badge && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/20 mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                <span className="text-[10px] font-extrabold text-white tracking-wider">{b.badge}</span>
              </span>
            )}
            <h3 className={`text-[19px] font-extrabold text-white leading-tight ${HEAD}`}>{b.title}</h3>
            {b.subtitle && <p className={`text-[12px] text-white/85 mt-0.5 leading-snug ${BODY}`}>{b.subtitle}</p>}
          </div>
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <ArrowRight size={18} weight="bold" className="text-white" />
          </div>
        </div>
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      data-testid={`home-banner-${b.key}`}
      className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left shadow-sm active:scale-[0.99] transition-transform relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {b.dismissible && onDismiss && <DismissX onDismiss={onDismiss} testid={`home-banner-dismiss-${b.key}`} />}
      <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
        <DynamicIcon name={b.icon || 'Storefront'} size={22} className="text-white" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-white font-black text-sm block leading-tight">{b.title}</span>
        {b.subtitle && <span className="text-white/85 text-xs block leading-tight">{b.subtitle}</span>}
      </span>
      <CaretRight size={18} className="text-white shrink-0" />
    </button>
  );
};

const UserHome = () => {
  const { user } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const { shortcuts, recordTap } = useServiceShortcuts();
  const [trending, setTrending] = useState([]);
  const [zoneShortcuts, setZoneShortcuts] = useState([]);
  const [dismissed, setDismissed] = useState(readDismissed);
  const isDismissed = useCallback((key) => dismissed.includes(key), [dismissed]);
  const dismissBanner = useCallback((key) => {
    setDismissed((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
      return next;
    });
  }, []);
  const zoneRef = useRef('');
  const homeBanners = useHomeBanners();
  const locLabelRef = useRef('');
  const [locLabel, setLocLabel] = useState(() => resolveLocation().label || 'Fort-de-France, Martinique');
  const [showLocModal, setShowLocModal] = useState(false);
  const firedImpressionsRef = useRef(new Set());
  // Only auto-refine from GPS when the user hasn't manually pinned a zone.
  useEffect(() => { if (getStoredLocation()) return; getBrowserLocationLabel().then((l) => { if (l) { locLabelRef.current = l; setLocLabel(l); } }); }, []);
  // Fire one impression per banner once it is rendered (with user/time/location).
  useEffect(() => {
    homeBanners.forEach((b) => {
      if (firedImpressionsRef.current.has(b.id)) return;
      firedImpressionsRef.current.add(b.id);
      homeBannersAPI.impression(b.id, { location: locLabelRef.current }).catch(() => {});
    });
  }, [homeBanners]);
  // Single entry point for service-tile taps: remembers usage (for shortcuts),
  // pings the zone-aware trends tracker, then routes.
  const go = useCallback((service) => {
    if (!service || !service.path) return;
    recordTap(service);
    serviceTrendsAPI.track({ ...service, zone: zoneRef.current }).catch(() => {});
    navigate(service.path);
  }, [recordTap, navigate]);

  // Trending services "near you" (organic) + admin-programmed zone shortcuts.
  // Global trends load first (instant); once we resolve the user's zone we
  // refine trends by zone AND fetch the shortcuts the admin scheduled for it.
  useEffect(() => {
    let alive = true;
    serviceTrendsAPI.trending().then((r) => { if (alive) setTrending(r.data.items || []); }).catch(() => {});
    getBrowserZoneContext().then((ctx) => {
      if (!alive) return;
      const now = new Date();
      const params = {
        label: ctx.label || undefined,
        lat: ctx.lat ?? undefined,
        lng: ctx.lng ?? undefined,
        dow: now.getDay(),
        mins: now.getHours() * 60 + now.getMinutes(),
        date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      };
      zonesAPI.resolve(params).then((r) => {
        if (!alive) return;
        const data = r.data || {};
        if (Array.isArray(data.shortcuts)) setZoneShortcuts(data.shortcuts);
        const tz = data.trend_zone || '';
        if (tz && tz !== 'global') {
          zoneRef.current = tz;
          serviceTrendsAPI.trending(tz).then((tr) => { if (alive && (tr.data.items || []).length) setTrending(tr.data.items); }).catch(() => {});
        }
      }).catch(() => {});
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Shortcuts = admin-programmed zone shortcuts FIRST, then the user's personal
  // most-used services (deduped by id/path), capped to a single scroll row.
  const mergedShortcuts = (() => {
    const seen = new Set();
    const out = [];
    for (const s of [...zoneShortcuts, ...shortcuts]) {
      const key = s.id || s.path;
      if (!key || seen.has(key) || seen.has(s.path)) continue;
      seen.add(key); seen.add(s.path);
      out.push(s);
    }
    return out.slice(0, 10);
  })();

  // Trending tiles the user hasn't already pinned as a shortcut.
  const shortcutIds = new Set(mergedShortcuts.map((s) => s.id || s.path));
  const trendingShown = trending.filter((s) => !shortcutIds.has(s.id) && !shortcutIds.has(s.path)).slice(0, 8);
  const [showSearch, setShowSearch] = useState(false);
  const [showDeliverySearch, setShowDeliverySearch] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevUnreadRef = useRef(0);
  const [badgePulse, setBadgePulse] = useState(false);
  useEffect(() => {
    let alive = true;
    const fetchUnread = () => {
      axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/push/unread-count`, { withCredentials: true })
        .then((r) => {
          if (!alive) return;
          const c = r.data?.count || 0;
          if (c > prevUnreadRef.current) { setBadgePulse(true); setTimeout(() => setBadgePulse(false), 1200); }
          prevUnreadRef.current = c;
          setUnreadCount(c);
        })
        .catch(() => {});
    };
    fetchUnread();
    const iv = setInterval(fetchUnread, 30000);
    const onFocus = () => fetchUnread();
    window.addEventListener('focus', onFocus);
    return () => { alive = false; clearInterval(iv); window.removeEventListener('focus', onFocus); };
  }, []);
  const [cmsItems, setCmsItems] = useState(_homeCache.cmsItems || []);
  const [sectionOrder, setSectionOrder] = useState(_homeCache.sectionOrder);
  const [sectionTitles, setSectionTitles] = useState(_homeCache.sectionTitles || null);
  const [taxiCats, setTaxiCats] = useState(cachedServiceCategories());
  const [allCategories, setAllCategories] = useState([]);
  const [nearbyFeatured, setNearbyFeatured] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [homeDeals, setHomeDeals] = useState([]);
  const [homeWallet, setHomeWallet] = useState(null);
  const [pendingRef, setPendingRef] = useState(null);
  const [lastDelivery, setLastDelivery] = useState(null);
  const { on: onWsEvent } = useWebSocket(user?.id);

  // Dernière commande de livraison → bannière (suivi live OU réachat 1-tap).
  const refetchLastDelivery = useCallback(() => {
    orderAPI.lastDelivery()
      .then((r) => setLastDelivery(r.data?.has_order ? r.data : null))
      .catch(() => {});
  }, []);

  useEffect(() => { refetchLastDelivery(); }, [refetchLastDelivery]);

  // Mise à jour temps réel : à chaque changement de statut de commande (WebSocket),
  // on rafraîchit la bannière → « En préparation » → « En route » sans recharger l'accueil.
  useEffect(() => {
    if (!onWsEvent) return undefined;
    return onWsEvent('order_status', () => refetchLastDelivery());
  }, [onWsEvent, refetchLastDelivery]);

  // Reprise de commande : reconstruit le panier puis ouvre le paiement (1 tap),
  // OU ouvre le suivi si une livraison est en cours.
  const resumeLastDelivery = useCallback(async () => {
    if (!lastDelivery) return;
    if (lastDelivery.mode === 'active') {
      navigate(`/order/${lastDelivery.order_id}`);
      return;
    }
    if (!lastDelivery.merchant_id) return;
    const items = lastDelivery.items || [];
    try {
      if (items.length) {
        await cartAPI.save(lastDelivery.merchant_id, items);
        navigate(`/checkout/${lastDelivery.merchant_id}`);
      } else {
        navigate(`/food/${lastDelivery.merchant_id}`);
      }
    } catch {
      navigate(`/food/${lastDelivery.merchant_id}`);
    }
  }, [lastDelivery, navigate]);


  useEffect(() => {
    fetch(`${API}/api/referral/my-pending`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.pending && d.remaining > 0) setPendingRef(d); })
      .catch(() => {});
  }, []);
  const [promoBanners, setPromoBanners] = useState([]);
  const promoRef = useRef(null);
  const promoIdx = useRef(0);
  const [promoDot, setPromoDot] = useState(0);
  const greeting = new Date().getHours() < 18 ? 'Bienvenue' : 'Bonsoir';

  // Load admin-configured home categories (CMS). Falls back to hardcoded arrays if empty.
  useEffect(() => {
    homeCategoriesAPI.public()
      .then((r) => {
        const items = r.data.items || [];
        const order = Array.isArray(r.data.section_order) && r.data.section_order.length ? r.data.section_order : null;
        const titles = r.data.section_titles || null;
        _homeCache.cmsItems = items;
        _homeCache.sectionOrder = order;
        _homeCache.sectionTitles = titles;
        setCmsItems(items);
        setSectionOrder(order);
        setSectionTitles(titles);
      })
      .catch((e) => console.warn('home categories load:', e?.message || e));
    // Taxi services come from "Gérer les catégories" (service_categories) → single
    // source of truth, served from a shared session cache for instant, flicker-free render.
    loadServiceCategories()
      .then(setTaxiCats)
      .catch((e) => console.warn('service categories load:', e?.message || e));
    // "Catégories de services" (the 21-tile master menu) reused inline as "Nos services".
    homeCategoriesAPI.public('all_categories')
      .then((r) => setAllCategories(r.data.items || []))
      .catch((e) => console.warn('all categories load:', e?.message || e));
    nearbyPlacesAPI.featured(6)
      .then((r) => setNearbyFeatured(r.data.items || []))
      .catch((e) => console.warn('nearby featured load:', e?.message || e));
    rideAPI.list({ limit: 3 })
      .then((r) => setRecentActivity(Array.isArray(r.data) ? r.data : r.data?.items || []))
      .catch((e) => console.warn('recent activity load:', e?.message || e));
    couponAPI.list()
      .then((r) => setHomeDeals(Array.isArray(r.data) ? r.data.slice(0, 6) : []))
      .catch((e) => console.warn('deals load:', e?.message || e));
    walletAPI.get()
      .then((r) => setHomeWallet(r.data))
      .catch((e) => console.warn('wallet load:', e?.message || e));
    promoBannersAPI.public()
      .then((r) => setPromoBanners(r.data.items || []))
      .catch((e) => console.warn('promo banners load:', e?.message || e));
    // Zone-aware refresh: once the browser resolves the user's location, refetch
    // banners filtered by their geographic scope (e.g. a Martinique-only campaign).
    let aliveBanners = true;
    getBrowserLocationLabel().then((label) => {
      if (!label || !aliveBanners) return;
      promoBannersAPI.public(label)
        .then((r) => { if (aliveBanners) setPromoBanners(r.data.items || []); })
        .catch(() => { /* keep global banners on failure */ });
    });
    return () => { aliveBanners = false; };
  }, []);

  // Auto-advance the promo carousel every 4s (loops back to start).
  useEffect(() => {
    if (promoBanners.length < 2) return undefined;
    const id = setInterval(() => {
      const el = promoRef.current;
      if (!el || el.children.length < 2) return;
      promoIdx.current = (promoIdx.current + 1) % el.children.length;
      const target = el.children[promoIdx.current].offsetLeft - el.children[0].offsetLeft;
      el.scrollTo({ left: target, behavior: 'smooth' });
      setPromoDot(promoIdx.current);
    }, 4000);
    return () => clearInterval(id);
  }, [promoBanners.length]);

  // Static service-tile fallbacks live in ./userHomeServices (admin CMS overrides them).
  // CMS-driven sections: admin-configured categories override the hardcoded arrays.
  const sectionFallback = {
    taxi: taxiServices, delivery: deliveryServices, ondemand: onDemandServices,
    beauty: beautyServices, pet: petServices, carcare: carCareServices,
    towing: towingServices, nearby: nearbyServices,
    parcel: [
      { id: 'parcel-main', name: 'Livraison\nColis', iconName: 'Package', bg: 'bg-indigo-50', iconColor: 'text-indigo-500', path: '/parcel' },
    ],
    marketplace: [
      { id: 'mp-realestate', name: 'Immobilier', iconName: 'Buildings', bg: 'bg-emerald-50', iconColor: 'text-emerald-600', path: '/real-estate' },
      { id: 'mp-cars', name: 'Véhicules', iconName: 'Car', bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/marketplace/cars' },
      { id: 'mp-items', name: 'Articles\nDivers', iconName: 'ShoppingBag', bg: 'bg-violet-50', iconColor: 'text-violet-500', path: '/marketplace/items' },
    ],
  };
  const sectionAllRoute = {
    taxi: '/taxi', delivery: '/all-delivery', ondemand: '/all-services', beauty: '/beauty',
    pet: '/pet-care', carcare: '/car-care', towing: '/towing', nearby: '/nearby',
    parcel: '/parcel', marketplace: '/marketplace/items',
  };
  const displayFor = (key) => {
    const cms = cmsItems.filter((i) => i.section === key).sort((a, b) => a.display_order - b.display_order);
    const base = (() => {
      if (!cms.length) return sectionFallback[key] || [];
      const visible = cms.filter((i) => i.visible_home).map((i) => ({
        id: i.id, name: i.label_fr, iconName: i.icon_name, imageUrl: i.image_url, imageFit: i.image_fit,
        bg: i.bg_class, iconColor: i.icon_color_class, path: i.target_route, badge: i.badge || '',
      }));
      if (cms.some((i) => !i.visible_home)) {
        visible.push({ id: `${key}-more`, name: 'Plus de\nServices', iconName: 'GridFour', bg: 'bg-slate-100', iconColor: 'text-gray-600', path: sectionAllRoute[key] });
      }
      return visible;
    })();
    // Always surface the SB Tracking entry in the on-demand section (CMS-agnostic).
    if (key === 'ondemand' && !base.some((t) => t.path === '/sb-tracking')) {
      return [{ id: 'sb-tracking', name: 'SB\nTracking', iconName: 'MapPin', bg: 'bg-blue-50', iconColor: 'text-blue-600', path: '/sb-tracking', badge: 'New' }, ...base];
    }
    return base;
  };

  // Taxi Home tiles built from "Gérer les catégories" (admin) → names/order/active
  // AND which tiles appear (visible_home toggle) all driven from the admin panel.
  const taxiTiles = (() => {
    if (!taxiCats.length) return null;
    const active = taxiCats
      .filter((c) => c.active !== false)
      .sort((a, b) => {
        // 1) group order (everyday → time → special), unknown keys last
        const ra = TAXI_CAT_RANK[TAXI_MODE_CAT[a.key]] ?? 3;
        const rb = TAXI_CAT_RANK[TAXI_MODE_CAT[b.key]] ?? 3;
        if (ra !== rb) return ra - rb;
        // 2) admin display_order within the group
        return (a.display_order || 0) - (b.display_order || 0);
      });
    // Admin chooses which modes show on the Home grid via the "Accueil" toggle.
    // Fallback to the first 7 active if the admin hasn't flagged any.
    let home = active.filter((c) => c.visible_home === true);
    if (!home.length) home = active.slice(0, 8);
    const tiles = home.map((c) => {
      const v = TAXI_VISUAL[c.key] || TAXI_DEFAULT;
      // SB Access (catégorie 'assist') ouvre la page dédiée SB Drive Access (/access).
      // SB Ferry (catégorie 'ferry') ouvre la billetterie maritime (/ferry).
      // 'access' (Taxi PMR) = vraie course taxi accessible (véhicule 'accessible').
      const path = c.key === 'assist' ? '/access' : c.key === 'ferry' ? '/ferry' : `/course?mode=${c.key}`;
      // Dashboard-defined icon (image/emoji) drives the tile; v.icon is the fallback.
      return { id: `svccat-${c.key}`, name: c.name, icon: v.icon, customIcon: c.icon, imageFit: c.image_fit, bg: v.bg, iconColor: v.iconColor, path };
    });
    return tiles;
  })();

  // V3Cube parity: categories configured with a banner view type + banner image
  // render as full-width promo cards (image + name + subtitle) under the grid.
  const taxiBanners = (() => {
    if (!taxiCats.length) return [];
    const apiBase = process.env.REACT_APP_BACKEND_URL || '';
    return taxiCats
      .filter((c) => c.active !== false && c.visible_home === true)
      .filter((c) => (c.view_type === 'banner' || c.view_type === 'icon_banner') && c.banner_image)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
      .map((c) => ({
        key: c.key,
        name: c.name,
        subtitle: c.list_description || c.description || '',
        image: c.banner_image.startsWith('/api/') ? `${apiBase}${c.banner_image}` : c.banner_image,
        path: `/course?mode=${c.key}`,
        dismissKey: `taxicat:${c.key}:${c.updated_at || ''}`,
      }));
  })();

  // ── "Taxi & VTC" — the 5 headline ride modes as a horizontal card carousel
  // (richer visual entry point than the /taxi hub's full grid, still one tap
  // away via "Voir tout").
  const RIDE_MODES = [
    { key: 'standard', name: 'Partir\nmaintenant', badge: '⚡', car: '🚗' },
    { key: 'bidding', name: 'Proposez\nvotre tarif', badge: '🏷️', car: '🚙' },
    { key: 'book_later', name: 'Planifier\nun trajet', badge: '📅', car: '🚘' },
    { key: 'pool', name: 'SB Pool', badge: '👥', car: '🚐' },
    { key: 'moto', name: 'Moto Taxi', badge: '', car: '🛵' },
  ];

  // ── Section render blocks (keyed) so we can order them declaratively ──
  // Section titles are admin-editable (home_sections); fall back to defaults.
  const st = (key, def) => (sectionTitles && sectionTitles[key]) || def;
  const blocks = {
    activeOrder: lastDelivery ? (
      <section key="activeOrder" className="px-4 mt-5" data-testid="active-order-section">
        {(() => {
          const active = lastDelivery.mode === 'active';
          let etaLabel = '';
          if (active && lastDelivery.eta) {
            try {
              const d = new Date(lastDelivery.eta);
              if (!isNaN(d)) etaLabel = `vers ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')}`;
            } catch { /* ignore */ }
          }
          return (
            <motion.button whileTap={{ scale: 0.98 }} onClick={resumeLastDelivery} data-testid="resume-delivery-btn"
              data-mode={active ? 'active' : 'reorder'}
              className="w-full rounded-2xl p-3 flex flex-col gap-2.5 text-left shadow-sm"
              style={{ background: active ? 'linear-gradient(135deg, #0A2540, #2563EB)' : 'linear-gradient(135deg, #FF5000, #FF7A3D)' }}>
              <span className="flex items-center gap-3 w-full">
                <span className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center overflow-hidden shrink-0">
                  {lastDelivery.merchant_logo
                    ? <img src={resolveImageUrl(lastDelivery.merchant_logo)} alt="" className="w-full h-full object-cover" />
                    : (active ? <Lightning size={24} weight="fill" className="text-white" /> : <ArrowClockwise size={24} weight="bold" className="text-white" />)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`text-white font-extrabold text-sm flex items-center gap-1.5 leading-tight ${HEAD}`}>
                    {active && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
                    {active ? 'Livraison en cours' : 'Reprendre votre commande'}
                  </span>
                  <span className="text-white/90 text-xs block truncate">
                    {active
                      ? `${lastDelivery.status_label}${etaLabel ? ` · livraison ${etaLabel}` : ''}`
                      : `${lastDelivery.merchant_name}${lastDelivery.item_count ? ` · ${lastDelivery.item_count} article${lastDelivery.item_count > 1 ? 's' : ''}` : ''}`}
                  </span>
                </span>
                <span className="shrink-0 px-3 py-1.5 rounded-full bg-white text-xs font-extrabold" style={{ color: active ? '#0A2540' : '#FF5000' }}>
                  {active ? 'Suivre' : 'Reprendre'}
                </span>
              </span>
              {active && Array.isArray(lastDelivery.steps) && (
                <span className="flex items-end gap-2 w-full pt-0.5" data-testid="delivery-progress">
                  {lastDelivery.steps.map((label, i) => {
                    const done = i <= (lastDelivery.step ?? 0);
                    const current = i === (lastDelivery.step ?? 0);
                    return (
                      <span key={label} className="flex-1 flex flex-col gap-1">
                        <span className={`h-1.5 rounded-full transition-colors ${done ? 'bg-emerald-400' : 'bg-white/25'} ${current ? 'animate-pulse' : ''}`} />
                        <span className={`text-[9px] leading-none ${done ? 'text-white font-semibold' : 'text-white/50'}`}>{label}</span>
                      </span>
                    );
                  })}
                </span>
              )}
            </motion.button>
          );
        })()}
      </section>
    ) : null,
    rideModes: (
      <section key="rideModes" className="px-4 mt-5" data-testid="ride-modes-section">
        <SectionHeader title={st('rideModes', "Taxi & VTC")} actionLabel="Voir tout" onAction={() => navigate('/taxi')} />
        <div className="flex gap-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-1">
          {RIDE_MODES.map((m) => (
            <motion.button
              key={m.key}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate(`/course?mode=${m.key}`)}
              data-testid={`ride-mode-${m.key}`}
              className="relative snap-start shrink-0 w-[82px] h-[92px] rounded-2xl flex flex-col items-center justify-center gap-1 overflow-hidden bg-orange-50 border border-orange-100"
            >
              {m.badge && (
                <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white shadow-sm flex items-center justify-center text-[10px]">{m.badge}</span>
              )}
              <span className="text-[26px] leading-none" aria-hidden="true">{m.car}</span>
              <span className={`text-[9.5px] font-bold text-[#1F2430] text-center leading-[1.1] whitespace-pre-line px-1 ${HEAD}`}>{m.name}</span>
            </motion.button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-1.5 mt-3">
          <span className="w-5 h-1.5 rounded-full bg-[#FF5000]" />
          <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
          <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
        </div>
      </section>
    ),
    taxi: (
      <section key="taxi" className="px-4 mt-6">
        <SectionHeader title={st('taxi', "Services Taxi")} actionLabel="Voir tout" onAction={() => navigate('/taxi')} />
        <div className="grid grid-cols-4 gap-3">
          {(taxiTiles || displayFor('taxi')).map((s) => <ServiceTile key={s.id} service={s} onSelect={go} />)}
        </div>
        {taxiBanners.filter((b) => !isDismissed(b.dismissKey)).length > 0 && (
          <div className="mt-3 space-y-3" data-testid="taxi-banner-cards">
            {taxiBanners.filter((b) => !isDismissed(b.dismissKey)).map((b) => (
              <button
                key={b.key}
                onClick={() => navigate(b.path)}
                data-testid={`taxi-banner-${b.key}`}
                className="relative w-full h-28 rounded-2xl overflow-hidden text-left shadow-sm active:scale-[0.99] transition-transform"
              >
                <img src={b.image} alt={b.name} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
                <DismissX onDismiss={() => dismissBanner(b.dismissKey)} testid={`taxi-banner-dismiss-${b.key}`} />
                <div className="absolute inset-0 p-4 flex flex-col justify-center">
                  <p className="text-white font-bold text-lg leading-tight">{b.name}</p>
                  {b.subtitle && <p className="text-white/85 text-xs mt-1 max-w-[70%]">{b.subtitle}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    ),
    promo: (() => {
      const visible = promoBanners.filter((b) => !isDismissed(`promo:${b.id}:${b.updated_at || ''}`));
      return visible.length > 0 ? (
        <div key="promo" className="mt-5" data-testid="promo-banner-carousel">
          <div
            ref={promoRef}
            className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-4 pb-1"
            onScroll={(e) => {
              const el = e.currentTarget;
              const w = el.children[0]?.offsetWidth || 1;
              const idx = Math.round(el.scrollLeft / (w + 12));
              promoIdx.current = idx;
              setPromoDot(idx);
            }}
          >
            {visible.map((b) => {
              const dark = b.theme === 'dark';
              return (
                <motion.button
                  key={b.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => b.target_route && navigate(b.target_route)}
                  data-testid={`promo-banner-${b.id}`}
                  className="relative snap-start shrink-0 w-[86%] rounded-[20px] overflow-hidden border border-slate-100 shadow-sm flex items-stretch h-[140px] text-left"
                  style={{ background: dark ? (b.bg_color || '#FF5000') : '#FFFFFF' }}
                >
                  <DismissX onDismiss={() => dismissBanner(`promo:${b.id}:${b.updated_at || ''}`)} testid={`promo-banner-dismiss-${b.id}`} />
                  {b.image_url && (
                    <div className="w-2/5 bg-cover bg-center shrink-0" style={{ backgroundImage: `url('${b.image_url}')` }} />
                  )}
                  <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                    <p className={`font-bold text-base leading-tight ${HEAD} ${dark ? 'text-white' : 'text-[#0B1426]'}`}>{b.title}</p>
                    {b.highlight && <p className={`text-3xl font-extrabold mt-1 ${HEAD} ${dark ? 'text-white' : 'text-[#FF5000]'}`}>{b.highlight}</p>}
                    {b.subtitle && <p className={`text-sm mt-1 ${BODY} ${dark ? 'text-white/80' : 'text-[#64748B]'}`}>{b.subtitle}</p>}
                    {b.promo_code && <p className={`text-xs mt-1 ${BODY} ${dark ? 'text-white/80' : 'text-[#64748B]'}`}>Code : {b.promo_code}</p>}
                    {b.cta_label && (
                      <span className={`mt-2 self-start px-4 py-1.5 text-xs font-semibold rounded-lg ${HEAD} ${dark ? 'bg-white text-[#0B1426]' : 'bg-[#0B1426] text-white'}`}>{b.cta_label}</span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
          {visible.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-3">
              {visible.map((b, i) => (
                <span
                  key={b.id}
                  className={`h-1.5 rounded-full transition-all ${i === promoDot ? 'w-5 bg-[#FF5000]' : 'w-1.5 bg-slate-200'}`}
                />
              ))}
            </div>
          )}
        </div>
      ) : null;
    })(),
    services: (() => {
      // Curated preview (matches the reference home): 8 of the most-used
      // categories, 2 rows of 4 — "Voir tout" in the header covers the rest.
      const PREVIEW_KEYS = ['livraison', 'marketplace', 'sante', 'domicile', 'voyage', 'evenements', 'auto-assistance', 'animaux'];
      const byKey = new Map(allCategories.map((c) => [c.key, c]));
      const items = PREVIEW_KEYS.map((k) => byKey.get(k)).filter(Boolean);
      if (!items.length) return null;
      return (
        <section key="services" className="px-4 mt-6" data-testid="services-section">
          <SectionHeader title={st('services', "Nos services")} actionLabel="Voir tout" onAction={() => navigate('/categories')} />
          <div className="grid grid-cols-4 gap-2.5">
            {items.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(c.target_route)}
                data-testid={`mini-service-${c.key}`}
                className="flex flex-col items-center gap-1.5 bg-white rounded-2xl border border-slate-100 py-3 px-1 shadow-[0_4px_10px_-8px_rgba(11,20,38,0.3)]"
              >
                <span className="text-[22px] leading-none" aria-hidden="true">{CATEGORY_EMOJI[c.key] || '✨'}</span>
                <span className={`text-[10px] font-bold text-[#1F2430] text-center leading-[1.15] line-clamp-2 ${HEAD}`}>{c.label_fr}</span>
              </button>
            ))}
          </div>
        </section>
      );
    })(),
    delivery: (
      <section key="delivery" className="px-4 mt-6">
        <SectionHeader title={st('delivery', "Livraison & Coursier")} sub="Repas, colis, courses & coursiers — tout au même endroit." />
        {lastDelivery && (() => {
          const active = lastDelivery.mode === 'active';
          let etaLabel = '';
          if (active && lastDelivery.eta) {
            try {
              const d = new Date(lastDelivery.eta);
              if (!isNaN(d)) etaLabel = `vers ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')}`;
            } catch { /* ignore */ }
          }
          return (
            <motion.button whileTap={{ scale: 0.98 }} onClick={resumeLastDelivery} data-testid="resume-delivery-btn"
              data-mode={active ? 'active' : 'reorder'}
              className="w-full mb-3 rounded-2xl p-3 flex flex-col gap-2.5 text-left shadow-sm"
              style={{ background: active ? 'linear-gradient(135deg, #0A2540, #2563EB)' : 'linear-gradient(135deg, #FF5000, #FF7A3D)' }}>
              <span className="flex items-center gap-3 w-full">
                <span className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center overflow-hidden shrink-0">
                  {lastDelivery.merchant_logo
                    ? <img src={resolveImageUrl(lastDelivery.merchant_logo)} alt="" className="w-full h-full object-cover" />
                    : (active ? <Lightning size={24} weight="fill" className="text-white" /> : <ArrowClockwise size={24} weight="bold" className="text-white" />)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`text-white font-extrabold text-sm flex items-center gap-1.5 leading-tight ${HEAD}`}>
                    {active && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
                    {active ? 'Livraison en cours' : 'Reprendre votre commande'}
                  </span>
                  <span className="text-white/90 text-xs block truncate">
                    {active
                      ? `${lastDelivery.status_label}${etaLabel ? ` · livraison ${etaLabel}` : ''}`
                      : `${lastDelivery.merchant_name}${lastDelivery.item_count ? ` · ${lastDelivery.item_count} article${lastDelivery.item_count > 1 ? 's' : ''}` : ''}`}
                  </span>
                </span>
                <span className="shrink-0 px-3 py-1.5 rounded-full bg-white text-xs font-extrabold" style={{ color: active ? '#0A2540' : '#FF5000' }}>
                  {active ? 'Suivre' : 'Reprendre'}
                </span>
              </span>
              {active && Array.isArray(lastDelivery.steps) && (
                <span className="flex items-end gap-2 w-full pt-0.5" data-testid="delivery-progress">
                  {lastDelivery.steps.map((label, i) => {
                    const done = i <= (lastDelivery.step ?? 0);
                    const current = i === (lastDelivery.step ?? 0);
                    return (
                      <span key={label} className="flex-1 flex flex-col gap-1">
                        <span className={`h-1.5 rounded-full transition-colors ${done ? 'bg-emerald-400' : 'bg-white/25'} ${current ? 'animate-pulse' : ''}`} />
                        <span className={`text-[9px] leading-none ${done ? 'text-white font-semibold' : 'text-white/50'}`}>{label}</span>
                      </span>
                    );
                  })}
                </span>
              )}
            </motion.button>
          );
        })()}
        <div className="grid grid-cols-4 gap-3" data-testid="delivery-coursier-section">
          {(() => {
            const merged = [
              ...displayFor('delivery').filter((s) => !(s.id || '').includes('more')),
              ...displayFor('parcel').filter((s) => !(s.id || '').includes('more')),
              { id: 'delivery-genie', name: 'Delivery\nGenie', iconName: 'Bag', bg: 'bg-blue-50', iconColor: 'text-blue-600', path: '/runner?mode=genie' },
              { id: 'delivery-runner', name: 'Delivery\nRunner', iconName: 'Lightning', bg: 'bg-rose-50', iconColor: 'text-rose-600', path: '/runner' },
            ];
            const seen = new Set();
            return merged
              .filter((s) => { const k = (s.path || s.name || s.id); if (seen.has(k)) return false; seen.add(k); return true; })
              .map((s) => <ServiceTile key={s.id} service={s} onSelect={go} />);
          })()}
        </div>
      </section>
    ),
    marketplace: (
      <section key="marketplace" className="px-4 mt-6" data-testid="home-sbmarket-section">
        <SectionHeader title="SB Market" sub="Acheter, vendre & louer — immobilier, véhicules & plus." actionLabel="Voir tout" onAction={() => navigate('/sb-market')} />
        <div className="grid grid-cols-4 gap-3">
          {[
            { id: 'sbm-immo', name: 'Immobilier', iconName: 'Buildings', imageUrl: 'https://images.pexels.com/photos/1974596/pexels-photo-1974596.jpeg?auto=compress&cs=tinysrgb&w=400', bg: 'bg-emerald-50', iconColor: 'text-emerald-600', path: '/real-estate' },
            { id: 'sbm-vehicles', name: 'Véhicules', iconName: 'Car', imageUrl: 'https://images.pexels.com/photos/26698502/pexels-photo-26698502.jpeg?auto=compress&cs=tinysrgb&w=400', bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/marketplace/cars' },
            { id: 'sbm-location', name: 'Location', iconName: 'Key', imageUrl: 'https://images.pexels.com/photos/17568137/pexels-photo-17568137.jpeg?auto=compress&cs=tinysrgb&w=400', bg: 'bg-rose-50', iconColor: 'text-rose-500', path: '/location-voiture' },
            { id: 'sbm-market', name: 'Marketplace', iconName: 'ShoppingBag', imageUrl: 'https://images.pexels.com/photos/31266794/pexels-photo-31266794.jpeg?auto=compress&cs=tinysrgb&w=400', bg: 'bg-violet-50', iconColor: 'text-violet-500', path: '/marketplace/items' },
          ].map((s) => <ServiceTile key={s.id} service={s} onSelect={go} />)}
        </div>
      </section>
    ),
    travel: (
      <section key="travel" className="mt-6" data-testid="home-travel-section">
        <div className="px-4">
          <SectionHeader title={st('travel', "SB Travel")} sub="Vols, hôtels & forfaits voyage — réservez en quelques secondes." />
          <div className="grid grid-cols-4 gap-3">
            {[
              { id: 'travel-flights', name: 'Billets\nd\u2019avion', iconName: 'AirplaneTilt', imageUrl: 'https://images.pexels.com/photos/19563698/pexels-photo-19563698.jpeg?auto=compress&cs=tinysrgb&w=400', bg: 'bg-blue-50', iconColor: 'text-blue-600', path: '/vols' },
              { id: 'travel-hotels', name: 'Hôtels', iconName: 'Bed', imageUrl: 'https://images.pexels.com/photos/6544779/pexels-photo-6544779.jpeg?auto=compress&cs=tinysrgb&w=400', bg: 'bg-cyan-50', iconColor: 'text-cyan-600', path: '/hotels' },
              { id: 'travel-packages', name: 'Forfaits\nVol+Hôtel', iconName: 'Suitcase', imageUrl: 'https://images.pexels.com/photos/13779629/pexels-photo-13779629.jpeg?auto=compress&cs=tinysrgb&w=400', bg: 'bg-violet-50', iconColor: 'text-violet-600', path: '/forfaits', badge: 'PROMO' },
              { id: 'travel-all', name: 'SB Travel', iconName: 'GridFour', bg: 'bg-slate-100', iconColor: 'text-gray-600', path: '/sb-travel' },
            ].map((s) => <ServiceTile key={s.id} service={s} onSelect={go} />)}
          </div>
        </div>
        <OffresDuMoment className="mt-4" />
      </section>
    ),
    events: (
      <section key="events" className="px-4 mt-6" data-testid="home-events-section">
        <SectionHeader title={st('events', 'SB Événement')} sub="Concerts, festivals, carnaval… billets + transport en un clic." />
        <button onClick={() => go({ id: 'events', path: '/events' })} className="w-full text-left rounded-2xl overflow-hidden relative bg-gradient-to-br from-[#7C2D12] via-[#B91C1C] to-[#FF4500] p-5 active:scale-[0.99] transition-transform" data-testid="events-banner">
          <div className="relative z-10">
            <span className="inline-flex items-center gap-1 bg-white/20 text-white text-[10px] font-bold px-2 py-1 rounded-full"><DynamicIcon name="Confetti" size={12} className="text-white" /> Nouveau</span>
            <h3 className="text-white text-lg font-extrabold mt-2 leading-tight">Vos billets & votre transport,<br />au même endroit</h3>
            <p className="text-white/80 text-xs mt-1">Découvrez les événements près de chez vous</p>
            <span className="inline-flex items-center gap-1 mt-3 bg-white text-[#B91C1C] text-xs font-extrabold px-3 py-1.5 rounded-full">Découvrir →</span>
          </div>
          <DynamicIcon name="Ticket" size={120} className="absolute -right-3 -bottom-4 text-white/15" />
        </button>
      </section>
    ),
    beauty: (
      <section key="beauty" className="px-4 mt-6">
        <SectionHeader title={st('beauty', "Services Beauté")} />
        <div className="grid grid-cols-4 gap-3">
          {displayFor('beauty').map((s) => <ServiceTile key={s.id} service={s} onSelect={go} />)}
        </div>
      </section>
    ),
    medical: (
      <section key="medical" className="px-4 mt-6">
        <SectionHeader title={st('medical', "Services Médicaux")} />
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate('/urgences')} className="mb-3 w-full rounded-[20px] bg-gradient-to-br from-red-600 to-red-500 p-4 flex items-center gap-4 text-left shadow-sm" data-testid="medical-emergency-btn">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0"><Ambulance size={28} weight="fill" className="text-white" /></div>
          <div className="flex-1">
            <h4 className={`text-sm font-extrabold text-white ${HEAD}`}>Urgences & ambulance</h4>
            <p className="text-[11px] text-white/90 mt-0.5 leading-relaxed">Demandez une ambulance géolocalisée immédiatement · SAMU 15 / 112.</p>
          </div>
          <CaretRight size={18} className="text-white/80" />
        </motion.button>
        <div className="grid grid-cols-2 gap-3" data-testid="medical-services-section">
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => navigate('/sante')} className="row-span-2 rounded-[20px] bg-blue-50/70 border border-blue-100 p-4 flex flex-col text-left" data-testid="medical-appointment-btn">
            <h4 className={`text-[15px] font-extrabold text-[#1F2430] ${HEAD}`}>Prendre Rendez-vous</h4>
            <p className={`text-[11px] text-[#475569] mt-1 leading-relaxed ${BODY}`}>RDV avec un médecin ou expert médical, au cabinet ou à domicile.</p>
            <div className="flex-1 flex items-end justify-center mt-3">
              <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center shadow-sm"><Stethoscope size={40} weight="duotone" className="text-[#FF5000]" /></div>
            </div>
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => navigate('/video-consult')} className="rounded-[20px] bg-amber-50/70 border border-amber-100 p-3 flex items-start gap-2 text-left" data-testid="medical-video-btn">
            <div className="flex-1">
              <h4 className={`text-[12px] font-bold text-[#1F2430] leading-tight ${HEAD}`}>Vidéo Consultation</h4>
              <p className={`text-[10px] text-[#475569] mt-1 leading-snug ${BODY}`}>Consultez un médecin en visio.</p>
            </div>
            <VideoCamera size={28} weight="duotone" className="text-amber-500 shrink-0" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => navigate('/medical/transport')} className="rounded-[20px] bg-emerald-50/70 border border-emerald-100 p-3 flex items-start gap-2 text-left" data-testid="medical-other-btn">
            <div className="flex-1">
              <h4 className={`text-[12px] font-bold text-[#1F2430] leading-tight ${HEAD}`}>Autres Services</h4>
              <p className={`text-[10px] text-[#475569] mt-1 leading-snug ${BODY}`}>Pharmacie, ambulance, transport sanitaire.</p>
            </div>
            <FirstAid size={28} weight="duotone" className="text-emerald-600 shrink-0" />
          </motion.button>
        </div>
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate('/pharmacy')} className="mt-3 w-full rounded-[20px] bg-orange-50/70 border border-orange-100 p-4 flex items-center gap-4 text-left" data-testid="medical-pharmacy-btn">
          <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shrink-0 shadow-sm"><Pill size={30} weight="duotone" className="text-[#FF5000]" /></div>
          <div className="flex-1">
            <h4 className={`text-sm font-extrabold text-[#1F2430] ${HEAD}`}>Pharmacie</h4>
            <p className={`text-[11px] text-[#475569] mt-0.5 leading-relaxed ${BODY}`}>Médicaments livrés — sur ordonnance ou parapharmacie.</p>
          </div>
          <CaretRight size={18} className="text-[#94A3B8]" />
        </motion.button>
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate('/mes-ordonnances')} className="mt-3 w-full rounded-[20px] bg-teal-50/70 border border-teal-100 p-3.5 flex items-center gap-4 text-left" data-testid="medical-prescriptions-btn">
          <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shrink-0 shadow-sm"><FirstAid size={26} weight="duotone" className="text-teal-600" /></div>
          <div className="flex-1">
            <h4 className={`text-sm font-extrabold text-[#1F2430] ${HEAD}`}>Mes ordonnances</h4>
            <p className={`text-[11px] text-[#475569] mt-0.5 leading-relaxed ${BODY}`}>Ordonnances électroniques · commander en pharmacie.</p>
          </div>
          <CaretRight size={18} className="text-[#94A3B8]" />
        </motion.button>
        <button onClick={() => navigate('/praticien')} className="mt-2 w-full text-center text-[11px] font-semibold text-teal-600 py-1" data-testid="practitioner-space-link">Vous êtes médecin / infirmier ? Espace praticien →</button>
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate('/analyses')} className="mt-3 w-full rounded-[20px] bg-indigo-50/70 border border-indigo-100 p-3.5 flex items-center gap-4 text-left" data-testid="lab-tests-btn">
          <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shrink-0 shadow-sm"><FirstAid size={26} weight="duotone" className="text-indigo-600" /></div>
          <div className="flex-1">
            <h4 className={`text-sm font-extrabold text-[#1F2430] ${HEAD}`}>Analyses & laboratoire</h4>
            <p className={`text-[11px] text-[#475569] mt-0.5 leading-relaxed ${BODY}`}>Prise de sang à domicile ou au labo · résultats en ligne.</p>
          </div>
          <CaretRight size={18} className="text-[#94A3B8]" />
        </motion.button>
        <button onClick={() => navigate('/laboratoire')} className="mt-2 w-full text-center text-[11px] font-semibold text-indigo-600 py-1" data-testid="lab-space-link">Vous êtes un laboratoire ? Espace labo →</button>
      </section>
    ),
    ondemand: (
      <section key="ondemand" className="px-4 mt-6">
        <SectionHeader title={st('ondemand', "Services à la demande")} />
        <div className="grid grid-cols-4 gap-3">
          {displayFor('ondemand').map((s) => <ServiceTile key={s.id} service={s} onSelect={go} />)}
        </div>
      </section>
    ),
    bid: (
      <div key="bid" className="px-4 mt-6">
        <div className="rounded-[20px] bg-indigo-50/70 border border-indigo-100 p-4" data-testid="bid-services-section">
          <h3 className={`text-[20px] font-extrabold text-[#1F2430] ${HEAD}`}>Enchères Services</h3>
          <p className={`text-[12px] text-[#475569] mt-1 mb-4 leading-relaxed ${BODY}`}>Publiez votre besoin et laissez les prestataires enchérir en temps réel. Choisissez le meilleur !</p>
          <div className="grid grid-cols-2 gap-2.5">
            {bidServices.map((s) => (
              <motion.button whileTap={{ scale: 0.96 }} key={s.id} onClick={() => navigate(s.path || '/services-bidding')} className="bg-white rounded-xl p-3 flex items-center justify-between gap-2 shadow-[0_3px_10px_-5px_rgba(11,20,38,0.12)]" data-testid={`bid-${s.id}-btn`}>
                <div className="flex items-center gap-2 min-w-0">
                  <ArrowRight size={14} weight="bold" className="text-[#0B1426] bg-slate-100 rounded-full p-[3px] shrink-0" />
                  <span className={`text-[12px] font-bold text-[#1F2430] leading-tight whitespace-pre-line ${HEAD}`}>{s.name}</span>
                </div>
                <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}><s.icon size={18} weight="duotone" className={s.iconColor} /></div>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    ),
    carcare: (
      <section key="carcare" className="px-4 mt-6">
        <SectionHeader title={st('carcare', "Entretien Auto")} />
        <div className="grid grid-cols-4 gap-3">
          {displayFor('carcare').map((s) => <ServiceTile key={s.id} service={s} onSelect={go} />)}
        </div>
      </section>
    ),
    towing: (
      <section key="towing" className="px-4 mt-6">
        <SectionHeader title={st('towing', "Dépannage & Remorquage")} sub="Assistance routière 24/7 — pneu crevé, démarrage, panne sèche et plus." />
        <div className="grid grid-cols-3 gap-3" data-testid="towing-grid">
          {displayFor('towing').map((s) => <ServiceTile key={s.id} service={s} variant="inside" onSelect={go} />)}
        </div>
      </section>
    ),
    video: (
      <div key="video" className="px-4 mt-6">
        <div className="rounded-[20px] overflow-hidden bg-gradient-to-br from-orange-600 to-orange-700 p-5" data-testid="video-consulting-section">
          <h3 className={`text-[20px] font-extrabold text-white ${HEAD}`}>Consultation Vidéo</h3>
          <p className={`text-[13px] text-white/80 mt-1 ${BODY}`}>Réservez une consultation vidéo avec des tuteurs, avocats, médecins et plus.</p>
          <div className="flex gap-2.5 mt-4 overflow-x-auto scrollbar-hide">
            {videoCategories.map((cat) => (
              <button key={cat.id} onClick={() => navigate('/video-consult')} className="flex-shrink-0 bg-white rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm" data-testid={`video-${cat.id}-btn`}>
                <ArrowRight size={12} weight="bold" className="text-[#0B1426] bg-slate-100 rounded-full p-[2px]" />
                <span className={`text-[13px] font-bold text-[#1F2430] ${HEAD}`}>{cat.name}</span>
                <VideoCamera size={16} weight="duotone" className="text-teal-600" />
              </button>
            ))}
            <button onClick={() => navigate('/video-consult')} className="flex-shrink-0 bg-white/15 rounded-xl px-4 py-2.5 flex items-center gap-2" data-testid="video-more-btn">
              <span className={`text-[13px] font-bold text-white ${HEAD}`}>Plus</span>
              <ArrowRight size={16} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    ),
    pet: (
      <section key="pet" className="px-4 mt-6">
        <SectionHeader title={st('pet', "Services Animaux")} />
        <div className="grid grid-cols-3 gap-3">
          {displayFor('pet').map((s) => <ServiceTile key={s.id} service={s} variant="inside" onSelect={go} />)}
        </div>
      </section>
    ),
    parking: (
      <div key="parking" className="px-4 mt-6">
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate('/parking')} className="w-full rounded-[20px] bg-blue-50/70 border border-blue-100 p-5 flex items-center gap-4 text-left" data-testid="parking-section-btn">
          <div className="flex-1">
            <h3 className={`text-lg font-extrabold text-[#1F2430] ${HEAD}`}>Parking</h3>
            <p className={`text-[12px] text-[#475569] mt-1 leading-relaxed ${BODY}`}>Trouvez et réservez une place de parking à proximité. Paiement en ligne, accès facile.</p>
          </div>
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-white flex items-center justify-center shadow-sm"><MapPin size={32} weight="duotone" className="text-blue-600" /></div>
        </motion.button>
      </div>
    ),
    giftcards: (
      <div key="giftcards" className="px-4 mt-6">
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate('/giftcards')} className="w-full rounded-[20px] bg-orange-50/70 border border-orange-100 p-5 flex items-center gap-4 text-left" data-testid="giftcards-section-btn">
          <div className="flex-1">
            <h3 className={`text-lg font-extrabold text-[#1F2430] ${HEAD}`}>Cartes Cadeaux</h3>
            <p className={`text-[12px] text-[#475569] mt-1 leading-relaxed ${BODY}`}>Offrez du crédit SB Drive VTC à vos proches. Disponible de 10€ à 200€.</p>
          </div>
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-white flex items-center justify-center shadow-sm"><Star size={32} weight="duotone" className="text-[#FF5000]" /></div>
        </motion.button>
      </div>
    ),
    carpool: (
      <div key="carpool" className="px-4 mt-6">
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate('/carpool')} className="w-full rounded-[20px] bg-emerald-50/80 border border-emerald-100 p-5 flex items-center gap-4 text-left" data-testid="carpool-section-btn">
          <div className="flex-1">
            <h3 className={`text-[20px] font-extrabold text-[#1F2430] ${HEAD}`}>Covoiturage</h3>
            <p className={`text-[12px] text-[#475569] mt-1 leading-relaxed ${BODY}`}>Voyagez ? Réservez un covoiturage à petit prix. Vous conduisez ? Publiez votre trajet et gagnez de l&apos;argent.</p>
          </div>
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-white flex items-center justify-center shadow-sm"><UsersThree size={36} weight="duotone" className="text-emerald-600" /></div>
        </motion.button>
      </div>
    ),
    tracking: (
      <section key="tracking" className="px-4 mt-6">
        <SectionHeader title={st('tracking', "Suivi Famille & Employés")} />
        <div className="grid grid-cols-2 gap-3" data-testid="tracking-section">
          <motion.button whileTap={{ scale: 0.96 }} className="rounded-[20px] bg-rose-50/60 border border-rose-100 p-4 flex flex-col items-center text-center" data-testid="track-family-btn" onClick={() => navigate('/tracking')}>
            <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mb-2 shadow-sm"><UsersFour size={32} weight="duotone" className="text-rose-500" /></div>
            <h4 className={`text-sm font-extrabold text-[#1F2430] ${HEAD}`}>Famille</h4>
            <p className={`text-[10px] text-[#475569] mt-1 leading-relaxed ${BODY}`}>Voyez où se trouvent vos proches en temps réel pour leur sécurité.</p>
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} className="rounded-[20px] bg-emerald-50/60 border border-emerald-100 p-4 flex flex-col items-center text-center" data-testid="track-employees-btn" onClick={() => navigate('/tracking')}>
            <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mb-2 shadow-sm"><Briefcase size={32} weight="duotone" className="text-emerald-600" /></div>
            <h4 className={`text-sm font-extrabold text-[#1F2430] ${HEAD}`}>Employés</h4>
            <p className={`text-[10px] text-[#475569] mt-1 leading-relaxed ${BODY}`}>Suivez la localisation de vos employés en temps réel.</p>
          </motion.button>
        </div>
      </section>
    ),
    nearby: (
      <section key="nearby" className="px-4 mt-6 mb-4">
        <SectionHeader title={st('nearby', "Commerces Proches")} />
        <div className="grid grid-cols-4 gap-3">
          {displayFor('nearby').map((s) => <ServiceTile key={s.id} service={s} onSelect={go} />)}
        </div>
      </section>
    ),
    walletCard: homeWallet ? (
      <section key="walletCard" className="px-4 mt-6" data-testid="wallet-card-section">
        <div className="rounded-2xl bg-gradient-to-br from-[#FF6B1A] to-[#E63900] shadow-[0_10px_22px_-14px_rgba(230,57,0,0.6)] px-3.5 py-2.5 flex items-center gap-2.5">
          <div className="min-w-0">
            <p className={`text-[9.5px] font-bold text-white/75 leading-none ${BODY}`}>S3 Pay · Solde</p>
            <p className={`text-[17px] font-extrabold text-white leading-tight mt-0.5 ${HEAD}`}>
              {homeWallet.balance?.toFixed(2).replace('.', ',')} {homeWallet.currency === 'EUR' ? '€' : homeWallet.currency}
            </p>
          </div>
          <span className="flex items-center gap-1 text-white/90 text-[11px] font-bold shrink-0">
            <Tag size={12} weight="fill" /> {homeDeals.length}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-1 shrink-0">
            {[
              { key: 'envoyer', icon: PaperPlaneTilt, path: '/wallet', label: 'Envoyer' },
              { key: 'recevoir', icon: ArrowDown, path: '/wallet', label: 'Recevoir' },
              { key: 'scan', icon: QrCode, path: '/pay', label: 'Scanner QR' },
              { key: 'historique', icon: ClockCounterClockwise, path: '/wallet', label: 'Historique' },
            ].map((a) => (
              <button
                key={a.key}
                onClick={() => navigate(a.path)}
                data-testid={`wallet-action-${a.key}`}
                aria-label={a.label}
                title={a.label}
                className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center"
              >
                <a.icon size={13} className="text-white" />
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate('/wallet')}
            data-testid="wallet-recharger-btn"
            className={`h-8 px-3 rounded-full bg-white text-[#E63900] font-extrabold text-[11px] shrink-0 ${HEAD}`}
          >
            Recharger
          </button>
        </div>
      </section>
    ) : null,
    deals: homeDeals.length > 0 ? (
      <section key="deals" className="px-4 mt-6" data-testid="deals-section">
        <SectionHeader title="Offres pour vous" actionLabel="Voir tout" onAction={() => navigate('/bons-plans')} />
        <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-1">
          {homeDeals.map((c, i) => {
            const palette = ['#0B1426', '#16A34A', '#7C3AED', '#1E3A8A'];
            const bg = palette[i % palette.length];
            const pct = c.discount_type === 'Percentage';
            return (
              <button
                key={c.code}
                onClick={() => navigate('/bons-plans')}
                data-testid={`home-deal-${c.code}`}
                className="snap-start shrink-0 w-[150px] h-[104px] rounded-2xl p-3 text-left flex flex-col justify-between"
                style={{ background: bg }}
              >
                <span className={`text-[17px] font-extrabold text-white ${HEAD}`}>
                  {pct ? `-${c.discount_value}%` : `-${c.discount_value}€`}
                </span>
                <span className={`text-[11px] font-semibold text-white/90 leading-tight line-clamp-2 ${BODY}`}>
                  {c.description || c.code}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    ) : null,
    nearbyBiz: nearbyFeatured.length > 0 ? (
      <section key="nearbyBiz" className="mt-6" data-testid="nearby-biz-section">
        <div className="px-4">
          <SectionHeader title={st('nearbyBiz', "Commerces à proximité")} actionLabel="Voir tout" onAction={() => navigate('/nearby')} />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pb-3">
          {[
            { label: 'Restaurants', category: 'Restaurant', icon: ForkKnife },
            { label: 'Pharmacies', category: 'Pharmacie', icon: FirstAid },
            { label: 'Boulangeries', category: 'Boulangerie', icon: Storefront },
            { label: 'Shopping', category: 'Shopping', icon: ShoppingBag },
            { label: 'Cafés', category: 'Café', icon: Coffee },
          ].map((c) => (
            <button
              key={c.category}
              onClick={() => navigate(`/nearby?category=${encodeURIComponent(c.category)}`)}
              data-testid={`nearby-chip-${c.category}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 shrink-0"
            >
              <c.icon size={14} className="text-[#FF6B1A]" />
              <span className={`text-xs font-semibold text-[#1F2430] ${BODY}`}>{c.label}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-4 pb-1">
          {nearbyFeatured.map((biz) => (
            <button
              key={biz.id || biz.name}
              onClick={() => navigate('/nearby')}
              data-testid={`nearby-biz-${biz.id || biz.name}`}
              className="snap-start shrink-0 w-[220px] rounded-2xl overflow-hidden bg-white border border-slate-100 shadow-sm text-left"
            >
              <div className="relative h-28 bg-slate-100">
                {biz.image && <img src={biz.image} alt={biz.name} className="w-full h-full object-cover" />}
                {biz.open_now !== false && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold">Ouvert</span>
                )}
              </div>
              <div className="p-3">
                <p className={`font-bold text-sm text-[#1F2430] truncate ${HEAD}`}>{biz.name}</p>
                <p className={`text-xs text-[#94A3B8] truncate mt-0.5 ${BODY}`}>{biz.category}</p>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-[#64748B]">
                  {biz.rating != null && (
                    <span className="flex items-center gap-0.5 font-bold text-[#1F2430]">
                      <Star size={12} weight="fill" className="text-amber-400" /> {biz.rating}
                    </span>
                  )}
                  {biz.distance_km != null && (
                    <span className="flex items-center gap-0.5">
                      <MapPin size={12} /> {biz.distance_km} km
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
    ) : null,
    activity: recentActivity.length > 0 ? (
      <section key="activity" className="px-4 mt-6" data-testid="activity-section">
        <SectionHeader title={st('activity', "Activités récentes")} actionLabel="Tout" onAction={() => navigate('/history')} />
        <div className="space-y-2.5">
          {recentActivity.map((r) => (
            <button
              key={r.id}
              onClick={() => navigate(`/ride/${r.id}`)}
              data-testid={`activity-${r.id}`}
              className="w-full flex items-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm px-3.5 py-3 text-left"
            >
              <span className="w-10 h-10 rounded-full bg-[#FFF0E5] flex items-center justify-center shrink-0">
                <Taxi size={18} className="text-[#FF5000]" />
              </span>
              <span className="min-w-0 flex-1">
                <p className={`text-sm font-bold text-[#1F2430] truncate ${HEAD}`}>
                  Course {r.vehicle_type || 'VTC'} · {r.pickup_address || '—'}
                </p>
                <p className={`text-xs text-[#94A3B8] truncate mt-0.5 ${BODY}`}>
                  {r.status === 'completed' ? 'Terminée' : r.status === 'cancelled' ? 'Annulée' : 'En cours'}
                  {r.final_fare ?? r.estimated_fare ? ` · ${r.final_fare ?? r.estimated_fare} €` : ''}
                </p>
              </span>
              <ChevR size={16} className="text-slate-300 shrink-0" />
            </button>
          ))}
        </div>
      </section>
    ) : null,
  };

  // User-defined section order. First the 11 prioritised sections, then the
  // remaining sections kept at the bottom (their original relative order).
  // Section order/visibility is admin-configurable (home_sections); fall back to the
  // curated default order, and only render blocks we actually have.
  // Consolidated default: the 21-tile "Nos services" grid replaces the old
  // stack of one-section-per-vertical blocks (still defined above, and still
  // renderable, for an admin who explicitly customises the order via CMS).
  const DEFAULT_SECTION_ORDER = ['activeOrder', 'rideModes', 'promo', 'walletCard', 'services', 'deals', 'nearbyBiz', 'activity'];
  const SECTION_ORDER = sectionOrder && sectionOrder.length ? sectionOrder : DEFAULT_SECTION_ORDER;
  // "travel"/"events" are covered by the "services" (Nos services) grid now —
  // both stay defined and renderable in `blocks` if an admin re-enables them
  // explicitly via the CMS layout editor, but neither is force-inserted here.
  const ORDERED_SECTIONS = SECTION_ORDER;

  return (
    <div className={`mobile-container min-h-screen pb-36 bg-white text-[#1F2430] ${BODY}`}>
      {/* ===== STICKY HEADER — SB Drive orange ===== */}
      <header className="sticky top-0 z-40 bg-gradient-to-br from-[#FF6B1A] to-[#E63900] px-4 pt-4 pb-4 rounded-b-[26px]">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className={`text-[15px] font-bold text-white/95 leading-none flex items-center gap-1.5 ${BODY}`}>
              {greeting} <span aria-hidden="true">👋</span>
            </p>
            <h2 className={`text-[19px] font-extrabold text-white truncate leading-tight mt-1 ${HEAD}`}>{user?.name || 'Utilisateur'}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button className="relative w-10 h-10 rounded-full bg-[#0B1426] flex items-center justify-center shrink-0" data-testid="notifications-btn" onClick={() => navigate('/actualites')}>
              <Bell size={19} className="text-white" />
              {unreadCount > 0 && (
                <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF5000] text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-[#E63900] ${badgePulse ? 'animate-bounce' : ''}`} data-testid="unread-badge">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <Avatar className="h-10 w-10 rounded-full border-2 border-white cursor-pointer shrink-0" onClick={() => setShowMenu(true)} data-testid="menu-btn">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="rounded-full bg-[#0B1426] text-white font-bold text-sm">{user?.name?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* Location */}
        <button className="flex items-center gap-1.5 mt-3.5 max-w-full" data-testid="location-bar" onClick={() => setShowLocModal(true)}>
          <MapPin size={16} weight="fill" className="text-white shrink-0" />
          <span className={`text-[13.5px] font-semibold text-white truncate ${BODY}`} data-testid="location-label">{locLabel}</span>
          <CaretDown size={14} className="text-white/80 shrink-0" />
        </button>

        {/* Search + Planifier */}
        <div className="mt-3.5 flex items-center gap-2">
          <button className="flex-1 h-12 rounded-2xl bg-white flex items-center px-4 gap-3 min-w-0 shadow-[0_8px_20px_-10px_rgba(11,20,38,0.4)]" onClick={() => setShowSearch(true)} data-testid="search-services-bar">
            <MagnifyingGlass size={20} className="text-[#FF6B1A] shrink-0" />
            <span className={`text-sm text-[#94A3B8] truncate ${BODY}`}>{t('user_home.where_to')}</span>
          </button>
          <button className="h-12 px-3.5 rounded-2xl bg-white flex items-center gap-1.5 shrink-0 shadow-[0_8px_20px_-10px_rgba(11,20,38,0.4)]" onClick={() => navigate('/scheduled-rides')} data-testid="plan-ride-btn">
            <CalendarPlus size={18} className="text-[#FF6B1A]" />
            <span className={`text-sm font-bold text-[#FF6B1A] ${HEAD}`}>Planifier</span>
            <CaretDown size={12} className="text-[#FF6B1A]" />
          </button>
        </div>
      </header>

      {/* Search Overlay */}
      {showSearch && <SearchOverlay onClose={() => setShowSearch(false)} />}
      {showDeliverySearch && <DeliverySearchOverlay onClose={() => setShowDeliverySearch(false)} />}
      {/* Side menu drawer */}
      <SideMenuDrawer open={showMenu} onClose={() => setShowMenu(false)} variant="user" />
      <LocationSelectorModal
        open={showLocModal}
        currentLabel={locLabel}
        onClose={() => setShowLocModal(false)}
        onSelect={(loc) => setLocLabel(loc.label || loc.address || locLabel)}
      />

      <DebtBanner />
      {/* Bannières d'accueil pilotées depuis l'admin (ordre, visibilité, zone, horaires, fermeture) */}
      {homeBanners
        .filter((b) => !isDismissed(`home:${b.id}:${b.updated_at || ''}`))
        .map((b) => (
          <div key={b.id} className="mx-4 mt-3" data-testid={`home-banner-wrap-${b.key}`}>
            <HomeFeatureBanner
              b={b}
              onClick={() => { homeBannersAPI.click(b.id, { location: locLabelRef.current }).catch(() => {}); navigate(b.target_route || '/'); }}
              onDismiss={b.dismissible ? () => { dismissBanner(`home:${b.id}:${b.updated_at || ''}`); homeBannersAPI.dismiss(b.id, { location: locLabelRef.current }).catch(() => {}); } : null}
            />
          </div>
        ))}
      {false && <DisruptionBanner strikesOnly vtcRoute="/course?mode=standard" className="mt-3" />}

      {/* Referral progress nudge — reminds the referred user how close their reward is */}
      {pendingRef && (
        <button
          onClick={() => navigate('/referral')}
          className="mx-4 mt-3 w-[calc(100%-2rem)] flex items-center gap-3 rounded-2xl px-4 py-3 text-left bg-gradient-to-br from-[#FF5000] to-[#ff7a3d] text-white shadow-sm active:scale-[0.99] transition-transform"
          data-testid="referral-progress-banner"
        >
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <Gift size={22} weight="fill" className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-extrabold leading-tight ${HEAD}`} data-testid="referral-progress-text">
              {pendingRef.remaining <= 1
                ? `Plus qu'une course pour débloquer vos ${pendingRef.reward_amount}${pendingRef.currency} !`
                : `Plus que ${pendingRef.remaining} courses pour débloquer vos ${pendingRef.reward_amount}${pendingRef.currency} !`}
            </p>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/30 overflow-hidden">
              <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, Math.round((pendingRef.referred_ride_count / pendingRef.rides_required) * 100))}%` }} data-testid="referral-progress-bar" />
            </div>
          </div>
          <ChevR size={18} weight="bold" className="text-white/90 shrink-0" />
        </button>
      )}

      <LoyaltyStatusCard onClick={() => navigate('/loyalty')} className="mx-4 mt-3" />

      <motion.main initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="pt-1">
        {/* Désactivé à la demande : section « Vos raccourcis » (mettre true pour réactiver) */}
        {false && mergedShortcuts.length >= 2 && (
          <section className="px-4 mt-5" data-testid="shortcuts-section">
            <SectionHeader title="Vos raccourcis" />
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
              {mergedShortcuts.map((s) => (
                <button key={s.id || s.path} onClick={() => go(s)} data-testid={`shortcut-${s.id || s.path}`} className="flex flex-col items-center shrink-0 w-[64px]">
                  <div className={`w-14 h-14 rounded-2xl ${s.bg || 'bg-slate-100'} flex items-center justify-center border border-white shadow-[0_6px_16px_-10px_rgba(11,20,38,0.22)]`}>
                    <DynamicIcon name={s.iconName} imageUrl={s.imageUrl} size={28} className={s.iconColor} />
                  </div>
                  <span className={`text-[10.5px] font-bold text-[#1F2430] text-center leading-tight mt-1.5 whitespace-pre-line line-clamp-2 ${HEAD}`}>{s.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {/* Désactivé à la demande : section « Tendances près de vous » (mettre true pour réactiver) */}
        {false && trendingShown.length >= 2 && (
          <section className="px-4 mt-5" data-testid="trending-section">
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendUp size={17} weight="bold" className="text-[#FF5000]" />
              <h2 className={`text-[15px] font-extrabold text-[#0B1426] ${HEAD}`}>Tendances près de vous</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
              {trendingShown.map((s) => (
                <button key={s.id} onClick={() => go(s)} data-testid={`trending-${s.id}`} className="relative flex flex-col items-center shrink-0 w-[64px]">
                  <div className={`relative w-14 h-14 rounded-2xl ${s.bg || 'bg-slate-100'} flex items-center justify-center border border-white shadow-[0_6px_16px_-10px_rgba(11,20,38,0.22)]`}>
                    <DynamicIcon name={s.iconName} imageUrl={s.imageUrl} size={28} className={s.iconColor} />
                    <span className="absolute -top-1.5 -right-1 z-10 w-4 h-4 rounded-full bg-[#FF5000] flex items-center justify-center shadow"><TrendUp size={9} weight="bold" className="text-white" /></span>
                  </div>
                  <span className={`text-[10.5px] font-bold text-[#1F2430] text-center leading-tight mt-1.5 whitespace-pre-line line-clamp-2 ${HEAD}`}>{s.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {ORDERED_SECTIONS.map((key) => blocks[key])}
      </motion.main>

      {/* ===== BOTTOM NAVIGATION — Accueil / Activités / scan / Messages / Profil ===== */}
      <BottomTabBar />
    </div>
  );
};

export default UserHome;
