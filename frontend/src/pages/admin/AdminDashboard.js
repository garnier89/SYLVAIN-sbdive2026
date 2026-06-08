import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Car, Storefront, Taxi, Package } from '@phosphor-icons/react';
import { KPICard } from './dashboard/DashboardCards';
import DashboardHeader from './dashboard/DashboardHeader';
import DashboardServiceCards from './dashboard/DashboardServiceCards';
import GodsViewPanel from './dashboard/GodsViewPanel';
import EarningsScheduledPanel from './dashboard/EarningsScheduledPanel';
import DashboardDeliveryCharts from './dashboard/DashboardDeliveryCharts';
import DashboardBreakdown from './dashboard/DashboardBreakdown';
import DashboardServerPanels from './dashboard/DashboardServerPanels';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ users: 0, drivers: 0, rides: 0, orders: 0, merchants: 0 });
  const [analytics, setAnalytics] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [godsViewTab, setGodsViewTab] = useState('rides');
  const [earningsTab, setEarningsTab] = useState('today');
  const [period, setPeriod] = useState('today');
  const [currentTime, setCurrentTime] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const [sRes, aRes, dRes] = await Promise.allSettled([
        fetch(`${API}/api/admin/stats`, { credentials: 'include' }),
        fetch(`${API}/api/admin/analytics`, { credentials: 'include' }),
        fetch(`${API}/api/admin/analytics/delivery-monthly`, { credentials: 'include' }),
      ]);
      if (sRes.status === 'fulfilled' && sRes.value.ok) setStats(await sRes.value.json());
      if (aRes.status === 'fulfilled' && aRes.value.ok) setAnalytics(await aRes.value.json());
      if (dRes.status === 'fulfilled' && dRes.value.ok) setDelivery(await dRes.value.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Breakdown (Revenus par service + Top zones) refetch on period change
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API}/api/admin/analytics/breakdown?period=${period}`, { credentials: 'include' });
        if (active && res.ok) setBreakdown(await res.json());
      } catch (err) { console.error(err); }
    })();
    return () => { active = false; };
  }, [period]);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (loading) return (
    <div className="p-6"><div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {[1, 2, 3, 4, 5].map((i) => <div key={i} className="bg-white rounded-xl p-5 animate-pulse border border-gray-100"><div className="h-4 bg-gray-200 rounded w-1/2 mb-3" /><div className="h-8 bg-gray-200 rounded w-1/3" /></div>)}
    </div></div>
  );

  return (
    <div className="p-5 space-y-5 bg-[#f8f9fb]" data-testid="admin-dashboard">
      <DashboardHeader currentTime={currentTime} period={period} setPeriod={setPeriod} breakdown={breakdown} />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard icon={Users} label="Utilisateurs" value={stats.users} color="#3B82F6" onClick={() => navigate('/admin/users')} />
        <KPICard icon={Car} label="Chauffeurs" value={stats.drivers} color="#10B981" onClick={() => navigate('/admin/drivers')} />
        <KPICard icon={Taxi} label="Courses" value={stats.rides} color="#F59E0B" onClick={() => navigate('/admin/rides')} />
        <KPICard icon={Package} label="Commandes" value={stats.orders} color="#8B5CF6" onClick={() => navigate('/admin/parcels')} />
        <KPICard icon={Storefront} label="Marchands" value={stats.merchants} color="#EC4899" onClick={() => navigate('/admin/stores')} />
      </div>

      <DashboardServiceCards stats={stats} analytics={analytics} navigate={navigate} />

      <GodsViewPanel analytics={analytics} godsViewTab={godsViewTab} setGodsViewTab={setGodsViewTab} navigate={navigate} />

      <EarningsScheduledPanel analytics={analytics} earningsTab={earningsTab} setEarningsTab={setEarningsTab} navigate={navigate} />

      {/* Delivery analytics — Store Deliveries + Delivery Genie / Runner */}
      <DashboardDeliveryCharts delivery={delivery} />

      {/* Revenus par service + Top zones/villes — données réelles V3Cube pilotage */}
      <DashboardBreakdown breakdown={breakdown} period={period} />

      {/* Server Statistics + Notification Alerts + Contact Requests */}
      <DashboardServerPanels navigate={navigate} />
    </div>
  );
};

export default AdminDashboard;
