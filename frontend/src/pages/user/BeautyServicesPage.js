import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from '@phosphor-icons/react';

const beautyServices = [
  { id: 'hair', name: 'Soins\nCapillaires', bg: 'bg-yellow-50', emoji: '💇‍♀️' },
  { id: 'skin', name: 'Soins\nVisage', bg: 'bg-green-50', emoji: '🧖‍♀️' },
  { id: 'nails', name: 'Ongles &\nManucure', bg: 'bg-pink-50', emoji: '💅' },
  { id: 'waxing', name: 'Épilation', bg: 'bg-orange-50', emoji: '🪒' },
  { id: 'makeup', name: 'Maquillage\n& Coiffure', bg: 'bg-blue-50', emoji: '💄' },
  { id: 'massage', name: 'Massage\n& Spa', bg: 'bg-pink-100', emoji: '💆‍♀️' },
  { id: 'mens', name: 'Soins\nHommes', bg: 'bg-amber-50', emoji: '💈' },
  { id: 'hands-feet', name: 'Mains &\nPieds', bg: 'bg-rose-50', emoji: '🦶' },
  { id: 'eyebrows', name: 'Sourcils &\nCils', bg: 'bg-purple-50', emoji: '👁' },
  { id: 'exfoliation', name: 'Exfoliation', bg: 'bg-amber-50', emoji: '✨' },
  { id: 'tanning', name: 'Bronzage', bg: 'bg-orange-100', emoji: '☀️' },
  { id: 'bridal', name: 'Mariage &\nPré-Mariage', bg: 'bg-green-50', emoji: '👰' },
];

const BeautyServicesPage = () => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container min-h-screen bg-white">
      {/* Header */}
      <div className="bg-blue-600 px-4 py-3 flex items-center justify-between">
        <h1 className="text-white font-bold text-lg italic">Tous les Services</h1>
        <button onClick={() => navigate(-1)} data-testid="beauty-close-btn">
          <X size={24} className="text-white" />
        </button>
      </div>

      {/* Banner */}
      <div className="mx-4 mt-3 rounded-2xl overflow-hidden bg-gradient-to-r from-pink-100 to-pink-50 border border-pink-200 flex items-stretch h-[120px]">
        <div className="flex-1 p-4 flex flex-col justify-center">
          <h2 className="text-xl font-extrabold text-gray-900 leading-tight">ENGAGEZ UNE<br/>ESTHÉTICIENNE</h2>
          <p className="text-xs text-gray-600 mt-1">Réservez une esthéticienne et faites-vous chouchouter chez vous !</p>
        </div>
        <div className="w-1/3">
          <img
            src="https://images.unsplash.com/photo-1560066984-138dadb4c035?w=200&h=150&fit=crop"
            alt="Beauty"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="p-4">
        <div className="grid grid-cols-3 gap-4">
          {beautyServices.map((service) => (
            <button
              key={service.id}
              onClick={() => navigate('/services')}
              className="flex flex-col items-center gap-2 group"
              data-testid={`beauty-${service.id}`}
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

export default BeautyServicesPage;
