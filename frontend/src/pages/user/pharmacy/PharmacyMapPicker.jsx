import React, { useState } from 'react';
import { MapPin } from '@phosphor-icons/react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const ClickHandler = ({ onSelect }) => {
  useMapEvents({ click(e) { onSelect({ lat: e.latlng.lat, lng: e.latlng.lng }); } });
  return null;
};

// Reusable Leaflet picker for a single delivery point.
export const PharmacyMapPicker = ({ value, onChange }) => {
  const [pos, setPos] = useState(value || null);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => {
      const c = { lat: p.coords.latitude, lng: p.coords.longitude };
      setPos(c); onChange(c);
    });
  };

  const handleSelect = (c) => { setPos(c); onChange(c); };

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200" data-testid="pharmacy-map-picker">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
        <span className="text-xs text-gray-500">Touchez la carte pour placer la livraison</span>
        <button type="button" onClick={useMyLocation} className="text-xs font-semibold text-[#FF4500] flex items-center gap-1" data-testid="pharmacy-use-location-btn">
          <MapPin size={14} weight="fill" /> Ma position
        </button>
      </div>
      <MapContainer center={[pos?.lat || 48.8566, pos?.lng || 2.3522]} zoom={13} style={{ height: 220, width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        <ClickHandler onSelect={handleSelect} />
        {pos && <Marker position={[pos.lat, pos.lng]} />}
      </MapContainer>
    </div>
  );
};

export default PharmacyMapPicker;
