/**
 * AdminGoogleMap — Google Maps wrapper for admin pages.
 * Migrates Leaflet/OSM usage to Google Maps for satellite/traffic support.
 *
 * Props:
 *   center: { lat, lng }
 *   zoom: number
 *   pickup, dropoff: { lat, lng } | null  (rendered as green/red markers)
 *   driver: { lat, lng } | null  (rendered as a yellow car marker)
 *   routePath: Array<{ lat, lng }>  (rendered as a blue polyline)
 *   mapType: 'roadmap' | 'satellite' | 'hybrid' | 'terrain'
 *   showTraffic: boolean
 *   markers: Array<{ id, lat, lng, label?, color?, onClick? }>  (extra markers)
 *   onMapClick: (lat, lng) => void
 *   heatmapData: Array<[lat, lng, weight?]>  (for AdminHeatView)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleMap, Marker, Polyline, TrafficLayer, useJsApiLoader } from '@react-google-maps/api';

const GMAP_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;
const LIBRARIES = ['places', 'visualization'];

const CONTAINER_STYLE = { width: '100%', height: '100%' };

const DEFAULT_OPTIONS = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: true,
  fullscreenControl: true,
  styles: [],
};

const AdminGoogleMap = ({
  center = { lat: 48.8566, lng: 2.3522 },
  zoom = 11,
  pickup,
  dropoff,
  driver,
  routePath,
  mapType = 'roadmap',
  showTraffic = false,
  markers = [],
  onMapClick,
  heatmapData,
}) => {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GMAP_KEY || '',
    libraries: LIBRARIES,
  });

  const mapRef = useRef(null);
  const heatmapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  const onLoad = useCallback((map) => {
    mapRef.current = map;
    setMapReady(true);
  }, []);

  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  // Heatmap layer (visualization library)
  useEffect(() => {
    if (!mapReady || !heatmapData || !window.google?.maps?.visualization) return;
    if (heatmapRef.current) {
      heatmapRef.current.setMap(null);
      heatmapRef.current = null;
    }
    if (heatmapData.length === 0) return;
    const points = heatmapData.map((p) =>
      Array.isArray(p)
        ? new window.google.maps.LatLng(p[0], p[1])
        : new window.google.maps.LatLng(p.lat, p.lng)
    );
    heatmapRef.current = new window.google.maps.visualization.HeatmapLayer({
      data: points,
      radius: 30,
      opacity: 0.65,
    });
    heatmapRef.current.setMap(mapRef.current);
    return () => {
      if (heatmapRef.current) heatmapRef.current.setMap(null);
    };
  }, [mapReady, heatmapData]);

  if (loadError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 text-red-700 p-4 text-sm">
        Impossible de charger Google Maps. Verifiez la cle API.
      </div>
    );
  }
  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-400 text-sm animate-pulse">
        Chargement de la carte...
      </div>
    );
  }

  const carIcon = window.google
    ? {
        // Material "directions_car" icon (cubic-bezier curves only — no SVG arc
        // shorthand, which Google Maps' SVG parser mis-parses and throws on).
        path: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
        fillColor: '#FBBF24',
        fillOpacity: 1,
        strokeColor: '#0B1426',
        strokeWeight: 1.2,
        scale: 1.3,
        anchor: new window.google.maps.Point(12, 12),
      }
    : null;

  return (
    <GoogleMap
      mapContainerStyle={CONTAINER_STYLE}
      center={center}
      zoom={zoom}
      options={{ ...DEFAULT_OPTIONS, mapTypeId: mapType }}
      onLoad={onLoad}
      onUnmount={onUnmount}
      onClick={(e) => onMapClick?.(e.latLng.lat(), e.latLng.lng())}
    >
      {showTraffic && <TrafficLayer />}

      {pickup?.lat && (
        <Marker
          position={{ lat: pickup.lat, lng: pickup.lng }}
          label={{ text: 'A', color: '#fff', fontWeight: 'bold' }}
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: '#10B981',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
            scale: 12,
          }}
        />
      )}
      {dropoff?.lat && (
        <Marker
          position={{ lat: dropoff.lat, lng: dropoff.lng }}
          label={{ text: 'B', color: '#fff', fontWeight: 'bold' }}
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: '#EF4444',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
            scale: 12,
          }}
        />
      )}
      {driver?.lat && (
        <Marker
          position={{ lat: driver.lat, lng: driver.lng }}
          icon={carIcon}
          zIndex={999}
        />
      )}
      {markers.map((m) => (
        <Marker
          key={m.id}
          position={{ lat: m.lat, lng: m.lng }}
          label={m.label ? { text: m.label, color: '#fff', fontWeight: 'bold', fontSize: '10px' } : undefined}
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: m.color || '#3B82F6',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
            scale: m.label ? 13 : 10,
          }}
          onClick={() => m.onClick?.(m)}
        />
      ))}

      {routePath?.length > 1 && (
        <Polyline
          path={routePath.map((p) => ({ lat: p.lat, lng: p.lng }))}
          options={{
            strokeColor: '#3B82F6',
            strokeOpacity: 0.85,
            strokeWeight: 4,
          }}
        />
      )}
    </GoogleMap>
  );
};

export default AdminGoogleMap;
