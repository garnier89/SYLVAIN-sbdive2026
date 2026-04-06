import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { Switch } from '../../components/ui/switch';
import { walletAPI } from '../../services/api';
import {
  ClipboardText, Wallet, CreditCard, EnvelopeSimple, CaretRight,
  User, Bell, ShoppingCart, Heart, Phone, Briefcase, SignOut,
  House, Car, GearSix, Fingerprint, UserCircle, FileText,
  Key, CurrencyCircleDollar, Globe, ArrowsLeftRight, Buildings,
  CarSimple, Gift, MapPin, Info, ShieldCheck, Lock, Question,
  PaperPlaneTilt, Power, Envelope
} from '@phosphor-icons/react';

/* ── reusable section header ── */
const SectionHeader = ({ title }) => (
  <div className="px-4 pt-5 pb-2">
    <h3 className="text-[15px] font-bold text-gray-900" data-testid={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      {title}
    </h3>
  </div>
);

/* ── reusable menu row ── */
const MenuItem = ({ icon: Icon, label, subtitle, iconBg, iconColor, onClick, trailing, testId }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3.5 px-4 py-3 hover:bg-gray-50/80 active:bg-gray-100 transition-colors"
    data-testid={testId}
  >
    <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center flex-shrink-0`}>
      <Icon size={20} weight="fill" className={iconColor} />
    </div>
    <div className="flex-1 text-left min-w-0">
      <p className="text-[14px] font-medium text-gray-900 leading-tight">{label}</p>
      {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
    {trailing || <CaretRight size={16} className="text-gray-300 flex-shrink-0" />}
  </button>
);

/* ── white card that wraps a section ── */
const MenuCard = ({ children }) => (
  <div className="mx-4 bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100/80">
    {children}
  </div>
);

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [walletBalance, setWalletBalance] = useState(0);
  const [faceIdEnabled, setFaceIdEnabled] = useState(false);

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

  /* ── quick‑action buttons under wallet card ── */
  const quickActions = [
    { id: 'bookings', icon: ClipboardText, label: 'Les réservations', color: '#3F51B5', bg: 'bg-indigo-50', path: '/history' },
    { id: 'wallet', icon: Wallet, label: 'Portefeuille', color: '#E91E63', bg: 'bg-pink-50', path: '/wallet' },
    { id: 'topup', icon: CreditCard, label: 'Recharger', color: '#7C4DFF', bg: 'bg-purple-50', path: '/wallet' },
    { id: 'invite', icon: EnvelopeSimple, label: 'Inviter', color: '#FF9800', bg: 'bg-orange-50', path: '#' },
  ];

  return (
    <div className="mobile-container min-h-screen pb-24 bg-[#F2F2F7]">

      {/* ═══════════ HEADER — dark indigo blue ═══════════ */}
      <div className="bg-[#3F51B5] px-5 pt-8 pb-20 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <Avatar className="h-14 w-14 border-2 border-white/30 shadow-md">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="bg-gray-200 text-gray-500">
                <User size={28} weight="fill" />
              </AvatarFallback>
            </Avatar>
            <h2 className="text-lg font-bold text-white tracking-tight" data-testid="profile-username">
              {user?.name || 'Utilisateur'}
            </h2>
          </div>
          <button
            className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center"
            data-testid="settings-gear-btn"
          >
            <GearSix size={22} weight="fill" className="text-white/80" />
          </button>
        </div>
      </div>

      {/* ═══════════ WALLET CARD — floating ═══════════ */}
      <div className="px-4 -mt-14 relative z-10">
        <div className="bg-white rounded-2xl shadow-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[14px] font-bold text-gray-900">Balance de portefeuille</p>
            <p className="text-lg font-bold text-[#3F51B5]" data-testid="wallet-balance-display">
              {walletBalance.toFixed(2)} &euro;
            </p>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {quickActions.map((action) => (
              <button
                key={action.id}
                onClick={() => action.path !== '#' && navigate(action.path)}
                className="flex flex-col items-center gap-1.5 py-1"
                data-testid={`quick-${action.id}-btn`}
              >
                <div className={`w-11 h-11 rounded-full ${action.bg} flex items-center justify-center`}>
                  <action.icon size={20} weight="fill" style={{ color: action.color }} />
                </div>
                <span className="text-[10px] font-medium text-gray-600 leading-tight text-center">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════ RÉGLAGES GÉNÉRAUX ═══════════ */}
      <SectionHeader title="réglages généraux" />
      <MenuCard>
        <MenuItem icon={User} label="Au propos de vous" subtitle="Requis uniquement pour le covoiturage" iconBg="bg-red-800" iconColor="text-white" testId="settings-about-btn" />
        <MenuItem icon={ClipboardText} label="Mes réservations" iconBg="bg-blue-600" iconColor="text-white" onClick={() => navigate('/history')} testId="settings-bookings-btn" />
        <MenuItem icon={Briefcase} label="Profil de l'entreprise" iconBg="bg-sky-500" iconColor="text-white" testId="settings-business-btn" />
        <MenuItem icon={ShoppingCart} label="Mon panier" iconBg="bg-red-500" iconColor="text-white" onClick={() => navigate('/food')} testId="settings-cart-btn" />
        <MenuItem icon={Bell} label="Les notifications" iconBg="bg-purple-600" iconColor="text-white" testId="settings-notifications-btn" />
        <MenuItem icon={Heart} label="Fournisseurs de services préférés" iconBg="bg-yellow-500" iconColor="text-white" testId="settings-favourites-btn" />
        <MenuItem icon={EnvelopeSimple} label="Inviter des amis" iconBg="bg-orange-500" iconColor="text-white" testId="settings-invite-btn" />
        <MenuItem icon={Phone} label="Contacts d'urgence" iconBg="bg-green-500" iconColor="text-white" testId="settings-emergency-btn" />
      </MenuCard>

      {/* ═══════════ ACHETER, VENDRE ET LOUER ═══════════ */}
      <SectionHeader title="Acheter, vendre et louer" />
      <MenuCard>
        <MenuItem icon={ArrowsLeftRight} label="Votre liste générale d'articles" iconBg="bg-amber-600" iconColor="text-white" onClick={() => navigate('/marketplace/general')} testId="settings-items-btn" />
        <MenuItem icon={Buildings} label="Votre liste de propriétés" iconBg="bg-purple-700" iconColor="text-white" onClick={() => navigate('/marketplace/real-estate')} testId="settings-properties-btn" />
        <MenuItem icon={CarSimple} label="Votre liste de voitures" iconBg="bg-green-500" iconColor="text-white" onClick={() => navigate('/marketplace/car-rental')} testId="settings-cars-btn" />
      </MenuCard>

      {/* ═══════════ PARAMÈTRE DU COMPTE ═══════════ */}
      <SectionHeader title="Paramètre du compte" />
      <MenuCard>
        <MenuItem
          icon={Fingerprint}
          label="Activer Face ID/Touch ID"
          iconBg="bg-blue-600"
          iconColor="text-white"
          testId="settings-faceid-btn"
          trailing={
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                <Info size={14} weight="fill" className="text-blue-600" />
              </div>
              <Switch
                checked={faceIdEnabled}
                onCheckedChange={setFaceIdEnabled}
                data-testid="faceid-toggle"
                className="data-[state=checked]:bg-[#3F51B5]"
              />
            </div>
          }
        />
        <MenuItem icon={UserCircle} label="Gérer son compte" iconBg="bg-pink-600" iconColor="text-white" testId="settings-manage-account-btn" />
        <MenuItem icon={FileText} label="Gérer les documents" subtitle="Requis uniquement pour le covoiturage" iconBg="bg-cyan-500" iconColor="text-white" testId="settings-documents-btn" />
        <MenuItem icon={Key} label="Changer le mot de passe" iconBg="bg-gray-700" iconColor="text-white" testId="settings-password-btn" />
        <MenuItem icon={CurrencyCircleDollar} label="Changer de devise" iconBg="bg-purple-600" iconColor="text-white" testId="settings-currency-btn" />
        <MenuItem icon={Globe} label="Changer de langue" iconBg="bg-indigo-800" iconColor="text-white" testId="settings-language-btn" />
      </MenuCard>

      {/* ═══════════ PAIEMENT ═══════════ */}
      <SectionHeader title="Paiement" />
      <MenuCard>
        <MenuItem icon={CreditCard} label="Mode de paiement" iconBg="bg-purple-700" iconColor="text-white" testId="settings-payment-method-btn" />
        <MenuItem icon={Wallet} label="Mon portefeuille" iconBg="bg-pink-600" iconColor="text-white" onClick={() => navigate('/wallet')} testId="settings-wallet-btn" />
        <MenuItem icon={CreditCard} label="Ajouter de l'argent" iconBg="bg-[#3F51B5]" iconColor="text-white" onClick={() => navigate('/wallet')} testId="settings-add-money-btn" />
        <MenuItem icon={PaperPlaneTilt} label="Envoyer de l'argent" iconBg="bg-red-900" iconColor="text-white" testId="settings-send-money-btn" />
      </MenuCard>

      {/* ═══════════ CARTE CADEAU ═══════════ */}
      <SectionHeader title="Carte cadeau" />
      <MenuCard>
        <MenuItem icon={Gift} label="Envoyer une carte-cadeau" iconBg="bg-amber-700" iconColor="text-white" testId="settings-send-gift-btn" />
        <MenuItem icon={Gift} label="Échanger une carte-cadeau" iconBg="bg-teal-600" iconColor="text-white" testId="settings-redeem-gift-btn" />
      </MenuCard>

      {/* ═══════════ LIEUX FAVORIS ═══════════ */}
      <SectionHeader title="Lieux favoris" />
      <MenuCard>
        <MenuItem icon={MapPin} label="Ajouter une maison" iconBg="bg-orange-600" iconColor="text-white" testId="settings-add-home-btn" />
        <MenuItem icon={Briefcase} label="Ajouter du travail" iconBg="bg-purple-900" iconColor="text-white" testId="settings-add-work-btn" />
      </MenuCard>

      {/* ═══════════ SOUTIEN ═══════════ */}
      <SectionHeader title="Soutien" />
      <MenuCard>
        <MenuItem icon={Info} label="À propos de nous" iconBg="bg-yellow-500" iconColor="text-white" testId="settings-about-us-btn" />
        <MenuItem icon={ShieldCheck} label="Politique de confidentialité" iconBg="bg-gray-800" iconColor="text-white" testId="settings-privacy-btn" />
        <MenuItem icon={Lock} label="Termes et conditions" iconBg="bg-orange-400" iconColor="text-white" testId="settings-terms-btn" />
        <MenuItem icon={Question} label="FAQ" iconBg="bg-pink-500" iconColor="text-white" onClick={() => navigate('/support')} testId="settings-faq-btn" />
        <MenuItem icon={Envelope} label="Contactez nous" iconBg="bg-orange-500" iconColor="text-white" onClick={() => navigate('/support')} testId="settings-contact-btn" />
      </MenuCard>

      {/* ═══════════ AUTRE ═══════════ */}
      <SectionHeader title="Autre" />
      <MenuCard>
        <MenuItem
          icon={Power}
          label="Connectez - Out"
          iconBg="bg-[#3F51B5]"
          iconColor="text-white"
          onClick={handleLogout}
          testId="logout-btn"
        />
      </MenuCard>

      <div className="h-6" />

      {/* ═══════════ BOTTOM NAVIGATION ═══════════ */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="max-w-[430px] mx-auto bg-black rounded-t-3xl px-2 py-2 flex items-center justify-around">
          <button className="flex flex-col items-center gap-0.5 py-2 min-w-[60px]" onClick={() => navigate('/home')} data-testid="nav-home">
            <House size={22} weight="regular" className="text-gray-400" />
            <span className="text-[10px] text-gray-400">Accueil</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 py-2 min-w-[60px]" onClick={() => navigate('/history')} data-testid="nav-bookings">
            <ClipboardText size={22} weight="regular" className="text-gray-400" />
            <span className="text-[10px] text-gray-400">Les réservations</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 py-2 min-w-[60px]" onClick={() => navigate('/wallet')} data-testid="nav-wallet">
            <Wallet size={22} weight="regular" className="text-gray-400" />
            <span className="text-[10px] text-gray-400">Portefeuille</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 py-2 min-w-[60px]" data-testid="nav-profile">
            <User size={22} weight="fill" className="text-[#3F51B5]" />
            <span className="text-[10px] text-[#3F51B5] font-semibold">Profil</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
