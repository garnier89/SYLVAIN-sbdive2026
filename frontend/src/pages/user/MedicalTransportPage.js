import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { medicalAPI } from '../../services/api';
import {
  ArrowLeft, FirstAid, Wheelchair, Ambulance, MapPin, Hospital, CheckCircle, Warning,
} from '@phosphor-icons/react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
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

const Picker = ({ onSelect }) => { useMapEvents({ click(e) { onSelect({ lat: e.latlng.lat, lng: e.latlng.lng }); } }); return null; };

const AMB_ICONS = { basic: Ambulance, icu: FirstAid, wheelchair: Wheelchair };
const URGENCY = [
  { k: 'normal', l: 'Normale', color: 'green' },
  { k: 'urgent', l: 'Urgente', color: 'amber' },
  { k: 'critical', l: 'Critique', color: 'red' },
];

const MedicalTransportPage = () => {
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [ambulanceType, setAmbulanceType] = useState(null);
  const [pickup, setPickup] = useState({ lat: null, lng: null });
  const [dest, setDest] = useState({ lat: null, lng: null });
  const [selecting, setSelecting] = useState(null); // 'pickup' | 'dest'
  const [form, setForm] = useState({ destination_name: '', patient_name: '', patient_phone: '', patient_condition: '', urgency: 'normal' });
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    medicalAPI.ambulanceTypes().then((r) => {
      setTypes(r.data.types || []);
      if (r.data.types?.length) setAmbulanceType(r.data.types[0].id);
    }).catch(() => {});
  }, []);

  const onMapSelect = (coords) => {
    if (selecting === 'pickup') setPickup(coords);
    else if (selecting === 'dest') setDest(coords);
    setSelecting(null);
  };

  const canEstimate = ambulanceType && pickup.lat && dest.lat;

  const doEstimate = async () => {
    if (!canEstimate) return;
    setLoading(true);
    try {
      const r = await medicalAPI.estimateTransport({ ambulance_type: ambulanceType, pickup_lat: pickup.lat, pickup_lng: pickup.lng, dest_lat: dest.lat, dest_lng: dest.lng });
      setEstimate(r.data);
    } catch { toast.error('Échec du calcul'); } finally { setLoading(false); }
  };

  useEffect(() => { setEstimate(null); }, [ambulanceType, pickup, dest]);

  const confirm = async () => {
    if (!form.patient_name) return toast.error('Nom du patient requis');
    setLoading(true);
    try {
      await medicalAPI.createTransport({
        ambulance_type: ambulanceType, pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        dest_lat: dest.lat, dest_lng: dest.lng, destination_name: form.destination_name,
        patient_name: form.patient_name, patient_phone: form.patient_phone,
        patient_condition: form.patient_condition, urgency: form.urgency, payment_method: 'cash',
      });
      setDone(true);
      setTimeout(() => navigate('/history'), 2800);
    } catch { toast.error('Échec de la demande'); } finally { setLoading(false); }
  };

  if (done) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center" data-testid="transport-success">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6"><CheckCircle size={40} weight="fill" className="text-green-600" /></div>
        <h2 className="text-2xl font-bold mb-2">Transport médical demandé !</h2>
        <p className="text-gray-500">Une équipe est en route. Vous serez contacté au {form.patient_phone || 'numéro fourni'}.</p>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 flex flex-col" data-testid="medical-transport-page">
      <div className="bg-gradient-to-br from-red-600 to-red-500 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/home')} className="text-white" data-testid="transport-back-btn"><ArrowLeft size={22} /></button>
        <div>
          <h1 className="text-lg font-bold text-white">Transport Médical</h1>
          <p className="text-[11px] text-white/80">Ambulance & transport sanitaire</p>
        </div>
      </div>

      {/* Map */}
      <div className="relative h-[220px]">
        <MapContainer center={[48.8566, 2.3522]} zoom={13} className="w-full h-full" style={{ height: '100%', minHeight: '220px' }} zoomControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {selecting && <Picker onSelect={onMapSelect} />}
          {pickup.lat && <Marker position={[pickup.lat, pickup.lng]} icon={greenIcon} />}
          {dest.lat && <Marker position={[dest.lat, dest.lng]} icon={redIcon} />}
        </MapContainer>
        {selecting && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/75 text-white text-xs font-semibold px-3 py-1.5 rounded-full" data-testid="transport-map-hint">
            Touchez la carte : {selecting === 'pickup' ? 'lieu de prise en charge' : "hôpital / destination"}
          </div>
        )}
      </div>

      <div className="bg-white rounded-t-3xl -mt-4 p-5 space-y-4 flex-1 overflow-y-auto shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
        {/* Ambulance type */}
        <div>
          <label className="text-sm font-semibold text-gray-700 block mb-2">Type de véhicule</label>
          <div className="space-y-2">
            {types.map((t) => {
              const Icon = AMB_ICONS[t.icon] || Ambulance;
              const active = ambulanceType === t.id;
              return (
                <button key={t.id} onClick={() => setAmbulanceType(t.id)} data-testid={`amb-type-${t.id}`}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left ${active ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${active ? 'bg-red-100' : 'bg-gray-100'}`}><Icon size={22} weight="duotone" className={active ? 'text-red-600' : 'text-gray-500'} /></div>
                  <div className="flex-1"><p className="font-bold text-sm text-gray-900">{t.name}</p><p className="text-[11px] text-gray-500">{t.desc}</p></div>
                  <span className="text-xs text-gray-400">dès {t.base_fee}€</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Locations */}
        <div className="space-y-2">
          <button onClick={() => setSelecting('pickup')} data-testid="transport-pickup-btn" className={`w-full flex items-center gap-3 p-3 rounded-xl border ${selecting === 'pickup' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
            <MapPin size={18} weight="fill" className="text-green-500" />
            <span className={`text-sm ${pickup.lat ? 'text-gray-900' : 'text-gray-400'}`}>{pickup.lat ? `Départ · ${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}` : 'Lieu de prise en charge'}</span>
          </button>
          <button onClick={() => setSelecting('dest')} data-testid="transport-dest-btn" className={`w-full flex items-center gap-3 p-3 rounded-xl border ${selecting === 'dest' ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
            <Hospital size={18} weight="fill" className="text-red-500" />
            <span className={`text-sm ${dest.lat ? 'text-gray-900' : 'text-gray-400'}`}>{dest.lat ? `Destination · ${dest.lat.toFixed(4)}, ${dest.lng.toFixed(4)}` : 'Hôpital / clinique'}</span>
          </button>
          <input value={form.destination_name} onChange={(e) => setForm({ ...form, destination_name: e.target.value })} placeholder="Nom de l'hôpital / clinique (optionnel)" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="transport-dest-name" />
        </div>

        {/* Urgency */}
        <div>
          <label className="text-sm font-semibold text-gray-700 block mb-2 flex items-center gap-1.5"><Warning size={15} /> Niveau d'urgence</label>
          <div className="grid grid-cols-3 gap-2">
            {URGENCY.map((u) => (
              <button key={u.k} onClick={() => setForm({ ...form, urgency: u.k })} data-testid={`urgency-${u.k}`}
                className={`py-2.5 rounded-xl border text-sm font-semibold ${form.urgency === u.k ? (u.color === 'red' ? 'border-red-500 bg-red-50 text-red-600' : u.color === 'amber' ? 'border-amber-500 bg-amber-50 text-amber-600' : 'border-green-500 bg-green-50 text-green-600') : 'border-gray-200 text-gray-500'}`}>{u.l}</button>
            ))}
          </div>
        </div>

        {/* Patient */}
        <div className="space-y-2">
          <input value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} placeholder="Nom du patient" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="transport-patient-name" />
          <input value={form.patient_phone} onChange={(e) => setForm({ ...form, patient_phone: e.target.value })} placeholder="Téléphone de contact" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="transport-patient-phone" />
          <textarea value={form.patient_condition} onChange={(e) => setForm({ ...form, patient_condition: e.target.value })} placeholder="État du patient (optionnel)" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none h-16" data-testid="transport-patient-condition" />
        </div>

        {/* Estimate / fare */}
        {estimate ? (
          <div className="bg-red-50 rounded-2xl p-4">
            <div className="flex justify-between text-sm mb-1"><span className="text-gray-600">{estimate.ambulance_name}</span><span className="text-gray-500">{estimate.distance_km} km</span></div>
            <div className="flex justify-between text-lg font-bold"><span className="text-gray-700">Prix estimé</span><span className="text-red-600" data-testid="transport-fare">{estimate.estimated_fare?.toFixed(2)} €</span></div>
            <button onClick={confirm} disabled={loading} className="w-full mt-3 bg-red-600 text-white py-3.5 rounded-2xl font-semibold disabled:opacity-60" data-testid="transport-confirm-btn">
              {loading ? 'Envoi...' : `Demander le transport · ${estimate.estimated_fare?.toFixed(2)} €`}
            </button>
          </div>
        ) : (
          <button onClick={doEstimate} disabled={!canEstimate || loading} className="w-full bg-red-600 text-white py-3.5 rounded-2xl font-semibold disabled:opacity-50" data-testid="transport-estimate-btn">
            {loading ? 'Calcul...' : 'Estimer le prix'}
          </button>
        )}
      </div>
    </div>
  );
};

export default MedicalTransportPage;
