import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Coffee, Scissors, Wine, Sparkle, ShoppingCart,
  FirstAid, Barbell, Buildings, BookOpen, MoonStars,
  MapPin, Star, Phone, Clock, MagnifyingGlass
} from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const CATEGORY_CONFIG = {
  cafes: { icon: Coffee, color: 'bg-amber-500', label: 'Cafes' },
  salons: { icon: Scissors, color: 'bg-pink-500', label: 'Salons' },
  bars: { icon: Wine, color: 'bg-purple-500', label: 'Bars' },
  spa: { icon: Sparkle, color: 'bg-teal-500', label: 'Spa' },
  shopping: { icon: ShoppingCart, color: 'bg-blue-500', label: 'Shopping' },
  hospital: { icon: FirstAid, color: 'bg-red-500', label: 'Hopitaux' },
  gyms: { icon: Barbell, color: 'bg-green-500', label: 'Salles de Sport' },
  malls: { icon: Buildings, color: 'bg-indigo-500', label: 'Centres Commerciaux' },
  libraries: { icon: BookOpen, color: 'bg-yellow-500', label: 'Bibliotheques' },
  nightlife: { icon: MoonStars, color: 'bg-violet-500', label: 'Vie Nocturne' },
};

const DEMO_BUSINESSES = {
  cafes: [
    { id: 'nb1', name: 'Cafe de Flore', address: '172 Bd Saint-Germain, 75006 Paris', rating: 4.4, reviews: 5234, phone: '+33145485526', hours: '7h30-1h30', image: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=300', distance: '0.3 km' },
    { id: 'nb2', name: 'Les Deux Magots', address: '6 Pl. Saint-Germain des Pres, 75006', rating: 4.3, reviews: 8912, phone: '+33145485525', hours: '7h30-1h', image: 'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=300', distance: '0.5 km' },
    { id: 'nb3', name: 'Comptoir du Pantheon', address: '5 Rue Soufflot, 75005 Paris', rating: 4.1, reviews: 1234, phone: '+33143547506', hours: '8h-23h', image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300', distance: '1.2 km' },
  ],
  salons: [
    { id: 'nb4', name: 'David Mallett', address: '14 Rue Notre Dame des Victoires, 75002', rating: 4.7, reviews: 890, phone: '+33140200023', hours: '10h-19h', image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=300', distance: '0.8 km' },
    { id: 'nb5', name: 'Salon Christophe Robin', address: '7 Rue du Bac, 75007 Paris', rating: 4.6, reviews: 567, phone: '+33142221410', hours: '9h-19h', image: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=300', distance: '1.1 km' },
  ],
  bars: [
    { id: 'nb6', name: "Harry's New York Bar", address: '5 Rue Daunou, 75002 Paris', rating: 4.5, reviews: 4567, phone: '+33142612961', hours: '12h-2h', image: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=300', distance: '0.6 km' },
    { id: 'nb7', name: 'Le Syndicat', address: '51 Rue du Faubourg Saint-Denis, 75010', rating: 4.6, reviews: 2345, phone: '+33142460888', hours: '18h-2h', image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=300', distance: '1.5 km' },
  ],
  spa: [
    { id: 'nb8', name: 'Hammam de la Mosquee', address: '39 Rue Geoffroy-Saint-Hilaire, 75005', rating: 4.2, reviews: 3456, phone: '+33143318220', hours: '10h-21h', image: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=300', distance: '0.9 km' },
  ],
  gyms: [
    { id: 'nb9', name: 'Club Med Gym Bastille', address: '4 Rue de Birague, 75004 Paris', rating: 4.0, reviews: 890, phone: '+33142725555', hours: '7h-22h', image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300', distance: '0.7 km' },
  ],
};

const NearbyBusinessPage = () => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedBiz, setSelectedBiz] = useState(null);

  const categories = Object.entries(CATEGORY_CONFIG).map(([id, cfg]) => ({ id, ...cfg }));

  const businesses = activeCategory ? (DEMO_BUSINESSES[activeCategory] || []) : [];
  const filteredBiz = businesses.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.address.toLowerCase().includes(search.toLowerCase())
  );

  if (selectedBiz) {
    return (
      <div className="mobile-container min-h-screen bg-white" data-testid="nearby-detail">
        <div className="h-48 bg-cover bg-center relative" style={{ backgroundImage: `url(${selectedBiz.image})` }}>
          <button onClick={() => setSelectedBiz(null)} className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center" data-testid="back-from-detail">
            <ArrowLeft size={18} />
          </button>
        </div>
        <div className="p-4">
          <h2 className="text-xl font-bold text-gray-900">{selectedBiz.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Star size={14} weight="fill" className="text-amber-400" />
            <span className="text-sm font-medium">{selectedBiz.rating}</span>
            <span className="text-xs text-gray-400">({selectedBiz.reviews} avis)</span>
            <span className="text-xs text-gray-400">- {selectedBiz.distance}</span>
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <MapPin size={18} className="text-gray-400 flex-shrink-0" />
              <span>{selectedBiz.address}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Clock size={18} className="text-gray-400 flex-shrink-0" />
              <span>{selectedBiz.hours}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Phone size={18} className="text-gray-400 flex-shrink-0" />
              <span>{selectedBiz.phone}</span>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <a href={`tel:${selectedBiz.phone}`} className="flex-1 bg-[#FF4500] text-white py-3 rounded-xl text-sm font-semibold text-center" data-testid="call-btn">
              Appeler
            </a>
            <button className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-semibold" data-testid="directions-btn"
              onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedBiz.address)}`, '_blank')}>
              Itineraire
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeCategory) {
    const cfg = CATEGORY_CONFIG[activeCategory];
    const Icon = cfg?.icon || Coffee;
    return (
      <div className="mobile-container min-h-screen bg-gray-50" data-testid="nearby-list">
        <div className={`${cfg?.color || 'bg-gray-500'} px-4 pt-4 pb-5`}>
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setActiveCategory(null)} className="text-white" data-testid="back-to-cats"><ArrowLeft size={22} /></button>
            <h1 className="text-lg font-bold text-white">{cfg?.label}</h1>
          </div>
          <div className="relative">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="w-full h-10 rounded-xl bg-white pl-9 pr-4 text-sm" placeholder="Rechercher..." data-testid="nearby-search" />
          </div>
        </div>
        <div className="px-4 py-4 space-y-3">
          {filteredBiz.length === 0 ? (
            <div className="text-center py-12">
              <Icon size={48} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Aucun resultat a proximite</p>
            </div>
          ) : filteredBiz.map(biz => (
            <button key={biz.id} onClick={() => setSelectedBiz(biz)}
              className="w-full bg-white rounded-2xl overflow-hidden border border-gray-100 text-left"
              data-testid={`biz-${biz.id}`}>
              <div className="h-28 bg-cover bg-center" style={{ backgroundImage: `url(${biz.image})` }} />
              <div className="p-3">
                <h3 className="font-bold text-gray-900 text-sm">{biz.name}</h3>
                <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1"><MapPin size={10} />{biz.address}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1 text-[10px]"><Star size={10} weight="fill" className="text-amber-400" />{biz.rating} ({biz.reviews})</span>
                  <span className="text-[10px] text-gray-400">{biz.distance}</span>
                  <span className="text-[10px] text-gray-400">{biz.hours}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-white" data-testid="nearby-page">
      <div className="bg-[#FF4500] px-4 py-3 flex items-center justify-between">
        <h1 className="text-white font-bold text-lg">Commerces Proches</h1>
        <button onClick={() => navigate(-1)} className="text-white" data-testid="nearby-close-btn"><ArrowLeft size={22} /></button>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-3 gap-5">
          {categories.map(cat => {
            const Icon = cat.icon;
            return (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                className="flex flex-col items-center gap-2 group" data-testid={`nearby-${cat.id}`}>
                <div className={`w-[80px] h-[80px] rounded-2xl ${cat.color}/10 flex items-center justify-center group-hover:scale-105 transition-transform border border-gray-100/50`}>
                  <Icon size={36} weight="duotone" className={cat.color.replace('bg-', 'text-')} />
                </div>
                <span className="text-xs font-semibold text-gray-700 text-center leading-tight">{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default NearbyBusinessPage;
