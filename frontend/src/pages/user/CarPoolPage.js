import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MagnifyingGlass, Users, Calendar, MapPin, Plus } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const CarPoolPage = () => {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${API}/api/phase2/catalogs/carpool_trips`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(d => setTrips(Array.isArray(d) ? d : []))
      .catch(() => setTrips([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = trips.filter(t =>
    !search.trim() ||
    (t.from_city || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.to_city || '').toLowerCase().includes(search.toLowerCase())
  );

  const book = (trip) => toast.success(`Réservation ${trip.from_city} → ${trip.to_city} chez ${trip.driver_name}`);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-8" data-testid="carpool-page">
      <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Covoiturage</h1>
          <p className="text-xs text-white/80">Voyagez à petit prix entre villes</p>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="relative">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ville de départ ou destination..." className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-green-400" data-testid="search-input" />
        </div>
      </div>

      <button onClick={() => toast.info('Publication de trajet bientôt disponible')} className="mx-4 mt-3 w-[calc(100%-32px)] bg-white border-2 border-dashed border-green-400 rounded-xl py-3 flex items-center justify-center gap-2 text-green-600 font-semibold text-sm" data-testid="publish-trip-btn">
        <Plus size={16} weight="bold" />Publier un trajet
      </button>

      <div className="px-4 mt-4">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-green-200 border-t-green-500 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-12">Aucun trajet disponible</p>
        ) : (
          <div className="space-y-3">
            {filtered.map(t => (
              <button key={t.id} onClick={() => book(t)} className={`w-full bg-white rounded-2xl border p-4 text-left hover:shadow-md transition-shadow relative ${t.is_featured ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-100'}`} data-testid={`trip-${t.id}`}>
                {t.is_featured && (
                  <span className="absolute top-2 right-2 inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shadow-sm" data-testid={`sponsored-${t.id}`}>
                    ★ Sponsorisé
                  </span>
                )}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold">{t.driver_name?.charAt(0)}</div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{t.driver_name}</p>
                      <p className="text-[11px] text-amber-500">★ {t.driver_rating?.toFixed(1)} · {t.vehicle}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600">{t.price_per_seat}€</p>
                    <p className="text-[10px] text-gray-500">/ place</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin size={14} className="text-green-500 flex-shrink-0" weight="fill" />
                  <p className="font-semibold text-gray-800">{t.from_city} → {t.to_city}</p>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Calendar size={12} />{new Date(t.departure_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <span className="flex items-center gap-1"><Users size={12} />{t.seats_available} place(s)</span>
                  {t.duration_h && <span>~{t.duration_h}h</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CarPoolPage;
