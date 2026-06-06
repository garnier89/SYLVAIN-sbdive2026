import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import SearchOverlay from '../../components/SearchOverlay';
import SideMenuDrawer from '../../components/SideMenuDrawer';
import LocaleSelector from '../../components/LocaleSelector';
import DynamicIcon from '../../components/DynamicIcon';
import { homeCategoriesAPI } from '../../services/api';
import {
  Car, Package, ForkKnife,
  House, MapPin, Wallet, User,
  CaretRight, CaretDown, Star, Wrench, UsersThree,
  Truck, Calendar, Gavel, Storefront,
  Taxi, MagnifyingGlass, GridFour, List,
  VideoCamera, FirstAid, Scissors,
  PawPrint, GasPump, Broom, ArrowRight,
  Sparkle, Heart, Lightning, Drop, PaintBrush,
  Hammer, Buildings, Coffee, Wine,
  Stethoscope, Dog, UsersFour, Briefcase,
  CarSimple, ShoppingBag, BatteryFull, HandSoap,
  Bicycle, Plug, Key, HairDryer, MaskHappy, Bag, Pill,
} from '@phosphor-icons/react';

const HEAD = "font-['Outfit']";
const BODY = "font-['Manrope']";

const UserHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [promoIndex, setPromoIndex] = useState(0);
  const [cmsItems, setCmsItems] = useState([]);
  const PROMO_COUNT = 2;

  // Load admin-configured home categories (CMS). Falls back to hardcoded arrays if empty.
  useEffect(() => {
    homeCategoriesAPI.public()
      .then((r) => setCmsItems(r.data.items || []))
      .catch((e) => console.warn('home categories load:', e?.message || e));
  }, []);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 18) setGreeting('Bienvenue');
    else setGreeting('Bonsoir');
  }, []);

  // Auto-rotate promo banners every 4s
  useEffect(() => {
    const id = setInterval(() => setPromoIndex((i) => (i + 1) % PROMO_COUNT), 4000);
    return () => clearInterval(id);
  }, []);

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
    { id: 'grocery-delivery', name: 'Livraison\nCourses', icon: Storefront, bg: 'bg-emerald-50', iconColor: 'text-emerald-500', path: '/food' },
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
    { id: 'more-pet', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/pet-care' },
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
    { id: 'emergency-towing', name: 'Remorquage\nUrgence', icon: Truck, bg: 'bg-red-50', iconColor: 'text-red-600', path: '/towing' },
    { id: 'flatbed-towing', name: 'Plateau', icon: Truck, bg: 'bg-yellow-50', iconColor: 'text-yellow-600', path: '/towing' },
    { id: 'vehicle-recovery', name: 'Récupération\nVéhicule', icon: Car, bg: 'bg-blue-50', iconColor: 'text-blue-500', path: '/towing' },
    { id: 'flat-tire', name: 'Pneu\nCrevé', icon: CarSimple, bg: 'bg-amber-50', iconColor: 'text-amber-600', path: '/towing' },
    { id: 'lockout', name: 'Serrure\nVoiture', icon: Key, bg: 'bg-purple-50', iconColor: 'text-purple-500', path: '/towing' },
    { id: 'more-towing', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/towing' },
  ];

  // ===== Nearby Businesses (4 items) =====
  const nearbyServices = [
    { id: 'cafes', name: 'Cafés', icon: Coffee, bg: 'bg-amber-50', iconColor: 'text-amber-600', path: '/nearby' },
    { id: 'salons', name: 'Salons', icon: Scissors, bg: 'bg-pink-50', iconColor: 'text-pink-500', path: '/nearby' },
    { id: 'bars', name: 'Bars', icon: Wine, bg: 'bg-purple-50', iconColor: 'text-purple-500', path: '/nearby' },
    { id: 'more-nearby', name: 'Plus', icon: GridFour, bg: 'bg-indigo-50', iconColor: 'text-indigo-500', path: '/nearby' },
  ];

  // ── Modern service tile (keeps CMS-driven icon names / image urls / colors) ──
  const ServiceIcon = ({ service, size = 'default' }) => (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={() => navigate(service.path)}
      className="flex flex-col items-center gap-2 group"
      data-testid={`service-${service.id}-btn`}
    >
      <div className={`${size === 'small' ? 'w-[54px] h-[54px]' : 'w-[62px] h-[62px]'} rounded-[20px] ${service.bg} flex items-center justify-center border border-white shadow-[0_6px_16px_-8px_rgba(11,20,38,0.18)] transition-transform group-hover:-translate-y-0.5`}>
        {service.iconName || service.imageUrl ? (
          <DynamicIcon name={service.iconName} imageUrl={service.imageUrl} size={size === 'small' ? 24 : 28} className={service.iconColor} />
        ) : (
          <service.icon size={size === 'small' ? 24 : 28} weight="duotone" className={service.iconColor} />
        )}
      </div>
      <span className={`text-[11px] font-medium text-[#334155] text-center leading-[1.15] whitespace-pre-line ${BODY}`}>{service.name}</span>
    </motion.button>
  );

  // ── Reusable section header (orange accent bar + optional action) ──
  const SectionHeader = ({ title, sub, action, onAction }) => (
    <div className="flex items-end justify-between mb-3.5">
      <div className="min-w-0">
        <h3 className={`text-[17px] font-bold text-[#0B1426] tracking-tight flex items-center gap-2 ${HEAD}`}>
          <span className="w-1 h-4 rounded-full bg-[#FF5000] shrink-0" />
          {title}
        </h3>
        {sub && <p className={`text-[11px] text-[#64748B] mt-1 ml-3 leading-snug ${BODY}`}>{sub}</p>}
      </div>
      {action && (
        <button onClick={onAction} className={`text-[11px] font-bold text-[#FF5000] uppercase tracking-wide shrink-0 ${HEAD}`} data-testid={`section-action-${title}`}>
          {action}
        </button>
      )}
    </div>
  );

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
      visible.push({ id: `${key}-more`, name: 'Plus de\nServices', iconName: 'GridFour', bg: 'bg-gray-50', iconColor: 'text-gray-600', path: sectionAllRoute[key] });
    }
    return visible;
  };

  // ── Section render blocks (keyed) so we can order them declaratively ──
  const blocks = {
    taxi: (
      <section key="taxi" className="px-4 mt-6">
        <SectionHeader title="Services Taxi" action="Tout voir" onAction={() => navigate('/taxi')} />
        <div className="grid grid-cols-4 gap-x-3 gap-y-5">
          {displayFor('taxi').map((s) => <ServiceIcon key={s.id} service={s} />)}
        </div>
      </section>
    ),
    promo: (
      <div key="promo" className="px-4 mt-6" data-testid="promo-banner-carousel">
        <div className="relative overflow-hidden rounded-[22px]">
          <div className="flex transition-transform duration-700 ease-in-out" style={{ transform: `translateX(-${promoIndex * 100}%)` }}>
            <div className="w-full flex-shrink-0 rounded-[22px] overflow-hidden bg-white border border-slate-100 shadow-sm flex items-stretch h-[140px]" data-testid="promo-banner-1">
              <div className="w-2/5 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&h=200&fit=crop')" }} />
              <div className="flex-1 p-4 flex flex-col justify-center">
                <p className={`font-bold text-[#0B1426] text-base leading-tight ${HEAD}`}>Courses fraîches livrées vite.</p>
                <p className={`text-sm text-[#64748B] mt-1 ${BODY}`}>Commandez maintenant !</p>
                <button className={`mt-2 self-start px-4 py-1.5 bg-[#0B1426] text-white text-xs font-semibold rounded-lg ${HEAD}`} onClick={() => navigate('/food')}>
                  Commander
                </button>
              </div>
            </div>
            <div className="w-full flex-shrink-0 rounded-[22px] overflow-hidden bg-[#FF5000] flex items-stretch h-[140px]" data-testid="promo-banner-2">
              <div className="flex-1 p-4 flex flex-col justify-center">
                <p className={`font-bold text-white text-base leading-tight ${HEAD}`}>Première course VTC</p>
                <p className={`text-3xl font-extrabold text-white mt-1 ${HEAD}`}>-50%</p>
                <p className={`text-xs text-white/80 mt-1 ${BODY}`}>Code : BIENVENUE</p>
              </div>
              <div className="w-2/5 flex items-center justify-center bg-white/10">
                <Car size={64} weight="duotone" className="text-white" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-1.5 mt-2.5" data-testid="promo-dots">
          {Array.from({ length: PROMO_COUNT }).map((_, i) => (
            <button
              key={`promo-dot-${i}`}
              onClick={() => setPromoIndex(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${promoIndex === i ? 'w-5 bg-[#FF5000]' : 'w-1.5 bg-slate-300'}`}
              data-testid={`promo-dot-${i}`}
              aria-label={`Aller au panneau ${i + 1}`}
            />
          ))}
        </div>
      </div>
    ),
    delivery: (
      <section key="delivery" className="px-4 mt-6">
        <SectionHeader title="Services de Livraison" action="Tout voir" onAction={() => navigate('/all-delivery')} />
        <div className="grid grid-cols-4 gap-x-3 gap-y-5">
          {displayFor('delivery').map((s) => <ServiceIcon key={s.id} service={s} />)}
        </div>
      </section>
    ),
    parcel: (
      <div key="parcel" className="px-4 mt-6">
        <motion.button
          whileTap={{ scale: 0.98 }}
          className="w-full rounded-[22px] overflow-hidden bg-white border border-slate-100 shadow-sm p-5 flex items-center gap-4 text-left"
          onClick={() => navigate('/parcel')}
          data-testid="parcel-delivery-section"
        >
          <div className="flex-1">
            <h3 className={`text-lg font-bold text-[#0B1426] ${HEAD}`}>Livraison de Colis</h3>
            <p className={`text-sm text-[#64748B] mt-1 leading-relaxed ${BODY}`}>Envoyez un ou plusieurs colis n'importe où en ville. Choisissez le véhicule adapté.</p>
          </div>
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-purple-50 flex items-center justify-center">
            <Package size={36} weight="duotone" className="text-purple-500" />
          </div>
        </motion.button>
      </div>
    ),
    marketplace: (
      <section key="marketplace" className="px-4 mt-6">
        <SectionHeader title="Acheter, Vendre & Louer" />
        <div className="space-y-3">
          <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate('/real-estate')} className="w-full rounded-[20px] overflow-hidden bg-gradient-to-r from-[#FF5000] to-[#E03D00] flex items-stretch h-[90px] text-left" data-testid="marketplace-realestate-btn">
            <div className="flex-1 p-4 flex flex-col justify-center">
              <p className={`text-[11px] font-bold text-white/80 uppercase tracking-wide ${HEAD}`}>Acheter, Vendre & Louer</p>
              <p className={`text-base font-bold text-white mt-0.5 ${HEAD}`}>Immobilier</p>
            </div>
            <div className="w-1/3 flex items-center justify-center bg-white/10">
              <Buildings size={40} weight="duotone" className="text-white/90" />
            </div>
          </motion.button>
          <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate('/marketplace/cars')} className="w-full rounded-[20px] overflow-hidden bg-gradient-to-r from-amber-400 to-sky-400 flex items-stretch h-[90px] text-left" data-testid="marketplace-cars-btn">
            <div className="flex-1 p-4 flex flex-col justify-center">
              <p className={`text-sm font-bold text-white ${HEAD}`}>Acheter, Vendre &</p>
              <p className={`text-base font-bold text-white ${HEAD}`}>Louer Véhicules</p>
            </div>
            <div className="w-1/3 flex items-center justify-center bg-white/10">
              <Car size={40} weight="duotone" className="text-white" />
            </div>
          </motion.button>
          <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate('/marketplace/items')} className="w-full rounded-[20px] overflow-hidden bg-white border border-slate-100 shadow-sm flex items-stretch h-[90px] text-left" data-testid="marketplace-items-btn">
            <div className="flex-1 p-4 flex flex-col justify-center">
              <p className={`text-sm font-bold text-[#0B1426] ${HEAD}`}>Acheter, Vendre &</p>
              <p className={`text-base font-bold text-[#0B1426] ${HEAD}`}>Articles Divers</p>
            </div>
            <div className="w-1/3 flex items-center justify-center bg-slate-50">
              <ShoppingBag size={40} weight="duotone" className="text-slate-500" />
            </div>
          </motion.button>
        </div>
      </section>
    ),
    beauty: (
      <section key="beauty" className="px-4 mt-6">
        <SectionHeader title="Services Beauté" action="Tout voir" onAction={() => navigate('/beauty')} />
        <div className="grid grid-cols-4 gap-x-3 gap-y-5">
          {displayFor('beauty').map((s) => <ServiceIcon key={s.id} service={s} />)}
        </div>
      </section>
    ),
    medical: (
      <section key="medical" className="px-4 mt-6">
        <SectionHeader title="Services Médicaux" />
        <div className="grid grid-cols-2 gap-3" data-testid="medical-services-section">
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => navigate('/medical/appointment')} className="row-span-2 rounded-[20px] bg-white border border-slate-100 shadow-sm p-4 flex flex-col text-left" data-testid="medical-appointment-btn">
            <h4 className={`text-sm font-bold text-[#0B1426] ${HEAD}`}>Prendre Rendez-vous</h4>
            <p className={`text-[11px] text-[#64748B] mt-1 leading-relaxed ${BODY}`}>Prenez RDV avec un médecin ou un expert médical à leur cabinet ou à domicile.</p>
            <div className="flex-1 flex items-end justify-center mt-3">
              <div className="w-20 h-20 rounded-full bg-orange-50 flex items-center justify-center">
                <Stethoscope size={40} weight="duotone" className="text-[#FF5000]" />
              </div>
            </div>
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => navigate('/video-consult')} className="rounded-[20px] bg-white border border-slate-100 shadow-sm p-3 flex flex-col text-left" data-testid="medical-video-btn">
            <h4 className={`text-xs font-bold text-[#0B1426] ${HEAD}`}>Vidéo Consultation</h4>
            <p className={`text-[10px] text-[#64748B] mt-1 leading-relaxed ${BODY}`}>Consultez un médecin en visio.</p>
            <div className="flex justify-end mt-2">
              <VideoCamera size={28} weight="duotone" className="text-yellow-600" />
            </div>
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => navigate('/medical/transport')} className="rounded-[20px] bg-white border border-slate-100 shadow-sm p-3 flex flex-col text-left" data-testid="medical-other-btn">
            <h4 className={`text-xs font-bold text-[#0B1426] ${HEAD}`}>Transport Médical</h4>
            <p className={`text-[10px] text-[#64748B] mt-1 leading-relaxed ${BODY}`}>Ambulance, transport sanitaire.</p>
            <div className="flex justify-end mt-2">
              <FirstAid size={28} weight="duotone" className="text-green-600" />
            </div>
          </motion.button>
        </div>
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate('/pharmacy')} className="mt-3 w-full rounded-[20px] bg-white border border-slate-100 shadow-sm p-4 flex items-center gap-4 text-left" data-testid="medical-pharmacy-btn">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center shrink-0">
            <Pill size={30} weight="duotone" className="text-[#FF5000]" />
          </div>
          <div className="flex-1">
            <h4 className={`text-sm font-bold text-[#0B1426] ${HEAD}`}>Pharmacie</h4>
            <p className={`text-[11px] text-[#64748B] mt-0.5 leading-relaxed ${BODY}`}>Médicaments livrés — sur ordonnance ou parapharmacie.</p>
          </div>
          <CaretRight size={18} className="text-[#94A3B8]" />
        </motion.button>
      </section>
    ),
    ondemand: (
      <section key="ondemand" className="px-4 mt-6">
        <SectionHeader title="Services à la demande" action="Tout voir" onAction={() => navigate('/all-services')} />
        <div className="grid grid-cols-4 gap-x-3 gap-y-5">
          {displayFor('ondemand').map((s) => <ServiceIcon key={s.id} service={s} />)}
        </div>
      </section>
    ),
    bid: (
      <div key="bid" className="px-4 mt-6">
        <div className="rounded-[22px] bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 p-4" data-testid="bid-services-section">
          <h3 className={`text-lg font-bold text-[#0B1426] ${HEAD}`}>Enchères Services</h3>
          <p className={`text-xs text-[#64748B] mt-1 mb-4 leading-relaxed ${BODY}`}>Publiez votre besoin et laissez les prestataires enchérir en temps réel. Choisissez le meilleur !</p>
          <div className="flex gap-3">
            <div className="hidden sm:flex w-24 shrink-0 items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-[#FF5000] flex items-center justify-center">
                <Wrench size={36} className="text-white" />
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-2">
              {bidServices.map((s) => (
                <motion.button whileTap={{ scale: 0.95 }} key={s.id} onClick={() => navigate(s.path || '/services-bidding')} className="bg-white rounded-xl p-2.5 flex items-center gap-2 border border-slate-100 shadow-[0_2px_8px_-4px_rgba(11,20,38,0.08)]" data-testid={`bid-${s.id}-btn`}>
                  <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                    <s.icon size={18} weight="duotone" className={s.iconColor} />
                  </div>
                  <span className={`text-[11px] font-semibold text-[#334155] leading-tight whitespace-pre-line ${BODY}`}>{s.name}</span>
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    carcare: (
      <section key="carcare" className="px-4 mt-6">
        <SectionHeader title="Entretien Auto" action="Tout voir" onAction={() => navigate('/car-care')} />
        <div className="grid grid-cols-4 gap-x-3 gap-y-5">
          {displayFor('carcare').map((s) => <ServiceIcon key={s.id} service={s} />)}
        </div>
      </section>
    ),
    towing: (
      <section key="towing" className="px-4 mt-6">
        <SectionHeader title="Dépannage & Remorquage" sub="Assistance routière 24/7 — pneu crevé, démarrage, panne sèche et plus." />
        <div className="grid grid-cols-3 gap-x-3 gap-y-5" data-testid="towing-grid">
          {displayFor('towing').map((s) => <ServiceIcon key={s.id} service={s} />)}
        </div>
      </section>
    ),
    genie: (
      <section key="genie" className="px-4 mt-6">
        <SectionHeader title="Livraison Genie & Runner" />
        <div className="grid grid-cols-2 gap-3" data-testid="genie-runner-section">
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => navigate('/runner?mode=genie')} className="rounded-[20px] bg-white border border-slate-100 shadow-sm p-4 flex flex-col text-left h-[200px]" data-testid="delivery-genie-btn">
            <h4 className={`text-sm font-bold text-[#0B1426] ${HEAD}`}>Delivery Genie</h4>
            <p className={`text-[11px] text-[#64748B] mt-1 leading-relaxed flex-1 ${BODY}`}>Engagez un Genie pour ACHETER des articles à votre place dans le magasin de votre choix.</p>
            <div className="flex justify-center mt-2">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                <Bag size={32} weight="duotone" className="text-blue-600" />
              </div>
            </div>
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => navigate('/runner')} className="rounded-[20px] bg-white border border-slate-100 shadow-sm p-4 flex flex-col text-left h-[200px]" data-testid="delivery-runner-btn">
            <h4 className={`text-sm font-bold text-[#0B1426] ${HEAD}`}>Delivery Runner</h4>
            <p className={`text-[11px] text-[#64748B] mt-1 leading-relaxed flex-1 ${BODY}`}>Engagez des Coursiers pour récupérer et livrer de petits articles en ville.</p>
            <div className="flex justify-center mt-2">
              <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center">
                <Lightning size={32} weight="duotone" className="text-rose-600" />
              </div>
            </div>
          </motion.button>
        </div>
      </section>
    ),
    video: (
      <div key="video" className="px-4 mt-6">
        <div className="rounded-[22px] overflow-hidden bg-gradient-to-br from-teal-500 to-teal-600 p-5" data-testid="video-consulting-section">
          <h3 className={`text-lg font-bold text-white ${HEAD}`}>Consultation Vidéo</h3>
          <p className={`text-sm text-white/80 mt-1 ${BODY}`}>Réservez une consultation vidéo avec des tuteurs, avocats, médecins et plus.</p>
          <div className="flex gap-3 mt-4 overflow-x-auto scrollbar-hide">
            {videoCategories.map((cat) => (
              <button key={cat.id} onClick={() => navigate('/video-consult')} className="flex-shrink-0 bg-white/20 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center gap-2" data-testid={`video-${cat.id}-btn`}>
                <VideoCamera size={18} className="text-white" />
                <span className={`text-sm font-medium text-white ${BODY}`}>{cat.name}</span>
              </button>
            ))}
            <button onClick={() => navigate('/video-consult')} className="flex-shrink-0 bg-white/10 rounded-xl px-4 py-3 flex items-center gap-2" data-testid="video-more-btn">
              <span className={`text-sm font-medium text-white ${BODY}`}>Plus</span>
              <ArrowRight size={16} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    ),
    pet: (
      <section key="pet" className="px-4 mt-6">
        <SectionHeader title="Services Animaux" action="Tout voir" onAction={() => navigate('/pet-care')} />
        <div className="grid grid-cols-3 gap-x-4 gap-y-5">
          {displayFor('pet').map((s) => <ServiceIcon key={s.id} service={s} />)}
        </div>
      </section>
    ),
    parking: (
      <div key="parking" className="px-4 mt-6">
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate('/parking')} className="w-full rounded-[22px] bg-white border border-slate-100 shadow-sm p-5 flex items-center gap-4 text-left" data-testid="parking-section-btn">
          <div className="flex-1">
            <h3 className={`text-lg font-bold text-[#0B1426] ${HEAD}`}>Parking</h3>
            <p className={`text-xs text-[#64748B] mt-1 leading-relaxed ${BODY}`}>Trouvez et réservez une place de parking à proximité. Paiement en ligne, accès facile.</p>
          </div>
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-blue-50 flex items-center justify-center">
            <MapPin size={32} weight="duotone" className="text-blue-600" />
          </div>
        </motion.button>
      </div>
    ),
    giftcards: (
      <div key="giftcards" className="px-4 mt-6">
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate('/giftcards')} className="w-full rounded-[22px] bg-gradient-to-r from-[#FFF0E5] to-white border border-orange-100 p-5 flex items-center gap-4 text-left" data-testid="giftcards-section-btn">
          <div className="flex-1">
            <h3 className={`text-lg font-bold text-[#0B1426] ${HEAD}`}>Cartes Cadeaux</h3>
            <p className={`text-xs text-[#64748B] mt-1 leading-relaxed ${BODY}`}>Offrez du crédit SB Drive VTC à vos proches. Disponible de 10€ à 200€.</p>
          </div>
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-orange-100 flex items-center justify-center">
            <Star size={32} weight="duotone" className="text-[#FF5000]" />
          </div>
        </motion.button>
      </div>
    ),
    carpool: (
      <div key="carpool" className="px-4 mt-6">
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate('/carpool')} className="w-full rounded-[22px] bg-gradient-to-r from-emerald-50 to-white border border-emerald-100 p-5 flex items-center gap-4 text-left" data-testid="carpool-section-btn">
          <div className="flex-1">
            <h3 className={`text-lg font-bold text-[#0B1426] ${HEAD}`}>Covoiturage</h3>
            <p className={`text-xs text-[#64748B] mt-1 leading-relaxed ${BODY}`}>Voyagez ? Réservez un covoiturage à petit prix. Vous conduisez ? Publiez votre trajet et gagnez de l'argent.</p>
          </div>
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-emerald-100 flex items-center justify-center">
            <UsersThree size={36} weight="duotone" className="text-emerald-600" />
          </div>
        </motion.button>
      </div>
    ),
    tracking: (
      <section key="tracking" className="px-4 mt-6">
        <SectionHeader title="Suivi Famille & Employés" />
        <div className="grid grid-cols-2 gap-3" data-testid="tracking-section">
          <motion.button whileTap={{ scale: 0.96 }} className="rounded-[20px] bg-white border border-slate-100 shadow-sm p-4 text-left" data-testid="track-family-btn" onClick={() => navigate('/tracking')}>
            <div className="w-12 h-12 rounded-2xl bg-yellow-50 flex items-center justify-center mb-2">
              <UsersFour size={28} weight="duotone" className="text-yellow-700" />
            </div>
            <h4 className={`text-sm font-bold text-[#0B1426] ${HEAD}`}>Famille</h4>
            <p className={`text-[10px] text-[#64748B] mt-1 leading-relaxed ${BODY}`}>Voyez où se trouvent vos proches en temps réel pour leur sécurité.</p>
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} className="rounded-[20px] bg-white border border-slate-100 shadow-sm p-4 text-left" data-testid="track-employees-btn" onClick={() => navigate('/tracking')}>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mb-2">
              <Briefcase size={28} weight="duotone" className="text-emerald-700" />
            </div>
            <h4 className={`text-sm font-bold text-[#0B1426] ${HEAD}`}>Employés</h4>
            <p className={`text-[10px] text-[#64748B] mt-1 leading-relaxed ${BODY}`}>Suivez la localisation de vos employés en temps réel.</p>
          </motion.button>
        </div>
      </section>
    ),
    nearby: (
      <section key="nearby" className="px-4 mt-6 mb-4">
        <SectionHeader title="Commerces Proches" action="Tout voir" onAction={() => navigate('/nearby')} />
        <div className="grid grid-cols-4 gap-x-3 gap-y-5">
          {displayFor('nearby').map((s) => <ServiceIcon key={s.id} service={s} size="small" />)}
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
    <div className={`mobile-container min-h-screen pb-24 bg-[#F8FAFC] text-[#0B1426] ${BODY}`}>
      {/* ===== STICKY GLASS HEADER ===== */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-slate-200/60 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <button className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0" data-testid="menu-btn" onClick={() => setShowMenu(true)}>
              <List size={20} className="text-[#0B1426]" />
            </button>
            <div className="min-w-0">
              <p className={`text-[11px] text-[#64748B] leading-none ${BODY}`}>{greeting},</p>
              <h2 className={`text-[15px] font-bold text-[#0B1426] truncate leading-tight mt-0.5 ${HEAD}`}>{user?.name || 'Utilisateur'}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <LocaleSelector />
            <Avatar className="h-9 w-9 border-2 border-white shadow-sm cursor-pointer" onClick={() => navigate('/profile')}>
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="bg-[#FFF0E5] text-[#FF5000] font-bold text-sm">
                {user?.name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* Location pill */}
        <button className="flex items-center gap-1.5 mt-3 bg-slate-100 rounded-full pl-2.5 pr-3 py-1.5 max-w-full" data-testid="location-bar">
          <MapPin size={14} weight="fill" className="text-[#FF5000] shrink-0" />
          <span className={`text-xs text-[#334155] truncate ${BODY}`}>Paris, Île-de-France, France</span>
          <CaretDown size={13} className="text-[#64748B] shrink-0" />
        </button>

        {/* Search */}
        <button className="mt-2.5 w-full h-11 rounded-2xl bg-slate-100 border border-slate-200/70 flex items-center px-3.5 gap-2.5" onClick={() => setShowSearch(true)} data-testid="search-services-bar">
          <MagnifyingGlass size={18} className="text-[#94A3B8]" />
          <span className={`text-sm text-[#94A3B8] ${BODY}`}>Rechercher un service…</span>
        </button>
      </header>

      {/* Search Overlay */}
      {showSearch && <SearchOverlay onClose={() => setShowSearch(false)} />}
      {/* Side menu drawer */}
      <SideMenuDrawer open={showMenu} onClose={() => setShowMenu(false)} variant="user" />

      <motion.main initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="pt-2">
        {SECTION_ORDER.map((key) => blocks[key])}
      </motion.main>

      {/* ===== BOTTOM NAVIGATION (glass) ===== */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50 bg-white/90 backdrop-blur-lg border-t border-slate-200/60 h-[68px] flex items-center justify-around px-2">
        <button className="flex flex-col items-center justify-center gap-1 w-16 h-full" data-testid="nav-home">
          <House size={22} weight="fill" className="text-[#FF5000] drop-shadow-[0_2px_8px_rgba(255,80,0,0.3)]" />
          <span className={`text-[10px] font-bold text-[#FF5000] ${HEAD}`}>Accueil</span>
        </button>
        <button className="flex flex-col items-center justify-center gap-1 w-16 h-full" onClick={() => navigate('/history')} data-testid="nav-bookings">
          <Car size={22} weight="regular" className="text-slate-400" />
          <span className={`text-[10px] font-medium text-slate-400 ${BODY}`}>Réservations</span>
        </button>
        <button className="flex flex-col items-center justify-center gap-1 w-16 h-full" onClick={() => navigate('/wallet')} data-testid="nav-wallet">
          <Wallet size={22} weight="regular" className="text-slate-400" />
          <span className={`text-[10px] font-medium text-slate-400 ${BODY}`}>Portefeuille</span>
        </button>
        <button className="flex flex-col items-center justify-center gap-1 w-16 h-full" onClick={() => navigate('/profile')} data-testid="nav-profile">
          <User size={22} weight="regular" className="text-slate-400" />
          <span className={`text-[10px] font-medium text-slate-400 ${BODY}`}>Profil</span>
        </button>
      </nav>
    </div>
  );
};

export default UserHome;
