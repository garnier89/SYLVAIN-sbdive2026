import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Car, SteeringWheel, ArrowRight } from '@phosphor-icons/react';

const AppSelector = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // If already logged in, redirect based on role
  React.useEffect(() => {
    if (user) {
      const redirects = { user: '/', driver: '/driver', merchant: '/merchant', admin: '/admin', dispatcher: '/dispatcher' };
      navigate(redirects[user.role] || '/');
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-20 h-20 rounded-3xl bg-[#00C853] flex items-center justify-center shadow-lg shadow-[#00C853]/30">
            <Car size={44} weight="duotone" className="text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight font-['Outfit']">SB Drive</h1>
          <p className="text-gray-400 text-lg">VTC & Services</p>
        </div>

        {/* App Selection */}
        <div className="space-y-4">
          {/* SB Drive Client */}
          <button
            onClick={() => navigate('/login?app=client')}
            className="w-full group relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-6 text-left transition-all hover:bg-white/10 hover:border-[#00C853]/50 hover:shadow-lg hover:shadow-[#00C853]/10"
            data-testid="select-client-app"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#00C853]/10 flex items-center justify-center flex-shrink-0">
                <Car size={32} weight="duotone" className="text-[#00C853]" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-white">SB Drive Client</h2>
                <p className="text-gray-400 text-sm mt-1">Réservez un VTC, commandez des repas, envoyez des colis</p>
              </div>
              <ArrowRight size={24} className="text-gray-500 group-hover:text-[#00C853] transition-colors flex-shrink-0" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400 border border-white/10">VTC</span>
              <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400 border border-white/10">Repas</span>
              <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400 border border-white/10">Colis</span>
              <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400 border border-white/10">Services</span>
            </div>
          </button>

          {/* SB Drive Chauffeur */}
          <button
            onClick={() => navigate('/login?app=chauffeur')}
            className="w-full group relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-6 text-left transition-all hover:bg-white/10 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10"
            data-testid="select-chauffeur-app"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <SteeringWheel size={32} weight="duotone" className="text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-white">SB Drive Chauffeur</h2>
                <p className="text-gray-400 text-sm mt-1">Conduisez, livrez et gagnez de l'argent</p>
              </div>
              <ArrowRight size={24} className="text-gray-500 group-hover:text-amber-500 transition-colors flex-shrink-0" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400 border border-white/10">Courses VTC</span>
              <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400 border border-white/10">Livraisons</span>
              <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400 border border-white/10">Services</span>
            </div>
          </button>
        </div>

        {/* Merchant / Admin links */}
        <div className="flex justify-center gap-6 text-sm">
          <button
            onClick={() => navigate('/login?app=merchant')}
            className="text-gray-500 hover:text-white transition-colors"
            data-testid="select-merchant-link"
          >
            Espace Marchand
          </button>
          <span className="text-gray-700">|</span>
          <button
            onClick={() => navigate('/login?app=admin')}
            className="text-gray-500 hover:text-white transition-colors"
            data-testid="select-admin-link"
          >
            Administration
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 text-xs">
          SB Drive VTC &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};

export default AppSelector;
