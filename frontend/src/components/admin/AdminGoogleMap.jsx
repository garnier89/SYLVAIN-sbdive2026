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
import { GMAPS_LOADER_OPTIONS } from '../../lib/googleMaps';

const CONTAINER_STYLE = { width: '100%', height: '100%' };

const DEFAULT_OPTIONS = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: true,
  fullscreenControl: true,
  styles: [],
};

// Top-view car marker (matches the client app's "radar cars") rendered as a
// data-URL so the driver/admin Google Maps show the same little car as the
// client search radar instead of a flat material icon.
const CAR_INNER = '<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e7ebf1"/></linearGradient></defs><rect x="2" y="20" width="4.5" height="3.4" rx="1.7" fill="#dfe3e9"/><rect x="33.5" y="20" width="4.5" height="3.4" rx="1.7" fill="#dfe3e9"/><rect x="5" y="2" width="30" height="52" rx="12" fill="url(#b)" stroke="#c5cbd4" stroke-width="1"/><path d="M9.5 18 C14 13 26 13 30.5 18 L28.5 25.5 C23 22.8 17 22.8 11.5 25.5 Z" fill="#1f2733" opacity="0.88"/><rect x="11" y="27" width="18" height="11.5" rx="4" fill="#f4f6f9"/><path d="M11.5 40 C17 38 23 38 28.5 40 L30.5 46 C25.5 44 14.5 44 9.5 46 Z" fill="#2b3340" opacity="0.7"/><rect x="7" y="48.5" width="6" height="3.2" rx="1.6" fill="#e23030"/><rect x="27" y="48.5" width="6" height="3.2" rx="1.6" fill="#e23030"/>';
const CAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="56" viewBox="0 0 40 56">${CAR_INNER}</svg>`;
const DEFAULT_CAR_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(CAR_SVG)}`;

// Rotated car (heading aware): the car (front pointing up) is drawn centered in
// a 56×56 square and rotated by the compass bearing so it faces its direction.
const rotatedCarUrl = (deg) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><g transform="rotate(${Math.round(deg)} 28 28) translate(8 0)">${CAR_INNER}</g></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const AdminGoogleMap = ({
  center = { lat: 48.8566, lng: 2.3522 },
  zoom = 11,
  pickup,
  dropoff,
  driver,
  driverIconUrl = '',
  driverHeading = null,
  routePath,
  mapType = 'roadmap',
  showTraffic = false,
  routeColor = '#3B82F6',
  markers = [],
  onMapClick,
  heatmapData,
  staticView = false,
  mapTypeControl = true,
  cleanUI = false,
}) => {
  const { isLoaded, loadError } = useJsApiLoader(GMAPS_LOADER_OPTIONS);

  const mapRef = useRef(null);
  const heatLayerRef = useRef(null);
  const heatCirclesRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);

  const onLoad = useCallback((map) => {
    mapRef.current = map;
    setMapReady(true);
    // Static (locked) maps: frame the whole trip once, then never move again.
    if (staticView && window.google?.maps) {
      const pts = [];
      if (pickup?.lat) pts.push({ lat: pickup.lat, lng: pickup.lng });
      if (dropoff?.lat) pts.push({ lat: dropoff.lat, lng: dropoff.lng });
      (routePath || []).forEach((p) => { if (p?.lat) pts.push({ lat: p.lat, lng: p.lng }); });
      if (pts.length >= 2) {
        const b = new window.google.maps.LatLngBounds();
        pts.forEach((p) => b.extend(p));
        map.fitBounds(b, 56);
      }
    }
  }, [staticView]);

  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  // Demand "heat" overlay. Google Maps removed visualization.HeatmapLayer in
  // v3.65, so we render translucent weighted Circles instead (robust, never throws).
  useEffect(() => {
    const clear = () => {
      if (heatLayerRef.current) { heatLayerRef.current.setMap(null); heatLayerRef.current = null; }
      heatCirclesRef.current.forEach((c) => c.setMap(null));
      heatCirclesRef.current = [];
    };
    if (!mapReady || !heatmapData || !window.google?.maps || !mapRef.current) { clear(); return undefined; }
    clear();
    if (heatmapData.length === 0) return undefined;

    const norm = heatmapData.map((p) => (Array.isArray(p)
      ? { lat: p[0], lng: p[1], w: p[2] || 1 }
      : { lat: p.lat, lng: p.lng, w: p.count || p.weight || 1 }));
    const maxW = Math.max(1, ...norm.map((p) => p.w));

    // Prefer the native heatmap when the running API version still ships it.
    try {
      if (window.google.maps.visualization?.HeatmapLayer) {
        const points = norm.map((p) => new window.google.maps.LatLng(p.lat, p.lng));
        const layer = new window.google.maps.visualization.HeatmapLayer({ data: points, radius: 30, opacity: 0.65 });
        layer.setMap(mapRef.current);
        heatLayerRef.current = layer;
        return clear;
      }
    } catch (e) {
      // HeatmapLayer removed (v3.65+) — fall through to Circle rendering.
      console.warn('[map] HeatmapLayer unavailable, using circles fallback:', e?.message || e);
    }

    heatCirclesRef.current = norm.map((p) => {
      const intensity = p.w / maxW; // 0..1
      return new window.google.maps.Circle({
        map: mapRef.current,
        center: { lat: p.lat, lng: p.lng },
        radius: 250 + intensity * 550,
        fillColor: intensity > 0.66 ? '#EF4444' : intensity > 0.33 ? '#F59E0B' : '#FACC15',
        fillOpacity: 0.28,
        strokeWeight: 0,
        clickable: false,
        zIndex: 1,
      });
    });
    return clear;
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

  // Rotate the default car with the driver's heading when no custom icon is set.
  const useRotatedCar = driverHeading != null && !driverIconUrl;
  const carIcon = window.google
    ? {
        // Top-view car marker matching the client app's radar cars.
        url: useRotatedCar ? rotatedCarUrl(driverHeading) : (driverIconUrl || DEFAULT_CAR_URL),
        scaledSize: useRotatedCar ? new window.google.maps.Size(42, 42) : new window.google.maps.Size(30, 42),
        anchor: useRotatedCar ? new window.google.maps.Point(21, 21) : new window.google.maps.Point(15, 21),
      }
    : null;

  const mapOptions = staticView
    ? {
        ...DEFAULT_OPTIONS,
        mapTypeId: mapType,
        mapTypeControl: false,   // remove Plan / Satellite switch
        zoomControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        keyboardShortcuts: false,
        gestureHandling: 'none', // map stays stable — no drag / zoom gestures
        disableDefaultUI: true,
      }
    : {
        ...DEFAULT_OPTIONS,
        mapTypeId: mapType,
        mapTypeControl: cleanUI ? false : mapTypeControl,
        ...(cleanUI
          ? {
              disableDefaultUI: true,
              zoomControl: false,
              fullscreenControl: false,
              streetViewControl: false,
              rotateControl: false,
              scaleControl: false,
              keyboardShortcuts: false,
              gestureHandling: 'greedy',
            }
          : {}),
      };

  return (
    <GoogleMap
      mapContainerStyle={CONTAINER_STYLE}
      center={center}
      zoom={zoom}
      options={mapOptions}
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
            strokeColor: routeColor,
            strokeOpacity: 0.9,
            strokeWeight: 5,
          }}
        />
      )}
    </GoogleMap>
  );
};

export default AdminGoogleMap;
