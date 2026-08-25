import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CaretRight, GridFour } from '@phosphor-icons/react';
import DynamicIcon, { resolveImageUrl } from '../../components/DynamicIcon';
import { homeCategoriesAPI } from '../../services/api';

const ServiceCategoriesPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    homeCategoriesAPI.public('all_categories')
      .then((r) => { if (alive) setItems(r.data?.items || []); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="service-categories-page">
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0" data-testid="back-btn">
            <ArrowLeft size={18} className="text-[#1F2430]" />
          </button>
          <h1 className="text-lg font-extrabold text-[#1F2430]">Catégories de services</h1>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 mt-10 text-center text-gray-500" data-testid="service-categories-empty">
          <GridFour size={40} className="mx-auto mb-3 text-gray-300" weight="duotone" />
          <p className="text-sm">Aucune catégorie disponible pour le moment</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4">
          {items.map((cat) => (
            <button
              key={cat.id}
              onClick={() => navigate(cat.target_route || '/')}
              className="bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 flex flex-col items-start text-left active:scale-[0.98] transition-transform"
              data-testid={`category-${cat.key}`}
            >
              <div className="w-full flex items-start justify-between">
                <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${cat.bg_class || 'bg-gray-50'}`}>
                  {cat.image_url ? (
                    <img src={resolveImageUrl(cat.image_url)} alt="" className="w-6 h-6 object-contain" />
                  ) : (
                    <DynamicIcon name={cat.icon_name} size={22} weight="duotone" className={cat.icon_color_class || 'text-gray-600'} />
                  )}
                </span>
                <CaretRight size={16} className="text-gray-300 mt-2" />
              </div>
              <p className="text-sm font-bold text-gray-900 mt-2.5 leading-tight">{cat.label_fr}</p>
              {cat.subtitle_fr && <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{cat.subtitle_fr}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ServiceCategoriesPage;
