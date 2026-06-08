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
  Confetti, SteeringWheel, Snowflake,
} from '@phosphor-icons/react';

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
  Confetti, SteeringWheel, Snowflake,
};

const DynamicIcon = ({ name, imageUrl, size = 28, weight = 'duotone', className = '' }) => {
  if (imageUrl) {
    return <img src={imageUrl} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className={className} />;
  }
  const Cmp = ICON_MAP[name] || GridFour;
  return <Cmp size={size} weight={weight} className={className} />;
};

export default DynamicIcon;
