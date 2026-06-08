import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { X, Taxi, CheckCircle } from '@phosphor-icons/react';
import GooglePlacesInput from '../GooglePlacesInput';
import { configAPI, rideAPI } from '../../services/api';
import { getGeocoder } from '../../lib/googleMaps';

const haversineKm = (a, b) => {
  if (!a || !b || a.lat == null || b.lat == null) return 0;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

/**
 * TaxiHallModal — V3Cube "Taxi Hall": the driver picks up a street-hail client,
 * enters the destination + vehicle gamme and starts an immediate metered ride.
 */
const TaxiHallModal = ({ open, onClose, origin, onStarted }) => {
  const [types, setTypes] = useState([]);
  const [gamme, setGamme] = useState(null);
  const [dest, setDest] = useState(null); // { address, lat, lng }
  const [typedAddr, setTypedAddr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await configAPI.getVehicleTypes();
        if (!alive) return;
        const list = Array.isArray(r.data) ? r.data : (r.data?.vehicle_types || []);
        setTypes(list);
        if (list[0]) setGamme(list[0].slug);
      } catch { /* ignore */ }
    };
    load();
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;

  const distKm = dest ? haversineKm(origin, dest) : 0;
  const vt = types.find((t) => t.slug === gamme) || {};
  const estimate = dest ? Math.max(vt.min_fare || 0, (vt.base_fare || 0) + distKm * (vt.price_per_km || 0)) : 0;

  const start = async () => {
    if (busy) return;
    if (!gamme) { toast.error('Choisissez une gamme.'); return; }
    // Resolve the destination: prefer a picked Places result, else geocode the typed text.
    let target = dest;
    if (!target && typedAddr.trim()) {
      try {
        const geocoder = await getGeocoder();
        if (geocoder) {
          const { results } = await geocoder.geocode({ address: typedAddr });
          if (results && results[0]) {
            const loc = results[0].geometry.location;
            target = { address: results[0].formatted_address, lat: loc.lat(), lng: loc.lng() };
          }
        }
      } catch { /* fall through */ }
    }
    if (!target) { toast.error('Saisissez et sélectionnez une destination.'); return; }
    const dKm = haversineKm(origin, target);
    const est = Math.max(vt.min_fare || 0, (vt.base_fare || 0) + dKm * (vt.price_per_km || 0));
    setBusy(true);
    try {
      const res = await rideAPI.taxiHall({
        pickup_lat: origin?.lat, pickup_lng: origin?.lng, pickup_address: origin?.address || 'Position actuelle',
        dropoff_lat: target.lat, dropoff_lng: target.lng, dropoff_address: target.address,
        vehicle_type: gamme,
        distance_km: Number(dKm.toFixed(2)),
        duration_mins: Math.max(1, Math.round((dKm / 28) * 60)),
        estimated_fare: Number(est.toFixed(2)),
        payment_method: 'cash',
      });
      toast.success('Course Taxi Hall démarrée.');
      onStarted(res.data);
    } catch { toast.error('Impossible de démarrer la course.'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[2700] bg-black/50 flex items-end" onClick={onClose} data-testid="taxi-hall-modal">
      <div className="w-full bg-white rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2"><Taxi size={22} weight="fill" style={{ color: '#00B578' }} /> Taxi Hall</h3>
          <button onClick={onClose} className="text-gray-400" data-testid="taxi-hall-close"><X size={22} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Prenez en charge un client qui ne connaît pas l&apos;application. Saisissez la destination et la gamme du véhicule.</p>

        <label className="text-sm font-bold text-gray-700">Destination</label>
        <div className="mt-1 mb-4">
          <GooglePlacesInput placeholder="Adresse de destination" onChange={setTypedAddr} onSelect={(p) => { setDest(p); setTypedAddr(p.address); }} testId="taxi-hall-dest" />
        </div>

        <label className="text-sm font-bold text-gray-700">Gamme du véhicule</label>
        <div className="mt-1 mb-4 grid grid-cols-3 gap-2" data-testid="taxi-hall-gammes">
          {types.map((t) => (
            <button key={t.slug} onClick={() => setGamme(t.slug)} data-testid={`taxi-hall-gamme-${t.slug}`}
              className={`py-2.5 rounded-xl text-sm font-bold border ${gamme === t.slug ? 'border-[#00B578] bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600'}`}>
              {t.name || t.slug}
            </button>
          ))}
        </div>

        {dest && (
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 mb-4" data-testid="taxi-hall-estimate">
            <span className="text-sm text-gray-600">{distKm.toFixed(1)} km · estimation</span>
            <span className="text-lg font-extrabold text-gray-900">{estimate.toFixed(2)} €</span>
          </div>
        )}

        <button onClick={start} disabled={busy} className="w-full py-3.5 rounded-2xl text-white font-extrabold flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: '#00B578' }} data-testid="taxi-hall-start-btn">
          <CheckCircle size={20} weight="fill" /> Démarrer la course
        </button>
      </div>
    </div>
  );
};

export default TaxiHallModal;
