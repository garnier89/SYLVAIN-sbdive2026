import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MagnifyingGlass, X, ArrowLeft, Storefront, ForkKnife, Flower,
  PencilLine, Wine, HardHat, Package, SpinnerGap,
} from '@phosphor-icons/react';
import { merchantAPI } from '../services/api';

// Visual identity per delivery vertical (store_type).
const TYPE_META = {
  restaurant: { icon: ForkKnife, bg: 'bg-rose-50', color: 'text-rose-500' },
  grocery: { icon: Storefront, bg: 'bg-emerald-50', color: 'text-emerald-500' },
  florist: { icon: Flower, bg: 'bg-pink-50', color: 'text-pink-500' },
  stationery: { icon: PencilLine, bg: 'bg-cyan-50', color: 'text-cyan-600' },
  wine: { icon: Wine, bg: 'bg-purple-50', color: 'text-purple-600' },
  construction: { icon: HardHat, bg: 'bg-amber-50', color: 'text-amber-600' },
};

const SUGGESTIONS = ['Pizza', 'Courses', 'Roses', 'Vin', 'Lait', 'Pain', 'Sushi'];

const TypeIcon = ({ storeType, size = 18 }) => {
  const meta = TYPE_META[storeType] || { icon: Package, bg: 'bg-slate-100', color: 'text-slate-500' };
  const Icon = meta.icon;
  return (
    <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center flex-shrink-0`}>
      <Icon size={size} weight="duotone" className={meta.color} />
    </div>
  );
};

const euro = (n) => (typeof n === 'number' ? `${n.toFixed(2).replace('.', ',')} €` : '');

const DeliverySearchOverlay = ({ onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const runSearch = useCallback(async (term) => {
    const q = term.trim();
    if (q.length < 2) { setStores([]); setProducts([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await merchantAPI.searchDelivery(q);
      setStores(res.data.stores || []);
      setProducts(res.data.products || []);
    } catch (e) {
      console.error('Delivery search error:', e);
      setStores([]); setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce the live search (250ms).
  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const goToStore = (merchantId) => { onClose(); navigate(`/food/${merchantId}`); };

  const hasResults = stores.length > 0 || products.length > 0;
  const showEmpty = query.trim().length >= 2 && !loading && !hasResults;

  return (
    <div className="fixed inset-0 z-[9999] bg-white" data-testid="delivery-search-overlay">
      {/* Header */}
      <div className="bg-[#FF5000] px-4 pt-4 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={onClose} data-testid="delivery-search-close-btn" className="text-white">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-white font-bold text-base">Que voulez-vous vous faire livrer ?</h1>
        </div>
        <div className="relative mt-3">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Repas, courses, fleurs, vin, médicaments…"
            className="w-full h-12 rounded-2xl bg-white pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 outline-none"
            data-testid="delivery-search-input"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2" data-testid="delivery-search-clear-btn">
              <X size={18} className="text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto" style={{ height: 'calc(100vh - 130px)' }}>
        {/* Suggestions */}
        {query.trim().length < 2 && (
          <div className="p-5" data-testid="delivery-search-suggestions">
            <p className="text-sm font-semibold text-gray-500 mb-3">Idées de recherche</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setQuery(tag)}
                  className="px-4 py-2 bg-gray-100 rounded-full text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
                  data-testid={`delivery-search-tag-${tag.toLowerCase()}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12 text-gray-400" data-testid="delivery-search-loading">
            <SpinnerGap size={28} className="animate-spin" />
          </div>
        )}

        {showEmpty && (
          <div className="flex flex-col items-center justify-center py-16 px-6" data-testid="delivery-search-empty">
            <MagnifyingGlass size={44} className="text-gray-300 mb-3" />
            <p className="text-base font-semibold text-gray-500">Aucun résultat</p>
            <p className="text-sm text-gray-400 mt-1 text-center">Essayez « pizza », « courses » ou « fleurs »</p>
          </div>
        )}

        {/* Stores */}
        {stores.length > 0 && (
          <div className="px-4 pt-4" data-testid="delivery-search-stores">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2 px-1">Magasins</p>
            {stores.map((s) => (
              <button
                key={s.id}
                onClick={() => goToStore(s.id)}
                className="w-full flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 text-left hover:bg-gray-50 rounded-lg px-2 -mx-1 transition-colors"
                data-testid={`delivery-search-store-${s.id}`}
              >
                <TypeIcon storeType={s.store_type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{s.store_name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{s.store_type_label} · {s.address}</p>
                </div>
                <span className="text-[11px] text-gray-400 shrink-0">{s.eta_min} min</span>
              </button>
            ))}
          </div>
        )}

        {/* Products */}
        {products.length > 0 && (
          <div className="px-4 pt-4 pb-8" data-testid="delivery-search-products">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2 px-1">Produits</p>
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => goToStore(p.merchant_id)}
                className="w-full flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 text-left hover:bg-gray-50 rounded-lg px-2 -mx-1 transition-colors"
                data-testid={`delivery-search-product-${p.id}`}
              >
                <TypeIcon storeType={p.store_type} size={16} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{p.merchant_name} · {p.store_type_label}</p>
                </div>
                <span className="text-sm font-bold text-emerald-600 shrink-0">{euro(p.price)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliverySearchOverlay;
