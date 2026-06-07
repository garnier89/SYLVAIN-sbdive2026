import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, ForkKnife, Storefront, FirstAid, Flower,
  PencilLine, Wine, Drop, Buildings, HardHat, Package
} from '@phosphor-icons/react';
import { configAPI } from '../../services/api';

// Static visual identity per delivery vertical (key matches backend store_categories).
// Admin controls active/name/age; this map only supplies the icon + colors.
const VISUALS = {
  food: { icon: ForkKnife, bg: 'bg-orange-50', iconColor: 'text-orange-500' },
  grocery: { icon: Storefront, bg: 'bg-purple-50', iconColor: 'text-purple-500' },
  medicine: { icon: FirstAid, bg: 'bg-red-50', iconColor: 'text-red-500' },
  flowers: { icon: Flower, bg: 'bg-green-50', iconColor: 'text-green-500' },
  stationery: { icon: PencilLine, bg: 'bg-cyan-50', iconColor: 'text-cyan-500' },
  wine: { icon: Wine, bg: 'bg-amber-50', iconColor: 'text-amber-700' },
  water: { icon: Drop, bg: 'bg-pink-50', iconColor: 'text-pink-600' },
  supermarket: { icon: Buildings, bg: 'bg-rose-50', iconColor: 'text-rose-600' },
  construction: { icon: HardHat, bg: 'bg-teal-50', iconColor: 'text-teal-600' },
};

const AllDeliveryPage = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    configAPI.getStoreCategories()
      .then((r) => setCategories((r.data || []).filter((c) => c.active)))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
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
                    <span className="absolute -top-1 right-1 z-10 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500 text-white" data-testid={`delivery-age-${cat.key}`}>
                      {cat.age_restriction}+
                    </span>
                  )}
                  <div className={`w-20 h-20 rounded-2xl ${visual.bg} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                    <Icon size={36} weight="duotone" className={visual.iconColor} />
                  </div>
                  <span className="text-xs font-medium text-gray-700 text-center leading-tight">{cat.name}</span>
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
