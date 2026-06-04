import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { parcelAPI, medicalAPI } from '../../services/api';
import { ArrowLeft, Package, FirstAid, CheckCircle, Circle, FlagCheckered } from '@phosphor-icons/react';

const PARCEL_STEPS = [
  { k: 'accepted', l: 'Coursier assigné' },
  { k: 'arrived_pickup', l: 'Arrivé au point de ramassage' },
  { k: 'picked_up', l: 'Colis récupéré' },
  { k: 'in_transit', l: 'En cours de livraison' },
  { k: 'completed', l: 'Livré' },
];
const MEDTR_STEPS = [
  { k: 'accepted', l: 'Ambulance assignée' },
  { k: 'en_route_pickup', l: 'En route vers le patient' },
  { k: 'patient_onboard', l: 'Patient pris en charge' },
  { k: 'arrived', l: 'Arrivé à destination' },
  { k: 'completed', l: 'Course terminée' },
];
const ORDER = { parcel: PARCEL_STEPS, transport: MEDTR_STEPS };

const DeliveryTrackingPage = () => {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const steps = ORDER[type] || PARCEL_STEPS;

  const load = useCallback(async () => {
    try {
      const r = type === 'transport' ? await medicalAPI.transportGet(id) : await parcelAPI.get(id);
      setItem(r.data);
    } catch { /* ignore transient */ } finally { setLoading(false); }
  }, [type, id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <div className="mobile-container min-h-screen bg-white flex items-center justify-center text-gray-400">Chargement...</div>;
  if (!item) return <div className="mobile-container min-h-screen bg-white flex items-center justify-center text-gray-400">Introuvable.</div>;

  const status = item.status === 'pending' ? null : item.status;
  const currentIdx = status ? steps.findIndex((s) => s.k === status) : -1;
  const Icon = type === 'transport' ? FirstAid : Package;

  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="delivery-tracking-page">
      <div className={`${type === 'transport' ? 'bg-red-600' : 'bg-[#FF5000]'} px-4 py-3 flex items-center gap-3`}>
        <button onClick={() => navigate('/history')} className="text-white" data-testid="tracking-back-btn"><ArrowLeft size={22} /></button>
        <h1 className="text-white font-bold text-lg">{type === 'transport' ? 'Suivi Transport Médical' : 'Suivi du Colis'}</h1>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-2xl p-4 flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${type === 'transport' ? 'bg-red-50' : 'bg-teal-50'}`}>
            <Icon size={26} weight="duotone" className={type === 'transport' ? 'text-red-500' : 'text-teal-500'} />
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-900">{type === 'transport' ? item.ambulance_name : `Colis ${item.delivery_mode === 'multi' ? `· ${item.stops?.length} dépôts` : ''}`}</p>
            <p className="text-xs text-gray-500">{item.fare?.toFixed(2)} € · {item.driver_id ? 'Coursier en route' : 'Recherche d\'un coursier...'}</p>
          </div>
        </div>

        {/* Status timeline */}
        <div className="bg-white rounded-2xl p-5" data-testid="tracking-timeline">
          {steps.map((s, i) => {
            const doneStep = currentIdx >= i;
            const active = currentIdx === i;
            return (
              <div key={s.k} className="flex gap-3" data-testid={`step-${s.k}`}>
                <div className="flex flex-col items-center">
                  {doneStep ? <CheckCircle size={22} weight="fill" className={active ? 'text-[#FF5000]' : 'text-green-500'} /> : <Circle size={22} className="text-gray-300" />}
                  {i < steps.length - 1 && <div className={`w-0.5 flex-1 min-h-[24px] ${currentIdx > i ? 'bg-green-500' : 'bg-gray-200'}`} />}
                </div>
                <div className={`pb-5 ${active ? 'font-bold text-gray-900' : doneStep ? 'text-gray-700' : 'text-gray-400'}`}>
                  <p className="text-sm">{s.l}</p>
                </div>
              </div>
            );
          })}
          {!status && <p className="text-xs text-amber-600 mt-1">En attente d'un coursier disponible…</p>}
        </div>

        {/* Per-drop status (parcels) */}
        {type !== 'transport' && (item.legs || []).length > 1 && (
          <div className="bg-white rounded-2xl p-4" data-testid="tracking-legs">
            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Points de dépôt</p>
            {item.legs.map((leg) => (
              <div key={leg.index} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-700"><FlagCheckered size={13} className="inline text-red-500" /> Dépôt {leg.index + 1}{leg.recipient_name ? ` · ${leg.recipient_name}` : ''}</span>
                <span className={`text-[11px] font-bold ${leg.status === 'delivered' ? 'text-green-600' : 'text-gray-400'}`}>{leg.status === 'delivered' ? '✓ Livré' : 'En attente'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveryTrackingPage;
