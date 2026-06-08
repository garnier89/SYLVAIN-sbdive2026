import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MagnifyingGlass, Buildings, Car, ShoppingBag, CheckCircle, WhatsappLogo, Phone } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const CATEGORIES = {
  'real-estate': { label: 'Immobilier', icon: Buildings, color: 'orange' },
  cars: { label: 'Véhicules', icon: Car, color: 'blue' },
  items: { label: 'Articles', icon: ShoppingBag, color: 'gray' },
};

const MarketplacePage = () => {
  const navigate = useNavigate();
  const params = useParams();
  const activeCat = params.category || null;
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/phase2/catalogs/marketplace_listings`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(d => setListings(Array.isArray(d) ? d : []))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = listings.filter(l => {
    const matchCat = !activeCat || l.category === activeCat;
    const matchText = !search.trim() ||
      (l.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.location || '').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchText;
  });

  const cat = activeCat ? CATEGORIES[activeCat] : null;
  const title = cat ? cat.label : 'Acheter, Vendre & Louer';

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-8" data-testid="marketplace-page">
      <div className="bg-white px-4 py-3 flex items-center gap-3 border-b border-gray-100 sticky top-0 z-20">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">{title}</h1>
        <span className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-blue-50 text-blue-700">{filtered.length}</span>
      </div>

      <div className="px-4 pt-3">
        <div className="relative">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Titre, ville..." className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-blue-400" data-testid="search-input" />
        </div>
      </div>

      <div className="px-4 pt-3 flex gap-2 overflow-x-auto scrollbar-hide">
        {Object.entries(CATEGORIES).map(([key, c]) => (
          <button
            key={key}
            onClick={() => navigate(`/marketplace/${key}`)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${activeCat === key ? 'bg-orange-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
            data-testid={`cat-${key}`}
          >
            <c.icon size={14} weight="duotone" />{c.label}
          </button>
        ))}
        {activeCat && (
          <button onClick={() => navigate('/marketplace')} className="px-3 py-1.5 rounded-full text-xs font-semibold text-gray-500 underline" data-testid="cat-clear">Tout voir</button>
        )}
      </div>

      <div className="px-4 mt-4">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-12">Aucune annonce</p>
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
                  <p className="text-base font-extrabold text-blue-600 mt-1">{l.price?.toLocaleString('fr-FR')} {l.currency}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 truncate">{l.location}</p>
                  <span className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${l.type === 'Vente' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>{l.type}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

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
                <p className="text-xl font-extrabold text-blue-600 whitespace-nowrap">{selected.price?.toLocaleString('fr-FR')} {selected.currency}</p>
              </div>
              {!selected.image && selected.seller_verified && (
                <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full mt-2">
                  <CheckCircle size={13} weight="fill" /> Vendeur vérifié
                </span>
              )}
              {selected.location && <p className="text-sm text-gray-500 mt-2">📍 {selected.location}</p>}
              {selected.seller_name && <p className="text-sm text-gray-600 mt-1">Vendeur : <span className="font-semibold">{selected.seller_name}</span></p>}
              {selected.description && <p className="text-sm text-gray-700 mt-3 whitespace-pre-line">{selected.description}</p>}

              <div className="grid grid-cols-2 gap-3 mt-5">
                {selected.seller_phone ? (
                  <>
                    <a href={`https://wa.me/${(selected.seller_phone || '').replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-xl py-3 font-bold text-sm" data-testid="contact-whatsapp-btn">
                      <WhatsappLogo size={18} weight="fill" /> WhatsApp
                    </a>
                    <a href={`tel:${selected.seller_phone}`} className="flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl py-3 font-bold text-sm" data-testid="contact-call-btn">
                      <Phone size={18} weight="fill" /> Appeler
                    </a>
                  </>
                ) : (
                  <p className="col-span-2 text-center text-sm text-gray-400">Contact du vendeur indisponible.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketplacePage;
