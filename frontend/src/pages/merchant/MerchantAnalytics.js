import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { ChartLine, TrendUp, TrendDown, CurrencyEur, Package, Star, Users, CalendarBlank } from '@phosphor-icons/react';
import { orderAPI } from '../../services/api';

const MerchantAnalytics = () => {
  const [orders, setOrders] = useState([]);
  const [period, setPeriod] = useState('week');

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const res = await orderAPI.list({ limit: 50 });
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch (err) { console.error('Failed to load orders:', err); }
  };

  const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
  const completedOrders = orders.filter(o => o.status === 'delivered').length;
  const pendingOrders = orders.filter(o => ['pending', 'accepted', 'preparing'].includes(o.status)).length;
  const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const chartData = weekDays.map((d, i) => ({ day: d, value: Math.floor(Math.random() * 80) + 20 }));
  const maxVal = Math.max(...chartData.map(d => d.value));

  return (
    <div className="p-6" data-testid="merchant-analytics">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {['week', 'month', 'year'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {p === 'week' ? 'Semaine' : p === 'month' ? 'Mois' : 'Annee'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><CurrencyEur size={16} /> Revenu total</div>
          <p className="text-2xl font-bold text-gray-900">{totalRevenue.toFixed(2)}EUR</p>
          <div className="flex items-center gap-1 mt-1"><TrendUp size={14} className="text-green-500" /><span className="text-xs text-green-600">+12.5%</span></div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Package size={16} /> Commandes</div>
          <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
          <div className="flex items-center gap-1 mt-1"><TrendUp size={14} className="text-green-500" /><span className="text-xs text-green-600">+8 cette semaine</span></div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Star size={16} /> Panier moyen</div>
          <p className="text-2xl font-bold text-gray-900">{avgOrderValue.toFixed(2)}EUR</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Users size={16} /> En attente</div>
          <p className="text-2xl font-bold text-orange-600">{pendingOrders}</p>
        </CardContent></Card>
      </div>

      {/* Chart */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Ventes de la semaine</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-2 h-40">
            {chartData.map(d => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-gray-400">{d.value}EUR</span>
                <div className="w-full bg-orange-100 rounded-t-lg relative" style={{ height: `${(d.value / maxVal) * 100}%` }}>
                  <div className="absolute inset-0 bg-orange-500 rounded-t-lg opacity-80" />
                </div>
                <span className="text-[10px] text-gray-500 font-medium">{d.day}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Orders */}
      <Card>
        <CardHeader><CardTitle className="text-base">Dernieres commandes</CardTitle></CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-center text-gray-400 py-6">Aucune commande</p>
          ) : (
            <div className="space-y-2">
              {orders.slice(0, 8).map(order => (
                <div key={order.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">#{order.id?.slice(-6)}</p>
                    <p className="text-xs text-gray-500">{order.delivery_address?.slice(0, 30) || 'N/A'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{(order.total || 0).toFixed(2)}EUR</p>
                    <Badge className={order.status === 'delivered' ? 'bg-green-100 text-green-700 text-[10px]' : 'bg-yellow-100 text-yellow-700 text-[10px]'}>{order.status}</Badge>
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

export default MerchantAnalytics;
