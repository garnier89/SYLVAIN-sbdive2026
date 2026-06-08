/**
 * NearbyTransitMap — carte des arrêts de transport public proches (GTFS réel).
 * Marqueur position utilisateur + marqueurs arrêts colorés par mode.
 * Réutilise le loader Google Maps de l'app.
 */
import React, { useEffect, useRef } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { GMAPS_LOADER_OPTIONS } from '../../../lib/googleMaps';

const MODE_COLOR = { bus: '#2563EB', tcsp: '#DC2626', ferry: '#0EA5E9', tram: '#0891B2', metro: '#7C3AED', rail: '#475569' };

const NearbyTransitMap = ({ center, stops = [], selectedId }) => {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const overlays = useRef([]);
  const { isLoaded } = useJsApiLoader(GMAPS_LOADER_OPTIONS);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || !center) return;
    const maps = window.google.maps;
    if (!mapObj.current) {
      mapObj.current = new maps.Map(mapRef.current, {
        center, zoom: 15, disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false,
      });
    }
    const map = mapObj.current;
    overlays.current.forEach((o) => o.setMap && o.setMap(null));
    overlays.current = [];
    const bounds = new maps.LatLngBounds();

    // user position (orange pulse)
    overlays.current.push(new maps.Marker({
      position: center, map, zIndex: 100,
      icon: { path: maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#FF5000', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
    }));
    bounds.extend(center);

    stops.forEach((s) => {
      if (s.lat == null || s.lng == null) return;
      const mode = (s.lines && s.lines[0] && s.lines[0].mode) || s.type || 'bus';
      const color = MODE_COLOR[mode] || '#2563EB';
      const sel = s.id === selectedId;
      overlays.current.push(new maps.Marker({
        position: { lat: s.lat, lng: s.lng }, map, title: s.name, zIndex: sel ? 60 : 20,
        icon: { path: maps.SymbolPath.CIRCLE, scale: sel ? 8 : 6, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      }));
      bounds.extend({ lat: s.lat, lng: s.lng });
    });

    try { if (stops.length) map.fitBounds(bounds, 60); else map.setCenter(center); } catch (e) { /* ignore */ }
  }, [isLoaded, center, stops, selectedId]);

  return <div ref={mapRef} data-testid="nearby-transit-map" style={{ width: '100%', height: 240 }} />;
};

export default NearbyTransitMap;
