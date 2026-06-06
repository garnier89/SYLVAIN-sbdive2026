/**
 * Mappings to render the dashboard-managed Home Categories CMS
 * (frontend uses Phosphor icons + Tailwind classes) inside the
 * React Native app (Ionicons + hex colors).
 *
 * Keeps the mobile home screen in sync with /api/home-categories so
 * any change made in the admin dashboard (add/hide/reorder/rename)
 * reflects automatically on mobile.
 */
import { Ionicons } from '@expo/vector-icons';

type IonName = keyof typeof Ionicons.glyphMap;

// Phosphor icon name (admin picker) -> closest Ionicons glyph.
const ICON_MAP: Record<string, IonName> = {
  Car: 'car-sport',
  Taxi: 'car',
  CarSimple: 'car-outline',
  CarProfile: 'car',
  Motorcycle: 'bicycle',
  Bicycle: 'bicycle',
  Van: 'bus',
  Truck: 'bus',
  UsersThree: 'people',
  UsersFour: 'people',
  User: 'person',
  Gavel: 'hammer',
  Calendar: 'calendar',
  CalendarPlus: 'calendar',
  Clock: 'time',
  MapTrifold: 'map',
  AirplaneTilt: 'airplane',
  PawPrint: 'paw',
  Dog: 'paw',
  UserPlus: 'person-add',
  HandHeart: 'heart',
  Briefcase: 'briefcase',
  Wheelchair: 'accessibility',
  Leaf: 'leaf',
  Lightning: 'flash',
  Key: 'key',
  Package: 'cube',
  ForkKnife: 'restaurant',
  Storefront: 'storefront',
  ShoppingBag: 'bag',
  Bag: 'bag',
  Wrench: 'construct',
  Hammer: 'hammer',
  PaintBrush: 'brush',
  Broom: 'sparkles',
  Heart: 'heart',
  Sparkle: 'sparkles',
  Scissors: 'cut',
  HairDryer: 'cut',
  MaskHappy: 'happy',
  HandSoap: 'water',
  Drop: 'water',
  GasPump: 'speedometer',
  BatteryFull: 'battery-full',
  Plug: 'flash',
  Coffee: 'cafe',
  Wine: 'wine',
  Stethoscope: 'medkit',
  FirstAid: 'medkit',
  VideoCamera: 'videocam',
  GridFour: 'grid',
  Wallet: 'wallet',
  Buildings: 'business',
  Star: 'star',
  MapPin: 'location',
};

export function phosphorToIonicon(name?: string): IonName {
  return (name && ICON_MAP[name]) || 'grid';
}

// Minimal Tailwind palette (shades used by the CMS seed + admin picker).
const PALETTE: Record<string, Record<string, string>> = {
  slate: { '400': '#94A3B8', '500': '#64748B', '600': '#475569', '700': '#334155' },
  gray: { '400': '#9CA3AF', '500': '#6B7280', '600': '#4B5563', '700': '#374151' },
  red: { '400': '#F87171', '500': '#EF4444', '600': '#DC2626', '700': '#B91C1C' },
  orange: { '400': '#FB923C', '500': '#F97316', '600': '#EA580C', '700': '#C2410C' },
  amber: { '400': '#FBBF24', '500': '#F59E0B', '600': '#D97706', '700': '#B45309' },
  yellow: { '400': '#FACC15', '500': '#EAB308', '600': '#CA8A04', '700': '#A16207' },
  lime: { '400': '#A3E635', '500': '#84CC16', '600': '#65A30D', '700': '#4D7C0F' },
  green: { '400': '#4ADE80', '500': '#22C55E', '600': '#16A34A', '700': '#15803D' },
  emerald: { '400': '#34D399', '500': '#10B981', '600': '#059669', '700': '#047857' },
  teal: { '400': '#2DD4BF', '500': '#14B8A6', '600': '#0D9488', '700': '#0F766E' },
  cyan: { '400': '#22D3EE', '500': '#06B6D4', '600': '#0891B2', '700': '#0E7490' },
  sky: { '400': '#38BDF8', '500': '#0EA5E9', '600': '#0284C7', '700': '#0369A1' },
  blue: { '400': '#60A5FA', '500': '#3B82F6', '600': '#2563EB', '700': '#1D4ED8' },
  indigo: { '400': '#818CF8', '500': '#6366F1', '600': '#4F46E5', '700': '#4338CA' },
  violet: { '400': '#A78BFA', '500': '#8B5CF6', '600': '#7C3AED', '700': '#6D28D9' },
  purple: { '400': '#C084FC', '500': '#A855F7', '600': '#9333EA', '700': '#7E22CE' },
  fuchsia: { '400': '#E879F9', '500': '#D946EF', '600': '#C026D3', '700': '#A21CAF' },
  pink: { '400': '#F472B6', '500': '#EC4899', '600': '#DB2777', '700': '#BE185D' },
  rose: { '400': '#FB7185', '500': '#F43F5E', '600': '#E11D48', '700': '#BE123C' },
};

// "text-amber-500" / "bg-blue-50" -> hex color (defaults to brand orange).
export function tailwindToHex(cls?: string, fallback = '#F97316'): string {
  if (!cls) return fallback;
  const m = cls.match(/(?:text|bg)-([a-z]+)-(\d{2,3})/);
  if (!m) return fallback;
  const [, color, shade] = m;
  const shades = PALETTE[color];
  if (!shades) return fallback;
  return shades[shade] || shades['500'] || fallback;
}

// CMS section -> mobile navigation screen name.
const SECTION_SCREEN: Record<string, string> = {
  taxi: 'Booking',
  delivery: 'Delivery',
  ondemand: 'Runner',
  beauty: 'Beauty',
  pet: 'Pet',
  carcare: 'CarCare',
  towing: 'Towing',
  nearby: 'Nearby',
};

// Resolve a CMS item to a {screen, params} navigation target.
export function routeToNav(section: string, targetRoute?: string) {
  const screen = SECTION_SCREEN[section] || 'Booking';
  let mode: string | undefined;
  if (targetRoute && targetRoute.includes('mode=')) {
    mode = targetRoute.split('mode=')[1].split('&')[0];
  }
  return { screen, params: { service: section, mode } };
}

// Visual style (Phosphor icon name + Tailwind color class) per taxi category KEY,
// so taxi tiles built from service_categories render like the CMS tiles.
const TAXI_CAT_STYLE: Record<string, { icon: string; color: string }> = {
  standard: { icon: 'Car', color: 'text-amber-500' },
  pool: { icon: 'UsersThree', color: 'text-teal-500' },
  rental: { icon: 'Taxi', color: 'text-blue-500' },
  buddy_driver: { icon: 'User', color: 'text-orange-700' },
  bidding: { icon: 'Gavel', color: 'text-pink-500' },
  intercity: { icon: 'Truck', color: 'text-green-600' },
  book_later: { icon: 'Calendar', color: 'text-cyan-600' },
  electric: { icon: 'Lightning', color: 'text-emerald-600' },
  moto: { icon: 'Motorcycle', color: 'text-orange-500' },
  moto_rental: { icon: 'Key', color: 'text-blue-500' },
  airport: { icon: 'AirplaneTilt', color: 'text-sky-500' },
  pets: { icon: 'PawPrint', color: 'text-amber-600' },
  book_for_someone: { icon: 'UsersFour', color: 'text-purple-500' },
  tuktuk: { icon: 'CarSimple', color: 'text-yellow-600' },
  assist: { icon: 'HandHeart', color: 'text-red-500' },
  corporate: { icon: 'Briefcase', color: 'text-slate-600' },
  access: { icon: 'Wheelchair', color: 'text-sky-600' },
};

export function taxiCatStyle(key: string) {
  return TAXI_CAT_STYLE[key] || { icon: 'Car', color: 'text-gray-600' };
}
