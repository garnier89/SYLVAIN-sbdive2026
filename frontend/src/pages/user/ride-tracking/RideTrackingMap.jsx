import React from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import { ArrowLeft } from '@phosphor-icons/react';
import 'leaflet/dist/leaflet.css';

const driverIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const pickupIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const dropoffIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const POLYLINE_OPTS = { color: '#3b82f6', weight: 3, dashArray: '8 8' };

/**
 * Map view for ride tracking: pickup, dropoff, live driver position + back button + connection indicator.
 */
const RideTrackingMap = ({ ride, driverPos, connected, onBack }) => {
  const mapCenter = driverPos || { lat: ride.pickup_lat, lng: ride.pickup_lng };
  const route = [
    [ride.pickup_lat, ride.pickup_lng],
    [ride.dropoff_lat, ride.dropoff_lng],
  ];

  return (
    <div className="h-[45vh] relative">
      <MapContainer
        center={[mapCenter.lat, mapCenter.lng]}
        zoom={14}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[ride.pickup_lat, ride.pickup_lng]} icon={pickupIcon} />
        <Marker position={[ride.dropoff_lat, ride.dropoff_lng]} icon={dropoffIcon} />
        {driverPos && <Marker position={[driverPos.lat, driverPos.lng]} icon={driverIcon} />}
        <Polyline positions={route} pathOptions={POLYLINE_OPTS} />
      </MapContainer>

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
