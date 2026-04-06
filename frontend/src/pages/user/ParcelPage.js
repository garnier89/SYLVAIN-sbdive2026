import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { rideAPI } from '../../services/api';
import {
  Package, MapPin, ArrowLeft, CaretRight,
  Cube, ShoppingBag, FileText, ArrowRight,
  Phone, User
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

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

const LocationSelector = ({ onSelect }) => {
  useMapEvents({ click(e) { onSelect({ lat: e.latlng.lat, lng: e.latlng.lng }); } });
  return null;
};

const parcelTypes = [
  { id: 'small', name: 'Petit colis', icon: FileText, desc: 'Documents, lettres', maxWeight: '2 kg', price: 5.99 },
  { id: 'medium', name: 'Colis moyen', icon: Cube, desc: 'Boîtes, vêtements', maxWeight: '10 kg', price: 9.99 },
  { id: 'large', name: 'Grand colis', icon: ShoppingBag, desc: 'Électronique, meubles', maxWeight: '25 kg', price: 14.99 },
];

const ParcelPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState('type');
  const [parcelType, setParcelType] = useState(null);
  const [pickup, setPickup] = useState({ lat: null, lng: null, address: '' });
  const [dropoff, setDropoff] = useState({ lat: null, lng: null, address: '' });
  const [selectingLocation, setSelectingLocation] = useState(null);
  const [mapCenter] = useState([48.8566, 2.3522]);
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [description, setDescription] = useState('');
  const [estimation, setEstimation] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLocationSelect = (coords) => {
    if (selectingLocation === 'pickup') {
      setPickup({ ...coords, address: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` });
    } else if (selectingLocation === 'dropoff') {
      setDropoff({ ...coords, address: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` });
    }
    setSelectingLocation(null);
  };

  const getEstimate = async () => {
    if (!pickup.lat || !dropoff.lat) return;
    setLoading(true);
    try {
      const res = await rideAPI.estimate({
        pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
        vehicle_type: 'car'
      });
      setEstimation({
        distance: res.data.distance_km,
        duration: res.data.duration_mins,
        price: (parcelType?.price || 5.99) + (res.data.distance_km * 1.2)
      });
      setStep('details');
    } catch (error) {
      console.error('Estimation error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    setStep('confirmed');
    setTimeout(() => navigate('/history'), 3000);
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-6">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => step === 'type' ? navigate('/') : setStep('type')} data-testid="parcel-back-btn">
          <ArrowLeft size={24} />
        </Button>
        <h1 className="font-bold text-lg">Envoi de colis</h1>
      </div>

      {/* Step 1: Parcel Type */}
      {step === 'type' && (
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-500">Quel type de colis envoyez-vous ?</p>
          <div className="space-y-3">
            {parcelTypes.map((type) => (
              <Card
                key={type.id}
                className={`cursor-pointer transition-all ${parcelType?.id === type.id ? 'ring-2 ring-[#00C853] border-[#00C853]' : 'hover:shadow-md'}`}
                onClick={() => setParcelType(type)}
                data-testid={`parcel-type-${type.id}`}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                    <type.icon size={24} className="text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{type.name}</p>
                    <p className="text-sm text-gray-500">{type.desc} &middot; Max {type.maxWeight}</p>
                  </div>
                  <p className="font-bold text-[#00C853]">{type.price.toFixed(2)} &euro;</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {parcelType && (
            <Button
              className="w-full rounded-2xl h-14 bg-[#00C853] hover:bg-[#009624] text-white text-lg font-semibold"
              onClick={() => setStep('location')}
              data-testid="parcel-next-btn"
            >
              Continuer <ArrowRight size={20} className="ml-2" />
            </Button>
          )}
        </div>
      )}

      {/* Step 2: Location */}
      {step === 'location' && (
        <div className="flex flex-col h-[calc(100vh-60px)]">
          <div className="flex-1 relative">
            <MapContainer center={mapCenter} zoom={13} className="w-full h-full" zoomControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {selectingLocation && <LocationSelector onSelect={handleLocationSelect} />}
              {pickup.lat && <Marker position={[pickup.lat, pickup.lng]} icon={greenIcon} />}
              {dropoff.lat && <Marker position={[dropoff.lat, dropoff.lng]} icon={redIcon} />}
            </MapContainer>
          </div>
          <div className="bg-white rounded-t-3xl p-5 space-y-4 shadow-[0_-8px_30px_rgba(0,0,0,0.1)]">
            <button
              className={`w-full flex items-center gap-3 p-3 rounded-xl border ${selectingLocation === 'pickup' ? 'border-[#00C853] bg-green-50' : 'border-gray-200'}`}
              onClick={() => setSelectingLocation('pickup')}
              data-testid="parcel-pickup-btn"
            >
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-[#00C853]" />
              </div>
              <span className={pickup.address ? 'text-gray-900' : 'text-gray-400'}>
                {pickup.address || 'Adresse de ramassage'}
              </span>
            </button>
            <button
              className={`w-full flex items-center gap-3 p-3 rounded-xl border ${selectingLocation === 'dropoff' ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
              onClick={() => setSelectingLocation('dropoff')}
              data-testid="parcel-dropoff-btn"
            >
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                <MapPin size={14} className="text-red-500" />
              </div>
              <span className={dropoff.address ? 'text-gray-900' : 'text-gray-400'}>
                {dropoff.address || 'Adresse de livraison'}
              </span>
            </button>
            <Button
              className="w-full rounded-2xl h-14 bg-[#00C853] hover:bg-[#009624] text-white text-lg font-semibold"
              disabled={!pickup.lat || !dropoff.lat || loading}
              onClick={getEstimate}
              data-testid="parcel-estimate-btn"
            >
              {loading ? 'Calcul en cours...' : 'Estimer le prix'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Details */}
      {step === 'details' && (
        <div className="p-4 space-y-4">
          {estimation && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-blue-600">Distance: {estimation.distance.toFixed(1)} km</p>
                    <p className="text-sm text-blue-600">Durée estimée: ~{Math.round(estimation.duration)} min</p>
                  </div>
                  <p className="text-2xl font-bold text-blue-800">{estimation.price.toFixed(2)} &euro;</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            <h3 className="font-semibold">Expéditeur</h3>
            <div className="space-y-2">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <Input placeholder="Nom de l'expéditeur" value={senderName} onChange={(e) => setSenderName(e.target.value)} className="pl-10" data-testid="sender-name-input" />
              </div>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <Input placeholder="Téléphone expéditeur" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} className="pl-10" data-testid="sender-phone-input" />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold">Destinataire</h3>
            <div className="space-y-2">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <Input placeholder="Nom du destinataire" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="pl-10" data-testid="recipient-name-input" />
              </div>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <Input placeholder="Téléphone destinataire" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} className="pl-10" data-testid="recipient-phone-input" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description du colis (optionnel)</Label>
            <Input placeholder="Ex: Fragile, documents importants..." value={description} onChange={(e) => setDescription(e.target.value)} data-testid="parcel-description-input" />
          </div>

          <Button
            className="w-full rounded-2xl h-14 bg-[#00C853] hover:bg-[#009624] text-white text-lg font-semibold"
            onClick={handleConfirm}
            data-testid="parcel-confirm-btn"
          >
            Confirmer l'envoi &middot; {estimation?.price.toFixed(2)} &euro;
          </Button>
        </div>
      )}

      {/* Step 4: Confirmed */}
      {step === 'confirmed' && (
        <div className="flex flex-col items-center justify-center h-[60vh] p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-[#00C853]/10 flex items-center justify-center mb-6">
            <Package size={40} className="text-[#00C853]" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Colis envoyé !</h2>
          <p className="text-gray-500">Un chauffeur va récupérer votre colis. Vous pouvez suivre la livraison dans votre historique.</p>
        </div>
      )}
    </div>
  );
};

export default ParcelPage;
