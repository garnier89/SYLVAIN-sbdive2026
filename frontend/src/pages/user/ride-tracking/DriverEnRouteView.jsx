import React, { useMemo, useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import {
  List, PencilSimple, Phone, ChatCircleDots, ShareNetwork, X,
  Star, StarHalf, User, NavigationArrow,
} from '@phosphor-icons/react';
import { decodePolyline } from '../../../utils/polyline';
import 'leaflet/dist/leaflet.css';

// Haversine distance in km
const distKm = (a, b) => {
  if (!a || !b) return 0;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

// Top-view white car marker
const carIcon = L.divIcon({
  className: '',
  html: `<div style="filter:drop-shadow(0 3px 5px rgba(0,0,0,.4))">
    <svg width="40" height="40" viewBox="0 0 64 64">
      <rect x="17" y="5" width="30" height="54" rx="13" fill="#ffffff" stroke="#1a1a1a" stroke-width="2.5"/>
      <rect x="22" y="12" width="20" height="13" rx="4" fill="#9fb3c8"/>
      <rect x="22" y="38" width="20" height="11" rx="4" fill="#9fb3c8"/>
      <rect x="24" y="27" width="16" height="9" rx="2" fill="#dfe7ef"/>
      <circle cx="22" cy="55" r="2.4" fill="#e11d2a"/><circle cx="42" cy="55" r="2.4" fill="#e11d2a"/>
    </svg></div>`,
  iconSize: [40, 40], iconAnchor: [20, 20],
});

// Black teardrop ETA pin
const etaIcon = (eta) => L.divIcon({
  className: '',
  html: `<div style="position:relative;width:64px;height:64px;">
    <div style="position:absolute;inset:0;background:#111;border-radius:50% 50% 50% 0;transform:rotate(45deg);box-shadow:0 5px 12px rgba(0,0,0,.45)"></div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-weight:800;line-height:1;">
      <span style="font-size:15px">${eta}</span><span style="font-size:11px;font-weight:600">min</span>
    </div>
  </div>`,
  iconSize: [64, 64], iconAnchor: [32, 60],
});

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

// Forces Leaflet to recompute its size once the flex container has laid out
const MapResizer = () => {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [map]);
  return null;
};

/**
 * DriverEnRouteView — immersive V3Cube-style "EN ARRIVANT / EN COURSE" screen
 * shown to the passenger once a driver is assigned (accepted/arriving/in_progress).
 */
const DriverEnRouteView = ({ ride, driverPos, connected, onBack, onCall, onChat, onShare, onCancel, onEditDest, otp, onRequestOtp }) => {
  const inProgress = ride.status === 'in_progress';
  const title = inProgress ? 'EN COURSE' : 'EN ARRIVANT';
  const target = inProgress
    ? { lat: ride.dropoff_lat, lng: ride.dropoff_lng }
    : { lat: ride.pickup_lat, lng: ride.pickup_lng };

  // Car position (fallback: slightly offset from target so the route is visible)
  const carPos = driverPos || { lat: target.lat + 0.0045, lng: target.lng + 0.0045 };
  const eta = useMemo(() => Math.max(1, Math.round((distKm(carPos, target) / 28) * 60)), [carPos, target]);

  const decoded = decodePolyline(ride.route_polyline);
  const blueRoute = decoded.length
    ? decoded.map((p) => [p.lat, p.lng])
    : [[ride.pickup_lat, ride.pickup_lng], [ride.dropoff_lat, ride.dropoff_lng]];

  return (
    <div className="w-full max-w-[480px] mx-auto h-screen overflow-hidden bg-white flex flex-col" data-testid="driver-enroute-view">
      {/* Header */}
      <div className="bg-[#4361EE] text-white pt-9 pb-14 px-4 relative z-10">
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
                {!inProgress && onEditDest && (
                  <button onClick={onEditDest} className="text-gray-400 flex-shrink-0" data-testid="edit-dest-btn"><PencilSimple size={20} /></button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative -mt-3">
        <MapContainer center={[carPos.lat, carPos.lng]} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapResizer />
          {inProgress && <Polyline positions={blueRoute} pathOptions={{ color: '#3b82f6', weight: 4 }} />}
          <Polyline positions={[[carPos.lat, carPos.lng], [target.lat, target.lng]]} pathOptions={{ color: '#111', weight: 4 }} />
          <Marker position={[target.lat, target.lng]} icon={etaIcon(eta)} />
          <Marker position={[carPos.lat, carPos.lng]} icon={carIcon} />
        </MapContainer>

        <div className={`absolute top-3 right-3 z-[1000] px-2 py-1 rounded-full text-[10px] font-semibold ${connected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {connected ? 'En direct' : 'Reconnexion…'}
        </div>

        {/* OTP pill — passenger shares this code so the driver can start the trip */}
        {!inProgress && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000]">
            {otp ? (
              <div className="bg-[#0B1426] text-white rounded-full px-4 py-2 shadow-lg flex items-center gap-2" data-testid="enroute-otp">
                <span className="text-[10px] uppercase tracking-wide text-white/60">Code départ</span>
                <span className="text-base font-extrabold tracking-[0.3em]">{otp}</span>
              </div>
            ) : (
              <button onClick={onRequestOtp} className="bg-[#0B1426] text-white rounded-full px-4 py-2 shadow-lg text-xs font-bold" data-testid="enroute-otp-btn">
                Générer mon code OTP
              </button>
            )}
          </div>
        )}

        <div className="absolute bottom-4 right-4 z-[1000] w-12 h-12 rounded-full bg-[#0B1426] flex items-center justify-center shadow-lg">
          <NavigationArrow size={22} weight="fill" className="text-white" />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-center gap-4 px-6 -mt-7 relative z-20">
        <ActionBtn Icon={Phone} bg="#2F9BFF" onClick={onCall} testId="enroute-call-btn" label="Appeler" />
        <ActionBtn Icon={ChatCircleDots} bg="#F5A623" onClick={onChat} testId="enroute-chat-btn" label="Message" />
        <ActionBtn Icon={ShareNetwork} bg="#8B5CF6" onClick={onShare} testId="enroute-share-btn" label="Partager" />
        <ActionBtn Icon={X} bg="#94A3B8" onClick={onCancel} testId="enroute-cancel-btn" label="Annuler" />
      </div>

      {/* Driver card */}
      <div className="bg-white px-5 pt-5 pb-7 flex items-center gap-4" data-testid="enroute-driver-card">
        <div className="w-16 h-16 rounded-full bg-gray-100 border-2 border-[#4361EE] flex items-center justify-center flex-shrink-0 overflow-hidden">
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
