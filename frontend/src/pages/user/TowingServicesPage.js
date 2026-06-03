import React from 'react';
import { useNavigate } from 'react-router-dom';
import ServiceListLayout, { ServiceCard } from '../../components/ServiceListLayout';
import { Phone, Clock, Lightning } from '@phosphor-icons/react';

const TowingServicesPage = () => {
  const navigate = useNavigate();
  const call = (e, item) => {
    e.stopPropagation();
    if (item.phone) window.location.href = `tel:${item.phone}`;
  };
  return (
    <ServiceListLayout
      title="Dépannage & Remorquage"
      collection="towing_partners"
      colorClass="bg-orange-50 text-orange-700"
      searchPlaceholder="Dépanneur, zone..."
      emptyHint="Aucun dépanneur disponible"
      testId="towing-page"
      renderCard={({ item }) => (
        <div onClick={() => navigate(`/service/towing?provider=${item.id}`)} className={`w-full bg-white rounded-2xl border p-4 text-left hover:shadow-md transition-shadow relative cursor-pointer ${item.is_featured ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-100'}`} data-testid={`towing-card-${item.id}`}>
          {item.is_featured && (
            <span className="absolute top-2 right-2 inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shadow-sm" data-testid={`sponsored-${item.id}`}>
              ★ Sponsorisé
            </span>
          )}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-gray-900 text-base pr-20">{item.name}</h3>
            {item.available_24h && !item.is_featured && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">24/7</span>
            )}
          </div>
          {item.available_24h && item.is_featured && (
            <div className="mt-1"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">24/7</span></div>
          )}
          <p className="text-xs text-gray-500 mt-1">{item.address}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
            <span className="flex items-center gap-1"><Clock size={12} />~{item.response_time_mins} min</span>
            <span className="font-semibold text-emerald-600">dès {item.price_from}€</span>
            <span className="text-amber-500">★ {item.rating?.toFixed(1)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(item.services || []).map((s) => (
              <span key={s} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700">{s}</span>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <div className="flex-1 inline-flex items-center justify-center gap-1.5 bg-orange-500 text-white px-3 py-2 rounded-lg text-sm font-bold">
              <Lightning size={14} weight="fill" />Réserver
            </div>
            <button onClick={(e) => call(e, item)} className="inline-flex items-center justify-center gap-1.5 border border-orange-300 text-orange-600 px-3 py-2 rounded-lg text-sm font-bold" data-testid={`call-${item.id}`}>
              <Phone size={14} weight="fill" />Appeler
            </button>
          </div>
        </div>
      )}
    />
  );
};

export default TowingServicesPage;
