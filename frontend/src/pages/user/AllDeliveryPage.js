import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, ForkKnife, Storefront, FirstAid, Flower,
  PencilLine, Wine, Drop, Buildings, Hammer, Package, ShoppingBag, Lightning,
} from '@phosphor-icons/react';
import { getBrowserLocationLabel } from '../../lib/browserZone';
import { isImgIcon, resolveImageUrl } from '../../components/DynamicIcon';
import { cachedStoreCategories, loadStoreCategories } from '../../lib/serviceCategoriesCache';

// Static visual identity per delivery vertical (key matches backend store_categories).
// Drives a consistent line-icon look; a custom uploaded image (icon=url) overrides it.
const VISUALS = {
  food: { icon: ForkKnife, bg: 'bg-orange-50', iconColor: 'text-orange-500' },
  grocery: { icon: Storefront, bg: 'bg-emerald-50', iconColor: 'text-emerald-500' },
  medicine: { icon: FirstAid, bg: 'bg-red-50', iconColor: 'text-red-500' },
  flowers: { icon: Flower, bg: 'bg-pink-50', iconColor: 'text-pink-500' },
  stationery: { icon: PencilLine, bg: 'bg-cyan-50', iconColor: 'text-cyan-500' },
  wine: { icon: Wine, bg: 'bg-amber-50', iconColor: 'text-amber-600' },
  water: { icon: Drop, bg: 'bg-sky-50', iconColor: 'text-sky-500' },
  supermarket: { icon: Buildings, bg: 'bg-rose-50', iconColor: 'text-rose-500' },
  construction: { icon: Hammer, bg: 'bg-yellow-50', iconColor: 'text-yellow-600' },
  parcel: { icon: Package, bg: 'bg-purple-50', iconColor: 'text-purple-500' },
  genie: { icon: ShoppingBag, bg: 'bg-indigo-50', iconColor: 'text-indigo-500' },
  runner: { icon: Lightning, bg: 'bg-rose-50', iconColor: 'text-rose-500' },
};

const AllDeliveryPage = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState(cachedStoreCategories());
  const [loading, setLoading] = useState(cachedStoreCategories().length === 0);

  useEffect(() => {
    let alive = true;
    const load = (location) => {
      loadStoreCategories(location)
        .then((cats) => { if (alive) setCategories(cats); })
        .catch(() => { if (alive) setCategories((prev) => prev); })
        .finally(() => { if (alive) setLoading(false); });
    };
    load();
    // Zone-aware refresh: hide verticals restricted to other regions (e.g. Wine = metro only)
    getBrowserLocationLabel().then((label) => { if (label && alive) load(label); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="mobile-container min-h-screen bg-white">
      {/* Header */}
      <div className="bg-[#FF4500] px-4 py-3 flex items-center justify-between">
        <h1 className="text-white font-bold text-lg">Tous les Services de Livraison</h1>
        <button onClick={() => navigate(-1)} data-testid="all-delivery-close-btn">
          <X size={24} className="text-white" />
        </button>
      </div>

      {/* Grid */}
      <div className="p-4">
        {loading ? (
          <p className="text-gray-400 text-center py-10" data-testid="all-delivery-loading">Chargement…</p>
        ) : categories.length === 0 ? (
          <p className="text-gray-400 text-center py-10" data-testid="all-delivery-empty">Aucun service de livraison disponible</p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {categories.map((cat) => {
              const visual = VISUALS[cat.key] || { icon: Package, bg: 'bg-gray-50', iconColor: 'text-gray-500' };
              const Icon = visual.icon;
              return (
                <button
                  key={cat.key}
                  onClick={() => navigate(cat.path || '/food')}
                  className="flex flex-col items-center gap-2 group relative"
                  data-testid={`delivery-${cat.key}`}
                >
                  {cat.age_restriction > 0 && (
                    <span className="absolute -top-1.5 -right-0.5 z-10 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-rose-500 text-white ring-2 ring-white shadow-sm" data-testid={`delivery-age-${cat.key}`}>
                      {cat.age_restriction}+
                    </span>
                  )}
                  <div className={`w-20 h-20 rounded-3xl ${visual.bg} flex items-center justify-center shadow-sm group-hover:scale-105 group-active:scale-95 transition-transform`}>
                    {isImgIcon(cat.icon)
                      ? <img src={resolveImageUrl(cat.icon)} alt="" className="w-10 h-10 object-contain" />
                      : <Icon size={34} weight="duotone" className={visual.iconColor} />}
                  </div>
                  <span className="text-xs font-semibold text-gray-700 text-center leading-tight">{cat.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AllDeliveryPage;
