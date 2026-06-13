// Métadonnées partagées « SB Événement » (catégories, formatage).
import { MusicNotes, Confetti, Sparkle, Trophy, Microphone, Martini, Palette } from '@phosphor-icons/react';

export const EVENT_CATEGORIES = [
  { slug: 'concert', label: 'Concerts', Icon: MusicNotes, color: 'text-indigo-500', bg: 'bg-indigo-50' },
  { slug: 'festival', label: 'Festivals', Icon: Confetti, color: 'text-pink-500', bg: 'bg-pink-50' },
  { slug: 'carnaval', label: 'Carnaval', Icon: Sparkle, color: 'text-amber-500', bg: 'bg-amber-50' },
  { slug: 'sport', label: 'Sport', Icon: Trophy, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  { slug: 'conference', label: 'Conférences', Icon: Microphone, color: 'text-blue-500', bg: 'bg-blue-50' },
  { slug: 'soiree', label: 'Soirées', Icon: Martini, color: 'text-purple-500', bg: 'bg-purple-50' },
  { slug: 'exposition', label: 'Expositions', Icon: Palette, color: 'text-teal-500', bg: 'bg-teal-50' },
];

export const catMeta = (slug) => EVENT_CATEGORIES.find((c) => c.slug === slug) || EVENT_CATEGORIES[0];

export const fmtEventDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
};

export const fmtPrice = (v, currency = 'EUR') =>
  v === 0 || v === '0' ? 'Gratuit' : `${Number(v).toFixed(2)} ${currency === 'EUR' ? '€' : currency}`;

// Always shows an amount (used on financial KPI tiles where '0,00 €' is clearer than 'Gratuit').
export const fmtMoney = (v, currency = 'EUR') =>
  `${Number(v || 0).toFixed(2)} ${currency === 'EUR' ? '€' : currency}`;

export const minPrice = (tiers = []) =>
  tiers.length ? Math.min(...tiers.map((t) => Number(t.price || 0))) : 0;

export const TRANSPORT_CHOICES = [
  { key: 'none', label: 'Aucun transport', desc: "J'organise mon trajet" },
  { key: 'one_way', label: 'Aller simple', desc: 'SB Drive vers le lieu' },
  { key: 'round_trip', label: 'Aller-retour', desc: 'Aller + retour réservés' },
  { key: 'private_driver', label: 'Chauffeur privé', desc: 'Course privée dédiée' },
  { key: 'shuttle', label: 'Navette collective', desc: 'Bientôt (Phase 2)', disabled: true },
];

export const transportLabel = (key) => TRANSPORT_CHOICES.find((c) => c.key === key)?.label || 'Aucun';

// Default config for the optional "Pass Premium" (VIP bundle: ticket + transport + perks).
export const BLANK_PREMIUM_PASS = {
  enabled: false, name: 'Pass VIP', price: 0, quantity_total: 50,
  transport_option: 'round_trip', perks: [],
};
