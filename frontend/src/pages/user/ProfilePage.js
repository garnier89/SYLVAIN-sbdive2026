import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { walletAPI } from '../../services/api';
import {
  PencilSimple, ClipboardText, Wallet, CreditCard,
  EnvelopeSimple, CaretRight, User, Bell, ShoppingCart,
  Heart, Phone, Briefcase, SignOut,
  House, Car
} from '@phosphor-icons/react';

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    loadWallet();
  }, []);

  const loadWallet = async () => {
    try {
      const res = await walletAPI.get();
      setWalletBalance(res.data.balance || 0);
    } catch (e) { /* ignore */ }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const quickActions = [
    { id: 'bookings', icon: ClipboardText, label: 'Réservations', color: 'text-blue-500', bg: 'bg-blue-50', path: '/history' },
    { id: 'wallet', icon: Wallet, label: 'Portefeuille', color: 'text-pink-500', bg: 'bg-pink-50', path: '/wallet' },
    { id: 'topup', icon: CreditCard, label: 'Recharger', color: 'text-purple-500', bg: 'bg-purple-50', path: '/wallet' },
    { id: 'invite', icon: EnvelopeSimple, label: 'Inviter', color: 'text-orange-500', bg: 'bg-orange-50', path: '#' },
  ];

  const settingsItems = [
    { id: 'about', icon: User, label: 'À propos de vous', subtitle: 'Requis pour le covoiturage', color: 'bg-red-100', iconColor: 'text-red-500' },
    { id: 'bookings', icon: ClipboardText, label: 'Mes réservations', subtitle: null, color: 'bg-blue-100', iconColor: 'text-blue-500', path: '/history' },
    { id: 'business', icon: Briefcase, label: 'Profil business', subtitle: null, color: 'bg-sky-100', iconColor: 'text-sky-500' },
    { id: 'cart', icon: ShoppingCart, label: 'Mon panier', subtitle: null, color: 'bg-red-100', iconColor: 'text-red-500', path: '/food' },
    { id: 'notifications', icon: Bell, label: 'Notifications', subtitle: null, color: 'bg-purple-100', iconColor: 'text-purple-500' },
    { id: 'favourites', icon: Heart, label: 'Prestataires favoris', subtitle: null, color: 'bg-yellow-100', iconColor: 'text-yellow-500' },
    { id: 'invite', icon: EnvelopeSimple, label: 'Inviter des amis', subtitle: null, color: 'bg-orange-100', iconColor: 'text-orange-500' },
    { id: 'emergency', icon: Phone, label: 'Contacts d\'urgence', subtitle: null, color: 'bg-green-100', iconColor: 'text-green-500' },
  ];

  return (
    <div className="mobile-container min-h-screen pb-20 bg-gray-100">
      {/* Blue/Green Header — like XJekPlus */}
      <div className="bg-[#00C853] px-5 pt-8 pb-16 relative">
        {/* Edit button */}
        <button
          className="absolute top-6 right-5 w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
          data-testid="edit-profile-btn"
        >
          <PencilSimple size={18} className="text-white" />
        </button>

        <div className="flex items-center gap-4 mt-2">
          <Avatar className="h-20 w-20 border-4 border-white shadow-lg">
            <AvatarImage src={user?.avatar_url} />
            <AvatarFallback className="bg-white text-[#00C853] text-2xl font-bold">
              {user?.name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="text-white">
            <h2 className="text-xl font-bold">{user?.name || 'Utilisateur'}</h2>
            <p className="text-sm text-white/80">{user?.email}</p>
            <p className="text-sm text-white/80">{user?.phone || '+33 6 XX XX XX XX'}</p>
          </div>
        </div>
      </div>

      {/* Wallet Card — floating over header */}
      <div className="px-4 -mt-10 relative z-10">
        <div className="bg-white rounded-2xl shadow-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="font-bold text-gray-900">Solde Portefeuille</p>
            <p className="text-xl font-bold text-[#00C853]">{walletBalance.toFixed(2)} &euro;</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {quickActions.map((action) => (
              <button
                key={action.id}
                onClick={() => action.path !== '#' && navigate(action.path)}
                className="flex flex-col items-center gap-1.5"
                data-testid={`quick-${action.id}-btn`}
              >
                <div className={`w-11 h-11 rounded-full ${action.bg} flex items-center justify-center`}>
                  <action.icon size={20} className={action.color} />
                </div>
                <span className="text-[10px] font-medium text-gray-600">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* General Settings */}
      <div className="px-4 mt-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Paramètres généraux</h3>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
          {settingsItems.map((item) => (
            <button
              key={item.id}
              onClick={() => item.path && navigate(item.path)}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors"
              data-testid={`settings-${item.id}-btn`}
            >
              <div className={`w-9 h-9 rounded-full ${item.color} flex items-center justify-center flex-shrink-0`}>
                <item.icon size={18} className={item.iconColor} />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-gray-900 text-sm">{item.label}</p>
                {item.subtitle && <p className="text-xs text-gray-400">{item.subtitle}</p>}
              </div>
              <CaretRight size={16} className="text-gray-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Logout */}
      <div className="px-4 mt-5 mb-6">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-red-50 text-red-600 font-semibold text-sm hover:bg-red-100 transition-colors"
          data-testid="logout-btn"
        >
          <SignOut size={18} />
          Se déconnecter
        </button>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="max-w-[430px] mx-auto bg-gray-900 rounded-t-3xl px-4 py-2.5 flex items-center justify-around">
          <button className="flex flex-col items-center gap-0.5 text-gray-400 py-2" onClick={() => navigate('/')} data-testid="nav-home">
            <House size={22} weight="regular" />
            <span className="text-[10px]">Accueil</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 text-gray-400 py-2" onClick={() => navigate('/history')} data-testid="nav-bookings">
            <Car size={22} weight="regular" />
            <span className="text-[10px]">Réservations</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 text-gray-400 py-2" onClick={() => navigate('/wallet')} data-testid="nav-wallet">
            <Wallet size={22} weight="regular" />
            <span className="text-[10px]">Portefeuille</span>
          </button>
          <button className="flex items-center gap-2 bg-[#00C853] text-white px-4 py-2 rounded-full" data-testid="nav-profile">
            <User size={20} weight="fill" />
            <span className="text-xs font-semibold">Profil</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
