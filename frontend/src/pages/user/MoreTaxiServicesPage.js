import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from '@phosphor-icons/react';

const moreTaxiServices = [
  { id: 'airport', name: 'Aéroport', bg: 'bg-blue-50', emoji: '✈️' },
  { id: 'pets', name: 'Animaux', bg: 'bg-pink-50', emoji: '🐾' },
  { id: 'book-other', name: 'Réserver\npour Autre', bg: 'bg-amber-50', emoji: '🎒' },
  { id: 'electric', name: 'Électrique', bg: 'bg-green-50', emoji: '🔋' },
  { id: 'moto-booking', name: 'Moto\nRéservation', bg: 'bg-orange-50', emoji: '🏍' },
  { id: 'moto-rental', name: 'Location\nMoto', bg: 'bg-yellow-50', emoji: '🛵' },
  { id: 'tuktuk', name: 'Tuktuk', bg: 'bg-teal-50', emoji: '🛺' },
  { id: 'assist', name: 'Assistance', bg: 'bg-sky-50', emoji: '🤝' },
  { id: 'corporate', name: 'Courses\nCorporate', bg: 'bg-stone-50', emoji: '💼' },
  { id: 'access', name: 'Accessibilité', bg: 'bg-cyan-50', emoji: '♿' },
];

const MoreTaxiServicesPage = () => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container min-h-screen bg-white">
      {/* Header */}
      <div className="bg-blue-600 px-4 py-3 flex items-center justify-between">
        <h1 className="text-white font-bold text-lg italic">Plus de Services</h1>
        <button onClick={() => navigate(-1)} data-testid="moretaxi-close-btn">
          <X size={24} className="text-white" />
        </button>
      </div>

      {/* Grid */}
      <div className="p-5">
        <div className="grid grid-cols-3 gap-5">
          {moreTaxiServices.map((service) => (
            <button
              key={service.id}
              onClick={() => navigate('/ride')}
              className="flex flex-col items-center gap-2 group"
              data-testid={`moretaxi-${service.id}`}
            >
              <div className={`w-[80px] h-[80px] rounded-2xl ${service.bg} flex items-center justify-center group-hover:scale-105 transition-transform border border-gray-100`}>
                <span className="text-3xl">{service.emoji}</span>
              </div>
              <span className="text-xs font-semibold text-gray-700 text-center leading-tight whitespace-pre-line">{service.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MoreTaxiServicesPage;
