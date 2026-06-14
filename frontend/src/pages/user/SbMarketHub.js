/**
 * SB Market — Hub unifié « Acheter, Vendre & Louer ».
 * Consolide Immobilier, Véhicules (achat-vente), Location (voiture+moto)
 * et Marketplace (articles divers) en une seule expérience mobile-first.
 * Design : /app/design_guidelines.json (rose #F43F5E, Manrope, mobile-first).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Car, KeyRound, Package, Search, Plus, MapPin,
  ChevronLeft, Sparkles, X, Bike, Building2, ShoppingBag,
} from 'lucide-react';
import { toast } from 'sonner';
import { marketplaceAPI, realEstateAPI, favoritesAPI } from '../../services/api';
import { FavoriteButton } from '../../components/FavoriteButton';

const FONT = "font-['Manrope']";

const fmtPrice = (p) => `${Number(p || 0).toLocaleString('fr-FR')} €`;
const rentSuffix = (period) => (period === 'day' ? '/jour' : period === 'week' ? '/sem.' : period === 'month' ? '/mois' : '');

// Image de repli par verticale (depuis design_guidelines.json)
const FALLBACK = {
  realestate: 'https://images.pexels.com/photos/32178051/pexels-photo-32178051.png?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  vehicle: 'https://images.unsplash.com/photo-1781189799073-24cd79ac45ee?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MDV8MHwxfHNlYXJjaHwxfHx1c2VkJTIwY2FyJTIwc2hvd3Jvb218ZW58MHx8fHwxNzgxNDA3Njk0fDA&ixlib=rb-4.1.0&q=85',
  item: 'https://images.pexels.com/photos/215581/pexels-photo-215581.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
};

// ── Catégories du hub (navigation) ──
const CATEGORIES = [
  { key: 'immobilier', label: 'Immobilier', Icon: Home, action: { type: 'nav', to: '/real-estate' } },
  { key: 'vehicules', label: 'Véhicules', Icon: Car, action: { type: 'nav', to: '/marketplace/cars' } },
  { key: 'location', label: 'Location', Icon: KeyRound, action: { type: 'sheet', sheet: 'location' } },
  { key: 'marketplace', label: 'Marketplace', Icon: Package, action: { type: 'nav', to: '/marketplace/items' } },
];

// ── Filtres du fil d'annonces ──
const FILTERS = [
  { key: 'all', label: 'Tout' },
  { key: 'realestate', label: 'Immobilier' },
  { key: 'vehicle', label: 'Véhicules' },
  { key: 'item', label: 'Marketplace' },
];

// ── Options « Publier une annonce » (flux dédié par catégorie) ──
const PUBLISH_OPTIONS = [
  { key: 'immo', label: 'Un bien immobilier', desc: 'Vendre ou louer un logement', Icon: Building2, to: '/real-estate/post', color: 'text-emerald-600 bg-emerald-50' },
  { key: 'vehicule', label: 'Un véhicule', desc: 'Vendre votre voiture ou moto', Icon: Car, to: '/marketplace/sell-vehicle', color: 'text-orange-600 bg-orange-50' },
  { key: 'article', label: 'Un article', desc: 'Objets, mobilier, électronique…', Icon: ShoppingBag, to: '/ma-galerie', color: 'text-violet-600 bg-violet-50' },
];

// ── Carte d'annonce réutilisable (toutes verticales) ──
const ListingCard = ({ item, favType, favorited, onFav, onOpen }) => (
  <motion.div
    whileTap={{ scale: 0.98 }}
    onClick={() => onOpen(item)}
    data-testid={`market-listing-${item.id}`}
    className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 relative group flex flex-col h-full hover:shadow-md transition-shadow cursor-pointer"
  >
    <div className="relative aspect-[4/3] w-full bg-slate-100 overflow-hidden">
      <img src={item.image || FALLBACK[item.imgKind] || FALLBACK.item} alt={item.title}
        className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]" loading="lazy" />
      {item.is_featured && (
        <span className="absolute top-2 left-2 bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 z-10" data-testid={`market-boosted-${item.id}`}>
          <Sparkles size={11} /> À la une
        </span>
      )}
      <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
        <FavoriteButton itemType={favType} itemId={item.id} favorited={favorited} onChange={onFav} size={15} className="!w-8 !h-8" />
      </div>
    </div>
    <div className="p-3 flex flex-col flex-1">
      <p className="text-lg font-bold text-slate-900 mt-1 leading-none">
        {fmtPrice(item.price)}
        {item.listing_type === 'rent' && <span className="text-xs font-medium text-slate-400"> {rentSuffix(item.rent_period)}</span>}
      </p>
      <p className="text-sm font-medium text-slate-700 line-clamp-2 mt-1">{item.title}</p>
      {item.location && (
        <p className="text-xs text-slate-500 mt-auto pt-2 flex items-center gap-1 truncate">
          <MapPin size={12} className="shrink-0" /> <span className="truncate">{item.location}</span>
        </p>
      )}
    </div>
  </motion.div>
);

// ── Skeleton de chargement ──
const CardSkeleton = () => (
  <div className="bg-white rounded-2xl overflow-hidden border border-slate-100">
    <div className="aspect-[4/3] w-full bg-slate-100 animate-pulse" />
    <div className="p-3 space-y-2">
      <div className="h-5 w-1/2 bg-slate-100 rounded animate-pulse" />
      <div className="h-3 w-3/4 bg-slate-100 rounded animate-pulse" />
    </div>
  </div>
);

const BottomSheet = ({ open, onClose, title, children, testid }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[3000] bg-black/40 flex items-end" onClick={onClose} data-testid={testid}
      >
        <motion.div
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md mx-auto bg-white rounded-t-3xl p-6 pb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold tracking-tight text-slate-900">{title}</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center" data-testid="sheet-close-btn">
              <X size={16} className="text-slate-600" />
            </button>
          </div>
          {children}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

const SbMarketHub = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [favMk, setFavMk] = useState(new Set());
  const [favRe, setFavRe] = useState(new Set());
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [mk, re] = await Promise.allSettled([
          marketplaceAPI.getListings({ limit: 40 }),
          realEstateAPI.list({ limit: 30 }),
        ]);
        if (!alive) return;
        const mkItems = (mk.status === 'fulfilled' ? mk.value.data.listings || [] : []).map((l) => ({
          id: l.id, source: 'marketplace', favType: 'marketplace',
          title: l.title, price: l.price, image: l.image, location: l.location,
          listing_type: l.listing_type, rent_period: l.rent_period, is_featured: l.is_featured,
          group: l.kind === 'vehicle' ? 'vehicle' : 'item',
          imgKind: l.kind === 'vehicle' ? 'vehicle' : 'item',
          route: l.kind === 'vehicle' ? '/marketplace/cars' : '/marketplace/items',
        }));
        const reItems = (re.status === 'fulfilled' ? re.value.data || [] : []).map((p) => ({
          id: p.id, source: 'realestate', favType: 'property',
          title: p.title, price: p.price, image: p.thumbnail, location: p.address || p.city,
          listing_type: p.listing_type, rent_period: p.rent_period, is_featured: p.is_featured,
          group: 'realestate', imgKind: 'realestate', route: `/real-estate/${p.id}`,
        }));
        // Entrelace : boostées d'abord, puis récentes (immobilier + marketplace)
        const merged = [...reItems, ...mkItems].sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0));
        setItems(merged);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    favoritesAPI.ids('marketplace').then((r) => alive && setFavMk(new Set(r.data.ids || []))).catch(() => {});
    favoritesAPI.ids('property').then((r) => alive && setFavRe(new Set(r.data.ids || []))).catch(() => {});
    return () => { alive = false; };
  }, []);

  const onFav = useCallback((type) => (id, fav) => {
    const setter = type === 'property' ? setFavRe : setFavMk;
    setter((prev) => { const n = new Set(prev); if (fav) n.add(id); else n.delete(id); return n; });
  }, []);

  const openCategory = (cat) => {
    if (cat.action.type === 'nav') navigate(cat.action.to);
    else if (cat.action.sheet === 'location') setLocationOpen(true);
  };

  const openListing = (item) => navigate(item.route);

  const q = query.trim().toLowerCase();
  const visible = items.filter((it) => {
    if (filter !== 'all' && it.group !== filter) return false;
    if (q && !(it.title || '').toLowerCase().includes(q) && !(it.location || '').toLowerCase().includes(q)) return false;
    return true;
  });
  const featured = items.filter((it) => it.is_featured).slice(0, 10);

  const favOf = (it) => (it.favType === 'property' ? favRe.has(it.id) : favMk.has(it.id));

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-900 pb-28 max-w-md mx-auto w-full ${FONT}`} data-testid="sb-market-hub">
      {/* Header + recherche sticky */}
      <header className="sticky top-0 z-40 bg-slate-50/95 backdrop-blur-md px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/home')} className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0" data-testid="market-back-btn">
            <ChevronLeft size={20} className="text-slate-700" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 leading-none">SB Market</h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Acheter, vendre & louer près de vous</p>
          </div>
        </div>
        <div className="bg-white shadow-sm border border-slate-100 rounded-full flex items-center px-4 py-3 transition-all focus-within:ring-2 focus-within:ring-rose-500">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une annonce…"
            className="flex-1 bg-transparent outline-none text-sm ml-2 placeholder:text-slate-400"
            data-testid="global-search-input"
          />
          {query && (
            <button onClick={() => setQuery('')} data-testid="market-search-clear" className="text-slate-400">
              <X size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Grille de catégories */}
      <section className="px-4 mt-4">
        <div className="grid grid-cols-4 gap-2">
          {CATEGORIES.map(({ key, label, Icon, action }) => (
            <motion.button
              key={key}
              whileTap={{ scale: 0.95 }}
              onClick={() => openCategory({ action })}
              data-testid={`market-cat-${key}`}
              className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl shadow-sm border border-slate-100 aspect-square text-center gap-2 hover:-translate-y-1 transition-transform"
            >
              <span className="w-10 h-10 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center">
                <Icon size={20} />
              </span>
              <span className="text-xs font-semibold text-slate-700 leading-tight">{label}</span>
            </motion.button>
          ))}
        </div>
      </section>

      {/* À la une / Annonces boostées */}
      {featured.length > 0 && (
        <section className="mt-6" data-testid="market-featured-section">
          <div className="px-4 flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
              <Sparkles size={18} className="text-amber-500" /> À la une
            </h2>
          </div>
          <div className="flex overflow-x-auto hide-scrollbar gap-4 pb-2 px-4 snap-x snap-mandatory">
            {featured.map((it) => (
              <div key={`f-${it.source}-${it.id}`} className="min-w-[230px] max-w-[260px] snap-start">
                <ListingCard item={it} favType={it.favType} favorited={favOf(it)} onFav={onFav(it.favType)} onOpen={openListing} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Fil d'annonces + filtres */}
      <section className="px-4 mt-6">
        <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-3">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              data-testid={`market-filter-${f.key}`}
              className={`px-4 py-2 rounded-full whitespace-nowrap text-sm transition-all ${
                filter === f.key
                  ? 'bg-rose-500 text-white font-semibold shadow-md shadow-rose-200'
                  : 'bg-white text-slate-600 border border-slate-200 font-medium hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center" data-testid="market-empty-state">
            <Package className="w-16 h-16 text-slate-300 mb-4" />
            <p className="text-lg font-bold text-slate-900 mb-2">Aucune annonce</p>
            <p className="text-sm text-slate-500 mb-6 max-w-xs">Aucun résultat ne correspond à votre recherche. Essayez une autre catégorie ou publiez la première annonce.</p>
            <button onClick={() => setPublishOpen(true)} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm" data-testid="market-empty-publish-btn">
              Publier une annonce
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3" data-testid="market-listings-grid">
            {visible.map((it) => (
              <ListingCard key={`${it.source}-${it.id}`} item={it} favType={it.favType} favorited={favOf(it)} onFav={onFav(it.favType)} onOpen={openListing} />
            ))}
          </div>
        )}
      </section>

      {/* FAB Publier une annonce */}
      <button
        onClick={() => setPublishOpen(true)}
        data-testid="publish-ad-fab"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-xl shadow-slate-900/20 flex items-center gap-2 font-bold z-50 hover:bg-slate-800 transition-colors active:scale-95"
      >
        <Plus size={20} /> Publier une annonce
      </button>

      {/* Sheet — Publier (flux dédié par catégorie) */}
      <BottomSheet open={publishOpen} onClose={() => setPublishOpen(false)} title="Que souhaitez-vous publier ?" testid="publish-sheet">
        <div className="space-y-2.5">
          {PUBLISH_OPTIONS.map(({ key, label, desc, Icon, to, color }) => (
            <button
              key={key}
              onClick={() => { setPublishOpen(false); navigate(to); }}
              data-testid={`publish-option-${key}`}
              className="w-full flex items-center gap-3 p-3 rounded-2xl border border-slate-100 bg-white hover:bg-slate-50 transition-colors text-left active:scale-[0.99]"
            >
              <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                <Icon size={22} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-slate-900">{label}</span>
                <span className="block text-xs text-slate-500">{desc}</span>
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Sheet — Location (voiture / moto) */}
      <BottomSheet open={locationOpen} onClose={() => setLocationOpen(false)} title="Louer un véhicule" testid="location-sheet">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => { setLocationOpen(false); navigate('/location-voiture'); }} data-testid="location-option-car"
            className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-slate-100 bg-white hover:bg-slate-50 transition-colors active:scale-[0.98]">
            <span className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center"><Car size={24} /></span>
            <span className="text-sm font-bold text-slate-900">Voiture</span>
          </button>
          <button onClick={() => { setLocationOpen(false); navigate('/moto-location'); }} data-testid="location-option-moto"
            className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-slate-100 bg-white hover:bg-slate-50 transition-colors active:scale-[0.98]">
            <span className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center"><Bike size={24} /></span>
            <span className="text-sm font-bold text-slate-900">Moto / Scooter</span>
          </button>
        </div>
      </BottomSheet>
    </div>
  );
};

export default SbMarketHub;
