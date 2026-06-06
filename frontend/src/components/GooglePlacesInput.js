import React, { useRef, useEffect, useState } from 'react';
import { MapPin } from '@phosphor-icons/react';

const GMAP_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks = [];

const loadGooglePlaces = (callback) => {
  if (scriptLoaded && window.google?.maps?.places) { callback(); return; }
  loadCallbacks.push(callback);
  if (scriptLoading) return;
  scriptLoading = true;
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAP_KEY}&libraries=places`;
  script.async = true;
  script.onload = () => { scriptLoaded = true; loadCallbacks.forEach(cb => cb()); loadCallbacks.length = 0; };
  document.head.appendChild(script);
};

const GooglePlacesInput = ({
  placeholder = "Saisissez une adresse",
  value = '',
  onChange,
  onSelect,
  iconColor = '#FF4500',
  className = '',
  inputClassName = '',
  testId = 'places-input',
  darkMode = false,
  onFocus,
}) => {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => { setLocalValue(value); }, [value]);

  useEffect(() => {
    if (!GMAP_KEY) return;
    loadGooglePlaces(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || !inputRef.current || autocompleteRef.current) return;
    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['geocode', 'establishment'],
      componentRestrictions: { country: ['fr', 'mq', 'gp', 'gf', 're'] },
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.geometry) return;
      const result = {
        address: place.formatted_address || place.name,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        place_id: place.place_id,
      };
      setLocalValue(result.address);
      if (onChange) onChange(result.address);
      if (onSelect) onSelect(result);
    });
    autocompleteRef.current = ac;
  }, [ready, onChange, onSelect]);

  const handleChange = (e) => {
    setLocalValue(e.target.value);
    if (onChange) onChange(e.target.value);
  };

  const base = darkMode
    ? 'w-full bg-white/10 border border-white/20 rounded-xl px-10 py-3 text-white placeholder-gray-400 text-sm focus:outline-none focus:border-orange-500/50'
    : 'w-full bg-white border border-gray-200 rounded-xl px-10 py-3 text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400';

  return (
    <div className={`relative ${className}`}>
      <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 z-10" weight="fill" style={{ color: iconColor }} />
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={localValue}
        onChange={handleChange}
        onFocus={onFocus}
        className={`${base} ${inputClassName}`}
        data-testid={testId}
        autoComplete="off"
      />
    </div>
  );
};

export default GooglePlacesInput;
