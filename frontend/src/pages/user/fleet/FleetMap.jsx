/**
 * FleetMap — carte temps réel de la flotte (Google Maps).
 * Marqueurs véhicules colorés par statut + flèche orientée (cap),
 * trajet historique (polyline) et géo-zones (cercles) optionnels.
 */
import React, { useEffect, useRef } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { GMAPS_LOADER_OPTIONS } from '../../../lib/googleMaps';
import { statusMeta } from './fleetShared';

const FleetMap = ({ center, vehicles = [], selectedId, onSelect, history, geofences = [], height = 420 }) => {
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
      mapObj.current = new maps.Map(mapRef.current, {
        center: c, zoom: 13, disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false,
      });
    }
    const map = mapObj.current;
    overlays.current.forEach((o) => o.setMap && o.setMap(null));
    overlays.current = [];
    const bounds = new maps.LatLngBounds();
    let hasPt = false;

    // Geofences (circles)
    geofences.forEach((g) => {
      overlays.current.push(new maps.Circle({
        map, center: { lat: g.lat, lng: g.lng }, radius: g.radius_m,
        fillColor: '#6366F1', fillOpacity: 0.08, strokeColor: '#6366F1', strokeOpacity: 0.5, strokeWeight: 1.5,
      }));
      bounds.extend({ lat: g.lat, lng: g.lng }); hasPt = true;
    });

    // History polyline
    if (history && history.length > 1) {
      overlays.current.push(new maps.Polyline({
        map, path: history.map((p) => ({ lat: p.lat, lng: p.lng })),
        strokeColor: '#FF5000', strokeOpacity: 0.9, strokeWeight: 4,
      }));
      history.forEach((p) => { bounds.extend({ lat: p.lat, lng: p.lng }); hasPt = true; });
    }

    // Vehicle markers
    vehicles.forEach((v) => {
      const live = v.live || {};
      if (live.lat == null || live.lng == null) return;
      const sel = v.id === selectedId;
      const sm = statusMeta(live.status);
      const marker = new maps.Marker({
        position: { lat: live.lat, lng: live.lng }, map, title: v.name, zIndex: sel ? 200 : 60,
        icon: {
          path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: sel ? 7 : 5.5, rotation: live.heading || 0,
          fillColor: sm.color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2,
        },
      });
      marker.addListener('click', () => onSelect && onSelect(v));
      overlays.current.push(marker);
      bounds.extend({ lat: live.lat, lng: live.lng }); hasPt = true;
    });

    if (hasPt && (!fitted.current || history)) {
      try { map.fitBounds(bounds, 60); fitted.current = true; } catch { /* ignore */ }
    }
  }, [isLoaded, center, vehicles, selectedId, onSelect, history, geofences]);

  if (!isLoaded) {
    return (
      <div className="flex justify-center items-center bg-gray-100 rounded-2xl" style={{ height }} data-testid="fleet-map-loading">
        <div className="w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }
  return <div ref={mapRef} data-testid="fleet-map" style={{ width: '100%', height, borderRadius: 16 }} />;
};

export default FleetMap;
