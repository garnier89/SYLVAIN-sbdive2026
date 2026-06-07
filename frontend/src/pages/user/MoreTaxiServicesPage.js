import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AirplaneTilt, PawPrint, Users, BatteryCharging, Motorcycle, Moped, Taxi, Handshake, Buildings, Wheelchair } from '@phosphor-icons/react';

const moreTaxiServices = [
  { id: 'airport', name: 'Aeroport', icon: AirplaneTilt, bg: 'bg-blue-50', iconColor: 'text-blue-500', mode: 'airport' },
  { id: 'pets', name: 'Animaux', icon: PawPrint, bg: 'bg-pink-50', iconColor: 'text-pink-500', mode: 'pets' },
  { id: 'book-other', name: 'Reserver\npour Autre', icon: Users, bg: 'bg-amber-50', iconColor: 'text-amber-600', mode: 'book_for_someone' },
  { id: 'electric', name: 'Electrique', icon: BatteryCharging, bg: 'bg-green-50', iconColor: 'text-green-600', mode: 'electric' },
  { id: 'moto-booking', name: 'Moto\nReservation', icon: Motorcycle, bg: 'bg-orange-50', iconColor: 'text-orange-500', mode: 'moto' },
  { id: 'moto-rental', name: 'Location\nMoto', icon: Moped, bg: 'bg-yellow-50', iconColor: 'text-yellow-600', mode: 'moto_rental' },
  { id: 'tuktuk', name: 'Tuktuk', icon: Taxi, bg: 'bg-teal-50', iconColor: 'text-teal-500', mode: 'tuktuk' },
  { id: 'assist', name: 'Assistance', icon: Handshake, bg: 'bg-sky-50', iconColor: 'text-sky-500', mode: 'assist' },
  { id: 'corporate', name: 'Courses\nCorporate', icon: Buildings, bg: 'bg-stone-50', iconColor: 'text-stone-600', mode: 'corporate' },
  { id: 'access', name: 'Accessibilite', icon: Wheelchair, bg: 'bg-cyan-50', iconColor: 'text-cyan-600', mode: 'access' },
];

const MoreTaxiServicesPage = () => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container min-h-screen bg-white" data-testid="moretaxi-page">
      <div className="bg-[#FF4500] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-white" data-testid="moretaxi-back-btn">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-lg">Plus de Services VTC</h1>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-3 gap-5">
          {moreTaxiServices.map((service) => {
            const Icon = service.icon;
            return (
              <button
                key={service.id}
                onClick={() => navigate(`/course?mode=${service.mode}`)}
                className="flex flex-col items-center gap-2 group"
                data-testid={`moretaxi-${service.id}`}
              >
                <div className={`w-[80px] h-[80px] rounded-2xl ${service.bg} flex items-center justify-center group-hover:scale-105 transition-transform border border-gray-100`}>
                  <Icon size={32} weight="duotone" className={service.iconColor} />
                </div>
                <span className="text-xs font-semibold text-gray-700 text-center leading-tight whitespace-pre-line">{service.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MoreTaxiServicesPage;
