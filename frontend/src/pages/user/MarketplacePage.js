import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MagnifyingGlass, Buildings, Car, ShoppingBag, CheckCircle, ChatCircleText, Phone, Plus, GasPump, Calendar, Gauge } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { marketplaceAPI } from '../../services/api';
import { useLocale } from '../../contexts/LocaleContext';
import { BuyModal } from './marketplace/BuyModal';
import { SponsoredBanners } from '../../components/SponsoredBanners';

const CATEGORIES = {
  cars: { label: 'Véhicules', icon: Car, kind: 'vehicle' },
  items: { label: 'Articles', icon: ShoppingBag, kind: 'item' },
};

const MarketplacePage = () => {
  const navigate = useNavigate();
  const { money } = useLocale();
  const params = useParams();
  const activeCat = params.category && CATEGORIES[params.category] ? params.category : null;
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [buying, setBuying] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const kind = activeCat ? CATEGORIES[activeCat].kind : undefined;
      const r = await marketplaceAPI.getListings({ kind, limit: 100 });
      setListings(r.data?.listings || []);
    } catch (e) { setListings([]); }
    finally { setLoading(false); }
  }, [activeCat]);
  useEffect(() => { load(); }, [load]);

  const filtered = listings.filter(l => {
    const q = search.trim().toLowerCase();
    return !q || (l.title || '').toLowerCase().includes(q) || (l.location || '').toLowerCase().includes(q);
  });

  const cat = activeCat ? CATEGORIES[activeCat] : null;
  const title = cat ? cat.label : 'Acheter, Vendre & Louer';
  const sellRoute = activeCat === 'cars' ? '/marketplace/sell-vehicle' : '/ma-galerie';

  const rentLabel = (l) => l.listing_type === 'rent'
    ? `Location${l.rent_period === 'month' ? ' / mois' : l.rent_period === 'day' ? ' / jour' : ''}`
    : 'Vente';

  const startChat = async (l) => {
    try {
      const r = await marketplaceAPI.startThread(l.id);
      navigate(`/marketplace/messages/${r.data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Impossible de démarrer la conversation');
    }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-8" data-testid="marketplace-page">
      {/* Header (orange, V3Cube look — consistent with Livraison Repas) */}
      <div className="sticky top-0 z-40 bg-[#FF4500] px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <h1 className="text-lg font-bold text-white flex-1">{title}</h1>
          <button onClick={() => navigate('/marketplace/messages')} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white" data-testid="marketplace-messages-btn" title="Mes messages">
            <ChatCircleText size={20} weight="fill" />
          </button>
          <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-white/20 text-white">{filtered.length}</span>
        </div>
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Titre, ville..." className="w-full bg-white border-0 rounded-full pl-10 pr-3 h-11 text-sm outline-none" data-testid="search-input" />
        </div>
      </div>

      <div className="px-4 pt-3 flex gap-2 overflow-x-auto scrollbar-hide">
        {Object.entries(CATEGORIES).map(([key, c]) => (          <button
            key={key}
            onClick={() => navigate(`/marketplace/${key}`)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${activeCat === key ? 'bg-orange-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
            data-testid={`cat-${key}`}
          >
            <c.icon size={14} weight="duotone" />{c.label}
          </button>
        ))}
        <button onClick={() => navigate('/real-estate')} className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap bg-white text-gray-600 border border-gray-200 flex items-center gap-1.5" data-testid="cat-real-estate">
          <Buildings size={14} weight="duotone" />Immobilier
        </button>
        {activeCat && (
          <button onClick={() => navigate('/marketplace')} className="px-3 py-1.5 rounded-full text-xs font-semibold text-gray-500 underline" data-testid="cat-clear">Tout voir</button>
        )}
      </div>

      {/* Sponsored banners (admin-managed) */}
      <SponsoredBanners surface="marketplace" accent="#FF4500" />

      <div className="px-4 mt-4">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">Aucune annonce</p>
            <button onClick={() => navigate(sellRoute)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600" data-testid="empty-sell-btn">
              <Plus size={16} /> Déposer une annonce
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(l => (
              <button key={l.id} onClick={() => setSelected(l)} className={`bg-white rounded-2xl overflow-hidden border text-left hover:shadow-md transition-shadow relative ${l.is_featured ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-100'}`} data-testid={`listing-${l.id}`}>
                {l.is_featured && (
                  <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shadow" data-testid={`sponsored-${l.id}`}>
                    ★ Sponsorisé
                  </span>
                )}
                {l.seller_verified && (
                  <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-0.5 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow" data-testid={`verified-seller-${l.id}`} title="Vendeur vérifié">
                    <CheckCircle size={10} weight="fill" /> Vérifié
                  </span>
                )}
                {l.image && (
                  <div className="w-full h-28 bg-gray-100">
                    <img src={l.image} alt={l.title} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="p-2.5">
                  <p className="text-sm font-bold text-gray-900 line-clamp-2 leading-tight">{l.title}</p>
                  {l.kind === 'vehicle' && l.vehicle && (l.vehicle.brand || l.vehicle.year) && (
                    <p className="text-[10px] text-gray-500 mt-0.5 truncate">{[l.vehicle.brand, l.vehicle.model, l.vehicle.year].filter(Boolean).join(' · ')}</p>
                  )}
                  <p className="text-base font-extrabold text-blue-600 mt-1">{money(l.price)}{l.listing_type === 'rent' && l.rent_period === 'day' ? <span className="text-[10px] font-semibold text-gray-400"> /jour</span> : null}</p>
                  {l.purchasable && <span className="inline-block mt-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Achetable</span>}
                  {l.location && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{l.location}</p>}
                  <span className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${l.listing_type === 'rent' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{rentLabel(l)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floating "Déposer une annonce" */}
      <button onClick={() => navigate(sellRoute)} className="fixed bottom-6 right-1/2 translate-x-[210px] max-[480px]:right-5 max-[480px]:translate-x-0 z-30 bg-orange-600 text-white rounded-full shadow-lg w-14 h-14 flex items-center justify-center active:scale-95 transition-transform" data-testid="fab-sell-btn" title="Déposer une annonce">
        <Plus size={26} weight="bold" />
      </button>

      {selected && (
        <div className="fixed inset-0 z-[2800] bg-black/60 flex items-end" onClick={() => setSelected(null)} data-testid="listing-detail-modal">
          <div className="w-full bg-white rounded-t-3xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {selected.image ? (
              <div className="relative w-full h-56 bg-gray-100">
                <img src={selected.image} alt={selected.title} className="w-full h-full object-cover" />
                <button onClick={() => setSelected(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center" data-testid="listing-detail-close">✕</button>
                {selected.seller_verified && (
                  <span className="absolute top-3 left-3 inline-flex items-center gap-0.5 bg-emerald-600 text-white text-[11px] font-bold px-2 py-1 rounded-full shadow">
                    <CheckCircle size={13} weight="fill" /> Vendeur vérifié
                  </span>
                )}
              </div>
            ) : (
              <div className="flex justify-end p-3"><button onClick={() => setSelected(null)} data-testid="listing-detail-close" className="text-gray-400">✕</button></div>
            )}
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-extrabold text-gray-900">{selected.title}</h2>
                <p className="text-xl font-extrabold text-blue-600 whitespace-nowrap">{money(selected.price)}{selected.listing_type === 'rent' && selected.rent_period === 'day' ? <span className="text-xs font-semibold text-gray-400"> /jour</span> : null}</p>
              </div>
              <span className={`inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded ${selected.listing_type === 'rent' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{rentLabel(selected)}</span>

              {selected.kind === 'vehicle' && selected.vehicle && (
                <div className="grid grid-cols-3 gap-2 mt-3" data-testid="vehicle-specs">
                  {selected.vehicle.year && <div className="bg-gray-50 rounded-lg p-2 text-center"><Calendar size={15} className="mx-auto text-gray-400" /><p className="text-[11px] font-semibold text-gray-700 mt-0.5">{selected.vehicle.year}</p></div>}
                  {selected.vehicle.mileage && <div className="bg-gray-50 rounded-lg p-2 text-center"><Gauge size={15} className="mx-auto text-gray-400" /><p className="text-[11px] font-semibold text-gray-700 mt-0.5">{selected.vehicle.mileage} km</p></div>}
                  {selected.vehicle.fuel && <div className="bg-gray-50 rounded-lg p-2 text-center"><GasPump size={15} className="mx-auto text-gray-400" /><p className="text-[11px] font-semibold text-gray-700 mt-0.5">{selected.vehicle.fuel}</p></div>}
                </div>
              )}

              {selected.purchasable && (
                <button onClick={() => setBuying(selected)} className="w-full flex items-center justify-center gap-2 bg-[#FF5000] text-white rounded-xl py-3.5 font-bold text-sm mt-4" data-testid="buy-now-btn">
                  🛒 Acheter · {money(selected.price)}
                </button>
              )}
              {selected.location && <p className="text-sm text-gray-500 mt-2">📍 {selected.location}</p>}
              {selected.seller_name && <p className="text-sm text-gray-600 mt-1">Vendeur : <span className="font-semibold">{selected.seller_name}</span></p>}
              {selected.description && <p className="text-sm text-gray-700 mt-3 whitespace-pre-line">{selected.description}</p>}

              <div className="grid grid-cols-2 gap-3 mt-5">
                <button onClick={() => startChat(selected)} className="flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl py-3 font-bold text-sm" data-testid="contact-message-btn">
                  <ChatCircleText size={18} weight="fill" /> Message
                </button>
                {selected.seller_phone ? (
                  <a href={`tel:${selected.seller_phone}`} className="flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-xl py-3 font-bold text-sm" data-testid="contact-call-btn">
                    <Phone size={18} weight="fill" /> Appeler
                  </a>
                ) : (
                  <span className="flex items-center justify-center text-xs text-gray-400">Téléphone indisponible</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {buying && (
        <BuyModal listing={buying} onClose={() => setBuying(null)} onPaid={() => { setBuying(null); setSelected(null); navigate('/marketplace/orders'); }} />
      )}
    </div>
  );
};

export default MarketplacePage;
