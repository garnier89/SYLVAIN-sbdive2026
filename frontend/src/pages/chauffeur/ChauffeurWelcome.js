import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SteeringWheel, ArrowRight, CurrencyEur, Clock, Star } from '@phosphor-icons/react';

const ChauffeurWelcome = () => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container min-h-screen bg-gray-950 flex flex-col">
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Logo */}
        <div className="w-24 h-24 rounded-3xl bg-amber-500 flex items-center justify-center shadow-xl shadow-amber-500/25 mb-6">
          <SteeringWheel size={52} weight="duotone" className="text-white" />
        </div>
        
        <h1 className="text-3xl font-bold text-white tracking-tight">SB Drive</h1>
        <p className="text-lg text-amber-500 font-medium mt-1">Chauffeur</p>
        
        <p className="text-gray-400 text-center mt-4 max-w-xs leading-relaxed">
          Conduisez, livrez et gagnez de l'argent. Rejoignez la communauté des chauffeurs SB Drive.
        </p>

        {/* Features */}
        <div className="mt-8 space-y-3 w-full max-w-xs">
          <div className="flex items-center gap-3 text-gray-300">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <CurrencyEur size={20} className="text-amber-500" />
            </div>
            <span className="text-sm">Gagnez selon vos disponibilités</span>
          </div>
          <div className="flex items-center gap-3 text-gray-300">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Clock size={20} className="text-amber-500" />
            </div>
            <span className="text-sm">Horaires flexibles, pas de contraintes</span>
          </div>
          <div className="flex items-center gap-3 text-gray-300">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Star size={20} className="text-amber-500" />
            </div>
            <span className="text-sm">Courses VTC, livraisons, services</span>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="px-6 pb-8 space-y-3">
        <button
          onClick={() => navigate('/chauffeur/login')}
          className="w-full h-14 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-lg font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-amber-500/25"
          data-testid="chauffeur-login-btn"
        >
          Se connecter <ArrowRight size={20} />
        </button>
        <button
          onClick={() => navigate('/chauffeur/register')}
          className="w-full h-14 rounded-2xl border-2 border-gray-700 text-gray-300 text-lg font-semibold flex items-center justify-center gap-2 hover:border-amber-500 hover:text-amber-500 transition-colors"
          data-testid="chauffeur-register-btn"
        >
          Devenir chauffeur
        </button>
        <p className="text-center text-xs text-gray-500 pt-2">
          Vous êtes passager ?{' '}
          <button onClick={() => navigate('/')} className="text-amber-500 font-medium" data-testid="switch-to-client-link">
            SB Drive Client
          </button>
        </p>
      </div>
    </div>
  );
};

export default ChauffeurWelcome;
