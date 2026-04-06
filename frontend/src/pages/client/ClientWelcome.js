import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Car, ShieldCheck, MapPin, Bell, ArrowRight } from '@phosphor-icons/react';

const slides = [
  {
    title: 'Connexion rapide & sécurisée',
    desc: 'Connectez-vous facilement avec votre email ou votre compte Google.',
    icon: ShieldCheck,
    bg: 'bg-blue-50',
    iconBg: 'bg-blue-500',
  },
  {
    title: 'Réservez en un clic',
    desc: 'VTC, moto, livraison de colis et repas — tous vos services en un seul endroit.',
    icon: Car,
    iconBg: 'bg-[#00C853]',
    bg: 'bg-emerald-50',
  },
  {
    title: 'Suivi en temps réel',
    desc: 'Suivez votre chauffeur ou votre livraison en direct sur la carte.',
    icon: MapPin,
    iconBg: 'bg-orange-500',
    bg: 'bg-orange-50',
  },
  {
    title: 'Notifications instantanées',
    desc: 'Restez informé à chaque étape de votre course ou commande.',
    icon: Bell,
    iconBg: 'bg-purple-500',
    bg: 'bg-purple-50',
  },
];

const ClientWelcome = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [phase, setPhase] = useState('splash');
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (user) {
      navigate('/home');
      return;
    }
    const timer = setTimeout(() => setPhase('onboarding'), 2200);
    return () => clearTimeout(timer);
  }, [user, navigate]);

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      setPhase('login');
    }
  };

  // ===== SPLASH SCREEN =====
  if (phase === 'splash') {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center relative" data-testid="splash-screen">
        <div className="flex flex-col items-center gap-2 animate-fade-in">
          <h1 className="text-5xl font-bold text-blue-600 italic tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
            SB Drive
          </h1>
        </div>
        <div className="absolute bottom-16 flex flex-col items-center gap-2">
          <p className="text-base font-bold tracking-widest text-gray-800">
            CLIENT <span className="text-blue-600">APP</span>
          </p>
          <div className="flex gap-1.5 mt-1">
            <div className="w-2 h-2 rounded-full bg-gray-300" />
            <div className="w-2 h-2 rounded-full bg-gray-300" />
            <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
          </div>
        </div>
      </div>
    );
  }

  // ===== ONBOARDING CAROUSEL =====
  if (phase === 'onboarding') {
    const slide = slides[currentSlide];
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col" data-testid="onboarding-screen">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5">
          <p className="text-sm font-bold">
            <span className="text-gray-900">CLIENT</span>{' '}
            <span className="text-blue-600">APP</span>
          </p>
          <button
            onClick={() => setPhase('login')}
            className="text-sm text-blue-600 font-medium"
            data-testid="skip-onboarding-btn"
          >
            Passer
          </button>
        </div>

        {/* Slide Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className={`w-48 h-48 rounded-full ${slide.bg} flex items-center justify-center mb-8`}>
            <div className={`w-24 h-24 rounded-3xl ${slide.iconBg} flex items-center justify-center shadow-lg`}>
              <slide.icon size={48} weight="duotone" className="text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 text-center">{slide.title}</h2>
          <p className="text-gray-500 text-center mt-3 max-w-xs leading-relaxed">{slide.desc}</p>
        </div>

        {/* Bottom: Dots + Arrow */}
        <div className="flex items-center justify-between px-6 pb-8">
          <div className="flex gap-2">
            {slides.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all ${i === currentSlide ? 'w-6 bg-blue-600' : 'w-4 bg-gray-300'}`}
              />
            ))}
          </div>
          <button
            onClick={nextSlide}
            className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center shadow-lg hover:bg-blue-700 transition-colors"
            data-testid="onboarding-next-btn"
          >
            <ArrowRight size={24} className="text-white" />
          </button>
        </div>
      </div>
    );
  }

  // ===== LOGIN CHOICE =====
  return (
    <div className="mobile-container min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-20 h-20 rounded-3xl bg-[#00C853] flex items-center justify-center shadow-xl shadow-[#00C853]/25 mb-4">
          <Car size={44} weight="duotone" className="text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">SB Drive</h1>
        <p className="text-lg text-[#00C853] font-medium mt-1">Client</p>
        <p className="text-gray-500 text-center mt-4 max-w-xs leading-relaxed">
          Réservez un VTC, commandez des repas, envoyez des colis et accédez à tous les services.
        </p>
      </div>
      <div className="px-6 pb-8 space-y-3">
        <button onClick={() => navigate('/login')} className="w-full h-14 rounded-2xl bg-[#00C853] hover:bg-[#009624] text-white text-lg font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[#00C853]/25" data-testid="client-login-btn">
          Se connecter
        </button>
        <button onClick={() => navigate('/register')} className="w-full h-14 rounded-2xl border-2 border-gray-200 text-gray-700 text-lg font-semibold flex items-center justify-center gap-2 hover:border-[#00C853] hover:text-[#00C853] transition-colors" data-testid="client-register-btn">
          Créer un compte
        </button>
        <p className="text-center text-xs text-gray-400 pt-2">
          Vous êtes chauffeur ?{' '}
          <button onClick={() => navigate('/chauffeur')} className="text-[#00C853] font-medium" data-testid="switch-to-chauffeur-link">SB Drive Chauffeur</button>
        </p>
      </div>
    </div>
  );
};

export default ClientWelcome;
