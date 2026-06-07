import React, { useRef, useEffect, useState } from 'react';
import { MapPin } from '@phosphor-icons/react';
import { useJsApiLoader } from '@react-google-maps/api';
import { GMAPS_LOADER_OPTIONS } from '../lib/googleMaps';

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
  const { isLoaded } = useJsApiLoader(GMAPS_LOADER_OPTIONS);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => { setLocalValue(value); }, [value]);

  useEffect(() => {
    if (!isLoaded || !inputRef.current || autocompleteRef.current) return;
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
  }, [isLoaded, onChange, onSelect]);

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
