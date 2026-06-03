/**
 * serviceCatalog.js — central config powering the modern Services Hub + the
 * unified ServiceBookingFlow. Mirrors the taxi hub model: each bookable service
 * declares its provider catalog, sub-services (with pricing), and behaviour.
 */
import {
  Scissors, PawPrint, Car, Truck, Broom, Storefront,
  CarProfile, Package, UsersThree, ShoppingBag,
} from '@phosphor-icons/react';

// Bookable services — each opens the unified ServiceBookingFlow at /service/:key
export const SERVICE_CATALOG = [
  {
    key: 'beauty',
    title: 'Beauté & Bien-être',
    subtitle: 'Coiffure, spa, soins à domicile',
    collection: 'beauty_salons',
    category: 'beauty',
    color: '#EC4899',
    icon: Scissors,
    group: 'maison',
    addressRequired: true,
    subServices: [
      { name: 'Coiffure', base_price: 35 },
      { name: 'Spa & Massage', base_price: 60 },
      { name: 'Maquillage', base_price: 45 },
      { name: 'Manucure', base_price: 25 },
      { name: 'Soins Hommes', base_price: 30 },
    ],
  },
  {
    key: 'pets',
    title: 'Soins Animaux',
    subtitle: 'Toilettage, garde, vétérinaire',
    collection: 'pet_providers',
    category: 'pets',
    color: '#F97316',
    icon: PawPrint,
    group: 'maison',
    addressRequired: true,
    subServices: [
      { name: 'Toilettage', base_price: 40 },
      { name: 'Promenade', base_price: 15 },
      { name: 'Pension', base_price: 30 },
      { name: 'Vétérinaire', base_price: 50 },
    ],
  },
  {
    key: 'auto',
    title: 'Entretien Auto',
    subtitle: 'Lavage, mécanique, pneus',
    collection: 'car_services',
    category: 'car_services',
    color: '#3B82F6',
    icon: Car,
    group: 'maison',
    addressRequired: true,
    subServices: [
      { name: 'Lavage Auto', base_price: 20 },
      { name: 'Vidange', base_price: 80 },
      { name: 'Pneus', base_price: 60 },
      { name: 'Service Batterie', base_price: 120 },
      { name: 'Diagnostic', base_price: 45 },
    ],
  },
  {
    key: 'towing',
    title: 'Dépannage & Remorquage',
    subtitle: 'Assistance routière 24/7',
    collection: 'towing_partners',
    category: 'towing',
    color: '#EF4444',
    icon: Truck,
    group: 'urgent',
    addressRequired: true,
    instant: true,
    subServices: [
      { name: 'Remorquage', base_price: 90 },
      { name: 'Batterie à plat', base_price: 50 },
      { name: 'Pneu crevé', base_price: 60 },
      { name: 'Ouverture de porte', base_price: 70 },
      { name: 'Panne de carburant', base_price: 45 },
    ],
  },
  {
    key: 'home',
    title: 'Services à domicile',
    subtitle: 'Ménage, bricolage, plomberie',
    collection: 'ondemand_services',
    category: 'home_services',
    color: '#8B5CF6',
    icon: Broom,
    group: 'maison',
    addressRequired: true,
    subServices: [
      { name: 'Ménage', base_price: 25 },
      { name: 'Bricolage', base_price: 40 },
      { name: 'Plomberie', base_price: 55 },
      { name: 'Électricité', base_price: 55 },
      { name: 'Jardinage', base_price: 35 },
    ],
  },
  {
    key: 'nearby',
    title: 'Commerces & Réservations',
    subtitle: 'Restaurants & salons proches',
    collection: 'nearby_businesses',
    category: 'nearby',
    color: '#10B981',
    icon: Storefront,
    group: 'maison',
    addressRequired: false,
    subServices: [
      { name: 'Réservation', base_price: 0 },
    ],
  },
];

// Mobility / commerce shortcuts shown on the hub (navigate to existing pages)
export const HUB_LINKS = [
  { key: 'taxi', title: 'Taxi & VTC', subtitle: '16 modes de course', icon: CarProfile, color: '#0B1426', to: '/taxi', group: 'mobilite' },
  { key: 'delivery', title: 'Coursier Express', subtitle: 'Livraison & Genie', icon: Package, color: '#F59E0B', to: '/runner', group: 'mobilite' },
  { key: 'parcel', title: 'Envoi de Colis', subtitle: 'Petit & gros colis', icon: ShoppingBag, color: '#0EA5E9', to: '/parcel', group: 'mobilite' },
  { key: 'carpool', title: 'Covoiturage', subtitle: 'Trajets partagés', icon: UsersThree, color: '#14B8A6', to: '/carpool', group: 'mobilite' },
  { key: 'marketplace', title: 'Marketplace', subtitle: 'Achetez & vendez', icon: Storefront, color: '#6366F1', to: '/marketplace', group: 'mobilite' },
];

export const SERVICE_GROUPS = [
  { key: 'mobilite', title: 'Mobilité & Livraison' },
  { key: 'maison', title: 'À domicile & Bien-être' },
  { key: 'urgent', title: 'Urgences & Assistance' },
];

export const getServiceConfig = (key) => SERVICE_CATALOG.find((s) => s.key === key) || null;

// Map an existing list-page collection back to its service key (used to rewire cards)
export const collectionToServiceKey = (collection) =>
  (SERVICE_CATALOG.find((s) => s.collection === collection) || {}).key || null;
