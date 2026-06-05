import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, CaretDown } from '@phosphor-icons/react';
import GooglePlacesInput from '../components/GooglePlacesInput';
import {
  SB_LOGO, StoreLinks,
  HowItWorksSection, PoolBusinessSection, ServicesSection, WhySection,
  SecuritySection, PhoneSection, RegisterSection, LandingFooter,
} from './landing/LandingSections';

const LandingPage = () => {
  const navigate = useNavigate();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [pickupData, setPickupData] = useState(null);
  const [dropoffData, setDropoffData] = useState(null);

  const handleBookNow = () => {
    const params = new URLSearchParams();
    if (pickupData) { params.set('plat', pickupData.lat); params.set('plng', pickupData.lng); params.set('paddr', pickupData.address); }
    if (dropoffData) { params.set('dlat', dropoffData.lat); params.set('dlng', dropoffData.lng); params.set('daddr', dropoffData.address); }
    navigate(`/login?redirect=/ride${params.toString() ? '?' + params.toString() : ''}`);
  };

  return (
    <div className="min-h-screen bg-white" data-testid="landing-page">
      {/* ===== NAVBAR ===== */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm" data-testid="landing-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src={SB_LOGO} alt="SB Drive VTC" className="h-10 w-auto" data-testid="nav-logo" />
            </div>
            <div className="hidden md:flex items-center gap-6">
              <a href="#how-it-works" className="text-sm text-gray-600 hover:text-[#FF5000] transition-colors font-medium">Comment ca marche</a>
              <a href="#services" className="text-sm text-gray-600 hover:text-[#FF5000] transition-colors font-medium">Services</a>
              <a href="#security" className="text-sm text-gray-600 hover:text-[#FF5000] transition-colors font-medium">Securite</a>
              <a href="#register" className="text-sm text-gray-600 hover:text-[#FF5000] transition-colors font-medium">Inscription</a>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <button onClick={() => navigate('/login')} className="text-sm font-medium text-gray-700 hover:text-[#FF5000] px-4 py-2" data-testid="nav-login">Connexion</button>
              <button onClick={() => navigate('/login')} className="text-sm font-bold text-white bg-[#FF5000] hover:bg-[#cc4000] px-5 py-2.5 rounded-full transition-colors" data-testid="nav-signup">Reserver</button>
            </div>
            <button className="md:hidden p-2" onClick={() => setMobileMenu(!mobileMenu)} data-testid="mobile-menu-btn">
              <CaretDown size={20} className={`text-gray-600 transition-transform ${mobileMenu ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {mobileMenu && (
            <div className="md:hidden pb-4 space-y-2 border-t border-gray-100 pt-3">
              <a href="#how-it-works" className="block px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50">Comment ca marche</a>
              <a href="#services" className="block px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50">Services</a>
              <a href="#security" className="block px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50">Securite</a>
              <a href="#register" className="block px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50">Inscription</a>
              <button onClick={() => navigate('/login')} className="w-full text-sm font-bold text-white bg-[#FF5000] px-5 py-2.5 rounded-full mt-2">Reserver maintenant</button>
            </div>
          )}
        </div>
      </nav>

      {/* ===== HERO - BOOKING FORM ===== */}
      <section className="pt-20 pb-16 sm:pt-24 sm:pb-20 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 relative overflow-hidden" data-testid="hero-section">
        <div className="absolute inset-0 opacity-[0.07]">
          <div className="absolute top-20 left-10 w-72 h-72 bg-[#FF5000] rounded-full blur-[120px]" />
          <div className="absolute bottom-10 right-20 w-80 h-80 bg-orange-400 rounded-full blur-[150px]" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight" data-testid="hero-title">
                RESERVER UN TRAJET
              </h1>
              <p className="mt-4 text-lg text-gray-400 leading-relaxed max-w-lg">
                Chauffeurs pro, trajets surs. Reservez en quelques clics.
              </p>

              {/* Booking Form */}
              <div className="mt-8 bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10" data-testid="booking-form">
                <div className="space-y-3">
                  <GooglePlacesInput placeholder="Saisissez l'adresse de depart" iconColor="#22C55E" onSelect={setPickupData} darkMode testId="pickup-input" />
                  <GooglePlacesInput placeholder="Saisissez l'adresse d'arrivee" iconColor="#EF4444" onSelect={setDropoffData} darkMode testId="dropoff-input" />
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={handleBookNow} className="flex-1 bg-[#FF5000] hover:bg-[#cc4000] text-white font-bold py-3 rounded-xl transition-colors text-sm" data-testid="book-now-btn">
                    Reserver maintenant
                  </button>
                  <button onClick={handleBookNow} className="flex-1 bg-white/10 hover:bg-white/15 text-white font-medium py-3 rounded-xl border border-white/20 transition-colors text-sm" data-testid="estimate-btn">
                    Estimation de tarif
                  </button>
                </div>
              </div>

              {/* App Store Links */}
              <div className="mt-6 flex items-center gap-4">
                <StoreLinks size="h-10" />
              </div>
            </div>

            {/* Phone Mockup */}
            <div className="hidden lg:flex justify-center">
              <div className="relative w-[300px] h-[580px] bg-gray-800 rounded-[3rem] border-4 border-gray-700 shadow-2xl overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-gray-800 rounded-b-2xl z-10" />
                <div className="w-full h-full bg-gradient-to-b from-gray-900 to-gray-950 flex flex-col items-center justify-center text-center p-6">
                  <img src={SB_LOGO} alt="SB Drive" className="w-24 h-24 object-contain mb-4" />
                  <p className="text-white text-lg font-bold">SB Drive VTC</p>
                  <p className="text-gray-400 text-xs mt-1">Martinique - Paris - Guadeloupe - Guyane</p>
                  <div className="mt-6 w-full space-y-2">
                    <div className="bg-white/5 rounded-xl p-3 text-left flex items-center gap-2">
                      <MapPin size={16} className="text-green-400" weight="fill" />
                      <span className="text-gray-400 text-xs">Fort-de-France</span>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-left flex items-center gap-2">
                      <MapPin size={16} className="text-red-400" weight="fill" />
                      <span className="text-gray-400 text-xs">Aeroport Aime Cesaire</span>
                    </div>
                    <div className="bg-[#FF5000] rounded-xl p-3 text-center mt-2">
                      <span className="text-white text-sm font-bold">Reserver</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <HowItWorksSection />
      <PoolBusinessSection navigate={navigate} />
      <ServicesSection />
      <WhySection />
      <SecuritySection />
      <PhoneSection />
      <RegisterSection navigate={navigate} />
      <LandingFooter navigate={navigate} />
    </div>
  );
};

export default LandingPage;
