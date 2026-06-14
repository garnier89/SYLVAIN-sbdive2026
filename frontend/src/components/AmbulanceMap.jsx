/**
 * AmbulanceMap — live map for an emergency request: the patient (red) + the
 * approaching ambulance (white cross / green) with a connecting line.
 */
import React, { useEffect, useRef } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { GMAPS_LOADER_OPTIONS } from '../lib/googleMaps';

const AmbulanceMap = ({ pickup, ambulance, height = 240 }) => {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const overlays = useRef([]);
  const { isLoaded } = useJsApiLoader(GMAPS_LOADER_OPTIONS);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || !pickup) return;
    const maps = window.google.maps;
    if (!mapObj.current) {
      mapObj.current = new maps.Map(mapRef.current, {
        center: pickup, zoom: 14, disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false,
      });
    }
    const map = mapObj.current;
    overlays.current.forEach((o) => o.setMap && o.setMap(null));
    overlays.current = [];
    const bounds = new maps.LatLngBounds();

    // Patient marker (red pin)
    overlays.current.push(new maps.Marker({
      position: pickup, map, title: 'Patient', zIndex: 100,
      icon: { path: maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#EF4444', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
    }));
    bounds.extend(pickup);

    // Ambulance marker (green arrow) + line
    if (ambulance && ambulance.lat != null && ambulance.lng != null) {
      overlays.current.push(new maps.Marker({
        position: ambulance, map, title: 'Ambulance', zIndex: 120,
        icon: { path: maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 6, fillColor: '#16A34A', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      }));
      overlays.current.push(new maps.Polyline({
        map, path: [ambulance, pickup], strokeColor: '#16A34A', strokeOpacity: 0.7, strokeWeight: 4,
      }));
      bounds.extend(ambulance);
      try { map.fitBounds(bounds, 70); } catch { /* ignore */ }
    } else {
      map.setCenter(pickup);
    }
  }, [isLoaded, pickup, ambulance]);

  if (!isLoaded) {
    return (
      <div className="flex justify-center items-center bg-gray-100 rounded-2xl" style={{ height }} data-testid="ambulance-map-loading">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }
  return <div ref={mapRef} data-testid="ambulance-map" style={{ width: '100%', height, borderRadius: 16 }} />;
};

export default AmbulanceMap;
