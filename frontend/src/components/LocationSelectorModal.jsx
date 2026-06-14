/**
 * LocationSelectorModal — sélecteur de zone/ville pour l'utilisateur.
 * Permet de choisir manuellement sa ville (zone de service) ou d'utiliser le GPS.
 * Le choix est persisté via userLocation et propagé à l'app (accueil, courses, cartes).
 */
import React, { useState } from 'react';
import { MapPin, NavigationArrow, X, Check } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { CITY_PRESETS, setStoredLocation, locateWithFallback } from '../lib/userLocation';

const LocationSelectorModal = ({ open, currentLabel, onClose, onSelect }) => {
  const [locating, setLocating] = useState(false);
  if (!open) return null;

  const choose = (loc) => {
    setStoredLocation(loc);
    onSelect?.(loc);
    onClose?.();
  };

  const useGps = async () => {
    setLocating(true);
    try {
      const loc = await locateWithFallback({ preferGps: true });
      const label = loc.address || 'Ma position';
      choose({ lat: loc.lat, lng: loc.lng, label });
      toast.success('Position mise à jour');
    } catch {
      toast.error('Impossible de récupérer votre position');
    } finally { setLocating(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" data-testid="location-selector-modal">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl sm:rounded-3xl p-5 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-[#1F2430]">Choisir ma zone</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="location-modal-close"><X size={18} /></button>
        </div>

        <button onClick={useGps} disabled={locating}
          className="w-full flex items-center gap-3 p-3 rounded-2xl border border-[#FF5000]/30 bg-[#FFF0E5] mb-3 disabled:opacity-60"
          data-testid="location-use-gps">
          <NavigationArrow size={20} weight="fill" className="text-[#FF5000]" />
          <span className="text-sm font-bold text-[#FF5000]">{locating ? 'Localisation…' : 'Utiliser ma position actuelle (GPS)'}</span>
        </button>

        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Villes</p>
        <div className="space-y-1.5">
          {CITY_PRESETS.map((c) => {
            const active = currentLabel && currentLabel.startsWith(c.label.split(',')[0]);
            return (
              <button key={c.label} onClick={() => choose(c)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${active ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-gray-50 border border-transparent'}`}
                data-testid={`location-city-${c.label.split(',')[0].toLowerCase().replace(/\s+/g, '-')}`}>
                <MapPin size={18} weight="fill" className={active ? 'text-emerald-600' : 'text-gray-400'} />
                <span className="flex-1 text-sm font-semibold text-[#334155]">{c.label}</span>
                {active && <Check size={18} className="text-emerald-600" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LocationSelectorModal;
