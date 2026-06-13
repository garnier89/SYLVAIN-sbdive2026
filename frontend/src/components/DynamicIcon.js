/**
 * DynamicIcon — renders a Phosphor icon by name (from the admin icon library)
 * or a custom uploaded image (image_url). Used by the configurable home categories.
 */
import React from 'react';
import {
  Car, Taxi, CarSimple, CarProfile, Motorcycle, Bicycle, Van,
  Truck, UsersThree, UsersFour, User, Gavel, Calendar, CalendarPlus,
  Clock, MapTrifold, AirplaneTilt, PawPrint, Dog, UserPlus, HandHeart,
  Briefcase, Wheelchair, Leaf, Lightning, Key, Package, ForkKnife,
  Storefront, ShoppingBag, Bag, Wrench, Hammer, PaintBrush, Broom,
  Heart, Sparkle, Scissors, HairDryer, MaskHappy, HandSoap, Drop,
  GasPump, BatteryFull, Plug, Coffee, Wine, Stethoscope, FirstAid,
  VideoCamera, GridFour, Wallet, Buildings, Star, MapPin,
  GraduationCap, Scales, Moon, Bank, Bed, Tree, MusicNotes, BookOpen,
  Confetti, SteeringWheel, Snowflake, Suitcase, Barbell,
} from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;
// Uploaded images are stored as same-origin relative paths (/api/uploads/{id}).
// Resolve them against the backend URL so <img> works from any origin.
export const resolveImageUrl = (url) =>
  (typeof url === 'string' && url.startsWith('/api/') ? `${API}${url}` : url);

export const ICON_MAP = {
  Car, Taxi, CarSimple, CarProfile, Motorcycle, Bicycle, Van,
  Truck, UsersThree, UsersFour, User, Gavel, Calendar, CalendarPlus,
  Clock, MapTrifold, AirplaneTilt, PawPrint, Dog, UserPlus, HandHeart,
  Briefcase, Wheelchair, Leaf, Lightning, Key, Package, ForkKnife,
  Storefront, ShoppingBag, Bag, Wrench, Hammer, PaintBrush, Broom,
  Heart, Sparkle, Scissors, HairDryer, MaskHappy, HandSoap, Drop,
  GasPump, BatteryFull, Plug, Coffee, Wine, Stethoscope, FirstAid,
  VideoCamera, GridFour, Wallet, Buildings, Star, MapPin,
  GraduationCap, Scales, Moon, Bank, Bed, Tree, MusicNotes, BookOpen,
  Confetti, SteeringWheel, Snowflake, Suitcase, Barbell,
};

const DynamicIcon = ({ name, imageUrl, size = 28, weight = 'duotone', className = '' }) => {
  if (imageUrl) {
    return <img src={resolveImageUrl(imageUrl)} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className={className} />;
  }
  const Cmp = ICON_MAP[name] || GridFour;
  return <Cmp size={size} weight={weight} className={className} />;
};

// True when a service-category `icon` value is an uploaded image rather than an emoji.
export const isImgIcon = (s) =>
  typeof s === 'string' && (s.startsWith('http') || s.startsWith('data:') || s.startsWith('/api/'));

/**
 * CategoryGlyph — renders a service-category icon set from the admin dashboard.
 * Supports an uploaded image (base64 / url / /api/) OR an emoji string, and
 * falls back to a Phosphor component when no custom icon is defined.
 */
export const CategoryGlyph = ({ icon, Fallback, size = 24, weight = 'duotone', className = '' }) => {
  if (isImgIcon(icon)) {
    return <img src={resolveImageUrl(icon)} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className={className} />;
  }
  if (typeof icon === 'string' && icon.trim()) {
    return <span style={{ fontSize: size, lineHeight: 1 }} className={className}>{icon.trim()}</span>;
  }
  return Fallback ? <Fallback size={size} weight={weight} className={className} /> : <GridFour size={size} weight={weight} className={className} />;
};

export default DynamicIcon;
