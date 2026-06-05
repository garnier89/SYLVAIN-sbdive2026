import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { parcelAPI } from '../../services/api';
import {
  ArrowLeft, Package, Motorcycle, CaretRight, Plus, Trash, MapPin, FlagCheckered, CheckCircle
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

const LocationSelector = ({ onSelect }) => {
  useMapEvents({ click(e) { onSelect({ lat: e.latlng.lat, lng: e.latlng.lng }); } });
  return null;
};

let stopSeq = 0;
const emptyStop = () => ({ _id: ++stopSeq, lat: null, lng: null, recipient_name: '', recipient_phone: '' });

const ParcelPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState('choose');
  const [deliveryMode, setDeliveryMode] = useState(null); // single | multi
  const [vehicleType, setVehicleType] = useState(null); // box | moto
  const [pickup, setPickup] = useState({ lat: null, lng: null });
  const [stops, setStops] = useState([emptyStop()]); // drop-off points
  const [selecting, setSelecting] = useState(null); // 'pickup' | number(index)
  const [estimation, setEstimation] = useState(null);
  const [loading, setLoading] = useState(false);

  const startDelivery = (mode, vehicle) => {
    setDeliveryMode(mode); setVehicleType(vehicle);
    setPickup({ lat: null, lng: null });
    setStops([emptyStop()]);
    setStep('map');
  };

  const handleLocationSelect = (coords) => {
    if (selecting === 'pickup') setPickup(coords);
    else if (typeof selecting === 'number') setStops((s) => s.map((st, i) => (i === selecting ? { ...st, ...coords } : st)));
    setSelecting(null);
  };

  const addStop = () => setStops((s) => [...s, emptyStop()]);
  const removeStop = (idx) => setStops((s) => s.filter((_, i) => i !== idx));
  const setStopField = (idx, field, value) => setStops((s) => s.map((st, i) => (i === idx ? { ...st, [field]: value } : st)));

  const allStopsPlaced = stops.length > 0 && stops.every((s) => s.lat && s.lng);
  const canEstimate = pickup.lat && allStopsPlaced;

  const getEstimate = async () => {
    if (!canEstimate) return;
    setLoading(true);
    try {
      const res = await parcelAPI.estimate({
        pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        stops: stops.map((s) => ({ lat: s.lat, lng: s.lng, recipient_name: s.recipient_name, recipient_phone: s.recipient_phone })),
        vehicle_type: vehicleType,
      });
      setEstimation(res.data);
      setStep('confirm');
    } catch (e) { toast.error('Échec du calcul du prix'); } finally { setLoading(false); }
  };

  const confirm = async () => {
    setLoading(true);
    try {
      const res = await parcelAPI.create({
        pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        stops: stops.map((s) => ({ lat: s.lat, lng: s.lng, recipient_name: s.recipient_name, recipient_phone: s.recipient_phone })),
        vehicle_type: vehicleType, payment_method: 'cash',
      });
      setStep('success');
      const pid = res.data?.id;
      setTimeout(() => navigate(pid ? `/track/parcel/${pid}` : '/history'), 2200);
    } catch (e) { toast.error('Échec de la commande'); } finally { setLoading(false); }
  };

  // ===== CHOOSE SCREEN =====
  if (step === 'choose') {
    return (
      <div className="mobile-container min-h-screen bg-white">
        <div className="bg-[#FF4500] px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/home')} data-testid="parcel-back-btn"><ArrowLeft size={24} className="text-white" /></button>
          <h1 className="text-white font-bold text-lg">Livraison de Colis</h1>
        </div>
        <div className="bg-gradient-to-r from-[#E03D00] to-[#FF4500] p-6 flex items-center">
          <div className="flex-1">
            <h2 className="text-3xl font-extrabold text-yellow-400 leading-tight">Livraison<br />de Colis</h2>
            <p className="text-white/80 text-sm mt-2">Envoyez vos colis instantanément ou programmez pour plus tard.</p>
          </div>
          <Package size={80} weight="duotone" className="text-white/30" />
        </div>

        <div className="p-4">
          <h3 className="text-xl font-bold text-gray-900">Livraison Simple</h3>
          <p className="text-sm text-gray-500 mt-1 mb-4">Envoyez un colis d'un point de ramassage vers une seule destination.</p>
          <div className="space-y-3">
            <button onClick={() => startDelivery('single', 'box')} className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all" data-testid="single-box-btn">
              <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0"><Package size={28} weight="duotone" className="text-teal-500" /></div>
              <div className="flex-1 text-left"><p className="font-bold text-gray-900">Box</p><p className="text-sm text-gray-500">Grand colis ? Envoyez-le vers une seule destination !</p></div>
              <CaretRight size={20} className="text-gray-300" />
            </button>
            <button onClick={() => startDelivery('single', 'moto')} className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-red-300 hover:bg-red-50/50 transition-all" data-testid="single-moto-btn">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0"><Motorcycle size={28} weight="duotone" className="text-red-500" /></div>
              <div className="flex-1 text-left"><p className="font-bold text-gray-900">Moto Send</p><p className="text-sm text-gray-500">Petit paquet transportable en moto ou voiture.</p></div>
              <CaretRight size={20} className="text-gray-300" />
            </button>
          </div>
        </div>

        <div className="p-4 pt-0">
          <h3 className="text-xl font-bold text-gray-900">Livraison Multiple</h3>
          <p className="text-sm text-gray-500 mt-1 mb-4">Un seul coursier, plusieurs points de dépôt en une seule course.</p>
          <div className="space-y-3">
            <button onClick={() => startDelivery('multi', 'box')} className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-teal-300 hover:bg-teal-50/50 transition-all" data-testid="multi-box-btn">
              <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0"><Package size={28} weight="duotone" className="text-teal-500" /></div>
              <div className="flex-1 text-left"><p className="font-bold text-gray-900">Box</p><p className="text-sm text-gray-500">Trop de gros colis ? Plusieurs destinations en une fois !</p></div>
              <CaretRight size={20} className="text-gray-300" />
            </button>
            <button onClick={() => startDelivery('multi', 'moto')} className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-red-300 hover:bg-red-50/50 transition-all" data-testid="multi-moto-btn">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0"><Motorcycle size={28} weight="duotone" className="text-red-500" /></div>
              <div className="flex-1 text-left"><p className="font-bold text-gray-900">Moto Send</p><p className="text-sm text-gray-500">Plusieurs petits paquets à différentes adresses.</p></div>
              <CaretRight size={20} className="text-gray-300" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== MAP / ADDRESSES SCREEN =====
  if (step === 'map') {
    const isMulti = deliveryMode === 'multi';
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col">
        <div className="bg-[#FF4500] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setStep('choose')} data-testid="parcel-map-back-btn"><ArrowLeft size={24} className="text-white" /></button>
          <h1 className="text-white font-bold text-lg">{isMulti ? 'Livraison Multiple' : 'Livraison Simple'} — {vehicleType === 'box' ? 'Box' : 'Moto'}</h1>
        </div>
        <div className="flex-1 relative min-h-[240px]">
          <MapContainer center={[48.8566, 2.3522]} zoom={13} className="w-full h-full" style={{ height: '100%', minHeight: '240px' }} zoomControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {selecting !== null && <LocationSelector onSelect={handleLocationSelect} />}
            {pickup.lat && <Marker position={[pickup.lat, pickup.lng]} icon={greenIcon} />}
            {stops.map((s) => (s.lat ? <Marker key={s._id} position={[s.lat, s.lng]} icon={redIcon} /> : null))}
          </MapContainer>
          {selecting !== null && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/75 text-white text-xs font-semibold px-3 py-1.5 rounded-full" data-testid="parcel-map-hint">
              Touchez la carte pour placer {selecting === 'pickup' ? 'le ramassage' : `le dépôt ${selecting + 1}`}
            </div>
          )}
        </div>

        <div className="bg-white rounded-t-3xl p-5 space-y-3 shadow-[0_-8px_30px_rgba(0,0,0,0.1)] max-h-[55vh] overflow-y-auto">
          {/* Pickup */}
          <button className={`w-full flex items-center gap-3 p-3 rounded-xl border ${selecting === 'pickup' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`} onClick={() => setSelecting('pickup')} data-testid="parcel-pickup-btn">
            <MapPin size={18} weight="fill" className="text-green-500" />
            <span className={pickup.lat ? 'text-gray-900 text-sm' : 'text-gray-400 text-sm'}>{pickup.lat ? `Ramassage · ${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}` : 'Adresse de ramassage'}</span>
          </button>

          {/* Drop-offs */}
          {stops.map((s, i) => (
            <div key={s._id} className="border border-gray-200 rounded-xl p-3" data-testid={`parcel-stop-${i}`}>
              <div className="flex items-center justify-between mb-2">
                <button className={`flex-1 flex items-center gap-2 ${selecting === i ? 'text-red-600 font-semibold' : 'text-gray-700'}`} onClick={() => setSelecting(i)} data-testid={`parcel-stop-place-${i}`}>
                  <FlagCheckered size={16} weight="fill" className="text-red-500" />
                  <span className="text-sm">{s.lat ? `Dépôt ${i + 1} · ${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}` : `Placer le dépôt ${i + 1}`}</span>
                </button>
                {isMulti && stops.length > 1 && (
                  <button onClick={() => removeStop(i)} className="text-rose-500 p-1" data-testid={`parcel-stop-remove-${i}`}><Trash size={16} /></button>
                )}
              </div>
              {isMulti && (
                <div className="grid grid-cols-2 gap-2">
                  <input value={s.recipient_name} onChange={(e) => setStopField(i, 'recipient_name', e.target.value)} placeholder="Destinataire" className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm" data-testid={`parcel-stop-name-${i}`} />
                  <input value={s.recipient_phone} onChange={(e) => setStopField(i, 'recipient_phone', e.target.value)} placeholder="Téléphone" className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm" data-testid={`parcel-stop-phone-${i}`} />
                </div>
              )}
            </div>
          ))}

          {isMulti && (
            <button onClick={addStop} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-[#FF4500] text-[#FF4500] text-sm font-semibold" data-testid="parcel-add-stop-btn">
              <Plus size={16} weight="bold" /> Ajouter un point de dépôt
            </button>
          )}

          <Button className="w-full rounded-2xl h-12 bg-[#FF4500] hover:bg-[#E03D00] text-white font-semibold" disabled={!canEstimate || loading} onClick={getEstimate} data-testid="parcel-estimate-btn">
            {loading ? 'Calcul...' : `Estimer le prix${isMulti ? ` · ${stops.length} dépôt${stops.length > 1 ? 's' : ''}` : ''}`}
          </Button>
        </div>
      </div>
    );
  }

  // ===== CONFIRM SCREEN =====
  if (step === 'confirm') {
    return (
      <div className="mobile-container min-h-screen bg-white">
        <div className="bg-[#FF4500] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setStep('map')} data-testid="parcel-confirm-back-btn"><ArrowLeft size={24} className="text-white" /></button>
          <h1 className="text-white font-bold text-lg">Confirmer l'envoi</h1>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-blue-50 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between"><span className="text-gray-600">Points de dépôt</span><span className="font-bold" data-testid="confirm-stops-count">{estimation?.stops_count}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Distance totale</span><span className="font-bold">{estimation?.total_distance_km?.toFixed(1)} km</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Durée estimée</span><span className="font-bold">~{Math.round(estimation?.total_duration_mins || 0)} min</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Type</span><span className="font-bold">{vehicleType === 'box' ? 'Box' : 'Moto Send'}</span></div>
            <div className="flex justify-between text-lg pt-1 border-t border-blue-100"><span className="text-gray-600">Prix total</span><span className="font-bold text-[#FF4500]" data-testid="confirm-total-fare">{estimation?.estimated_fare?.toFixed(2)} &euro;</span></div>
          </div>

          {/* Per-leg breakdown */}
          {(estimation?.legs || []).length > 1 && (
            <div className="rounded-2xl border border-gray-100 divide-y divide-gray-100" data-testid="parcel-legs-breakdown">
              {estimation.legs.map((l) => (
                <div key={l.index} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-gray-700">Dépôt {l.index + 1}{l.recipient_name ? ` · ${l.recipient_name}` : ''}</span>
                  <span className="text-gray-500">{l.distance_km.toFixed(1)} km · <span className="font-semibold text-gray-800">{l.fare.toFixed(2)} €</span></span>
                </div>
              ))}
            </div>
          )}

          <Button className="w-full rounded-2xl h-14 bg-[#FF4500] hover:bg-[#E03D00] text-white text-lg font-semibold" disabled={loading} onClick={confirm} data-testid="parcel-confirm-btn">
            {loading ? 'Envoi...' : `Confirmer · ${estimation?.estimated_fare?.toFixed(2)} €`}
          </Button>
        </div>
      </div>
    );
  }

  // ===== SUCCESS =====
  return (
    <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center" data-testid="parcel-success">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6"><CheckCircle size={40} weight="fill" className="text-green-600" /></div>
      <h2 className="text-2xl font-bold mb-2">Colis confirmé !</h2>
      <p className="text-gray-500">Un coursier va récupérer votre colis et livrer {stops.length > 1 ? `vos ${stops.length} points de dépôt` : 'votre destination'}. Suivez dans l'historique.</p>
    </div>
  );
};

export default ParcelPage;
