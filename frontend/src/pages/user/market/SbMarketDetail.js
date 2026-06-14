/**
 * SbMarketDetail — page détail d'annonce UNIFIÉE du hub SB Market.
 * Gère les deux verticales : marketplace (mp) et immobilier (re), avec
 * messagerie acheteur↔vendeur intégrée (MarketChatPanel) — l'utilisateur
 * reste dans le hub au lieu de rebondir vers les anciennes pages.
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChevronLeft, MapPin, Phone, MessageCircle, Sparkles, Eye,
  BedDouble, Bath, Ruler, Car, Fuel, Calendar, Gauge, Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { marketplaceAPI, realEstateAPI } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { FavoriteButton } from '../../../components/FavoriteButton';
import MarketChatPanel from './MarketChatPanel';

const FONT = "font-['Manrope']";
const fmtPrice = (p) => `${Number(p || 0).toLocaleString('fr-FR')} €`;
const rentSuffix = (period) => (period === 'day' ? '/jour' : period === 'week' ? '/sem.' : period === 'month' ? '/mois' : '');

// Normalise une annonce (mp ou re) vers une forme commune.
const normalize = (source, d) => {
  const images = d.images && d.images.length ? d.images : (d.image ? [d.image] : (d.thumbnail ? [d.thumbnail] : []));
  if (source === 're') {
    return {
      id: d.id, source, itemType: 'realestate', favType: 'property',
      title: d.title, price: d.price, listing_type: d.listing_type, rent_period: d.rent_period,
      location: d.address || d.city, description: d.description, is_featured: d.is_featured,
      images, views: d.views || 0, user_id: d.user_id,
      sellerName: d.owner_name || 'Propriétaire', sellerPhone: d.owner_phone,
      specs: [
        d.bedrooms != null && { Icon: BedDouble, label: `${d.bedrooms} ch.` },
        d.bathrooms != null && { Icon: Bath, label: `${d.bathrooms} sdb` },
        d.area_sqm != null && { Icon: Ruler, label: `${d.area_sqm} m²` },
      ].filter(Boolean),
      amenities: d.amenities || [],
      typeBadge: d.listing_type === 'rent' ? 'À louer' : 'À vendre',
      editRoute: `/real-estate/edit/${d.id}`,
    };
  }
  const v = d.vehicle || {};
  return {
    id: d.id, source, itemType: 'marketplace', favType: 'marketplace',
    title: d.title, price: d.price, listing_type: d.listing_type, rent_period: d.rent_period,
    location: d.location, description: d.description, is_featured: d.is_featured,
    images, views: d.views || 0, user_id: d.user_id,
    sellerName: d.seller_name || 'Vendeur', sellerPhone: d.seller_phone,
    purchasable: d.purchasable,
    specs: d.kind === 'vehicle' ? [
      v.brand && { Icon: Car, label: [v.brand, v.model].filter(Boolean).join(' ') },
      v.year && { Icon: Calendar, label: `${v.year}` },
      v.mileage && { Icon: Gauge, label: `${Number(v.mileage).toLocaleString('fr-FR')} km` },
      v.fuel && { Icon: Fuel, label: v.fuel },
    ].filter(Boolean) : [],
    amenities: [],
    typeBadge: d.listing_type === 'rent' ? 'À louer' : (d.kind === 'vehicle' ? 'À vendre' : 'À vendre'),
    editRoute: d.kind === 'vehicle' ? `/marketplace/sell-vehicle` : '/ma-galerie',
  };
};

const SbMarketDetail = () => {
  const { source, id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const fetcher = source === 're' ? realEstateAPI.get(id) : marketplaceAPI.getListing(id);
    fetcher
      .then((r) => { if (alive) setItem(normalize(source, r.data)); })
      .catch(() => { if (alive) toast.error('Annonce introuvable'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [source, id]);

  if (loading) {
    return <div className={`min-h-screen bg-slate-50 max-w-md mx-auto flex items-center justify-center text-slate-400 ${FONT}`} data-testid="market-detail-loading">Chargement…</div>;
  }
  if (!item) {
    return <div className={`min-h-screen bg-slate-50 max-w-md mx-auto flex items-center justify-center text-slate-400 ${FONT}`}>Annonce introuvable.</div>;
  }

  const isOwner = user && item.user_id === user.id;
  const cover = item.images[activeImg];

  return (
    <div className={`min-h-screen bg-slate-50 max-w-md mx-auto w-full pb-28 text-slate-900 ${FONT}`} data-testid="sb-market-detail">
      {/* Galerie */}
      <div className="relative h-64 bg-slate-200">
        {cover
          ? <img src={cover} alt={item.title} className="w-full h-full object-cover" data-testid="market-detail-image" />
          : <div className="w-full h-full flex items-center justify-center text-slate-300"><Package size={56} /></div>}
        <button onClick={() => navigate(-1)} className="absolute top-3 left-3 w-9 h-9 rounded-full bg-black/45 backdrop-blur text-white flex items-center justify-center" data-testid="market-detail-back">
          <ChevronLeft size={20} />
        </button>
        <div className="absolute top-3 right-3" onClick={(e) => e.stopPropagation()}>
          <FavoriteButton itemType={item.favType} itemId={item.id} size={18} className="!w-9 !h-9" />
        </div>
        {item.is_featured && (
          <span className="absolute bottom-3 left-3 flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md bg-amber-100 text-amber-700 shadow" data-testid="market-detail-boosted">
            <Sparkles size={12} /> À la une
          </span>
        )}
        {item.images.length > 1 && (
          <div className="absolute bottom-3 right-3 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/45 text-white">{activeImg + 1}/{item.images.length}</div>
        )}
      </div>
      {item.images.length > 1 && (
        <div className="flex gap-2 px-4 py-2 overflow-x-auto hide-scrollbar bg-white">
          {item.images.map((img, i) => (
            <button key={img + i} onClick={() => setActiveImg(i)} className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${i === activeImg ? 'border-rose-500' : 'border-transparent'}`}>
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Bloc prix + titre */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">{item.typeBadge}</span>
            {item.purchasable && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">Achetable</span>}
          </div>
          <p className="text-2xl font-extrabold text-slate-900" data-testid="market-detail-price">
            {fmtPrice(item.price)}
            {item.listing_type === 'rent' && <span className="text-sm font-medium text-slate-400"> {rentSuffix(item.rent_period)}</span>}
          </p>
          <h1 className="text-lg font-bold text-slate-900 mt-1" data-testid="market-detail-title">{item.title}</h1>
          {item.location && <p className="text-sm text-slate-500 flex items-center gap-1 mt-1"><MapPin size={15} /> {item.location}</p>}
          {item.specs.length > 0 && (
            <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-slate-100">
              {item.specs.map((s, i) => (
                <span key={i} className="flex items-center gap-1.5 text-sm text-slate-700 font-medium"><s.Icon size={17} className="text-slate-400" /> {s.label}</span>
              ))}
            </div>
          )}
        </div>

        {/* Description */}
        {item.description && (
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase mb-2">Description</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.description}</p>
          </div>
        )}

        {/* Équipements (immobilier) */}
        {item.amenities.length > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase mb-2">Équipements</p>
            <div className="flex flex-wrap gap-2">
              {item.amenities.map((a) => <span key={a} className="text-xs font-medium bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">{a}</span>)}
            </div>
          </div>
        )}

        {/* Vendeur */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-rose-50 flex items-center justify-center font-bold text-rose-500">{(item.sellerName || 'V')[0].toUpperCase()}</div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 text-sm truncate">{item.sellerName}</p>
            <p className="text-xs text-slate-500 flex items-center gap-1"><Eye size={12} /> {item.views} vues</p>
          </div>
        </div>
      </div>

      {/* Barre d'action sticky */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-100 p-3 flex gap-3 z-20">
        {isOwner ? (
          <button onClick={() => navigate(item.editRoute)} data-testid="market-detail-edit-owner" className="flex-1 flex items-center justify-center gap-2 bg-slate-900 text-white py-3 rounded-2xl font-bold">
            Gérer mon annonce
          </button>
        ) : (
          <>
            {item.sellerPhone && (
              <a href={`tel:${item.sellerPhone}`} data-testid="market-detail-call" className="w-14 flex items-center justify-center bg-slate-100 text-slate-800 py-3 rounded-2xl">
                <Phone size={20} />
              </a>
            )}
            <button onClick={() => setChatOpen(true)} data-testid="market-detail-contact" className="flex-1 flex items-center justify-center gap-2 bg-rose-500 text-white py-3 rounded-2xl font-bold active:scale-[0.99] transition-transform">
              <MessageCircle size={18} /> Contacter le vendeur
            </button>
          </>
        )}
      </div>

      <MarketChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        listingId={item.id}
        itemType={item.itemType}
        listing={{ title: item.title, image: cover }}
      />
    </div>
  );
};

export default SbMarketDetail;
