import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, MagnifyingGlass, Star, MapPin, X, Phone, NavigationArrow,
  Car, Clock, Storefront, Globe, Heart, List, MapTrifold, Path, BookmarkSimple, FloppyDisk,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { ServiceCard } from '../../components/ServiceListLayout';
import { favoritesAPI, itinerariesAPI } from '../../services/api';
import NearbyPlacesMap from './NearbyPlacesMap';

const API = process.env.REACT_APP_BACKEND_URL;
const PARIS = { lat: 48.8566, lng: 2.3522 };

// Full category set — commerces + tourisme & patrimoine.
const NEARBY_CATEGORIES = [
  'Café', 'Bar', 'Restaurant', 'Salon', 'Spa', 'Boulangerie', 'Pharmacie',
  'Hôpital', 'Salle de sport', 'Shopping', 'Centre commercial',
  'Hôtel', 'Musée', 'Attraction', 'Lieux touristiques', 'Monuments', 'Sites historiques',
  'Parcs & Nature', 'Plages', 'Points de vue',
  'Bibliothèque', 'Vie Nocturne', 'Parking', 'Garage',
];

// Search scope → radius in meters (covers « autour de moi » → ville → île/région).
const SCOPES = [
  { key: 'around', label: 'Autour de moi', radius: 2500 },
  { key: 'city', label: 'Ma ville', radius: 10000 },
  { key: 'island', label: 'Île / Région', radius: 50000 },
];

const absImg = (url) => (typeof url === 'string' && url.startsWith('/api/') ? `${API}${url}` : url);

// Durée de visite indicative (min) par catégorie — affichage circuit (miroir backend).
const VISIT_MIN = {
  'Musée': 90, 'Monuments': 45, 'Sites historiques': 45, 'Lieux touristiques': 60,
  'Attraction': 75, 'Parcs & Nature': 60, 'Plages': 120, 'Points de vue': 30,
  'Bibliothèque': 30, 'Café': 30, 'Bar': 60, 'Restaurant': 75, 'Salon': 60,
  'Spa': 90, 'Shopping': 60, 'Centre commercial': 90, 'Hôtel': 0, 'Boulangerie': 15,
  'Pharmacie': 15, 'Hôpital': 0, 'Salle de sport': 60, 'Vie Nocturne': 90,
  'Parking': 0, 'Garage': 0,
};
const visitOf = (cat) => (VISIT_MIN[cat] != null ? VISIT_MIN[cat] : 45);
const fmtDur = (min) => {
  if (min == null) return '—';
  const h = Math.floor(min / 60); const m = min % 60;
  return h ? `${h} h${m ? ` ${m}` : ''}` : `${m} min`;
};

const NearbyBusinessPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawCat = (params.get('category') || '').trim();

  const [coords, setCoords] = useState(null);
  const [activeCat, setActiveCat] = useState(NEARBY_CATEGORIES.includes(rawCat) ? rawCat : NEARBY_CATEGORIES[0]);
  const [scope, setScope] = useState('around');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [favIds, setFavIds] = useState([]);
  const [showFavs, setShowFavs] = useState(false);
  const [favs, setFavs] = useState([]);
  const [viewMode, setViewMode] = useState('list'); // list | map
  const [planMode, setPlanMode] = useState(false);
  const [plan, setPlan] = useState([]); // ordered list of selected item ids for the itinerary
  const [routeInfo, setRouteInfo] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [exploreCity, setExploreCity] = useState(null); // {name} when exploring another city; null = my position
  const [cityInput, setCityInput] = useState('');
  const [cityOpen, setCityOpen] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [savingCircuit, setSavingCircuit] = useState(false);

  // Resolve the user's GPS once (graceful Paris fallback).
  useEffect(() => {
    if (!('geolocation' in navigator)) { setCoords(PARIS); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setCoords(PARIS),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
    );
  }, []);

  const exploreOtherCity = async () => {
    const q = cityInput.trim();
    if (!q) return;
    setGeocoding(true);
    try {
      const r = await fetch(`${API}/api/nearby/geocode?q=${encodeURIComponent(q)}`, { credentials: 'include' });
      const d = await r.json();
      if (r.ok) {
        setCoords({ lat: d.lat, lng: d.lng });
        setExploreCity({ name: d.name });
        setScope('city'); setShowFavs(false); setCityOpen(false); setCityInput('');
        toast.success(`Exploration : ${d.name}`);
      } else toast.error(d.detail || 'Ville introuvable');
    } catch { toast.error('Erreur réseau'); }
    finally { setGeocoding(false); }
  };

  const backToMyPosition = () => {
    setExploreCity(null);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setCoords(PARIS), { timeout: 8000, maximumAge: 300000 });
    } else setCoords(PARIS);
    setScope('around');
  };

  const loadFavIds = useCallback(() => {
    favoritesAPI.ids('nearby').then((r) => setFavIds(r.data.ids || [])).catch(() => {});
  }, []);
  useEffect(() => { loadFavIds(); }, [loadFavIds]);

  const radius = SCOPES.find((s) => s.key === scope).radius;

  const load = useCallback(async () => {
    if (!coords || showFavs) return;
    setLoading(true);
    try {
      const url = `${API}/api/nearby/live?lat=${coords.lat}&lng=${coords.lng}&category=${encodeURIComponent(activeCat)}&radius_m=${radius}${exploreCity ? '&featured=false' : ''}`;
      const r = await fetch(url, { credentials: 'include' });
      const d = r.ok ? await r.json() : { items: [] };
      setItems((d.items || []).map((i) => ({ ...i, image: absImg(i.image) })));
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [coords, activeCat, radius, showFavs, exploreCity]);

  useEffect(() => { load(); }, [load]);

  const openFavs = () => {
    setShowFavs(true); setLoading(true);
    favoritesAPI.list('nearby')
      .then((r) => setFavs((r.data.favorites || []).map((f) => ({ ...f.listing, image: absImg(f.listing.image) }))))
      .catch(() => setFavs([]))
      .finally(() => setLoading(false));
  };

  const exitFavs = () => { setShowFavs(false); setPlanMode(false); setPlan([]); setRouteInfo(null); };

  const togglePlan = (item) => {
    setRouteInfo(null);
    setPlan((p) => (p.includes(item.id) ? p.filter((x) => x !== item.id) : [...p, item.id]));
  };

  const optimizeCircuit = async () => {
    const selected = plan.map((id) => favs.find((f) => f.id === id)).filter((p) => p && p.lat != null && p.lng != null);
    if (selected.length < 2) { toast.error('Sélectionnez au moins 2 lieux géolocalisés'); return; }
    if (!coords) { toast.error('Position introuvable'); return; }
    setOptimizing(true);
    try {
      const r = await fetch(`${API}/api/nearby/optimize-route`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          origin: { lat: coords.lat, lng: coords.lng },
          places: selected.map((p) => ({ name: p.name, category: p.category, lat: p.lat, lng: p.lng })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'fail');
      // Reorder the plan to the optimal visiting sequence.
      const optimized = d.order.map((i) => selected[i].id);
      setPlan(optimized);
      setRouteInfo({ ...d, names: d.order.map((i) => selected[i].name) });
      toast.success('Circuit optimisé');
    } catch {
      toast.error('Optimisation indisponible');
    } finally { setOptimizing(false); }
  };

  const reserveItinerary = () => {
    const ordered = plan
      .map((id) => favs.find((f) => f.id === id))
      .filter((p) => p && p.lat != null && p.lng != null);
    if (ordered.length < 1) { toast.error('Sélectionnez des lieux géolocalisés'); return; }
    try {
      sessionStorage.setItem('sb_taxi_itinerary', JSON.stringify(
        ordered.map((p) => ({ address: p.address || p.name, lat: p.lat, lng: p.lng })),
      ));
    } catch { /* ignore */ }
    navigate('/taxi');
  };

  const saveCircuit = async () => {
    const ordered = plan.map((id) => favs.find((f) => f.id === id)).filter(Boolean);
    if (ordered.length < 1) { toast.error('Ajoutez au moins une étape'); return; }
    const title = (window.prompt('Nom du circuit ?', exploreCity?.name ? `Circuit ${exploreCity.name}` : 'Mon circuit') || '').trim();
    if (!title) return;
    setSavingCircuit(true);
    try {
      await itinerariesAPI.create({
        title,
        city: exploreCity?.name || null,
        places: ordered.map((p) => ({
          name: p.name, category: p.category, address: p.address,
          lat: p.lat, lng: p.lng, place_id: p.place_id, image: p.image,
        })),
        route_info: routeInfo
          ? { total_drive_min: routeInfo.total_drive_min, total_visit_min: routeInfo.total_visit_min, total_day_min: routeInfo.total_day_min }
          : null,
      });
      toast.success('Circuit enregistré dans « Mes circuits »');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Enregistrement impossible');
    } finally { setSavingCircuit(false); }
  };

  const toggleFav = async (item, e) => {
    if (e) { e.stopPropagation(); }
    const wasFav = favIds.includes(item.id);
    setFavIds((ids) => (wasFav ? ids.filter((x) => x !== item.id) : [...ids, item.id]));
    try {
      await favoritesAPI.toggle('nearby', item.id, wasFav ? null : {
        id: item.id, place_id: item.place_id, name: item.name, category: item.category,
        address: item.address, rating: item.rating, image: item.image,
        open_now: item.open_now, distance_km: item.distance_km, lat: item.lat, lng: item.lng,
        phone: item.phone, source: item.source,
      });
      toast.success(wasFav ? 'Retiré des favoris' : 'Ajouté aux favoris');
      if (showFavs && wasFav) setFavs((f) => f.filter((x) => x.id !== item.id));
    } catch {
      setFavIds((ids) => (wasFav ? [...ids, item.id] : ids.filter((x) => x !== item.id)));
      toast.error('Erreur favoris');
    }
  };

  const source = showFavs ? favs : items;
  const filtered = source.filter((i) =>
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
          <h1 className="text-lg font-bold text-white flex-1">{showFavs ? 'Mes favoris' : 'Commerces & Tourisme'}</h1>
          <button
            onClick={() => navigate('/mes-circuits')}
            className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-white/20 text-white"
            data-testid="my-circuits-link"
          >
            <BookmarkSimple size={14} weight="fill" /> Circuits
          </button>
          <button
            onClick={() => (showFavs ? exitFavs() : openFavs())}
            className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-full ${showFavs ? 'bg-white text-[#FF4500]' : 'bg-white/20 text-white'}`}
            data-testid="favorites-toggle"
          >
            <Heart size={14} weight={showFavs ? 'fill' : 'regular'} /> {showFavs ? 'Retour' : 'Favoris'}
          </button>
        </div>
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Commerce, lieu, type..."
            className="w-full bg-white border-0 rounded-full pl-10 pr-3 h-11 text-sm outline-none"
            data-testid="search-input"
          />
        </div>
        {/* Explorer une autre ville */}
        {!showFavs && (exploreCity ? (
          <div className="flex items-center gap-2 mt-2.5 bg-white/15 rounded-full pl-3 pr-1.5 py-1.5" data-testid="explore-city-banner">
            <Globe size={15} className="text-white shrink-0" weight="fill" />
            <span className="text-white text-xs font-semibold truncate flex-1">Exploration : {exploreCity.name}</span>
            <button onClick={backToMyPosition} className="flex items-center gap-1 bg-white text-[#FF4500] text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0" data-testid="explore-reset-btn">
              <MapPin size={12} weight="fill" /> Ma position
            </button>
          </div>
        ) : (
          cityOpen ? (
            <div className="flex items-center gap-2 mt-2.5" data-testid="explore-city-input-row">
              <input
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && exploreOtherCity()}
                autoFocus
                placeholder="Quelle ville explorer ? (ex : Marseille)"
                className="flex-1 bg-white border-0 rounded-full px-4 h-10 text-sm outline-none"
                data-testid="explore-city-input"
              />
              <button onClick={exploreOtherCity} disabled={geocoding} className="bg-[#1F2430] text-white text-xs font-bold px-3 h-10 rounded-full shrink-0 disabled:opacity-60" data-testid="explore-city-go">
                {geocoding ? '...' : 'Explorer'}
              </button>
              <button onClick={() => { setCityOpen(false); setCityInput(''); }} className="w-9 h-10 flex items-center justify-center text-white shrink-0" data-testid="explore-city-cancel"><X size={18} /></button>
            </div>
          ) : (
            <button onClick={() => setCityOpen(true)} className="flex items-center gap-1.5 mt-2.5 text-white/90 text-xs font-semibold" data-testid="explore-city-open">
              <Globe size={14} weight="fill" /> Explorer une autre ville →
            </button>
          )
        ))}
      </div>

      {!showFavs && (
        <>
          {/* Scope selector */}
          <div className="px-4 pt-3 flex gap-2" data-testid="scope-selector">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                onClick={() => setScope(s.key)}
                className={`flex-1 px-2 py-2 rounded-xl text-[11px] font-bold transition-colors ${scope === s.key ? 'bg-[#1F2430] text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
                data-testid={`scope-${s.key}`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Category chips + view toggle */}
          <div className="px-4 pt-3 flex items-center gap-2">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 flex-1">
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
            <button
              onClick={() => setViewMode((v) => (v === 'list' ? 'map' : 'list'))}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#1F2430] text-white text-xs font-bold"
              data-testid="view-toggle"
            >
              {viewMode === 'list' ? <><MapTrifold size={14} weight="fill" /> Carte</> : <><List size={14} weight="fill" /> Liste</>}
            </button>
          </div>
        </>
      )}

      {/* Itinéraire touristique — multi-arrêts depuis les favoris */}
      {showFavs && favs.length >= 1 && (
        <div className="px-4 pt-3" data-testid="itinerary-controls">
          {!planMode ? (
            <button
              onClick={() => { setPlanMode(true); setPlan([]); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-orange-300 text-orange-600 text-sm font-bold bg-orange-50/50"
              data-testid="start-itinerary-btn"
            >
              <Path size={16} weight="bold" /> Créer un itinéraire touristique
            </button>
          ) : (
            <div className="flex items-center justify-between bg-[#1F2430] text-white rounded-xl px-3 py-2.5">
              <span className="text-xs font-semibold">Touchez les lieux dans l'ordre de visite</span>
              <button onClick={() => { setPlanMode(false); setPlan([]); setRouteInfo(null); }} className="text-[11px] font-bold underline" data-testid="cancel-itinerary-btn">Annuler</button>
            </div>
          )}
          {routeInfo && (
            <div className="mt-2 bg-white border border-orange-200 rounded-xl p-3 flex items-center gap-3" data-testid="route-summary">
              <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                <Path size={18} weight="bold" className="text-orange-600" />
              </div>
              <div className="flex-1 grid grid-cols-3 gap-1 text-center">
                <div><p className="text-[10px] text-gray-400">Route</p><p className="text-sm font-extrabold text-gray-900">{fmtDur(routeInfo.total_drive_min)}</p></div>
                <div><p className="text-[10px] text-gray-400">Visites</p><p className="text-sm font-extrabold text-gray-900">{fmtDur(routeInfo.total_visit_min)}</p></div>
                <div><p className="text-[10px] text-gray-400">Journée</p><p className="text-sm font-extrabold text-orange-600">{fmtDur(routeInfo.total_day_min)}</p></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Map view */}
      {!showFavs && viewMode === 'map' && (
        <div className="px-4 mt-3" data-testid="nearby-map-wrap">
          {coords ? (
            <NearbyPlacesMap center={coords} items={items} selectedId={selected?.id} onSelect={setSelected} />
          ) : (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" /></div>
          )}
          <p className="text-[11px] text-gray-400 text-center mt-2">Touchez une épingle pour voir le lieu et réserver un chauffeur.</p>
        </div>
      )}

      {/* List view */}
      {!(viewMode === 'map' && !showFavs) && (
      <div className="px-4 mt-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center" data-testid="empty-state">
            {showFavs ? <Heart size={36} className="mx-auto mb-3 text-gray-300" weight="duotone" /> : <MapPin size={36} className="mx-auto mb-3 text-gray-300" weight="duotone" />}
            <p className="text-sm text-gray-500">{showFavs ? 'Aucun favori pour le moment' : `Aucun résultat « ${activeCat} » dans cette zone`}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const planIdx = plan.indexOf(item.id);
              const selecting = showFavs && planMode;
              return (
              <div key={item.id} data-testid={`item-${item.id}`} className="relative">
                {selecting ? (
                  <span
                    className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shadow ${planIdx >= 0 ? 'bg-[#FF4500] text-white' : 'bg-white text-gray-400 border border-gray-200'}`}
                    data-testid={`plan-badge-${item.id}`}
                  >
                    {planIdx >= 0 ? planIdx + 1 : '+'}
                  </span>
                ) : (
                  <button
                    onClick={(e) => toggleFav(item, e)}
                    className="absolute top-2 left-2 z-10 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center"
                    data-testid={`fav-${item.id}`}
                  >
                    <Heart size={16} weight={favIds.includes(item.id) ? 'fill' : 'regular'} className={favIds.includes(item.id) ? 'text-rose-500' : 'text-gray-400'} />
                  </button>
                )}
                <div className={selecting && planIdx >= 0 ? 'ring-2 ring-[#FF4500] rounded-2xl' : ''}>
                  <ServiceCard
                    item={item}
                    onClick={() => (selecting ? togglePlan(item) : setSelected(item))}
                    badges={[
                      { label: item.category, colorClass: 'bg-indigo-50 text-indigo-700' },
                      ...(selecting && planIdx >= 0 ? [{ label: `~${visitOf(item.category)} min visite`, colorClass: 'bg-amber-50 text-amber-700' }] : []),
                      ...(item.distance_km != null ? [{ label: `${item.distance_km} km`, colorClass: 'bg-gray-100 text-gray-700' }] : []),
                      ...(item.open_now != null ? [{ label: item.open_now ? 'Ouvert' : 'Fermé', colorClass: item.open_now ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700' }] : []),
                    ]}
                  />
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Sticky itinerary CTA */}
      {showFavs && planMode && plan.length >= 1 && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-40 px-4 pb-4 pt-2 bg-gradient-to-t from-white via-white to-transparent" data-testid="itinerary-cta-bar">
          <div className="flex gap-2">
            {plan.length >= 2 && (
              <button
                onClick={optimizeCircuit}
                disabled={optimizing}
                className="flex items-center justify-center gap-1.5 px-4 py-4 rounded-2xl border-2 border-[#1F2430] text-[#1F2430] font-bold disabled:opacity-60"
                data-testid="optimize-route-btn"
              >
                <Path size={18} weight="bold" /> {optimizing ? '...' : 'Optimiser'}
              </button>
            )}
            <button
              onClick={saveCircuit}
              disabled={savingCircuit}
              className="flex items-center justify-center gap-1.5 px-4 py-4 rounded-2xl border-2 border-orange-400 text-orange-600 font-bold disabled:opacity-60"
              data-testid="save-circuit-btn"
            >
              <FloppyDisk size={18} weight="bold" /> {savingCircuit ? '...' : 'Enregistrer'}
            </button>
            <button
              onClick={reserveItinerary}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#FF4500] text-white font-extrabold shadow-lg shadow-orange-500/30 active:scale-[0.99] transition-transform"
              data-testid="reserve-itinerary-btn"
            >
              <Car size={20} weight="fill" /> Réserver ({plan.length} {plan.length > 1 ? 'arrêts' : 'arrêt'})
            </button>
          </div>
        </div>
      )}

      {selected && (
        <PlaceDetailSheet
          item={selected}
          isFav={favIds.includes(selected.id)}
          onToggleFav={() => toggleFav(selected)}
          onClose={() => setSelected(null)}
          onTaxi={(it) => {
            try {
              sessionStorage.setItem('sb_taxi_dest', JSON.stringify({ address: it.address || it.name, lat: it.lat, lng: it.lng }));
            } catch { /* ignore */ }
            navigate('/taxi');
          }}
        />
      )}
    </div>
  );
};

/** Bottom sheet with place details + Call / Directions / Taxi / Favorite. */
const PlaceDetailSheet = ({ item, isFav, onToggleFav, onClose, onTaxi }) => {
  const [details, setDetails] = useState(null);
  const phone = details?.phone || item.phone;
  const lat = details?.lat ?? item.lat;
  const lng = details?.lng ?? item.lng;

  useEffect(() => {
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
        <button onClick={onToggleFav} className="absolute top-3 left-3 z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center" data-testid="sheet-fav">
          <Heart size={18} weight={isFav ? 'fill' : 'regular'} className={isFav ? 'text-rose-500' : 'text-gray-500'} />
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
          <div className="grid grid-cols-2 gap-2 mt-5">
            <a
              href={phone ? `tel:${phone}` : undefined}
              className={`flex items-center justify-center gap-2 py-3 rounded-2xl border ${phone ? 'border-gray-200 text-gray-800' : 'border-gray-100 text-gray-300 pointer-events-none'}`}
              data-testid="sheet-call"
            >
              <Phone size={18} weight="fill" /><span className="text-sm font-semibold">Appeler</span>
            </a>
            <a
              href={directionsUrl} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 text-gray-800"
              data-testid="sheet-directions"
            >
              <NavigationArrow size={18} weight="fill" className="text-sky-600" /><span className="text-sm font-semibold">Itinéraire</span>
            </a>
          </div>

          {/* Primary proposal — réserver un chauffeur SB Drive pour s'y rendre */}
          <button
            onClick={() => onTaxi(item)}
            className="w-full mt-3 flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#FF4500] text-white font-extrabold shadow-lg shadow-orange-500/20 active:scale-[0.99] transition-transform"
            data-testid="sheet-taxi"
          >
            <Car size={22} weight="fill" /> Réserver un chauffeur SB Drive
          </button>
          <p className="text-[11px] text-gray-400 text-center mt-2">On vous y conduit — destination déjà préremplie.</p>
        </div>
      </div>
    </div>
  );
};

export default NearbyBusinessPage;
