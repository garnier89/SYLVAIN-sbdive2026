import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Car } from '@phosphor-icons/react';

const ClientWelcome = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    if (user) {
      navigate('/home');
      return;
    }
    const timer = setTimeout(() => setShowSplash(false), 2200);
    return () => clearTimeout(timer);
  }, [user, navigate]);

  // Splash Screen — like XJekPlus "USER APP"
  if (showSplash) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center relative" data-testid="splash-screen">
        <div className="flex flex-col items-center gap-2 animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-[#00C853] flex items-center justify-center mb-2">
            <Car size={36} weight="duotone" className="text-white" />
          </div>
          <h1 className="text-4xl font-bold text-[#00C853] tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
            SB Drive
          </h1>
        </div>
        <div className="absolute bottom-16 flex flex-col items-center gap-2">
          <p className="text-base font-bold tracking-widest text-gray-800">
            CLIENT <span className="text-[#00C853]">APP</span>
          </p>
          <div className="flex gap-1.5 mt-1">
            <div className="w-2 h-2 rounded-full bg-gray-300" />
            <div className="w-2 h-2 rounded-full bg-gray-300" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#00C853]" />
          </div>
        </div>
      </div>
    );
  }

  // Login / Register Choice
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
