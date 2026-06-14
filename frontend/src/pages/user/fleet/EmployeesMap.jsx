/** EmployeesMap — carte des employés (marqueurs personne + arrêts de tournée). */
import React, { useEffect, useRef } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { GMAPS_LOADER_OPTIONS } from '../../../lib/googleMaps';

const EmployeesMap = ({ center, employees = [], stops = [], height = 300 }) => {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const overlays = useRef([]);
  const fitted = useRef(false);
  const { isLoaded } = useJsApiLoader(GMAPS_LOADER_OPTIONS);

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    const maps = window.google.maps;
    const c = center || { lat: 14.6036, lng: -61.0667 };
    if (!mapObj.current) {
      mapObj.current = new maps.Map(mapRef.current, { center: c, zoom: 13, disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false });
    }
    const map = mapObj.current;
    overlays.current.forEach((o) => o.setMap && o.setMap(null));
    overlays.current = [];
    const bounds = new maps.LatLngBounds();
    let has = false;

    stops.forEach((s) => {
      if (s.lat == null || s.lng == null) return;
      overlays.current.push(new maps.Marker({
        position: { lat: s.lat, lng: s.lng }, map, title: s.name,
        icon: { path: maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 4, rotation: 180,
          fillColor: s.done ? '#10B981' : '#94A3B8', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5 },
      }));
      bounds.extend({ lat: s.lat, lng: s.lng }); has = true;
    });

    employees.forEach((e) => {
      const live = e.live || {};
      if (live.lat == null || live.lng == null) return;
      overlays.current.push(new maps.Marker({
        position: { lat: live.lat, lng: live.lng }, map, title: e.name,
        label: { text: (e.name || '?')[0].toUpperCase(), color: '#fff', fontSize: '11px', fontWeight: '700' },
        icon: { path: maps.SymbolPath.CIRCLE, scale: 13, fillColor: e.color || '#0EA5E9',
          fillOpacity: live.status === 'working' ? 1 : 0.4, strokeColor: '#fff', strokeWeight: 2.5 },
      }));
      bounds.extend({ lat: live.lat, lng: live.lng }); has = true;
    });

    if (has && !fitted.current) { try { map.fitBounds(bounds, 60); fitted.current = true; } catch { /* ignore */ } }
  }, [isLoaded, center, employees, stops]);

  if (!isLoaded) return <div className="flex justify-center items-center bg-gray-100 rounded-2xl" style={{ height }} data-testid="employees-map-loading"><div className="w-8 h-8 border-2 border-sky-200 border-t-sky-500 rounded-full animate-spin" /></div>;
  return <div ref={mapRef} data-testid="employees-map" style={{ width: '100%', height, borderRadius: 16 }} />;
};

export default EmployeesMap;
