/**
 * MapLocationPicker (Iter 90) — choisir un point sur une carte interactive.
 * Réutilise le script Google Maps déjà chargé par GooglePlacesInput (libraries=places).
 * Un pin fixe au centre ; à la confirmation, reverse-geocoding de la position centrale.
 */
import React, { useEffect, useRef, useState } from 'react';
import { MapPin, X, NavigationArrow } from '@phosphor-icons/react';

const DEFAULT_CENTER = { lat: 48.8566, lng: 2.3522 }; // Paris

const MapLocationPicker = ({ open, initial, target = 'dropoff', onConfirm, onClose }) => {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const [address, setAddress] = useState('');
  const [pickTarget, setPickTarget] = useState(target);
  const [ready, setReady] = useState(false);

  useEffect(() => { setPickTarget(target); }, [target, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const init = () => {
      if (cancelled || !window.google?.maps || !mapRef.current) return;
      const center = initial?.lat ? { lat: initial.lat, lng: initial.lng } : DEFAULT_CENTER;
      mapObj.current = new window.google.maps.Map(mapRef.current, {
        center, zoom: 15, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy',
      });
      setReady(true);
      const geocoder = new window.google.maps.Geocoder();
      const update = () => {
        const c = mapObj.current.getCenter();
        geocoder.geocode({ location: { lat: c.lat(), lng: c.lng() } }, (results, status) => {
          if (status === 'OK' && results?.[0]) setAddress(results[0].formatted_address);
        });
      };
      mapObj.current.addListener('idle', update);
      update();
    };
    if (window.google?.maps) init();
    else {
      let tries = 0;
      const iv = setInterval(() => {
        tries += 1;
        if (window.google?.maps) { clearInterval(iv); init(); }
        else if (tries > 30) clearInterval(iv);
      }, 300);
      return () => { cancelled = true; clearInterval(iv); };
    }
    return () => { cancelled = true; };
  }, [open, initial]);

  const confirm = () => {
    if (!mapObj.current) return;
    const c = mapObj.current.getCenter();
    onConfirm({ address: address || 'Position sur la carte', lat: c.lat(), lng: c.lng() }, pickTarget);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col max-w-[430px] mx-auto" data-testid="map-picker">
      {/* Header */}
      <div className="bg-[#0B1426] text-white px-4 pt-12 pb-3 flex items-center gap-3">
        <button onClick={onClose} data-testid="map-picker-close"><X size={24} /></button>
        <h2 className="text-lg font-bold flex-1">Définir sur la carte</h2>
      </div>

      {/* Target toggle */}
      <div className="flex gap-2 px-4 py-2 bg-gray-50 border-b">
        {[{ k: 'pickup', l: 'Départ' }, { k: 'dropoff', l: 'Destination' }].map((t) => (
          <button key={t.k} onClick={() => setPickTarget(t.k)} data-testid={`map-target-${t.k}`}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${pickTarget === t.k ? 'bg-[#0B1426] text-white border-transparent' : 'bg-white text-[#0B1426] border-[#E2E8F0]'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Map + center pin */}
      <div className="relative flex-1">
        <div ref={mapRef} className="absolute inset-0" />
        {!ready && <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Chargement de la carte…</div>}
        {/* Fixed center pin */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full pointer-events-none">
          <MapPin size={42} weight="fill" className="text-[#FF5000] drop-shadow-lg" />
        </div>
      </div>

      {/* Address bar + confirm */}
      <div className="p-4 border-t bg-white">
        <div className="flex items-start gap-2 mb-3">
          <NavigationArrow size={18} className="text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-gray-700 flex-1" data-testid="map-picker-address">{address || 'Déplacez la carte pour choisir un lieu'}</p>
        </div>
        <button onClick={confirm} disabled={!ready} data-testid="map-picker-confirm"
          className="w-full py-3.5 rounded-xl font-bold text-[#0B1426] disabled:opacity-50" style={{ backgroundColor: '#FF5000' }}>
          Confirmer ce lieu
        </button>
      </div>
    </div>
  );
};

export default MapLocationPicker;
