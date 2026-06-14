// Métadonnées partagées « SB Tracking » (flotte).
import { Car, Truck, Van, Motorcycle, Bus, Tractor, Cube } from '@phosphor-icons/react';

export const VTYPE_META = {
  car: { label: 'Voiture', Icon: Car },
  truck: { label: 'Camion', Icon: Truck },
  van: { label: 'Utilitaire', Icon: Van },
  moto: { label: 'Moto', Icon: Motorcycle },
  bus: { label: 'Bus', Icon: Bus },
  tractor: { label: 'Tracteur', Icon: Tractor },
  other: { label: 'Autre', Icon: Cube },
};
export const vtypeMeta = (t) => VTYPE_META[t] || VTYPE_META.other;

export const STATUS_META = {
  moving: { label: 'En route', color: '#10B981', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  stopped: { label: 'Arrêté', color: '#F59E0B', bg: 'bg-amber-50', text: 'text-amber-600' },
  parked: { label: 'Stationné', color: '#3B82F6', bg: 'bg-blue-50', text: 'text-blue-600' },
  offline: { label: 'Hors ligne', color: '#9CA3AF', bg: 'bg-gray-100', text: 'text-gray-500' },
};
export const statusMeta = (s) => STATUS_META[s] || STATUS_META.offline;

export const ALERT_META = {
  speeding: { label: 'Excès de vitesse', color: 'text-red-600', bg: 'bg-red-50' },
  geofence_exit: { label: 'Sortie de zone', color: 'text-orange-600', bg: 'bg-orange-50' },
  geofence_enter: { label: 'Entrée en zone', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  unauthorized_start: { label: 'Démarrage non autorisé', color: 'text-red-700', bg: 'bg-red-50' },
  low_battery: { label: 'Batterie faible', color: 'text-amber-600', bg: 'bg-amber-50' },
  crash: { label: 'Choc détecté', color: 'text-red-700', bg: 'bg-red-50' },
  command: { label: 'Commande', color: 'text-gray-600', bg: 'bg-gray-50' },
};
export const alertMeta = (t) => ALERT_META[t] || ALERT_META.command;

export const fmtAgo = (iso) => {
  if (!iso) return '—';
  try {
    const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return `il y a ${s}s`;
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
};
