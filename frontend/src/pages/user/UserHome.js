import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import SearchOverlay from '../../components/SearchOverlay';
import LocaleSelector from '../../components/LocaleSelector';
import TopDriversWidget from '../../components/TopDriversWidget';
import { simulationAPI } from '../../services/api';
import {
  Car, Motorcycle, Package, ForkKnife,
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
  Play, Stop
} from '@phosphor-icons/react';

const UserHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [simActive, setSimActive] = useState(false);
  const [simDriver, setSimDriver] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Bienvenue');
    else if (hour < 18) setGreeting('Bienvenue');
    else setGreeting('Bonsoir');
    // Check simulation status
    simulationAPI.status().then(res => {
      setSimActive(res.data.active);
      if (res.data.active) setSimDriver(res.data);
    }).catch(() => {});
  }, []);

  const toggleSimulation = async () => {
    setSimLoading(true);
    try {
      if (simActive) {
        await simulationAPI.stop();
        setSimActive(false);
        setSimDriver(null);
      } else {
        const res = await simulationAPI.start();
        setSimActive(true);
        setSimDriver(res.data);
      }
    } catch (err) { console.error(err); }
    finally { setSimLoading(false); }
  };

  // ===== Taxi Services (8 items) =====
  const taxiServices = [
    { id: 'taxi-booking', name: 'VTC\nRéservation', icon: Car, bg: 'bg-amber-50', iconColor: 'text-amber-500', path: '/ride' },
    { id: 'taxi-pooling', name: 'VTC\nPooling', icon: UsersThree, bg: 'bg-teal-50', iconColor: 'text-teal-500', path: '/ride?type=pool' },
    { id: 'taxi-rental', name: 'VTC\nLocation', icon: Taxi, bg: 'bg-blue-50', iconColor: 'text-blue-500', path: '/ride?type=rental' },
    { id: 'personal-driver', name: 'Chauffeur\nPrivé', icon: User, bg: 'bg-orange-50', iconColor: 'text-orange-700', path: '/ride?type=private' },
    { id: 'taxi-bidding', name: 'Enchères\nVTC', icon: Gavel, bg: 'bg-pink-50', iconColor: 'text-pink-500', path: '/taxi-bidding' },
    { id: 'taxi-intercity', name: 'VTC\nIntercity', icon: Truck, bg: 'bg-green-50', iconColor: 'text-green-600', path: '/intercity' },
    { id: 'schedule-ride', name: 'Programmer\nCourse', icon: Calendar, bg: 'bg-cyan-50', iconColor: 'text-cyan-600', path: '/ride?type=schedule' },
    { id: 'more-taxi', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/more-taxi' },
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

  // ===== Beauty Services (4 items) =====
  const beautyServices = [
    { id: 'makeup', name: 'Maquillage\n& Coiffure', icon: Sparkle, bg: 'bg-purple-50', iconColor: 'text-purple-500', path: '/beauty' },
    { id: 'massage-spa', name: 'Massage\n& Spa', icon: HandSoap, bg: 'bg-pink-50', iconColor: 'text-pink-500', path: '/beauty' },
    { id: 'mens-grooming', name: 'Soins\nHommes', icon: Scissors, bg: 'bg-rose-50', iconColor: 'text-rose-600', path: '/beauty' },
    { id: 'more-beauty', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-fuchsia-50', iconColor: 'text-fuchsia-500', path: '/beauty' },
  ];

  // ===== Pet Services (3 items) =====
  const petServices = [
    { id: 'grooming', name: 'Toilettage', icon: PawPrint, bg: 'bg-amber-50', iconColor: 'text-amber-600', path: '/pet-care' },
    { id: 'walking', name: 'Promenade', icon: Dog, bg: 'bg-green-50', iconColor: 'text-green-600', path: '/pet-care' },
    { id: 'more-pet', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/pet-care' },
  ];

  // ===== Bid for Services (6 items - 2x3 grid) — renvoie vers /services-bidding (marketplace enchères prestataires) =====
  const bidServices = [
    { id: 'electrician', name: 'Électricien', icon: Lightning, bg: 'bg-yellow-50', iconColor: 'text-yellow-600', path: '/services-bidding?cat=bcat_electric' },
    { id: 'plumber', name: 'Plombier', icon: Drop, bg: 'bg-blue-50', iconColor: 'text-blue-500', path: '/services-bidding?cat=bcat_plumber' },
    { id: 'carpenter', name: 'Menuisier', icon: Hammer, bg: 'bg-orange-50', iconColor: 'text-orange-600', path: '/services-bidding?cat=bcat_carpenter' },
    { id: 'painters', name: 'Peintres', icon: PaintBrush, bg: 'bg-indigo-50', iconColor: 'text-indigo-500', path: '/services-bidding?cat=bcat_painter' },
    { id: 'handyman-bid', name: 'Bricoleur', icon: Wrench, bg: 'bg-red-50', iconColor: 'text-red-500', path: '/services-bidding?cat=bcat_handyman' },
    { id: 'home-cleaning', name: 'Ménage\nMaison', icon: Broom, bg: 'bg-teal-50', iconColor: 'text-teal-600', path: '/services-bidding?cat=bcat_cleaning' },
  ];

  // ===== Car Care Services (4 items) =====
  const carCareServices = [
    { id: 'car-wash', name: 'Lavage\nAuto & Spa', icon: CarSimple, bg: 'bg-blue-50', iconColor: 'text-blue-500', path: '/car-care' },
    { id: 'battery', name: 'Service\nBatterie', icon: BatteryFull, bg: 'bg-green-50', iconColor: 'text-green-600', path: '/car-care' },
    { id: 'shop', name: 'Boutique', icon: ShoppingBag, bg: 'bg-amber-50', iconColor: 'text-amber-600', path: '/car-care' },
    { id: 'fuel', name: 'Livraison\nCarburant', icon: GasPump, bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/car-care' },
  ];

  // ===== Nearby Businesses (4 items) =====
  const nearbyServices = [
    { id: 'cafes', name: 'Cafés', icon: Coffee, bg: 'bg-amber-50', iconColor: 'text-amber-600', path: '/nearby' },
    { id: 'salons', name: 'Salons', icon: Scissors, bg: 'bg-pink-50', iconColor: 'text-pink-500', path: '/nearby' },
    { id: 'bars', name: 'Bars', icon: Wine, bg: 'bg-purple-50', iconColor: 'text-purple-500', path: '/nearby' },
    { id: 'more-nearby', name: 'Plus', icon: GridFour, bg: 'bg-indigo-50', iconColor: 'text-indigo-500', path: '/nearby' },
  ];

  const ServiceIcon = ({ service, size = 'default' }) => (
    <button
      onClick={() => navigate(service.path)}
      className="flex flex-col items-center gap-1.5 group"
      data-testid={`service-${service.id}-btn`}
    >
      <div className={`${size === 'small' ? 'w-[56px] h-[56px]' : 'w-[62px] h-[62px]'} rounded-2xl ${service.bg} flex items-center justify-center group-hover:scale-105 transition-transform border border-gray-100/50`}>
        <service.icon size={size === 'small' ? 24 : 28} weight="duotone" className={service.iconColor} />
      </div>
      <span className="text-[11px] font-medium text-gray-700 text-center leading-tight whitespace-pre-line">{service.name}</span>
    </button>
  );

  return (
    <div className="mobile-container min-h-screen pb-20 bg-gray-50 text-gray-900">
      {/* ===== HEADER ===== */}
      <div className="bg-white px-4 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <List size={24} className="text-gray-700 mr-2 cursor-pointer" data-testid="menu-btn" />
            <div>
              <p className="text-xs text-gray-400">{greeting},</p>
              <h2 className="text-lg font-bold text-gray-900">{user?.name || 'Utilisateur'}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LocaleSelector />
            <Avatar className="h-10 w-10 border-2 border-gray-200 cursor-pointer" onClick={() => navigate('/profile')}>
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="bg-gray-100 text-gray-600 font-semibold text-sm">
                {user?.name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* Location */}
        <div className="flex items-center gap-1.5 mt-2 cursor-pointer" data-testid="location-bar">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-900" />
          <p className="text-sm text-gray-700 truncate flex-1">Paris, Île-de-France, France</p>
          <CaretDown size={14} className="text-gray-400" />
        </div>

        {/* Search */}
        <div className="mt-3" onClick={() => setShowSearch(true)} data-testid="search-services-bar">
          <div className="w-full h-11 rounded-xl bg-gray-100 border border-gray-200 flex items-center px-3.5 gap-2.5 cursor-pointer">
            <MagnifyingGlass size={18} className="text-gray-400" />
            <span className="text-sm text-gray-400">Rechercher un service...</span>
          </div>
        </div>
      </div>

      {/* Search Overlay */}
      {showSearch && <SearchOverlay onClose={() => setShowSearch(false)} />}

      {/* ===== SIMULATION MODE ===== */}
      <div className="px-4 mt-3">
        <div className={`rounded-xl border p-3 flex items-center gap-3 transition-all ${
          simActive
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-gray-50 border-gray-200'
        }`} data-testid="simulation-panel">
          <button onClick={toggleSimulation} disabled={simLoading}
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
              simActive ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-gray-300'
            }`} data-testid="simulation-toggle">
            {simLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : simActive ? (
              <Stop size={18} className="text-white" weight="fill" />
            ) : (
              <Play size={18} className="text-white" weight="fill" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${simActive ? 'text-emerald-700' : 'text-gray-600'}`}>
              {simActive ? 'Simulation active' : 'Mode Simulation'}
            </p>
            {simActive && simDriver ? (
              <p className="text-xs text-emerald-600 truncate">
                {simDriver.driver_name} &bull; {simDriver.driver_vehicle}
              </p>
            ) : (
              <p className="text-xs text-gray-400">Chauffeur virtuel pour tester les courses</p>
            )}
          </div>
          {simActive && (
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
          )}
        </div>
      </div>

      {/* ===== PROMO BANNER ===== */}
      <div className="px-4 mt-3">
        <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide">
          <div className="min-w-[92%] snap-start rounded-2xl overflow-hidden bg-gradient-to-r from-gray-100 to-gray-50 border border-gray-200 flex items-stretch h-[140px]" data-testid="promo-banner-1">
            <div className="w-2/5 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&h=200&fit=crop')" }} />
            <div className="flex-1 p-4 flex flex-col justify-center">
              <p className="font-bold text-gray-900 text-base leading-tight">Courses fraîches livrées vite.</p>
              <p className="text-sm text-gray-500 mt-1">Commandez maintenant !</p>
              <button className="mt-2 self-start px-4 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg" onClick={() => navigate('/food')}>
                Commander
              </button>
            </div>
          </div>
          <div className="min-w-[92%] snap-start rounded-2xl overflow-hidden bg-gradient-to-r from-[#FF4500]/10 to-orange-50 border border-orange-200 flex items-stretch h-[140px]" data-testid="promo-banner-2">
            <div className="flex-1 p-4 flex flex-col justify-center">
              <p className="font-bold text-gray-900 text-base leading-tight">Première course VTC</p>
              <p className="text-2xl font-bold text-[#FF4500] mt-1">-50%</p>
              <p className="text-xs text-gray-500 mt-1">Code : BIENVENUE</p>
            </div>
            <div className="w-2/5 flex items-center justify-center bg-[#FF4500]/5">
              <Car size={64} weight="duotone" className="text-[#FF4500]" />
            </div>
          </div>
        </div>
      </div>

      {/* ===== TOP CHAUFFEURS WIDGET ===== */}
      <TopDriversWidget />

      {/* ===== TAXI SERVICES ===== */}
      <div className="px-4 mt-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Services Taxi</h3>
        <div className="grid grid-cols-4 gap-x-3 gap-y-4">
          {taxiServices.map((s) => <ServiceIcon key={s.id} service={s} />)}
        </div>
      </div>

      {/* ===== PARCEL DELIVERY BANNER ===== */}
      <div className="px-4 mt-5">
        <div
          className="rounded-2xl overflow-hidden bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 p-5 flex items-center gap-4 cursor-pointer"
          onClick={() => navigate('/parcel')}
          data-testid="parcel-delivery-section"
        >
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">Livraison de Colis</h3>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">Envoyez un ou plusieurs colis n'importe où en ville. Choisissez le véhicule adapté.</p>
          </div>
          <div className="w-20 h-20 flex-shrink-0 flex items-center justify-center">
            <Package size={56} weight="duotone" className="text-purple-500" />
          </div>
        </div>
      </div>

      {/* ===== DELIVERY SERVICES ===== */}
      <div className="px-4 mt-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Services de Livraison</h3>
        <div className="grid grid-cols-4 gap-x-3 gap-y-4">
          {deliveryServices.map((s) => <ServiceIcon key={s.id} service={s} />)}
        </div>
      </div>

      {/* ===== ONLINE VIDEO CONSULTING ===== */}
      <div className="px-4 mt-5">
        <div className="rounded-2xl overflow-hidden bg-gradient-to-r from-teal-500 to-teal-600 p-5" data-testid="video-consulting-section">
          <h3 className="text-lg font-bold text-white">Consultation Vidéo</h3>
          <p className="text-sm text-white/80 mt-1">Réservez une consultation vidéo avec des tuteurs, avocats, médecins et plus.</p>
          <div className="flex gap-3 mt-4 overflow-x-auto scrollbar-hide">
            {videoCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => navigate('/video-consult')}
                className="flex-shrink-0 bg-white/20 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center gap-2"
                data-testid={`video-${cat.id}-btn`}
              >
                <VideoCamera size={18} className="text-white" />
                <span className="text-sm font-medium text-white">{cat.name}</span>
              </button>
            ))}
            <button
              onClick={() => navigate('/video-consult')}
              className="flex-shrink-0 bg-white/10 rounded-xl px-4 py-3 flex items-center gap-2"
              data-testid="video-more-btn"
            >
              <span className="text-sm font-medium text-white">Plus</span>
              <ArrowRight size={16} className="text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* ===== ON-DEMAND SERVICES ===== */}
      <div className="px-4 mt-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Services à la demande</h3>
        <div className="grid grid-cols-4 gap-x-3 gap-y-4">
          {onDemandServices.map((s) => <ServiceIcon key={s.id} service={s} />)}
        </div>
      </div>

      {/* ===== BEAUTY SERVICES ===== */}
      <div className="px-4 mt-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Services Beauté</h3>
        <div className="grid grid-cols-4 gap-x-3 gap-y-4">
          {beautyServices.map((s) => <ServiceIcon key={s.id} service={s} />)}
        </div>
      </div>

      {/* ===== MEDICAL SERVICES ===== */}
      <div className="px-4 mt-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Services Médicaux</h3>
        <div className="grid grid-cols-2 gap-3" data-testid="medical-services-section">
          {/* Book Appointment - Large Card */}
          <button
            onClick={() => navigate('/video-consult')}
            className="row-span-2 rounded-2xl bg-orange-50 border border-orange-100 p-4 flex flex-col text-left group"
            data-testid="medical-appointment-btn"
          >
            <h4 className="text-sm font-bold text-gray-900">Prendre Rendez-vous</h4>
            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">Prenez RDV avec un médecin ou un expert médical à leur cabinet ou à domicile.</p>
            <div className="flex-1 flex items-end justify-center mt-3">
              <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center">
                <Stethoscope size={40} weight="duotone" className="text-[#FF4500]" />
              </div>
            </div>
          </button>
          {/* Video Consult */}
          <button
            onClick={() => navigate('/video-consult')}
            className="rounded-2xl bg-yellow-50 border border-yellow-100 p-3 flex flex-col text-left group"
            data-testid="medical-video-btn"
          >
            <h4 className="text-xs font-bold text-gray-900">Vidéo Consultation</h4>
            <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">Consultez un médecin en visio.</p>
            <div className="flex justify-end mt-2">
              <VideoCamera size={28} weight="duotone" className="text-yellow-600" />
            </div>
          </button>
          {/* Other Medical */}
          <button
            onClick={() => navigate('/services')}
            className="rounded-2xl bg-green-50 border border-green-100 p-3 flex flex-col text-left group"
            data-testid="medical-other-btn"
          >
            <h4 className="text-xs font-bold text-gray-900">Autres Services</h4>
            <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">Pharmacie, Ambulance, Urgence.</p>
            <div className="flex justify-end mt-2">
              <FirstAid size={28} weight="duotone" className="text-green-600" />
            </div>
          </button>
        </div>
      </div>

      {/* ===== PET SERVICES ===== */}
      <div className="px-4 mt-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Services Animaux</h3>
        <div className="grid grid-cols-3 gap-x-4 gap-y-4">
          {petServices.map((s) => <ServiceIcon key={s.id} service={s} />)}
        </div>
      </div>

      {/* ===== BID FOR SERVICES ===== */}
      <div className="px-4 mt-5">
        <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4" data-testid="bid-services-section">
          <h3 className="text-lg font-bold text-gray-900">Enchères Services</h3>
          <p className="text-xs text-gray-500 mt-1 mb-4 leading-relaxed">
            Publiez votre besoin et laissez les prestataires enchérir en temps réel. Choisissez le meilleur !
          </p>
          <div className="flex gap-3">
            {/* Illustration */}
            <div className="hidden sm:flex w-24 flex-shrink-0 items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-[#FF4500] flex items-center justify-center">
                <Wrench size={36} className="text-white" />
              </div>
            </div>
            {/* 2x3 Grid */}
            <div className="flex-1 grid grid-cols-2 gap-2">
              {bidServices.map((s) => (
                <button
                  key={s.id}
                  onClick={() => navigate(s.path || '/services-bidding')}
                  className="bg-white rounded-xl p-2.5 flex items-center gap-2 hover:shadow-sm transition-shadow border border-gray-100"
                  data-testid={`bid-${s.id}-btn`}
                >
                  <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center flex-shrink-0`}>
                    <s.icon size={18} weight="duotone" className={s.iconColor} />
                  </div>
                  <span className="text-[11px] font-semibold text-gray-700 leading-tight whitespace-pre-line">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===== CAR CARE SERVICES ===== */}
      <div className="px-4 mt-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Entretien Auto</h3>
        <div className="grid grid-cols-4 gap-x-3 gap-y-4">
          {carCareServices.map((s) => <ServiceIcon key={s.id} service={s} />)}
        </div>
      </div>

      {/* ===== TOWING / ROADSIDE ASSISTANCE ===== */}
      <div className="px-4 mt-5">
        <button
          onClick={() => navigate('/towing')}
          className="w-full rounded-2xl bg-gradient-to-r from-orange-50 to-orange-100 border border-orange-200 p-5 flex items-center gap-4 text-left"
          data-testid="towing-section-btn"
        >
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">Dépannage & Remorquage</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Remorquage d'urgence, pneu crevé, démarrage, panne sèche et plus. Assistance routière 24/7.
            </p>
          </div>
          <div className="w-16 h-16 flex-shrink-0 flex items-center justify-center">
            <span className="text-4xl">🚛</span>
          </div>
        </button>
      </div>

      {/* ===== BUY, SELL & RENT ===== */}
      <div className="px-4 mt-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Acheter, Vendre & Louer</h3>
        <div className="space-y-3">
          {/* Real Estate */}
          <button
            onClick={() => navigate('/marketplace/real-estate')}
            className="w-full rounded-2xl overflow-hidden bg-gradient-to-r from-[#FF4500] to-[#E03D00] flex items-stretch h-[90px] text-left"
            data-testid="marketplace-realestate-btn"
          >
            <div className="flex-1 p-4 flex flex-col justify-center">
              <p className="text-xs font-bold text-white/80 uppercase tracking-wide">Acheter, Vendre & Louer</p>
              <p className="text-base font-bold text-orange-400 mt-0.5">Immobilier</p>
            </div>
            <div className="w-1/3 flex items-center justify-center bg-white/10">
              <Buildings size={40} weight="duotone" className="text-white/80" />
            </div>
          </button>
          {/* Cars */}
          <button
            onClick={() => navigate('/marketplace/cars')}
            className="w-full rounded-2xl overflow-hidden bg-gradient-to-r from-yellow-400 to-blue-400 flex items-stretch h-[90px] text-left"
            data-testid="marketplace-cars-btn"
          >
            <div className="flex-1 p-4 flex flex-col justify-center">
              <p className="text-sm font-bold text-gray-900">Acheter, Vendre &</p>
              <p className="text-base font-bold text-gray-900">Louer Véhicules</p>
            </div>
            <div className="w-1/3 flex items-center justify-center bg-white/10">
              <Car size={40} weight="duotone" className="text-white" />
            </div>
          </button>
          {/* General Items */}
          <button
            onClick={() => navigate('/marketplace/items')}
            className="w-full rounded-2xl overflow-hidden bg-gradient-to-r from-gray-100 to-gray-200 border border-gray-200 flex items-stretch h-[90px] text-left"
            data-testid="marketplace-items-btn"
          >
            <div className="flex-1 p-4 flex flex-col justify-center">
              <p className="text-sm font-bold text-gray-900">Acheter, Vendre &</p>
              <p className="text-base font-bold text-gray-900">Articles Divers</p>
            </div>
            <div className="w-1/3 flex items-center justify-center">
              <ShoppingBag size={40} weight="duotone" className="text-gray-500" />
            </div>
          </button>
        </div>
      </div>

      {/* ===== PARKING SERVICE ===== */}
      <div className="px-4 mt-5">
        <button
          onClick={() => navigate('/parking')}
          className="w-full rounded-2xl bg-gradient-to-r from-blue-50 to-sky-50 border border-blue-200 p-5 flex items-center gap-4 text-left"
          data-testid="parking-section-btn"
        >
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">Parking</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Trouvez et réservez une place de parking à proximité. Paiement en ligne, accès facile.
            </p>
          </div>
          <div className="w-16 h-16 flex-shrink-0 rounded-full bg-blue-100 flex items-center justify-center">
            <MapPin size={32} weight="duotone" className="text-blue-600" />
          </div>
        </button>
      </div>

      {/* ===== GIFT CARDS ===== */}
      <div className="px-4 mt-5">
        <button
          onClick={() => navigate('/giftcards')}
          className="w-full rounded-2xl bg-gradient-to-r from-[#FF4500]/10 to-orange-50 border border-orange-200 p-5 flex items-center gap-4 text-left"
          data-testid="giftcards-section-btn"
        >
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">Cartes Cadeaux</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Offrez du crédit SB Drive VTC à vos proches. Disponible de 10€ à 200€.
            </p>
          </div>
          <div className="w-16 h-16 flex-shrink-0 rounded-full bg-orange-100 flex items-center justify-center">
            <Star size={32} weight="duotone" className="text-[#FF4500]" />
          </div>
        </button>
      </div>

      {/* ===== CAR POOL ===== */}
      <div className="px-4 mt-5">
        <button
          onClick={() => navigate('/carpool')}
          className="w-full rounded-2xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-5 flex items-center gap-4 text-left"
          data-testid="carpool-section-btn"
        >
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">Covoiturage</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Voyagez ? Réservez un covoiturage à petit prix. Vous conduisez ? Publiez votre trajet et gagnez de l'argent.
            </p>
          </div>
          <div className="w-20 h-20 flex-shrink-0 rounded-full bg-green-100 flex items-center justify-center">
            <UsersThree size={40} weight="duotone" className="text-green-600" />
          </div>
        </button>
      </div>

      {/* ===== TRACK FAMILY & EMPLOYEES ===== */}
      <div className="px-4 mt-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Suivi Famille & Employés</h3>
        <div className="grid grid-cols-2 gap-3" data-testid="tracking-section">
          <button className="rounded-2xl bg-yellow-50 border border-yellow-100 p-4 text-left" data-testid="track-family-btn" onClick={() => navigate('/tracking')}>
            <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center mb-2">
              <UsersFour size={28} weight="duotone" className="text-yellow-700" />
            </div>
            <h4 className="text-sm font-bold text-gray-900">Famille</h4>
            <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">Voyez où se trouvent vos proches en temps réel pour leur sécurité.</p>
          </button>
          <button className="rounded-2xl bg-green-50 border border-green-100 p-4 text-left" data-testid="track-employees-btn" onClick={() => navigate('/tracking')}>
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-2">
              <Briefcase size={28} weight="duotone" className="text-green-700" />
            </div>
            <h4 className="text-sm font-bold text-gray-900">Employés</h4>
            <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">Suivez la localisation de vos employés en temps réel.</p>
          </button>
        </div>
      </div>

      {/* ===== EXPLORE NEARBY BUSINESSES ===== */}
      <div className="px-4 mt-5 mb-4">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Commerces Proches</h3>
        <div className="grid grid-cols-4 gap-x-3 gap-y-4">
          {nearbyServices.map((s) => <ServiceIcon key={s.id} service={s} size="small" />)}
        </div>
      </div>

      {/* ===== BOTTOM NAVIGATION ===== */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="max-w-[430px] mx-auto bg-gray-900 rounded-t-3xl px-4 py-2.5 flex items-center justify-around">
          <button className="flex items-center gap-2 bg-[#FF4500] text-white px-4 py-2 rounded-full" data-testid="nav-home">
            <House size={20} weight="fill" />
            <span className="text-xs font-semibold">Accueil</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 text-gray-400 py-2" onClick={() => navigate('/history')} data-testid="nav-bookings">
            <Car size={22} weight="regular" />
            <span className="text-[10px]">Réservations</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 text-gray-400 py-2" onClick={() => navigate('/wallet')} data-testid="nav-wallet">
            <Wallet size={22} weight="regular" />
            <span className="text-[10px]">Portefeuille</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 text-gray-400 py-2" onClick={() => navigate('/profile')} data-testid="nav-profile">
            <User size={22} weight="regular" />
            <span className="text-[10px]">Profil</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserHome;
;
