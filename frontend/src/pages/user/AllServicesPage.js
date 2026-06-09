import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MagnifyingGlass } from '@phosphor-icons/react';
import { servicesAPI } from '../../services/api';
import { resolveIcon } from '../../lib/phosphorIcon';

// « Tous les autres services » — full grid of on-demand service categories.
const AllServicesPage = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    servicesAPI.getOnDemandCategories()
      .then((r) => { if (active) setCategories(r.data || []); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="mobile-container min-h-screen bg-white pb-10" data-testid="all-services-page">
      <div className="sticky top-0 z-40 bg-[#FF4500] px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <h1 className="text-lg font-bold text-white flex-1">Tous les autres services</h1>
        </div>
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un service…"
            className="w-full bg-white border-0 rounded-full pl-10 pr-3 h-11 text-sm outline-none"
            data-testid="search-input"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 gap-3 p-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 animate-pulse" />
              <div className="h-2.5 w-12 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-y-5 gap-x-2 p-4">
          {filtered.map((cat) => {
            const Icon = resolveIcon(cat.icon);
            return (
              <button
                key={cat.slug}
                onClick={() => navigate(`/service-providers/${cat.slug}`)}
                className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
                data-testid={`category-${cat.slug}`}
              >
                <span className={`w-16 h-16 rounded-2xl flex items-center justify-center ${cat.color || 'bg-gray-50'}`}>
                  <Icon size={28} weight="duotone" className="text-gray-700" />
                </span>
                <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">{cat.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AllServicesPage;
