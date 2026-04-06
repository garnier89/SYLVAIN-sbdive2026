import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { marketplaceAPI } from '../../services/api';
import {
  ArrowLeft, MagnifyingGlass, MapPin, Sliders, Plus, X
} from '@phosphor-icons/react';

const MARKETPLACE_CONFIG = {
  'real-estate': {
    title: 'Immobilier', apiType: 'real-estate',
    banner: 'ACHETER, VENDRE\n& LOUER', bannerSub: 'IMMOBILIER',
    bannerColor: 'from-blue-600 to-blue-700',
    bannerImage: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=300&h=200&fit=crop',
    categories: [
      { id: 'apartment', name: 'Appartement', icon: '🏢' },
      { id: 'house', name: 'Maison/Villa', icon: '🏠' },
      { id: 'studio', name: 'Studio', icon: '🏗' },
      { id: 'land', name: 'Terrain', icon: '🌿' },
    ],
  },
  'cars': {
    title: 'Véhicules', apiType: 'cars',
    banner: 'ACHETER, VENDRE\n& LOUER', bannerSub: 'VÉHICULES',
    bannerColor: 'from-yellow-400 to-blue-400',
    bannerImage: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=300&h=200&fit=crop',
    categories: [
      { id: 'citadine', name: 'Citadine', icon: '🚗' },
      { id: 'berline', name: 'Berline', icon: '🚘' },
      { id: 'suv', name: 'SUV', icon: '🚙' },
      { id: 'luxury', name: 'Luxe', icon: '🏎' },
    ],
  },
  'items': {
    title: 'Articles Divers', apiType: 'items',
    banner: 'ACHETER, VENDRE &\nARTICLES DIVERS', bannerSub: '',
    bannerColor: 'from-gray-100 to-gray-200',
    bannerImage: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=300&h=200&fit=crop',
    categories: [
      { id: 'furniture', name: 'Mobilier', icon: '🛋' },
      { id: 'electronics', name: 'Électronique', icon: '💻' },
      { id: 'fashion', name: 'Mode', icon: '⌚' },
      { id: 'hobbies', name: 'Loisirs', icon: '🎮' },
    ],
  },
};

const MarketplacePage = () => {
  const navigate = useNavigate();
  const { type } = useParams();
  const [activeTab, setActiveTab] = useState('sell');
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [listings, setListings] = useState([]);
  const [total, setTotal] = useState(0);
  const [showNewListing, setShowNewListing] = useState(false);
  const [newListing, setNewListing] = useState({ title: '', description: '', price: '', category: '', location: '' });

  const config = MARKETPLACE_CONFIG[type] || MARKETPLACE_CONFIG['items'];

  useEffect(() => {
    loadListings();
  }, [type, activeTab, activeCategory, search]);

  const loadListings = async () => {
    try {
      const params = { type: config.apiType };
      if (activeTab === 'rent') params.listing_type = 'rent';
      if (activeTab === 'sell') params.listing_type = 'sell';
      if (activeCategory) params.category = activeCategory;
      if (search) params.search = search;
      const res = await marketplaceAPI.getListings(params);
      setListings(res.data?.listings || []);
      setTotal(res.data?.total || 0);
    } catch {
      setListings([]);
    }
  };

  const handleCreateListing = async () => {
    if (!newListing.title || !newListing.price) return;
    try {
      await marketplaceAPI.createListing({
        type: config.apiType,
        title: newListing.title,
        description: newListing.description,
        price: parseFloat(newListing.price),
        category: newListing.category || activeCategory || '',
        location: newListing.location,
        listing_type: activeTab,
      });
      setShowNewListing(false);
      setNewListing({ title: '', description: '', price: '', category: '', location: '' });
      loadListings();
    } catch { /* empty */ }
  };

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
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full h-10 rounded-lg bg-white pl-10 pr-4 text-sm outline-none" data-testid="marketplace-search" />
          </div>
          <button className="w-10 h-10 bg-white rounded-lg flex items-center justify-center" data-testid="marketplace-filter-btn">
            <Sliders size={20} className="text-gray-600" />
          </button>
        </div>
      </div>

      {/* Banner */}
      <div className="px-4 mt-4">
        <div className={`rounded-2xl overflow-hidden bg-gradient-to-r ${config.bannerColor} flex items-stretch h-[130px]`}>
          <div className="flex-1 p-4 flex flex-col justify-center">
            <h2 className={`text-lg font-extrabold leading-tight whitespace-pre-line ${type === 'items' ? 'text-gray-900' : 'text-white'}`}>{config.banner}</h2>
            {config.bannerSub && <p className={`text-base font-bold mt-1 ${type === 'real-estate' ? 'text-orange-400' : 'text-white'}`}>{config.bannerSub}</p>}
          </div>
          <div className="w-2/5"><img src={config.bannerImage} alt="" className="w-full h-full object-cover" /></div>
        </div>
      </div>

      {/* Want to sell */}
      <div className="px-4 mt-4 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Vous voulez vendre ?</p>
        <Button variant="outline" size="sm" className="rounded-lg text-xs font-semibold border-gray-800 text-gray-800 h-8" onClick={() => setShowNewListing(true)} data-testid="marketplace-new-listing-btn">
          <Plus size={14} className="mr-1" />
          Nouvelle Annonce
        </Button>
      </div>

      {/* New Listing Form */}
      {showNewListing && (
        <div className="px-4 mt-3">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2 relative">
            <button onClick={() => setShowNewListing(false)} className="absolute top-2 right-2"><X size={18} className="text-gray-400" /></button>
            <h4 className="text-sm font-bold text-gray-900">Nouvelle annonce</h4>
            <input type="text" placeholder="Titre" value={newListing.title} onChange={(e) => setNewListing({...newListing, title: e.target.value})} className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm outline-none" data-testid="new-listing-title" />
            <input type="text" placeholder="Description" value={newListing.description} onChange={(e) => setNewListing({...newListing, description: e.target.value})} className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm outline-none" data-testid="new-listing-desc" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Prix (EUR)" value={newListing.price} onChange={(e) => setNewListing({...newListing, price: e.target.value})} className="h-9 rounded-lg border border-gray-200 px-3 text-sm outline-none" data-testid="new-listing-price" />
              <input type="text" placeholder="Localisation" value={newListing.location} onChange={(e) => setNewListing({...newListing, location: e.target.value})} className="h-9 rounded-lg border border-gray-200 px-3 text-sm outline-none" data-testid="new-listing-location" />
            </div>
            <Button className="w-full h-9 rounded-lg bg-blue-600 text-white text-sm font-semibold" onClick={handleCreateListing} data-testid="new-listing-submit">Publier</Button>
          </div>
        </div>
      )}

      {/* Browse Categories */}
      <div className="px-4 mt-5">
        <h3 className="text-base font-bold text-gray-900 mb-3">Catégories</h3>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {config.categories.map((cat) => (
            <button key={cat.id} onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
              className={`flex-shrink-0 w-[100px] h-[90px] rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${activeCategory === cat.id ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'}`}
              data-testid={`marketplace-cat-${cat.id}`}>
              <span className="text-2xl">{cat.icon}</span>
              <span className="text-[11px] font-medium text-center leading-tight">{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Listings */}
      <div className="px-4 mt-5 pb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-gray-900">{total} annonce{total !== 1 ? 's' : ''}</h3>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setActiveTab('sell')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${activeTab === 'sell' ? 'bg-gray-800 text-white' : 'text-gray-600'}`} data-testid="marketplace-buy-tab">Acheter</button>
            <button onClick={() => setActiveTab('rent')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${activeTab === 'rent' ? 'bg-gray-800 text-white' : 'text-gray-600'}`} data-testid="marketplace-rent-tab">Louer</button>
          </div>
        </div>

        {listings.length === 0 ? (
          <div className="text-center py-10">
            <MagnifyingGlass size={40} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Aucune annonce pour le moment.</p>
            <p className="text-xs text-gray-400 mt-1">Soyez le premier à publier !</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {listings.map((listing) => (
              <div key={listing.id} className="rounded-xl overflow-hidden border border-gray-100 shadow-sm" data-testid={`listing-${listing.id}`}>
                <div className="relative h-[100px] bg-gray-100 flex items-center justify-center">
                  {listing.images?.length > 0 ? (
                    <img src={listing.images[0]} alt={listing.title} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl">{type === 'real-estate' ? '🏠' : type === 'cars' ? '🚗' : '📦'}</span>
                  )}
                  {listing.is_featured && <span className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">VEDETTE</span>}
                </div>
                <div className="p-2.5">
                  <p className="text-sm font-bold text-gray-900">{listing.price?.toLocaleString()} &euro;</p>
                  <p className="text-xs font-medium text-blue-600 mt-0.5 truncate">{listing.title}</p>
                  {listing.location && (
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin size={11} className="text-gray-400" />
                      <p className="text-[10px] text-gray-500 truncate">{listing.location}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketplacePage;
