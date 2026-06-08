import React, { useState, useEffect, useRef } from 'react';
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
import { MODES } from './taxihub/taxiHubConstants';
import { prefetchPath } from '../../routes/useRoutePrefetch';
import { homeCategoriesAPI, promoBannersAPI, configAPI } from '../../services/api';
import { getBrowserLocationLabel } from '../../lib/browserZone';
import {
  Car, Package, ForkKnife,
  House, MapPin, Wallet, User,
  CaretRight, CaretDown, Star, Wrench, UsersThree,
  Truck, Calendar, Gavel, Storefront,
  Taxi, MagnifyingGlass, GridFour, List, ClipboardText,
  VideoCamera, FirstAid, Scissors,
  PawPrint, GasPump, Broom, ArrowRight,
  Sparkle, Heart, Lightning, Drop, PaintBrush,
  Hammer, Buildings, Coffee, Wine,
  Stethoscope, Dog, UsersFour, Briefcase,
  CarSimple, ShoppingBag, BatteryFull, HandSoap,
  Bicycle, Plug, Key, HairDryer, MaskHappy, Bag, Pill,
  AirplaneTilt, Wheelchair,
} from '@phosphor-icons/react';

const HEAD = "font-['Outfit']";
const BODY = "font-['Manrope']";

// Visual style (icon + pastel colors) per taxi category KEY.
// Names / order / active state come from "Gérer les catégories" (service_categories),
// so the client Home stays in sync with the admin. This map only handles the look.
const TAXI_DEFAULT = { icon: Car, bg: 'bg-gray-50', iconColor: 'text-gray-600' };
const TAXI_VISUAL = {
  standard: { icon: Car, bg: 'bg-amber-50', iconColor: 'text-amber-500' },
  pool: { icon: UsersThree, bg: 'bg-teal-50', iconColor: 'text-teal-500' },
  rental: { icon: Taxi, bg: 'bg-blue-50', iconColor: 'text-blue-500' },
  buddy_driver: { icon: User, bg: 'bg-orange-50', iconColor: 'text-orange-700' },
  bidding: { icon: Gavel, bg: 'bg-pink-50', iconColor: 'text-pink-500' },
  intercity: { icon: Truck, bg: 'bg-green-50', iconColor: 'text-green-600' },
  book_later: { icon: Calendar, bg: 'bg-cyan-50', iconColor: 'text-cyan-600' },
  electric: { icon: Lightning, bg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
  moto: { icon: Bicycle, bg: 'bg-orange-50', iconColor: 'text-orange-500' },
  moto_rental: { icon: Key, bg: 'bg-blue-50', iconColor: 'text-blue-500' },
  airport: { icon: AirplaneTilt, bg: 'bg-sky-50', iconColor: 'text-sky-500' },
  pets: { icon: PawPrint, bg: 'bg-amber-50', iconColor: 'text-amber-600' },
  book_for_someone: { icon: UsersFour, bg: 'bg-purple-50', iconColor: 'text-purple-500' },
  tuktuk: { icon: CarSimple, bg: 'bg-yellow-50', iconColor: 'text-yellow-600' },
  assist: { icon: Heart, bg: 'bg-red-50', iconColor: 'text-red-500' },
  corporate: { icon: Briefcase, bg: 'bg-slate-50', iconColor: 'text-slate-600' },
  access: { icon: Wheelchair, bg: 'bg-sky-50', iconColor: 'text-sky-600' },
};

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
const ServiceTile = ({ service, variant = 'below', onSelect }) => {
  const warm = () => prefetchPath((service.path || '').split('?')[0]);
  if (variant === 'inside') {
    return (
      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={() => onSelect(service.path)}
        onPointerEnter={warm}
        onFocus={warm}
        data-prefetch={(service.path || '').split('?')[0]}
        data-testid={`service-${service.id}-btn`}
        className={`rounded-2xl ${service.bg} px-2 py-3 flex flex-col items-center justify-center gap-2.5 min-h-[112px] border border-white shadow-[0_6px_16px_-10px_rgba(11,20,38,0.22)]`}
      >
        <span className={`text-[12px] font-bold text-[#1F2430] text-center leading-[1.15] whitespace-pre-line ${HEAD}`}>{service.name}</span>
        <Visual service={service} size={36} />
      </motion.button>
    );
  }
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={() => onSelect(service.path)}
      onPointerEnter={warm}
      onFocus={warm}
      data-prefetch={(service.path || '').split('?')[0]}
      data-testid={`service-${service.id}-btn`}
      className="flex flex-col items-center group"
    >
      <div className={`w-full aspect-square rounded-2xl ${service.bg} flex items-center justify-center border border-white shadow-[0_6px_16px_-10px_rgba(11,20,38,0.22)] transition-transform group-hover:-translate-y-0.5`}>
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
  const [showSearch, setShowSearch] = useState(false);
  const [showDeliverySearch, setShowDeliverySearch] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [cmsItems, setCmsItems] = useState([]);
  const [taxiCats, setTaxiCats] = useState([]);
  const [promoBanners, setPromoBanners] = useState([]);
  const promoRef = useRef(null);
  const promoIdx = useRef(0);
  const greeting = new Date().getHours() < 18 ? 'Bienvenue' : 'Bonsoir';

  // Load admin-configured home categories (CMS). Falls back to hardcoded arrays if empty.
  useEffect(() => {
    homeCategoriesAPI.public()
      .then((r) => setCmsItems(r.data.items || []))
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

  // ===== Taxi Services (8 items) =====
  const taxiServices = [
    { id: 'taxi-booking', name: 'VTC\nRéservation', icon: Car, bg: 'bg-amber-50', iconColor: 'text-amber-500', path: '/course?mode=standard' },
    { id: 'taxi-pooling', name: 'VTC\nPooling', icon: UsersThree, bg: 'bg-teal-50', iconColor: 'text-teal-500', path: '/course?mode=pool' },
    { id: 'taxi-rental', name: 'VTC\nLocation', icon: Taxi, bg: 'bg-blue-50', iconColor: 'text-blue-500', path: '/course?mode=rental' },
    { id: 'personal-driver', name: 'Chauffeur\nPrivé', icon: User, bg: 'bg-orange-50', iconColor: 'text-orange-700', path: '/course?mode=buddy_driver' },
    { id: 'taxi-bidding', name: 'Enchères\nVTC', icon: Gavel, bg: 'bg-pink-50', iconColor: 'text-pink-500', path: '/course?mode=bidding' },
    { id: 'taxi-intercity', name: 'VTC\nIntercity', icon: Truck, bg: 'bg-green-50', iconColor: 'text-green-600', path: '/course?mode=intercity' },
    { id: 'schedule-ride', name: 'Programmer\nCourse', icon: Calendar, bg: 'bg-cyan-50', iconColor: 'text-cyan-600', path: '/course?mode=book_later' },
    { id: 'more-taxi', name: 'Tous les\nTaxis', icon: GridFour, bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/taxi' },
  ];

  // ===== Delivery Services (4 items) =====
  const deliveryServices = [
    { id: 'food-delivery', name: 'Livraison\nRepas', icon: ForkKnife, bg: 'bg-rose-50', iconColor: 'text-rose-500', path: '/food' },
    { id: 'grocery-delivery', name: 'Livraison\nCourses', icon: Storefront, bg: 'bg-emerald-50', iconColor: 'text-emerald-500', path: '/food?type=grocery' },
    { id: 'runner-courier', name: 'Coursier\nExpress', icon: Lightning, bg: 'bg-amber-50', iconColor: 'text-amber-500', path: '/runner' },
    { id: 'more-delivery', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-blue-50', iconColor: 'text-blue-500', path: '/all-delivery' },
  ];

  // ===== Video Consulting categories =====
  const videoCategories = [
    { id: 'tutor', name: 'Tuteur' },
    { id: 'lawyer', name: 'Avocat' },
    { id: 'astrologer', name: 'Astrologue' },
  ];

  // ===== On-Demand Services (4 items) =====
  const onDemandServices = [
    { id: 'handyman', name: 'Bricolage', icon: Wrench, bg: 'bg-fuchsia-50', iconColor: 'text-fuchsia-500', path: '/services' },
    { id: 'massage', name: 'Massage', icon: Heart, bg: 'bg-sky-50', iconColor: 'text-sky-500', path: '/services' },
    { id: 'mechanic', name: 'Mécanique', icon: GasPump, bg: 'bg-green-50', iconColor: 'text-green-500', path: '/services' },
    { id: 'more-ondemand', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-emerald-50', iconColor: 'text-emerald-600', path: '/all-services' },
  ];

  // ===== Beauty Services (8 items) =====
  const beautyServices = [
    { id: 'hair-care', name: 'Soins\nCheveux', icon: HairDryer, bg: 'bg-amber-50', iconColor: 'text-amber-600', path: '/beauty' },
    { id: 'skin-facial', name: 'Skin\n& Facial', icon: MaskHappy, bg: 'bg-green-50', iconColor: 'text-green-600', path: '/beauty' },
    { id: 'nail-polish', name: 'Vernis\nOngles', icon: Sparkle, bg: 'bg-rose-50', iconColor: 'text-rose-500', path: '/beauty' },
    { id: 'hair-removal', name: 'Épilation', icon: Drop, bg: 'bg-yellow-50', iconColor: 'text-yellow-600', path: '/beauty' },
    { id: 'makeup', name: 'Maquillage\n& Coiffure', icon: PaintBrush, bg: 'bg-purple-50', iconColor: 'text-purple-500', path: '/beauty' },
    { id: 'massage-spa', name: 'Massage\n& Spa', icon: HandSoap, bg: 'bg-pink-50', iconColor: 'text-pink-500', path: '/beauty' },
    { id: 'mens-grooming', name: 'Soins\nHommes', icon: Scissors, bg: 'bg-indigo-50', iconColor: 'text-indigo-600', path: '/beauty' },
    { id: 'more-beauty', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-fuchsia-50', iconColor: 'text-fuchsia-500', path: '/beauty' },
  ];

  // ===== Pet Services (3 items) =====
  const petServices = [
    { id: 'grooming', name: 'Toilettage', icon: PawPrint, bg: 'bg-amber-50', iconColor: 'text-amber-600', path: '/pet-care' },
    { id: 'walking', name: 'Promenade', icon: Dog, bg: 'bg-green-50', iconColor: 'text-green-600', path: '/pet-care' },
    { id: 'more-pet', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-slate-100', iconColor: 'text-gray-600', path: '/pet-care' },
  ];

  // ===== Bid for Services (6 items) =====
  const bidServices = [
    { id: 'electrician', name: 'Électricien', icon: Lightning, bg: 'bg-yellow-50', iconColor: 'text-yellow-600', path: '/services-bidding?cat=bcat_electric' },
    { id: 'plumber', name: 'Plombier', icon: Drop, bg: 'bg-blue-50', iconColor: 'text-blue-500', path: '/services-bidding?cat=bcat_plumber' },
    { id: 'carpenter', name: 'Menuisier', icon: Hammer, bg: 'bg-orange-50', iconColor: 'text-orange-600', path: '/services-bidding?cat=bcat_carpenter' },
    { id: 'painters', name: 'Peintres', icon: PaintBrush, bg: 'bg-indigo-50', iconColor: 'text-indigo-500', path: '/services-bidding?cat=bcat_painter' },
    { id: 'handyman-bid', name: 'Bricoleur', icon: Wrench, bg: 'bg-red-50', iconColor: 'text-red-500', path: '/services-bidding?cat=bcat_handyman' },
    { id: 'home-cleaning', name: 'Ménage\nMaison', icon: Broom, bg: 'bg-teal-50', iconColor: 'text-teal-600', path: '/services-bidding?cat=bcat_cleaning' },
  ];

  // ===== Car Care Services (8 items) =====
  const carCareServices = [
    { id: 'car-wash', name: 'Lavage\nAuto & Spa', icon: CarSimple, bg: 'bg-blue-50', iconColor: 'text-blue-500', path: '/car-care' },
    { id: 'battery', name: 'Service\nBatterie', icon: BatteryFull, bg: 'bg-green-50', iconColor: 'text-green-600', path: '/car-care' },
    { id: 'shop', name: 'Boutique', icon: ShoppingBag, bg: 'bg-amber-50', iconColor: 'text-amber-600', path: '/car-care' },
    { id: 'fuel', name: 'Livraison\nCarburant', icon: GasPump, bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/car-care' },
    { id: 'bike-wash', name: 'Lavage\nVélos & Spa', icon: Bicycle, bg: 'bg-cyan-50', iconColor: 'text-cyan-600', path: '/car-care' },
    { id: 'ev-charging', name: 'Recharge\nEV', icon: Plug, bg: 'bg-emerald-50', iconColor: 'text-emerald-600', path: '/car-care' },
    { id: 'car-keylocks', name: 'Serrurerie\nAuto', icon: Key, bg: 'bg-yellow-50', iconColor: 'text-yellow-700', path: '/car-care' },
    { id: 'more-carcare', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-gray-50', iconColor: 'text-gray-600', path: '/car-care' },
  ];

  // ===== Towing Services (6 items) =====
  const towingServices = [
    { id: 'emergency-towing', name: 'Remorquage\nUrgence', icon: Truck, bg: 'bg-slate-100', iconColor: 'text-red-600', path: '/towing' },
    { id: 'flatbed-towing', name: 'Plateau', icon: Truck, bg: 'bg-slate-100', iconColor: 'text-yellow-600', path: '/towing' },
    { id: 'vehicle-recovery', name: 'Récupération\nVéhicule', icon: Car, bg: 'bg-slate-100', iconColor: 'text-blue-500', path: '/towing' },
    { id: 'flat-tire', name: 'Pneu\nCrevé', icon: CarSimple, bg: 'bg-slate-100', iconColor: 'text-amber-600', path: '/towing' },
    { id: 'lockout', name: 'Serrure\nVoiture', icon: Key, bg: 'bg-slate-100', iconColor: 'text-purple-500', path: '/towing' },
    { id: 'more-towing', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-slate-100', iconColor: 'text-gray-600', path: '/towing' },
  ];

  // ===== Nearby Businesses (4 items) =====
  const nearbyServices = [
    { id: 'cafes', name: 'Cafés', icon: Coffee, bg: 'bg-sky-50', iconColor: 'text-amber-600', path: '/nearby' },
    { id: 'salons', name: 'Salons', icon: Scissors, bg: 'bg-sky-50', iconColor: 'text-pink-500', path: '/nearby' },
    { id: 'bars', name: 'Bars', icon: Wine, bg: 'bg-sky-50', iconColor: 'text-purple-500', path: '/nearby' },
    { id: 'more-nearby', name: 'Plus', icon: GridFour, bg: 'bg-sky-50', iconColor: 'text-indigo-500', path: '/nearby' },
  ];

  // CMS-driven sections: admin-configured categories override the hardcoded arrays.
  const sectionFallback = {
    taxi: taxiServices, delivery: deliveryServices, ondemand: onDemandServices,
    beauty: beautyServices, pet: petServices, carcare: carCareServices,
    towing: towingServices, nearby: nearbyServices,
  };
  const sectionAllRoute = {
    taxi: '/taxi', delivery: '/all-delivery', ondemand: '/all-services', beauty: '/beauty',
    pet: '/pet-care', carcare: '/car-care', towing: '/towing', nearby: '/nearby',
  };
  const displayFor = (key) => {
    const cms = cmsItems.filter((i) => i.section === key).sort((a, b) => a.display_order - b.display_order);
    if (!cms.length) return sectionFallback[key] || [];
    const visible = cms.filter((i) => i.visible_home).map((i) => ({
      id: i.id, name: i.label_fr, iconName: i.icon_name, imageUrl: i.image_url,
      bg: i.bg_class, iconColor: i.icon_color_class, path: i.target_route,
    }));
    if (cms.some((i) => !i.visible_home)) {
      visible.push({ id: `${key}-more`, name: 'Plus de\nServices', iconName: 'GridFour', bg: 'bg-slate-100', iconColor: 'text-gray-600', path: sectionAllRoute[key] });
    }
    return visible;
  };

  // Taxi Home tiles built from "Gérer les catégories" (admin) → names/order/active in sync.
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
    const tiles = active.slice(0, 7).map((c) => {
      const v = TAXI_VISUAL[c.key] || TAXI_DEFAULT;
      // Home taxi tiles always use the clean Phosphor icon (not the uploaded photo)
      // for a consistent, icon-based look across the app.
      return { id: `svccat-${c.key}`, name: c.name, icon: v.icon, bg: v.bg, iconColor: v.iconColor, path: `/course?mode=${c.key}` };
    });
    tiles.push({ id: 'more-taxi', name: 'Tous les\nTaxis', icon: GridFour, bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/taxi' });
    return tiles;
  })();

  // ── Section render blocks (keyed) so we can order them declaratively ──
  const blocks = {
    taxi: (
      <section key="taxi" className="px-4 mt-6">
        <SectionHeader title="Services Taxi" />
        <div className="grid grid-cols-4 gap-3">
          {(taxiTiles || displayFor('taxi')).map((s) => <ServiceTile key={s.id} service={s} onSelect={navigate} />)}
        </div>
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
        <button
          onClick={() => setShowDeliverySearch(true)}
          className="mb-3 w-full h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center px-4 gap-3 text-left active:scale-[0.99] transition-transform"
          data-testid="delivery-search-bar"
        >
          <MagnifyingGlass size={20} className="text-[#FF5000]" />
          <span className={`text-sm text-[#9A6A4F] ${BODY}`}>Que voulez-vous vous faire livrer ?</span>
        </button>
        <div className="grid grid-cols-4 gap-3">
          {displayFor('delivery').map((s) => <ServiceTile key={s.id} service={s} onSelect={navigate} />)}
        </div>
      </section>
    ),
    parcel: (
      <div key="parcel" className="px-4 mt-6">
        <motion.button whileTap={{ scale: 0.98 }} className="w-full rounded-[20px] overflow-hidden bg-indigo-50/70 border border-indigo-100 p-5 flex items-center gap-4 text-left" onClick={() => navigate('/parcel')} data-testid="parcel-delivery-section">
          <div className="flex-1">
            <h3 className={`text-lg font-extrabold text-[#1F2430] ${HEAD}`}>Livraison de Colis</h3>
            <p className={`text-[13px] text-[#475569] mt-1 leading-relaxed ${BODY}`}>Envoyez un ou plusieurs colis n&apos;importe où en ville. Choisissez le véhicule adapté à la taille.</p>
          </div>
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-white flex items-center justify-center shadow-sm">
            <Package size={36} weight="duotone" className="text-indigo-500" />
          </div>
        </motion.button>
      </div>
    ),
    marketplace: (
      <section key="marketplace" className="px-4 mt-6">
        <SectionHeader title="Acheter, Vendre & Louer" />
        <div className="grid grid-cols-2 gap-3">
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => navigate('/real-estate')} className="rounded-[20px] bg-emerald-50/70 border border-emerald-100 p-4 flex flex-col text-left h-[170px]" data-testid="marketplace-realestate-btn">
            <h4 className={`text-[15px] font-extrabold text-[#1F2430] ${HEAD}`}>Immobilier</h4>
            <p className={`text-[11px] text-[#475569] mt-1 leading-snug ${BODY}`}>Acheter, vendre ou louer résidentiel, commercial, etc.</p>
            <div className="flex-1 flex items-end justify-center"><Buildings size={48} weight="duotone" className="text-emerald-600" /></div>
          </motion.button>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => navigate('/marketplace/cars')} className="rounded-[20px] bg-orange-50/70 border border-orange-100 p-4 flex flex-col text-left h-[170px]" data-testid="marketplace-cars-btn">
            <h4 className={`text-[15px] font-extrabold text-[#1F2430] ${HEAD}`}>Véhicules</h4>
            <p className={`text-[11px] text-[#475569] mt-1 leading-snug ${BODY}`}>Berlines, SUV, luxe, sport… achat, vente ou location.</p>
            <div className="flex-1 flex items-end justify-center"><Car size={48} weight="duotone" className="text-orange-500" /></div>
          </motion.button>
        </div>
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate('/marketplace/items')} className="mt-3 w-full rounded-[20px] bg-violet-50/70 border border-violet-100 p-4 flex items-center gap-4 text-left" data-testid="marketplace-items-btn">
          <div className="flex-1">
            <h4 className={`text-[15px] font-extrabold text-[#1F2430] ${HEAD}`}>Articles Divers</h4>
            <p className={`text-[11px] text-[#475569] mt-1 leading-snug ${BODY}`}>Meubles, électronique, jouets, mode… achat, vente ou location.</p>
          </div>
          <ShoppingBag size={42} weight="duotone" className="text-violet-500 shrink-0" />
        </motion.button>
      </section>
    ),
    beauty: (
      <section key="beauty" className="px-4 mt-6">
        <SectionHeader title="Services Beauté" />
        <div className="grid grid-cols-4 gap-3">
          {displayFor('beauty').map((s) => <ServiceTile key={s.id} service={s} onSelect={navigate} />)}
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
          {displayFor('ondemand').map((s) => <ServiceTile key={s.id} service={s} onSelect={navigate} />)}
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
          {displayFor('carcare').map((s) => <ServiceTile key={s.id} service={s} onSelect={navigate} />)}
        </div>
      </section>
    ),
    towing: (
      <section key="towing" className="px-4 mt-6">
        <SectionHeader title="Dépannage & Remorquage" sub="Assistance routière 24/7 — pneu crevé, démarrage, panne sèche et plus." />
        <div className="grid grid-cols-3 gap-3" data-testid="towing-grid">
          {displayFor('towing').map((s) => <ServiceTile key={s.id} service={s} variant="inside" onSelect={navigate} />)}
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
          {displayFor('pet').map((s) => <ServiceTile key={s.id} service={s} variant="inside" onSelect={navigate} />)}
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
          {displayFor('nearby').map((s) => <ServiceTile key={s.id} service={s} onSelect={navigate} />)}
        </div>
      </section>
    ),
  };

  // User-defined section order. First the 11 prioritised sections, then the
  // remaining sections kept at the bottom (their original relative order).
  const SECTION_ORDER = [
    'taxi', 'promo', 'delivery', 'parcel', 'marketplace', 'beauty', 'medical',
    'ondemand', 'bid', 'carcare', 'towing',
    'genie', 'video', 'pet', 'parking', 'giftcards', 'carpool', 'tracking', 'nearby',
  ];

  return (
    <div className={`mobile-container min-h-screen pb-36 bg-white text-[#1F2430] ${BODY}`}>
      {/* ===== STICKY HEADER (V3Cube look) ===== */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <button className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0" data-testid="menu-btn" onClick={() => setShowMenu(true)}>
              <List size={20} className="text-[#1F2430]" />
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

      <motion.main initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="pt-1">
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
