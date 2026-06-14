/** FamilyMap — carte des proches (marqueurs personne + lieux). */
import React, { useEffect, useRef } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { GMAPS_LOADER_OPTIONS } from '../../../lib/googleMaps';

const PLACE_COLOR = { home: '#10B981', school: '#6366F1', work: '#F59E0B', other: '#6B7280' };

const FamilyMap = ({ center, members = [], places = [], height = 320 }) => {
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

    places.forEach((p) => {
      const col = PLACE_COLOR[p.kind] || PLACE_COLOR.other;
      overlays.current.push(new maps.Circle({ map, center: { lat: p.lat, lng: p.lng }, radius: p.radius_m, fillColor: col, fillOpacity: 0.1, strokeColor: col, strokeOpacity: 0.5, strokeWeight: 1.5 }));
      bounds.extend({ lat: p.lat, lng: p.lng }); has = true;
    });

    members.forEach((m) => {
      const live = m.live || {};
      if (live.lat == null || live.lng == null) return;
      const marker = new maps.Marker({
        position: { lat: live.lat, lng: live.lng }, map, title: m.name,
        label: { text: (m.name || '?')[0].toUpperCase(), color: '#fff', fontSize: '11px', fontWeight: '700' },
        icon: { path: maps.SymbolPath.CIRCLE, scale: 13, fillColor: m.color || '#3B82F6', fillOpacity: live.status === 'online' ? 1 : 0.45, strokeColor: '#fff', strokeWeight: 2.5 },
      });
      overlays.current.push(marker);
      bounds.extend({ lat: live.lat, lng: live.lng }); has = true;
    });

    if (has && !fitted.current) { try { map.fitBounds(bounds, 60); fitted.current = true; } catch { /* ignore */ } }
  }, [isLoaded, center, members, places]);

  if (!isLoaded) return <div className="flex justify-center items-center bg-gray-100 rounded-2xl" style={{ height }} data-testid="family-map-loading"><div className="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin" /></div>;
  return <div ref={mapRef} data-testid="family-map" style={{ width: '100%', height, borderRadius: 16 }} />;
};

export default FamilyMap;
