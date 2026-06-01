/**
 * Configuration des 7 web panels métier de SB Drive VTC.
 * Chaque panel a son propre brand color, sidebar, role JWT acceptés.
 * Tous les sous-routes pointent vers les pages admin existantes (réutilisation).
 */
import {
  SquaresFour, Path, Lightning, UsersThree, Car, Wallet, HandCoins,
  Gear, FileText, EnvelopeOpen, Translate, MapPin, Globe, Image, Newspaper,
  EnvelopeSimple, Storefront, ShoppingCart, Package, Tag, Star, ChartLine,
  Ticket, Warning, BuildingOffice, MagnifyingGlass, ChatCircleText, Bed,
  SealCheck, Trophy, ShareNetwork, Shield, FirstAid, Gavel, Gift
} from '@phosphor-icons/react';

// Common roles allowed per panel — admin/super_admin always allowed everywhere
const ADMIN = ['admin', 'super_admin'];

export const PANEL_CONFIGS = {
  // ============= 1. DISPATCH PANEL =============
  dispatch: {
    key: 'dispatch',
    label: 'Dispatch',
    title: 'SB Drive Dispatch',
    role_label: 'Dispatcher',
    brand_color: '#0EA5E9', // sky-500
    allowed_roles: [...ADMIN, 'dispatcher'],
    base_path: '/dispatch',
    home_path: '/dispatch',
    sidebar: [
      { title: 'OPÉRATIONS', items: [
        { icon: SquaresFour, label: 'Vue d\'ensemble', path: '/dispatch' },
        { icon: Path, label: 'Courses en direct', path: '/dispatch/live-rides' },
        { icon: Lightning, label: 'Auto-dispatch', path: '/dispatch/auto-dispatch' },
        { icon: ChartLine, label: 'Monitoring', path: '/dispatch/monitoring' },
      ]},
      { title: 'RESSOURCES', items: [
        { icon: Car, label: 'Chauffeurs en ligne', path: '/dispatch/drivers' },
        { icon: Trophy, label: 'Chauffeurs prioritaires', path: '/dispatch/priority-drivers' },
        { icon: Path, label: 'Toutes les courses', path: '/dispatch/rides' },
      ]},
      { title: 'INCIDENTS', items: [
        { icon: Warning, label: 'Alertes SOS', path: '/dispatch/sos-requests' },
        { icon: ChatCircleText, label: 'Aide course', path: '/dispatch/trip-help-requests' },
        { icon: Gavel, label: 'Litiges', path: '/dispatch/disputes' },
      ]},
    ],
  },

  // ============= 2. BILLING PANEL =============
  billing: {
    key: 'billing',
    label: 'Billing',
    title: 'SB Drive Facturation',
    role_label: 'Comptabilité',
    brand_color: '#10B981', // emerald-500
    allowed_roles: [...ADMIN, 'billing'],
    base_path: '/billing',
    home_path: '/billing',
    sidebar: [
      { title: 'FINANCES', items: [
        { icon: SquaresFour, label: 'Vue d\'ensemble', path: '/billing' },
        { icon: ChartLine, label: 'Revenus & rapports', path: '/billing/revenue' },
        { icon: HandCoins, label: 'Versements chauffeurs', path: '/billing/settlements' },
        { icon: Wallet, label: 'Payouts', path: '/billing/payout' },
      ]},
      { title: 'TRANSACTIONS', items: [
        { icon: HandCoins, label: 'Demandes retrait', path: '/billing/wallet-requests' },
        { icon: Gavel, label: 'Litiges', path: '/billing/disputes' },
        { icon: Ticket, label: 'Codes promo', path: '/billing/promocodes' },
        { icon: Gift, label: 'Cartes cadeaux', path: '/billing/giftcards' },
      ]},
      { title: 'CONFIGURATION', items: [
        { icon: Wallet, label: 'Méthodes paiement', path: '/billing/payment-methods' },
        { icon: SealCheck, label: 'Devise', path: '/billing/currency' },
        { icon: FileText, label: 'Rapport écart négociation', path: '/billing/reports/negotiation-gap' },
      ]},
    ],
  },

  // ============= 3. SERVER PANEL =============
  server: {
    key: 'server',
    label: 'Server',
    title: 'SB Drive Système',
    role_label: 'Administrateur Système',
    brand_color: '#6366F1', // indigo-500
    allowed_roles: [...ADMIN, 'sysadmin'],
    base_path: '/server',
    home_path: '/server',
    sidebar: [
      { title: 'INFRASTRUCTURE', items: [
        { icon: SquaresFour, label: 'Monitoring', path: '/server' },
        { icon: ChartLine, label: 'Stats serveur', path: '/server/monitoring' },
        { icon: FileText, label: 'Sauvegarde BDD', path: '/server/db-backup' },
      ]},
      { title: 'CONFIGURATION', items: [
        { icon: Gear, label: 'Paramètres généraux', path: '/server/settings' },
        { icon: Translate, label: 'Langue', path: '/server/language' },
        { icon: SealCheck, label: 'Devise', path: '/server/currency' },
        { icon: MapPin, label: 'Paramètres Maps', path: '/server/maps-api' },
        { icon: MagnifyingGlass, label: 'SEO', path: '/server/seo' },
      ]},
      { title: 'GÉO-ZONES', items: [
        { icon: MapPin, label: 'Geofences', path: '/server/geo-fence' },
        { icon: MapPin, label: 'Zones aéroport', path: '/server/airport' },
        { icon: Wallet, label: 'Zones SB PayGo', path: '/server/sbpaygo-zones' },
      ]},
      { title: 'COMMUNICATIONS', items: [
        { icon: EnvelopeSimple, label: 'Templates email', path: '/server/email-templates' },
        { icon: ChatCircleText, label: 'Templates SMS', path: '/server/sms-templates' },
        { icon: EnvelopeOpen, label: 'Notifications push', path: '/server/push-notifications' },
      ]},
      { title: 'RÉFÉRENTIELS', items: [
        { icon: Car, label: 'Marques véhicules', path: '/server/vehicle-makes' },
        { icon: Car, label: 'Modèles véhicules', path: '/server/vehicle-models' },
        { icon: Car, label: 'Types véhicules', path: '/server/vehicle-types' },
        { icon: SealCheck, label: 'Services principaux', path: '/server/master-services' },
        { icon: XCircleIcon(), label: 'Motifs annulation', path: '/server/cancel-reasons' },
      ]},
    ],
  },

  // ============= 4. USERS ADMIN PANEL =============
  users_admin: {
    key: 'users_admin',
    label: 'Users Admin',
    title: 'SB Drive CRM Clients',
    role_label: 'CRM Clients',
    brand_color: '#F59E0B', // amber-500
    allowed_roles: [...ADMIN, 'crm_user'],
    base_path: '/users-admin',
    home_path: '/users-admin',
    sidebar: [
      { title: 'CLIENTS', items: [
        { icon: SquaresFour, label: 'Vue d\'ensemble', path: '/users-admin' },
        { icon: UsersThree, label: 'Tous les utilisateurs', path: '/users-admin/users' },
        { icon: ShareNetwork, label: 'Programme parrainage', path: '/users-admin/referral' },
      ]},
      { title: 'MARKETING', items: [
        { icon: Newspaper, label: 'Actualités', path: '/users-admin/news' },
        { icon: EnvelopeSimple, label: 'Newsletter', path: '/users-admin/newsletter' },
        { icon: Image, label: 'Bannières', path: '/users-admin/banners' },
        { icon: Ticket, label: 'Codes promo', path: '/users-admin/promocodes' },
      ]},
      { title: 'SUPPORT', items: [
        { icon: ChatCircleText, label: 'Demandes contact', path: '/users-admin/contact-requests' },
        { icon: Warning, label: 'Alertes SOS', path: '/users-admin/sos-requests' },
        { icon: ChatCircleText, label: 'Aide commande', path: '/users-admin/order-help-requests' },
      ]},
    ],
  },

  // ============= 5. DRIVERS ADMIN PANEL =============
  drivers_admin: {
    key: 'drivers_admin',
    label: 'Drivers Admin',
    title: 'SB Drive CRM Chauffeurs',
    role_label: 'CRM Chauffeurs',
    brand_color: '#DC2626', // red-600
    allowed_roles: [...ADMIN, 'crm_driver'],
    base_path: '/drivers-admin',
    home_path: '/drivers-admin',
    sidebar: [
      { title: 'CHAUFFEURS', items: [
        { icon: SquaresFour, label: 'Vue d\'ensemble', path: '/drivers-admin' },
        { icon: Car, label: 'Tous les chauffeurs', path: '/drivers-admin/drivers' },
        { icon: Trophy, label: 'Prioritaires', path: '/drivers-admin/priority-drivers' },
        { icon: Star, label: 'Top chauffeurs', path: '/drivers-admin/top-drivers' },
      ]},
      { title: 'VÉRIFICATION', items: [
        { icon: FileText, label: 'Documents', path: '/drivers-admin/documents' },
        { icon: SealCheck, label: 'Demandes inscription', path: '/drivers-admin/requests' },
      ]},
      { title: 'PERFORMANCE', items: [
        { icon: Trophy, label: 'Récompenses', path: '/drivers-admin/rewards' },
        { icon: ChartLine, label: 'Rapports', path: '/drivers-admin/rewards-reports' },
        { icon: Path, label: 'Courses chauffeurs', path: '/drivers-admin/rides' },
      ]},
    ],
  },

  // ============= 6. MERCHANTS ADMIN PANEL =============
  merchants_admin: {
    key: 'merchants_admin',
    label: 'Merchants Admin',
    title: 'SB Drive CRM Marchands',
    role_label: 'CRM Marchands',
    brand_color: '#7C3AED', // violet-600
    allowed_roles: [...ADMIN, 'crm_merchant'],
    base_path: '/merchants-admin',
    home_path: '/merchants-admin',
    sidebar: [
      { title: 'MARCHANDS', items: [
        { icon: SquaresFour, label: 'Vue d\'ensemble', path: '/merchants-admin' },
        { icon: Storefront, label: 'Toutes les boutiques', path: '/merchants-admin/stores' },
        { icon: BuildingOffice, label: 'Entreprises', path: '/merchants-admin/company' },
        { icon: Bed, label: 'Hôtels', path: '/merchants-admin/hotels' },
        { icon: Storefront, label: 'Bornes SB Drive Tab', path: '/merchants-admin/kiosks' },
      ]},
      { title: 'COMMANDES', items: [
        { icon: ShoppingCart, label: 'Toutes les commandes', path: '/merchants-admin/store-orders' },
        { icon: Package, label: 'Livraisons colis', path: '/merchants-admin/parcels' },
      ]},
      { title: 'SPONSORING', items: [
        { icon: Star, label: 'Mise en avant', path: '/merchants-admin/featured-listings' },
      ]},
    ],
  },
};

// XCircle helper to avoid extra import at top
function XCircleIcon() {
  return FileText;
}

// Helper to filter sidebar items by search
export const filterSidebar = (sections, search) => {
  if (!search) return sections;
  const q = search.toLowerCase();
  return sections
    .map(s => ({
      ...s,
      items: s.items.filter(it =>
        it.label.toLowerCase().includes(q) ||
        (it.children && it.children.some(c => c.label.toLowerCase().includes(q)))
      ),
    }))
    .filter(s => s.items.length > 0);
};
