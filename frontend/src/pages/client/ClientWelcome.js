import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, ArrowRight, MapPin, ShieldCheck, Star } from '@phosphor-icons/react';

const ClientWelcome = () => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container min-h-screen bg-white flex flex-col">
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Logo */}
        <div className="w-24 h-24 rounded-3xl bg-[#00C853] flex items-center justify-center shadow-xl shadow-[#00C853]/25 mb-6">
          <Car size={52} weight="duotone" className="text-white" />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">SB Drive</h1>
        <p className="text-lg text-[#00C853] font-medium mt-1">Client</p>
        
        <p className="text-gray-500 text-center mt-4 max-w-xs leading-relaxed">
          Réservez un VTC, commandez des repas, envoyez des colis et accédez à tous les services dont vous avez besoin.
        </p>

        {/* Features */}
        <div className="mt-8 space-y-3 w-full max-w-xs">
          <div className="flex items-center gap-3 text-gray-600">
            <div className="w-10 h-10 rounded-xl bg-[#00C853]/10 flex items-center justify-center flex-shrink-0">
              <MapPin size={20} className="text-[#00C853]" />
            </div>
            <span className="text-sm">VTC, Moto, Colis — Partout en ville</span>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <div className="w-10 h-10 rounded-xl bg-[#00C853]/10 flex items-center justify-center flex-shrink-0">
              <Star size={20} className="text-[#00C853]" />
            </div>
            <span className="text-sm">Repas, services à la demande, beauté...</span>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <div className="w-10 h-10 rounded-xl bg-[#00C853]/10 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={20} className="text-[#00C853]" />
            </div>
            <span className="text-sm">Paiement sécurisé & suivi en temps réel</span>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="px-6 pb-8 space-y-3">
        <button
          onClick={() => navigate('/login')}
          className="w-full h-14 rounded-2xl bg-[#00C853] hover:bg-[#009624] text-white text-lg font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[#00C853]/25"
          data-testid="client-login-btn"
        >
          Se connecter <ArrowRight size={20} />
        </button>
        <button
          onClick={() => navigate('/register')}
          className="w-full h-14 rounded-2xl border-2 border-gray-200 text-gray-700 text-lg font-semibold flex items-center justify-center gap-2 hover:border-[#00C853] hover:text-[#00C853] transition-colors"
          data-testid="client-register-btn"
        >
          Créer un compte
        </button>
        <p className="text-center text-xs text-gray-400 pt-2">
          Vous êtes chauffeur ?{' '}
          <button onClick={() => navigate('/chauffeur')} className="text-[#00C853] font-medium" data-testid="switch-to-chauffeur-link">
            SB Drive Chauffeur
          </button>
        </p>
      </div>
    </div>
  );
};

export default ClientWelcome;
