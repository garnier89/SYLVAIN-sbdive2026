/**
 * NearbyPlacesMap — carte interactive des lieux « Commerces & Tourisme ».
 * Marqueur position utilisateur + une épingle par lieu (cliquable → fiche détail).
 * Réutilise le loader Google Maps partagé de l'app.
 */
import React, { useEffect, useRef } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { GMAPS_LOADER_OPTIONS } from '../../lib/googleMaps';

const NearbyPlacesMap = ({ center, items = [], selectedId, onSelect }) => {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const overlays = useRef([]);
  const { isLoaded } = useJsApiLoader(GMAPS_LOADER_OPTIONS);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || !center) return;
    const maps = window.google.maps;
    if (!mapObj.current) {
      mapObj.current = new maps.Map(mapRef.current, {
        center, zoom: 14, disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false,
      });
    }
    const map = mapObj.current;
    overlays.current.forEach((o) => o.setMap && o.setMap(null));
    overlays.current = [];
    const bounds = new maps.LatLngBounds();

    // User position (orange pulse)
    overlays.current.push(new maps.Marker({
      position: center, map, zIndex: 200,
      icon: { path: maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#FF5000', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
    }));
    bounds.extend(center);

    items.forEach((it) => {
      if (it.lat == null || it.lng == null) return;
      const sel = it.id === selectedId;
      const marker = new maps.Marker({
        position: { lat: it.lat, lng: it.lng }, map, title: it.name, zIndex: sel ? 120 : 40,
        icon: {
          path: maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: sel ? 7 : 5,
          fillColor: it.source === 'admin' ? '#F59E0B' : '#4F46E5',
          fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, rotation: 180,
        },
      });
      marker.addListener('click', () => onSelect && onSelect(it));
      overlays.current.push(marker);
      bounds.extend({ lat: it.lat, lng: it.lng });
    });

    const withCoords = items.filter((i) => i.lat != null && i.lng != null);
    try {
      if (withCoords.length) map.fitBounds(bounds, 50);
      else map.setCenter(center);
    } catch (e) { /* ignore */ }
  }, [isLoaded, center, items, selectedId, onSelect]);

  if (!isLoaded) {
    return (
      <div className="flex justify-center items-center" style={{ height: 380 }} data-testid="nearby-map-loading">
        <div className="w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }
  return <div ref={mapRef} data-testid="nearby-places-map" style={{ width: '100%', height: 380, borderRadius: 16 }} />;
};

export default NearbyPlacesMap;
