import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { parcelAPI, medicalAPI } from '../../services/api';
import { ArrowLeft, Package, FirstAid, CheckCircle, Circle, FlagCheckered } from '@phosphor-icons/react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});
const greenIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41] });
const redIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41] });
const courierIcon = L.divIcon({ html: '<div style="font-size:26px;line-height:1">🛵</div>', className: 'courier-marker', iconSize: [30, 30], iconAnchor: [15, 15] });

// Smoothly re-centers the map on the courier's latest position as it moves
const Recenter = ({ lat, lng }) => {
  const map = useMap();
  useEffect(() => { if (lat != null && lng != null) map.panTo([lat, lng], { animate: true }); }, [lat, lng, map]);
  return null;
};

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
  const arrivalNotified = useRef(false);
  const steps = ORDER[type] || PARCEL_STEPS;

  const load = useCallback(async () => {
    try {
      const r = type === 'transport' ? await medicalAPI.transportGet(id) : await parcelAPI.get(id);
      setItem(r.data);
      // Notify once when the courier is about to arrive (ETA < 2 min)
      if (r.data?.eta_minutes != null && r.data.eta_minutes <= 2 && r.data.status !== 'completed' && !arrivalNotified.current) {
        arrivalNotified.current = true;
        toast.success('🛵 Votre coursier arrive ! Préparez-vous.', { duration: 7000 });
      }
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

        {/* Dynamic ETA */}
        {item.driver_id && item.eta_minutes != null && item.status !== 'completed' && (
          <div className="bg-[#0B1426] text-white rounded-2xl px-4 py-3 flex items-center gap-3" data-testid="tracking-eta">
            <span className="text-2xl">🛵</span>
            <div>
              <p className="text-lg font-bold leading-tight">Coursier à ~{item.eta_minutes} min</p>
              {item.eta_target_label && <p className="text-xs text-white/70">vers {item.eta_target_label}</p>}
            </div>
          </div>
        )}

        {/* Live courier map */}
        {item.driver_id && (item.driver_location || item.pickup_lat) && (
          <div className="rounded-2xl overflow-hidden border border-gray-100 h-[220px]" data-testid="tracking-live-map">
            <MapContainer center={[item.driver_location?.lat || item.pickup_lat, item.driver_location?.lng || item.pickup_lng]} zoom={13} className="w-full h-full" style={{ height: '100%' }} zoomControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {item.pickup_lat && <Marker position={[item.pickup_lat, item.pickup_lng]} icon={greenIcon}><Popup>Ramassage</Popup></Marker>}
              {type === 'transport' && item.dest_lat && <Marker position={[item.dest_lat, item.dest_lng]} icon={redIcon}><Popup>Destination</Popup></Marker>}
              {type !== 'transport' && (item.stops || []).map((s, i) => (s.lat ? <Marker key={`${s.lat}-${s.lng}`} position={[s.lat, s.lng]} icon={redIcon}><Popup>Dépôt {i + 1}</Popup></Marker> : null))}
              {item.driver_location && <Marker position={[item.driver_location.lat, item.driver_location.lng]} icon={courierIcon}><Popup>Votre coursier</Popup></Marker>}
              {item.driver_location && <Recenter lat={item.driver_location.lat} lng={item.driver_location.lng} />}
            </MapContainer>
          </div>
        )}

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
