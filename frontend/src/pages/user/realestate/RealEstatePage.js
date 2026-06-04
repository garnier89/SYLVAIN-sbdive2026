import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { realEstateAPI } from '../../../services/api';
import { ArrowLeft, MagnifyingGlass, Plus, Bed, Bathtub, Ruler, MapPin, Buildings, Star, ListBullets } from '@phosphor-icons/react';
import { LISTING_TYPES, CATEGORIES, fmtPrice, catLabel, rentSuffix } from './realEstateConstants';

const PropertyCard = ({ p, onClick }) => (
  <button onClick={onClick} data-testid={`property-card-${p.id}`}
    className="w-full text-left bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-md transition-shadow">
    <div className="relative h-40 bg-gray-100">
      {p.thumbnail
        ? <img src={p.thumbnail} alt={p.title} className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center text-gray-300"><Buildings size={40} weight="duotone" /></div>}
      {p.is_featured && (
        <span className="absolute top-2 left-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow">
          <Star size={11} weight="fill" /> Sponsorisé
        </span>
      )}
      <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/70 text-white">{catLabel(p.category)}</span>
    </div>
    <div className="p-3">
      <p className="text-lg font-extrabold text-[#FF5000] leading-tight">{fmtPrice(p.price)}<span className="text-xs font-medium text-gray-400">{p.listing_type === 'rent' ? ` ${rentSuffix(p.rent_period)}` : ''}</span></p>
      <p className="font-bold text-gray-900 text-sm truncate mt-0.5">{p.title}</p>
      {(p.address || p.city) && <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5"><MapPin size={12} /> {p.address || p.city}</p>}
      <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500">
        {p.bedrooms != null && <span className="flex items-center gap-1"><Bed size={13} /> {p.bedrooms}</span>}
        {p.bathrooms != null && <span className="flex items-center gap-1"><Bathtub size={13} /> {p.bathrooms}</span>}
        {p.area_sqm != null && <span className="flex items-center gap-1"><Ruler size={13} /> {p.area_sqm} m²</span>}
      </div>
    </div>
  </button>
);

const RealEstatePage = () => {
  const navigate = useNavigate();
  const [listingType, setListingType] = useState('sale');
  const [category, setCategory] = useState(null);
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    realEstateAPI.myUnreadCount?.().then((r) => setUnread(r.data?.count || 0)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { listing_type: listingType };
      if (category) params.category = category;
      if (q.trim()) params.q = q.trim();
      const r = await realEstateAPI.list(params);
      setItems(r.data || []);
    } catch { toast.error('Erreur de chargement'); } finally { setLoading(false); }
  }, [listingType, category, q]);

  useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [load, q]);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24" data-testid="real-estate-page">
      <div className="bg-[#FF5000] px-4 pt-3 pb-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/home')} className="text-white" data-testid="re-back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-white font-bold text-lg flex-1">Immobilier</h1>
          <button onClick={() => navigate('/real-estate/my')} className="text-white flex items-center gap-1 text-xs font-semibold relative" data-testid="re-my-btn">
            <ListBullets size={18} /> Mes annonces
            {unread > 0 && <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-white text-[#FF5000] text-[9px] font-bold flex items-center justify-center" data-testid="re-my-unread">{unread}</span>}
          </button>
        </div>
        {/* Buy / Rent segmented */}
        <div className="mt-3 bg-white/15 rounded-xl p-1 flex">
          {LISTING_TYPES.map((t) => (
            <button key={t.id} onClick={() => setListingType(t.id)} data-testid={`re-type-${t.id}`}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${listingType === t.id ? 'bg-white text-[#FF5000]' : 'text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {/* Search */}
        <div className="mt-3 flex items-center gap-2 bg-white rounded-xl px-3 py-2">
          <MagnifyingGlass size={18} className="text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ville, quartier, mot-clé..." data-testid="re-search-input"
            className="flex-1 text-sm outline-none bg-transparent" />
        </div>
      </div>

      {/* Category chips */}
      <div className="px-4 py-3 flex gap-2 overflow-x-auto">
        <button onClick={() => setCategory(null)} data-testid="re-cat-all"
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${!category ? 'bg-[#0B1426] text-white border-[#0B1426]' : 'bg-white text-gray-600 border-gray-200'}`}>Tous</button>
        {CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => setCategory(c.id)} data-testid={`re-cat-${c.id}`}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${category === c.id ? 'bg-[#0B1426] text-white border-[#0B1426]' : 'bg-white text-gray-600 border-gray-200'}`}>{c.emoji} {c.label}</button>
        ))}
      </div>

      <div className="px-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {loading && <p className="col-span-full text-center text-gray-400 py-10">Chargement...</p>}
        {!loading && items.length === 0 && <p className="col-span-full text-center text-gray-400 py-10" data-testid="re-empty">Aucune annonce pour ces critères.</p>}
        {!loading && items.map((p) => <PropertyCard key={p.id} p={p} onClick={() => navigate(`/real-estate/${p.id}`)} />)}
      </div>

      {/* FAB Post a listing */}
      <button onClick={() => navigate('/real-estate/post')} data-testid="re-post-fab"
        className="fixed bottom-6 right-6 z-30 bg-[#FF5000] text-white rounded-full shadow-lg flex items-center gap-2 px-5 py-3.5 font-bold text-sm active:scale-95 transition-transform"
        style={{ right: 'max(1.5rem, calc(50vw - 230px))' }}>
        <Plus size={20} weight="bold" /> Publier
      </button>
    </div>
  );
};

export default RealEstatePage;
