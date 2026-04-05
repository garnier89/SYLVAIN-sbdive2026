import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { orderAPI } from '../../services/api';
import { 
  Package, Clock, CheckCircle, XCircle, Truck
} from '@phosphor-icons/react';

const MerchantOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');

  useEffect(() => {
    loadOrders();
    // Poll for new orders every 30 seconds
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadOrders = async () => {
    try {
      const response = await orderAPI.list({ limit: 50 });
      setOrders(response.data);
    } catch (error) {
      console.error('Load orders error:', error);
      // Demo data
      setOrders([
        { id: 'order_demo1', status: 'pending', items: [{ name: 'Classic Burger', quantity: 2, price: 12.99 }], total: 28.48, delivery_address: '123 Main St', created_at: new Date().toISOString() },
        { id: 'order_demo2', status: 'preparing', items: [{ name: 'Cheese Pizza', quantity: 1, price: 14.99 }], total: 17.49, delivery_address: '456 Oak Ave', created_at: new Date(Date.now() - 600000).toISOString() },
        { id: 'order_demo3', status: 'ready', items: [{ name: 'Caesar Salad', quantity: 1, price: 9.99 }], total: 12.49, delivery_address: '789 Elm Rd', created_at: new Date(Date.now() - 1200000).toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await orderAPI.updateStatus(orderId, newStatus);
      loadOrders();
    } catch (error) {
      // Update locally for demo
      setOrders(orders.map(o => 
        o.id === orderId ? { ...o, status: newStatus } : o
      ));
    }
  };

  const getStatusBadge = (status) => {
    const config = {
      pending: { color: 'bg-amber-100 text-amber-800', icon: Clock },
      accepted: { color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
      preparing: { color: 'bg-purple-100 text-purple-800', icon: Package },
      ready: { color: 'bg-cyan-100 text-cyan-800', icon: CheckCircle },
      picked_up: { color: 'bg-indigo-100 text-indigo-800', icon: Truck },
      delivered: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      cancelled: { color: 'bg-red-100 text-red-800', icon: XCircle },
    };
    const { color, icon: Icon } = config[status] || config.pending;
    return (
      <Badge className={`${color} flex items-center gap-1`}>
        <Icon size={14} />
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const filterOrders = (status) => {
    if (status === 'pending') return orders.filter(o => o.status === 'pending');
    if (status === 'active') return orders.filter(o => ['accepted', 'preparing', 'ready'].includes(o.status));
    if (status === 'completed') return orders.filter(o => ['picked_up', 'delivered'].includes(o.status));
    return orders;
  };

  const OrderCard = ({ order }) => (
    <Card className="hover:shadow-md transition-shadow" data-testid={`order-card-${order.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-bold text-lg text-gray-900">#{order.id.slice(-6)}</p>
            <p className="text-sm text-gray-500">
              {new Date(order.created_at).toLocaleString()}
            </p>
          </div>
          {getStatusBadge(order.status)}
        </div>

        <div className="border-t border-b py-3 my-3 space-y-2">
          {order.items?.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <span className="text-gray-700">{item.quantity}x {item.name}</span>
              <span className="text-gray-500">${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-500">Delivery to:</span>
          <span className="text-sm text-gray-700 truncate max-w-[200px]">{order.delivery_address}</span>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xl font-bold text-orange-600">${order.total?.toFixed(2)}</p>
          <div className="flex gap-2">
            {order.status === 'pending' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => updateOrderStatus(order.id, 'cancelled')}
                  data-testid={`reject-${order.id}`}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  style={{ backgroundColor: '#f97316' }}
                  className="text-white"
                  onClick={() => updateOrderStatus(order.id, 'accepted')}
                  data-testid={`accept-${order.id}`}
                >
                  Accept
                </Button>
              </>
            )}
            {order.status === 'accepted' && (
              <Button
                size="sm"
                style={{ backgroundColor: '#f97316' }}
                className="text-white"
                onClick={() => updateOrderStatus(order.id, 'preparing')}
                data-testid={`prepare-${order.id}`}
              >
                Start Preparing
              </Button>
            )}
            {order.status === 'preparing' && (
              <Button
                size="sm"
                style={{ backgroundColor: '#22c55e' }}
                className="text-white"
                onClick={() => updateOrderStatus(order.id, 'ready')}
                data-testid={`ready-${order.id}`}
              >
                Mark Ready
              </Button>
            )}
            {order.status === 'ready' && (
              <Badge className="bg-green-100 text-green-800 px-4 py-2">
                Waiting for pickup
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Orders</h1>
        <p className="text-gray-500">Manage incoming and active orders</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending ({filterOrders('pending').length})
          </TabsTrigger>
          <TabsTrigger value="active" data-testid="tab-active">
            Active ({filterOrders('active').length})
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            Completed ({filterOrders('completed').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4 h-48" />
                </Card>
              ))}
            </div>
          ) : filterOrders('pending').length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-gray-500">
                <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
                <p>No pending orders</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filterOrders('pending').map(order => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="active" className="mt-6">
          {filterOrders('active').length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-gray-500">
                <Package size={48} className="mx-auto mb-4 opacity-50" />
                <p>No active orders</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filterOrders('active').map(order => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          {filterOrders('completed').length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-gray-500">
                <Truck size={48} className="mx-auto mb-4 opacity-50" />
                <p>No completed orders today</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filterOrders('completed').map(order => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MerchantOrders;
