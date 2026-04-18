import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { driverAPI, walletAPI } from '../../services/api';
import {
  User, CaretRight, Gear, SignOut, ClipboardText, Wallet, Plus, EnvelopeOpen,
  Wrench, FileText, MapPin, Images, CalendarCheck, ChartBar, ChatCircleText,
  Receipt, Bell, UsersThree, PhoneCall, Fingerprint, UserCircle, Key,
  CurrencyCircleDollar, Globe, Gift, CreditCard, Bank, PaperPlaneTilt, Star
} from '@phosphor-icons/react';
import { toast } from 'sonner';

const GREEN = '#00B578';

const DriverProfilePage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [driver, setDriver] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [dRes, wRes] = await Promise.allSettled([
        driverAPI.getProfile(),
        walletAPI.get(),
      ]);
      if (dRes.status === 'fulfilled') setDriver(dRes.value.data);
      if (wRes.status === 'fulfilled') setWalletBalance(wRes.value.data.balance || 0);
    } catch (err) { console.error('Failed to load:', err); }
    finally { setLoading(false); }
  };

  const handleLogout = async () => { await logout(); navigate('/chauffeur'); };

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-white flex items-center justify-center">
        <div className="w-10 h-10 border-3 rounded-full animate-spin" style={{ borderColor: '#e5e7eb', borderTopColor: GREEN }} />
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-100 flex flex-col pb-20" data-testid="driver-profile-page">
      {/* ===== GREEN HEADER ===== */}
      <div className="px-5 pt-6 pb-5 relative" style={{ background: GREEN }}>
        <button className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" onClick={() => {}} data-testid="settings-gear">
          <Gear size={20} className="text-white" />
        </button>
        <div className="flex items-center gap-4 mt-2">
          <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center border-2 border-white/40">
            <User size={40} className="text-white/70" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white" data-testid="profile-name">{user?.name || 'Chauffeur'}</h1>
            <p className="text-white/70 text-sm mt-0.5">{user?.email || ''}</p>
            <p className="text-white/70 text-sm">{user?.phone || ''}</p>
          </div>
        </div>
      </div>

      {/* ===== WALLET CARD ===== */}
      <div className="mx-5 -mt-2 bg-white rounded-2xl p-4 shadow-sm border border-gray-100" data-testid="wallet-card">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">Balance de portefeuille</span>
          <span className="text-lg font-bold" style={{ color: GREEN }}>{walletBalance.toFixed(2)} EUR</span>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[
            { icon: ClipboardText, label: 'Les reservations', color: '#3B82F6', path: '/chauffeur/earnings' },
            { icon: Wallet, label: 'Portefeuille', color: '#EC4899', path: '/chauffeur/wallet' },
            { icon: Plus, label: 'Recharger', color: '#8B5CF6', path: '/chauffeur/wallet' },
            { icon: EnvelopeOpen, label: 'Inviter', color: '#F97316', path: '/referral' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <button key={item.label} onClick={() => navigate(item.path)} className="flex flex-col items-center gap-1.5">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: item.color + '15' }}>
                  <Icon size={22} weight="duotone" style={{ color: item.color }} />
                </div>
                <span className="text-[10px] text-gray-600 text-center leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== REGLAGES GENERAUX ===== */}
      <div className="mt-5">
        <p className="px-5 text-base font-bold text-gray-800 mb-2">reglages generaux</p>
        <div className="bg-white">
          <ProfileRow icon={ClipboardText} color="#3B82F6" label="Mes reservations" onClick={() => navigate('/chauffeur/earnings')} />
          <ProfileRow icon={Wrench} color="#F59E0B" label="Gerer les services" onClick={() => {}} />
          <ProfileRow icon={FileText} color="#06B6D4" label="Gerer les documents" onClick={() => navigate('/chauffeur/documents')} />
          <ProfileRow icon={MapPin} color="#EF4444" label="Gerer le lieu de travail" onClick={() => {}} />
          <ProfileRow icon={Images} color="#8B5CF6" label="Gerer la galerie" onClick={() => {}} />
          <ProfileRow icon={CalendarCheck} color="#A3A3A3" label="Ma disponibilite" onClick={() => {}} />
          <ProfileRow icon={ChartBar} color="#22C55E" label="Statistiques" onClick={() => navigate('/chauffeur/earnings')} />
          <ProfileRow icon={ChatCircleText} color="#06B6D4" label="Les commentaires des utilisateurs" onClick={() => {}} />
          <ProfileRow icon={Receipt} color="#78716C" label="Lettre de voiture" onClick={() => {}} />
          <ProfileRow icon={Bell} color="#F97316" label="Les notifications" onClick={() => navigate('/chauffeur/notifications')} />
          <ProfileRow icon={UsersThree} color="#EF4444" label="Inviter des amis" onClick={() => navigate('/referral')} />
          <ProfileRow icon={PhoneCall} color="#84CC16" label="Contacts d'urgence" onClick={() => {}} />
        </div>
      </div>

      {/* ===== PARAMETRE DU COMPTE ===== */}
      <div className="mt-5">
        <p className="px-5 text-base font-bold text-gray-800 mb-2">Parametre du compte</p>
        <div className="bg-white">
          <ProfileRow icon={Fingerprint} color="#64748B" label="Activer Face ID/Touch ID" toggle />
          <ProfileRow icon={UserCircle} color="#D946EF" label="Gerer son compte" onClick={() => {}} />
          <ProfileRow icon={Key} color="#374151" label="Changer le mot de passe" onClick={() => {}} />
          <ProfileRow icon={CurrencyCircleDollar} color="#EC4899" label="Changer de devise" onClick={() => {}} />
          <ProfileRow icon={Globe} color="#0D9488" label="Changer de langue" onClick={() => {}} />
          <ProfileRow icon={Gift} color="#22C55E" label="Programme de recompense" onClick={() => {}} />
        </div>
      </div>

      {/* ===== PAIEMENT ===== */}
      <div className="mt-5">
        <p className="px-5 text-base font-bold text-gray-800 mb-2">Paiement</p>
        <div className="bg-white">
          <ProfileRow icon={CreditCard} color="#3B82F6" label="Mode de paiement" onClick={() => {}} />
          <ProfileRow icon={Bank} color="#6366F1" label="Coordonnees bancaires" onClick={() => {}} />
          <ProfileRow icon={Wallet} color="#EF4444" label="Mon portefeuille" onClick={() => navigate('/chauffeur/wallet')} />
          <ProfileRow icon={Plus} color="#8B5CF6" label="Ajouter de l'argent" onClick={() => navigate('/chauffeur/wallet')} />
          <ProfileRow icon={PaperPlaneTilt} color="#D946EF" label="Envoyer de l'argent" onClick={() => {}} />
        </div>
      </div>

      {/* ===== CARTE CADEAU ===== */}
      <div className="mt-5 mb-5">
        <p className="px-5 text-base font-bold text-gray-800 mb-2">Carte cadeau</p>
        <div className="bg-white">
          <ProfileRow icon={Gift} color="#F59E0B" label="Acheter une carte cadeau" onClick={() => navigate('/giftcards')} />
          <ProfileRow icon={Star} color="#22C55E" label="Mes cartes cadeaux" onClick={() => {}} />
        </div>
      </div>

      {/* ===== DECONNEXION ===== */}
      <div className="px-5 mb-8">
        <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 border border-red-100" data-testid="logout-btn">
          <SignOut size={18} className="text-red-500" />
          <span className="text-red-500 font-semibold text-sm">Deconnexion</span>
        </button>
      </div>

      <DriverBottomNav active="profile" />
    </div>
  );
};

const ProfileRow = ({ icon: Icon, color, label, onClick, toggle }) => {
  const [enabled, setEnabled] = useState(true);
  return (
    <button
      onClick={toggle ? () => setEnabled(!enabled) : onClick}
      className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0 active:bg-gray-50 transition-colors"
      data-testid={`profile-row-${label.toLowerCase().replace(/\s+/g, '-').slice(0, 25)}`}
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '18' }}>
        <Icon size={20} weight="duotone" style={{ color }} />
      </div>
      <span className="text-sm text-gray-800 flex-1 text-left">{label}</span>
      {toggle ? (
        <div className={`w-12 h-7 rounded-full relative transition-colors ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
          <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
        </div>
      ) : (
        <CaretRight size={16} className="text-gray-400 flex-shrink-0" />
      )}
    </button>
  );
};

export const DriverBottomNav = ({ active = 'home' }) => {
  const navigate = useNavigate();
  const tabs = [
    { id: 'home', label: 'Accueil', icon: '🏠', path: '/chauffeur/home' },
    { id: 'bookings', label: 'Les reservations', icon: '📋', path: '/chauffeur/earnings' },
    { id: 'wallet', label: 'Portefeuille', icon: '💼', path: '/chauffeur/wallet' },
    { id: 'profile', label: 'Profil', icon: '👤', path: '/chauffeur/profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-950 flex items-stretch z-50 max-w-[500px] mx-auto" data-testid="driver-bottom-nav" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => navigate(tab.path)}
          className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${active === tab.id ? 'text-white' : 'text-gray-500'}`}
          style={active === tab.id ? { color: GREEN } : {}}
          data-testid={`nav-${tab.id}`}
        >
          <span className="text-lg">{tab.icon}</span>
          <span className="text-[10px] font-medium">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default DriverProfilePage;
