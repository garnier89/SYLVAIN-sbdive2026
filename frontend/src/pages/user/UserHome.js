import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { walletAPI } from '../../services/api';
import {
  Car, Motorcycle, Package, ForkKnife,
  House, MapPin, Wallet, User,
  CaretRight, CaretDown, Star, Wrench, UsersThree,
  Truck, Calendar, Gavel, Storefront,
  Taxi, MagnifyingGlass, GridFour, List,
  VideoCamera, FirstAid, Scissors,
  PawPrint, GasPump, Broom, ArrowRight
} from '@phosphor-icons/react';

const UserHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Bienvenue');
    else if (hour < 18) setGreeting('Bienvenue');
    else setGreeting('Bonsoir');
  }, []);

  // ===== Taxi Services (8 items) =====
  const taxiServices = [
    { id: 'taxi-booking', name: 'VTC\nRéservation', icon: Car, bg: 'bg-amber-50', iconColor: 'text-amber-500', path: '/ride' },
    { id: 'taxi-pooling', name: 'VTC\nPooling', icon: UsersThree, bg: 'bg-teal-50', iconColor: 'text-teal-500', path: '/ride?type=pool' },
    { id: 'taxi-rental', name: 'VTC\nLocation', icon: Taxi, bg: 'bg-blue-50', iconColor: 'text-blue-500', path: '/ride?type=rental' },
    { id: 'personal-driver', name: 'Chauffeur\nPrivé', icon: User, bg: 'bg-orange-50', iconColor: 'text-orange-700', path: '/ride?type=private' },
    { id: 'taxi-bidding', name: 'Enchères\nVTC', icon: Gavel, bg: 'bg-pink-50', iconColor: 'text-pink-500', path: '/ride?type=bid' },
    { id: 'taxi-intercity', name: 'VTC\nIntercity', icon: Truck, bg: 'bg-green-50', iconColor: 'text-green-600', path: '/ride?type=intercity' },
    { id: 'schedule-ride', name: 'Programmer\nCourse', icon: Calendar, bg: 'bg-cyan-50', iconColor: 'text-cyan-600', path: '/ride?type=schedule' },
    { id: 'more-taxi', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/services' },
  ];

  // ===== Delivery Services (4 items) =====
  const deliveryServices = [
    { id: 'food-delivery', name: 'Livraison\nRepas', icon: ForkKnife, bg: 'bg-rose-50', iconColor: 'text-rose-500', path: '/food' },
    { id: 'grocery-delivery', name: 'Livraison\nCourses', icon: Storefront, bg: 'bg-emerald-50', iconColor: 'text-emerald-500', path: '/food' },
    { id: 'medicine-delivery', name: 'Livraison\nMédicaments', icon: FirstAid, bg: 'bg-red-50', iconColor: 'text-red-500', path: '/food' },
    { id: 'more-delivery', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-blue-50', iconColor: 'text-blue-500', path: '/services' },
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
    { id: 'massage', name: 'Massage', icon: Scissors, bg: 'bg-sky-50', iconColor: 'text-sky-500', path: '/services' },
    { id: 'mechanic', name: 'Mécanique', icon: GasPump, bg: 'bg-green-50', iconColor: 'text-green-500', path: '/services' },
    { id: 'more-ondemand', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-emerald-50', iconColor: 'text-emerald-600', path: '/services' },
  ];

  const ServiceIcon = ({ service }) => (
    <button
      onClick={() => navigate(service.path)}
      className="flex flex-col items-center gap-1.5 group"
      data-testid={`service-${service.id}-btn`}
    >
      <div className={`w-[62px] h-[62px] rounded-2xl ${service.bg} flex items-center justify-center group-hover:scale-105 transition-transform border border-gray-100/50`}>
        <service.icon size={28} weight="duotone" className={service.iconColor} />
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
          <Avatar className="h-10 w-10 border-2 border-gray-200 cursor-pointer" onClick={() => navigate('/profile')}>
            <AvatarImage src={user?.avatar_url} />
            <AvatarFallback className="bg-gray-100 text-gray-600 font-semibold text-sm">
              {user?.name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Location */}
        <div className="flex items-center gap-1.5 mt-2 cursor-pointer" data-testid="location-bar">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-900" />
          <p className="text-sm text-gray-700 truncate flex-1">Paris, Île-de-France, France</p>
          <CaretDown size={14} className="text-gray-400" />
        </div>

        {/* Search */}
        <div className="mt-3" onClick={() => navigate('/services')} data-testid="search-services-bar">
          <div className="w-full h-11 rounded-xl bg-gray-100 border border-gray-200 flex items-center px-3.5 gap-2.5 cursor-pointer">
            <MagnifyingGlass size={18} className="text-gray-400" />
            <span className="text-sm text-gray-400">Rechercher</span>
          </div>
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
          <div className="min-w-[92%] snap-start rounded-2xl overflow-hidden bg-gradient-to-r from-[#00C853]/10 to-emerald-50 border border-emerald-200 flex items-stretch h-[140px]" data-testid="promo-banner-2">
            <div className="flex-1 p-4 flex flex-col justify-center">
              <p className="font-bold text-gray-900 text-base leading-tight">Première course VTC</p>
              <p className="text-2xl font-bold text-[#00C853] mt-1">-50%</p>
              <p className="text-xs text-gray-500 mt-1">Code : BIENVENUE</p>
            </div>
            <div className="w-2/5 flex items-center justify-center bg-[#00C853]/5">
              <Car size={64} weight="duotone" className="text-[#00C853]" />
            </div>
          </div>
        </div>
      </div>

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
                onClick={() => navigate('/services')}
                className="flex-shrink-0 bg-white/20 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center gap-2"
                data-testid={`video-${cat.id}-btn`}
              >
                <VideoCamera size={18} className="text-white" />
                <span className="text-sm font-medium text-white">{cat.name}</span>
              </button>
            ))}
            <button
              onClick={() => navigate('/services')}
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
      <div className="px-4 mt-5 mb-4">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Services à la demande</h3>
        <div className="grid grid-cols-4 gap-x-3 gap-y-4">
          {onDemandServices.map((s) => <ServiceIcon key={s.id} service={s} />)}
        </div>
      </div>

      {/* ===== BOTTOM NAVIGATION ===== */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="max-w-[430px] mx-auto bg-gray-900 rounded-t-3xl px-4 py-2.5 flex items-center justify-around">
          <button className="flex items-center gap-2 bg-[#00C853] text-white px-4 py-2 rounded-full" data-testid="nav-home">
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
