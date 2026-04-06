import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from '@phosphor-icons/react';
import ServiceBookingSheet from '../../components/ServiceBookingSheet';

const towingServices = [
  { id: 'emergency', name: 'Remorquage\nUrgence', bg: 'bg-red-50', emoji: '🚨' },
  { id: 'flatbed', name: 'Remorquage\nPlateau', bg: 'bg-orange-50', emoji: '🛻' },
  { id: 'recovery', name: 'Récupération\nVéhicule', bg: 'bg-blue-50', emoji: '🏗' },
  { id: 'flat-tire', name: 'Pneu\nCrevé', bg: 'bg-yellow-50', emoji: '🛞' },
  { id: 'lockout', name: 'Ouverture\nPorte', bg: 'bg-gray-50', emoji: '🔑' },
  { id: 'jumpstart', name: 'Démarrage', bg: 'bg-amber-50', emoji: '⚡' },
  { id: 'fuel', name: 'Panne\nSèche', bg: 'bg-orange-100', emoji: '⛽' },
  { id: 'battery-change', name: 'Changement\nBatterie', bg: 'bg-green-50', emoji: '🔋' },
  { id: 'ev-charging', name: 'Recharge\nEV', bg: 'bg-emerald-50', emoji: '🔌' },
];

const TowingServicesPage = () => {
  const navigate = useNavigate();
  const [selectedService, setSelectedService] = useState(null);

  return (
    <div className="mobile-container min-h-screen bg-white">
      <div className="bg-[#FF4500] px-4 py-3 flex items-center justify-between">
        <h1 className="text-white font-bold text-lg italic">Dépannage & Remorquage</h1>
        <button onClick={() => navigate(-1)} data-testid="towing-close-btn"><X size={24} className="text-white" /></button>
      </div>

      <div className="mx-4 mt-3 rounded-2xl overflow-hidden bg-gradient-to-r from-blue-100 to-indigo-50 border border-orange-200 flex items-stretch h-[120px]">
        <div className="flex-1 p-4 flex flex-col justify-center">
          <h2 className="text-lg font-extrabold text-[#E03D00] leading-tight">DÉPANNAGE &<br/>REMORQUAGE</h2>
          <p className="text-[10px] text-gray-600 mt-1 leading-relaxed">Assistance routière 24/7. Du remorquage à la recharge EV.</p>
        </div>
        <div className="w-1/3 flex items-center justify-center bg-blue-50">
          <span className="text-5xl">🚛</span>
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-3 gap-4">
          {towingServices.map((service) => (
            <button key={service.id} onClick={() => setSelectedService(service)} className="flex flex-col items-center gap-2 group" data-testid={`towing-${service.id}`}>
              <div className={`w-[80px] h-[80px] rounded-2xl ${service.bg} flex items-center justify-center group-hover:scale-105 transition-transform border border-gray-100`}>
                <span className="text-3xl">{service.emoji}</span>
              </div>
              <span className="text-xs font-semibold text-gray-700 text-center leading-tight whitespace-pre-line">{service.name}</span>
            </button>
          ))}
        </div>
      </div>

      {selectedService && <ServiceBookingSheet service={selectedService} category="towing" onClose={() => setSelectedService(null)} />}
    </div>
  );
};

export default TowingServicesPage;
