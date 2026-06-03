import React from 'react';
import { Phone, ChatCircle, Star, Car } from '@phosphor-icons/react';

/**
 * Driver info card displayed once a driver has been assigned to the ride.
 */
const DriverInfoCard = ({ ride, onCall, onChat }) => {
  if (!ride?.driver_name) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4" data-testid="driver-info-card">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
          <Car size={24} className="text-gray-600" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-900">{ride.driver_name}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <Star size={12} weight="fill" className="text-yellow-500" />
            <span className="text-xs text-gray-500">
              {ride.driver_rating?.toFixed(1) || '5.0'}
            </span>
          </div>
          {ride.driver_vehicle_model && (
            <p className="text-xs text-gray-500 mt-0.5">
              {ride.driver_vehicle_model} &middot; {ride.driver_vehicle_number}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCall}
            className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center"
            data-testid="call-driver-btn"
          >
            <Phone size={18} className="text-[#FF4500]" />
          </button>
          <button
            onClick={onChat}
            className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center"
            data-testid="chat-driver-btn"
          >
            <ChatCircle size={18} className="text-[#FF4500]" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DriverInfoCard;
