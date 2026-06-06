import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { orderAPI, rideAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { 
  ArrowLeft, CheckCircle, Clock, Package, 
  Truck, MapPin, Phone, Chat
} from '@phosphor-icons/react';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet marker icons
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

const destinationIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const OrderTracking = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);

  useEffect(() => {
    const loadOrder = async () => {
      try {
        const response = await orderAPI.get(orderId);
        setOrder(response.data);
      } catch (error) {
        // Demo data fallback
        setOrder({
          id: orderId,
          status: 'preparing',
          items: [
            { name: 'Classic Burger', quantity: 2, price: 12.99 },
            { name: 'French Fries', quantity: 1, price: 4.99 }
          ],
          subtotal: 30.97,
          delivery_fee: 2.50,
          total: 33.47,
          delivery_address: '123 Main Street, NYC',
          delivery_lat: 40.7128,
          delivery_lng: -74.0060,
          created_at: new Date().toISOString(),
          estimated_delivery: new Date(Date.now() + 30 * 60000).toISOString()
        });
      } finally {
        setLoading(false);
      }
    };

    const connectWebSocket = () => {
      if (!user?.id) return;
      const wsUrl = process.env.REACT_APP_BACKEND_URL?.replace('https://', 'wss://').replace('http://', 'ws://');
      if (!wsUrl) return;
      try {
        const ws = new WebSocket(`${wsUrl}/api/ws/${user.id}`);
        wsRef.current = ws;
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'order_status') loadOrder();
          if (data.type === 'driver_location') setDriverLocation({ lat: data.lat, lng: data.lng });
        };
        ws.onerror = (error) => console.warn('[order-ws] error', error?.message);
      } catch (error) {
        console.warn('[order-ws] connection failed', error?.message);
      }
    };

    loadOrder();
    connectWebSocket();
    // Poll for updates every 10 seconds
    const interval = setInterval(loadOrder, 10000);

    return () => {
      clearInterval(interval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [orderId, user?.id]);

  const getStatusSteps = () => {
    const steps = [
      { key: 'pending', label: 'Commande passée', icon: CheckCircle },
      { key: 'accepted', label: 'Confirmée', icon: CheckCircle },
      { key: 'preparing', label: 'En préparation', icon: Package },
      { key: 'ready', label: 'Prête', icon: Package },
      { key: 'picked_up', label: 'En livraison', icon: Truck },
      { key: 'delivered', label: 'Livrée', icon: CheckCircle },
    ];

    const statusOrder = ['pending', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered'];
    const currentIndex = statusOrder.indexOf(order?.status || 'pending');

    return steps.map((step, index) => ({
      ...step,
      completed: index <= currentIndex,
      active: statusOrder[index] === order?.status
    }));
  };

  const getETA = () => {
    if (!order?.estimated_delivery) return 'Calcul…';
    const eta = new Date(order.estimated_delivery);
    const now = new Date();
    const diff = Math.max(0, Math.round((eta - now) / 60000));
    if (diff === 0) return 'Arrive bientôt !';
    return `${diff} min`;
  };

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse text-center">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">Chargement de la commande…</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <p className="text-gray-500 mb-4">Commande introuvable</p>
        <Button variant="outline" onClick={() => navigate('/')}>
          Accueil
        </Button>
      </div>
    );
  }

  const showMap = ['picked_up'].includes(order.status);

  return (
    <div className="mobile-container min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b">
        <div className="p-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => navigate('/')}
            data-testid="back-btn"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-lg font-bold">Commande #{order.id.slice(-6)}</h1>
            <p className="text-sm text-gray-500">Suivez votre commande</p>
          </div>
        </div>
      </div>

      {/* Map (when out for delivery) */}
      {showMap && (
        <div className="h-48">
          <MapContainer
            center={[order.delivery_lat || 40.7128, order.delivery_lng || -74.0060]}
            zoom={14}
            className="w-full h-full"
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {driverLocation && (
              <Marker position={[driverLocation.lat, driverLocation.lng]} icon={driverIcon} />
            )}
            <Marker 
              position={[order.delivery_lat || 40.7128, order.delivery_lng || -74.0060]} 
              icon={destinationIcon} 
            />
          </MapContainer>
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* ETA Card */}
        <Card className="bg-gradient-to-r from-orange-500 to-orange-400 text-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Arrivée estimée</p>
              <p className="text-3xl font-bold">{getETA()}</p>
            </div>
            <Clock size={48} weight="duotone" className="opacity-80" />
          </CardContent>
        </Card>

        {/* Status Timeline */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Statut de la commande</h3>
            <div className="space-y-4">
              {getStatusSteps().map((step, index) => (
                <div key={step.key} className="flex items-start gap-3">
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                    ${step.completed ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'}
                    ${step.active ? 'ring-4 ring-emerald-100' : ''}
                  `}>
                    <step.icon size={16} weight={step.completed ? 'fill' : 'regular'} />
                  </div>
                  <div className={`flex-1 pb-4 ${index < getStatusSteps().length - 1 ? 'border-l-2 border-gray-100 ml-4 -mt-4 pt-4 pl-6' : ''}`}>
                    <p className={`font-medium ${step.completed ? 'text-gray-900' : 'text-gray-400'}`}>
                      {step.label}
                    </p>
                    {step.active && (
                      <p className="text-sm text-emerald-600 animate-pulse">En cours…</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Order Items */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Détails de la commande</h3>
            <div className="space-y-2">
              {order.items?.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-gray-700">{item.quantity}x {item.name}</span>
                  <span className="text-gray-500">{(item.price * item.quantity).toFixed(2).replace('.', ',')} €</span>
                </div>
              ))}
              <div className="border-t pt-2 mt-2 space-y-1">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Sous-total</span>
                  <span>{order.subtotal?.toFixed(2).replace('.', ',')} €</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Livraison</span>
                  <span>{order.delivery_fee?.toFixed(2).replace('.', ',')} €</span>
                </div>
                <div className="flex justify-between font-semibold text-gray-900">
                  <span>Total</span>
                  <span>{order.total?.toFixed(2).replace('.', ',')} €</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Delivery Address */}
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <MapPin size={20} className="text-red-500 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">Adresse de livraison</p>
              <p className="text-sm text-gray-500">{order.delivery_address}</p>
            </div>
          </CardContent>
        </Card>

        {/* Contact Driver (when picked up) */}
        {['picked_up'].includes(order.status) && (
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-full" data-testid="call-driver-btn">
              <Phone size={18} className="mr-2" />
              Appeler le chauffeur
            </Button>
            <Button variant="outline" className="flex-1 rounded-full" data-testid="chat-driver-btn">
              <Chat size={18} className="mr-2" />
              Discuter
            </Button>
          </div>
        )}

        {/* Help */}
        <Button
          variant="outline"
          className="w-full rounded-full"
          onClick={() => navigate('/support')}
          data-testid="help-btn"
        >
          Besoin d&apos;aide ?
        </Button>
      </div>
    </div>
  );
};

export default OrderTracking;
