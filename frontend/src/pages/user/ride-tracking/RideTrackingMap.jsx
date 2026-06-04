import React from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { decodePolyline } from '../../../utils/polyline';
import AdminGoogleMap from '../../../components/admin/AdminGoogleMap';

/**
 * Map view for ride tracking (Google Maps): pickup, dropoff, intermediate
 * stops, live driver position and the real route polyline. Migrated off
 * Leaflet/OSM which rendered as blank "tofu" tiles on some devices.
 */
const RideTrackingMap = ({ ride, driverPos, connected, onBack }) => {
  const stops = (ride.stops || []).filter((s) => s?.lat);
  const decoded = decodePolyline(ride.route_polyline);
  const routePath = decoded.length
    ? decoded.map((p) => ({ lat: p.lat, lng: p.lng }))
    : [
      { lat: ride.pickup_lat, lng: ride.pickup_lng },
      ...stops.map((s) => ({ lat: s.lat, lng: s.lng })),
      { lat: ride.dropoff_lat, lng: ride.dropoff_lng },
    ];
  const center = driverPos || { lat: ride.pickup_lat, lng: ride.pickup_lng };
  const markers = stops.map((s, i) => ({ id: `stop-${i}`, lat: s.lat, lng: s.lng, label: String(i + 1), color: '#f59e0b' }));

  return (
    <div className="h-[45vh] relative" data-testid="ride-tracking-map">
      <AdminGoogleMap
        center={center}
        zoom={14}
        pickup={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
        dropoff={{ lat: ride.dropoff_lat, lng: ride.dropoff_lng }}
        driver={driverPos}
        routePath={routePath}
        markers={markers}
      />

      <button
        className="absolute top-4 left-4 z-[1000] bg-white rounded-full p-2 shadow-lg"
        onClick={onBack}
        data-testid="tracking-back-btn"
      >
        <ArrowLeft size={20} className="text-gray-700" />
      </button>

      <div
        className={`absolute top-4 right-4 z-[1000] px-2 py-1 rounded-full text-[10px] font-medium ${
          connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}
      >
        {connected ? 'En direct' : 'Reconnexion...'}
      </div>
    </div>
  );
};

export default RideTrackingMap;
