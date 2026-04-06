import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import {
  ArrowLeft, MapPin, Calendar, CaretDown, MagnifyingGlass, UsersThree, ArrowsDownUp
} from '@phosphor-icons/react';

const CarPoolPage = () => {
  const navigate = useNavigate();
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [date, setDate] = useState('');
  const [persons, setPersons] = useState('1');
  const [searched, setSearched] = useState(false);

  const swapLocations = () => {
    const temp = pickup;
    setPickup(dropoff);
    setDropoff(temp);
  };

  const handleSearch = () => {
    setSearched(true);
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
          <div className="relative w-full max-w-[280px] h-[160px]">
            {/* City skyline */}
            <div className="absolute inset-0 flex items-end justify-center gap-2 pb-8 opacity-30">
              <div className="w-8 h-16 bg-gray-300 rounded-t-sm" />
              <div className="w-6 h-24 bg-gray-300 rounded-t-sm" />
              <div className="w-10 h-20 bg-gray-300 rounded-t-sm" />
              <div className="w-7 h-28 bg-gray-300 rounded-t-sm" />
              <div className="w-9 h-18 bg-gray-300 rounded-t-sm" />
            </div>
            {/* Trees */}
            <div className="absolute bottom-4 left-4 w-6 h-12 bg-teal-300 rounded-full opacity-50" />
            <div className="absolute bottom-4 right-4 w-6 h-12 bg-teal-300 rounded-full opacity-50" />
            {/* Car illustration */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-24 bg-gradient-to-r from-blue-400 to-blue-500 rounded-xl flex items-center justify-center shadow-lg">
              <UsersThree size={40} className="text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="px-5 -mt-2">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5 space-y-4">
          {/* Pickup */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <div className="w-px h-6 bg-gray-300" />
              <div className="w-3 h-3 rounded-full bg-gray-400" />
            </div>
            <div className="flex-1 space-y-3">
              <input
                type="text"
                placeholder="Adresse de départ"
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                data-testid="carpool-pickup-input"
              />
              <input
                type="text"
                placeholder="Adresse de destination"
                value={dropoff}
                onChange={(e) => setDropoff(e.target.value)}
                className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                data-testid="carpool-dropoff-input"
              />
            </div>
            <button onClick={swapLocations} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center" data-testid="carpool-swap-btn">
              <ArrowsDownUp size={18} className="text-gray-600" />
            </button>
          </div>

          {/* Date */}
          <div>
            <label className="text-sm font-semibold text-gray-700">Date <span className="text-red-500">*</span></label>
            <div className="relative mt-1">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                data-testid="carpool-date-input"
              />
            </div>
          </div>

          {/* Person Count */}
          <div>
            <label className="text-sm font-semibold text-gray-700">Passagers <span className="text-red-500">*</span></label>
            <div className="relative mt-1">
              <select
                value={persons}
                onChange={(e) => setPersons(e.target.value)}
                className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 appearance-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                data-testid="carpool-persons-select"
              >
                {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <CaretDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Search Button */}
          <Button
            className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base"
            onClick={handleSearch}
            data-testid="carpool-search-btn"
          >
            Rechercher
          </Button>
        </div>
      </div>

      {/* Recently Posted Rides */}
      <div className="px-5 mt-6 pb-8">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Trajets Récents</h2>
        {searched ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            Aucun trajet disponible pour le moment.
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 text-sm">
            Recherchez un trajet pour voir les résultats.
          </div>
        )}
      </div>
    </div>
  );
};

export default CarPoolPage;
