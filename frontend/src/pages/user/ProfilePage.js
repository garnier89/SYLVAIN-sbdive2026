import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLocale } from '../../contexts/LocaleContext';
import { useAppSettings } from '../../hooks/useAppSettings';
import ProfileTabView from './profile/ProfileTabView';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { Switch } from '../../components/ui/switch';
import { walletAPI, newsAPI } from '../../services/api';
import { getBrowserLocationLabel } from '../../lib/browserZone';
import {
  ClipboardText, Wallet, CreditCard, EnvelopeSimple, CaretRight,
  User, Bell, ShoppingCart, Heart, Phone, Briefcase, SignOut,
  House, Car, GearSix, Fingerprint, UserCircle, FileText,
  Key, ArrowsLeftRight, Buildings,
  CarSimple, Gift, MapPin, Info, ShieldCheck, Lock, Question,
  PaperPlaneTilt, Power, Envelope, HandHeart, ChatCircleDots, Newspaper, Storefront, GraduationCap
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
const MenuItem = ({ icon: Icon, label, subtitle, iconBg, iconColor, onClick, trailing, testId, badge }) => {
  // If trailing contains an interactive element (Switch), render as div to avoid button-in-button
  const Comp = trailing ? 'div' : 'button';
  return (
    <Comp
      onClick={trailing ? undefined : onClick}
      className={`w-full flex items-center gap-3.5 px-4 py-3 ${trailing ? '' : 'hover:bg-gray-50/80 active:bg-gray-100'} transition-colors`}
      data-testid={testId}
    >
      <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center flex-shrink-0`}>
        <Icon size={20} weight="fill" className={iconColor} />
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className="text-[14px] font-medium text-gray-900 leading-tight">{label}</p>
        {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {badge ? (
        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mr-1" data-testid={`${testId}-badge`}>
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
      {trailing || <CaretRight size={16} className="text-gray-300 flex-shrink-0" />}
    </Comp>
  );
};

/* ── white card that wraps a section ── */
const MenuCard = ({ children }) => (
  <div className="mx-4 bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100/80">
    {children}
  </div>
);

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const { settings } = useAppSettings();
  const [search] = useSearchParams();
  const [walletBalance, setWalletBalance] = useState(0);
  const [faceIdEnabled, setFaceIdEnabled] = useState(false);
  const [newsUnread, setNewsUnread] = useState(0);

  useEffect(() => {
    loadWallet();
  }, []);

  useEffect(() => {
    let alive = true;
    const loadUnread = async (location) => {
      try {
        const r = await newsAPI.unreadCount(location);
        if (alive) setNewsUnread(r.data?.unread || 0);
      } catch (e) { console.debug('[Profile] news unread failed:', e?.message || e); }
    };
    loadUnread();
    getBrowserLocationLabel().then((label) => { if (label && alive) loadUnread(label); });
    return () => { alive = false; };
  }, []);

  const loadWallet = async () => {
    try {
      const res = await walletAPI.get();
      setWalletBalance(res.data.balance || 0);
    } catch (e) { console.error('Failed to load wallet balance:', e); }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // When ?tab= is set, render the focused tab view instead of the full profile menu.
  if (search.get('tab')) return <ProfileTabView />;

  /* ── quick‑action buttons under wallet card ── */
  const quickActions = [
    { id: 'bookings', icon: ClipboardText, label: t('menu.the_bookings'), color: '#FF4500', bg: 'bg-indigo-50', path: '/history' },
    { id: 'wallet', icon: Wallet, label: t('tabs.wallet'), color: '#E91E63', bg: 'bg-pink-50', path: '/wallet' },
    { id: 'topup', icon: CreditCard, label: t('menu.topup'), color: '#7C4DFF', bg: 'bg-purple-50', path: '/wallet' },
    settings.enable_referral_system !== false
      ? { id: 'invite', icon: EnvelopeSimple, label: t('menu.invite'), color: '#FF9800', bg: 'bg-orange-50', path: '/referral' }
      : null,
  ].filter(Boolean);

  return (
    <div className="mobile-container min-h-screen pb-24 bg-[#F2F2F7]">

      {/* ═══════════ HEADER — dark indigo blue ═══════════ */}
      <div className="bg-[#FF4500] px-5 pt-8 pb-20 relative">
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
            <p className="text-[14px] font-bold text-gray-900">{t('menu.wallet_balance')}</p>
            <p className="text-lg font-bold text-[#FF4500]" data-testid="wallet-balance-display">
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
      <SectionHeader title={t('menu.general_settings')} />
      <MenuCard>
        <MenuItem icon={User} label={t('menu.about_you')} subtitle={t('menu.carpool_only')} iconBg="bg-red-800" iconColor="text-white" onClick={() => navigate('/profile?tab=about')} testId="settings-about-btn" />
        <MenuItem icon={ClipboardText} label={t('menu.my_bookings')} iconBg="bg-[#FF4500]" iconColor="text-white" onClick={() => navigate('/history')} testId="settings-bookings-btn" />
        <MenuItem icon={Briefcase} label={t('menu.company_profile')} iconBg="bg-orange-500" iconColor="text-white" onClick={() => navigate('/profile?tab=company')} testId="settings-business-btn" />
        <MenuItem icon={ShoppingCart} label={t('menu.my_cart')} iconBg="bg-red-500" iconColor="text-white" onClick={() => navigate('/food')} testId="settings-cart-btn" />
        <MenuItem icon={Bell} label={t('menu.notifications')} iconBg="bg-purple-600" iconColor="text-white" onClick={() => navigate('/profile?tab=notifications')} testId="settings-notifications-btn" />
        <MenuItem icon={Newspaper} label={t('menu.news')} iconBg="bg-[#FF4500]" iconColor="text-white" onClick={() => navigate('/actualites')} testId="settings-news-btn" badge={newsUnread} />
        <MenuItem icon={GraduationCap} label="SB Student 🎓" subtitle="Offres & tarifs étudiants" iconBg="bg-violet-600" iconColor="text-white" onClick={() => navigate('/sb-student')} testId="settings-sb-student-btn" />
        {settings.enable_favorite_driver === true && (
          <MenuItem icon={Heart} label={t('menu.favorite_drivers')} iconBg="bg-yellow-500" iconColor="text-white" onClick={() => navigate('/favorite-drivers')} testId="settings-favourites-btn" />
        )}
        {settings.enable_referral_system !== false && (
          <MenuItem icon={EnvelopeSimple} label={t('menu.invite_friends')} iconBg="bg-orange-500" iconColor="text-white" onClick={() => navigate('/referral')} testId="settings-invite-btn" />
        )}
        <MenuItem icon={Phone} label={t('menu.emergency_contacts')} iconBg="bg-orange-500" iconColor="text-white" onClick={() => navigate('/safety')} testId="settings-emergency-btn" />
        {settings.enable_donation !== false && (
          <MenuItem icon={HandHeart} label={t('menu.make_donation')} iconBg="bg-lime-600" iconColor="text-white" onClick={() => navigate('/donation')} testId="settings-donate-btn" />
        )}
      </MenuCard>

      {/* ═══════════ ACHETER, VENDRE ET LOUER ═══════════ */}
      <SectionHeader title={t('menu.buy_sell_rent')} />
      <MenuCard>
        <MenuItem icon={ArrowsLeftRight} label={t('menu.items_list')} iconBg="bg-amber-600" iconColor="text-white" onClick={() => navigate('/marketplace/general')} testId="settings-items-btn" />
        <MenuItem icon={Buildings} label={t('menu.properties_list')} iconBg="bg-purple-700" iconColor="text-white" onClick={() => navigate('/marketplace/real-estate')} testId="settings-properties-btn" />
        <MenuItem icon={CarSimple} label={t('menu.cars_list')} iconBg="bg-orange-500" iconColor="text-white" onClick={() => navigate('/marketplace/car-rental')} testId="settings-cars-btn" />
        <MenuItem icon={Storefront} label="Gérer ma galerie / Vendre" iconBg="bg-emerald-600" iconColor="text-white" onClick={() => navigate('/ma-galerie')} testId="settings-sell-gallery-btn" />
      </MenuCard>

      {/* ═══════════ PARAMÈTRE DU COMPTE ═══════════ */}
      <SectionHeader title={t('menu.account_settings')} />
      <MenuCard>
        <MenuItem
          icon={Fingerprint}
          label={t('menu.enable_faceid')}
          iconBg="bg-[#FF4500]"
          iconColor="text-white"
          testId="settings-faceid-btn"
          trailing={
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                <Info size={14} weight="fill" className="text-[#FF4500]" />
              </div>
              <Switch
                checked={faceIdEnabled}
                onCheckedChange={setFaceIdEnabled}
                data-testid="faceid-toggle"
                className="data-[state=checked]:bg-[#FF4500]"
              />
            </div>
          }
        />
        <MenuItem icon={UserCircle} label={t('menu.manage_account')} iconBg="bg-pink-600" iconColor="text-white" testId="settings-manage-account-btn" />
        <MenuItem icon={FileText} label={t('menu.manage_documents')} subtitle={t('menu.carpool_only')} iconBg="bg-orange-500" iconColor="text-white" onClick={() => navigate('/profile?tab=documents')} testId="settings-documents-btn" />
        <MenuItem icon={Key} label={t('menu.change_password')} iconBg="bg-gray-700" iconColor="text-white" onClick={() => navigate('/profile?tab=password')} testId="settings-password-btn" />
      </MenuCard>

      {/* ═══════════ PAIEMENT ═══════════ */}
      <SectionHeader title={t('menu.payment')} />
      <MenuCard>
        <MenuItem icon={CreditCard} label={t('menu.payment_method')} iconBg="bg-purple-700" iconColor="text-white" testId="settings-payment-method-btn" />
        <MenuItem icon={Wallet} label={t('menu.my_wallet')} iconBg="bg-pink-600" iconColor="text-white" onClick={() => navigate('/wallet')} testId="settings-wallet-btn" />
        <MenuItem icon={CreditCard} label={t('menu.add_money')} iconBg="bg-[#FF4500]" iconColor="text-white" onClick={() => navigate('/wallet')} testId="settings-add-money-btn" />
        <MenuItem icon={PaperPlaneTilt} label={t('menu.send_money')} iconBg="bg-red-900" iconColor="text-white" testId="settings-send-money-btn" />
      </MenuCard>

      {/* ═══════════ CARTE CADEAU ═══════════ */}
      {settings.enable_gift_card !== false && (
        <>
          <SectionHeader title={t('menu.gift_card')} />
          <MenuCard>
            <MenuItem icon={Gift} label={t('menu.send_gift')} iconBg="bg-amber-700" iconColor="text-white" onClick={() => navigate('/giftcards')} testId="settings-send-gift-btn" />
            <MenuItem icon={Gift} label={t('menu.redeem_gift')} iconBg="bg-orange-600" iconColor="text-white" onClick={() => navigate('/giftcards')} testId="settings-redeem-gift-btn" />
          </MenuCard>
        </>
      )}

      {/* ═══════════ LIEUX FAVORIS ═══════════ */}
      <SectionHeader title={t('menu.favorite_places')} />
      <MenuCard>
        <MenuItem icon={MapPin} label={t('menu.add_home')} iconBg="bg-orange-600" iconColor="text-white" testId="settings-add-home-btn" />
        <MenuItem icon={Briefcase} label={t('menu.add_work')} iconBg="bg-purple-900" iconColor="text-white" testId="settings-add-work-btn" />
      </MenuCard>

      {/* ═══════════ SOUTIEN ═══════════ */}
      <SectionHeader title={t('menu.support')} />
      <MenuCard>
        <MenuItem icon={Info} label={t('menu.about_us')} iconBg="bg-yellow-500" iconColor="text-white" testId="settings-about-us-btn" />
        <MenuItem icon={ShieldCheck} label={t('menu.privacy')} iconBg="bg-gray-800" iconColor="text-white" testId="settings-privacy-btn" />
        <MenuItem icon={Lock} label={t('menu.terms')} iconBg="bg-orange-400" iconColor="text-white" testId="settings-terms-btn" />
        <MenuItem icon={Question} label={t('menu.faq')} iconBg="bg-pink-500" iconColor="text-white" onClick={() => navigate('/support')} testId="settings-faq-btn" />
        <MenuItem icon={ChatCircleDots} label={t('menu.live_chat')} iconBg="bg-orange-500" iconColor="text-white" onClick={() => navigate('/livechat')} testId="settings-live-chat-btn" />
        <MenuItem icon={Envelope} label={t('menu.contact_us')} iconBg="bg-orange-500" iconColor="text-white" onClick={() => navigate('/support')} testId="settings-contact-btn" />
      </MenuCard>

      {/* ═══════════ AUTRE ═══════════ */}
      <SectionHeader title={t('menu.other')} />
      <MenuCard>
        <MenuItem
          icon={Power}
          label={t('menu.logout')}
          iconBg="bg-[#FF4500]"
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
            <span className="text-[10px] text-gray-400">{t('tabs.home')}</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 py-2 min-w-[60px]" onClick={() => navigate('/history')} data-testid="nav-bookings">
            <ClipboardText size={22} weight="regular" className="text-gray-400" />
            <span className="text-[10px] text-gray-400">{t('menu.the_bookings')}</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 py-2 min-w-[60px]" onClick={() => navigate('/wallet')} data-testid="nav-wallet">
            <Wallet size={22} weight="regular" className="text-gray-400" />
            <span className="text-[10px] text-gray-400">{t('tabs.wallet')}</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 py-2 min-w-[60px]" data-testid="nav-profile">
            <User size={22} weight="fill" className="text-[#FF4500]" />
            <span className="text-[10px] text-[#FF4500] font-semibold">{t('tabs.profile')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
