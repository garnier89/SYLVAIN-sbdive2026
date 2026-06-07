import React, { useState, useEffect } from 'react';
import { MapPinLine } from '@phosphor-icons/react';
import { geoAPI } from '../../services/api';

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400 bg-white';

/**
 * ZoneScopePicker — cascading Pays / Région / Ville selectors that produce a
 * geographic scope { country, state, city } for an admin configuration. Leaving
 * everything empty means the config is GLOBAL (applies everywhere). Choosing a
 * country (e.g. Martinique) restricts the config to that zone only.
 *
 * States/cities are fetched in change handlers (and once on mount for edit mode)
 * to stay clear of the React-Compiler set-state-in-effect rule.
 */
export const ZoneScopePicker = ({ value, onChange }) => {
  const scope = value || { country: '', state: '', city: '' };
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);

  useEffect(() => {
    let alive = true;
    const init = async () => {
      try {
        const c = await geoAPI.getCountries();
        if (alive) setCountries(c.data?.items || []);
      } catch { /* ignore */ }
      if (!scope.country) return;
      try {
        const [s, ci] = await Promise.all([
          geoAPI.getStates(scope.country),
          geoAPI.getCities(scope.country, scope.state || undefined),
        ]);
        if (!alive) return;
        setStates(s.data?.items || []);
        setCities(ci.data?.items || []);
      } catch { /* ignore */ }
    };
    init();
    return () => { alive = false; };
  }, []);

  const onCountry = async (country) => {
    onChange({ country, state: '', city: '' });
    if (!country) { setStates([]); setCities([]); return; }
    try {
      const [s, ci] = await Promise.all([geoAPI.getStates(country), geoAPI.getCities(country)]);
      setStates(s.data?.items || []);
      setCities(ci.data?.items || []);
    } catch { setStates([]); setCities([]); }
  };

  const onState = async (state) => {
    onChange({ ...scope, state, city: '' });
    try {
      const ci = await geoAPI.getCities(scope.country, state || undefined);
      setCities(ci.data?.items || []);
    } catch { setCities([]); }
  };

  return (
    <div className="rounded-xl border border-gray-200 p-3 bg-gray-50/60" data-testid="zone-scope-picker">
      <div className="flex items-center gap-1.5 mb-2">
        <MapPinLine size={16} weight="duotone" className="text-emerald-600" />
        <p className="text-xs font-bold text-gray-700">Portée géographique</p>
        <span className="text-[10px] text-gray-400">(vide = partout)</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select className={inputCls} value={scope.country || ''} onChange={(e) => onCountry(e.target.value)} data-testid="zone-country">
          <option value="">Tous les pays</option>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <select className={inputCls} value={scope.state || ''} onChange={(e) => onState(e.target.value)} disabled={!scope.country || states.length === 0} data-testid="zone-state">
          <option value="">Toutes les régions</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={inputCls} value={scope.city || ''} onChange={(e) => onChange({ ...scope, city: e.target.value })} disabled={!scope.country || cities.length === 0} data-testid="zone-city">
          <option value="">Toutes les villes</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    </div>
  );
};

export default ZoneScopePicker;
