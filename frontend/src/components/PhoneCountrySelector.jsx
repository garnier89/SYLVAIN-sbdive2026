/**
 * PhoneCountrySelector — uses /api/geo/phone-codes from V3Cube countries seed.
 * Usage:
 *   <PhoneCountrySelector value={code} onChange={setCode} />  // returns "+33"
 */
import React, { useEffect, useState, useRef } from 'react';
import { CaretDown, MagnifyingGlass } from '@phosphor-icons/react';
import api from '../services/api';

const FLAG_BY_CODE = (code) => {
  if (!code) return '🌍';
  const A = 0x41; const REGIONAL = 0x1F1E6;
  try {
    return String.fromCodePoint(...code.toUpperCase().split('').map(c => c.charCodeAt(0) - A + REGIONAL));
  } catch { return '🌍'; }
};

export default function PhoneCountrySelector({ value = '+33', onChange, className = '' }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef();

  useEffect(() => {
    api.get('/geo/phone-codes').then(r => setItems(r.data.items || [])).catch(() => setItems([]));
  }, []);

  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const current = items.find(i => `+${i.phone_code}` === value) || { code: 'FR', name: 'France', phone_code: '33' };
  const filtered = items.filter(i =>
    !search ||
    i.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.phone_code?.includes(search) ||
    i.code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={`relative ${className}`} ref={ref} data-testid="phone-country-selector">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 border-b-2 border-gray-300 py-2 px-1 hover:border-orange-400 focus:border-orange-500"
        data-testid="phone-country-trigger"
      >
        <span className="text-xl">{FLAG_BY_CODE(current.code)}</span>
        <span className="text-base font-medium">+{current.phone_code}</span>
        <CaretDown size={14} className="text-gray-500" />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-white border rounded-lg shadow-lg max-h-80 overflow-hidden flex flex-col">
          <div className="p-2 border-b">
            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher pays…" className="w-full pl-8 pr-2 py-1.5 text-sm border rounded outline-none focus:border-orange-400" data-testid="phone-country-search" />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.slice(0, 100).map(i => (
              <button
                key={i.code}
                type="button"
                onClick={() => { onChange?.(`+${i.phone_code}`); setOpen(false); setSearch(''); }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-orange-50 text-left text-sm"
                data-testid={`country-opt-${i.code}`}
              >
                <span className="text-lg">{FLAG_BY_CODE(i.code)}</span>
                <span className="flex-1 truncate">{i.name}</span>
                <span className="font-mono text-gray-500">+{i.phone_code}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-center text-gray-400 py-4 text-sm">Aucun résultat</p>}
          </div>
        </div>
      )}
    </div>
  );
}
