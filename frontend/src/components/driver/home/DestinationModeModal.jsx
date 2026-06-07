import React from 'react';
import { X } from '@phosphor-icons/react';

/** "Mode Destination" modal — set a destination so only matching rides are offered. */
export const DestinationModeModal = ({ open, onClose, destMode, destInput, setDestInput, onSave }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[10000] bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} data-testid="destination-mode-modal">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Mode Destination</h2>
          <button onClick={onClose} className="text-gray-400"><X size={20} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">Définissez votre destination pour ne recevoir que les courses qui vont dans cette direction (rentrer à la maison, fin de service, etc.).</p>
        {destMode?.active ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 mb-3">
            <div className="text-xs text-emerald-700 font-semibold">ACTIF</div>
            <div className="text-sm text-gray-900 mt-1">{destMode.target?.address || `${destMode.target?.lat?.toFixed(4)}, ${destMode.target?.lng?.toFixed(4)}`}</div>
          </div>
        ) : (
          <div className="space-y-2 mb-3">
            <input type="text" placeholder="Adresse (ex: 10 Rue de Rivoli, Paris)" value={destInput.address}
              onChange={(e) => setDestInput({ ...destInput, address: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" data-testid="dest-address-input" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" step="0.0001" placeholder="Latitude" value={destInput.lat}
                onChange={(e) => setDestInput({ ...destInput, lat: e.target.value })}
                className="border border-gray-300 rounded-xl px-3 py-2.5 text-sm" data-testid="dest-lat-input" />
              <input type="number" step="0.0001" placeholder="Longitude" value={destInput.lng}
                onChange={(e) => setDestInput({ ...destInput, lng: e.target.value })}
                className="border border-gray-300 rounded-xl px-3 py-2.5 text-sm" data-testid="dest-lng-input" />
            </div>
          </div>
        )}
        <div className="flex gap-2">
          {destMode?.active ? (
            <button onClick={() => onSave(false)}
              className="flex-1 bg-red-500 text-white rounded-full h-11 font-bold text-sm" data-testid="dest-disable-btn">
              Désactiver
            </button>
          ) : (
            <button onClick={() => onSave(true)}
              disabled={!destInput.lat || !destInput.lng}
              className="flex-1 bg-emerald-600 text-white rounded-full h-11 font-bold text-sm disabled:opacity-50" data-testid="dest-enable-btn">
              Activer
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DestinationModeModal;
