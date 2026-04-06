import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from '@phosphor-icons/react';

const carCareServices = [
  { id: 'wash', name: 'Lavage\nAuto & Spa', bg: 'bg-blue-50', emoji: '🚗' },
  { id: 'battery', name: 'Service\nBatterie', bg: 'bg-green-50', emoji: '🔋' },
  { id: 'shop', name: 'Boutique', bg: 'bg-amber-50', emoji: '🏪' },
  { id: 'fuel', name: 'Livraison\nCarburant', bg: 'bg-orange-50', emoji: '⛽' },
  { id: 'bike-wash', name: 'Lavage\nMoto & Spa', bg: 'bg-cyan-50', emoji: '🏍' },
  { id: 'ev-charging', name: 'Recharge\nEV', bg: 'bg-emerald-50', emoji: '🔌' },
  { id: 'keylocks', name: 'Clés Auto', bg: 'bg-gray-50', emoji: '🔑' },
  { id: 'oil-change', name: 'Vidange', bg: 'bg-yellow-50', emoji: '🛢' },
];

const CarCarePage = () => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container min-h-screen bg-white">
      {/* Header */}
      <div className="bg-blue-600 px-4 py-3 flex items-center justify-between">
        <h1 className="text-white font-bold text-lg italic">Tous les Services</h1>
        <button onClick={() => navigate(-1)} data-testid="carcare-close-btn">
          <X size={24} className="text-white" />
        </button>
      </div>

      {/* Banner */}
      <div className="mx-4 mt-3 rounded-2xl overflow-hidden bg-gradient-to-r from-cyan-100 to-blue-50 border border-cyan-200 flex items-stretch h-[120px]">
        <div className="flex-1 p-4 flex flex-col justify-center">
          <h2 className="text-lg font-extrabold text-blue-700 leading-tight">LAVAGE RAPIDE<br/>CHEZ VOUS</h2>
          <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">Lavage, carburant, batterie, vidange & plus — en quelques minutes.</p>
        </div>
        <div className="w-1/3">
          <img
            src="https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?w=200&h=150&fit=crop"
            alt="Car wash"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="p-4">
        <div className="grid grid-cols-3 gap-4">
          {carCareServices.map((service) => (
            <button
              key={service.id}
              onClick={() => navigate('/services')}
              className="flex flex-col items-center gap-2 group"
              data-testid={`carcare-${service.id}`}
            >
              <div className={`w-[80px] h-[80px] rounded-2xl ${service.bg} flex items-center justify-center group-hover:scale-105 transition-transform border border-gray-200`}>
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

export default CarCarePage;
