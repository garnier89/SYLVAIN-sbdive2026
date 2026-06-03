import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSbPayGoAvailability } from '../hooks/useSbPayGoAvailability';
import {
  X, House, Car, Wallet, User, Gift, ShareNetwork, Heart, Question,
  SignOut, Bank, Star, MapPin, ListChecks, CreditCard, PaperPlaneTilt,
  Plus, Ticket, ShieldCheck, Phone, FileText, Info, ChatCircle, EnvelopeSimple,
  Bell, ShoppingCart, Briefcase, Package, Buildings, Car as CarIcon,
  Fingerprint, EnvelopeOpen, Key, Coins, Globe, Pencil, Image, ChartBar
} from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Slide-in side menu drawer for clients and drivers.
 * Mirrors the V3Cube reference profile: balance header, quick actions,
 * grouped sections (Réglages généraux / Acheter, vendre et louer /
 * Paramètre du compte / Paiement / Carte cadeau / Lieux favoris / Support).
 */
const SideMenuDrawer = ({ open, onClose, variant = 'user' }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { available: sbpaygoAvailable } = useSbPayGoAvailability(user?.country);

  const [walletBalance, setWalletBalance] = useState(null);
  const [biometricsOn, setBiometricsOn] = useState(() => {
    return localStorage.getItem('sbdrive_biometrics') === 'true';
  });

  useEffect(() => {
    if (!open) return;
    fetch(`${API}/api/wallet`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.balance != null) setWalletBalance(d.balance); })
      .catch(() => {});
  }, [open]);

  if (!open) return null;
  const go = (path) => { onClose(); navigate(path); };

  const handleLogout = async () => {
    try { await logout(); } catch { /* ignore */ }
    onClose();
    navigate('/');
  };

  const toggleBiometrics = () => {
    const next = !biometricsOn;
    setBiometricsOn(next);
    localStorage.setItem('sbdrive_biometrics', String(next));
  };

  const userSections = [
    {
      title: 'Réglages généraux',
      items: [
        { icon: Bell,         label: 'Les notifications',         path: '/profile?tab=notifications',    color: 'bg-purple-100 text-purple-600' },
        { icon: Heart,        label: 'Fournisseurs préférés',     path: '/favorite-drivers', color: 'bg-amber-100 text-amber-600' },
        { icon: ShareNetwork, label: 'Inviter des amis',          path: '/referral',         color: 'bg-orange-100 text-orange-600' },
        { icon: Phone,        label: "Contacts d'urgence",        path: '/safety',           color: 'bg-lime-100 text-lime-700' },
        { icon: Heart,        label: 'Faire un don',              path: '/donation',         color: 'bg-emerald-100 text-emerald-600' },
        { icon: Briefcase,    label: "Profil de l'entreprise",    path: '/profile?tab=company', color: 'bg-sky-100 text-sky-600' },
        { icon: ShoppingCart, label: 'Mon panier',                path: '/profile?tab=cart',             color: 'bg-red-100 text-red-600' },
        { icon: User,         label: 'À propos de vous',          path: '/profile?tab=about', subtitle: 'Requis pour le covoiturage', color: 'bg-rose-100 text-rose-700' },
      ],
    },
    {
      title: 'Acheter, vendre et louer',
      items: [
        { icon: Package,    label: "Votre liste générale d'articles", path: '/profile?tab=articles',    color: 'bg-amber-100 text-amber-700' },
        { icon: Buildings,  label: 'Votre liste de propriétés',       path: '/profile?tab=properties',  color: 'bg-purple-100 text-purple-700' },
        { icon: CarIcon,    label: 'Votre liste de voitures',         path: '/profile?tab=vehicles',    color: 'bg-emerald-100 text-emerald-700' },
      ],
    },
    {
      title: 'Paramètre du compte',
      items: [
        { type: 'toggle', icon: Fingerprint, label: "Activer l'empreinte digitale", color: 'bg-blue-100 text-blue-600', value: biometricsOn, onToggle: toggleBiometrics, testId: 'toggle-biometrics' },
        { icon: EnvelopeOpen, label: 'Vérifiez votre e-mail',  path: '/profile?tab=verify-email', color: 'bg-orange-100 text-orange-600' },
        { icon: User,         label: 'Gérer son compte',       path: '/profile',                  color: 'bg-fuchsia-100 text-fuchsia-600' },
        { icon: Key,          label: 'Changer le mot de passe',path: '/profile?tab=password',     color: 'bg-slate-200 text-slate-700' },
        { icon: Coins,        label: 'Changer la devise',      path: '/profile?tab=currency',     color: 'bg-purple-100 text-purple-700' },
        { icon: Globe,        label: 'Changer la langue',      path: '/profile?tab=language',     color: 'bg-blue-100 text-blue-700' },
        { icon: FileText,     label: 'Gérer les documents',    path: '/profile?tab=documents',    color: 'bg-sky-100 text-sky-600' },
      ],
    },
    {
      title: 'Paiement',
      items: [
        { icon: CreditCard,   label: 'Mode de paiement',        path: '/wallet?tab=methods',       color: 'bg-indigo-100 text-indigo-600' },
        { icon: Wallet,       label: 'Mon portefeuille',        path: '/wallet',                   color: 'bg-rose-100 text-rose-600' },
        { icon: Plus,         label: "Ajouter de l'argent",     path: '/wallet?action=topup',      color: 'bg-violet-100 text-violet-600' },
        { icon: PaperPlaneTilt, label: "Envoyer de l'argent",   path: '/wallet?action=send',       color: 'bg-pink-100 text-pink-700' },
        { icon: Bank,         label: 'SB PayGo',                path: '/finance',                  color: 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white', highlight: true, hidden: !sbpaygoAvailable },
      ],
    },
    {
      title: 'Carte cadeau',
      items: [
        { icon: Gift,   label: 'Envoyer une carte cadeau', path: '/giftcards', color: 'bg-amber-100 text-amber-700' },
        { icon: Ticket, label: 'Échanger une carte',       path: '/giftcards', color: 'bg-teal-100 text-teal-600' },
      ],
    },
    {
      title: 'Lieux favoris',
      items: [
        { icon: House,     label: 'Domicile',                path: '/profile?tab=fav-home', subtitle: '5 Rue de Rivoli, 75004 Paris', color: 'bg-gray-200 text-gray-700', editable: true },
        { icon: Briefcase, label: 'Travail',                 path: '/profile?tab=fav-work', subtitle: 'La Défense, 92060 Puteaux', color: 'bg-gray-200 text-gray-700', editable: true },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: Info,           label: 'À propos de nous',             path: '/support', color: 'bg-orange-100 text-orange-600' },
        { icon: ShieldCheck,    label: 'Politique de confidentialité', path: '/support', color: 'bg-gray-200 text-gray-700' },
        { icon: FileText,       label: 'Termes et conditions',         path: '/support', color: 'bg-rose-200 text-rose-600' },
        { icon: Question,       label: 'FAQ',                          path: '/support', color: 'bg-pink-100 text-pink-600' },
        { icon: ChatCircle,     label: 'Parler en direct',             path: '/livechat', color: 'bg-emerald-100 text-emerald-600' },
        { icon: EnvelopeSimple, label: 'Contactez-nous',               path: '/support', color: 'bg-orange-100 text-orange-600' },
      ],
    },
  ];

  const driverSections = [
    {
      title: 'Réglages généraux',
      items: [
        { icon: House,      label: 'Accueil',           path: '/chauffeur/home',    color: 'bg-emerald-100 text-emerald-600' },
        { icon: Car,        label: 'Mes courses',       path: '/chauffeur/history', color: 'bg-blue-100 text-blue-600' },
        { icon: Star,       label: 'Récompenses',       path: '/chauffeur/rewards', color: 'bg-amber-100 text-amber-600' },
        { icon: Bell,       label: 'Les notifications', path: '/chauffeur/notifications',     color: 'bg-purple-100 text-purple-600' },
      ],
    },
    {
      title: 'Paramètre du compte',
      items: [
        { type: 'toggle', icon: Fingerprint, label: "Activer l'empreinte digitale", color: 'bg-blue-100 text-blue-600', value: biometricsOn, onToggle: toggleBiometrics, testId: 'toggle-biometrics-driver' },
        { icon: User,     label: 'Mon profil',     path: '/chauffeur/profile',   color: 'bg-fuchsia-100 text-fuchsia-600' },
        { icon: Car,      label: 'Mes véhicules',  path: '/chauffeur/vehicles',  color: 'bg-amber-100 text-amber-600' },
        { icon: FileText, label: 'Mes documents',  path: '/chauffeur/documents', color: 'bg-sky-100 text-sky-600' },
        { icon: Image,    label: 'Ma galerie',     path: '/chauffeur/gallery',   color: 'bg-pink-100 text-pink-600' },
        { icon: Key,      label: 'Changer le mot de passe', path: '/chauffeur/profile?tab=password', color: 'bg-slate-200 text-slate-700' },
        { icon: Globe,    label: 'Changer la langue', path: '/chauffeur/profile?tab=language', color: 'bg-blue-100 text-blue-700' },
      ],
    },
    {
      title: 'Paiement',
      items: [
        { icon: Wallet, label: 'Mon portefeuille', path: '/chauffeur/wallet', color: 'bg-rose-100 text-rose-600' },
        { icon: Bank,   label: 'Coordonnées bancaires', path: '/chauffeur/bank', color: 'bg-indigo-100 text-indigo-600' },
        { icon: ChartBar, label: 'Statistiques gains', path: '/chauffeur/earnings/stats', color: 'bg-emerald-100 text-emerald-700' },
        { icon: Bank,   label: 'SB PayGo',         path: '/finance',          color: 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white', highlight: true, hidden: !sbpaygoAvailable },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: ChatCircle, label: 'Support en direct', path: '/chauffeur/livechat', color: 'bg-emerald-100 text-emerald-600' },
      ],
    },
  ];

  const sections = variant === 'driver' ? driverSections : userSections;

  return (
    <div className="fixed inset-0 z-[2000]" data-testid="side-menu-drawer">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside
        className="absolute left-0 top-0 bottom-0 w-[86%] max-w-[360px] bg-white shadow-2xl flex flex-col"
        style={{ animation: 'slide-in 0.25s ease-out' }}
      >
        {/* Profile header (V3Cube-style) */}
        <div className="bg-gradient-to-br from-[#FF4500] to-orange-500 px-5 pt-6 pb-4 text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold flex-shrink-0">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <p className="font-bold truncate">{user?.name || 'Utilisateur'}</p>
                <p className="text-xs text-white/80 truncate">{user?.email || ''}</p>
                {user?.phone && <p className="text-xs text-white/70 truncate">{user.phone}</p>}
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0" data-testid="close-side-menu-btn">
              <X size={18} weight="bold" />
            </button>
          </div>

          {/* Balance card */}
          <div className="mt-4 bg-white text-gray-800 rounded-xl px-4 py-3 flex items-center justify-between shadow-md" data-testid="wallet-balance-card">
            <span className="text-sm font-bold">Solde du portefeuille</span>
            <span className="text-base font-black text-[#FF4500]">
              {walletBalance != null ? `${Number(walletBalance).toFixed(2)} €` : '— €'}
            </span>
          </div>

          {/* 4 Quick actions */}
          <div className="mt-3 grid grid-cols-4 gap-2" data-testid="quick-actions">
            {[
              { icon: ListChecks,    label: 'Réservations', path: variant === 'driver' ? '/chauffeur/history' : '/history' },
              { icon: Wallet,        label: 'Portefeuille', path: variant === 'driver' ? '/chauffeur/wallet'  : '/wallet' },
              { icon: Plus,          label: 'Recharger',    path: '/wallet?action=topup' },
              { icon: ShareNetwork,  label: 'Inviter',      path: '/referral' },
            ].map((a) => (
              <button
                key={a.label}
                onClick={() => go(a.path)}
                className="flex flex-col items-center text-center"
                data-testid={`quick-${a.label.toLowerCase()}-btn`}
              >
                <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center mb-1">
                  <a.icon size={20} weight="duotone" className="text-white" />
                </div>
                <span className="text-[10px] font-medium leading-tight">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sections */}
        <nav className="flex-1 overflow-y-auto pb-2">
          {sections.map((section) => (
            <div key={section.title} className="mb-1">
              <div className="px-5 py-2 bg-gray-50 border-y border-gray-100">
                <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{section.title}</h3>
              </div>
              {section.items.filter((it) => !it.hidden).map((it) => (
                it.type === 'toggle' ? (
                  <div
                    key={it.label}
                    className="w-full flex items-center gap-3 px-5 py-3 border-b border-gray-50"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${it.color}`}>
                      <it.icon size={18} weight="duotone" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-gray-800">{it.label}</span>
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!it.value}
                        onChange={it.onToggle}
                        className="sr-only peer"
                        data-testid={it.testId}
                      />
                      <div className="relative w-10 h-5 bg-gray-300 peer-checked:bg-emerald-500 rounded-full transition-all after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
                    </label>
                  </div>
                ) : (
                  <button
                    key={it.label}
                    onClick={() => go(it.path)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50"
                    data-testid={`side-menu-${it.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-btn`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${it.color}`}>
                      <it.icon size={18} weight={it.highlight ? 'fill' : 'duotone'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${it.highlight ? 'text-indigo-700' : 'text-gray-800'}`}>
                        {it.label}
                        {it.highlight && <span className="ml-2 inline-block text-[9px] font-bold uppercase bg-indigo-600 text-white px-1.5 py-0.5 rounded">Nouveau</span>}
                      </p>
                      {it.subtitle && <p className="text-[11px] text-gray-500 truncate mt-0.5">{it.subtitle}</p>}
                    </div>
                    {it.editable && <Pencil size={14} className="text-gray-400" />}
                  </button>
                )
              ))}
            </div>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className="m-4 flex items-center justify-center gap-2 py-3 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50"
          data-testid="side-menu-logout-btn"
        >
          <SignOut size={16} weight="bold" />
          Se déconnecter
        </button>

        <style>{`
          @keyframes slide-in {
            from { transform: translateX(-100%); }
            to   { transform: translateX(0); }
          }
        `}</style>
      </aside>
    </div>
  );
};

export default SideMenuDrawer;
