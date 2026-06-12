import React, { useEffect, useState } from 'react';
import { X, Star, Car, MapPin, Timer, Broadcast } from '@phosphor-icons/react';
import { adminAPI } from '../../services/api';
import { toast } from 'sonner';

/** Smart 1-click reassignment: lists the closest ONLINE drivers (distance + ETA). */
export const NearbyDriversModal = ({ ride, onClose, onAssigned }) => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalOnline, setTotalOnline] = useState(0);
  const [assigning, setAssigning] = useState('');

  useEffect(() => {
    let alive = true;
    adminAPI.nearbyDrivers(ride.id, 3)
      .then((r) => { if (alive) { setDrivers(r.data.drivers || []); setTotalOnline(r.data.total_online || 0); } })
      .catch((e) => toast.error(e?.response?.data?.detail || 'Échec du chargement'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ride.id]);

  const assign = async (d) => {
    setAssigning(d.driver_id);
    try {
      await adminAPI.reassignBookingRide(ride.id, d.driver_id);
      toast.success(`Course affectée à ${d.name} ✅`);
      onAssigned(); onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
    finally { setAssigning(''); }
  };

  return (
    <div className="fixed inset-0 z-[2950] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="nearby-drivers-modal">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><Broadcast size={18} className="text-blue-600" /> Chauffeurs les plus proches</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[300px]">Course {ride.booking_no || ride.id?.slice(-6)} · départ {ride.pickup_address}</p>
          </div>
          <button onClick={onClose} className="text-gray-400" data-testid="nearby-close"><X size={22} /></button>
        </div>
        <div className="p-4 space-y-2">
          {loading ? <p className="text-sm text-gray-400 text-center py-6">Recherche des chauffeurs…</p>
            : drivers.length === 0 ? <p className="text-sm text-gray-400 text-center py-6" data-testid="nearby-empty">Aucun chauffeur en ligne à proximité.</p>
            : (<>
              <p className="text-[11px] text-gray-400">{totalOnline} chauffeur(s) en ligne · top {drivers.length} par proximité</p>
              {drivers.map((d, i) => (
                <div key={d.driver_id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-blue-200" data-testid={`nearby-driver-${d.driver_id}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${i === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{d.name} {d.live && <span className="text-[9px] font-bold text-emerald-600 align-middle">● LIVE</span>}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-0.5"><Car size={11} /> {d.vehicle_model || d.vehicle_type || '—'}</span>
                      <span className="flex items-center gap-0.5"><Star size={11} weight="fill" className="text-amber-400" /> {(d.rating || 5).toFixed(1)}</span>
                      <span className="flex items-center gap-0.5"><MapPin size={11} /> {d.distance_km} km</span>
                      <span className="flex items-center gap-0.5"><Timer size={11} /> ~{d.eta_mins} min</span>
                    </p>
                  </div>
                  <button onClick={() => assign(d)} disabled={!!assigning} className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-2 disabled:opacity-50 shrink-0" data-testid={`assign-driver-${d.driver_id}`}>
                    {assigning === d.driver_id ? '…' : 'Affecter'}
                  </button>
                </div>
              ))}
            </>)}
        </div>
      </div>
    </div>
  );
};

export default NearbyDriversModal;
