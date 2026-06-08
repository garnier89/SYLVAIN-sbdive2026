/**
 * RideRouteMap — full-bleed Google Map showing the booking route (pickup → dropoff).
 * Reuses the Google Maps script already loaded app-wide. Draws the real road route
 * (DirectionsService) with custom green/red markers and fits the bounds. Falls back
 * to a straight line if Directions is unavailable.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { GMAPS_LOADER_OPTIONS } from '../lib/googleMaps';

const RideRouteMap = ({ pickup, dropoff }) => {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const overlays = useRef([]);
  const { isLoaded } = useJsApiLoader(GMAPS_LOADER_OPTIONS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || !pickup?.lat) return undefined;
    const maps = window.google.maps;
    if (!mapObj.current) {
      mapObj.current = new maps.Map(mapRef.current, {
        center: { lat: pickup.lat, lng: pickup.lng },
        zoom: 13,
        disableDefaultUI: true,
        gestureHandling: 'greedy',
        clickableIcons: false,
      });
      setReady(true);
    }
    const map = mapObj.current;
    // Clear previous overlays
    overlays.current.forEach((o) => o.setMap && o.setMap(null));
    overlays.current = [];

    const dot = (pos, color) => new maps.Marker({
      position: pos,
      map,
      icon: { path: maps.SymbolPath.CIRCLE, scale: 8, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
    });
    overlays.current.push(dot({ lat: pickup.lat, lng: pickup.lng }, '#22C55E'));

    if (dropoff?.lat) {
      overlays.current.push(dot({ lat: dropoff.lat, lng: dropoff.lng }, '#EF4444'));
      const drawStraight = () => {
        const line = new maps.Polyline({
          path: [{ lat: pickup.lat, lng: pickup.lng }, { lat: dropoff.lat, lng: dropoff.lng }],
          strokeColor: '#0B1426', strokeWeight: 4, strokeOpacity: 0.85, map,
        });
        overlays.current.push(line);
      };
      try {
        const ds = new maps.DirectionsService();
        const renderer = new maps.DirectionsRenderer({
          map, suppressMarkers: true, preserveViewport: true,
          polylineOptions: { strokeColor: '#0B1426', strokeWeight: 5, strokeOpacity: 0.9 },
        });
        overlays.current.push(renderer);
        ds.route(
          { origin: { lat: pickup.lat, lng: pickup.lng }, destination: { lat: dropoff.lat, lng: dropoff.lng }, travelMode: maps.TravelMode.DRIVING },
          (res, status) => { if (status === 'OK' && res) renderer.setDirections(res); else drawStraight(); },
        );
      } catch { drawStraight(); }

      const b = new maps.LatLngBounds();
      b.extend({ lat: pickup.lat, lng: pickup.lng });
      b.extend({ lat: dropoff.lat, lng: dropoff.lng });
      map.fitBounds(b, { top: 70, bottom: 40, left: 50, right: 50 });
    } else {
      map.setCenter({ lat: pickup.lat, lng: pickup.lng });
      map.setZoom(15);
    }
    return undefined;
  }, [isLoaded, pickup, dropoff]);

  return (
    <>
      <div ref={mapRef} className="absolute inset-0" data-testid="ride-route-map" />
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm bg-gray-100">Chargement de la carte…</div>}
    </>
  );
};

export default RideRouteMap;
