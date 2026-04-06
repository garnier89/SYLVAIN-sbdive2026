import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Badge } from '../../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { driverAPI, rideAPI } from '../../services/api';
import { 
  Car, MapPin, Star, Wallet, Clock,
  NavigationArrow, User, Bell, Power, X, Check
} from '@phosphor-icons/react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const DriverHome = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [driver, setDriver] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [currentRide, setCurrentRide] = useState(null);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapCenter, setMapCenter] = useState([40.7128, -74.0060]);

  useEffect(() => {
    loadDriverProfile();
    setupLocation();
  }, []);

  useEffect(() => {
    if (isOnline) {
      const interval = setInterval(loadPendingRides, 5000);
      return () => clearInterval(interval);
    }
  }, [isOnline, driver]);

  const loadDriverProfile = async () => {
    try {
      const response = await driverAPI.getProfile();
      setDriver(response.data);
      setIsOnline(response.data.is_online);
    } catch (error) {
      // Not registered as driver, redirect to registration
      if (error.response?.status === 404) {
        navigate('/driver/register');
      }
    } finally {
      setLoading(false);
    }
  };

  const setupLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setMapCenter([latitude, longitude]);
          // Update driver location
          driverAPI.updateLocation(latitude, longitude).catch(console.error);
        },
        (error) => console.log('Location error:', error)
      );

      // Watch position for continuous updates
      navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setMapCenter([latitude, longitude]);
          if (isOnline) {
            driverAPI.updateLocation(latitude, longitude).catch(console.error);
          }
        },
        (error) => console.log('Watch error:', error),
        { enableHighAccuracy: true }
      );
    }
  };

  const loadPendingRides = async () => {
    if (!driver || driver.status !== 'approved') return;
    
    try {
      const response = await rideAPI.list({ status: 'pending' });
      const rides = response.data;
      if (rides.length > 0 && !currentRide && !incomingRequest) {
        setIncomingRequest(rides[0]);
      }
    } catch (error) {
      console.error('Load rides error:', error);
    }
  };

  const toggleOnline = async () => {
    if (driver?.status !== 'approved') {
      return;
    }
    
    try {
      const response = await driverAPI.toggleOnline();
      setIsOnline(response.data.is_online);
    } catch (error) {
      console.error('Toggle online error:', error);
    }
  };

  const acceptRide = async (rideId) => {
    try {
      await rideAPI.accept(rideId);
      const response = await rideAPI.get(rideId);
      setCurrentRide(response.data);
      setIncomingRequest(null);
    } catch (error) {
      console.error('Accept ride error:', error);
      setIncomingRequest(null);
    }
  };

  const rejectRide = () => {
    setIncomingRequest(null);
  };

  const updateRideStatus = async (status) => {
    if (!currentRide) return;
    
    try {
      await rideAPI.updateStatus(currentRide.id, status);
      if (status === 'completed' || status === 'cancelled') {
        setCurrentRide(null);
      } else {
        const response = await rideAPI.get(currentRide.id);
        setCurrentRide(response.data);
      }
    } catch (error) {
      console.error('Update status error:', error);
    }
  };

  if (loading) {
    return (
      <div className="mobile-container min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
          <Car size={32} weight="duotone" className="text-primary" />
        </div>
      </div>
    );
  }

  if (!driver) {
    return null;
  }

  return (
    <div className="mobile-container bg-background min-h-screen relative">
      {/* Map Background */}
      <div className="h-[60vh]">
        <MapContainer
          center={mapCenter}
          zoom={15}
          className="w-full h-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={mapCenter} />
        </MapContainer>
      </div>

      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 bg-white rounded-full px-4 py-2 shadow-lg">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {user?.name?.charAt(0) || 'D'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">{user?.name}</p>
              <div className="flex items-center gap-1">
                <Star size={12} weight="fill" className="text-amber-500" />
                <span className="text-xs">{driver.rating.toFixed(1)}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="secondary" 
              size="icon" 
              className="rounded-full bg-white shadow-lg"
              onClick={() => navigate('/driver/earnings')}
              data-testid="earnings-btn"
            >
              <Wallet size={20} />
            </Button>
            <Button 
              variant="secondary" 
              size="icon" 
              className="rounded-full bg-white shadow-lg"
              data-testid="notifications-btn"
            >
              <Bell size={20} />
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom Sheet */}
      <div className="absolute bottom-0 left-0 right-0 bottom-sheet p-4 space-y-4">
        {/* Status Banner */}
        {driver.status === 'pending' && (
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-4 flex items-center gap-3">
              <Clock size={24} className="text-amber-600" />
              <div>
                <p className="font-semibold text-amber-800">Compte en cours de vérification</p>
                <p className="text-sm text-amber-700">Vos documents sont en cours de vérification</p>
              </div>
            </CardContent>
          </Card>
        )}

        {driver.status === 'rejected' && (
          <Card className="bg-red-50 border-red-200">
            <CardContent className="p-4">
              <p className="font-semibold text-red-800">Demande rejetée</p>
              <p className="text-sm text-red-700">{driver.rejection_reason || 'Veuillez contacter le support'}</p>
            </CardContent>
          </Card>
        )}

        {/* Online Toggle */}
        {driver.status === 'approved' && !currentRide && (
          <Card className={isOnline ? 'bg-primary/5 border-primary' : ''}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isOnline ? 'bg-primary' : 'bg-muted'}`}>
                  <Power size={24} className={isOnline ? 'text-white' : 'text-muted-foreground'} />
                </div>
                <div>
                  <p className="font-semibold">{isOnline ? 'Vous êtes en ligne' : 'Vous êtes hors ligne'}</p>
                  <p className="text-sm text-muted-foreground">
                    {isOnline ? 'Prêt à recevoir des courses' : 'Passez en ligne pour gagner'}
                  </p>
                </div>
              </div>
              <Switch
                checked={isOnline}
                onCheckedChange={toggleOnline}
                data-testid="online-toggle"
              />
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        {driver.status === 'approved' && !currentRide && (
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-primary">{driver.total_trips}</p>
                <p className="text-xs text-muted-foreground">Courses</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-primary">${driver.earnings.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">Gains</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-primary">{driver.rating.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Rating</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Current Ride */}
        {currentRide && (
          <Card className="border-primary">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Badge className={
                  currentRide.status === 'accepted' ? 'bg-blue-500' :
                  currentRide.status === 'arriving' ? 'bg-amber-500' :
                  currentRide.status === 'in_progress' ? 'bg-primary' : ''
                }>
                  {currentRide.status.replace('_', ' ').toUpperCase()}
                </Badge>
                <span className="font-bold text-lg">${currentRide.estimated_fare.toFixed(2)}</span>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pickup</p>
                    <p className="font-medium">{currentRide.pickup_address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center mt-0.5">
                    <MapPin size={12} className="text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Arrivée</p>
                    <p className="font-medium">{currentRide.dropoff_address}</p>
                  </div>
                </div>
              </div>

              {currentRide.status === 'in_progress' && currentRide.otp && (
                <p className="text-center text-sm">
                  OTP: <span className="font-bold text-lg">{currentRide.otp}</span>
                </p>
              )}

              <div className="flex gap-2">
                {currentRide.status === 'accepted' && (
                  <Button 
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white rounded-full"
                    onClick={() => updateRideStatus('arriving')}
                    data-testid="arriving-btn"
                  >
                    <NavigationArrow size={20} className="mr-2" />
                    Arriving
                  </Button>
                )}
                {currentRide.status === 'arriving' && (
                  <Button 
                    className="flex-1 bg-primary hover:bg-primary/90 text-white rounded-full"
                    onClick={() => updateRideStatus('in_progress')}
                    data-testid="start-trip-btn"
                  >
                    Start Trip
                  </Button>
                )}
                {currentRide.status === 'in_progress' && (
                  <Button 
                    className="flex-1 bg-primary hover:bg-primary/90 text-white rounded-full"
                    onClick={() => updateRideStatus('completed')}
                    data-testid="complete-trip-btn"
                  >
                    Complete Trip
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  className="rounded-full"
                  onClick={() => updateRideStatus('cancelled')}
                  data-testid="cancel-btn"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Incoming Request Modal */}
      {incomingRequest && !currentRide && (
        <div className="absolute inset-0 z-[2000] bg-black/50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-6 space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold">Nouvelle course</h3>
              <span className="text-2xl font-bold text-primary">${incomingRequest.estimated_fare.toFixed(2)}</span>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pickup</p>
                  <p className="font-medium">{incomingRequest.pickup_address}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center mt-0.5">
                  <MapPin size={12} className="text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Arrivée</p>
                  <p className="font-medium">{incomingRequest.dropoff_address}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{incomingRequest.distance_km.toFixed(1)} km</span>
              <span>{incomingRequest.duration_mins} mins</span>
              <span className="capitalize">{incomingRequest.vehicle_type}</span>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-full h-14"
                onClick={rejectRide}
                data-testid="reject-ride-btn"
              >
                <X size={24} className="mr-2" />
                Refuser
              </Button>
              <Button
                className="flex-1 bg-primary hover:bg-primary/90 text-white rounded-full h-14"
                onClick={() => acceptRide(incomingRequest.id)}
                data-testid="accept-ride-btn"
              >
                <Check size={24} className="mr-2" />
                Accepter
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverHome;
DriverHome;
