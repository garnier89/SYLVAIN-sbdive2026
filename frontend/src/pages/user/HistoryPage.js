import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { rideAPI, orderAPI } from '../../services/api';
import { 
  ArrowLeft, Car, Package, MapPin, Star, Clock
} from '@phosphor-icons/react';

const HistoryPage = () => {
  const navigate = useNavigate();
  const [rides, setRides] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('rides');

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const [ridesRes, ordersRes] = await Promise.all([
        rideAPI.list({ limit: 20 }),
        orderAPI.list({ limit: 20 })
      ]);
      setRides(ridesRes.data);
      setOrders(ordersRes.data);
    } catch (error) {
      console.error('Load history error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-amber-100 text-amber-800',
      accepted: 'bg-blue-100 text-blue-800',
      arriving: 'bg-purple-100 text-purple-800',
      in_progress: 'bg-indigo-100 text-indigo-800',
      preparing: 'bg-purple-100 text-purple-800',
      ready: 'bg-cyan-100 text-cyan-800',
      picked_up: 'bg-indigo-100 text-indigo-800',
      completed: 'bg-green-100 text-green-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return <Badge className={styles[status] || 'bg-gray-100'}>{status.replace('_', ' ')}</Badge>;
  };

  const RideCard = ({ ride }) => (
    <Card className="hover:shadow-md transition-shadow" data-testid={`ride-${ride.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Car size={20} className="text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                {ride.vehicle_type === 'car' ? 'Car Ride' : 'Moto Ride'}
              </p>
              <p className="text-sm text-gray-500">
                {new Date(ride.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          {getStatusBadge(ride.status)}
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5" />
            <span className="text-gray-600 truncate">{ride.pickup_address}</span>
          </div>
          <div className="flex items-start gap-2">
            <MapPin size={12} className="text-red-500 mt-0.5" />
            <span className="text-gray-600 truncate">{ride.dropoff_address}</span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <span className="text-lg font-bold text-gray-900">
            ${(ride.final_fare || ride.estimated_fare)?.toFixed(2)}
          </span>
          {ride.status === 'completed' && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => navigate(`/rate/ride/${ride.id}`)}
              data-testid={`rate-ride-${ride.id}`}
            >
              <Star size={16} className="mr-1" />
              Rate
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const OrderCard = ({ order }) => (
    <Card className="hover:shadow-md transition-shadow" data-testid={`order-${order.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <Package size={20} className="text-orange-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                {order.order_type === 'food' ? 'Food Order' : 'Delivery'}
              </p>
              <p className="text-sm text-gray-500">
                {new Date(order.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          {getStatusBadge(order.status)}
        </div>
        
        <div className="text-sm text-gray-600 mb-3">
          {order.items?.slice(0, 2).map((item, idx) => (
            <span key={idx}>
              {item.quantity}x {item.name}
              {idx < Math.min(order.items.length, 2) - 1 && ', '}
            </span>
          ))}
          {order.items?.length > 2 && ` +${order.items.length - 2} more`}
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-500">
          <MapPin size={14} />
          <span className="truncate">{order.delivery_address}</span>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <span className="text-lg font-bold text-gray-900">
            ${order.total?.toFixed(2)}
          </span>
          <div className="flex gap-2">
            {['delivered', 'completed'].includes(order.status) && (
              <Button 
                size="sm" 
                variant="outline"
                data-testid={`rate-order-${order.id}`}
              >
                <Star size={16} className="mr-1" />
                Rate
              </Button>
            )}
            {!['delivered', 'completed', 'cancelled'].includes(order.status) && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => navigate(`/order/${order.id}`)}
                data-testid={`track-order-${order.id}`}
              >
                Track
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-20">
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
          <h1 className="text-xl font-bold">Activity</h1>
        </div>
      </div>

      <div className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="rides" data-testid="tab-rides">
              <Car size={18} className="mr-2" />
              Rides ({rides.length})
            </TabsTrigger>
            <TabsTrigger value="orders" data-testid="tab-orders">
              <Package size={18} className="mr-2" />
              Orders ({orders.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rides" className="space-y-3">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-4 h-32" />
                  </Card>
                ))}
              </div>
            ) : rides.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-gray-500">
                  <Car size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No rides yet</p>
                  <Button
                    className="mt-4"
                    style={{ backgroundColor: '#00C853' }}
                    onClick={() => navigate('/ride')}
                  >
                    Book a Ride
                  </Button>
                </CardContent>
              </Card>
            ) : (
              rides.map(ride => <RideCard key={ride.id} ride={ride} />)
            )}
          </TabsContent>

          <TabsContent value="orders" className="space-y-3">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-4 h-32" />
                  </Card>
                ))}
              </div>
            ) : orders.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-gray-500">
                  <Package size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No orders yet</p>
                  <Button
                    className="mt-4"
                    style={{ backgroundColor: '#00C853' }}
                    onClick={() => navigate('/food')}
                  >
                    Order Food
                  </Button>
                </CardContent>
              </Card>
            ) : (
              orders.map(order => <OrderCard key={order.id} order={order} />)
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default HistoryPage;
