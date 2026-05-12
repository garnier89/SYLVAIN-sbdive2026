import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MagnifyingGlass, Star, MapPin } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * ServiceListLayout — generic mobile-first service listing screen.
 * Reads any /api/phase2/catalogs/{collection} public resource and renders a card grid.
 *
 * Props:
 *  - title: page header
 *  - collection: e.g. "beauty_salons"
 *  - colorClass: tailwind bg+text accent classes (used on header chip)
 *  - categories?: optional filter chips (label list)
 *  - categoryField?: doc field used to match category filter (default "category")
 *  - renderCard: ({item}) => JSX for the card body
 *  - emptyHint?: text under empty state
 */
const ServiceListLayout = ({
  title, collection, colorClass = 'bg-blue-50 text-blue-700',
  categories = null, categoryField = 'category',
  renderCard, emptyHint = "Aucun résultat",
  searchPlaceholder = "Rechercher...",
  testId,
}) => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/phase2/catalogs/${collection}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(d => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [collection]);

  const filtered = items.filter(it => {
    const matchText = !search.trim() ||
      (it.name || it.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (it.address || it.location || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !activeCat || (it[categoryField] === activeCat);
    return matchText && matchCat;
  });

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-8" data-testid={testId || `${collection}-page`}>
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-3 border-b border-gray-100 sticky top-0 z-20">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">{title}</h1>
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded ${colorClass}`}>{filtered.length}</span>
      </div>

      {/* Search */}
      <div className="px-4 pt-3">
        <div className="relative">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-blue-400"
            data-testid="search-input"
          />
        </div>
      </div>

      {/* Category chips */}
      {categories && categories.length > 0 && (
        <div className="px-4 pt-3 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          <button
            onClick={() => setActiveCat(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${!activeCat ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
            data-testid="cat-all"
          >
            Tout
          </button>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setActiveCat(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${activeCat === c ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
              data-testid={`cat-${c.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      <div className="px-4 mt-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center" data-testid="empty-state">
            <MapPin size={36} className="mx-auto mb-3 text-gray-300" weight="duotone" />
            <p className="text-sm text-gray-500">{emptyHint}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(item => (
              <div key={item.id} data-testid={`item-${item.id}`}>
                {renderCard({ item })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/** Re-usable card UI used by most pages. */
export const ServiceCard = ({ item, badges = [], onClick }) => (
  <button onClick={onClick} className={`w-full bg-white rounded-2xl overflow-hidden border hover:shadow-md transition-shadow text-left flex relative ${item.is_featured ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-100'}`}>
    {item.is_featured && (
      <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shadow-sm" data-testid={`sponsored-${item.id}`}>
        <Star size={9} weight="fill" />Sponsorisé
      </span>
    )}
    {(item.image) && (
      <div className="w-28 h-28 flex-shrink-0 bg-gray-100">
        <img src={item.image} alt={item.name || item.title} className="w-full h-full object-cover" loading="lazy" />
      </div>
    )}
    <div className="flex-1 min-w-0 p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold text-gray-900 text-sm leading-tight truncate pr-16">{item.name || item.title}</h3>
        {item.rating != null && !item.is_featured && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <Star size={12} weight="fill" className="text-amber-400" />
            <span className="text-xs font-semibold text-gray-700">{item.rating.toFixed(1)}</span>
          </div>
        )}
      </div>
      {item.is_featured && item.rating != null && (
        <div className="flex items-center gap-0.5 mt-0.5">
          <Star size={12} weight="fill" className="text-amber-400" />
          <span className="text-xs font-semibold text-gray-700">{item.rating.toFixed(1)}</span>
        </div>
      )}
      {(item.address || item.location) && (
        <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2 leading-tight">
          <MapPin size={10} className="inline mr-1 text-gray-400" />{item.address || item.location}
        </p>
      )}
      {item.description && (
        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{item.description}</p>
      )}
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {badges.map((b, i) => (
          <span key={i} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${b.colorClass || 'bg-gray-100 text-gray-700'}`}>{b.label}</span>
        ))}
      </div>
    </div>
  </button>
);

export default ServiceListLayout;
