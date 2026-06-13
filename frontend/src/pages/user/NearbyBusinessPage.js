import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, MagnifyingGlass, Star, MapPin, X, Phone, NavigationArrow,
  Car, Clock, Storefront, Globe,
} from '@phosphor-icons/react';
import { ServiceCard } from '../../components/ServiceListLayout';

const API = process.env.REACT_APP_BACKEND_URL;
const PARIS = { lat: 48.8566, lng: 2.3522 };

// Full category set — mirrors the Home « À proximité » tiles.
const NEARBY_CATEGORIES = [
  'Café', 'Bar', 'Restaurant', 'Salon', 'Spa', 'Boulangerie', 'Pharmacie',
  'Hôpital', 'Salle de sport', 'Shopping', 'Centre commercial',
  'Hôtel', 'Musée', 'Attraction', 'Bibliothèque', 'Vie Nocturne', 'Parking', 'Garage',
];

const absImg = (url) => (typeof url === 'string' && url.startsWith('/api/') ? `${API}${url}` : url);

const NearbyBusinessPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawCat = (params.get('category') || '').trim();

  const [coords, setCoords] = useState(null);
  const [activeCat, setActiveCat] = useState(NEARBY_CATEGORIES.includes(rawCat) ? rawCat : NEARBY_CATEGORIES[0]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const chipsRef = useRef(null);

  // Resolve the user's GPS once (graceful Paris fallback).
  useEffect(() => {
    if (!('geolocation' in navigator)) { setCoords(PARIS); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setCoords(PARIS),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
    );
  }, []);

  const load = useCallback(async () => {
    if (!coords) return;
    setLoading(true);
    try {
      const url = `${API}/api/nearby/live?lat=${coords.lat}&lng=${coords.lng}&category=${encodeURIComponent(activeCat)}`;
      const r = await fetch(url, { credentials: 'include' });
      const d = r.ok ? await r.json() : { items: [] };
      setItems((d.items || []).map((i) => ({ ...i, image: absImg(i.image) })));
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [coords, activeCat]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((i) =>
    !search.trim() ||
    (i.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.address || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-8" data-testid="nearby-page">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#FF4500] px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <h1 className="text-lg font-bold text-white flex-1">Commerces Proches</h1>
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-white/20 text-white" data-testid="nearby-count">{filtered.length}</span>
        </div>
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Commerce, type..."
            className="w-full bg-white border-0 rounded-full pl-10 pr-3 h-11 text-sm outline-none"
            data-testid="search-input"
          />
        </div>
      </div>

      {/* Category chips */}
      <div ref={chipsRef} className="px-4 pt-3 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {NEARBY_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setActiveCat(c)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${activeCat === c ? 'bg-orange-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
            data-testid={`cat-${c.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="px-4 mt-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center" data-testid="empty-state">
            <MapPin size={36} className="mx-auto mb-3 text-gray-300" weight="duotone" />
            <p className="text-sm text-gray-500">Aucun commerce « {activeCat} » à proximité</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <div key={item.id} data-testid={`item-${item.id}`}>
                <ServiceCard
                  item={item}
                  onClick={() => setSelected(item)}
                  badges={[
                    { label: item.category, colorClass: 'bg-indigo-50 text-indigo-700' },
                    ...(item.distance_km != null ? [{ label: `${item.distance_km} km`, colorClass: 'bg-gray-100 text-gray-700' }] : []),
                    ...(item.open_now != null ? [{ label: item.open_now ? 'Ouvert' : 'Fermé', colorClass: item.open_now ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700' }] : []),
                  ]}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <PlaceDetailSheet
          item={selected}
          coords={coords}
          onClose={() => setSelected(null)}
          onTaxi={(it) => {
            const lat = it.lat, lng = it.lng;
            try {
              sessionStorage.setItem('sb_taxi_dest', JSON.stringify({
                address: it.address || it.name, lat, lng,
              }));
            } catch { /* ignore */ }
            navigate('/taxi');
          }}
        />
      )}
    </div>
  );
};

/** Bottom sheet with place details + Call / Directions / Taxi actions. */
const PlaceDetailSheet = ({ item, coords, onClose, onTaxi }) => {
  const [details, setDetails] = useState(null);
  const phone = details?.phone || item.phone;
  const lat = details?.lat ?? item.lat;
  const lng = details?.lng ?? item.lng;

  useEffect(() => {
    // Google places have a place_id → fetch phone + opening hours on demand.
    if (item.source === 'google' && item.place_id) {
      fetch(`${API}/api/nearby/place-details?place_id=${item.place_id}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null)).then(setDetails).catch(() => {});
    }
  }, [item]);

  const directionsUrl = (lat != null && lng != null)
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end" data-testid="place-detail-sheet">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-3xl max-h-[88vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/40 flex items-center justify-center" data-testid="sheet-close">
          <X size={18} className="text-white" />
        </button>
        {item.image ? (
          <img src={item.image} alt={item.name} className="w-full h-44 object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ) : (
          <div className="w-full h-32 bg-gradient-to-br from-orange-100 to-indigo-100 flex items-center justify-center">
            <Storefront size={48} className="text-orange-400" weight="duotone" />
          </div>
        )}

        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-extrabold text-gray-900 leading-tight">{item.name}</h2>
            {item.rating != null && (
              <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg shrink-0">
                <Star size={14} weight="fill" className="text-amber-400" />
                <span className="text-sm font-bold text-gray-800">{item.rating}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{item.category}</span>
            {item.distance_km != null && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{item.distance_km} km</span>}
            {(details?.open_now ?? item.open_now) != null && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${(details?.open_now ?? item.open_now) ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {(details?.open_now ?? item.open_now) ? 'Ouvert maintenant' : 'Fermé'}
              </span>
            )}
          </div>

          {(item.address || details?.address) && (
            <p className="flex items-start gap-2 text-sm text-gray-600 mt-3">
              <MapPin size={16} className="text-gray-400 mt-0.5 shrink-0" />{details?.address || item.address}
            </p>
          )}

          {details?.weekday_text?.length > 0 && (
            <div className="mt-3 bg-gray-50 rounded-xl p-3">
              <p className="flex items-center gap-2 text-xs font-bold text-gray-700 mb-1"><Clock size={14} /> Horaires</p>
              <div className="text-[11px] text-gray-500 leading-relaxed">
                {details.weekday_text.map((t) => <div key={t}>{t}</div>)}
              </div>
            </div>
          )}

          {details?.website && (
            <a href={details.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-indigo-600 mt-3 font-semibold" data-testid="sheet-website">
              <Globe size={16} /> Site web
            </a>
          )}

          {/* Actions */}
          <div className="grid grid-cols-3 gap-2 mt-5">
            <a
              href={phone ? `tel:${phone}` : undefined}
              className={`flex flex-col items-center gap-1 py-3 rounded-2xl border ${phone ? 'border-gray-200 text-gray-800' : 'border-gray-100 text-gray-300 pointer-events-none'}`}
              data-testid="sheet-call"
            >
              <Phone size={20} weight="fill" /><span className="text-xs font-semibold">Appeler</span>
            </a>
            <a
              href={directionsUrl} target="_blank" rel="noreferrer"
              className="flex flex-col items-center gap-1 py-3 rounded-2xl border border-gray-200 text-gray-800"
              data-testid="sheet-directions"
            >
              <NavigationArrow size={20} weight="fill" className="text-sky-600" /><span className="text-xs font-semibold">Itinéraire</span>
            </a>
            <button
              onClick={() => onTaxi(item)}
              className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-[#FF4500] text-white"
              data-testid="sheet-taxi"
            >
              <Car size={20} weight="fill" /><span className="text-xs font-semibold">Y aller</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NearbyBusinessPage;
