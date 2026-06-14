/**
 * TrackingBanners — sous-composants présentationnels purs de RideTrackingPage.
 * Extraits sans changement de comportement (pilotés uniquement par props) :
 *  - RentalMeterBanner : compteur "Mise à disposition" (lecture seule, côté client)
 *  - FlightWatchBanner : statut de vol + point de rencontre (transfert aéroport)
 *  - PoolBadge         : badge "Pool partagé" + places restantes en temps réel
 *  - StatusDialog      : dialogue de notification de statut (style V3Cube)
 *  - STATUS_STEPS      : étapes de la barre de progression de la course
 */
import React, { useState, useEffect } from 'react';
import { Check, NavigationArrow, Car, Star, Clock, UsersThree, AirplaneTilt } from '@phosphor-icons/react';

// Read-only live rental meter for the client (Mise à disposition).
export const RentalMeterBanner = ({ ride }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (ride?.ride_type !== 'rental') return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [ride?.ride_type]);
  if (ride?.ride_type !== 'rental') return null;
  const hoursInc = Number(ride.rental_hours_included || 0);
  const kmInc = Number(ride.rental_km_included || 0);
  const hrRate = Number(ride.rental_extra_hour_rate || 0);
  const pkgPrice = Number(ride.rental_package_price || ride.estimated_fare || 0);
  const started = ride.rental_started_at;
  const elapsedMin = started ? Math.max(0, (Date.now() - new Date(started).getTime()) / 60000) : 0;
  const overageMin = Math.max(0, elapsedMin - hoursInc * 60);
  const overageFee = (overageMin / 60) * hrRate;
  const fmt = (mins) => { const m = Math.floor(mins); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  return (
    <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 p-3" data-testid="rental-meter-banner">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-black text-amber-900 text-sm"><Clock size={18} weight="fill" className="text-[#F59E0B]" /> Mise à disposition</span>
        <span className="text-[11px] font-bold text-amber-700">{hoursInc}h · {kmInc} km inclus</span>
      </div>
      {started ? (
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div><p className="text-[10px] text-amber-600">Temps</p><p className="font-black text-lg tabular-nums text-amber-900" data-testid="rental-client-timer">{fmt(elapsedMin)}</p></div>
          <div><p className="text-[10px] text-amber-600">Suppl.</p><p className="font-bold text-[#FF5000]">{overageFee.toFixed(2)} €</p></div>
          <div><p className="text-[10px] text-amber-600">Projeté</p><p className="font-black text-amber-900">{(pkgPrice + overageFee).toFixed(2)} €</p></div>
        </div>
      ) : (
        <p className="text-[12px] text-amber-700 mt-1">En attente du démarrage du compteur par votre chauffeur.</p>
      )}
      {(ride.stops || []).length > 0 && (
        <p className="text-[11px] text-amber-700 mt-2">📍 {ride.stops.length} arrêt(s) prévu(s)</p>
      )}
    </div>
  );
};

// Flight Watch banner — shows live flight status + meeting point for airport transfers.
export const FlightWatchBanner = ({ ride }) => {
  if (ride?.ride_type !== 'airport' || !ride?.flight_number) return null;
  const fs = ride.flight_status || {};
  const map = {
    on_time: { c: 'bg-emerald-100 text-emerald-700', l: 'À l\'heure' },
    delayed: { c: 'bg-amber-100 text-amber-700', l: `Retard ${fs.delay_minutes} min` },
    early: { c: 'bg-blue-100 text-blue-700', l: `Avance ${Math.abs(fs.delay_minutes || 0)} min` },
    cancelled: { c: 'bg-red-100 text-red-700', l: 'Annulé' },
  };
  const badge = map[fs.status] || null;
  return (
    <div className="mb-4 rounded-2xl bg-sky-50 border border-sky-200 p-3" data-testid="flight-watch-banner">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-black text-sky-900 text-sm">
          <AirplaneTilt size={18} weight="fill" className="text-[#0EA5E9]" /> Vol {ride.flight_number}
          {ride.airport_terminal ? <span className="text-xs font-bold text-sky-700">· {ride.airport_terminal}</span> : null}
        </span>
        {badge && <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${badge.c}`} data-testid="flight-watch-status">{badge.l}</span>}
      </div>
      {ride.meeting_point && <p className="text-[12px] text-sky-800 mt-1">📍 {ride.meeting_point}</p>}
      <p className="text-[11px] text-sky-600 mt-0.5">{ride.free_wait_minutes || 45} min d'attente offertes · suivi de vol automatique</p>
    </div>
  );
};

// Shared-ride badge — shows "Pool partagé" + live remaining seats on the
// passenger's tracking screen (updated in real time as co-riders join).
export const PoolBadge = ({ ride, floating = false }) => {
  if (!ride?.pool_enabled) return null;
  const capacity = Number(ride.pool_capacity || 0);
  const taken = Number(ride.pool_seats_taken || ride.seats_required || 1);
  const remaining = Math.max(0, capacity - taken);
  const members = Number(ride.pool_group_size || 1);
  const full = capacity > 0 && remaining === 0;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 ${floating ? 'shadow-md backdrop-blur' : ''}`}
      data-testid="pool-shared-badge"
    >
      <UsersThree size={16} weight="fill" className="text-emerald-600 shrink-0" />
      <span className="text-[13px] font-extrabold text-emerald-700">Pool partagé</span>
      <span className="h-3 w-px bg-emerald-200" />
      {capacity > 0 ? (
        <span className="text-[13px] font-bold text-emerald-700" data-testid="pool-remaining-seats">
          {full ? 'Complet' : `${remaining} place${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}`}
        </span>
      ) : (
        <span className="text-[13px] font-bold text-emerald-700">Trajet partagé</span>
      )}
      {members > 1 && (
        <span className="text-[11px] font-semibold text-emerald-600" data-testid="pool-members-count">· {members} pers.</span>
      )}
    </div>
  );
};

// V3Cube-style status notification dialog ("Le chauffeur est arrivé.", etc.)
export const StatusDialog = ({ dialog }) => {
  if (!dialog) return null;
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/40 px-8" data-testid="status-dialog">
      <div className="bg-white rounded-2xl w-full max-w-xs p-6 text-center shadow-2xl">
        <p className="text-base font-bold text-gray-900 mb-5" data-testid="status-dialog-text">{dialog.title}</p>
        <button onClick={dialog.onOk} className="text-[#FF5000] font-extrabold text-sm uppercase tracking-wide" data-testid="status-dialog-ok">
          D'accord
        </button>
      </div>
    </div>
  );
};

export const STATUS_STEPS = [
  { key: 'pending', label: 'Recherche', icon: Clock },
  { key: 'accepted', label: 'Acceptée', icon: Check },
  { key: 'arriving', label: 'En route', icon: NavigationArrow },
  { key: 'in_progress', label: 'En cours', icon: Car },
  { key: 'completed', label: 'Terminée', icon: Star },
];
