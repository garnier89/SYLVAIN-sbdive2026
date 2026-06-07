import React from 'react';
import {
  DotsThreeVertical, Phone, ChatCircleDots, NavigationArrow, Siren, Star,
  UserCircle, Clock, MapPin, CaretLeft,
} from '@phosphor-icons/react';
import AdminGoogleMap from '../admin/AdminGoogleMap';
import SlideToConfirm from './SlideToConfirm';

/**
 * Presentational sub-views extracted from DriverRideFlow for readability.
 * All state, effects and handlers stay in DriverRideFlow — these components are
 * pure and only render the props they receive. data-testid values are preserved
 * exactly as in the original inline markup.
 */

export const RatingStars = ({ value = 5 }) => (
  <div className="flex items-center gap-0.5">
    {[0, 1, 2, 3, 4].map((i) => (
      <Star key={i} size={16} weight={i < Math.round(value) ? 'fill' : 'regular'} className={i < Math.round(value) ? 'text-amber-400' : 'text-gray-300'} />
    ))}
  </div>
);

export const RideFlowHeader = ({ headerBg, headerLabel, showMinimize, onMinimize, onMenu }) => (
  <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ background: headerBg }}>
    {showMinimize ? (
      <button onClick={onMinimize} className="w-9 h-9 flex items-center justify-center text-white" data-testid="ride-flow-minimize-btn" aria-label="Retour à l'accueil">
        <CaretLeft size={26} weight="bold" />
      </button>
    ) : (
      <div className="w-9" />
    )}
    <h1 className="text-lg font-extrabold tracking-wide text-white" data-testid="ride-flow-title">{headerLabel}</h1>
    <button onClick={onMenu} className="w-9 h-9 flex items-center justify-center text-white" data-testid="ride-flow-menu-btn">
      <DotsThreeVertical size={26} weight="bold" />
    </button>
  </div>
);

export const RideFlowAddressCard = ({ label, address, isPickupPhase }) => (
  <div className="px-4 -mb-6 relative z-20 -mt-1">
    <div className="bg-white rounded-2xl shadow-lg p-3.5 flex items-center gap-3 mt-3 border border-gray-100">
      <MapPin size={22} weight="fill" className={isPickupPhase ? 'text-green-600' : 'text-red-500'} />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold">{label}</p>
        <p className="text-sm font-bold text-gray-900 truncate" data-testid="ride-flow-address">{address}</p>
      </div>
    </div>
  </div>
);

export const RideFlowMap = ({
  mapCenter, driver, driverIconUrl, pickup, dropoff, routePath,
  connected, onSos,
  inProgress,
  isArrived, pickupArrivedAt, pickupWaitLabel, pickupBillable, pickupWaitChargeLabel,
  waitingActive, waitingLabel, onToggleWaiting,
}) => (
  <div className="flex-1 relative">
    <AdminGoogleMap
      center={mapCenter}
      zoom={13}
      driver={driver}
      driverIconUrl={driverIconUrl}
      staticView
      pickup={pickup}
      dropoff={dropoff}
      routePath={routePath}
    />
    <div className={`absolute top-9 right-3 z-[600] px-2 py-1 rounded-full text-[10px] font-semibold ${connected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
      {connected ? 'En direct' : 'Reconnexion…'}
    </div>
    <button onClick={onSos} className="absolute top-9 left-3 z-[600] w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-lg animate-pulse" data-testid="ride-flow-sos-btn" aria-label="Sécurité / SOS">
      <Siren size={24} weight="fill" className="text-white" />
    </button>
    {/* BLACK pickup waiting timer — auto, EN ROUTE (driver arrived, waits for the
        passenger). It stops and DISAPPEARS the moment the trip starts (in_progress). */}
    {isArrived && pickupArrivedAt && (
      <div
        className="absolute top-1 left-1/2 -translate-x-1/2 z-[600] bg-[#0B0B0B]/95 text-white rounded-full px-3 py-1 text-xs font-bold tabular-nums shadow-md flex items-center gap-1.5"
        data-testid="ride-flow-pickup-wait"
      >
        <Clock size={13} weight="bold" />
        {pickupWaitLabel}
        {pickupBillable && (
          <span className="text-amber-400" data-testid="ride-flow-pickup-wait-billed">· facturé · {pickupWaitChargeLabel} €</span>
        )}
      </div>
    )}
    {/* GREY in-trip waiting toggle — APPEARS when the trip starts (in_progress).
        Lets the driver bill waiting time during the trip (passenger stop, etc.). */}
    {inProgress && (
      <button
        onClick={onToggleWaiting}
        className={`absolute top-1 left-1/2 -translate-x-1/2 z-[600] rounded-full px-3 py-1 text-xs font-bold shadow-md flex items-center gap-1.5 ${waitingActive ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'}`}
        data-testid="ride-flow-waiting-btn"
      >
        <Clock size={13} weight="fill" />
        {waitingLabel}
      </button>
    )}
  </div>
);

export const RideFlowFooter = ({
  onCall, onChat, onNav,
  passengerName, passengerAvatar, passengerRating,
  distanceKm, durationMins,
  isArrived, recordVideo, onToggleVideo,
  isPickupPhase, inProgress, busy,
  onArrive, onStart, onFinish, nearDestination = false,
}) => (
  <>
    {/* Action buttons — aligned right, just above the km */}
    <div className="flex justify-end gap-4 px-5 py-3 bg-white">
      <button onClick={onCall} className="w-12 h-12 rounded-full bg-[#2F9BFF] flex items-center justify-center shadow-md" data-testid="ride-flow-call-btn" aria-label="Appeler"><Phone size={22} weight="fill" className="text-white" /></button>
      <button onClick={onChat} className="w-12 h-12 rounded-full bg-[#F5A623] flex items-center justify-center shadow-md" data-testid="ride-flow-chat-btn" aria-label="Discuter"><ChatCircleDots size={22} weight="fill" className="text-white" /></button>
      <button onClick={onNav} className="w-12 h-12 rounded-full bg-[#FF6A00] flex items-center justify-center shadow-md" data-testid="ride-flow-nav-btn" aria-label="Navigation"><NavigationArrow size={22} weight="fill" className="text-white" /></button>
    </div>

    {/* Passenger card */}
    <div className="px-5 pb-2 flex items-center gap-3" data-testid="ride-flow-passenger-card">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
        {passengerAvatar ? <img src={passengerAvatar} alt="" className="w-full h-full object-cover" /> : <UserCircle size={40} className="text-gray-300" weight="fill" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-extrabold text-gray-900 truncate">{passengerName || 'Passager'}</p>
        <RatingStars value={passengerRating || 5} />
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-gray-900">{(distanceKm || 0).toFixed(2)} km</p>
        <p className="text-xs text-gray-500">{durationMins || 0} minutes</p>
      </div>
    </div>

    {/* Video record checkbox (arrived, before start) */}
    {isArrived && (
      <label className="px-5 pb-2 flex items-center gap-2 text-sm text-gray-600" data-testid="ride-flow-video-row">
        <input type="checkbox" checked={recordVideo} onChange={onToggleVideo} className="w-4 h-4 accent-[#00B578]" data-testid="ride-flow-video-checkbox" />
        Enregistrer une vidéo à l&apos;intérieur d&apos;un taxi
      </label>
    )}

    {/* Slider */}
    <div className="px-5 pb-6 pt-1">
      {isPickupPhase && <SlideToConfirm label="GLISSEZ POUR ARRIVER" color="#00B578" onConfirm={onArrive} testId="slide-arrive" disabled={busy} />}
      {isArrived && <SlideToConfirm label="GLISSEZ POUR COMMENCER LE VOYAGE" color="#00B578" onConfirm={onStart} testId="slide-start" disabled={busy} />}
      {inProgress && <SlideToConfirm label="GLISSER POUR TERMINER LE VOYAGE" color="#E11900" onConfirm={onFinish} testId="slide-finish" disabled={busy} nudge={nearDestination} />}
    </div>
  </>
);
