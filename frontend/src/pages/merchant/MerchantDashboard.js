import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { orderAPI, merchantAPI } from '../../services/api';
import { useLocale } from '../../contexts/LocaleContext';
import { Package, CurrencyDollar, Clock, ShoppingCart, Star } from '@phosphor-icons/react';

const STATUS_FR = {
  pending: 'En attente', accepted: 'Acceptée', preparing: 'En préparation',
  ready: 'Prête', picked_up: 'Récupérée', delivered: 'Livrée', cancelled: 'Annulée',
};

const MerchantDashboard = () => {
  const navigate = useNavigate();
  const { money } = useLocale();
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ today_orders: 0, today_revenue: 0, pending_orders: 0, rating: 5.0, review_count: 0, top_products: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [ordersRes, statsRes] = await Promise.allSettled([
        orderAPI.list({ limit: 10 }),
        merchantAPI.getStats(),
      ]);
      if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value.data);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try { await orderAPI.updateStatus(orderId, newStatus); loadData(); }
    catch (error) { console.error('Update order error:', error); }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-amber-100 text-amber-800', accepted: 'bg-blue-100 text-blue-800',
      preparing: 'bg-purple-100 text-purple-800', ready: 'bg-cyan-100 text-cyan-800',
      picked_up: 'bg-indigo-100 text-indigo-800', delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return <Badge className={styles[status] || 'bg-gray-100'}>{STATUS_FR[status] || status}</Badge>;
  };

  const getNextStatus = (s) => ({ pending: 'accepted', accepted: 'preparing', preparing: 'ready' }[s]);
  const nextLabel = (s) => ({ pending: 'Accepter', accepted: 'Préparer', preparing: 'Prête' }[s] || 'Mettre à jour');

  const statCards = [
    { icon: ShoppingCart, label: "Commandes du jour", value: stats.today_orders, color: 'bg-blue-500' },
    { icon: CurrencyDollar, label: "Revenu du jour", value: money(stats.today_revenue || 0), color: 'bg-green-500' },
    { icon: Clock, label: 'Commandes en attente', value: stats.pending_orders, color: 'bg-amber-500' },
    { icon: Star, label: `Note (${stats.review_count} avis)`, value: (stats.rating || 5).toFixed(1), color: 'bg-purple-500' },
  ];

  return (
    <div className="p-6 space-y-6" data-testid="merchant-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Tableau de bord</h1>
          <p className="text-gray-500">Aperçu de votre boutique</p>
        </div>
        <Button onClick={() => navigate('/merchant/products')} style={{ backgroundColor: '#f97316' }} className="text-white" data-testid="manage-products-btn">
          Gérer le catalogue
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="hover:shadow-md transition-shadow" data-testid={`stat-${stat.label}`}>
            <CardContent className="p-6">
              <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center`}>
                <stat.icon size={24} className="text-white" weight="duotone" />
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.top_products?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-xl">Produits les plus commandés</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.top_products.map((p, i) => (
                <Badge key={i} variant="secondary" className="text-sm py-1.5 px-3" data-testid={`top-product-${i}`}>
                  {p.name} · {p.qty}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Commandes récentes</CardTitle>
          <Button variant="outline" size="sm" onClick={() => navigate('/merchant/orders')} data-testid="view-all-orders">Tout voir</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse flex items-center gap-4 p-4 border rounded-lg">
                  <div className="w-12 h-12 bg-gray-200 rounded-lg" />
                  <div className="flex-1 space-y-2"><div className="h-4 bg-gray-200 rounded w-1/3" /><div className="h-3 bg-gray-200 rounded w-1/4" /></div>
                </div>
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-gray-500"><Package size={48} className="mx-auto mb-4 opacity-50" /><p>Aucune commande pour l'instant</p></div>
          ) : (
            <div className="space-y-4">
              {orders.slice(0, 5).map((order) => (
                <div key={order.id} className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors" data-testid={`order-${order.id}`}>
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center"><Package size={24} className="text-orange-600" /></div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">Commande #{order.id.slice(-6)}</p>
                      {getStatusBadge(order.status)}
                    </div>
                    <p className="text-sm text-gray-500">{order.items?.length || 0} article(s) · {money(order.total || 0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleTimeString()}</p>
                    {getNextStatus(order.status) && (
                      <Button size="sm" variant="outline" className="mt-1" onClick={() => updateOrderStatus(order.id, getNextStatus(order.status))} data-testid={`update-order-${order.id}`}>
                        {nextLabel(order.status)}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MerchantDashboard;
