import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import {
  ArrowLeft, MagnifyingGlass, MapPin, Sliders, Plus
} from '@phosphor-icons/react';

const MARKETPLACE_CONFIG = {
  'real-estate': {
    title: 'Immobilier',
    banner: 'ACHETER, VENDRE\n& LOUER',
    bannerSub: 'IMMOBILIER',
    bannerColor: 'from-blue-600 to-blue-700',
    bannerImage: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=300&h=200&fit=crop',
    categories: [
      { id: 'apartment', name: 'Appartement', icon: '🏢' },
      { id: 'house', name: 'Maison/Villa', icon: '🏠' },
      { id: 'studio', name: 'Studio', icon: '🏗' },
      { id: 'land', name: 'Terrain', icon: '🌿' },
    ],
    listings: [
      { id: 'r1', title: 'Appartement Haussmannien', location: '16e Arr., Paris', price: '890 000', image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&h=300&fit=crop', featured: true },
      { id: 'r2', title: 'Loft Contemporain', location: '11e Arr., Paris', price: '650 000', image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&h=300&fit=crop', featured: true },
      { id: 'r3', title: 'Maison de Ville', location: 'Neuilly-sur-Seine', price: '1 250 000', image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&h=300&fit=crop', featured: false },
      { id: 'r4', title: 'Studio Rénové', location: '5e Arr., Paris', price: '320 000', image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&h=300&fit=crop', featured: false },
    ],
  },
  'cars': {
    title: 'Véhicules',
    banner: 'ACHETER, VENDRE\n& LOUER',
    bannerSub: 'VÉHICULES',
    bannerColor: 'from-yellow-400 to-blue-400',
    bannerImage: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=300&h=200&fit=crop',
    categories: [
      { id: 'citadine', name: 'Citadine', icon: '🚗' },
      { id: 'berline', name: 'Berline', icon: '🚘' },
      { id: 'suv', name: 'SUV', icon: '🚙' },
      { id: 'luxury', name: 'Luxe', icon: '🏎' },
    ],
    listings: [
      { id: 'c1', title: 'Peugeot 3008 - 2023', location: 'Paris 15e', price: '28 500', image: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=400&h=300&fit=crop', featured: true },
      { id: 'c2', title: 'Renault Clio V - 2022', location: 'Boulogne', price: '16 900', image: 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=400&h=300&fit=crop', featured: true },
      { id: 'c3', title: 'BMW Série 3 - 2021', location: 'Vincennes', price: '35 000', image: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=400&h=300&fit=crop', featured: false },
      { id: 'c4', title: 'Tesla Model 3 - 2023', location: 'La Défense', price: '42 000', image: 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=400&h=300&fit=crop', featured: false },
    ],
  },
  'items': {
    title: 'Articles Divers',
    banner: 'ACHETER, VENDRE &\nARTICLES DIVERS',
    bannerSub: '',
    bannerColor: 'from-gray-100 to-gray-200',
    bannerImage: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=300&h=200&fit=crop',
    categories: [
      { id: 'furniture', name: 'Mobilier', icon: '🛋' },
      { id: 'electronics', name: 'Électronique', icon: '💻' },
      { id: 'fashion', name: 'Mode &\nAccessoires', icon: '⌚' },
      { id: 'hobbies', name: 'Loisirs', icon: '🎮' },
    ],
    listings: [
      { id: 'i1', title: 'Canapé Design Italien', location: '7e Arr., Paris', price: '2 800', image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=300&fit=crop', featured: true },
      { id: 'i2', title: 'MacBook Pro M3', location: '8e Arr., Paris', price: '1 950', image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&h=300&fit=crop', featured: true },
      { id: 'i3', title: 'Vélo Électrique', location: 'Montreuil', price: '1 200', image: 'https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=400&h=300&fit=crop', featured: false },
      { id: 'i4', title: 'Console PS5 + Jeux', location: 'Clichy', price: '450', image: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=300&fit=crop', featured: false },
    ],
  },
};

const MarketplacePage = () => {
  const navigate = useNavigate();
  const { type } = useParams();
  const [activeTab, setActiveTab] = useState('buy');
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState('');

  const config = MARKETPLACE_CONFIG[type] || MARKETPLACE_CONFIG['items'];

  const filteredListings = config.listings.filter(l =>
    l.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mobile-container min-h-screen bg-white">
      {/* Header */}
      <div className="bg-blue-600 px-4 pt-3 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} data-testid="marketplace-back-btn">
            <ArrowLeft size={22} className="text-white" />
          </button>
          <div className="flex items-center gap-1.5 text-white">
            <MapPin size={16} weight="fill" />
            <span className="text-sm font-medium">Paris, France</span>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 rounded-lg bg-white pl-10 pr-4 text-sm outline-none"
              data-testid="marketplace-search"
            />
          </div>
          <button className="w-10 h-10 bg-white rounded-lg flex items-center justify-center" data-testid="marketplace-filter-btn">
            <Sliders size={20} className="text-gray-600" />
          </button>
        </div>
      </div>

      {/* Banner */}
      <div className="px-4 mt-4">
        <div className={`rounded-2xl overflow-hidden bg-gradient-to-r ${config.bannerColor} flex items-stretch h-[140px]`}>
          <div className="flex-1 p-4 flex flex-col justify-center">
            <h2 className={`text-lg font-extrabold leading-tight whitespace-pre-line ${type === 'items' ? 'text-gray-900' : 'text-white'}`}>
              {config.banner}
            </h2>
            {config.bannerSub && (
              <p className={`text-base font-bold mt-1 ${type === 'real-estate' ? 'text-orange-400' : 'text-white'}`}>
                {config.bannerSub}
              </p>
            )}
          </div>
          <div className="w-2/5">
            <img src={config.bannerImage} alt="" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>

      {/* Want to sell */}
      <div className="px-4 mt-4 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Vous voulez vendre ?</p>
        <Button variant="outline" size="sm" className="rounded-lg text-xs font-semibold border-gray-800 text-gray-800 h-8" data-testid="marketplace-new-listing-btn">
          <Plus size={14} className="mr-1" />
          Nouvelle Annonce
        </Button>
      </div>

      {/* Browse Categories */}
      <div className="px-4 mt-5">
        <h3 className="text-base font-bold text-gray-900 mb-3">Catégories</h3>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {config.categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
              className={`flex-shrink-0 w-[100px] h-[90px] rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
                activeCategory === cat.id
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
              }`}
              data-testid={`marketplace-cat-${cat.id}`}
            >
              <span className="text-2xl">{cat.icon}</span>
              <span className="text-[11px] font-medium text-center leading-tight whitespace-pre-line">{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Listings */}
      <div className="px-4 mt-5 pb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-gray-900">
            {type === 'real-estate' ? 'Tous les Biens' : type === 'cars' ? 'Tous les Véhicules' : 'Tous les Articles'}
          </h3>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab('buy')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${activeTab === 'buy' ? 'bg-gray-800 text-white' : 'text-gray-600'}`}
              data-testid="marketplace-buy-tab"
            >
              Acheter
            </button>
            <button
              onClick={() => setActiveTab('rent')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${activeTab === 'rent' ? 'bg-gray-800 text-white' : 'text-gray-600'}`}
              data-testid="marketplace-rent-tab"
            >
              Louer
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {filteredListings.map((listing) => (
            <div key={listing.id} className="rounded-xl overflow-hidden border border-gray-100 shadow-sm" data-testid={`listing-${listing.id}`}>
              <div className="relative h-[120px]">
                <img src={listing.image} alt={listing.title} className="w-full h-full object-cover" />
                {listing.featured && (
                  <span className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                    EN VEDETTE
                  </span>
                )}
              </div>
              <div className="p-2.5">
                <p className="text-sm font-bold text-gray-900">{listing.price} &euro;</p>
                <p className="text-xs font-medium text-blue-600 mt-0.5 truncate">{listing.title}</p>
                <div className="flex items-center gap-1 mt-1">
                  <MapPin size={11} className="text-gray-400" />
                  <p className="text-[10px] text-gray-500 truncate">{listing.location}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MarketplacePage;
