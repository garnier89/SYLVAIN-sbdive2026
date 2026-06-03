import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import SearchingRadar from '../../../components/SearchingRadar';

/**
 * Step 3 — Searching for a driver (fallback / fast booking path).
 */
export const RideSearchingStep = ({ pickup, dropoff, ride }) => {
  const navigate = useNavigate();
  return (
    <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <SearchingRadar size={190} />
      <h3 className="text-xl font-bold text-gray-900 mb-2 mt-6">Recherche d'un chauffeur</h3>
      <p className="text-sm text-gray-500 mb-4">Cela peut prendre un moment...</p>

      <div className="w-full bg-gray-50 rounded-2xl p-4 space-y-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#FF4500]" />
          <span className="text-sm text-gray-700 truncate">{pickup.address}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-gray-800" />
          <span className="text-sm text-gray-700 truncate">{dropoff.address}</span>
        </div>
      </div>

      {ride?.otp && (
        <div className="bg-[#303F9F]/5 rounded-xl px-6 py-3 mb-6">
          <p className="text-sm text-gray-500 text-center">Code OTP</p>
          <p className="text-3xl font-bold text-[#303F9F] text-center tracking-widest">{ride.otp}</p>
        </div>
      )}

      <Button
        variant="outline"
        className="rounded-xl border-red-200 text-red-600 hover:bg-red-50"
        onClick={() => navigate('/home')}
        data-testid="cancel-ride-btn"
      >
        Annuler la course
      </Button>
    </div>
  );
};

export default RideSearchingStep;
