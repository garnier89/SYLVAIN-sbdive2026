import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, Phone, User, Car, MapPin, FlagCheckered, CheckCircle } from '@phosphor-icons/react';
import { tripShareAPI } from '../services/api';
import RideTrackingMap from './user/ride-tracking/RideTrackingMap';

const STATUS_FR = {
  pending: 'Recherche de chauffeur', accepted: 'Chauffeur en route',
  arriving: 'Chauffeur en approche', in_progress: 'Trajet en cours',
  completed: 'Course terminée', cancelled: 'Course annulée', canceled: 'Course annulée',
};

const Stars = ({ value = 5 }) => (
  <span className="text-amber-400 text-sm font-bold">★ {Number(value || 5).toFixed(1)}</span>
);

const SharedTripPage = () => {
  const { token } = useParams();
  const [data, setData] = useState(undefined); // undefined=loading, null=error

  useEffect(() => {
    let alive = true; let timer;
    const tick = async () => {
      try {
        const r = await tripShareAPI.get(token);
        if (!alive) return;
        setData(r.data);
        if (r.data.active) timer = setTimeout(tick, 5000);
      } catch (e) { if (alive) setData(null); }
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [token]);

  if (data === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" data-testid="shared-trip-loading">
        <div className="w-9 h-9 border-[3px] border-gray-200 border-t-[#FF5000] rounded-full animate-spin" />
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-8 text-center" data-testid="shared-trip-error">
        <ShieldCheck size={40} className="text-gray-300 mb-3" />
        <p className="text-gray-700 font-semibold">Lien de suivi invalide ou expiré.</p>
        <p className="text-sm text-gray-400 mt-1">Ce trajet n'est plus partagé.</p>
      </div>
    );
  }

  const { ride, driver_pos, client, driver, vehicle, status, active } = data;

  return (
    <div className="min-h-screen bg-gray-50 max-w-[480px] mx-auto" data-testid="shared-trip-page">
      {/* Header */}
      <div className="bg-[#0B1426] text-white px-4 pt-8 pb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={22} weight="fill" className="text-[#FF5000]" />
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/50 font-bold">SB Drive · Suivi de sécurité</p>
            <h1 className="text-lg font-extrabold leading-tight">Trajet partagé en direct</h1>
          </div>
          {active ? (
            <span className="inline-flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-black uppercase px-2 py-1 rounded-full" data-testid="shared-live-badge">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-white" /></span>
              EN DIRECT
            </span>
          ) : (
            <span className="bg-white/15 text-white/70 text-[10px] font-bold uppercase px-2 py-1 rounded-full" data-testid="shared-ended-badge">Terminé</span>
          )}
        </div>
      </div>

      {/* Map */}
      {ride?.pickup_lat ? (
        <RideTrackingMap ride={ride} driverPos={driver_pos} connected={active} onBack={() => {}} />
      ) : null}

      {/* Status */}
      <div className="px-4 -mt-2 relative z-10">
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-2" data-testid="shared-status">
          {!active ? <FlagCheckered size={20} className="text-gray-500" weight="fill" /> : <Car size={20} className="text-[#FF5000]" weight="fill" />}
          <p className="font-bold text-gray-900 text-sm">{STATUS_FR[status] || status}</p>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Driver */}
        {driver && (
          <div className="bg-white rounded-2xl shadow-sm p-4" data-testid="shared-driver-card">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold mb-2">Chauffeur</p>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-gray-100 border-2 border-[#FF5000] overflow-hidden flex items-center justify-center shrink-0">
                {driver.photo ? <img src={driver.photo} alt="" className="w-full h-full object-cover" /> : <User size={28} weight="fill" className="text-gray-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-gray-900 truncate">{driver.name || 'Chauffeur'}</p>
                <Stars value={driver.rating} />
              </div>
              {driver.phone && (
                <a href={`tel:${driver.phone}`} className="flex flex-col items-center text-emerald-600" data-testid="shared-driver-call">
                  <span className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center"><Phone size={20} weight="fill" /></span>
                  <span className="text-[10px] font-semibold mt-0.5">{driver.phone}</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Vehicle */}
        {vehicle && (vehicle.number || vehicle.model) && (
          <div className="bg-white rounded-2xl shadow-sm p-4" data-testid="shared-vehicle-card">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold mb-2">Véhicule</p>
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><Car size={22} weight="fill" className="text-blue-600" /></span>
              <div className="min-w-0">
                {vehicle.number && <p className="font-extrabold text-gray-900 tracking-wide" data-testid="shared-plate">{vehicle.number}</p>}
                <p className="text-sm text-gray-600">{[vehicle.brand, vehicle.model, vehicle.color].filter(Boolean).join(' · ') || '—'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Client */}
        {client?.name && (
          <div className="bg-white rounded-2xl shadow-sm p-4" data-testid="shared-client-card">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold mb-2">Passager</p>
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><User size={22} weight="fill" className="text-gray-400" /></span>
              <div className="flex-1 min-w-0"><p className="font-bold text-gray-900 truncate">{client.name}</p></div>
              {client.phone && (
                <a href={`tel:${client.phone}`} className="text-[12px] font-semibold text-blue-600" data-testid="shared-client-call">{client.phone}</a>
              )}
            </div>
          </div>
        )}

        {/* Route */}
        <div className="bg-white rounded-2xl shadow-sm p-4" data-testid="shared-route-card">
          <p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold mb-2">Itinéraire</p>
          <div className="flex items-start gap-2">
            <MapPin size={18} weight="fill" className="text-emerald-600 mt-0.5 shrink-0" />
            <div><p className="text-[11px] text-gray-400">Départ</p><p className="text-sm font-semibold text-gray-900">{ride?.pickup_address || '—'}</p></div>
          </div>
          <div className="h-3 border-l border-dashed border-gray-200 ml-2 my-1" />
          <div className="flex items-start gap-2">
            <MapPin size={18} weight="fill" className="text-[#FF5000] mt-0.5 shrink-0" />
            <div><p className="text-[11px] text-gray-400">Destination</p><p className="text-sm font-semibold text-gray-900">{ride?.dropoff_address || '—'}</p></div>
          </div>
        </div>

        <p className="text-[11px] text-gray-400 text-center px-4 flex items-center justify-center gap-1">
          <CheckCircle size={13} weight="fill" className="text-emerald-500" /> Lien de sécurité partagé · mis à jour automatiquement
        </p>
      </div>
    </div>
  );
};

export default SharedTripPage;
