import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { rideAPI, orderAPI } from '../../services/api';
import { Button } from '../../components/ui/button';
import {
  ArrowLeft, Car, Package, Clock, CheckCircle,
  X, Star, MapPin, CaretRight, Funnel
} from '@phosphor-icons/react';

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-orange-100 text-orange-700',
  arriving: 'bg-orange-100 text-orange-700',
  in_progress: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  preparing: 'bg-orange-100 text-orange-700',
  delivered: 'bg-green-100 text-green-700',
};

const STATUS_LABELS = {
  pending: 'En attente',
  accepted: 'Acceptee',
  arriving: 'En approche',
  in_progress: 'En cours',
  completed: 'Terminee',
  cancelled: 'Annulee',
  preparing: 'En preparation',
  delivered: 'Livree',
};

const HistoryPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('rides');
  const [rides, setRides] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ridesRes, ordersRes] = await Promise.all([
        rideAPI.list(),
        orderAPI.list().catch(() => ({ data: [] })),
      ]);
      setRides(ridesRes.data || []);
      setOrders(ordersRes.data || []);
    } catch { /* empty */ } finally { setLoading(false); }
  };

  const filteredRides = filter === 'all' ? rides : rides.filter(r => r.status === filter);
  const filteredOrders = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  return (
    <div className="mobile-container bg-gray-50 min-h-screen pb-20" data-testid="history-page">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b">
        <div className="p-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1" data-testid="history-back-btn">
            <ArrowLeft size={22} className="text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Historique</h1>
        </div>
        {/* Tabs */}
        <div className="flex px-4 gap-1 pb-2">
          {[
            { key: 'rides', label: 'Courses', icon: Car },
            { key: 'orders', label: 'Commandes', icon: Package },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setFilter('all'); }}
              className={`flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === tab.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
              }`}
              data-testid={`tab-${tab.key}`}
            >
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>
        {/* Filters */}
        <div className="flex px-4 gap-1 pb-3 overflow-x-auto">
          {['all', 'completed', 'cancelled', 'pending'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f ? 'bg-[#FF4500] text-white' : 'bg-gray-100 text-gray-600'
              }`}
              data-testid={`filter-${f}`}
            >
              {f === 'all' ? 'Tous' : STATUS_LABELS[f] || f}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
                <div className="flex gap-3"><div className="w-12 h-12 bg-gray-200 rounded-xl" /><div className="flex-1 space-y-2"><div className="h-4 bg-gray-200 rounded w-2/3" /><div className="h-3 bg-gray-200 rounded w-1/2" /></div></div>
              </div>
            ))}
          </div>
        ) : activeTab === 'rides' ? (
          filteredRides.length === 0 ? (
            <div className="text-center py-12" data-testid="no-rides">
              <Car size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="text-gray-400">Aucune course</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRides.map((ride, i) => (
                <button
                  key={ride.id}
                  onClick={() => navigate(`/ride/${ride.id}`)}
                  className="w-full bg-white rounded-2xl p-4 text-left hover:shadow-sm transition-shadow"
                  data-testid={`ride-item-${i}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Car size={20} className="text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-gray-900 text-sm capitalize">{ride.vehicle_type}</p>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[ride.status] || 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABELS[ride.status] || ride.status}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                          <p className="text-xs text-gray-500 truncate">{ride.pickup_address}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                          <p className="text-xs text-gray-500 truncate">{ride.dropoff_address}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[10px] text-gray-400">
                          {new Date(ride.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="font-bold text-sm text-gray-900">
                          {(ride.final_fare || ride.estimated_fare)?.toFixed(2)} EUR
                        </p>
                      </div>
                    </div>
                    <CaretRight size={16} className="text-gray-400 mt-3 flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )
        ) : (
          filteredOrders.length === 0 ? (
            <div className="text-center py-12" data-testid="no-orders">
              <Package size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="text-gray-400">Aucune commande</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order, i) => (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl p-4"
                  data-testid={`order-item-${i}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                      <Package size={20} className="text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-gray-900 text-sm">{order.merchant_name || 'Commande'}</p>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{order.delivery_address}</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[10px] text-gray-400">
                          {new Date(order.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="font-bold text-sm text-gray-900">{order.total?.toFixed(2)} EUR</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default HistoryPage;
