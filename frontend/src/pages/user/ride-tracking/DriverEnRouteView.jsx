import React from 'react';
import {
  List, PencilSimple, Phone, ChatCircleDots, ShareNetwork, X,
  Star, StarHalf, User, NavigationArrow, Siren, Clock,
} from '@phosphor-icons/react';
import GoogleRideMap from './GoogleRideMap';

const RatingStars = ({ value = 5 }) => {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <div className="flex items-center gap-0.5" data-testid="driver-rating-stars">
      {[0, 1, 2, 3, 4].map((i) => {
        if (i < full) return <Star key={i} size={18} weight="fill" className="text-amber-400" />;
        if (i === full && half) return <StarHalf key={i} size={18} weight="fill" className="text-amber-400" />;
        return <Star key={i} size={18} weight="regular" className="text-gray-300" />;
      })}
    </div>
  );
};

const ActionBtn = ({ Icon, bg, onClick, testId, label }) => (
  <button onClick={onClick} data-testid={testId} aria-label={label}
    className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md active:scale-95 transition-transform" style={{ background: bg }}>
    <Icon size={26} weight="bold" className="text-white" />
  </button>
);

/**
 * DriverEnRouteView — immersive V3Cube-style "EN ARRIVANT / EN ROUTE" screen
 * shown to the passenger once a driver is assigned (accepted/arriving/in_progress).
 * Map is rendered with Google Maps via GoogleRideMap.
 */
const DriverEnRouteView = ({ ride, driverPos, connected, onBack, onCall, onChat, onShare, onCancel, onEditDest, otp, onRequestOtp, onSos }) => {
  const inProgress = ride.status === 'in_progress';
  const title = inProgress ? 'EN ROUTE' : 'EN ARRIVANT';

  return (
    <div className="w-full max-w-[480px] mx-auto h-screen overflow-hidden bg-white flex flex-col" data-testid="driver-enroute-view">
      {/* Header */}
      <div className="bg-[#FF4500] text-white pt-9 pb-14 px-4 relative z-10">
        <div className="flex items-center">
          <button onClick={onBack} className="w-9 h-9 flex items-center justify-center" data-testid="enroute-back-btn">
            <List size={26} weight="bold" />
          </button>
          <h1 className="flex-1 text-center text-xl font-extrabold tracking-wide" data-testid="enroute-title">{title}</h1>
          <div className="w-9" />
        </div>
      </div>

      {/* Floating route card */}
      <div className="px-4 -mt-9 relative z-20">
        <div className="bg-white rounded-2xl shadow-xl p-4">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center pt-1">
              <span className="w-4 h-4 rounded-full bg-[#0B1426] flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-white" /></span>
              <span className="w-px h-6 bg-gray-300 my-1" />
              <span className="w-4 h-4 bg-[#0B1426] flex items-center justify-center"><span className="w-1.5 h-1.5 bg-white" /></span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-400">Ramassage à partir de</p>
              <p className="text-sm font-bold text-gray-900 truncate" data-testid="enroute-pickup">{ride.pickup_address}</p>
              <div className="h-px bg-gray-100 my-2" />
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400">Déposer</p>
                  <p className="text-sm font-bold text-gray-900 truncate" data-testid="enroute-dropoff">{ride.dropoff_address}</p>
                </div>
                {onEditDest && (
                  <button onClick={onEditDest} className="text-gray-400 flex-shrink-0" data-testid="edit-dest-btn"><PencilSimple size={20} /></button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Waiting timer banner — the driver is waiting at the passenger's request */}
      {ride.waiting_active && (
        <div className="px-4 mt-3 relative z-20" data-testid="enroute-waiting-banner">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
              <Clock size={18} weight="bold" className="text-white" />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-extrabold text-amber-800">Temps d&apos;attente en cours</p>
              <p className="text-[11px] text-amber-700 leading-snug">Le chauffeur patiente à votre demande — cette attente est facturée{ride.waiting_charge ? ` (${Number(ride.waiting_charge).toFixed(2)} €)` : ''}.</p>
            </div>
          </div>
        </div>
      )}
      {/* Map */}
      <div className="flex-1 relative -mt-3">
        <GoogleRideMap ride={ride} driverPos={driverPos} />

        <div className={`absolute top-3 right-3 z-[1000] px-2 py-1 rounded-full text-[10px] font-semibold ${connected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {connected ? 'En direct' : 'Reconnexion…'}
        </div>

        {/* SOS button — emergency, shown once the trip is in progress */}
        {inProgress && (
          <button onClick={onSos} className="absolute top-12 right-3 z-[1000] w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-lg active:scale-95 transition-transform animate-pulse" data-testid="enroute-sos-btn" aria-label="Urgence SOS">
            <Siren size={24} weight="fill" className="text-white" />
          </button>
        )}

        {/* OTP pill — passenger shares this code so the driver can start the trip */}
        {!inProgress && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000]">
            {otp ? (
              <div className="bg-[#0B1426] text-white rounded-full px-4 py-2 shadow-lg flex items-center gap-2" data-testid="enroute-otp">
                <span className="text-[10px] uppercase tracking-wide text-white/60">Code OTP</span>
                <span className="text-base font-extrabold tracking-[0.3em]">{otp}</span>
              </div>
            ) : (
              <button onClick={onRequestOtp} className="bg-[#0B1426] text-white rounded-full px-4 py-2 shadow-lg text-xs font-bold" data-testid="enroute-otp-btn">
                Générer mon code OTP
              </button>
            )}
          </div>
        )}
      </div>

      {/* Action buttons — aligned to the right, just above the driver's stars */}
      <div className="flex justify-end gap-3 px-5 -mt-7 relative z-20">
        <ActionBtn Icon={Phone} bg="#2F9BFF" onClick={onCall} testId="enroute-call-btn" label="Appeler" />
        <ActionBtn Icon={ChatCircleDots} bg="#F5A623" onClick={onChat} testId="enroute-chat-btn" label="Message" />
        <ActionBtn Icon={ShareNetwork} bg="#8B5CF6" onClick={onShare} testId="enroute-share-btn" label="Partager" />
        <ActionBtn Icon={X} bg="#94A3B8" onClick={onCancel} testId="enroute-cancel-btn" label="Annuler" />
      </div>

      {/* Driver card */}
      <div className="bg-white px-5 pt-5 pb-7 flex items-center gap-4" data-testid="enroute-driver-card">
        <div className="w-16 h-16 rounded-full bg-gray-100 border-2 border-[#FF4500] flex items-center justify-center flex-shrink-0 overflow-hidden">
          <User size={34} weight="fill" className="text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xl font-extrabold text-gray-900 leading-tight truncate" data-testid="enroute-driver-name">{ride.driver_name || 'Chauffeur'}</p>
          {ride.driver_vehicle_number && <p className="text-sm text-gray-500 font-medium">{ride.driver_vehicle_number}</p>}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0 max-w-[42%]">
          <RatingStars value={ride.driver_rating || 5} />
          {ride.driver_vehicle_model && <p className="text-sm font-semibold text-gray-700 text-right leading-tight">{ride.driver_vehicle_model}</p>}
          <p className="text-xs text-gray-400 capitalize">{ride.vehicle_type || 'Basic'}</p>
        </div>
      </div>
    </div>
  );
};

export default DriverEnRouteView;
