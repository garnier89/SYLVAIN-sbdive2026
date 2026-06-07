/**
 * GoogleRideMap — live ride map on Google Maps (replaces Leaflet/OSM which
 * rendered as blank "tofu" tiles on some devices). Shows the route, a black
 * ETA teardrop pin and a smooth Uber/inDrive-style car (interpolated movement
 * + heading rotation), all via @react-google-maps/api OverlayViews.
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { GoogleMap, Polyline, OverlayView, useJsApiLoader } from '@react-google-maps/api';
import { decodePolyline } from '../../../utils/polyline';
import { GMAPS_LOADER_OPTIONS } from '../../../lib/googleMaps';

const CONTAINER = { width: '100%', height: '100%' };

const MAP_OPTIONS = {
  disableDefaultUI: true,
  gestureHandling: 'greedy',
  clickableIcons: false,
  keyboardShortcuts: false,
  styles: [
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  ],
};

const distKm = (a, b) => {
  if (!a || !b) return 0;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const bearingDeg = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180) / Math.PI;
};

const CarSvg = () => (
  <svg width="40" height="40" viewBox="0 0 64 64" style={{ filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.4))' }}>
    <rect x="17" y="5" width="30" height="54" rx="13" fill="#fff" stroke="#1a1a1a" strokeWidth="2.5" />
    <rect x="22" y="12" width="20" height="13" rx="4" fill="#9fb3c8" />
    <rect x="22" y="38" width="20" height="11" rx="4" fill="#9fb3c8" />
    <rect x="24" y="27" width="16" height="9" rx="2" fill="#dfe7ef" />
    <circle cx="22" cy="55" r="2.4" fill="#e11d2a" /><circle cx="42" cy="55" r="2.4" fill="#e11d2a" />
  </svg>
);

// Smoothly interpolates the car between GPS updates; isolated so the heavy
// GoogleMap parent does not re-render every animation frame.
const AnimatedCarOverlay = ({ lat, lng }) => {
  const [pos, setPos] = useState({ lat, lng });
  const posRef = useRef({ lat, lng });
  const headingRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = posRef.current;
    const to = { lat, lng };
    if (distKm(from, to) > 0.0003) headingRef.current = bearingDeg(from, to);
    const duration = 1400, start = performance.now();
    cancelAnimationFrame(rafRef.current);
    const step = (t) => {
      const k = Math.min(1, (t - start) / duration);
      const nlat = from.lat + (to.lat - from.lat) * k;
      const nlng = from.lng + (to.lng - from.lng) * k;
      posRef.current = { lat: nlat, lng: nlng };
      setPos({ lat: nlat, lng: nlng });
      if (k < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [lat, lng]);

  return (
    <OverlayView position={pos} mapPaneName={OverlayView.OVERLAY_LAYER} getPixelPositionOffset={(w, h) => ({ x: -w / 2, y: -h / 2 })}>
      <div style={{ transform: `rotate(${headingRef.current}deg)`, transition: 'transform .4s linear', willChange: 'transform' }}>
        <CarSvg />
      </div>
    </OverlayView>
  );
};

const GoogleRideMap = ({ ride, driverPos }) => {
  const { isLoaded, loadError } = useJsApiLoader(GMAPS_LOADER_OPTIONS);
  const mapRef = useRef(null);

  const inProgress = ride.status === 'in_progress';
  const target = inProgress
    ? { lat: ride.dropoff_lat, lng: ride.dropoff_lng }
    : { lat: ride.pickup_lat, lng: ride.pickup_lng };
  const carPos = driverPos || { lat: target.lat + 0.0045, lng: target.lng + 0.0045 };
  const eta = useMemo(() => Math.max(1, Math.round((distKm(carPos, target) / 28) * 60)), [carPos, target]);

  const route = useMemo(() => {
    const decoded = decodePolyline(ride.route_polyline);
    return decoded.length
      ? decoded.map((p) => ({ lat: p.lat, lng: p.lng }))
      : [{ lat: ride.pickup_lat, lng: ride.pickup_lng }, { lat: ride.dropoff_lat, lng: ride.dropoff_lng }];
  }, [ride.route_polyline, ride.pickup_lat, ride.pickup_lng, ride.dropoff_lat, ride.dropoff_lng]);

  const onLoad = useCallback((map) => {
    mapRef.current = map;
    const b = new window.google.maps.LatLngBounds();
    b.extend(carPos); b.extend(target);
    map.fitBounds(b, { top: 90, bottom: 70, left: 60, right: 60 });
  }, [carPos, target]);

  if (loadError) {
    return <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-500 text-sm">Carte indisponible</div>;
  }
  if (!isLoaded) {
    return <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-400 text-sm animate-pulse">Chargement de la carte…</div>;
  }

  return (
    <GoogleMap mapContainerStyle={CONTAINER} center={carPos} zoom={15} options={MAP_OPTIONS} onLoad={onLoad}>
      {inProgress && <Polyline path={route} options={{ strokeColor: '#3b82f6', strokeOpacity: 0.9, strokeWeight: 5 }} />}
      <Polyline path={[carPos, target]} options={{ strokeColor: '#111', strokeOpacity: 0.95, strokeWeight: 4 }} />

      {/* ETA teardrop pin */}
      <OverlayView position={target} mapPaneName={OverlayView.OVERLAY_LAYER} getPixelPositionOffset={(w, h) => ({ x: -w / 2, y: -h })}>
        <div style={{ position: 'relative', width: 64, height: 64 }} data-testid="map-eta-pin">
          <div style={{ position: 'absolute', inset: 0, background: '#111', borderRadius: '50% 50% 50% 0', transform: 'rotate(45deg)', boxShadow: '0 5px 12px rgba(0,0,0,.45)' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, lineHeight: 1 }}>
            <span style={{ fontSize: 15 }}>{eta}</span><span style={{ fontSize: 11, fontWeight: 600 }}>min</span>
          </div>
        </div>
      </OverlayView>

      <AnimatedCarOverlay lat={carPos.lat} lng={carPos.lng} />
    </GoogleMap>
  );
};

export default GoogleRideMap;
