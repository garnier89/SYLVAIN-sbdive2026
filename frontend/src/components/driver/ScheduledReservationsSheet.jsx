import React from 'react';
import { X, CalendarCheck, MapPin, Clock } from '@phosphor-icons/react';

/** Persistent list of planned reservations awaiting the driver's acceptance (RED). */
const ScheduledReservationsSheet = ({ rides = [], onClose, onAccept }) => (
  <div className="fixed inset-0 z-[2600] bg-black/40 flex items-end" onClick={onClose} data-testid="scheduled-sheet">
    <div className="w-full bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 bg-white px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2"><CalendarCheck size={22} className="text-red-600" weight="fill" /> Réservations planifiées</h3>
        <button onClick={onClose} className="text-gray-400" data-testid="scheduled-close"><X size={22} /></button>
      </div>
      <div className="p-4">
        {rides.length === 0 && <p className="text-center text-gray-400 text-sm py-10" data-testid="scheduled-empty">Aucune réservation planifiée en attente.</p>}
        {rides.map((r) => (
          <div key={r.id} className="bg-gray-50 rounded-2xl p-4 mb-3 border border-gray-100" data-testid={`scheduled-${r.id}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-[11px] font-bold">
                <Clock size={13} weight="fill" />
                {r.scheduled_at ? new Date(r.scheduled_at).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Planifiée'}
              </span>
              <span className="font-bold text-[#FF5000]">{(r.estimated_fare || 0).toFixed(2)} €</span>
            </div>
            <div className="space-y-2 mb-3">
              <div className="flex items-start gap-2.5"><MapPin size={16} weight="fill" className="text-green-600 mt-0.5 flex-shrink-0" /><p className="text-sm text-gray-800">{r.pickup_address}</p></div>
              <div className="flex items-start gap-2.5"><MapPin size={16} weight="fill" className="text-red-500 mt-0.5 flex-shrink-0" /><p className="text-sm text-gray-800">{r.dropoff_address}</p></div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{r.passenger_name || 'Passager'} · {(r.distance_km || 0).toFixed(1)} km</span>
              <button onClick={() => onAccept(r)} className="px-6 py-2 rounded-full text-white font-bold text-sm" style={{ background: '#FF5000' }} data-testid={`accept-scheduled-${r.id}`}>Accepter</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default ScheduledReservationsSheet;
