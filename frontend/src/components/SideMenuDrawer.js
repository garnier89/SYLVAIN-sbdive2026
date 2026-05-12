import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  X, House, Car, Wallet, User, Gift, ShareNetwork, Heart, Question,
  SignOut, Bank, Star, MapPin, ListChecks
} from '@phosphor-icons/react';

/**
 * Slide-in side menu drawer for clients and drivers.
 * Displays profile header + a list of quick-access items.
 *
 * Props:
 *   - open: boolean
 *   - onClose: () => void
 *   - variant: 'user' | 'driver'  (controls which sections are shown)
 */
const SideMenuDrawer = ({ open, onClose, variant = 'user' }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  if (!open) return null;

  const go = (path) => { onClose(); navigate(path); };

  const userItems = [
    { icon: House,        label: 'Accueil',           path: '/home' },
    { icon: ListChecks,   label: 'Mes réservations',  path: '/history' },
    { icon: Bank,         label: 'SB PayGo / Finance',path: '/finance', highlight: true },
    { icon: Wallet,       label: 'Portefeuille',      path: '/wallet' },
    { icon: Star,         label: 'Chauffeurs favoris',path: '/favorite-drivers' },
    { icon: Gift,         label: 'Cartes cadeaux',    path: '/giftcards' },
    { icon: ShareNetwork, label: 'Parrainage',        path: '/referral' },
    { icon: Heart,        label: 'Faire un don',      path: '/donation' },
    { icon: MapPin,       label: 'Sécurité / SOS',    path: '/safety' },
    { icon: Question,     label: 'Aide & Support',    path: '/support' },
    { icon: User,         label: 'Mon profil',        path: '/profile' },
  ];

  const driverItems = [
    { icon: House,        label: 'Accueil',           path: '/chauffeur/home' },
    { icon: Car,          label: 'Mes courses',       path: '/chauffeur/history' },
    { icon: Bank,         label: 'SB PayGo / Finance',path: '/finance', highlight: true },
    { icon: Wallet,       label: 'Portefeuille',      path: '/chauffeur/wallet' },
    { icon: Star,         label: 'Récompenses',       path: '/chauffeur/rewards' },
    { icon: ListChecks,   label: 'Mes documents',     path: '/chauffeur/documents' },
    { icon: Question,     label: 'Support',           path: '/chauffeur/livechat' },
    { icon: User,         label: 'Mon profil',        path: '/chauffeur/profile' },
  ];

  const items = variant === 'driver' ? driverItems : userItems;

  const handleLogout = async () => {
    try { await logout(); } catch { /* ignore */ }
    onClose();
    navigate('/');
  };

  return (
    <div className="fixed inset-0 z-[2000]" data-testid="side-menu-drawer">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside
        className="absolute left-0 top-0 bottom-0 w-[82%] max-w-[340px] bg-white shadow-2xl flex flex-col animate-slide-in"
        style={{ animation: 'slide-in 0.25s ease-out' }}
      >
        {/* Profile header */}
        <div className="bg-gradient-to-br from-[#FF4500] to-orange-500 px-5 pt-6 pb-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <p className="font-bold truncate">{user?.name || 'Utilisateur'}</p>
                <p className="text-xs text-white/80 truncate">{user?.email || ''}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="close-side-menu-btn">
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>

        {/* Items */}
        <nav className="flex-1 overflow-y-auto py-2">
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => go(it.path)}
              className={`w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors ${it.highlight ? 'bg-indigo-50/40' : ''}`}
              data-testid={`side-menu-${it.path.replace(/\//g, '-')}-btn`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${it.highlight ? 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white' : 'bg-gray-100 text-gray-700'}`}>
                <it.icon size={20} weight={it.highlight ? 'fill' : 'duotone'} />
              </div>
              <span className={`text-sm font-medium ${it.highlight ? 'text-indigo-700' : 'text-gray-800'}`}>
                {it.label}
                {it.highlight && <span className="ml-2 inline-block text-[9px] font-bold uppercase bg-indigo-600 text-white px-1.5 py-0.5 rounded">Nouveau</span>}
              </span>
            </button>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className="m-4 flex items-center justify-center gap-2 py-3 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50"
          data-testid="side-menu-logout-btn"
        >
          <SignOut size={16} weight="bold" />
          Déconnexion
        </button>
      </aside>

      <style>{`
        @keyframes slide-in {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};

export default SideMenuDrawer;
