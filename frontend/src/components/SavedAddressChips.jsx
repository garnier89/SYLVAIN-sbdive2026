import React, { useEffect, useState, useCallback } from 'react';
import { House, Briefcase, MapPin } from '@phosphor-icons/react';
import { placesAPI } from '../services/api';
import { toast } from 'sonner';

/**
 * SavedAddressChips — raccourcis « 1 tap » au-dessus d'un champ d'adresse.
 * Affiche Maison / Travail / adresses récentes (backend partagé /places) et
 * permet d'enregistrer l'adresse choisie comme Maison ou Travail.
 *
 * Props:
 *  - onSelect(loc)  : appelé avec { address, lat, lng } quand une puce est touchée.
 *  - selected       : adresse actuellement choisie { address, lat, lng } (pour proposer l'enregistrement).
 *  - accent         : couleur d'accent des puces.
 */
const shorten = (addr = '') => {
  const first = addr.split(',')[0];
  return first.length > 22 ? `${first.slice(0, 22)}…` : first;
};

const Chip = ({ icon: Icon, label, onClick, accent, testId }) => (
  <button type="button" onClick={onClick} data-testid={testId}
    className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-700 text-xs font-semibold active:opacity-70 whitespace-nowrap">
    <Icon size={13} weight="fill" style={{ color: accent }} />
    {label}
  </button>
);

export const SavedAddressChips = ({ onSelect, selected, accent = '#FF4500', className = '', testIdPrefix = 'saved-addr' }) => {
  const [places, setPlaces] = useState({ home: null, work: null, recent: [] });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    placesAPI.getSaved().then((r) => setPlaces(r.data || { recent: [] })).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const pick = (p) => { if (p && p.lat != null) onSelect({ address: p.address, lat: p.lat, lng: p.lng }); };

  const saveAs = async (kind) => {
    if (selected?.lat == null) return;
    setSaving(true);
    try {
      await placesAPI.setSaved(kind, { address: selected.address, lat: selected.lat, lng: selected.lng });
      toast.success(kind === 'home' ? 'Enregistré comme Maison 🏠' : 'Enregistré comme Travail 💼');
      load();
    } catch { toast.error("Échec de l'enregistrement"); } finally { setSaving(false); }
  };

  const recent = (places.recent || []).filter((r) => r && r.lat != null).slice(0, 3);
  const hasChips = !!(places.home || places.work || recent.length > 0);
  const isSameAs = (p) => p && selected?.address && p.address === selected.address;
  const canSaveHome = selected?.lat != null && !isSameAs(places.home);
  const canSaveWork = selected?.lat != null && !isSameAs(places.work);

  if (!hasChips && selected?.lat == null) return null;

  return (
    <div className={`space-y-2 ${className}`} data-testid={`${testIdPrefix}-chips`}>
      {hasChips && (
        <div className="flex gap-2 overflow-x-auto pb-1 px-0.5 hide-scrollbar">
          {places.home && <Chip icon={House} label="Maison" onClick={() => pick(places.home)} accent={accent} testId={`${testIdPrefix}-home`} />}
          {places.work && <Chip icon={Briefcase} label="Travail" onClick={() => pick(places.work)} accent={accent} testId={`${testIdPrefix}-work`} />}
          {recent.map((r, i) => (
            <Chip key={`${r.address}-${i}`} icon={MapPin} label={shorten(r.address)} onClick={() => pick(r)} accent={accent} testId={`${testIdPrefix}-recent-${i}`} />
          ))}
        </div>
      )}
      {(canSaveHome || canSaveWork) && (
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="text-gray-400">Enregistrer cette adresse :</span>
          {canSaveHome && (
            <button type="button" disabled={saving} onClick={() => saveAs('home')} data-testid={`${testIdPrefix}-save-home`}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 font-semibold active:opacity-70 disabled:opacity-50">
              <House size={12} weight="fill" /> Maison
            </button>
          )}
          {canSaveWork && (
            <button type="button" disabled={saving} onClick={() => saveAs('work')} data-testid={`${testIdPrefix}-save-work`}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 font-semibold active:opacity-70 disabled:opacity-50">
              <Briefcase size={12} weight="fill" /> Travail
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SavedAddressChips;
