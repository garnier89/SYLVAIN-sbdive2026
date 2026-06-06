import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Calendar, Clock, Users, Suitcase, CaretRight, Car, MagnifyingGlass } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const IntercityRidePage = () => {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [form, setForm] = useState({ departure_date: '', departure_time: '08:00', passengers: 1, luggage: 0, notes: '' });
  const [loading, setLoading] = useState(true);
  const [bookingDone, setBookingDone] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/intercity/routes`, { credentials: 'include' })
      .then(r => r.json()).then(d => { setRoutes(d.routes || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filteredRoutes = routes.filter(r =>
    r.from_city.toLowerCase().includes(search.toLowerCase()) ||
    r.to_city.toLowerCase().includes(search.toLowerCase())
  );

  const handleBook = async () => {
    if (!selectedRoute) return;
    try {
      const res = await fetch(`${API}/api/intercity/bookings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          from_city: selectedRoute.from_city, to_city: selectedRoute.to_city,
          departure_date: form.departure_date, departure_time: form.departure_time,
          passengers: form.passengers, luggage: form.luggage,
          price: selectedRoute.base_price * form.passengers, notes: form.notes
        })
      });
      if (res.ok) setBookingDone(true);
    } catch (e) { console.error(e); }
  };

  if (bookingDone) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center p-8" data-testid="booking-success">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <Car size={40} weight="duotone" className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Réservation confirmée !</h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          Votre trajet {selectedRoute.from_city} → {selectedRoute.to_city} a été réservé.
          Vous recevrez les détails du chauffeur bientôt.
        </p>
        <button onClick={() => navigate('/home')} className="bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold text-sm">
          Retour à l'accueil
        </button>
      </div>
    );
  }

  if (selectedRoute) {
    const totalPrice = (selectedRoute.base_price * form.passengers).toFixed(2);
    return (
      <div className="mobile-container min-h-screen bg-white" data-testid="intercity-booking">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
          <button onClick={() => setSelectedRoute(null)} data-testid="back-from-booking"><ArrowLeft size={22} /></button>
          <h1 className="text-base font-bold">Réserver le trajet</h1>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-green-50 rounded-2xl p-4 border border-green-100">
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <div className="w-0.5 h-8 bg-green-300" />
                <div className="w-3 h-3 rounded-full bg-green-700" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900">{selectedRoute.from_city}</p>
                <p className="text-xs text-gray-400 my-1">{selectedRoute.distance_km} km - {selectedRoute.estimated_duration}</p>
                <p className="font-bold text-gray-900">{selectedRoute.to_city}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-green-600">{selectedRoute.base_price}€</p>
                <p className="text-[10px] text-gray-400">par personne</p>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Date de départ</label>
            <input type="date" value={form.departure_date} onChange={e => setForm({ ...form, departure_date: e.target.value })}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm" data-testid="departure-date" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Heure de départ</label>
            <input type="time" value={form.departure_time} onChange={e => setForm({ ...form, departure_time: e.target.value })}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm" data-testid="departure-time" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Passagers</label>
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl p-2">
                <button onClick={() => setForm({ ...form, passengers: Math.max(1, form.passengers - 1) })}
                  className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-gray-600">-</button>
                <span className="flex-1 text-center font-bold" data-testid="passenger-count">{form.passengers}</span>
                <button onClick={() => setForm({ ...form, passengers: Math.min(4, form.passengers + 1) })}
                  className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-gray-600">+</button>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Bagages</label>
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl p-2">
                <button onClick={() => setForm({ ...form, luggage: Math.max(0, form.luggage - 1) })}
                  className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-gray-600">-</button>
                <span className="flex-1 text-center font-bold">{form.luggage}</span>
                <button onClick={() => setForm({ ...form, luggage: Math.min(5, form.luggage + 1) })}
                  className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-gray-600">+</button>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-500">{form.passengers} passager(s) x {selectedRoute.base_price}€</span>
              <span className="font-bold text-gray-900">{totalPrice}€</span>
            </div>
          </div>

          <button onClick={handleBook} disabled={!form.departure_date}
            className="w-full bg-orange-500 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-orange-600 transition-colors disabled:opacity-50"
            data-testid="confirm-intercity-booking">
            Réserver - {totalPrice}€
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="intercity-page">
      <div className="bg-gradient-to-br from-orange-500 to-orange-600 px-4 pt-4 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/home')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-white">VTC Intercity</h1>
        </div>
        <p className="text-sm text-white/80 mb-4">Voyagez entre les villes à petit prix</p>
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-11 rounded-xl bg-white pl-10 pr-4 text-sm"
            placeholder="Rechercher une ville..." data-testid="search-input" />
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        <h3 className="text-sm font-bold text-gray-700">Trajets populaires</h3>
        {loading ? (
          <div className="text-center py-8 text-gray-400">Chargement...</div>
        ) : filteredRoutes.map(route => (
          <button key={route.id} onClick={() => setSelectedRoute(route)}
            className="w-full bg-white rounded-2xl p-4 border border-gray-100 text-left"
            data-testid={`route-${route.id}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <div className="flex flex-col items-center gap-0.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <div className="w-0.5 h-5 bg-gray-200" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-700" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{route.from_city} → {route.to_city}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                    <span>{route.distance_km} km</span>
                    <span>{route.estimated_duration}</span>
                    <span>{route.available_drivers} chauffeurs</span>
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold text-green-600">{route.base_price}€</p>
                <p className="text-[10px] text-gray-400">dès</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default IntercityRidePage;
