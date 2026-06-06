import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { driverAPI, walletAPI } from '../../services/api';
import {
  User, CaretRight, Gear, SignOut, ClipboardText, Wallet, Plus, EnvelopeOpen,
  Wrench, FileText, MapPin, Images, CalendarCheck, ChartBar, ChatCircleText,
  Receipt, Bell, UsersThree, PhoneCall, Fingerprint, UserCircle, Key,
  CurrencyCircleDollar, Globe, Gift, CreditCard, Bank, PaperPlaneTilt, Star,
  Crown, Trophy, Lightning, TrendUp, TrendDown, Taxi, Package, Check, Car, Motorcycle,
  Info, Lock, ShieldCheck, Question, ChatsCircle, EnvelopeSimple
} from '@phosphor-icons/react';
import { toast } from 'sonner';

const GREEN = '#00B578';
const API = process.env.REACT_APP_BACKEND_URL;

const DriverProfilePage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
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

  const serviceOptions = [
    { value: 'taxi', label: 'Taxi', desc: 'Transport de personnes', Icon: Taxi },
    { value: 'delivery', label: 'Livreur', desc: 'Commandes marchands', Icon: Package },
    { value: 'courier', label: 'Coursier', desc: 'Colis & express', Icon: Lightning },
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

  useEffect(() => {
    const loadData = async () => {
      try {
        const [dRes, wRes, aRes, rRes] = await Promise.allSettled([
          driverAPI.getProfile(),
          walletAPI.get(),
          fetch(`${API}/api/drivers/my-activity`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
          fetch(`${API}/api/drivers/my-active-rewards`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        ]);
        if (dRes.status === 'fulfilled') setDriver(dRes.value.data);
        if (wRes.status === 'fulfilled') setWalletBalance(wRes.value.data.balance || 0);
        if (aRes.status === 'fulfilled' && aRes.value) setActivity(aRes.value);
        if (rRes.status === 'fulfilled' && rRes.value) setRewardsActive(!!rRes.value.any_active);
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

      {/* ===== MON ACTIVITE ===== */}
      {activity && <ActivityCard activity={activity} />}

      {/* ===== REGLAGES GENERAUX ===== */}
      <div className="mt-5">
        <p className="px-5 text-base font-bold text-gray-800 mb-2">reglages generaux</p>
        <div className="bg-white">
          <ProfileRow icon={ClipboardText} color="#3B82F6" label="Mes reservations" onClick={() => navigate('/chauffeur/earnings')} />
          <ProfileRow icon={Wrench} color="#F59E0B" label="Gerer les services" onClick={openServices} />
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
          {rewardsActive && (
            <ProfileRow icon={Gift} color="#22C55E" label="Programme de recompense" onClick={() => navigate('/chauffeur/rewards')} />
          )}
          <ProfileRow icon={Trophy} color="#F59E0B" label="Mon score" onClick={() => navigate('/chauffeur/score')} />
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
          <ProfileRow icon={Gift} color="#92400E" label="Envoyer une carte-cadeau" onClick={() => navigate('/giftcards')} />
          <ProfileRow icon={Gift} color="#0E7490" label="Echanger une carte-cadeau" onClick={() => navigate('/giftcards')} />
        </div>
      </div>

      {/* ===== SUPPORT ===== */}
      <div className="mt-5">
        <p className="px-5 text-base font-bold text-gray-800 mb-2">Support</p>
        <div className="bg-white">
          <ProfileRow icon={Info} color="#F59E0B" label="A propos de nous" onClick={() => navigate('/chauffeur/support/about')} />
          <ProfileRow icon={ShieldCheck} color="#374151" label="Politique de confidentialite" onClick={() => navigate('/chauffeur/support/privacy')} />
          <ProfileRow icon={Lock} color="#F87171" label="Termes et conditions" onClick={() => navigate('/chauffeur/support/terms')} />
          <ProfileRow icon={Question} color="#EC4899" label="FAQ" onClick={() => navigate('/chauffeur/support/faq')} />
          <ProfileRow icon={ChatsCircle} color="#10B981" label="Parler en direct" onClick={() => navigate('/chauffeur/support/chat')} />
          <ProfileRow icon={EnvelopeSimple} color="#F97316" label="Contactez nous" onClick={() => navigate('/chauffeur/support/contact')} />
        </div>
      </div>

      {/* ===== AUTRE / DECONNEXION ===== */}
      <div className="mt-5 mb-8">
        <p className="px-5 text-base font-bold text-gray-800 mb-2">Autre</p>
        <div className="bg-white">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0 active:bg-gray-50 transition-colors" data-testid="logout-btn">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#6366F118' }}>
              <SignOut size={20} weight="duotone" style={{ color: '#6366F1' }} />
            </div>
            <span className="text-sm text-gray-800 flex-1 text-left">Se deconnecter</span>
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
    </div>
  );
};

const ActivityCard = ({ activity }) => {
  const { points, palette, acceptance_rate, cancellation_rate, activity_score, total_trips, today_completed, offered_count, refused_count, manual_priority, rules } = activity;
  const maxPts = palette?.max_points || 100;
  const minPts = palette?.min_points || 0;
  const pctInPalette = Math.max(0, Math.min(100, ((points - minPts) / Math.max(1, (maxPts - minPts))) * 100));

  return (
    <div className="mx-5 mt-4" data-testid="activity-card">
      <div className="flex items-center justify-between mb-2">
        <p className="text-base font-bold text-gray-800 flex items-center gap-2">
          <Lightning size={18} weight="fill" style={{ color: GREEN }} />
          Mon Activite
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
            <p className="text-[10px] text-gray-500">Points</p>
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
          <StatCell icon={TrendUp} color="#22C55E" label="Acceptation" value={`${acceptance_rate}%`} testid="stat-acceptance" />
          <StatCell icon={TrendDown} color="#EF4444" label="Annulation" value={`${cancellation_rate}%`} testid="stat-cancellation" border />
          <StatCell icon={Star} color="#F59E0B" label="Score" value={activity_score} testid="stat-score" />
        </div>
        <div className="grid grid-cols-3 gap-0 border-t border-gray-100">
          <StatCell label="Aujourd'hui" value={today_completed} subtle testid="stat-today" />
          <StatCell label="Total courses" value={total_trips} subtle border testid="stat-trips" />
          <StatCell label="Refus" value={refused_count || 0} subtle testid="stat-refused" />
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
