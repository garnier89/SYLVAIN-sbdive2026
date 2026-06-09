import React from 'react';
import { Gift } from '@phosphor-icons/react';
import AdminGoogleMap from '../../admin/AdminGoogleMap';
import { decodePolyline } from '../../../utils/polyline';

/** The driver-home map (driver marker + active-ride route) and the blinking rewards disc. */
export const DriverHomeMap = ({
  mapCenter,
  currentRide,
  showHeatmap,
  heatPoints,
  rewardsActive,
  rewardsCount,
  onRewards,
}) => (
  <div className="flex-1 relative min-h-0">
    <AdminGoogleMap
      center={mapCenter}
      zoom={15}
      cleanUI
      driver={mapCenter}
      pickup={currentRide ? { lat: currentRide.pickup_lat, lng: currentRide.pickup_lng } : undefined}
      dropoff={currentRide ? { lat: currentRide.dropoff_lat, lng: currentRide.dropoff_lng } : undefined}
      markers={(currentRide?.stops || []).filter((s) => s?.lat).map((s, i) => ({ id: `wp-${i}`, lat: s.lat, lng: s.lng, label: String(i + 1), color: '#64748B' }))}
      routePath={currentRide ? (
        decodePolyline(currentRide.route_polyline).length
          ? decodePolyline(currentRide.route_polyline)
          : [
            { lat: currentRide.pickup_lat, lng: currentRide.pickup_lng },
            ...(currentRide.stops || []).filter((s) => s?.lat).map((s) => ({ lat: s.lat, lng: s.lng })),
            { lat: currentRide.dropoff_lat, lng: currentRide.dropoff_lng },
          ]
      ) : []}
      heatmapData={showHeatmap ? heatPoints.map((p) => [p.lat, p.lng, p.count || 1]) : undefined}
      mapTypeControl={false}
    />
    {/* Récompenses — petite rondelle clignotante (en haut à gauche de la carte) */}
    <button
      onClick={onRewards}
      className="absolute top-4 left-4 z-[500] w-12 h-12 rounded-full flex items-center justify-center animate-pulse"
      style={{
        background: rewardsActive ? '#FF5000' : '#F59E0B',
        boxShadow: '0 0 0 4px rgba(255,255,255,0.7), 0 4px 12px rgba(0,0,0,0.28)',
      }}
      data-testid="rewards-floating-btn"
      aria-label="Récompenses"
      title="Récompenses"
    >
      <Gift size={22} weight="fill" className="text-white" />
      {rewardsCount > 0 && (
        <span
          className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-extrabold flex items-center justify-center ring-2 ring-white"
          data-testid="rewards-badge-count"
        >
          {rewardsCount > 9 ? '9+' : rewardsCount}
        </span>
      )}
    </button>
  </div>
);

export default DriverHomeMap;
