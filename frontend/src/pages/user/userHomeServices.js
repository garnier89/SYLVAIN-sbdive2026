// Static service-tile catalogs for the client Home (UserHome.js).
// Extracted to keep UserHome focused on rendering/state. These are FALLBACKS:
// admin-configured categories (service_categories / home_categories CMS) override
// them at runtime. Pure data — no component state, no translations.
import {
  Car, UsersThree, Taxi, User, Gavel, Truck, Calendar, Lightning, Bicycle, Key,
  AirplaneTilt, PawPrint, UsersFour, CarSimple, Heart, Briefcase, Wheelchair,
  GridFour, ForkKnife, Storefront, Wrench, GasPump, HairDryer, MaskHappy, Sparkle,
  Drop, PaintBrush, HandSoap, Scissors, Dog, Hammer, Broom, BatteryFull, ShoppingBag,
  Plug, Coffee, Wine, MapPin,
} from '@phosphor-icons/react';

// Visual style (icon + pastel colors) per taxi category KEY. Names/order/active come
// from "Gérer les catégories" (service_categories); this map only handles the look.
export const TAXI_DEFAULT = { icon: Car, bg: 'bg-gray-50', iconColor: 'text-gray-600' };
export const TAXI_VISUAL = {
  standard: { icon: Car, bg: 'bg-amber-50', iconColor: 'text-amber-500' },
  pool: { icon: UsersThree, bg: 'bg-teal-50', iconColor: 'text-teal-500' },
  rental: { icon: Taxi, bg: 'bg-blue-50', iconColor: 'text-blue-500' },
  buddy_driver: { icon: User, bg: 'bg-orange-50', iconColor: 'text-orange-700' },
  bidding: { icon: Gavel, bg: 'bg-pink-50', iconColor: 'text-pink-500' },
  intercity: { icon: Truck, bg: 'bg-green-50', iconColor: 'text-green-600' },
  book_later: { icon: Calendar, bg: 'bg-cyan-50', iconColor: 'text-cyan-600' },
  electric: { icon: Lightning, bg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
  moto: { icon: Bicycle, bg: 'bg-orange-50', iconColor: 'text-orange-500' },
  moto_rental: { icon: Key, bg: 'bg-blue-50', iconColor: 'text-blue-500' },
  airport: { icon: AirplaneTilt, bg: 'bg-sky-50', iconColor: 'text-sky-500' },
  pets: { icon: PawPrint, bg: 'bg-amber-50', iconColor: 'text-amber-600' },
  book_for_someone: { icon: UsersFour, bg: 'bg-purple-50', iconColor: 'text-purple-500' },
  tuktuk: { icon: CarSimple, bg: 'bg-yellow-50', iconColor: 'text-yellow-600' },
  assist: { icon: Heart, bg: 'bg-red-50', iconColor: 'text-red-500' },
  corporate: { icon: Briefcase, bg: 'bg-slate-50', iconColor: 'text-slate-600' },
  access: { icon: Wheelchair, bg: 'bg-sky-50', iconColor: 'text-sky-600' },
};

// Taxi fallback (8 items): mirrors the canonical first-7 modes + "Tous les Taxis".
export const taxiServices = [
  { id: 'taxi-standard', name: 'Taxi VTC', icon: Car, bg: 'bg-amber-50', iconColor: 'text-amber-500', path: '/course?mode=standard' },
  { id: 'taxi-pool', name: 'Pool-partage', icon: UsersThree, bg: 'bg-teal-50', iconColor: 'text-teal-500', path: '/course?mode=pool' },
  { id: 'taxi-moto', name: 'Moto Taxi', icon: Bicycle, bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/course?mode=moto' },
  { id: 'taxi-electric', name: 'Électric', icon: Lightning, bg: 'bg-emerald-50', iconColor: 'text-emerald-600', path: '/course?mode=electric' },
  { id: 'taxi-book_later', name: 'Planifiez\nvotre trajet', icon: Calendar, bg: 'bg-cyan-50', iconColor: 'text-cyan-600', path: '/course?mode=book_later' },
  { id: 'taxi-rental', name: 'Mise à Dispo', icon: Taxi, bg: 'bg-blue-50', iconColor: 'text-blue-500', path: '/course?mode=rental' },
  { id: 'taxi-intercity', name: 'Intercité', icon: Truck, bg: 'bg-green-50', iconColor: 'text-green-600', path: '/course?mode=intercity' },
  { id: 'more-taxi', name: 'Tous les\nTaxis', icon: GridFour, bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/taxi' },
];

export const deliveryServices = [
  { id: 'food-delivery', name: 'Livraison\nRepas', icon: ForkKnife, bg: 'bg-rose-50', iconColor: 'text-rose-500', path: '/food' },
  { id: 'grocery-delivery', name: 'Livraison\nCourses', icon: Storefront, bg: 'bg-emerald-50', iconColor: 'text-emerald-500', path: '/food?type=grocery' },
  { id: 'runner-courier', name: 'Coursier\nExpress', icon: Lightning, bg: 'bg-amber-50', iconColor: 'text-amber-500', path: '/runner' },
  { id: 'more-delivery', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-blue-50', iconColor: 'text-blue-500', path: '/all-delivery' },
];

export const videoCategories = [
  { id: 'tutor', name: 'Tuteur' },
  { id: 'lawyer', name: 'Avocat' },
  { id: 'astrologer', name: 'Astrologue' },
];

export const onDemandServices = [
  { id: 'sb-tracking', name: 'SB\nTracking', icon: MapPin, bg: 'bg-blue-50', iconColor: 'text-blue-600', path: '/sb-tracking' },
  { id: 'handyman', name: 'Bricolage', icon: Wrench, bg: 'bg-fuchsia-50', iconColor: 'text-fuchsia-500', path: '/service-providers/bricoleur' },
  { id: 'massage', name: 'Massage', icon: Heart, bg: 'bg-sky-50', iconColor: 'text-sky-500', path: '/service-providers/massage' },
  { id: 'mechanic', name: 'Mécanique', icon: GasPump, bg: 'bg-green-50', iconColor: 'text-green-500', path: '/service-providers/mecanicien' },
  { id: 'more-ondemand', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-emerald-50', iconColor: 'text-emerald-600', path: '/all-services' },
];

export const beautyServices = [
  { id: 'hair-care', name: 'Soins\nCheveux', icon: HairDryer, bg: 'bg-amber-50', iconColor: 'text-amber-600', path: '/beauty' },
  { id: 'skin-facial', name: 'Skin\n& Facial', icon: MaskHappy, bg: 'bg-green-50', iconColor: 'text-green-600', path: '/beauty' },
  { id: 'nail-polish', name: 'Vernis\nOngles', icon: Sparkle, bg: 'bg-rose-50', iconColor: 'text-rose-500', path: '/beauty' },
  { id: 'hair-removal', name: 'Épilation', icon: Drop, bg: 'bg-yellow-50', iconColor: 'text-yellow-600', path: '/beauty' },
  { id: 'makeup', name: 'Maquillage\n& Coiffure', icon: PaintBrush, bg: 'bg-purple-50', iconColor: 'text-purple-500', path: '/beauty' },
  { id: 'massage-spa', name: 'Massage\n& Spa', icon: HandSoap, bg: 'bg-pink-50', iconColor: 'text-pink-500', path: '/beauty' },
  { id: 'mens-grooming', name: 'Soins\nHommes', icon: Scissors, bg: 'bg-indigo-50', iconColor: 'text-indigo-600', path: '/beauty' },
  { id: 'more-beauty', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-fuchsia-50', iconColor: 'text-fuchsia-500', path: '/beauty' },
];

export const petServices = [
  { id: 'grooming', name: 'Toilettage', icon: PawPrint, bg: 'bg-amber-50', iconColor: 'text-amber-600', path: '/pet-care' },
  { id: 'walking', name: 'Promenade', icon: Dog, bg: 'bg-green-50', iconColor: 'text-green-600', path: '/pet-care' },
  { id: 'more-pet', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-slate-100', iconColor: 'text-gray-600', path: '/pet-care' },
];

export const bidServices = [
  { id: 'electrician', name: 'Électricien', icon: Lightning, bg: 'bg-yellow-50', iconColor: 'text-yellow-600', path: '/services-bidding?cat=bcat_electric' },
  { id: 'plumber', name: 'Plombier', icon: Drop, bg: 'bg-blue-50', iconColor: 'text-blue-500', path: '/services-bidding?cat=bcat_plumber' },
  { id: 'carpenter', name: 'Menuisier', icon: Hammer, bg: 'bg-orange-50', iconColor: 'text-orange-600', path: '/services-bidding?cat=bcat_carpenter' },
  { id: 'painters', name: 'Peintres', icon: PaintBrush, bg: 'bg-indigo-50', iconColor: 'text-indigo-500', path: '/services-bidding?cat=bcat_painter' },
  { id: 'handyman-bid', name: 'Bricoleur', icon: Wrench, bg: 'bg-red-50', iconColor: 'text-red-500', path: '/services-bidding?cat=bcat_handyman' },
  { id: 'home-cleaning', name: 'Ménage\nMaison', icon: Broom, bg: 'bg-teal-50', iconColor: 'text-teal-600', path: '/services-bidding?cat=bcat_cleaning' },
];

export const carCareServices = [
  { id: 'car-wash', name: 'Lavage\nAuto & Spa', icon: CarSimple, bg: 'bg-blue-50', iconColor: 'text-blue-500', path: '/car-care' },
  { id: 'battery', name: 'Service\nBatterie', icon: BatteryFull, bg: 'bg-green-50', iconColor: 'text-green-600', path: '/car-care' },
  { id: 'shop', name: 'Boutique', icon: ShoppingBag, bg: 'bg-amber-50', iconColor: 'text-amber-600', path: '/car-care' },
  { id: 'fuel', name: 'Livraison\nCarburant', icon: GasPump, bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/car-care' },
  { id: 'bike-wash', name: 'Lavage\nVélos & Spa', icon: Bicycle, bg: 'bg-cyan-50', iconColor: 'text-cyan-600', path: '/car-care' },
  { id: 'ev-charging', name: 'Recharge\nEV', icon: Plug, bg: 'bg-emerald-50', iconColor: 'text-emerald-600', path: '/car-care' },
  { id: 'car-keylocks', name: 'Serrurerie\nAuto', icon: Key, bg: 'bg-yellow-50', iconColor: 'text-yellow-700', path: '/car-care' },
  { id: 'more-carcare', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-gray-50', iconColor: 'text-gray-600', path: '/car-care' },
];

export const towingServices = [
  { id: 'emergency-towing', name: 'Remorquage\nUrgence', icon: Truck, bg: 'bg-slate-100', iconColor: 'text-red-600', path: '/towing' },
  { id: 'flatbed-towing', name: 'Plateau', icon: Truck, bg: 'bg-slate-100', iconColor: 'text-yellow-600', path: '/towing' },
  { id: 'vehicle-recovery', name: 'Récupération\nVéhicule', icon: Car, bg: 'bg-slate-100', iconColor: 'text-blue-500', path: '/towing' },
  { id: 'flat-tire', name: 'Pneu\nCrevé', icon: CarSimple, bg: 'bg-slate-100', iconColor: 'text-amber-600', path: '/towing' },
  { id: 'lockout', name: 'Serrure\nVoiture', icon: Key, bg: 'bg-slate-100', iconColor: 'text-purple-500', path: '/towing' },
  { id: 'more-towing', name: 'Plus de\nServices', icon: GridFour, bg: 'bg-slate-100', iconColor: 'text-gray-600', path: '/towing' },
];

export const nearbyServices = [
  { id: 'cafes', name: 'Cafés', icon: Coffee, bg: 'bg-sky-50', iconColor: 'text-amber-600', path: '/nearby' },
  { id: 'salons', name: 'Salons', icon: Scissors, bg: 'bg-sky-50', iconColor: 'text-pink-500', path: '/nearby' },
  { id: 'bars', name: 'Bars', icon: Wine, bg: 'bg-sky-50', iconColor: 'text-purple-500', path: '/nearby' },
  { id: 'more-nearby', name: 'Plus', icon: GridFour, bg: 'bg-sky-50', iconColor: 'text-indigo-500', path: '/nearby' },
];
