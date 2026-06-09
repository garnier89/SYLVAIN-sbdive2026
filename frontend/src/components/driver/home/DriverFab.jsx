import React from 'react';
import { MapPin, Plus, Sparkle, Taxi, Fire, ArrowUUpLeft, Car } from '@phosphor-icons/react';

/** Radial speed-dial FAB (bottom-right) with the driver quick-actions. */
export const DriverFab = ({
  open,
  setOpen,
  onAiPlanner,
  onTaxiHall,
  onHeatmap,
  onDest,
  onLocations,
  onVehicleInfo,
  taxiHailEnabled = true,
}) => {
  const actions = [
    { label: "Planificateur de demande basé sur l'IA", Icon: Sparkle, onClick: onAiPlanner },
    taxiHailEnabled && { label: 'Auto-stop', Icon: Taxi, onClick: onTaxiHall },
    { label: 'Chaleur', Icon: Fire, onClick: onHeatmap },
    { label: 'Revenir', Icon: ArrowUUpLeft, onClick: onDest },
    { label: 'Emplacements', Icon: MapPin, onClick: onLocations },
    { label: 'Informations sur le véhicule', Icon: Car, onClick: onVehicleInfo },
  ].filter(Boolean);

  return (
    <div className="absolute bottom-28 left-0 right-0 z-[1000] px-4 flex items-end justify-end pointer-events-none">
      <div className="pointer-events-auto flex flex-col items-end gap-2.5" data-testid="driver-fab">
        {open && (
          <div className="flex flex-col items-end gap-2.5 mb-1" data-testid="driver-fab-menu">
            {actions.map(({ label, Icon, onClick }, i) => (
              <button key={label} onClick={() => { setOpen(false); onClick(); }}
                className="flex items-center gap-2.5 animate-in slide-in-from-bottom-2 fade-in" style={{ animationDelay: `${i * 30}ms` }}
                data-testid={`fab-action-${i}`}>
                <span className="bg-white text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full shadow-md whitespace-nowrap">{label}</span>
                <span className="w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center flex-shrink-0">
                  <Icon size={20} weight="fill" style={{ color: '#FF5000' }} />
                </span>
              </button>
            ))}
          </div>
        )}
        <button onClick={() => setOpen((v) => !v)} className="w-10 h-10 rounded-full shadow-xl flex items-center justify-center transition-transform" style={{ background: open ? '#0B0B0B' : '#FF5000', transform: open ? 'rotate(135deg)' : 'none' }} data-testid="driver-fab-toggle">
          <Plus size={18} className="text-white" weight="bold" />
        </button>
      </div>
    </div>
  );
};

export default DriverFab;
