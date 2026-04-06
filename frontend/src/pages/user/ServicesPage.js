import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Wrench, Broom, Lightning, Drop,
  PaintBrush, Scissors, Baby, ShieldCheck,
  ArrowLeft, MagnifyingGlass, MapPin,
  Clock, Star, CaretRight, Calendar
} from '@phosphor-icons/react';

const serviceCategories = [
  {
    id: 'plumbing', name: 'Plomberie', icon: Drop, color: 'bg-blue-500',
    services: [
      { id: 'leak_fix', name: 'Réparation fuite', price: 45, duration: '1-2h' },
      { id: 'drain', name: 'Débouchage canalisation', price: 55, duration: '1h' },
      { id: 'install_faucet', name: 'Installation robinet', price: 65, duration: '1-2h' },
    ]
  },
  {
    id: 'electrical', name: 'Électricité', icon: Lightning, color: 'bg-amber-500',
    services: [
      { id: 'outlet_repair', name: 'Réparation prise', price: 40, duration: '30min-1h' },
      { id: 'light_install', name: 'Installation luminaire', price: 50, duration: '1h' },
      { id: 'panel_check', name: 'Vérification tableau', price: 75, duration: '1-2h' },
    ]
  },
  {
    id: 'cleaning', name: 'Ménage', icon: Broom, color: 'bg-emerald-500',
    services: [
      { id: 'home_clean', name: 'Ménage maison', price: 60, duration: '2-3h' },
      { id: 'deep_clean', name: 'Nettoyage profond', price: 120, duration: '4-5h' },
      { id: 'office_clean', name: 'Nettoyage bureau', price: 80, duration: '2-3h' },
    ]
  },
  {
    id: 'painting', name: 'Peinture', icon: PaintBrush, color: 'bg-purple-500',
    services: [
      { id: 'room_paint', name: 'Peinture chambre', price: 150, duration: '4-6h' },
      { id: 'exterior', name: 'Peinture extérieure', price: 300, duration: '1-2 jours' },
    ]
  },
  {
    id: 'beauty', name: 'Coiffure & Beauté', icon: Scissors, color: 'bg-rose-500',
    services: [
      { id: 'haircut', name: 'Coupe à domicile', price: 35, duration: '45min' },
      { id: 'manicure', name: 'Manucure', price: 30, duration: '1h' },
      { id: 'facial', name: 'Soin du visage', price: 55, duration: '1h' },
    ]
  },
  {
    id: 'handyman', name: 'Bricolage', icon: Wrench, color: 'bg-orange-500',
    services: [
      { id: 'furniture', name: 'Montage meuble', price: 45, duration: '1-2h' },
      { id: 'shelf', name: 'Installation étagère', price: 35, duration: '30min-1h' },
      { id: 'lock_change', name: 'Changement serrure', price: 70, duration: '1h' },
    ]
  },
  {
    id: 'babysitting', name: 'Garde d\'enfants', icon: Baby, color: 'bg-pink-500',
    services: [
      { id: 'evening', name: 'Garde de soirée', price: 25, duration: '3-5h' },
      { id: 'weekend', name: 'Garde week-end', price: 80, duration: 'Journée' },
    ]
  },
  {
    id: 'security', name: 'Sécurité', icon: ShieldCheck, color: 'bg-gray-700',
    services: [
      { id: 'event_security', name: 'Sécurité événement', price: 120, duration: '4-8h' },
      { id: 'alarm_install', name: 'Installation alarme', price: 200, duration: '2-3h' },
    ]
  },
];

const ServicesPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [bookingStep, setBookingStep] = useState('browse');

  const filteredCategories = serviceCategories.filter(cat =>
    cat.name.toLowerCase().includes(search.toLowerCase()) ||
    cat.services.some(s => s.name.toLowerCase().includes(search.toLowerCase()))
  );

  const handleBookService = (service) => {
    setSelectedService(service);
    setBookingStep('confirm');
  };

  const handleConfirmBooking = () => {
    setBookingStep('booked');
    setTimeout(() => {
      navigate('/history');
    }, 3000);
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-6">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => {
          if (bookingStep === 'confirm') { setBookingStep('browse'); setSelectedService(null); }
          else if (selectedCategory) setSelectedCategory(null);
          else navigate('/');
        }} data-testid="services-back-btn">
          <ArrowLeft size={24} />
        </Button>
        <h1 className="font-bold text-lg">
          {bookingStep === 'confirm' ? 'Confirmer' : selectedCategory ? selectedCategory.name : 'Services à la demande'}
        </h1>
      </div>

      {/* Booking Confirmation */}
      {bookingStep === 'confirm' && selectedService && (
        <div className="p-4 space-y-4">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl ${selectedCategory?.color} flex items-center justify-center`}>
                  {selectedCategory && <selectedCategory.icon size={24} className="text-white" />}
                </div>
                <div>
                  <h3 className="font-bold text-lg">{selectedService.name}</h3>
                  <p className="text-sm text-gray-500">{selectedCategory?.name}</p>
                </div>
              </div>
              <div className="flex items-center justify-between py-3 border-t border-b">
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock size={18} />
                  <span className="text-sm">{selectedService.duration}</span>
                </div>
                <p className="text-2xl font-bold text-[#00C853]">{selectedService.price} &euro;</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                  <MapPin size={20} className="text-gray-400" />
                  <span className="text-sm text-gray-600">Votre adresse actuelle</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                  <Calendar size={20} className="text-gray-400" />
                  <span className="text-sm text-gray-600">Dès que possible</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Button
            className="w-full rounded-2xl h-14 bg-[#00C853] hover:bg-[#009624] text-white text-lg font-semibold"
            onClick={handleConfirmBooking}
            data-testid="confirm-service-btn"
          >
            Réserver &middot; {selectedService.price} &euro;
          </Button>
        </div>
      )}

      {/* Booking Success */}
      {bookingStep === 'booked' && (
        <div className="flex flex-col items-center justify-center h-[60vh] p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-[#00C853]/10 flex items-center justify-center mb-6">
            <Star size={40} className="text-[#00C853]" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Service réservé !</h2>
          <p className="text-gray-500">Un prestataire vous sera assigné sous peu. Vous recevrez une notification de confirmation.</p>
        </div>
      )}

      {/* Browse Categories / Services */}
      {bookingStep === 'browse' && (
        <div className="p-4 space-y-4">
          {/* Search */}
          {!selectedCategory && (
            <div className="relative">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <Input
                placeholder="Rechercher un service..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 rounded-xl"
                data-testid="services-search-input"
              />
            </div>
          )}

          {/* Category Grid */}
          {!selectedCategory && (
            <div className="grid grid-cols-2 gap-3">
              {filteredCategories.map((cat) => (
                <Card
                  key={cat.id}
                  className="cursor-pointer hover:shadow-md transition-all"
                  onClick={() => setSelectedCategory(cat)}
                  data-testid={`service-cat-${cat.id}`}
                >
                  <CardContent className="p-4 flex flex-col items-center gap-3 text-center">
                    <div className={`w-14 h-14 rounded-2xl ${cat.color} flex items-center justify-center`}>
                      <cat.icon size={28} className="text-white" />
                    </div>
                    <p className="font-semibold text-sm">{cat.name}</p>
                    <p className="text-xs text-gray-400">{cat.services.length} services</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Service List */}
          {selectedCategory && (
            <div className="space-y-3">
              {selectedCategory.services.map((service) => (
                <Card
                  key={service.id}
                  className="cursor-pointer hover:shadow-md transition-all"
                  onClick={() => handleBookService(service)}
                  data-testid={`service-item-${service.id}`}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{service.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm text-gray-500 flex items-center gap-1">
                          <Clock size={14} /> {service.duration}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-[#00C853]">{service.price} &euro;</p>
                      <CaretRight size={16} className="text-gray-400" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ServicesPage;
