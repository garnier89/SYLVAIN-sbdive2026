import React, { useState, useEffect } from 'react';
import { X, Sparkle, Fire, MapPinLine, NavigationArrow, Users } from '@phosphor-icons/react';
import { rideAPI } from '../../../services/api';

const LEVELS = {
  hot: { label: 'Forte demande', cls: 'bg-red-100 text-red-700', dot: '#EF4444' },
  medium: { label: 'Demande modérée', cls: 'bg-amber-100 text-amber-700', dot: '#F59E0B' },
  low: { label: 'Faible', cls: 'bg-gray-100 text-gray-500', dot: '#9CA3AF' },
};

/**
 * DemandZonesModal — "Planificateur de demande basé sur l'IA".
 * Ranks live hot zones from real rides (last hour) vs nearby online-driver supply,
 * then lets the driver recenter the map on a zone.
 */
const DemandZonesModal = ({ open, onClose, origin, onNavigate }) => {
  const [zones, setZones] = useState([]);
  const [meta, setMeta] = useState({ total_demand: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    (async () => {
      try {
        const r = await rideAPI.demandZones(origin?.lat, origin?.lng);
        if (!alive) return;
        setZones(r.data?.zones || []);
        setMeta({ total_demand: r.data?.total_demand || 0 });
      } catch {
        if (alive) setZones([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, origin?.lat, origin?.lng]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2700] bg-black/50 flex items-end" onClick={onClose} data-testid="demand-zones-modal">
      <div className="w-full bg-white rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
            <Sparkle size={22} weight="fill" style={{ color: '#FF5000' }} /> Zones à forte demande
          </h3>
          <button onClick={onClose} className="text-gray-400" data-testid="demand-zones-close"><X size={22} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Calculé en temps réel à partir des courses de la dernière heure et du nombre de chauffeurs en ligne à proximité.
        </p>

        {loading ? (
          <div className="py-10 flex justify-center">
            <div className="w-8 h-8 border-3 rounded-full animate-spin" style={{ borderColor: '#e5e7eb', borderTopColor: '#FF5000' }} />
          </div>
        ) : zones.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400" data-testid="demand-zones-empty">
            <Fire size={32} className="mx-auto mb-2 text-gray-300" />
            Aucune zone active pour le moment. Revenez un peu plus tard.
          </div>
        ) : (
          <div className="space-y-2.5" data-testid="demand-zones-list">
            {zones.map((z, i) => {
              const lvl = LEVELS[z.level] || LEVELS.low;
              return (
                <div key={`${z.lat}_${z.lng}`} className="flex items-center gap-3 border border-gray-100 rounded-2xl p-3" data-testid={`demand-zone-${i}`}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${lvl.dot}1A` }}>
                    <span className="text-sm font-extrabold" style={{ color: lvl.dot }}>{i + 1}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900 truncate">{z.name}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${lvl.cls}`}>{lvl.label}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Fire size={13} weight="fill" style={{ color: '#EF4444' }} />{z.demand} course{z.demand > 1 ? 's' : ''}</span>
                      <span className="flex items-center gap-1"><Users size={13} />{z.drivers_nearby} chauffeur{z.drivers_nearby > 1 ? 's' : ''}</span>
                      {z.distance_km != null && <span className="flex items-center gap-1"><MapPinLine size={13} />{z.distance_km} km</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigate && onNavigate(z)}
                    className="flex-shrink-0 flex items-center gap-1 text-white text-xs font-bold px-3 py-2 rounded-xl"
                    style={{ background: '#FF5000' }}
                    data-testid={`demand-zone-go-${i}`}>
                    <NavigationArrow size={14} weight="fill" /> Y aller
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DemandZonesModal;
