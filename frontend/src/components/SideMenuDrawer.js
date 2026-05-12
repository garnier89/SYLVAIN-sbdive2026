import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  X, House, Car, Wallet, User, Gift, ShareNetwork, Heart, Question,
  SignOut, Bank, Star, MapPin, ListChecks, CreditCard, PaperPlaneTilt,
  Plus, Ticket, ShieldCheck, Phone, FileText, Info, ChatCircle, EnvelopeSimple
} from '@phosphor-icons/react';

/**
 * Slide-in side menu drawer for clients and drivers.
 * Items are grouped into sections matching V3Cube layout:
 *   Réglages généraux, Paramètre du compte, Paiement, Carte cadeau, Lieux favoris, Support, Autre.
 *
 * Props:
 *   - open: boolean
 *   - onClose: () => void
 *   - variant: 'user' | 'driver'
 */
const SideMenuDrawer = ({ open, onClose, variant = 'user' }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  if (!open) return null;

  const go = (path) => { onClose(); navigate(path); };

  const handleLogout = async () => {
    try { await logout(); } catch { /* ignore */ }
    onClose();
    navigate('/');
  };

  const userSections = [
    {
      title: 'Réglages généraux',
      items: [
        { icon: House,        label: 'Accueil',                 path: '/home',             color: 'bg-blue-100 text-blue-600' },
        { icon: ListChecks,   label: 'Mes réservations',        path: '/history',          color: 'bg-cyan-100 text-cyan-600' },
        { icon: Star,         label: 'Fournisseurs préférés',   path: '/favorite-drivers', color: 'bg-amber-100 text-amber-600' },
        { icon: ShareNetwork, label: 'Inviter des amis',        path: '/referral',         color: 'bg-orange-100 text-orange-600' },
        { icon: Phone,        label: "Contacts d'urgence",      path: '/safety',           color: 'bg-lime-100 text-lime-700' },
        { icon: Heart,        label: 'Faire un don',            path: '/donation',         color: 'bg-emerald-100 text-emerald-600' },
      ],
    },
    {
      title: 'Paramètre du compte',
      items: [
        { icon: User,         label: 'Gérer son compte',        path: '/profile',          color: 'bg-fuchsia-100 text-fuchsia-600' },
        { icon: FileText,     label: 'Gérer les documents',     path: '/profile',          color: 'bg-sky-100 text-sky-600' },
      ],
    },
    {
      title: 'Paiement',
      items: [
        { icon: CreditCard,   label: 'Mode de paiement',        path: '/wallet?tab=methods', color: 'bg-indigo-100 text-indigo-600' },
        { icon: Wallet,       label: 'Mon portefeuille',        path: '/wallet',           color: 'bg-rose-100 text-rose-600' },
        { icon: Plus,         label: "Ajouter de l'argent",     path: '/wallet?action=topup', color: 'bg-violet-100 text-violet-600' },
        { icon: PaperPlaneTilt, label: "Envoyer de l'argent",   path: '/wallet?action=send',  color: 'bg-pink-100 text-pink-700' },
        { icon: Bank,         label: 'SB PayGo',                path: '/finance',          color: 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white', highlight: true },
      ],
    },
    {
      title: 'Carte cadeau',
      items: [
        { icon: Gift,         label: 'Envoyer une carte cadeau', path: '/giftcards',       color: 'bg-amber-100 text-amber-700' },
        { icon: Ticket,       label: 'Échanger une carte',       path: '/giftcards',       color: 'bg-teal-100 text-teal-600' },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: Info,            label: 'À propos de nous',         path: '/support',      color: 'bg-orange-100 text-orange-600' },
        { icon: ShieldCheck,     label: 'Politique de confidentialité', path: '/support',  color: 'bg-gray-200 text-gray-700' },
        { icon: FileText,        label: 'Termes et conditions',     path: '/support',      color: 'bg-rose-200 text-rose-600' },
        { icon: Question,        label: 'FAQ',                      path: '/support',      color: 'bg-pink-100 text-pink-600' },
        { icon: ChatCircle,      label: 'Parler en direct',         path: '/livechat',     color: 'bg-emerald-100 text-emerald-600' },
        { icon: EnvelopeSimple,  label: 'Contactez-nous',           path: '/support',      color: 'bg-orange-100 text-orange-600' },
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
      ],
    },
    {
      title: 'Paramètre du compte',
      items: [
        { icon: User,       label: 'Mon profil',        path: '/chauffeur/profile',   color: 'bg-fuchsia-100 text-fuchsia-600' },
        { icon: FileText,   label: 'Mes documents',     path: '/chauffeur/documents', color: 'bg-sky-100 text-sky-600' },
      ],
    },
    {
      title: 'Paiement',
      items: [
        { icon: Wallet,     label: 'Mon portefeuille',  path: '/chauffeur/wallet', color: 'bg-rose-100 text-rose-600' },
        { icon: Bank,       label: 'SB PayGo',          path: '/finance',          color: 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white', highlight: true },
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
        {/* Profile header */}
        <div className="bg-gradient-to-br from-[#FF4500] to-orange-500 px-5 pt-6 pb-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold flex-shrink-0">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <p className="font-bold truncate">{user?.name || 'Utilisateur'}</p>
                <p className="text-xs text-white/80 truncate">{user?.email || ''}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0" data-testid="close-side-menu-btn">
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>

        {/* Sections */}
        <nav className="flex-1 overflow-y-auto pb-2">
          {sections.map((section) => (
            <div key={section.title} className="mb-1">
              <div className="px-5 py-2 bg-gray-50 border-y border-gray-100">
                <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{section.title}</h3>
              </div>
              {section.items.map((it) => (
                <button
                  key={it.label}
                  onClick={() => go(it.path)}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50"
                  data-testid={`side-menu-${it.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-btn`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${it.color}`}>
                    <it.icon size={18} weight={it.highlight ? 'fill' : 'duotone'} />
                  </div>
                  <span className={`text-sm font-medium ${it.highlight ? 'text-indigo-700' : 'text-gray-800'}`}>
                    {it.label}
                    {it.highlight && <span className="ml-2 inline-block text-[9px] font-bold uppercase bg-indigo-600 text-white px-1.5 py-0.5 rounded">Nouveau</span>}
                  </span>
                </button>
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
