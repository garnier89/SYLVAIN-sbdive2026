import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { rideAPI } from '../../services/api';
import { 
  MapPin, Circle, Car, Motorcycle, 
  CreditCard, Money, Wallet, ArrowLeft,
  NavigationArrow, X
} from '@phosphor-icons/react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const LocationSelector = ({ onSelect }) => {
  useMapEvents({
    click(e) {
      onSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
};

const RideBookingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultVehicleType = searchParams.get('type') || 'car';
  
  const [step, setStep] = useState('location'); // location, vehicle, confirm, searching, tracking
  const [pickup, setPickup] = useState({ lat: null, lng: null, address: '' });
  const [dropoff, setDropoff] = useState({ lat: null, lng: null, address: '' });
  const [selectingLocation, setSelectingLocation] = useState(null); // 'pickup' or 'dropoff'
  const [vehicleType, setVehicleType] = useState(defaultVehicleType);
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [estimate, setEstimate] = useState(null);
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState([40.7128, -74.0060]); // NYC default

  useEffect(() => {
    // Get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setMapCenter([latitude, longitude]);
          setPickup({ 
            lat: latitude, 
            lng: longitude, 
            address: 'Current Location' 
          });
        },
        (error) => console.log('Location error:', error)
      );
    }
  }, []);

  const handleLocationSelect = (coords) => {
    if (selectingLocation === 'pickup') {
      setPickup({ ...coords, address: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` });
    } else if (selectingLocation === 'dropoff') {
      setDropoff({ ...coords, address: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` });
    }
    setSelectingLocation(null);
  };

  const getEstimate = useCallback(async () => {
    if (!pickup.lat || !dropoff.lat) return;
    
    setLoading(true);
    try {
      const response = await rideAPI.estimate({
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        vehicle_type: vehicleType,
        payment_method: paymentMethod,
      });
      setEstimate(response.data);
      setStep('vehicle');
    } catch (error) {
      console.error('Estimate error:', error);
    } finally {
      setLoading(false);
    }
  }, [pickup, dropoff, vehicleType, paymentMethod]);

  const confirmRide = async () => {
    setLoading(true);
    try {
      const response = await rideAPI.create({
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        pickup_address: pickup.address,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        dropoff_address: dropoff.address,
        vehicle_type: vehicleType,
        payment_method: paymentMethod,
      });
      setRide(response.data);
      setStep('searching');
    } catch (error) {
      console.error('Create ride error:', error);
    } finally {
      setLoading(false);
    }
  };

  const vehicles = [
    { type: 'car', name: 'Car', icon: Car, multiplier: 1 },
    { type: 'motorcycle', name: 'Motorcycle', icon: Motorcycle, multiplier: 0.7 },
  ];

  const paymentMethods = [
    { id: 'card', name: 'Card', icon: CreditCard },
    { id: 'cash', name: 'Cash', icon: Money },
    { id: 'wallet', name: 'Wallet', icon: Wallet },
  ];

  return (
    <div className="mobile-container bg-background min-h-screen relative">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-4 flex items-center gap-4">
        <Button 
          variant="secondary" 
          size="icon" 
          className="rounded-full bg-white shadow-lg"
          onClick={() => navigate(-1)}
          data-testid="back-btn"
        >
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-lg font-semibold bg-white/80 px-3 py-1 rounded-full backdrop-blur">
          {step === 'location' ? 'Set Locations' : 
           step === 'vehicle' ? 'Choose Vehicle' :
           step === 'confirm' ? 'Confirm Ride' :
           step === 'searching' ? 'Finding Driver...' : 'Tracking'}
        </h1>
      </div>

      {/* Map */}
      <div className="h-[60vh]">
        <MapContainer
          center={mapCenter}
          zoom={14}
          className="w-full h-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {pickup.lat && <Marker position={[pickup.lat, pickup.lng]} icon={greenIcon} />}
          {dropoff.lat && <Marker position={[dropoff.lat, dropoff.lng]} icon={redIcon} />}
          {selectingLocation && <LocationSelector onSelect={handleLocationSelect} />}
        </MapContainer>
      </div>

      {/* Bottom Sheet */}
      <div className="absolute bottom-0 left-0 right-0 bottom-sheet p-4 space-y-4 animate-slide-up" style={{ minHeight: '40vh' }}>
        {step === 'location' && (
          <>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Circle size={20} weight="fill" className="text-primary" />
                <Input
                  placeholder="Pickup location"
                  value={pickup.address}
                  readOnly
                  onClick={() => setSelectingLocation('pickup')}
                  className={`flex-1 cursor-pointer ${selectingLocation === 'pickup' ? 'ring-2 ring-primary' : ''}`}
                  data-testid="pickup-input"
                />
                {pickup.address && (
                  <Button variant="ghost" size="icon" onClick={() => setPickup({ lat: null, lng: null, address: '' })}>
                    <X size={16} />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <MapPin size={20} weight="fill" className="text-destructive" />
                <Input
                  placeholder="Drop-off location"
                  value={dropoff.address}
                  readOnly
                  onClick={() => setSelectingLocation('dropoff')}
                  className={`flex-1 cursor-pointer ${selectingLocation === 'dropoff' ? 'ring-2 ring-primary' : ''}`}
                  data-testid="dropoff-input"
                />
                {dropoff.address && (
                  <Button variant="ghost" size="icon" onClick={() => setDropoff({ lat: null, lng: null, address: '' })}>
                    <X size={16} />
                  </Button>
                )}
              </div>
            </div>
            
            {selectingLocation && (
              <p className="text-sm text-center text-muted-foreground">
                Tap on the map to select {selectingLocation === 'pickup' ? 'pickup' : 'drop-off'} location
              </p>
            )}

            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white rounded-full h-12"
              disabled={!pickup.lat || !dropoff.lat || loading}
              onClick={getEstimate}
              data-testid="get-estimate-btn"
            >
              {loading ? 'Getting estimate...' : 'Get Estimate'}
              <NavigationArrow size={20} className="ml-2" />
            </Button>
          </>
        )}

        {step === 'vehicle' && estimate && (
          <>
            <div className="text-center pb-2 border-b">
              <p className="text-sm text-muted-foreground">
                {estimate.distance_km.toFixed(1)} km · {estimate.duration_mins} mins
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Select vehicle</p>
              {vehicles.map((v) => {
                const price = (estimate.estimated_fare * v.multiplier).toFixed(2);
                return (
                  <Card 
                    key={v.type}
                    className={`cursor-pointer transition-all ${vehicleType === v.type ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                    onClick={() => setVehicleType(v.type)}
                    data-testid={`vehicle-${v.type}`}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                        <v.icon size={28} weight="duotone" className={vehicleType === v.type ? 'text-primary' : 'text-foreground'} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{v.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {v.type === 'car' ? '4 seats' : '1 seat'}
                        </p>
                      </div>
                      <p className="font-bold text-lg">${price}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Payment method</p>
              <div className="flex gap-2">
                {paymentMethods.map((pm) => (
                  <Button
                    key={pm.id}
                    variant={paymentMethod === pm.id ? 'default' : 'outline'}
                    className={`flex-1 rounded-full ${paymentMethod === pm.id ? 'bg-primary text-white' : ''}`}
                    onClick={() => setPaymentMethod(pm.id)}
                    data-testid={`payment-${pm.id}`}
                  >
                    <pm.icon size={18} className="mr-1" />
                    {pm.name}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white rounded-full h-12"
              onClick={confirmRide}
              disabled={loading}
              data-testid="confirm-ride-btn"
            >
              {loading ? 'Booking...' : `Confirm ${vehicleType === 'car' ? 'Car' : 'Moto'} · $${(estimate.estimated_fare * (vehicleType === 'motorcycle' ? 0.7 : 1)).toFixed(2)}`}
            </Button>
          </>
        )}

        {step === 'searching' && ride && (
          <div className="text-center py-8 space-y-4">
            <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
              <Car size={40} weight="duotone" className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Looking for a driver</h3>
              <p className="text-sm text-muted-foreground">This may take a moment...</p>
            </div>
            <Card className="text-left">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Circle size={12} weight="fill" className="text-primary" />
                  <span className="text-sm">{pickup.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={12} weight="fill" className="text-destructive" />
                  <span className="text-sm">{dropoff.address}</span>
                </div>
              </CardContent>
            </Card>
            <p className="text-sm text-muted-foreground">
              OTP: <span className="font-bold text-foreground">{ride.otp}</span>
            </p>
            <Button 
              variant="destructive" 
              className="rounded-full"
              onClick={() => navigate('/')}
              data-testid="cancel-ride-btn"
            >
              Cancel Ride
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RideBookingPage;
