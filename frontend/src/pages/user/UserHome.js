import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { walletAPI } from '../../services/api';
import {
  Car, Motorcycle, Package, ForkKnife,
  House, MapPin, Bell, Wallet, User,
  CaretRight, Star, Wrench, UsersThree,
  Truck, Calendar, Gavel, Storefront,
  Taxi, MapTrifold, MagnifyingGlass,
  GridFour
} from '@phosphor-icons/react';

const UserHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Bienvenue');
    else if (hour < 18) setGreeting('Bienvenue');
    else setGreeting('Bienvenue');
    loadWallet();
  }, []);

  const loadWallet = async () => {
    try {
      const res = await walletAPI.get();
      setWalletBalance(res.data.balance || 0);
    } catch (e) { /* ignore */ }
  };

  // Taxi Services grid (8 items like XJekPlus)
  const taxiServices = [
    { id: 'taxi-booking', name: 'VTC\nRéservation', icon: Car, bg: 'bg-amber-50', iconColor: 'text-amber-500', path: '/ride' },
    { id: 'taxi-pooling', name: 'VTC\nPooling', icon: UsersThree, bg: 'bg-teal-50', iconColor: 'text-teal-500', path: '/ride?type=pool' },
    { id: 'taxi-rental', name: 'VTC\nLocation', icon: Taxi, bg: 'bg-blue-50', iconColor: 'text-blue-500', path: '/ride?type=rental' },
    { id: 'personal-driver', name: 'Chauffeur\nPrivé', icon: User, bg: 'bg-orange-50', iconColor: 'text-orange-700', path: '/ride?type=private' },
    { id: 'taxi-bidding', name: 'Enchères\nVTC', icon: Gavel, bg: 'bg-pink-50', iconColor: 'text-pink-500', path: '/ride?type=bid' },
    { id: 'taxi-intercity', name: 'VTC\nIntercity', icon: Truck, bg: 'bg-green-50', iconColor: 'text-green-600', path: '/ride?type=intercity' },
    { id: 'schedule-ride', name: 'Programmer\nCourse', icon: Calendar, bg: 'bg-yellow-50', iconColor: 'text-yellow-600', path: '/ride?type=schedule' },
    { id: 'more-services', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/services' },
  ];

  return (
    <div className="mobile-container min-h-screen pb-20 bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="bg-white px-4 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-gray-400">{greeting}</p>
            <h2 className="text-xl font-bold text-gray-900">{user?.name || 'Utilisateur'}</h2>
          </div>
          <Avatar className="h-11 w-11 border-2 border-[#00C853] cursor-pointer" onClick={() => navigate('/profile')}>
            <AvatarImage src={user?.avatar_url} />
            <AvatarFallback className="bg-[#00C853]/10 text-[#00C853] font-semibold text-sm">
              {user?.name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Location */}
        <div className="flex items-center gap-1.5 mt-2">
          <MapPin size={16} weight="fill" className="text-[#00C853] flex-shrink-0" />
          <p className="text-sm text-gray-600 truncate">Paris, France</p>
          <CaretRight size={12} className="text-gray-400 flex-shrink-0" />
        </div>

        {/* Search */}
        <div className="mt-3 relative" onClick={() => navigate('/services')} data-testid="search-services-bar">
          <MagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <div className="w-full h-11 rounded-xl bg-gray-100 border border-gray-200 flex items-center pl-10 text-sm text-gray-400 cursor-pointer">
            Rechercher des services
          </div>
        </div>
      </div>

      {/* Promo Banner Carousel */}
      <div className="px-4 mt-4">
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
          <div className="min-w-[85%] snap-start rounded-2xl overflow-hidden bg-gradient-to-r from-gray-100 to-gray-50 border border-gray-200 flex items-stretch" data-testid="promo-banner-1">
            <div className="w-2/5 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&h=200&fit=crop')" }} />
            <div className="flex-1 p-4 flex flex-col justify-center">
              <p className="font-bold text-gray-900 text-base leading-tight">Courses fraîches livrées vite.</p>
              <p className="text-sm text-gray-500 mt-1">Commandez maintenant !</p>
              <button className="mt-2 self-start px-4 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg" onClick={() => navigate('/food')}>
                Commander
              </button>
            </div>
          </div>
          <div className="min-w-[85%] snap-start rounded-2xl overflow-hidden bg-gradient-to-r from-[#00C853]/10 to-emerald-50 border border-emerald-200 flex items-stretch" data-testid="promo-banner-2">
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

      {/* Taxi Services */}
      <div className="px-4 mt-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Services Taxi</h3>
        <div className="grid grid-cols-4 gap-x-3 gap-y-4">
          {taxiServices.map((s) => (
            <button
              key={s.id}
              onClick={() => navigate(s.path)}
              className="flex flex-col items-center gap-1.5 group"
              data-testid={`service-${s.id}-btn`}
            >
              <div className={`w-[60px] h-[60px] rounded-2xl ${s.bg} flex items-center justify-center group-hover:scale-105 transition-transform border border-gray-100`}>
                <s.icon size={28} weight="duotone" className={s.iconColor} />
              </div>
              <span className="text-[11px] font-medium text-gray-700 text-center leading-tight whitespace-pre-line">{s.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Parcel Delivery Section */}
      <div className="px-4 mt-5">
        <div
          className="rounded-2xl overflow-hidden bg-gradient-to-r from-purple-600 to-indigo-700 p-5 cursor-pointer"
          onClick={() => navigate('/parcel')}
          data-testid="parcel-delivery-section"
        >
          <h3 className="text-lg font-bold text-white">Livraison de Colis</h3>
          <p className="text-sm text-white/80 mt-1">Envoyez un ou plusieurs colis n'importe où en ville.</p>
          <button className="mt-3 px-5 py-2 bg-white text-purple-700 text-sm font-semibold rounded-xl">
            Envoyer un colis
          </button>
        </div>
      </div>

      {/* Store Delivery */}
      <div className="px-4 mt-4">
        <div
          className="rounded-2xl overflow-hidden bg-gradient-to-r from-rose-500 to-orange-500 p-5 cursor-pointer"
          onClick={() => navigate('/food')}
          data-testid="store-delivery-section"
        >
          <h3 className="text-lg font-bold text-white">Livraison Repas</h3>
          <p className="text-sm text-white/80 mt-1">Commandez auprès de vos restaurants préférés.</p>
          <button className="mt-3 px-5 py-2 bg-white text-rose-600 text-sm font-semibold rounded-xl">
            Commander maintenant
          </button>
        </div>
      </div>

      {/* On-Demand Services */}
      <div className="px-4 mt-4 mb-4">
        <div
          className="rounded-2xl overflow-hidden bg-gradient-to-r from-teal-500 to-emerald-600 p-5 cursor-pointer"
          onClick={() => navigate('/services')}
          data-testid="on-demand-section"
        >
          <h3 className="text-lg font-bold text-white">Services à la demande</h3>
          <p className="text-sm text-white/80 mt-1">Plomberie, électricité, ménage, beauté et plus encore.</p>
          <button className="mt-3 px-5 py-2 bg-white text-teal-700 text-sm font-semibold rounded-xl">
            Voir les services
          </button>
        </div>
      </div>

      {/* Bottom Navigation — XJekPlus style (dark, rounded pill for active) */}
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
