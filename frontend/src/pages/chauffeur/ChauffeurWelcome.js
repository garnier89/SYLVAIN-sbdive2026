import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowRight, SteeringWheel, CurrencyEur, Clock, MapPin, Star } from '@phosphor-icons/react';

const slides = [
  { icon: SteeringWheel, iconColor: 'text-amber-500', iconBg: 'bg-amber-100',
    title: 'Conduisez et gagnez', desc: 'Acceptez des courses VTC, livraisons et services. Gagnez selon vos disponibilit\u00e9s.' },
  { icon: CurrencyEur, iconColor: 'text-emerald-500', iconBg: 'bg-emerald-100',
    title: 'Gains flexibles', desc: 'Pas de contraintes horaires. Vous d\u00e9cidez quand travailler et combien gagner.' },
  { icon: MapPin, iconColor: 'text-blue-500', iconBg: 'bg-blue-100',
    title: 'Navigation int\u00e9gr\u00e9e', desc: 'Suivi GPS en temps r\u00e9el, itin\u00e9raire optimis\u00e9 et assignation automatique des courses.' },
  { icon: Star, iconColor: 'text-purple-500', iconBg: 'bg-purple-100',
    title: 'Communaut\u00e9 de confiance', desc: 'Recevez des \u00e9valuations, b\u00e2tissez votre r\u00e9putation et augmentez vos revenus.' },
];

const ChauffeurWelcome = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [phase, setPhase] = useState('splash');
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (user && user.role === 'driver') { navigate('/chauffeur/home'); return; }
    if (!loading) {
      const timer = setTimeout(() => setPhase('welcome'), 600);
      return () => clearTimeout(timer);
    }
  }, [user, loading, navigate]);

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) setCurrentSlide(currentSlide + 1);
    else navigate('/chauffeur/login');
  };

  if (phase === 'splash') {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center relative" data-testid="chauffeur-splash">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <img src="/sb-logo.jpg" alt="SB Drive" className="w-44 h-44 object-contain" data-testid="chauffeur-splash-logo" />
        </div>
        <div className="absolute bottom-24 flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          <div className="w-2 h-2 rounded-full bg-gray-300" />
          <div className="w-2 h-2 rounded-full bg-gray-300" />
        </div>
        <div className="absolute bottom-14 flex flex-col items-center gap-1">
          <p className="text-base font-bold tracking-[0.25em] text-gray-700">
            SB DRIVE <span className="text-amber-500">CHAUFFEUR</span>
          </p>
        </div>
      </div>
    );
  }

  const slide = slides[currentSlide];
  const SlideIcon = slide.icon;
  return (
    <div className="mobile-container min-h-screen bg-gray-950 flex flex-col" data-testid="chauffeur-welcome">
      <div className="flex items-center justify-between px-5 pt-5">
        <p className="text-sm font-extrabold tracking-wide">
          <span className="text-gray-100">SB DRIVE</span>{' '}
          <span className="text-amber-500">CHAUFFEUR</span>
        </p>
        <button onClick={() => navigate('/chauffeur/login')} className="text-amber-500 text-xs font-bold" data-testid="skip-btn">
          Passer
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className={`w-40 h-40 rounded-full ${slide.iconBg} flex items-center justify-center mb-8 shadow-lg`}>
          <SlideIcon size={72} weight="duotone" className={slide.iconColor} />
        </div>
        <h2 className="text-xl font-bold text-white text-center leading-snug" data-testid="welcome-title">{slide.title}</h2>
        <p className="text-gray-400 text-sm text-center mt-3 max-w-xs leading-relaxed">{slide.desc}</p>
      </div>
      <div className="flex items-center justify-between px-6 pb-8">
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === currentSlide ? 'w-8 bg-amber-500' : 'w-4 bg-gray-700'}`} />
          ))}
        </div>
        <button onClick={nextSlide}
          className="w-14 h-14 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-400/30 hover:bg-amber-600 transition-colors"
          data-testid="welcome-next-btn">
          <ArrowRight size={24} className="text-white" weight="bold" />
        </button>
      </div>
    </div>
  );
};

export default ChauffeurWelcome;
