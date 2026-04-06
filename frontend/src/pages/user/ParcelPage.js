import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { rideAPI } from '../../services/api';
import {
  ArrowLeft, Package, Motorcycle, CaretRight
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

const ParcelPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState('choose');
  const [deliveryMode, setDeliveryMode] = useState(null); // single | multi
  const [vehicleType, setVehicleType] = useState(null); // box | moto
  const [pickup, setPickup] = useState({ lat: null, lng: null });
  const [dropoff, setDropoff] = useState({ lat: null, lng: null });
  const [selectingLocation, setSelectingLocation] = useState(null);
  const [estimation, setEstimation] = useState(null);
  const [loading, setLoading] = useState(false);

  const startDelivery = (mode, vehicle) => {
    setDeliveryMode(mode);
    setVehicleType(vehicle);
    setStep('map');
  };

  const handleLocationSelect = (coords) => {
    if (selectingLocation === 'pickup') setPickup(coords);
    else setDropoff(coords);
    setSelectingLocation(null);
  };

  const getEstimate = async () => {
    if (!pickup.lat || !dropoff.lat) return;
    setLoading(true);
    try {
      const res = await rideAPI.estimate({ pickup_lat: pickup.lat, pickup_lng: pickup.lng, dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, vehicle_type: vehicleType === 'box' ? 'car' : 'motorcycle' });
      setEstimation(res.data);
      setStep('confirm');
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const confirm = () => {
    setStep('success');
    setTimeout(() => navigate('/history'), 3000);
  };

  // ===== CHOOSE SCREEN =====
  if (step === 'choose') {
    return (
      <div className="mobile-container min-h-screen bg-white">
        {/* Header */}
        <div className="bg-blue-600 px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/home')} data-testid="parcel-back-btn"><ArrowLeft size={24} className="text-white" /></button>
          <h1 className="text-white font-bold text-lg">Livraison de Colis</h1>
        </div>

        {/* Hero Banner */}
        <div className="bg-gradient-to-r from-blue-700 to-blue-500 p-6 flex items-center">
          <div className="flex-1">
            <h2 className="text-3xl font-extrabold text-yellow-400 leading-tight">Livraison<br/>de Colis</h2>
            <p className="text-white/80 text-sm mt-2">Envoyez vos colis instantanément ou programmez pour plus tard.</p>
          </div>
          <Package size={80} weight="duotone" className="text-white/30" />
        </div>

        {/* Single Delivery */}
        <div className="p-4">
          <h3 className="text-xl font-bold text-gray-900">Livraison Simple</h3>
          <p className="text-sm text-gray-500 mt-1 mb-4">Envoyez un colis d'un point de ramassage vers une seule destination.</p>

          <div className="space-y-3">
            <button onClick={() => startDelivery('single', 'box')} className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all" data-testid="single-box-btn">
              <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0">
                <Package size={28} weight="duotone" className="text-teal-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-gray-900">Box</p>
                <p className="text-sm text-gray-500">Grand colis ? Envoyez-le vers une seule destination !</p>
              </div>
              <CaretRight size={20} className="text-gray-300" />
            </button>

            <button onClick={() => startDelivery('single', 'moto')} className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-red-300 hover:bg-red-50/50 transition-all" data-testid="single-moto-btn">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <Motorcycle size={28} weight="duotone" className="text-red-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-gray-900">Moto Send</p>
                <p className="text-sm text-gray-500">Petit paquet transportable en moto ou voiture.</p>
              </div>
              <CaretRight size={20} className="text-gray-300" />
            </button>
          </div>
        </div>

        {/* Multi Delivery */}
        <div className="p-4 pt-0">
          <h3 className="text-xl font-bold text-gray-900">Livraison Multiple</h3>
          <p className="text-sm text-gray-500 mt-1 mb-4">Envoyez plusieurs colis vers plusieurs destinations en une seule fois.</p>

          <div className="space-y-3">
            <button onClick={() => startDelivery('multi', 'box')} className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-teal-300 hover:bg-teal-50/50 transition-all" data-testid="multi-box-btn">
              <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0">
                <Package size={28} weight="duotone" className="text-teal-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-gray-900">Box</p>
                <p className="text-sm text-gray-500">Trop de gros colis ? Envoyez-les vers plusieurs destinations !</p>
              </div>
              <CaretRight size={20} className="text-gray-300" />
            </button>

            <button onClick={() => startDelivery('multi', 'moto')} className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-red-300 hover:bg-red-50/50 transition-all" data-testid="multi-moto-btn">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <Motorcycle size={28} weight="duotone" className="text-red-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-gray-900">Moto Send</p>
                <p className="text-sm text-gray-500">Envoyez plusieurs petits paquets à différentes adresses.</p>
              </div>
              <CaretRight size={20} className="text-gray-300" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== MAP SCREEN =====
  if (step === 'map') {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col">
        <div className="bg-blue-600 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setStep('choose')}><ArrowLeft size={24} className="text-white" /></button>
          <h1 className="text-white font-bold text-lg">{deliveryMode === 'single' ? 'Livraison Simple' : 'Livraison Multiple'} — {vehicleType === 'box' ? 'Box' : 'Moto'}</h1>
        </div>
        <div className="flex-1 relative">
          <MapContainer center={[48.8566, 2.3522]} zoom={13} className="w-full h-full" zoomControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {selectingLocation && <LocationSelector onSelect={handleLocationSelect} />}
            {pickup.lat && <Marker position={[pickup.lat, pickup.lng]} icon={greenIcon} />}
            {dropoff.lat && <Marker position={[dropoff.lat, dropoff.lng]} icon={redIcon} />}
          </MapContainer>
        </div>
        <div className="bg-white rounded-t-3xl p-5 space-y-3 shadow-[0_-8px_30px_rgba(0,0,0,0.1)]">
          <button className={`w-full flex items-center gap-3 p-3 rounded-xl border ${selectingLocation === 'pickup' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`} onClick={() => setSelectingLocation('pickup')} data-testid="parcel-pickup-btn">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className={pickup.lat ? 'text-gray-900 text-sm' : 'text-gray-400 text-sm'}>{pickup.lat ? `${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}` : 'Adresse de ramassage'}</span>
          </button>
          <button className={`w-full flex items-center gap-3 p-3 rounded-xl border ${selectingLocation === 'dropoff' ? 'border-red-500 bg-red-50' : 'border-gray-200'}`} onClick={() => setSelectingLocation('dropoff')} data-testid="parcel-dropoff-btn">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className={dropoff.lat ? 'text-gray-900 text-sm' : 'text-gray-400 text-sm'}>{dropoff.lat ? `${dropoff.lat.toFixed(4)}, ${dropoff.lng.toFixed(4)}` : 'Adresse de livraison'}</span>
          </button>
          <Button className="w-full rounded-2xl h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold" disabled={!pickup.lat || !dropoff.lat || loading} onClick={getEstimate} data-testid="parcel-estimate-btn">
            {loading ? 'Calcul...' : 'Estimer le prix'}
          </Button>
        </div>
      </div>
    );
  }

  // ===== CONFIRM SCREEN =====
  if (step === 'confirm') {
    return (
      <div className="mobile-container min-h-screen bg-white">
        <div className="bg-blue-600 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setStep('map')}><ArrowLeft size={24} className="text-white" /></button>
          <h1 className="text-white font-bold text-lg">Confirmer l'envoi</h1>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-blue-50 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between"><span className="text-gray-600">Distance</span><span className="font-bold">{estimation?.distance_km?.toFixed(1)} km</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Durée</span><span className="font-bold">~{Math.round(estimation?.duration_mins || 0)} min</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Type</span><span className="font-bold">{vehicleType === 'box' ? 'Box' : 'Moto Send'}</span></div>
            <div className="flex justify-between text-lg"><span className="text-gray-600">Prix total</span><span className="font-bold text-blue-600">{estimation?.estimated_fare?.toFixed(2)} &euro;</span></div>
          </div>
          <Button className="w-full rounded-2xl h-14 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold" onClick={confirm} data-testid="parcel-confirm-btn">
            Confirmer &middot; {estimation?.estimated_fare?.toFixed(2)} &euro;
          </Button>
        </div>
      </div>
    );
  }

  // ===== SUCCESS =====
  return (
    <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
        <Package size={40} className="text-green-600" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Colis envoyé !</h2>
      <p className="text-gray-500">Un chauffeur va récupérer votre colis. Suivez dans l'historique.</p>
    </div>
  );
};

export default ParcelPage;
