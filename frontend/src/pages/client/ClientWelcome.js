import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowRight } from '@phosphor-icons/react';

const slides = [
  {
    image: '/vtc-car.jpg',
    title: 'Bienvenue dans l\'application client',
    desc: 'Réservez votre chauffeur en un clic !',
  },
  {
    image: '/vtc-car.jpg',
    title: 'Livraison rapide',
    desc: 'Colis, repas, courses — livrés à votre porte.',
  },
  {
    image: '/vtc-car.jpg',
    title: 'Services à la demande',
    desc: 'Beauté, ménage, plomberie et plus encore.',
  },
  {
    image: '/vtc-car.jpg',
    title: 'Paiement sécurisé',
    desc: 'Portefeuille intégré et suivi en temps réel.',
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
        <div className="absolute bottom-16 flex flex-col items-center gap-1">
          <p className="text-base font-bold tracking-[0.25em] text-gray-700">
            SB DRIVE <span className="text-[#FF4500]">CLIENT</span>
          </p>
        </div>
      </div>
    );
  }

  // ===== WELCOME CAROUSEL (V3Cube style) =====
  const slide = slides[currentSlide];
  return (
    <div className="mobile-container min-h-screen bg-white flex flex-col" data-testid="welcome-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5">
        <p className="text-sm font-extrabold tracking-wide">
          <span className="text-gray-900">SB DRIVE</span>{' '}
          <span className="text-[#FF4500]">CLIENT</span>
        </p>
        <div className="flex gap-2">
          <div className="flex items-center gap-1 bg-[#FF4500] text-white px-3 py-1.5 rounded-md text-xs font-bold">
            FR
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
          </div>
          <div className="flex items-center gap-1 bg-[#FF4500] text-white px-3 py-1.5 rounded-md text-xs font-bold">
            EUR
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>
      </div>

      {/* Car Image */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm mb-6">
          <img
            src={slide.image}
            alt="SB Drive VTC"
            className="w-full h-48 object-cover rounded-2xl"
            data-testid="welcome-car-image"
          />
        </div>
        <h2 className="text-xl font-bold text-gray-900 text-center" data-testid="welcome-title">
          {slide.title}
        </h2>
        <p className="text-gray-500 text-center mt-2 max-w-xs leading-relaxed">
          {slide.desc}
        </p>
      </div>

      {/* Bottom: Dots + Arrow */}
      <div className="flex items-center justify-between px-6 pb-8">
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${i === currentSlide ? 'w-7 bg-[#FF4500]' : 'w-5 bg-gray-300'}`}
            />
          ))}
        </div>
        <button
          onClick={nextSlide}
          className="w-14 h-14 rounded-xl bg-[#FF4500] flex items-center justify-center shadow-lg hover:bg-[#E03D00] transition-colors border-2 border-[#FF4500]"
          data-testid="welcome-next-btn"
        >
          <ArrowRight size={24} className="text-white" />
        </button>
      </div>
    </div>
  );
};

export default ClientWelcome;
