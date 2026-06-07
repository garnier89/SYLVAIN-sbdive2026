import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon paths broken by webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const blueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const numberedIcon = (n) => L.divIcon({
  className: '',
  html: `<div style="background:#f59e0b;color:#0B1426;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)">${n}</div>`,
  iconSize: [24, 24], iconAnchor: [12, 12],
});

const Recenter = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center?.lat && center?.lng) {
      map.setView([center.lat, center.lng], zoom ?? map.getZoom(), { animate: true });
    }
  }, [center?.lat, center?.lng, zoom, map]);
  return null;
};

const ClickHandler = ({ onClick }) => {
  useMapEvents({
    click(e) {
      onClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
};

/**
 * LeafletMap — Free OpenStreetMap-backed map component.
 *
 * Props:
 *  - center: {lat, lng}            current map center
 *  - zoom: number                  initial zoom
 *  - pickup, dropoff, driver: {lat, lng} optional markers
 *  - routePath: [{lat, lng}, ...]  optional polyline
 *  - heatPoints: [{lat, lng, count}] optional density circles
 *  - onMapClick: (latLng) => void  click handler for selecting a point
 *  - height: CSS height (default '100%')
 */
const LeafletMap = ({
  center = { lat: 48.8566, lng: 2.3522 },
  zoom = 13,
  pickup, dropoff, driver,
  routePath = [],
  waypoints = [],
  heatPoints = [],
  onMapClick,
  height = '100%',
}) => {
  const maxCount = heatPoints.length ? Math.max(...heatPoints.map(p => p.count || 1)) : 1;

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      style={{ height, width: '100%' }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Recenter center={center} zoom={zoom} />
      {onMapClick && <ClickHandler onClick={onMapClick} />}
      {pickup?.lat && <Marker position={[pickup.lat, pickup.lng]} icon={greenIcon} />}
      {dropoff?.lat && <Marker position={[dropoff.lat, dropoff.lng]} icon={redIcon} />}
      {waypoints.filter(w => w?.lat).map((w, i) => (
        <Marker key={`wp-${i}`} position={[w.lat, w.lng]} icon={numberedIcon(i + 1)} />
      ))}
      {driver?.lat && <Marker position={[driver.lat, driver.lng]} icon={blueIcon} />}
      {routePath.length > 1 && (
        <Polyline positions={routePath.map(p => [p.lat, p.lng])} pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.85 }} />
      )}
      {heatPoints.map((p, i) => {
        const intensity = (p.count || 1) / maxCount;
        const radius = 400 + intensity * 800;
        const color = intensity > 0.66 ? '#dc2626' : intensity > 0.33 ? '#f59e0b' : '#3b82f6';
        return (
          <Circle
            key={`${p.lat},${p.lng},${i}`}
            center={[p.lat, p.lng]}
            radius={radius}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.25, opacity: 0.6, weight: 1 }}
          />
        );
      })}
    </MapContainer>
  );
};

export default LeafletMap;
