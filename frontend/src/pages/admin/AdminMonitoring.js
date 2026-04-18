import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Activity, Users, Car, Package, CurrencyEur, TrendUp, Clock, Warning } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminMonitoring = () => {
  const [stats, setStats] = useState({ users: 0, drivers: 0, rides: 0, orders: 0, merchants: 0 });
  const [liveRides, setLiveRides] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [sRes, rRes] = await Promise.allSettled([
        fetch(`${API}/api/admin/stats`, { credentials: 'include' }),
        fetch(`${API}/api/rides?limit=10&status=in_progress`, { credentials: 'include' }),
      ]);
      if (sRes.status === 'fulfilled' && sRes.value.ok) setStats(await sRes.value.json());
      if (rRes.status === 'fulfilled' && rRes.value.ok) {
        const d = await rRes.value.json();
        setLiveRides(Array.isArray(d) ? d : d.rides || []);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, [load]);

  const kpis = [
    { label: 'Utilisateurs', value: stats.users, icon: Users, color: '#3B82F6' },
    { label: 'Chauffeurs', value: stats.drivers, icon: Car, color: '#10B981' },
    { label: 'Courses totales', value: stats.rides, icon: TrendUp, color: '#F59E0B' },
    { label: 'Commandes', value: stats.orders, icon: Package, color: '#8B5CF6' },
    { label: 'Marchands', value: stats.merchants, icon: CurrencyEur, color: '#EC4899' },
  ];

  return (
    <div className="p-6" data-testid="admin-monitoring">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Monitoring en temps reel</h1>
          <p className="text-sm text-gray-500 mt-1">Actualisation automatique toutes les 15s</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-600 font-medium">En direct</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <Card key={k.label}><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: k.color + '15' }}>
                  <Icon size={16} style={{ color: k.color }} />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{k.value}</p>
              <p className="text-xs text-gray-500">{k.label}</p>
            </CardContent></Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-bold text-gray-800 mb-3">Courses en cours ({liveRides.length})</h3>
          {liveRides.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Aucune course en cours</p>
          ) : (
            <div className="space-y-2">
              {liveRides.map(ride => (
                <div key={ride.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">#{ride.id?.slice(-6)}</p>
                    <p className="text-xs text-gray-500">{ride.pickup_address?.slice(0, 30)}</p>
                  </div>
                  <Badge className="bg-green-100 text-green-700">{ride.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminMonitoring;
