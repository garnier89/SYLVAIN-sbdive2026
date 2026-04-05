import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';
import { dispatcherAPI } from '../../services/api';
import { 
  Car, Package, MapPin, User, Phone,
  SignOut, ArrowsClockwise, NavigationArrow
} from '@phosphor-icons/react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const driverIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const rideIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const DispatcherPanel = () => {
  const { user, logout } = useAuth();
  const [data, setData] = useState({ drivers: [], rides: [], orders: [] });
  const [loading, setLoading] = useState(true);
  const [selectedRide, setSelectedRide] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [mapCenter] = useState([40.7128, -74.0060]);

  useEffect(() => {
    loadLiveData();
    const interval = setInterval(loadLiveData, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadLiveData = async () => {
    try {
      const response = await dispatcherAPI.getLiveData();
      setData(response.data);
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const assignRide = async () => {
    if (!selectedRide || !selectedDriver) return;
    
    try {
      await dispatcherAPI.assignRide(selectedRide.id, selectedDriver.id);
      setSelectedRide(null);
      setSelectedDriver(null);
      loadLiveData();
    } catch (error) {
      console.error('Assign error:', error);
    }
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-amber-500',
      accepted: 'bg-blue-500',
      arriving: 'bg-purple-500',
      in_progress: 'bg-green-500',
      preparing: 'bg-orange-500',
      ready: 'bg-cyan-500',
      picked_up: 'bg-indigo-500',
    };
    return colors[status] || 'bg-gray-500';
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#18181B] border-b border-[#27272A] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <NavigationArrow size={24} className="text-white" weight="duotone" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Dispatch Center</h1>
              <p className="text-sm text-[#A1A1AA]">Live Operations</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={loadLiveData}
              className="text-[#A1A1AA] hover:text-white"
              data-testid="refresh-btn"
            >
              <ArrowsClockwise size={20} className={loading ? 'animate-spin' : ''} />
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#A1A1AA]">{user?.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-red-400 hover:text-red-300"
                data-testid="logout-btn"
              >
                <SignOut size={18} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-0 h-[calc(100vh-73px)]">
        {/* Map - 8 columns */}
        <div className="col-span-8 relative">
          <MapContainer
            center={mapCenter}
            zoom={12}
            className="w-full h-full"
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            {/* Driver markers */}
            {data.drivers.map((driver) => (
              driver.current_lat && (
                <Marker
                  key={driver.id}
                  position={[driver.current_lat, driver.current_lng]}
                  icon={driverIcon}
                  eventHandlers={{
                    click: () => setSelectedDriver(driver),
                  }}
                >
                  <Popup>
                    <div className="text-black">
                      <p className="font-bold">{driver.vehicle_type}</p>
                      <p className="text-sm">{driver.vehicle_number}</p>
                    </div>
                  </Popup>
                </Marker>
              )
            ))}
            {/* Ride markers */}
            {data.rides.map((ride) => (
              <Marker
                key={ride.id}
                position={[ride.pickup_lat, ride.pickup_lng]}
                icon={rideIcon}
                eventHandlers={{
                  click: () => setSelectedRide(ride),
                }}
              >
                <Popup>
                  <div className="text-black">
                    <p className="font-bold">Ride Request</p>
                    <p className="text-sm">{ride.pickup_address}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Stats Overlay */}
          <div className="absolute top-4 left-4 flex gap-3">
            <Card className="bg-[#18181B]/90 border-[#27272A] backdrop-blur">
              <CardContent className="p-3 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                <span className="text-white font-medium">{data.drivers.length} Drivers Online</span>
              </CardContent>
            </Card>
            <Card className="bg-[#18181B]/90 border-[#27272A] backdrop-blur">
              <CardContent className="p-3 flex items-center gap-2">
                <Car size={16} className="text-primary" />
                <span className="text-white font-medium">{data.rides.filter(r => r.status === 'pending').length} Pending Rides</span>
              </CardContent>
            </Card>
            <Card className="bg-[#18181B]/90 border-[#27272A] backdrop-blur">
              <CardContent className="p-3 flex items-center gap-2">
                <Package size={16} className="text-amber-500" />
                <span className="text-white font-medium">{data.orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status)).length} Active Orders</span>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Sidebar - 4 columns */}
        <div className="col-span-4 bg-[#18181B] border-l border-[#27272A] flex flex-col">
          {/* Pending Rides */}
          <div className="flex-1 border-b border-[#27272A]">
            <div className="p-4 border-b border-[#27272A]">
              <h2 className="font-bold flex items-center gap-2">
                <Car size={20} className="text-primary" />
                Pending Rides ({data.rides.filter(r => r.status === 'pending').length})
              </h2>
            </div>
            <ScrollArea className="h-[calc(50vh-120px)]">
              <div className="p-4 space-y-3">
                {data.rides.filter(r => r.status === 'pending').length === 0 ? (
                  <p className="text-[#A1A1AA] text-center py-8">No pending rides</p>
                ) : (
                  data.rides.filter(r => r.status === 'pending').map((ride) => (
                    <Card 
                      key={ride.id}
                      className={`bg-[#27272A] border-[#3F3F46] cursor-pointer transition-all ${
                        selectedRide?.id === ride.id ? 'ring-2 ring-primary' : 'hover:bg-[#3F3F46]'
                      }`}
                      onClick={() => setSelectedRide(ride)}
                      data-testid={`ride-${ride.id}`}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge className={getStatusColor(ride.status)}>
                            {ride.status.toUpperCase()}
                          </Badge>
                          <span className="font-bold text-primary">${ride.estimated_fare.toFixed(2)}</span>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-start gap-2">
                            <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                            <span className="text-[#A1A1AA] truncate">{ride.pickup_address}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <MapPin size={12} className="text-red-400 mt-0.5" />
                            <span className="text-[#A1A1AA] truncate">{ride.dropoff_address}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Online Drivers */}
          <div className="flex-1">
            <div className="p-4 border-b border-[#27272A]">
              <h2 className="font-bold flex items-center gap-2">
                <User size={20} className="text-green-500" />
                Online Drivers ({data.drivers.length})
              </h2>
            </div>
            <ScrollArea className="h-[calc(50vh-120px)]">
              <div className="p-4 space-y-3">
                {data.drivers.length === 0 ? (
                  <p className="text-[#A1A1AA] text-center py-8">No drivers online</p>
                ) : (
                  data.drivers.map((driver) => (
                    <Card 
                      key={driver.id}
                      className={`bg-[#27272A] border-[#3F3F46] cursor-pointer transition-all ${
                        selectedDriver?.id === driver.id ? 'ring-2 ring-green-500' : 'hover:bg-[#3F3F46]'
                      }`}
                      onClick={() => setSelectedDriver(driver)}
                      data-testid={`driver-${driver.id}`}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#3F3F46] flex items-center justify-center">
                              <Car size={16} className="text-green-500" />
                            </div>
                            <div>
                              <p className="font-medium capitalize">{driver.vehicle_type}</p>
                              <p className="text-sm text-[#A1A1AA]">{driver.vehicle_number}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="border-green-500 text-green-500">
                            Online
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Manual Assign Action */}
          {selectedRide && selectedDriver && (
            <div className="p-4 border-t border-[#27272A] bg-[#27272A]">
              <Button
                className="w-full bg-primary hover:bg-primary/90 text-white"
                onClick={assignRide}
                data-testid="assign-btn"
              >
                Assign {selectedDriver.vehicle_number} to Ride
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DispatcherPanel;
