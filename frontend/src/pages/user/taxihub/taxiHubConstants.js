/**
 * TaxiHub — données statiques (16 modes V3Cube, catégories, forfaits, paiements).
 * Extrait de TaxiHubPage.js pour alléger le composant principal.
 */
import {
  CarProfile, UsersThree, Leaf, Motorcycle,
  Clock, MapTrifold, CalendarPlus, Key, Gavel, AirplaneTilt, PawPrint, UserPlus,
  Van, HandHeart, Briefcase, Wheelchair, User,
  Money, CreditCard, Wallet,
} from '@phosphor-icons/react';

// ── 16 modes configuration ───────────────────────────────────────────────
export const MODES = [
  // Everyday
  { id: 'standard', cat: 'everyday', label: 'Taxi VTC', sub: 'Course standard', icon: CarProfile, color: '#0B1426', vehicle: 'sb', ride_type: 'instant', panel: null, badge: null, cta: 'Commander' },
  { id: 'pool', cat: 'everyday', label: 'Pool', sub: 'Taxi partagé', icon: UsersThree, color: '#3B82F6', vehicle: 'pool', ride_type: 'instant', panel: null, badge: 'Partagé', cta: 'Commander Pool' },
  { id: 'electric', cat: 'everyday', label: 'Green', sub: '100% électrique', icon: Leaf, color: '#10B981', vehicle: 'electric', ride_type: 'instant', panel: null, badge: 'Eco', cta: 'Commander Green' },
  { id: 'moto', cat: 'everyday', label: 'Moto', sub: 'Rapide en ville', icon: Motorcycle, color: '#EF4444', vehicle: 'moto', ride_type: 'instant', panel: null, badge: 'Fast', cta: 'Commander Moto' },
  // Time & Distance
  { id: 'rental', cat: 'time', label: 'Mise à Dispo', sub: 'Forfait horaire', icon: Clock, color: '#F59E0B', vehicle: 'confort', ride_type: 'rental', panel: 'rental', badge: null, cta: 'Réserver' },
  { id: 'intercity', cat: 'time', label: 'Intercité', sub: 'Longue distance', icon: MapTrifold, color: '#8B5CF6', vehicle: 'confort', ride_type: 'intercity', panel: 'datetime', badge: null, cta: 'Planifier le voyage' },
  { id: 'book_later', cat: 'time', label: 'Plus Tard', sub: 'Programmer', icon: CalendarPlus, color: '#0EA5E9', vehicle: 'sb', ride_type: 'scheduled', panel: 'datetime', badge: null, cta: 'Planifier' },
  { id: 'moto_rental', cat: 'time', label: 'Loc Moto', sub: 'Moto à l\'heure', icon: Key, color: '#DC2626', vehicle: 'moto', ride_type: 'rental', panel: 'rental', badge: null, cta: 'Louer Moto' },
  { id: 'buddy_driver', cat: 'time', label: 'Chauffeur Privé', sub: 'À l\'heure', icon: User, color: '#10B981', vehicle: 'confort', ride_type: 'buddy_driver', panel: 'buddy', badge: null, cta: 'Réserver' },
  // Specialty & Inclusive
  { id: 'bidding', cat: 'special', label: 'Enchères', sub: 'Proposez votre prix', icon: Gavel, color: '#EC4899', vehicle: 'sb', ride_type: 'instant', panel: 'bidding', badge: null, cta: 'Proposer un prix' },
  { id: 'airport', cat: 'special', label: 'Aéroport', sub: 'Suivi de vol', icon: AirplaneTilt, color: '#0EA5E9', vehicle: 'airport', ride_type: 'airport', panel: 'flight', badge: 'Fixe', cta: 'Réserver Aéroport' },
  { id: 'pets', cat: 'special', label: 'Animaux', sub: 'Pet friendly', icon: PawPrint, color: '#F97316', vehicle: 'pets', ride_type: 'instant', panel: 'pets', badge: null, cta: 'Commander' },
  { id: 'book_for_someone', cat: 'special', label: 'Pour un proche', sub: 'Réserver pour autrui', icon: UserPlus, color: '#14B8A6', vehicle: 'sb', ride_type: 'instant', panel: 'contact', badge: null, cta: 'Commander' },
  { id: 'tuktuk', cat: 'special', label: 'TukTuk', sub: 'Fun & local', icon: Van, color: '#84CC16', vehicle: 'tuktuk', ride_type: 'instant', panel: null, badge: null, cta: 'Commander TukTuk' },
  { id: 'assist', cat: 'special', label: 'Assistance', sub: 'Aide à la personne', icon: HandHeart, color: '#F43F5E', vehicle: 'assist', ride_type: 'instant', panel: 'assist', badge: null, cta: 'Demander Assistance' },
  { id: 'corporate', cat: 'special', label: 'Corporate', sub: 'Facturé entreprise', icon: Briefcase, color: '#334155', vehicle: 'confort', ride_type: 'corporate', panel: 'corporate', badge: null, cta: 'Commander Pro' },
  { id: 'access', cat: 'special', label: 'PMR', sub: 'Accès fauteuil', icon: Wheelchair, color: '#6366F1', vehicle: 'accessible', ride_type: 'instant', panel: null, badge: null, cta: 'Commander PMR' },
];

export const CATS = [
  { key: 'everyday', title: 'Au quotidien' },
  { key: 'time', title: 'Temps & Distance' },
  { key: 'special', title: 'Spécialisé & Inclusif' },
];

export const RENTAL_PACKAGES = [
  { slug: '2h_20km', label: '2h', km: 20, hours: 2 },
  { slug: '4h_40km', label: '4h', km: 40, hours: 4 },
  { slug: '8h_80km', label: '8h', km: 80, hours: 8 },
];

export const ASSIST_OPTIONS = [
  { k: 'wheelchair', l: 'Fauteuil roulant' },
  { k: 'elderly', l: 'Personne âgée' },
  { k: 'medical', l: 'Sortie médicale' },
  { k: 'luggage', l: 'Aide bagages' },
];

export const PAYMENT_METHODS = [
  { k: 'cash', l: 'Espèces', icon: Money },
  { k: 'card', l: 'Carte', icon: CreditCard },
  { k: 'sbpaygo', l: 'SB PayGo', icon: Wallet },
];
