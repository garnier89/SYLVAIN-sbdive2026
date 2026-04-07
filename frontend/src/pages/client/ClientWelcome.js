import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowRight, Car, Package, Wrench, Wallet, ShieldCheck } from '@phosphor-icons/react';

const slides = [
  {
    icon: ShieldCheck,
    iconColor: 'text-[#4a9eff]',
    iconBg: 'bg-blue-100',
    title: 'Connexion intelligente. Rapide & sécurisée',
    desc: 'Vous pouvez vous connecter à l\'app de la même manière que vous déverrouillez votre appareil.',
  },
  {
    icon: Car,
    iconColor: 'text-[#FF4500]',
    iconBg: 'bg-orange-100',
    title: 'Réservez votre chauffeur VTC',
    desc: 'Commandez un chauffeur en un clic, suivez votre trajet en temps réel.',
  },
  {
    icon: Package,
    iconColor: 'text-purple-500',
    iconBg: 'bg-purple-100',
    title: 'Livraison rapide & fiable',
    desc: 'Colis, repas, courses, médicaments — livrés directement à votre porte.',
  },
  {
    icon: Wrench,
    iconColor: 'text-emerald-500',
    iconBg: 'bg-emerald-100',
    title: 'Services à la demande',
    desc: 'Beauté, ménage, plomberie, mécanique et bien plus encore.',
  },
  {
    icon: Wallet,
    iconColor: 'text-amber-500',
    iconBg: 'bg-amber-100',
    title: 'Paiement sécurisé & portefeuille',
    desc: 'Portefeuille intégré, suivi en temps réel, parrainage et coupons.',
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
    const timer = setTimeout(() => setPhase('welcome'), 2200);
    return () => clearTimeout(timer);
  }, [user, navigate]);

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      navigate('/login');
    }
  };

  // ===== SPLASH SCREEN =====
  if (phase === 'splash') {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center relative" data-testid="splash-screen">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <img
            src="/sb-logo.jpg"
            alt="SB Drive"
            className="w-44 h-44 object-contain"
            data-testid="splash-logo"
          />
        </div>
        {/* Loading dots */}
        <div className="absolute bottom-24 flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#4a9eff] animate-pulse" />
          <div className="w-2 h-2 rounded-full bg-gray-300" />
          <div className="w-2 h-2 rounded-full bg-gray-300" />
        </div>
        <div className="absolute bottom-14 flex flex-col items-center gap-1">
          <p className="text-base font-bold tracking-[0.25em] text-gray-700">
            SB DRIVE <span className="text-[#FF4500]">CLIENT</span>
          </p>
        </div>
      </div>
    );
  }

  // ===== ONBOARDING CAROUSEL (V3Cube style) =====
  const slide = slides[currentSlide];
  const SlideIcon = slide.icon;

  return (
    <div className="mobile-container min-h-screen bg-white flex flex-col" data-testid="welcome-screen">
      {/* Header - V3Cube style */}
      <div className="flex items-center justify-between px-5 pt-5">
        <p className="text-sm font-extrabold tracking-wide">
          <span className="text-gray-900">SB DRIVE</span>{' '}
          <span className="text-[#FF4500]">CLIENT</span>
        </p>
        <div className="flex gap-2">
          <div className="flex items-center gap-1 bg-[#4a9eff] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm" data-testid="lang-selector">
            FR
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
          </div>
          <div className="flex items-center gap-1 bg-[#4a9eff] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm" data-testid="currency-selector">
            EUR
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>
      </div>

      {/* Illustration Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        {/* Large icon illustration */}
        <div className={`w-40 h-40 rounded-full ${slide.iconBg} flex items-center justify-center mb-8 shadow-lg`}>
          <SlideIcon size={72} weight="duotone" className={slide.iconColor} />
        </div>

        <h2 className="text-xl font-bold text-gray-900 text-center leading-snug" data-testid="welcome-title">
          {slide.title}
        </h2>
        <p className="text-gray-500 text-sm text-center mt-3 max-w-xs leading-relaxed">
          {slide.desc}
        </p>
      </div>

      {/* Bottom: Dots + Arrow - V3Cube style */}
      <div className="flex items-center justify-between px-6 pb-8">
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentSlide ? 'w-8 bg-[#4a9eff]' : 'w-4 bg-gray-300'
              }`}
            />
          ))}
        </div>
        <button
          onClick={nextSlide}
          className="w-14 h-14 rounded-xl bg-[#4a9eff] flex items-center justify-center shadow-lg shadow-blue-400/30 hover:bg-[#3a8eef] transition-colors"
          data-testid="welcome-next-btn"
        >
          <ArrowRight size={24} className="text-white" weight="bold" />
        </button>
      </div>
    </div>
  );
};

export default ClientWelcome;
