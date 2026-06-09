import React, { useState, useEffect } from 'react';
import { X, MapPin, CheckCircle, House } from '@phosphor-icons/react';
import { toast } from 'sonner';
import GooglePlacesInput from '../../GooglePlacesInput';
import { driverAPI } from '../../../services/api';

const SERVICE_LABELS = { taxi: 'Taxi / VTC', delivery: 'Livraison', courier: 'Coursier' };

/**
 * DriverLocationsModal — "Emplacements / lieu de résidence".
 * Lets the driver set their residence (work base) and activate every service
 * available on the platform in one tap.
 */
const DriverLocationsModal = ({ open, onClose }) => {
  const [dest, setDest] = useState(null);
  const [typedAddr, setTypedAddr] = useState('');
  const [activateAll, setActivateAll] = useState(true);
  const [services, setServices] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    (async () => {
      try {
        const r = await driverAPI.getWorkBase();
        if (!alive) return;
        setServices(r.data?.service_types || []);
        if (r.data?.home_location?.address) setTypedAddr(r.data.home_location.address);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;

  const save = async () => {
    if (!typedAddr.trim() && !dest) { toast.error('Indiquez votre lieu de résidence'); return; }
    setSaving(true);
    try {
      const r = await driverAPI.setWorkBase({
        address: dest?.address || typedAddr,
        lat: dest?.lat,
        lng: dest?.lng,
        activate_all: activateAll,
      });
      setServices(r.data?.service_types || []);
      toast.success('Lieu de résidence enregistré');
      if (r.data?.taxi_note) toast.info(r.data.taxi_note);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Enregistrement impossible');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[2700] bg-black/50 flex items-end" onClick={onClose} data-testid="driver-locations-modal">
      <div className="w-full bg-white rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2"><House size={22} weight="fill" style={{ color: '#0EA5E9' }} /> Lieu de résidence</h3>
          <button onClick={onClose} className="text-gray-400" data-testid="driver-locations-close"><X size={22} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">Définissez votre point d&apos;attache et activez tous les services disponibles sur la plateforme.</p>

        <label className="text-sm font-bold text-gray-700">Adresse de résidence</label>
        <div className="mt-1 mb-4">
          <GooglePlacesInput
            placeholder="Votre adresse"
            defaultValue={typedAddr}
            onChange={setTypedAddr}
            onSelect={(p) => { setDest(p); setTypedAddr(p.address); }}
            testId="driver-residence-input"
          />
        </div>

        <button
          onClick={() => setActivateAll((v) => !v)}
          className={`w-full flex items-center justify-between border rounded-2xl px-4 py-3 mb-4 ${activateAll ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}
          data-testid="activate-all-services-toggle">
          <span className="text-sm font-semibold text-gray-800 text-left">Activer tous les services disponibles</span>
          <span className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors ${activateAll ? 'bg-emerald-500 justify-end' : 'bg-gray-300 justify-start'}`}>
            <span className="w-5 h-5 bg-white rounded-full" />
          </span>
        </button>

        {services.length > 0 && (
          <div className="mb-4" data-testid="active-services-list">
            <p className="text-xs font-bold text-gray-500 mb-2">Services actifs</p>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                  <CheckCircle size={13} weight="fill" /> {SERVICE_LABELS[s] || s}
                </span>
              ))}
            </div>
          </div>
        )}

        <button onClick={save} disabled={saving} className="w-full text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50" style={{ background: '#0EA5E9' }} data-testid="save-work-base-btn">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
};

export default DriverLocationsModal;
