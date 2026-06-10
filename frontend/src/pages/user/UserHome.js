import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import SearchOverlay from '../../components/SearchOverlay';
import DeliverySearchOverlay from '../../components/DeliverySearchOverlay';
import SideMenuDrawer from '../../components/SideMenuDrawer';
import { useLocale } from '../../contexts/LocaleContext';
import DynamicIcon from '../../components/DynamicIcon';
import DebtBanner from '../../components/DebtBanner';
import { DisruptionBanner } from '../../components/transport/transportAlerts';
import { MODES } from './taxihub/taxiHubConstants';
import { prefetchPath } from '../../routes/useRoutePrefetch';
import { homeCategoriesAPI, promoBannersAPI, configAPI, serviceTrendsAPI, zonesAPI } from '../../services/api';
import { getBrowserLocationLabel, getBrowserZoneContext } from '../../lib/browserZone';
import { LoyaltyStatusCard } from '../../components/LoyaltyStatusCard';
import { useServiceShortcuts } from '../../hooks/useServiceShortcuts';
import {
  TAXI_DEFAULT, TAXI_VISUAL, taxiServices, deliveryServices, videoCategories,
  onDemandServices, beautyServices, petServices, bidServices, carCareServices,
  towingServices, nearbyServices,
} from './userHomeServices';
import {
  House, MapPin, Wallet, User,
  CaretRight, CaretDown, Star, UsersThree, Taxi, TrendUp,
  MagnifyingGlass, GridFour, List, ClipboardText,
  VideoCamera, FirstAid, ArrowRight, Lightning,
  Stethoscope, UsersFour, Briefcase, Bag, Pill, Gift, CaretRight as ChevR,
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
  if (service.iconName || service.imageUrl) {
    return <DynamicIcon name={service.iconName} imageUrl={service.imageUrl} size={size} className={service.iconColor} />;
  }
  return <service.icon size={size} weight="duotone" className={service.iconColor} />;
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
      <div className={`relative w-full aspect-square rounded-2xl ${service.bg} flex items-center justify-center border border-white shadow-[0_6px_16px_-10px_rgba(11,20,38,0.22)] transition-transform group-hover:-translate-y-0.5`}>
        <TileBadge label={service.badge} />
        <Visual service={service} size={34} />
      </div>
      <span className={`text-[11.5px] font-bold text-[#1F2430] text-center leading-[1.15] mt-2 whitespace-pre-line ${HEAD}`}>{service.name}</span>
    </motion.button>
  );
};

// ── Plain bold section title (V3Cube look) ──
const SectionHeader = ({ title, sub }) => (
  <div className="mb-3.5">
    <h3 className={`text-[20px] font-extrabold text-[#1F2430] tracking-tight ${HEAD}`}>{title}</h3>
    {sub && <p className={`text-xs text-[#64748B] mt-1 leading-snug ${BODY}`}>{sub}</p>}
  </div>
);

const UserHome = () => {
  const { user } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const { shortcuts, recordTap } = useServiceShortcuts();
  const [trending, setTrending] = useState([]);
  const [zoneShortcuts, setZoneShortcuts] = useState([]);
  const zoneRef = useRef('');
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
  useEffect(() => {
    let alive = true;
    const fetchUnread = () => {
      axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/push/unread-count`, { withCredentials: true })
        .then((r) => { if (alive) setUnreadCount(r.data?.count || 0); })
        .catch(() => {});
    };
    fetchUnread();
    const iv = setInterval(fetchUnread, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  const [cmsItems, setCmsItems] = useState([]);
  const [sectionOrder, setSectionOrder] = useState(null);
  const [taxiCats, setTaxiCats] = useState([]);
  const [pendingRef, setPendingRef] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/referral/my-pending`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.pending && d.remaining > 0) setPendingRef(d); })
      .catch(() => {});
  }, []);
  const [promoBanners, setPromoBanners] = useState([]);
  const promoRef = useRef(null);
  const promoIdx = useRef(0);
  const greeting = new Date().getHours() < 18 ? 'Bienvenue' : 'Bonsoir';

  // Load admin-configured home categories (CMS). Falls back to hardcoded arrays if empty.
  useEffect(() => {
    homeCategoriesAPI.public()
      .then((r) => {
        setCmsItems(r.data.items || []);
        setSectionOrder(Array.isArray(r.data.section_order) && r.data.section_order.length ? r.data.section_order : null);
      })
      .catch((e) => console.warn('home categories load:', e?.message || e));
    // Taxi services come from "Gérer les catégories" (service_categories) → single source of truth.
    configAPI.getServiceCategories()
      .then((r) => setTaxiCats(Array.isArray(r.data) ? r.data : (r.data.items || [])))
      .catch((e) => console.warn('service categories load:', e?.message || e));
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
    if (!cms.length) return sectionFallback[key] || [];
    const visible = cms.filter((i) => i.visible_home).map((i) => ({
      id: i.id, name: i.label_fr, iconName: i.icon_name, imageUrl: i.image_url,
      bg: i.bg_class, iconColor: i.icon_color_class, path: i.target_route, badge: i.badge || '',
    }));
    if (cms.some((i) => !i.visible_home)) {
      visible.push({ id: `${key}-more`, name: 'Plus de\nServices', iconName: 'GridFour', bg: 'bg-slate-100', iconColor: 'text-gray-600', path: sectionAllRoute[key] });
    }
    return visible;
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
    if (!home.length) home = active.slice(0, 7);
    const tiles = home.map((c) => {
      const v = TAXI_VISUAL[c.key] || TAXI_DEFAULT;
      // Home taxi tiles always use the clean Phosphor icon (not the uploaded photo)
      // for a consistent, icon-based look across the app.
      return { id: `svccat-${c.key}`, name: c.name, icon: v.icon, bg: v.bg, iconColor: v.iconColor, path: `/course?mode=${c.key}` };
    });
    tiles.push({ id: 'more-taxi', name: 'Tous les\nTaxis', icon: GridFour, bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/taxi' });
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
      }));
  })();

  // ── Section render blocks (keyed) so we can order them declaratively ──
  const blocks = {
    taxi: (
      <section key="taxi" className="px-4 mt-6">
        <SectionHeader title="Services Taxi" />
        <div className="grid grid-cols-4 gap-3">
          {(taxiTiles || displayFor('taxi')).map((s) => <ServiceTile key={s.id} service={s} onSelect={go} />)}
        </div>
        {taxiBanners.length > 0 && (
          <div className="mt-3 space-y-3" data-testid="taxi-banner-cards">
            {taxiBanners.map((b) => (
              <button
                key={b.key}
                onClick={() => navigate(b.path)}
                data-testid={`taxi-banner-${b.key}`}
                className="relative w-full h-28 rounded-2xl overflow-hidden text-left shadow-sm active:scale-[0.99] transition-transform"
              >
                <img src={b.image} alt={b.name} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
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
    promo: (
      promoBanners.length > 0 ? (
        <div key="promo" className="mt-5" data-testid="promo-banner-carousel">
          <div ref={promoRef} className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-4 pb-1">
            {promoBanners.map((b) => {
              const dark = b.theme === 'dark';
              return (
                <motion.button
                  key={b.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => b.target_route && navigate(b.target_route)}
                  data-testid={`promo-banner-${b.id}`}
                  className="snap-start shrink-0 w-[86%] rounded-[20px] overflow-hidden border border-slate-100 shadow-sm flex items-stretch h-[140px] text-left"
                  style={{ background: dark ? (b.bg_color || '#FF5000') : '#FFFFFF' }}
                >
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
        </div>
      ) : null
    ),
    delivery: (
      <section key="delivery" className="px-4 mt-6">
        <SectionHeader title="Services de Livraison" />
        <div className="grid grid-cols-4 gap-3">
          {displayFor('delivery').map((s) => <ServiceTile key={s.id} service={s} onSelect={go} />)}
        </div>
      </section>
    ),
    parcel: (
      <section key="parcel" className="px-4 mt-6">
        <SectionHeader title="Colis & Coursier" />
        <div className="grid grid-cols-4 gap-3">
          {displayFor('parcel').map((s) => <ServiceTile key={s.id} service={s} onSelect={go} />)}
        </div>
      </section>
    ),
    marketplace: (
      <section key="marketplace" className="px-4 mt-6">
        <SectionHeader title="Acheter, Vendre & Louer" />
        <div className="grid grid-cols-4 gap-3">
          {displayFor('marketplace').map((s) => <ServiceTile key={s.id} service={s} onSelect={go} />)}
        </div>
      </section>
    ),
    beauty: (
      <section key="beauty" className="px-4 mt-6">
        <SectionHeader title="Services Beauté" />
        <div className="grid grid-cols-4 gap-3">
          {displayFor('beauty').map((s) => <ServiceTile key={s.id} service={s} onSelect={go} />)}
        </div>
      </section>
    ),
    medical: (
      <section key="medical" className="px-4 mt-6">
        <SectionHeader title="Services Médicaux" />
        <div className="grid grid-cols-2 gap-3" data-testid="medical-services-section">
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => navigate('/medical/appointment')} className="row-span-2 rounded-[20px] bg-blue-50/70 border border-blue-100 p-4 flex flex-col text-left" data-testid="medical-appointment-btn">
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
      </section>
    ),
    ondemand: (
      <section key="ondemand" className="px-4 mt-6">
        <SectionHeader title="Services à la demande" />
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
        <SectionHeader title="Entretien Auto" />
        <div className="grid grid-cols-4 gap-3">
          {displayFor('carcare').map((s) => <ServiceTile key={s.id} service={s} onSelect={go} />)}
        </div>
      </section>
    ),
    towing: (
      <section key="towing" className="px-4 mt-6">
        <SectionHeader title="Dépannage & Remorquage" sub="Assistance routière 24/7 — pneu crevé, démarrage, panne sèche et plus." />
        <div className="grid grid-cols-3 gap-3" data-testid="towing-grid">
          {displayFor('towing').map((s) => <ServiceTile key={s.id} service={s} variant="inside" onSelect={go} />)}
        </div>
      </section>
    ),
    genie: (
      <section key="genie" className="px-4 mt-6">
        <SectionHeader title="Livraison Genie & Runner" />
        <div className="grid grid-cols-2 gap-3" data-testid="genie-runner-section">
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => navigate('/runner?mode=genie')} className="rounded-[20px] bg-indigo-50/60 border border-indigo-100 p-4 flex flex-col text-left h-[200px]" data-testid="delivery-genie-btn">
            <h4 className={`text-sm font-extrabold text-[#1F2430] ${HEAD}`}>Delivery Genie</h4>
            <p className={`text-[11px] text-[#475569] mt-1 leading-relaxed flex-1 ${BODY}`}>Engagez un Genie pour ACHETER des articles à votre place dans le magasin de votre choix.</p>
            <div className="flex justify-center mt-2"><div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-sm"><Bag size={32} weight="duotone" className="text-blue-600" /></div></div>
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => navigate('/runner')} className="rounded-[20px] bg-rose-50/60 border border-rose-100 p-4 flex flex-col text-left h-[200px]" data-testid="delivery-runner-btn">
            <h4 className={`text-sm font-extrabold text-[#1F2430] ${HEAD}`}>Delivery Runner</h4>
            <p className={`text-[11px] text-[#475569] mt-1 leading-relaxed flex-1 ${BODY}`}>Engagez des Coursiers pour récupérer et livrer de petits articles en ville.</p>
            <div className="flex justify-center mt-2"><div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-sm"><Lightning size={32} weight="duotone" className="text-rose-600" /></div></div>
          </motion.button>
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
        <SectionHeader title="Services Animaux" />
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
        <SectionHeader title="Suivi Famille & Employés" />
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
        <SectionHeader title="Commerces Proches" />
        <div className="grid grid-cols-4 gap-3">
          {displayFor('nearby').map((s) => <ServiceTile key={s.id} service={s} onSelect={go} />)}
        </div>
      </section>
    ),
  };

  // User-defined section order. First the 11 prioritised sections, then the
  // remaining sections kept at the bottom (their original relative order).
  // Section order/visibility is admin-configurable (home_sections); fall back to the
  // curated default order, and only render blocks we actually have.
  const DEFAULT_SECTION_ORDER = [
    'taxi', 'promo', 'delivery', 'parcel', 'marketplace', 'beauty', 'medical',
    'ondemand', 'bid', 'carcare', 'towing',
    'genie', 'video', 'pet', 'parking', 'giftcards', 'carpool', 'tracking', 'nearby',
  ];
  const SECTION_ORDER = sectionOrder && sectionOrder.length ? sectionOrder : DEFAULT_SECTION_ORDER;

  return (
    <div className={`mobile-container min-h-screen pb-36 bg-white text-[#1F2430] ${BODY}`}>
      {/* ===== STICKY HEADER (V3Cube look) ===== */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <button className="relative w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0" data-testid="menu-btn" onClick={() => setShowMenu(true)}>
              <List size={20} className="text-[#1F2430]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF5000] text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white" data-testid="unread-badge">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <div className="min-w-0">
              <p className={`text-[11px] text-[#94A3B8] leading-none ${BODY}`}>{greeting}</p>
              <h2 className={`text-[18px] font-extrabold text-[#1F2430] truncate leading-tight mt-0.5 ${HEAD}`}>{user?.name || 'Utilisateur'}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Avatar className="h-10 w-10 rounded-2xl border border-slate-200 cursor-pointer" onClick={() => navigate('/profile')}>
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="rounded-2xl bg-[#FFF0E5] text-[#FF5000] font-bold text-sm">{user?.name?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* Location */}
        <button className="flex items-center gap-1.5 mt-3 max-w-full" data-testid="location-bar">
          <MapPin size={16} weight="fill" className="text-[#FF5000] shrink-0" />
          <span className={`text-[13px] font-semibold text-[#334155] truncate ${BODY}`}>Paris, Île-de-France, France</span>
          <CaretDown size={14} className="text-[#64748B] shrink-0" />
        </button>

        {/* Search */}
        <button className="mt-3 w-full h-12 rounded-2xl bg-white border border-slate-200 shadow-[0_4px_14px_-8px_rgba(11,20,38,0.18)] flex items-center px-4 gap-3" onClick={() => setShowSearch(true)} data-testid="search-services-bar">
          <MagnifyingGlass size={20} className="text-[#94A3B8]" />
          <span className={`text-sm text-[#94A3B8] ${BODY}`}>{t('user_home.where_to')}</span>
        </button>
      </header>

      {/* Search Overlay */}
      {showSearch && <SearchOverlay onClose={() => setShowSearch(false)} />}
      {showDeliverySearch && <DeliverySearchOverlay onClose={() => setShowDeliverySearch(false)} />}
      {/* Side menu drawer */}
      <SideMenuDrawer open={showMenu} onClose={() => setShowMenu(false)} variant="user" />

      <DebtBanner />
      {/* Désactivé à la demande : bannière grève (mettre true pour réactiver) */}
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
        {SECTION_ORDER.map((key) => blocks[key])}
      </motion.main>

      {/* ===== BOTTOM NAVIGATION (floating dark pill) ===== */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50 px-4 pb-3 pointer-events-none">
        <div className="bg-[#0B1426] rounded-full px-2.5 py-2 flex items-center justify-between shadow-[0_10px_30px_rgba(11,20,38,0.35)] pointer-events-auto">
          <button className="flex items-center gap-2 bg-[#FF5000] text-white pl-3.5 pr-4 py-2.5 rounded-full" data-testid="nav-home">
            <House size={20} weight="fill" />
            <span className={`text-xs font-bold ${HEAD}`}>{t('tabs.home')}</span>
          </button>
          <button className="flex-1 flex flex-col items-center gap-0.5 text-slate-400 py-1" onClick={() => navigate('/history')} data-testid="nav-bookings">
            <ClipboardText size={22} weight="regular" />
            <span className="text-[10px] font-medium">{t('tabs.orders')}</span>
          </button>
          <button className="flex-1 flex flex-col items-center gap-0.5 text-slate-400 py-1" onClick={() => navigate('/wallet')} data-prefetch="/wallet" data-testid="nav-wallet">
            <Wallet size={22} weight="regular" />
            <span className="text-[10px] font-medium">{t('tabs.wallet')}</span>
          </button>
          <button className="flex-1 flex flex-col items-center gap-0.5 text-slate-400 py-1" onClick={() => navigate('/profile')} data-prefetch="/profile" data-testid="nav-profile">
            <User size={22} weight="regular" />
            <span className="text-[10px] font-medium">{t('tabs.profile')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserHome;
