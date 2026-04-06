import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from '@phosphor-icons/react';

const petServices = [
  { id: 'grooming', name: 'Toilettage', bg: 'bg-yellow-50', emoji: '🐕' },
  { id: 'walking', name: 'Promenade', bg: 'bg-blue-50', emoji: '🚶‍♂️' },
  { id: 'training', name: 'Dressage', bg: 'bg-green-50', emoji: '🎓' },
  { id: 'boarding', name: 'Pension', bg: 'bg-orange-50', emoji: '🏠' },
  { id: 'sitting', name: 'Garde', bg: 'bg-pink-50', emoji: '🐾' },
  { id: 'vet', name: 'Soins\nVétérinaires', bg: 'bg-red-50', emoji: '🩺' },
  { id: 'spa', name: 'Spa &\nBien-être', bg: 'bg-teal-50', emoji: '🛁' },
  { id: 'food', name: 'Alimentation\n& Nutrition', bg: 'bg-amber-50', emoji: '🍖' },
  { id: 'accessories', name: 'Accessoires\n& Fournitures', bg: 'bg-rose-50', emoji: '🦴' },
  { id: 'transport', name: 'Transport', bg: 'bg-cyan-50', emoji: '🚐' },
  { id: 'adoption', name: 'Adoption &\nÉlevage', bg: 'bg-lime-50', emoji: '🐶' },
  { id: 'photo', name: 'Photos &\nÉvénements', bg: 'bg-violet-50', emoji: '📸' },
];

const PetServicesPage = () => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container min-h-screen bg-white">
      {/* Header */}
      <div className="bg-blue-600 px-4 py-3 flex items-center justify-between">
        <h1 className="text-white font-bold text-lg italic">Tous les Services</h1>
        <button onClick={() => navigate(-1)} data-testid="pet-close-btn">
          <X size={24} className="text-white" />
        </button>
      </div>

      {/* Banner */}
      <div className="mx-4 mt-3 rounded-2xl overflow-hidden bg-gradient-to-r from-blue-100 to-blue-50 border border-blue-200 flex items-stretch h-[120px]">
        <div className="flex-1 p-4 flex flex-col justify-center">
          <h2 className="text-xl font-extrabold text-gray-900 leading-tight">SERVICES<br/>ANIMAUX</h2>
          <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">Toilettage, promenade, dressage et soins vétérinaires pour vos compagnons.</p>
        </div>
        <div className="w-1/3">
          <img
            src="https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=200&h=150&fit=crop"
            alt="Pet"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="p-4">
        <div className="grid grid-cols-3 gap-4">
          {petServices.map((service) => (
            <button
              key={service.id}
              onClick={() => navigate('/services')}
              className="flex flex-col items-center gap-2 group"
              data-testid={`pet-${service.id}`}
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

export default PetServicesPage;
