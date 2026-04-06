import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { 
  Car, Motorcycle, Package, ForkKnife, 
  House, Briefcase, MapPin, Bell, Wallet,
  User, CaretRight, Star, Wrench, Storefront,
  Scissors, FirstAid, PawPrint, VideoCamera,
  Buildings, Truck, UsersThree, Gavel,
  GasPump, Handshake, MapTrifold
} from '@phosphor-icons/react';

const UserHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Bonjour');
    else if (hour < 18) setGreeting('Bon après-midi');
    else setGreeting('Bonsoir');
  }, []);

  // 4 Base Components (V3Cube)
  const baseServices = [
    { id: 'ride', name: 'VTC', icon: Car, color: 'bg-[#00C853]', path: '/ride' },
    { id: 'moto', name: 'Moto', icon: Motorcycle, color: 'bg-amber-500', path: '/ride?type=motorcycle' },
    { id: 'food', name: 'Repas', icon: ForkKnife, color: 'bg-rose-500', path: '/food' },
    { id: 'parcel', name: 'Colis', icon: Package, color: 'bg-blue-500', path: '/parcel' },
  ];

  // On-Demand & Delivery services
  const onDemandServices = [
    { id: 'services', name: 'Services', icon: Wrench, color: 'bg-orange-500', path: '/services' },
    { id: 'grocery', name: 'Courses', icon: Storefront, color: 'bg-teal-500', path: '/food' },
    { id: 'beauty', name: 'Beauté', icon: Scissors, color: 'bg-pink-500', path: '/services' },
    { id: 'delivery-runner', name: 'Coursier', icon: Truck, color: 'bg-indigo-500', path: '/parcel' },
  ];

  // Additional services (14 V3Cube components)
  const additionalServices = [
    { id: 'medical', name: 'Médical', icon: FirstAid, color: 'bg-red-500', path: '/services' },
    { id: 'petcare', name: 'Animaux', icon: PawPrint, color: 'bg-violet-500', path: '/services' },
    { id: 'video-consult', name: 'Vidéo Consult', icon: VideoCamera, color: 'bg-sky-500', path: '/services' },
    { id: 'carpool', name: 'Covoiturage', icon: UsersThree, color: 'bg-lime-600', path: '/ride' },
    { id: 'car-care', name: 'Auto Soins', icon: GasPump, color: 'bg-gray-600', path: '/services' },
    { id: 'towing', name: 'Remorquage', icon: Truck, color: 'bg-yellow-600', path: '/services' },
    { id: 'bid', name: 'Enchères', icon: Gavel, color: 'bg-purple-600', path: '/services' },
    { id: 'real-estate', name: 'Immobilier', icon: Buildings, color: 'bg-emerald-600', path: '/services' },
    { id: 'nearby', name: 'À proximité', icon: MapTrifold, color: 'bg-cyan-600', path: '/services' },
    { id: 'buy-sell', name: 'Achat/Vente', icon: Handshake, color: 'bg-fuchsia-600', path: '/services' },
  ];

  const savedPlaces = [
    { id: 'home', name: 'Domicile', icon: House, subtitle: 'Ajouter l\'adresse' },
    { id: 'work', name: 'Travail', icon: Briefcase, subtitle: 'Ajouter l\'adresse' },
  ];

  const ServiceButton = ({ service }) => (
    <button
      key={service.id}
      onClick={() => navigate(service.path)}
      className="flex flex-col items-center gap-2 group"
      data-testid={`service-${service.id}-btn`}
    >
      <div className={`w-14 h-14 rounded-2xl ${service.color} flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform`}>
        <service.icon size={26} weight="duotone" className="text-white" />
      </div>
      <span className="text-xs font-medium text-gray-700 leading-tight text-center">{service.name}</span>
    </button>
  );

  return (
    <div className="mobile-container min-h-screen pb-24 bg-white text-gray-900">
      {/* Header */}
      <div className="p-4 pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border-2 border-[#00C853]">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="bg-[#00C853]/10 text-[#00C853] font-semibold">
                {user?.name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm text-gray-500">{greeting}</p>
              <h2 className="font-semibold text-lg">{user?.name || 'Utilisateur'}</h2>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full relative" data-testid="notifications-btn">
            <Bell size={24} weight="duotone" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          </Button>
        </div>

        {/* Where to */}
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow border-gray-100" 
          onClick={() => navigate('/ride')}
          data-testid="where-to-card"
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <MapPin size={20} weight="duotone" className="text-[#00C853]" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Où allez-vous ?</p>
              <p className="text-sm text-gray-400">Entrez votre destination</p>
            </div>
            <CaretRight size={20} className="text-gray-300" />
          </CardContent>
        </Card>
      </div>

      {/* Base Services — 4 Core V3Cube Components */}
      <div className="px-4 py-2">
        <div className="grid grid-cols-4 gap-3">
          {baseServices.map((s) => <ServiceButton key={s.id} service={s} />)}
        </div>
      </div>

      {/* On-Demand & Delivery Services */}
      <div className="px-4 py-2">
        <h3 className="font-semibold mb-3 text-sm text-gray-500 uppercase tracking-wider">Services à la demande</h3>
        <div className="grid grid-cols-4 gap-3">
          {onDemandServices.map((s) => <ServiceButton key={s.id} service={s} />)}
        </div>
      </div>

      {/* Additional 14 Components */}
      <div className="px-4 py-2">
        <h3 className="font-semibold mb-3 text-sm text-gray-500 uppercase tracking-wider">Plus de services</h3>
        <div className="grid grid-cols-4 gap-3">
          {additionalServices.slice(0, 8).map((s) => <ServiceButton key={s.id} service={s} />)}
        </div>
        {/* Show More */}
        <div className="grid grid-cols-4 gap-3 mt-3">
          {additionalServices.slice(8).map((s) => <ServiceButton key={s.id} service={s} />)}
        </div>
      </div>

      {/* Saved Places */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Adresses favorites</h3>
          <Button variant="ghost" size="sm" className="text-[#00C853]" data-testid="manage-places-btn">Gérer</Button>
        </div>
        <div className="space-y-2">
          {savedPlaces.map((place) => (
            <Card key={place.id} className="cursor-pointer hover:bg-gray-50 transition-colors border-gray-100" data-testid={`saved-place-${place.id}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <place.icon size={20} weight="duotone" className="text-gray-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{place.name}</p>
                  <p className="text-sm text-gray-400">{place.subtitle}</p>
                </div>
                <CaretRight size={20} className="text-gray-300" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Promo Banner */}
      <div className="px-4 py-2">
        <Card className="bg-gradient-to-r from-[#00C853] to-emerald-400 text-white overflow-hidden border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Première course</p>
              <h3 className="text-xl font-bold">50% DE RÉDUCTION</h3>
              <p className="text-sm opacity-90">Code : BIENVENUE</p>
            </div>
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
              <Star size={40} weight="duotone" className="text-white" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Activité récente</h3>
          <Link to="/history" className="text-[#00C853] text-sm font-medium" data-testid="view-history-link">Tout voir</Link>
        </div>
        <Card className="border-gray-100">
          <CardContent className="p-4 flex items-center justify-center text-gray-400">
            <p className="text-sm">Aucune course récente</p>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t z-50">
        <div className="max-w-[430px] mx-auto flex items-center justify-around py-3">
          <button className="flex flex-col items-center gap-1 text-[#00C853]" data-testid="nav-home">
            <House size={24} weight="duotone" />
            <span className="text-xs font-medium">Accueil</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-gray-400" onClick={() => navigate('/history')} data-testid="nav-activity">
            <Car size={24} weight="regular" />
            <span className="text-xs">Activité</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-gray-400" onClick={() => navigate('/wallet')} data-testid="nav-wallet">
            <Wallet size={24} weight="regular" />
            <span className="text-xs">Portefeuille</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-gray-400" onClick={() => navigate('/profile')} data-testid="nav-profile">
            <User size={24} weight="regular" />
            <span className="text-xs">Profil</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserHome;
