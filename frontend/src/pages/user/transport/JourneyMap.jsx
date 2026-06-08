/**
 * JourneyMap — trace l'itinéraire de transport public sur une carte Google.
 * Polyligne par ligne (couleur de la ligne) + segments de marche en pointillés
 * + marqueurs départ/destination/arrêts/correspondances. Réutilise le loader
 * Google Maps déjà chargé dans l'app.
 */
import React, { useEffect, useRef } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { GMAPS_LOADER_OPTIONS } from '../../../lib/googleMaps';

const JourneyMap = ({ plan }) => {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const overlays = useRef([]);
  const { isLoaded } = useJsApiLoader(GMAPS_LOADER_OPTIONS);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || !plan?.found) return;
    const maps = window.google.maps;
    if (!mapObj.current) {
      mapObj.current = new maps.Map(mapRef.current, {
        center: { lat: plan.origin.lat, lng: plan.origin.lng },
        zoom: 13, disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false,
      });
    }
    const map = mapObj.current;
    overlays.current.forEach((o) => o.setMap && o.setMap(null));
    overlays.current = [];
    const bounds = new maps.LatLngBounds();
    const extend = (lat, lng) => bounds.extend({ lat, lng });

    const dot = (lat, lng, color, scale = 5, stroke = '#fff', sw = 2) => {
      overlays.current.push(new maps.Marker({
        position: { lat, lng }, map,
        icon: { path: maps.SymbolPath.CIRCLE, scale, fillColor: color, fillOpacity: 1, strokeColor: stroke, strokeWeight: sw },
        zIndex: scale >= 7 ? 50 : 10,
      }));
      extend(lat, lng);
    };

    (plan.legs || []).forEach((leg) => {
      if (leg.type === 'ride') {
        const path = (leg.via || []).map((v) => ({ lat: v.lat, lng: v.lng }));
        if (path.length >= 2) {
          overlays.current.push(new maps.Polyline({
            path, map, strokeColor: leg.color || '#2563EB', strokeWeight: 5, strokeOpacity: 0.9, zIndex: 5,
          }));
          path.forEach((p) => extend(p.lat, p.lng));
          // intermediate stops
          path.slice(1, -1).forEach((p) => dot(p.lat, p.lng, '#fff', 4, leg.color || '#2563EB', 2));
        }
      } else {
        // walk — dashed line
        if (leg.from_lat != null && leg.to_lat != null) {
          overlays.current.push(new maps.Polyline({
            path: [{ lat: leg.from_lat, lng: leg.from_lng }, { lat: leg.to_lat, lng: leg.to_lng }],
            map, strokeOpacity: 0, zIndex: 3,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.7, strokeColor: '#64748B', scale: 3 }, offset: '0', repeat: '10px' }],
          }));
          extend(leg.from_lat, leg.from_lng); extend(leg.to_lat, leg.to_lng);
        }
      }
    });

    // boarding/alighting + transfer markers (endpoints of each ride leg)
    const rides = (plan.legs || []).filter((l) => l.type === 'ride');
    rides.forEach((leg, idx) => {
      // transfer = alight stop of this leg shared with board of next leg
      dot(leg.to_lat, leg.to_lng, idx < rides.length - 1 ? '#0B1426' : '#FF5000', 6, '#fff', 2);
      if (idx === 0) dot(leg.from_lat, leg.from_lng, '#3730A3', 6, '#fff', 2);
    });

    // origin (green) + destination (red)
    dot(plan.origin.lat, plan.origin.lng, '#22C55E', 7, '#fff', 3);
    dot(plan.dest.lat, plan.dest.lng, '#EF4444', 7, '#fff', 3);

    try { map.fitBounds(bounds, 40); } catch (e) { /* ignore */ }
  }, [isLoaded, plan]);

  if (!plan?.found) return null;
  return (
    <div className="mt-3 rounded-xl overflow-hidden border border-[#E2E8F0]" data-testid="journey-map">
      <div ref={mapRef} style={{ width: '100%', height: 200 }} />
    </div>
  );
};

export default JourneyMap;
