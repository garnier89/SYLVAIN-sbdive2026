import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLocale } from '../../contexts/LocaleContext';
import { Input } from '../../components/ui/input';
import { merchantAPI, cartAPI } from '../../services/api';
import {
  MagnifyingGlass, MapPin, Star, Clock, ArrowLeft, Funnel, User,
  ShoppingCart, SealPercent, Lightning, Sparkle,
} from '@phosphor-icons/react';
import { SponsoredBanners } from '../../components/SponsoredBanners';

// Verticales de livraison — chaque type filtre les marchands par `store_type`.
// La page est réutilisée par : Repas, Courses, Fleurs, Papeterie, Vin, Matériaux.
const VERTICALS = {
  restaurant: {
    storeType: 'restaurant', title: 'Livraison Repas', heroTitle: 'LIVRAISON REPAS',
    heroSub: 'Une petite faim ? Choisissez un menu et faites-vous livrer.',
    section: 'Vendeurs chauds', placeholder: 'Rechercher un restaurant…', emptyTitle: 'Aucun restaurant trouvé',
    fallback: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800',
  },
  grocery: {
    storeType: 'grocery', title: 'Livraison Courses', heroTitle: 'COURSES',
    heroSub: 'Vos courses du quotidien livrées en un éclair.',
    section: 'Épiceries populaires', placeholder: 'Rechercher une épicerie…', emptyTitle: 'Aucune épicerie trouvée',
    fallback: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800',
  },
  florist: {
    storeType: 'florist', title: 'Livraison Fleurs', heroTitle: 'FLEURS',
    heroSub: 'Des bouquets frais livrés pour toutes les occasions.',
    section: 'Fleuristes près de vous', placeholder: 'Rechercher un fleuriste…', emptyTitle: 'Aucun fleuriste trouvé',
    fallback: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=800',
  },
  stationery: {
    storeType: 'stationery', title: 'Livraison Papeterie', heroTitle: 'PAPETERIE',
    heroSub: 'Fournitures de bureau et scolaires livrées chez vous.',
    section: 'Papeteries près de vous', placeholder: 'Rechercher une papeterie…', emptyTitle: 'Aucune papeterie trouvée',
    fallback: 'https://images.unsplash.com/photo-1568205612837-017257d2310a?w=800',
  },
  wine: {
    storeType: 'wine', title: 'Vin & Spiritueux', heroTitle: 'VIN & SPIRITUEUX',
    heroSub: 'Une sélection de vins fins et spiritueux livrés.',
    section: 'Caves près de vous', placeholder: 'Rechercher une cave…', emptyTitle: 'Aucune cave trouvée',
    fallback: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800',
  },
  construction: {
    storeType: 'construction', title: 'Matériaux & Construction', heroTitle: 'MATÉRIAUX',
    heroSub: 'Matériaux et outillage livrés sur votre chantier.',
    section: 'Magasins près de vous', placeholder: 'Rechercher un magasin…', emptyTitle: 'Aucun magasin trouvé',
    fallback: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800',
  },
};

const FoodPage = () => {
  const navigate = useNavigate();
  const { money } = useLocale();
  const [params] = useSearchParams();
  const vertical = VERTICALS[params.get('type')] || VERTICALS.restaurant;

  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cuisine, setCuisine] = useState('Tous');
  const [cart, setCart] = useState({ count: 0, merchant_id: null });

  useEffect(() => {
    let active = true;
    setLoading(true);
    merchantAPI.list({ store_type: vertical.storeType })
      .then((response) => { if (active) setMerchants(response.data || []); })
      .catch((error) => console.error('Load merchants error:', error))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [vertical.storeType]);

  useEffect(() => {
    let active = true;
    cartAPI.get()
      .then((res) => {
        const items = res.data?.items || [];
        const count = items.reduce((s, i) => s + (i.quantity || 0), 0);
        if (active) setCart({ count, merchant_id: res.data?.merchant_id || null });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Cuisine chips — derived from the merchants actually present (+ "Tous").
  const cuisines = ['Tous', ...Array.from(new Set(merchants.map((m) => m.cuisine).filter(Boolean)))];
  const showChips = cuisines.length > 2;

  const displayMerchants = merchants.filter((m) => {
    const matchSearch = m.store_name.toLowerCase().includes(search.toLowerCase());
    const matchCuisine = cuisine === 'Tous' || m.cuisine === cuisine;
    return matchSearch && matchCuisine;
  });

  return (
    <div className="mobile-container bg-white min-h-screen pb-24" data-testid="store-list-page">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#FF4500] px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <h1 className="text-white font-bold text-lg" data-testid="store-list-title">{vertical.title}</h1>
        </div>
        <div className="flex items-center gap-1 text-white/90 text-xs mb-3">
          <MapPin size={13} weight="fill" />
          <span>Livraison à votre position actuelle</span>
        </div>
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            placeholder={vertical.placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 rounded-full bg-white border-0 h-11"
            data-testid="search-input"
          />
        </div>
      </div>

      {/* Hero banner */}
      <div className="px-4 pt-4">
        <div className="relative h-36 rounded-2xl overflow-hidden shadow-sm" data-testid="store-hero">
          <img src={vertical.fallback} alt={vertical.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
          <div className="absolute inset-0 p-4 flex flex-col justify-center">
            <h2 className="text-white font-extrabold text-2xl leading-none tracking-tight">{vertical.heroTitle}</h2>
            <p className="text-white/85 text-xs mt-2 max-w-[60%] leading-snug">{vertical.heroSub}</p>
          </div>
        </div>
      </div>

      {/* Sponsored banners (admin-managed) */}
      <SponsoredBanners surface="food" accent="#FF4500" />

      {/* Cuisine chips */}
      {showChips && (
        <div className="pt-4">
          <h3 className="px-4 font-bold text-gray-900 text-base mb-2">Cuisines</h3>
          <div className="flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
            {cuisines.map((c) => {
              const active = cuisine === c;
              return (
                <button
                  key={c}
                  onClick={() => setCuisine(c)}
                  data-testid={`cuisine-chip-${c}`}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${active ? 'bg-[#FF4500] text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Section title */}
      <h3 className="px-4 pt-5 pb-2 font-bold text-gray-900 text-base">{vertical.section}</h3>

      {/* Store List */}
      <div className="px-4 space-y-4">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
              <div className="h-40 bg-gray-100" />
              <div className="p-4 space-y-2">
                <div className="h-5 bg-gray-100 rounded w-3/4" />
                <div className="h-4 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))
        ) : displayMerchants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="store-list-empty">
            <Funnel size={48} className="text-gray-300 mb-3" />
            <p className="text-gray-500">{vertical.emptyTitle}</p>
            <p className="text-sm text-gray-400">Essayez une autre recherche</p>
          </div>
        ) : (
          displayMerchants.map((merchant) => (
            <button
              key={merchant.id}
              onClick={() => navigate(`/food/${merchant.id}`)}
              className="w-full text-left rounded-2xl border border-gray-100 overflow-hidden shadow-sm bg-white active:scale-[0.99] transition-transform"
              data-testid={`merchant-${merchant.id}`}
            >
              <div className="relative h-40">
                <img
                  src={merchant.image_url || vertical.fallback}
                  alt={merchant.store_name}
                  className="w-full h-full object-cover"
                />
                <span className="absolute top-3 right-3 bg-white/95 text-gray-800 text-xs font-semibold rounded-full px-2.5 py-1 flex items-center gap-1 shadow-sm">
                  <Clock size={13} weight="fill" className="text-[#FF4500]" />
                  {merchant.eta_min || 30} min
                </span>
                {merchant.effective_discount_pct > 0 && (
                  <span className={`absolute bottom-3 left-3 text-white text-xs font-bold rounded-full px-3 py-1.5 flex items-center gap-1 shadow ${merchant.flash_active ? 'bg-amber-500' : 'bg-red-600'}`} data-testid={`merchant-discount-${merchant.id}`}>
                    {merchant.flash_active ? <Lightning size={14} weight="fill" /> : <SealPercent size={14} weight="fill" />}
                    {merchant.flash_active ? `Flash −${merchant.effective_discount_pct.toFixed(0)}%` : `Obtenir ${merchant.effective_discount_pct.toFixed(2)}% de réduction`}
                  </span>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-lg text-gray-900 leading-tight">{merchant.store_name}</h3>
                  <span className="flex items-center gap-1 flex-shrink-0 bg-amber-50 rounded-full px-2 py-0.5">
                    <Star size={14} weight="fill" className="text-amber-500" />
                    <span className="font-bold text-sm text-gray-800">{(merchant.rating || 4.5).toFixed(1)}</span>
                  </span>
                </div>
                {merchant.cuisine && (
                  <p className="text-sm text-gray-500 mt-0.5">{merchant.cuisine}</p>
                )}
                <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock size={14} /> {merchant.eta_min || 30} minutes
                  </span>
                  {merchant.price_per_person != null && (
                    <>
                      <span className="text-gray-300">|</span>
                      <span className="flex items-center gap-1">
                        <User size={14} weight="fill" className="text-[#2F9BFF]" />
                        {money(merchant.price_per_person)} par personne
                      </span>
                    </>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Cart FAB */}
      {cart.count > 0 && cart.merchant_id && (
        <button
          onClick={() => navigate(`/checkout/${cart.merchant_id}`)}
          className="fixed bottom-6 right-5 z-50 w-14 h-14 rounded-full bg-[#2F6BFF] text-white flex items-center justify-center shadow-2xl active:scale-95 transition-transform"
          data-testid="food-cart-fab"
          aria-label="Voir le panier"
        >
          <ShoppingCart size={24} weight="fill" />
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-black text-white text-[11px] font-extrabold flex items-center justify-center ring-2 ring-white" data-testid="food-cart-count">
            {cart.count}
          </span>
        </button>
      )}

      {/* SB Assistant — AI shopping helper */}
      <button
        onClick={() => navigate('/assistant')}
        className="fixed bottom-24 right-5 z-40 h-13 px-4 py-3 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-bold shadow-lg flex items-center gap-2"
        data-testid="open-assistant-btn"
      >
        <Sparkle size={18} weight="fill" /> Assistant
      </button>
    </div>
  );
};

export default FoodPage;
