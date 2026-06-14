import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin, Path, Car, NavigationArrow, Clock } from '@phosphor-icons/react';
import { itinerariesAPI } from '../services/api';
import NearbyPlacesMap from './user/NearbyPlacesMap';

const fmtDur = (min) => {
  if (min == null) return null;
  const h = Math.floor(min / 60); const m = Math.round(min % 60);
  return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}` : `${m} min`;
};

const SharedItineraryPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(undefined); // undefined=loading, null=error

  useEffect(() => {
    itinerariesAPI.public(token)
      .then((r) => setData(r.data))
      .catch(() => setData(null));
  }, [token]);

  if (data === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" data-testid="shared-circuit-loading">
        <div className="w-9 h-9 border-[3px] border-gray-200 border-t-[#FF5000] rounded-full animate-spin" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-8 text-center" data-testid="shared-circuit-error">
        <Path size={40} className="text-gray-300 mb-3" weight="duotone" />
        <p className="text-gray-600 font-semibold">Circuit introuvable</p>
        <p className="text-sm text-gray-400 mt-1">Ce lien de partage est invalide ou a expiré.</p>
      </div>
    );
  }

  const places = data.places || [];
  const geoPlaces = places.filter((p) => p.lat != null && p.lng != null);
  const center = geoPlaces.length ? { lat: geoPlaces[0].lat, lng: geoPlaces[0].lng } : null;
  const mapItems = geoPlaces.map((p, i) => ({ id: `s${i}`, name: `${i + 1}. ${p.name}`, lat: p.lat, lng: p.lng, category: p.category }));

  const reserve = () => {
    if (!geoPlaces.length) return;
    try {
      sessionStorage.setItem('sb_taxi_itinerary', JSON.stringify(
        geoPlaces.map((p) => ({ address: p.address || p.name, lat: p.lat, lng: p.lng })),
      ));
    } catch { /* ignore */ }
    navigate('/taxi');
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-28" data-testid="shared-circuit-page">
      <div className="bg-gradient-to-br from-[#FF5000] to-orange-600 px-5 pt-7 pb-6 text-white">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/80 flex items-center gap-1.5"><Path size={14} weight="fill" /> Circuit partagé · SB Travel</p>
        <h1 className="text-2xl font-black mt-1" data-testid="shared-circuit-title">{data.title}</h1>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-white/90">
          {data.city && <span className="flex items-center gap-1"><MapPin size={14} weight="fill" /> {data.city}</span>}
          <span>{places.length} étape{places.length > 1 ? 's' : ''}</span>
          {data.route_info?.total_day_min != null && <span className="flex items-center gap-1"><Clock size={14} weight="fill" /> ~{fmtDur(data.route_info.total_day_min)}</span>}
        </div>
        {data.owner_name && <p className="text-[12px] text-white/70 mt-2">Proposé par {data.owner_name}</p>}
      </div>

      {center && (
        <div className="px-4 mt-4" data-testid="shared-circuit-map">
          <NearbyPlacesMap center={center} items={mapItems} selectedId={null} onSelect={() => {}} />
        </div>
      )}

      <div className="px-4 mt-4 space-y-2.5">
        {places.map((p, i) => {
          const dir = (p.lat != null && p.lng != null)
            ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}`;
          return (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5 flex items-center gap-3" data-testid={`shared-step-${i}`}>
              <span className="w-8 h-8 rounded-full bg-[#FF4500] text-white text-sm font-extrabold flex items-center justify-center shrink-0">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900 truncate">{p.name}</p>
                {(p.category || p.address) && <p className="text-[12px] text-gray-500 truncate">{[p.category, p.address].filter(Boolean).join(' · ')}</p>}
              </div>
              <a href={dir} target="_blank" rel="noreferrer" className="w-9 h-9 rounded-full bg-sky-50 flex items-center justify-center shrink-0" data-testid={`shared-step-dir-${i}`}>
                <NavigationArrow size={16} weight="fill" className="text-sky-600" />
              </a>
            </div>
          );
        })}
      </div>

      {geoPlaces.length > 0 && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-40 px-4 pb-4 pt-2 bg-gradient-to-t from-white via-white to-transparent">
          <button onClick={reserve} className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#FF4500] text-white font-extrabold shadow-lg shadow-orange-500/30" data-testid="shared-circuit-reserve">
            <Car size={20} weight="fill" /> Réserver un chauffeur SB Drive
          </button>
        </div>
      )}
    </div>
  );
};

export default SharedItineraryPage;
