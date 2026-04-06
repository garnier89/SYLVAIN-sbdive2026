import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { carpoolAPI } from '../../services/api';
import {
  ArrowLeft, MapPin, Calendar, CaretDown, UsersThree, ArrowsDownUp, Plus, Clock
} from '@phosphor-icons/react';

const CarPoolPage = () => {
  const navigate = useNavigate();
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [date, setDate] = useState('');
  const [persons, setPersons] = useState('1');
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [publishForm, setPublishForm] = useState({ pickup_address: '', dropoff_address: '', departure_date: '', available_seats: 3, price_per_seat: 15 });

  useEffect(() => {
    loadRides();
  }, []);

  const loadRides = async () => {
    try {
      const res = await carpoolAPI.searchRides({});
      setRides(res.data || []);
    } catch { /* empty */ }
  };

  const swapLocations = () => {
    const temp = pickup;
    setPickup(dropoff);
    setDropoff(temp);
  };

  const handleSearch = async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = {};
      if (pickup) params.pickup = pickup;
      if (dropoff) params.dropoff = dropoff;
      if (date) params.date = date;
      const res = await carpoolAPI.searchRides(params);
      setRides(res.data || []);
    } catch { /* empty */ } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    setLoading(true);
    try {
      await carpoolAPI.createRide(publishForm);
      setShowPublish(false);
      setPublishForm({ pickup_address: '', dropoff_address: '', departure_date: '', available_seats: 3, price_per_seat: 15 });
      loadRides();
    } catch { /* empty */ } finally {
      setLoading(false);
    }
  };

  const handleBook = async (rideId) => {
    try {
      await carpoolAPI.bookSeat(rideId);
      loadRides();
    } catch { /* empty */ }
  };

  return (
    <div className="mobile-container min-h-screen bg-white">
      {/* Header */}
      <div className="relative">
        <button onClick={() => navigate(-1)} className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center" data-testid="carpool-back-btn">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <div className="text-center pt-4 pb-2 px-12">
          <h1 className="text-xl font-bold text-gray-900 leading-tight">Trouvez et Réservez des Trajets à Petit Prix</h1>
        </div>

        {/* Illustration */}
        <div className="bg-gradient-to-b from-blue-50 to-white px-6 py-4 flex justify-center">
          <div className="relative w-full max-w-[280px] h-[130px]">
            <div className="absolute inset-0 flex items-end justify-center gap-2 pb-8 opacity-30">
              <div className="w-8 h-16 bg-gray-300 rounded-t-sm" />
              <div className="w-6 h-24 bg-gray-300 rounded-t-sm" />
              <div className="w-10 h-20 bg-gray-300 rounded-t-sm" />
              <div className="w-7 h-28 bg-gray-300 rounded-t-sm" />
              <div className="w-9 h-18 bg-gray-300 rounded-t-sm" />
            </div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-20 bg-gradient-to-r from-blue-400 to-blue-500 rounded-xl flex items-center justify-center shadow-lg">
              <UsersThree size={36} className="text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="px-5 -mt-2">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <div className="w-px h-6 bg-gray-300" />
              <div className="w-3 h-3 rounded-full bg-gray-400" />
            </div>
            <div className="flex-1 space-y-3">
              <input type="text" placeholder="Adresse de départ" value={pickup} onChange={(e) => setPickup(e.target.value)} className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none" data-testid="carpool-pickup-input" />
              <input type="text" placeholder="Adresse de destination" value={dropoff} onChange={(e) => setDropoff(e.target.value)} className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none" data-testid="carpool-dropoff-input" />
            </div>
            <button onClick={swapLocations} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center" data-testid="carpool-swap-btn">
              <ArrowsDownUp size={18} className="text-gray-600" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700">Date <span className="text-red-500">*</span></label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full h-10 mt-1 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 focus:border-blue-400 outline-none" data-testid="carpool-date-input" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700">Passagers <span className="text-red-500">*</span></label>
              <div className="relative mt-1">
                <select value={persons} onChange={(e) => setPersons(e.target.value)} className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 appearance-none focus:border-blue-400 outline-none" data-testid="carpool-persons-select">
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <CaretDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm" onClick={handleSearch} disabled={loading} data-testid="carpool-search-btn">
              {loading ? 'Recherche...' : 'Rechercher'}
            </Button>
            <Button variant="outline" className="h-12 rounded-xl border-blue-600 text-blue-600 font-semibold text-sm px-4" onClick={() => setShowPublish(!showPublish)} data-testid="carpool-publish-btn">
              <Plus size={18} className="mr-1" />
              Publier
            </Button>
          </div>
        </div>
      </div>

      {/* Publish Form */}
      {showPublish && (
        <div className="px-5 mt-4">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-gray-900 text-sm">Publier votre trajet</h3>
            <input type="text" placeholder="Ville de départ" value={publishForm.pickup_address} onChange={(e) => setPublishForm({...publishForm, pickup_address: e.target.value})} className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none" data-testid="publish-pickup" />
            <input type="text" placeholder="Ville d'arrivée" value={publishForm.dropoff_address} onChange={(e) => setPublishForm({...publishForm, dropoff_address: e.target.value})} className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none" data-testid="publish-dropoff" />
            <div className="grid grid-cols-3 gap-2">
              <input type="date" value={publishForm.departure_date} onChange={(e) => setPublishForm({...publishForm, departure_date: e.target.value})} className="h-10 rounded-lg border border-gray-200 px-2 text-sm outline-none" data-testid="publish-date" />
              <input type="number" min="1" max="6" value={publishForm.available_seats} onChange={(e) => setPublishForm({...publishForm, available_seats: parseInt(e.target.value) || 1})} className="h-10 rounded-lg border border-gray-200 px-2 text-sm outline-none" placeholder="Places" data-testid="publish-seats" />
              <input type="number" min="1" value={publishForm.price_per_seat} onChange={(e) => setPublishForm({...publishForm, price_per_seat: parseFloat(e.target.value) || 0})} className="h-10 rounded-lg border border-gray-200 px-2 text-sm outline-none" placeholder="Prix/place" data-testid="publish-price" />
            </div>
            <Button className="w-full h-10 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm" onClick={handlePublish} disabled={loading} data-testid="publish-submit-btn">
              Publier le trajet
            </Button>
          </div>
        </div>
      )}

      {/* Rides List */}
      <div className="px-5 mt-5 pb-8">
        <h2 className="text-base font-bold text-gray-900 mb-3">{searched ? 'Résultats' : 'Trajets Récents'}</h2>
        {rides.length === 0 ? (
          <div className="text-center py-8">
            <UsersThree size={40} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              {searched ? 'Aucun trajet trouvé. Essayez d\'autres critères.' : 'Aucun trajet publié pour le moment.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rides.map((ride) => (
              <div key={ride.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm" data-testid={`ride-${ride.id}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
                    <Calendar size={12} /> {ride.departure_date}
                  </p>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ride.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {ride.status === 'open' ? 'DISPONIBLE' : 'COMPLET'}
                  </span>
                </div>
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex flex-col items-center gap-0.5 mt-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <div className="w-px h-4 bg-gray-300" />
                    <div className="w-2 h-2 rounded-full bg-gray-500" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium text-gray-900">{ride.pickup_address}</p>
                    <p className="text-sm text-gray-600">{ride.dropoff_address}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><UsersThree size={14} /> {ride.passengers?.length || 0}/{ride.available_seats} places</span>
                    <span className="font-bold text-blue-600">{ride.price_per_seat} &euro;/place</span>
                  </div>
                  {ride.status === 'open' && (
                    <Button size="sm" className="h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs px-4" onClick={() => handleBook(ride.id)} data-testid={`book-${ride.id}`}>
                      Réserver
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CarPoolPage;
