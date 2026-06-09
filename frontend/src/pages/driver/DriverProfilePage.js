import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLocale } from '../../contexts/LocaleContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { driverAPI, walletAPI, configAPI, newsAPI } from '../../services/api';
import { getBrowserLocationLabel } from '../../lib/browserZone';
import {
  User, CaretRight, Gear, SignOut, ClipboardText, Wallet, Plus, EnvelopeOpen,
  Wrench, FileText, MapPin, Images, CalendarCheck, ChartBar, ChatCircleText,
  Receipt, Bell, UsersThree, PhoneCall, Fingerprint, UserCircle, Key,
  Gift, CreditCard, Bank, PaperPlaneTilt, Star,
  Crown, Trophy, Lightning, TrendUp, TrendDown, Taxi, Package, Check, Car, Motorcycle,
  Info, Lock, ShieldCheck, Question, ChatsCircle, EnvelopeSimple, House,
  IdentificationCard, Clock, XCircle, Newspaper
} from '@phosphor-icons/react';
import { toast } from 'sonner';

const GREEN = '#FF5000';
const API = process.env.REACT_APP_BACKEND_URL;

const DriverProfilePage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const { on } = useWebSocket(user?.id);
  const [driver, setDriver] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [activity, setActivity] = useState(null);
  const [rewardsActive, setRewardsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showServices, setShowServices] = useState(false);
  const [savingServices, setSavingServices] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [selectedTaxiMode, setSelectedTaxiMode] = useState(null);
  const [taxiPicker, setTaxiPicker] = useState(false);
  const [showInfoEdit, setShowInfoEdit] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({ company_name: '', license_number: '' });
  const [allowEditProfile, setAllowEditProfile] = useState(true);
  const [appSettings, setAppSettings] = useState({});
  const [newsUnread, setNewsUnread] = useState(0);

  const serviceOptions = [
    { value: 'taxi', label: t('driver.role_taxi'), desc: t('driver.role_taxi_desc'), Icon: Taxi },
    { value: 'delivery', label: t('driver.role_delivery'), desc: t('driver.role_delivery_desc'), Icon: Package },
    { value: 'courier', label: t('driver.role_courier'), desc: t('driver.role_courier_desc'), Icon: Lightning },
  ];

  const CAR_VEHICLES = ['car', 'voiture', 'sedan', 'berline', 'suv', 'van', 'minivan', 'luxe', 'luxury', 'comfort', 'confort', 'prime', 'premium', 'xl'];
  const MOTO_VEHICLES = ['moto', 'motorcycle', 'motorbike', 'scooter', 'moped'];
  const isCarVehicle = (vt) => CAR_VEHICLES.includes((vt || '').toLowerCase());
  const isMotoVehicle = (vt) => MOTO_VEHICLES.includes((vt || '').toLowerCase());
  const hasVtcDoc = (driver?.documents || []).some((d) => ['vtc_card', 'carte_vtc', 'carte_pro_taxi'].includes(d?.type));
  const hasTaxiNow = (driver?.service_types || []).includes('taxi');
  // Eligibility per taxi mode (need the matching vehicle + Carte VTC)
  const carModeOk = isCarVehicle(driver?.vehicle_type) && hasVtcDoc;
  const motoModeOk = isMotoVehicle(driver?.vehicle_type) && hasVtcDoc;
  const taxiEligible = hasTaxiNow || carModeOk || motoModeOk;
  const taxiLockReason = !hasVtcDoc
    ? 'Carte VTC requise'
    : (!isCarVehicle(driver?.vehicle_type) && !isMotoVehicle(driver?.vehicle_type) ? 'Véhicule voiture ou moto requis' : null);

  const openServices = () => {
    setSelectedTypes(driver?.service_types || []);
    setSelectedTaxiMode(driver?.taxi_mode || null);
    setTaxiPicker(false);
    setShowServices(true);
  };

  // Deep-link: open « Gérer mes services » directly (e.g. from the driver-home
  // « Devenir chauffeur Taxi » CTA at /chauffeur/profile?services=1).
  const servicesAutoOpenedRef = React.useRef(false);
  useEffect(() => {
    if (driver && searchParams.get('services') === '1' && !servicesAutoOpenedRef.current) {
      servicesAutoOpenedRef.current = true;
      openServices();
      searchParams.delete('services');
      setSearchParams(searchParams, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver, searchParams]);
  const toggleType = (v) => {
    if (v === 'taxi') {
      if (selectedTypes.includes('taxi')) {
        setTaxiPicker(false);
        setSelectedTaxiMode(null);
        setSelectedTypes((p) => p.filter((x) => x !== 'taxi'));
      } else if (!taxiEligible) {
        toast.error(taxiLockReason === 'Carte VTC requise'
          ? 'Le Taxi nécessite votre Carte VTC.'
          : 'Le Taxi nécessite un véhicule voiture ou moto.');
      } else {
        setTaxiPicker(true); // ask Voiture / Moto
      }
      return;
    }
    setSelectedTypes((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  };
  const selectTaxiMode = (mode) => {
    const ok = mode === 'moto' ? motoModeOk : carModeOk;
    if (!ok) {
      toast.error(mode === 'moto'
        ? (isMotoVehicle(driver?.vehicle_type) ? 'Le Moto-taxi nécessite votre Carte VTC.' : 'Le Moto-taxi nécessite un véhicule moto.')
        : (isCarVehicle(driver?.vehicle_type) ? 'Le Taxi nécessite votre Carte VTC.' : 'Le Taxi voiture nécessite un véhicule voiture.'));
      return;
    }
    setSelectedTaxiMode(mode);
    setSelectedTypes((p) => (p.includes('taxi') ? p : [...p, 'taxi']));
    setTaxiPicker(false);
  };

  const saveServiceTypes = async () => {
    if (selectedTypes.length === 0) { toast.error('Sélectionnez au moins un service'); return; }
    setSavingServices(true);
    try {
      const res = await driverAPI.updateServiceTypes(selectedTypes, selectedTaxiMode);
      setDriver((prev) => ({ ...(prev || {}), service_types: res.data.service_types, taxi_mode: res.data.taxi_mode }));
      toast.success('Services mis à jour');
      setShowServices(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Échec de la mise à jour');
    } finally {
      setSavingServices(false);
    }
  };

  const openInfoEdit = () => {
    setInfoForm({
      company_name: driver?.company_name || '',
      license_number: driver?.license_number || '',
    });
    setShowInfoEdit(true);
  };

  const submitInfoChange = async () => {
    const company_name = (infoForm.company_name || '').trim();
    const license_number = (infoForm.license_number || '').trim();
    if (!company_name && !license_number) { toast.error('Renseignez au moins un champ'); return; }
    setSavingInfo(true);
    try {
      const res = await driverAPI.requestInfoChange({ company_name, license_number });
      setDriver((prev) => ({ ...(prev || {}), pending_info: res.data.pending_info }));
      toast.success('Demande envoyée — en attente de validation.');
      setShowInfoEdit(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Échec de la demande');
    } finally {
      setSavingInfo(false);
    }
  };

  // Real-time alert when an admin approves/rejects the driver's info change.
  useEffect(() => {
    const off = on('driver_info_reviewed', (msg) => {
      if (msg?.status === 'approved') toast.success(msg.body || 'Informations validées ✅', { duration: 6000 });
      else toast.error(msg?.body || 'Modification refusée', { duration: 8000 });
      driverAPI.getProfile().then((r) => setDriver(r.data)).catch(() => {});
    });
    return off;
  }, [on]);

  useEffect(() => {
    let alive = true;
    const loadUnread = async (location) => {
      try {
        const r = await newsAPI.unreadCount(location);
        if (alive) setNewsUnread(r.data?.unread || 0);
      } catch { /* ignore */ }
    };
    loadUnread();
    getBrowserLocationLabel().then((label) => { if (label && alive) loadUnread(label); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [dRes, wRes, aRes, rRes, cRes] = await Promise.allSettled([
          driverAPI.getProfile(),
          walletAPI.get(),
          fetch(`${API}/api/drivers/my-activity`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
          fetch(`${API}/api/drivers/my-active-rewards`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
          configAPI.getAppSettings(),
        ]);
        if (dRes.status === 'fulfilled') setDriver(dRes.value.data);
        if (wRes.status === 'fulfilled') setWalletBalance(wRes.value.data.balance || 0);
        if (aRes.status === 'fulfilled' && aRes.value) setActivity(aRes.value);
        if (rRes.status === 'fulfilled' && rRes.value) setRewardsActive(!!rRes.value.any_active);
        if (cRes.status === 'fulfilled') { setAllowEditProfile(cRes.value.data.allow_driver_edit_profile !== false); setAppSettings(cRes.value.data || {}); }
      } catch (err) { console.error('Failed to load:', err); }
      finally { setLoading(false); }
    };
    loadData();
  }, []);

  const handleLogout = async () => { await logout(); navigate('/chauffeur'); };

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-white flex items-center justify-center">
        <div className="w-10 h-10 border-3 rounded-full animate-spin" style={{ borderColor: '#e5e7eb', borderTopColor: GREEN }} />
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-100 flex flex-col pb-28" data-testid="driver-profile-page">
      {/* ===== GREEN HEADER ===== */}
      <div className="px-5 pt-6 pb-5 relative" style={{ background: GREEN }}>
        <button className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" onClick={openInfoEdit} data-testid="settings-gear">
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

      {/* ===== MON ACTIVITE ===== */}
      {activity && <ActivityCard activity={activity} />}

      {/* ===== REGLAGES GENERAUX ===== */}
      <div className="mt-5">
        <p className="px-5 text-base font-bold text-gray-800 mb-2">{t('menu.general_settings')}</p>
        <div className="bg-white">
          <ProfileRow icon={ClipboardText} color="#3B82F6" label={t('menu.my_bookings')} onClick={() => navigate('/chauffeur/earnings')} />
          <ProfileRow icon={Wrench} color="#F59E0B" label={t('driver.manage_services')} onClick={openServices} />
          <ProfileRow icon={FileText} color="#06B6D4" label={t('menu.manage_documents')} onClick={() => navigate('/chauffeur/documents')} />
          {allowEditProfile && (
            <ProfileRow icon={IdentificationCard} color="#FF5000" label={t('driver.my_info')} onClick={openInfoEdit} />
          )}
          <ProfileRow icon={MapPin} color="#EF4444" label={t('driver.manage_workplace')} onClick={() => navigate('/chauffeur/availability')} />
          <ProfileRow icon={Images} color="#8B5CF6" label={t('driver.manage_gallery')} onClick={() => navigate('/chauffeur/gallery')} />
          <ProfileRow icon={CalendarCheck} color="#A3A3A3" label={t('driver.my_availability')} onClick={() => navigate('/chauffeur/availability')} />
          <ProfileRow icon={ChartBar} color="#22C55E" label={t('driver.statistics')} onClick={() => navigate('/chauffeur/earnings')} />
          <ProfileRow icon={ChatCircleText} color="#06B6D4" label={t('driver.user_comments')} onClick={() => navigate('/chauffeur/reviews')} />
          <ProfileRow icon={Receipt} color="#78716C" label={t('driver.waybill')} onClick={() => navigate('/chauffeur/history')} />
          <ProfileRow icon={Bell} color="#F97316" label={t('menu.notifications')} onClick={() => navigate('/chauffeur/notifications')} />
          <ProfileRow icon={Newspaper} color="#FF4500" label={t('menu.news')} onClick={() => navigate('/chauffeur/actualites')} badge={newsUnread} />
          <ProfileRow icon={UsersThree} color="#EF4444" label={t('menu.invite_friends')} onClick={() => navigate('/referral')} />
          <ProfileRow icon={PhoneCall} color="#84CC16" label={t('menu.emergency_contacts')} onClick={() => navigate('/safety')} />
        </div>
      </div>

      {/* ===== PARAMETRE DU COMPTE ===== */}
      <div className="mt-5">
        <p className="px-5 text-base font-bold text-gray-800 mb-2">{t('menu.account_settings')}</p>
        <div className="bg-white">
          <ProfileRow icon={Fingerprint} color="#64748B" label={t('menu.enable_faceid')} toggle onToggle={(v) => toast.success(v ? 'Face ID / Touch ID activé' : 'Face ID / Touch ID désactivé')} />
          <ProfileRow icon={UserCircle} color="#D946EF" label={t('menu.manage_account')} onClick={openInfoEdit} />
          <ProfileRow icon={Key} color="#374151" label={t('menu.change_password')} onClick={() => navigate('/chauffeur/change-password')} />
          {rewardsActive && appSettings.enable_driver_reward_program !== false && (
            <ProfileRow icon={Gift} color="#22C55E" label={t('driver.reward_program')} onClick={() => navigate('/chauffeur/rewards')} />
          )}
        </div>
      </div>

      {/* ===== PAIEMENT ===== */}
      <div className="mt-5">
        <p className="px-5 text-base font-bold text-gray-800 mb-2">{t('menu.payment')}</p>
        <div className="bg-white">
          <ProfileRow icon={CreditCard} color="#3B82F6" label={t('menu.payment_method')} onClick={() => navigate('/chauffeur/bank')} />
          <ProfileRow icon={Bank} color="#6366F1" label={t('driver.bank_details')} onClick={() => navigate('/chauffeur/bank')} />
          <ProfileRow icon={Wallet} color="#EF4444" label={t('menu.my_wallet')} onClick={() => navigate('/chauffeur/wallet')} />
          <ProfileRow icon={Plus} color="#8B5CF6" label={t('menu.add_money')} onClick={() => navigate('/chauffeur/wallet')} />
          <ProfileRow icon={PaperPlaneTilt} color="#D946EF" label={t('menu.send_money')} onClick={() => navigate('/chauffeur/wallet')} />
        </div>
      </div>

      {/* ===== CARTE CADEAU ===== */}
      {appSettings.enable_gift_card !== false && (
      <div className="mt-5 mb-5">
        <p className="px-5 text-base font-bold text-gray-800 mb-2">{t('menu.gift_card')}</p>
        <div className="bg-white">
          <ProfileRow icon={Gift} color="#92400E" label={t('menu.send_gift')} onClick={() => navigate('/giftcards')} />
          <ProfileRow icon={Gift} color="#0E7490" label={t('menu.redeem_gift')} onClick={() => navigate('/giftcards')} />
        </div>
      </div>
      )}

      {/* ===== SUPPORT ===== */}
      <div className="mt-5">
        <p className="px-5 text-base font-bold text-gray-800 mb-2">{t('menu.support')}</p>
        <div className="bg-white">
          <ProfileRow icon={Info} color="#F59E0B" label={t('menu.about_us')} onClick={() => navigate('/chauffeur/support/about')} />
          <ProfileRow icon={ShieldCheck} color="#374151" label={t('menu.privacy')} onClick={() => navigate('/chauffeur/support/privacy')} />
          <ProfileRow icon={Lock} color="#F87171" label={t('menu.terms')} onClick={() => navigate('/chauffeur/support/terms')} />
          <ProfileRow icon={Question} color="#EC4899" label={t('menu.faq')} onClick={() => navigate('/chauffeur/support/faq')} />
          <ProfileRow icon={ChatsCircle} color="#10B981" label={t('menu.live_chat')} onClick={() => navigate('/chauffeur/support/chat')} />
          <ProfileRow icon={EnvelopeSimple} color="#F97316" label={t('menu.contact_us')} onClick={() => navigate('/chauffeur/support/contact')} />
        </div>
      </div>

      {/* ===== AUTRE / DECONNEXION ===== */}
      <div className="mt-5 mb-8">
        <p className="px-5 text-base font-bold text-gray-800 mb-2">{t('menu.other')}</p>
        <div className="bg-white">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0 active:bg-gray-50 transition-colors" data-testid="logout-btn">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#6366F118' }}>
              <SignOut size={20} weight="duotone" style={{ color: '#6366F1' }} />
            </div>
            <span className="text-sm text-gray-800 flex-1 text-left">{t('menu.logout')}</span>
            <CaretRight size={16} className="text-gray-400 flex-shrink-0" />
          </button>
        </div>
      </div>

      <DriverBottomNav active="profile" />

      {/* ===== SERVICE TYPE SHEET ===== */}
      {showServices && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50" onClick={() => !savingServices && setShowServices(false)} data-testid="driver-services-modal">
          <div className="w-full max-w-[500px] bg-white rounded-t-3xl p-5 pb-8 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 mb-1">Gérer mes services</h2>
            <p className="text-sm text-gray-500 mb-4">Choisissez les commandes que vous souhaitez recevoir. Vous pouvez en cumuler plusieurs.</p>
            <div className="space-y-3">
              {serviceOptions.map((opt) => {
                const selected = selectedTypes.includes(opt.value);
                const locked = opt.value === 'taxi' && !selected && !taxiEligible;
                const taxiDesc = opt.value === 'taxi' && selected
                  ? (selectedTaxiMode === 'moto' ? 'Moto-taxi' : 'Taxi voiture')
                  : opt.desc;
                return (
                  <div key={opt.label}>
                    <button
                      type="button"
                      disabled={savingServices}
                      onClick={() => toggleType(opt.value)}
                      aria-pressed={selected}
                      className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${locked ? 'border-gray-200 bg-gray-50' : selected ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                      data-testid={`driver-service-${opt.value}`}
                    >
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${selected && !locked ? 'bg-emerald-500' : 'bg-gray-100'}`}>
                        <opt.Icon size={24} weight="duotone" className={selected && !locked ? 'text-white' : 'text-gray-500'} />
                      </div>
                      <div className="flex-1">
                        <p className={`font-semibold ${selected && !locked ? 'text-emerald-700' : 'text-gray-800'}`}>{opt.label}</p>
                        <p className="text-xs text-gray-500">{taxiDesc}</p>
                      </div>
                      {locked ? <Lock size={20} weight="duotone" className="text-gray-400" />
                        : (selected && <Check size={22} weight="bold" className="text-emerald-500" />)}
                    </button>

                    {opt.value === 'taxi' && taxiPicker && !selected && (
                      <div className="mt-2 p-3 rounded-2xl border border-emerald-200 bg-emerald-50/50" data-testid="taxi-mode-picker">
                        <p className="text-xs font-semibold text-gray-700 mb-2">Vous faites du Taxi en…</p>
                        <div className="grid grid-cols-2 gap-3">
                          <button type="button" onClick={() => selectTaxiMode('car')} disabled={!carModeOk} data-testid="taxi-mode-car"
                            className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 ${carModeOk ? 'border-gray-200 bg-white hover:border-emerald-400' : 'border-gray-200 bg-gray-100 opacity-60'}`}>
                            <Car size={24} weight="duotone" className={carModeOk ? 'text-emerald-600' : 'text-gray-400'} />
                            <span className="text-xs font-semibold text-gray-800">Voiture</span>
                            <span className="text-[10px] text-gray-500">Taxi voiture</span>
                          </button>
                          <button type="button" onClick={() => selectTaxiMode('moto')} disabled={!motoModeOk} data-testid="taxi-mode-moto"
                            className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 ${motoModeOk ? 'border-gray-200 bg-white hover:border-emerald-400' : 'border-gray-200 bg-gray-100 opacity-60'}`}>
                            <Motorcycle size={24} weight="duotone" className={motoModeOk ? 'text-emerald-600' : 'text-gray-400'} />
                            <span className="text-xs font-semibold text-gray-800">Moto</span>
                            <span className="text-[10px] text-gray-500">Moto-taxi</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {locked && (
                      <div className="mt-1.5 ml-1 text-[11px] text-amber-700 space-y-1" data-testid="taxi-locked-hint">
                        <p>🔒 {taxiLockReason} pour proposer le Taxi.</p>
                        <div className="flex gap-4">
                          <button type="button" onClick={() => navigate('/chauffeur/vehicles')} className="underline font-medium" data-testid="taxi-add-vehicle">Ajouter un véhicule</button>
                          <button type="button" onClick={() => navigate('/chauffeur/documents')} className="underline font-medium" data-testid="taxi-add-documents">Ajouter ma Carte VTC</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              disabled={savingServices || selectedTypes.length === 0}
              onClick={saveServiceTypes}
              className="w-full mt-5 py-3.5 rounded-2xl font-bold text-white transition-colors disabled:opacity-50"
              style={{ background: GREEN }}
              data-testid="driver-services-save"
            >
              {savingServices ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {/* ===== INFO EDIT SHEET (société / licence) ===== */}
      {showInfoEdit && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50" onClick={() => !savingInfo && setShowInfoEdit(false)} data-testid="driver-info-modal">
          <div className="w-full max-w-[500px] bg-white rounded-t-3xl p-5 pb-8 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 mb-1">Mes informations professionnelles</h2>
            <p className="text-sm text-gray-500 mb-4">Modifiez votre raison sociale et votre numéro de licence. Les changements seront appliqués après validation par l&apos;administrateur.</p>

            {driver?.pending_info?.status === 'pending' && (
              <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-center gap-2" data-testid="info-pending-banner">
                <Clock size={18} weight="fill" className="text-amber-500" />
                <p className="text-amber-700 text-xs font-medium">Demande en attente de validation par l&apos;administrateur.</p>
              </div>
            )}
            {driver?.pending_info?.status === 'rejected' && (
              <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3" data-testid="info-rejected-banner">
                <div className="flex items-center gap-2"><XCircle size={18} weight="fill" className="text-red-500" /><p className="text-red-700 text-xs font-medium">Dernière demande refusée</p></div>
                {driver.pending_info.reason && <p className="text-red-500 text-xs mt-1">Motif : {driver.pending_info.reason}</p>}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">Nom de la société</label>
                <input value={infoForm.company_name} onChange={(e) => setInfoForm((p) => ({ ...p, company_name: e.target.value }))}
                  placeholder="Ex. SB Drive VTC" disabled={savingInfo}
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                  data-testid="info-company-input" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Numéro de licence</label>
                <input value={infoForm.license_number} onChange={(e) => setInfoForm((p) => ({ ...p, license_number: e.target.value }))}
                  placeholder="Ex. VTC-123456" disabled={savingInfo}
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                  data-testid="info-license-input" />
              </div>
            </div>

            <button type="button" disabled={savingInfo} onClick={submitInfoChange}
              className="w-full mt-5 py-3.5 rounded-2xl font-bold text-white transition-colors disabled:opacity-50"
              style={{ background: GREEN }} data-testid="info-submit-btn">
              {savingInfo ? 'Envoi…' : 'Soumettre pour validation'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ActivityCard = ({ activity }) => {
  const { t } = useLocale();
  const { points, palette, acceptance_rate, cancellation_rate, activity_score, total_trips, today_completed, offered_count, refused_count, manual_priority, rules } = activity;
  const maxPts = palette?.max_points || 100;
  const minPts = palette?.min_points || 0;
  const pctInPalette = Math.max(0, Math.min(100, ((points - minPts) / Math.max(1, (maxPts - minPts))) * 100));

  return (
    <div className="mx-5 mt-4" data-testid="activity-card">
      <div className="flex items-center justify-between mb-2">
        <p className="text-base font-bold text-gray-800 flex items-center gap-2">
          <Lightning size={18} weight="fill" style={{ color: GREEN }} />
          {t('driver.my_activity')}
        </p>
        {(manual_priority || palette?.priority_access) && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-white" style={{ background: manual_priority ? '#F59E0B' : GREEN }}>
            <Crown size={12} weight="fill" />{manual_priority ? 'PRIORITE VIP' : 'PRIORITE'}
          </span>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Palette banner */}
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: `${palette?.color || '#9CA3AF'}15` }}>
          <div className="flex items-center gap-2">
            <Trophy size={20} weight="fill" style={{ color: palette?.color }} />
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-bold">Palette actuelle</p>
              <p className="font-bold text-sm" style={{ color: palette?.color }}>{palette?.name}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-500">{t('driver.points')}</p>
            <p className="font-bold text-xl" style={{ color: palette?.color }} data-testid="activity-points">{points}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-4 pt-3">
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span>{minPts} pts</span><span>{maxPts} pts</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pctInPalette}%`, background: palette?.color || GREEN }} />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-0 border-t border-gray-100 mt-3">
          <StatCell icon={TrendUp} color="#22C55E" label={t('driver.acceptance')} value={`${acceptance_rate}%`} testid="stat-acceptance" />
          <StatCell icon={TrendDown} color="#EF4444" label={t('driver.cancellation')} value={`${cancellation_rate}%`} testid="stat-cancellation" border />
          <StatCell icon={Star} color="#F59E0B" label={t('driver.score_short')} value={activity_score} testid="stat-score" />
        </div>
        <div className="grid grid-cols-3 gap-0 border-t border-gray-100">
          <StatCell label={t('driver.today')} value={today_completed} subtle testid="stat-today" />
          <StatCell label={t('driver.total_trips_label')} value={total_trips} subtle border testid="stat-trips" />
          <StatCell label={t('driver.refused')} value={refused_count || 0} subtle testid="stat-refused" />
        </div>

        {/* Rules info */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-600 space-y-0.5">
          <p>+{rules?.points_per_ride_accepted} pts par course acceptee · +{rules?.points_per_ride_completed} pts par course terminee</p>
          <p className="text-red-600">-{rules?.points_lost_per_refuse} pts par refus · -{rules?.points_lost_per_cancel} pts par annulation</p>
        </div>
      </div>
    </div>
  );
};

const StatCell = ({ icon: Icon, color, label, value, subtle, border, testid }) => (
  <div className={`px-3 py-3 text-center ${border ? 'border-x border-gray-100' : ''}`} data-testid={testid}>
    {Icon && <Icon size={16} weight="fill" style={{ color }} className="mx-auto mb-1" />}
    <p className={`${subtle ? 'text-base' : 'text-lg'} font-bold text-gray-800`}>{value}</p>
    <p className="text-[10px] text-gray-500 uppercase">{label}</p>
  </div>
);

const ProfileRow = ({ icon: Icon, color, label, onClick, toggle, onToggle, badge }) => {
  const [enabled, setEnabled] = useState(true);
  return (
    <button
      onClick={toggle ? () => { const v = !enabled; setEnabled(v); onToggle && onToggle(v); } : onClick}
      className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0 active:bg-gray-50 transition-colors"
      data-testid={`profile-row-${label.toLowerCase().replace(/\s+/g, '-').slice(0, 25)}`}
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '18' }}>
        <Icon size={20} weight="duotone" style={{ color }} />
      </div>
      <span className="text-sm text-gray-800 flex-1 text-left">{label}</span>
      {badge ? (
        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mr-1" data-testid="driver-news-badge">
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
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
  const { t } = useLocale();
  const tabs = [
    { id: 'home', label: t('tabs.home'), Icon: House, path: '/chauffeur/home' },
    { id: 'bookings', label: t('menu.the_bookings'), Icon: ClipboardText, path: '/chauffeur/reservations' },
    { id: 'wallet', label: t('tabs.wallet'), Icon: Wallet, path: '/chauffeur/wallet' },
    { id: 'profile', label: t('tabs.profile'), Icon: UserCircle, path: '/chauffeur/profile' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 max-w-[500px] mx-auto px-4 pb-3 pointer-events-none" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
      <nav className="pointer-events-auto bg-gray-950/95 backdrop-blur rounded-full flex items-stretch shadow-2xl border border-white/5 px-2" data-testid="driver-bottom-nav">
        {tabs.map(({ id, label, Icon, path }) => {
          const isActive = active === id;
          return (
            <button key={id} onClick={() => navigate(path)}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5"
              style={{ color: isActive ? GREEN : '#8A8F98' }}
              data-testid={`nav-${id}`}
            >
              <Icon size={22} weight={isActive ? 'fill' : 'regular'} />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default DriverProfilePage;
