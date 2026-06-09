import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Star, MapPin, User } from '@phosphor-icons/react';
import { servicesAPI } from '../../services/api';
import { useLocale } from '../../contexts/LocaleContext';

// « Fournisseur de services » — providers for a given on-demand category.
const ServiceProvidersPage = () => {
  const navigate = useNavigate();
  const { money } = useLocale();
  const { slug } = useParams();
  const [providers, setProviders] = useState([]);
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchProviders = (lat, lng) => {
      servicesAPI.getProviders({ category: slug, lat, lng })
        .then((r) => { if (active) setProviders(r.data || []); })
        .catch(() => {})
        .finally(() => { if (active) setLoading(false); });
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchProviders(pos.coords.latitude, pos.coords.longitude),
        () => fetchProviders(48.8566, 2.3522),
        { timeout: 4000 },
      );
    } else {
      fetchProviders(48.8566, 2.3522);
    }
    servicesAPI.getOnDemandCategories()
      .then((r) => { if (active) setCategory((r.data || []).find((c) => c.slug === slug)); })
      .catch(() => {});
    return () => { active = false; };
  }, [slug]);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="service-providers-page">
      <div className="sticky top-0 z-40 bg-[#FF4500] px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white leading-tight">Fournisseur de services</h1>
            {category && <p className="text-white/85 text-xs">{category.name}</p>}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-3 flex gap-3 animate-pulse">
              <div className="w-20 h-20 rounded-xl bg-gray-100" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 bg-gray-100 rounded w-1/2" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            </div>
          ))
        ) : providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="providers-empty">
            <User size={48} className="text-gray-300 mb-3" />
            <p className="text-gray-500">Aucun prestataire disponible</p>
            <p className="text-sm text-gray-400">dans cette catégorie pour le moment</p>
          </div>
        ) : (
          providers.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/service-provider/${p.id}`)}
              className="w-full text-left bg-white rounded-2xl p-3 flex gap-3 border border-gray-100 shadow-sm active:scale-[0.99] transition-transform"
              data-testid={`provider-${p.id}`}
            >
              <div className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                {p.photo
                  ? <img src={p.photo} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center"><User size={28} className="text-gray-300" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-gray-900 truncate">{p.name}</h3>
                  <span className="flex items-center gap-0.5 flex-shrink-0 bg-amber-50 rounded-full px-2 py-0.5">
                    <Star size={13} weight="fill" className="text-amber-500" />
                    <span className="text-xs font-bold text-gray-800">{(p.rating || 5).toFixed(1)}</span>
                  </span>
                </div>
                {p.bio && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.bio}</p>}
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                  {p.distance_km != null && (
                    <span className="flex items-center gap-1"><MapPin size={13} weight="fill" className="text-[#FF4500]" />{p.distance_km} km</span>
                  )}
                  {p.price_from != null && (
                    <span className="font-semibold text-emerald-600">dès {money(p.price_from)}</span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default ServiceProvidersPage;
