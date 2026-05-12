import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Users, Car, Storefront, TrendUp, ArrowRight, Taxi, Package, Wrench,
  CurrencyEur, Star, ChartLine, CalendarCheck, Clock, MapPin, Trophy,
  Bell, CheckCircle, XCircle, Warning, Eye, Gear, UserCircle
} from '@phosphor-icons/react';
import { AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import LeafletMap from '../../components/LeafletMap';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ users: 0, drivers: 0, rides: 0, orders: 0, merchants: 0 });
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [godsViewTab, setGodsViewTab] = useState('rides');
  const [earningsTab, setEarningsTab] = useState('today');
  const [period, setPeriod] = useState('today');

  const load = useCallback(async () => {
    try {
      const [sRes, aRes] = await Promise.allSettled([
        fetch(`${API}/api/admin/stats`, { credentials: 'include' }),
        fetch(`${API}/api/admin/analytics`, { credentials: 'include' }),
      ]);
      if (sRes.status === 'fulfilled' && sRes.value.ok) setStats(await sRes.value.json());
      if (aRes.status === 'fulfilled' && aRes.value.ok) setAnalytics(await aRes.value.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const driverStatuses = [
    { label: 'Available', count: analytics?.drivers?.active || 0, color: 'bg-green-100', dot: 'bg-green-500' },
    { label: 'Not Available', count: (analytics?.drivers?.total || 0) - (analytics?.drivers?.active || 0), color: 'bg-red-100', dot: 'bg-red-500' },
    { label: 'Way to Pickup', count: 0, color: 'bg-blue-100', dot: 'bg-blue-500' },
    { label: 'Arrived', count: 0, color: 'bg-orange-100', dot: 'bg-orange-500' },
    { label: 'Way to Dropoff', count: analytics?.ride_status?.in_progress || 0, color: 'bg-purple-100', dot: 'bg-purple-500' },
  ];

  const rideDonut = [
    { name: 'In Process', value: analytics?.ride_status?.in_progress || 0, color: '#22C55E' },
    { name: 'Completed', value: analytics?.ride_status?.completed || 0, color: '#3B82F6' },
    { name: 'Cancelled', value: analytics?.ride_status?.cancelled || 0, color: '#EF4444' },
  ];
  const totalRides = rideDonut.reduce((s, d) => s + d.value, 0);

  const earningsData = [
    { time: '6am', earning: 0, outstanding: 0 }, { time: '7am', earning: 2, outstanding: 0 },
    { time: '8am', earning: 5, outstanding: 1 }, { time: '9am', earning: 8, outstanding: 2 },
    { time: '10am', earning: 12, outstanding: 3 }, { time: '11am', earning: 15, outstanding: 2 },
    { time: '12pm', earning: 18, outstanding: 1 }, { time: '1pm', earning: 25, outstanding: 2 },
    { time: '2pm', earning: 35, outstanding: 3 }, { time: '3pm', earning: 42, outstanding: 2 },
    { time: '4pm', earning: 55, outstanding: 4 }, { time: '5pm', earning: analytics?.earnings?.total || 66.8, outstanding: 3 },
  ];

  const notifications = [
    { user: 'felicia angliviel', action: 'PERMIS DE CONDUIRE VE...', time: '14 Hours ago' },
    { user: 'felicia angliviel', action: "CARTE D'IDENTITE VERSO...", time: '14 Hours ago' },
    { user: 'felicia angliviel', action: "CARTE D'IDENTITE RECT...", time: '14 Hours ago' },
    { user: 'felicia angliviel', action: 'PHOTO AVANT PLAQUE V...', time: '14 Hours ago' },
    { user: 'felicia angliviel', action: 'CARTE GRISE uploaded ...', time: '14 Hours ago' },
  ];

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(t); }, []);

  const contactRequests = [
    { user: 'denver sv', message: 'Je risque de porter plai...', time: '1 Day ago' },
    { user: 'denver sv', message: "L'application qui a un b...", time: '1 Day ago' },
    { user: 'denver sv', message: "Vous vous etes trompe,...", time: '1 Day ago' },
    { user: 'Remy Latouchent', message: 'Je voudai encaisser mo...', time: '1 Day ago' },
    { user: 'Allan Narcissot', message: 'Je souhaite recuperer l...', time: '1 Day ago' },
  ];

  if (loading) return (
    <div className="p-6"><div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {[1,2,3,4,5].map(i => <div key={i} className="bg-white rounded-xl p-5 animate-pulse border border-gray-100"><div className="h-4 bg-gray-200 rounded w-1/2 mb-3"/><div className="h-8 bg-gray-200 rounded w-1/3"/></div>)}
    </div></div>
  );

  return (
    <div className="p-5 space-y-5 bg-[#f8f9fb]" data-testid="admin-dashboard">
      {/* Header with Time & Zone */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Vue d'ensemble de la plateforme SB Drive VTC</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right bg-white border border-gray-200 rounded-xl px-4 py-2" data-testid="live-clock-card">
            <p className="text-lg font-bold text-gray-900 tabular-nums" data-testid="live-clock">
              {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className="text-xs text-gray-500">
              {currentTime.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <p className="text-[10px] text-blue-500 font-medium">
              {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </p>
          </div>
          <div className="flex gap-1 bg-white rounded-lg p-1 border border-gray-200">
            {['today', 'week', 'month'].map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${period === p ? 'bg-[#3b82f6] text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                data-testid={`period-${p}`}>
                {p === 'today' ? "Aujourd'hui" : p === 'week' ? 'Semaine' : 'Mois'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard icon={Users} label="Utilisateurs" value={stats.users} color="#3B82F6" onClick={() => navigate('/admin/users')} />
        <KPICard icon={Car} label="Chauffeurs" value={stats.drivers} color="#10B981" onClick={() => navigate('/admin/drivers')} />
        <KPICard icon={Taxi} label="Courses" value={stats.rides} color="#F59E0B" onClick={() => navigate('/admin/rides')} />
        <KPICard icon={Package} label="Commandes" value={stats.orders} color="#8B5CF6" onClick={() => navigate('/admin/parcels')} />
        <KPICard icon={Storefront} label="Marchands" value={stats.merchants} color="#EC4899" onClick={() => navigate('/admin/stores')} />
      </div>

      {/* V3Cube Service Cards Row: On Demand Services + Video Consult + Delivery Genie/Runner */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ServiceMiniCard
          title="Services à la demande"
          subtitle="Total Trips / Parcel Deliveries"
          stat1={{ label: 'Total Trips', value: analytics?.completed_rides_count || stats.rides || 0, icon: Taxi, color: '#3B82F6' }}
          stat2={{ label: 'Total Parcel Deliveries', value: stats.orders || 0, icon: Package, color: '#8B5CF6' }}
          tabs={['today', 'total']}
          onView={() => navigate('/admin/rides')}
          testId="on-demand-services-card"
        />
        <ServiceMiniCard
          title="Consultation Vidéo"
          subtitle="Sessions Médicales"
          stat1={{ label: 'Consultations', value: 0, icon: ChartLine, color: '#10B981' }}
          stat2={{ label: 'Terminées', value: 0, icon: CheckCircle, color: '#3B82F6' }}
          tabs={['today', 'total']}
          onView={() => navigate('/admin/video')}
          testId="video-consult-card"
        />
        <ServiceMiniCard
          title="Delivery Genie / Runner"
          subtitle="Coursiers express"
          stat1={{ label: 'Runner', value: 0, icon: Wrench, color: '#F59E0B' }}
          stat2={{ label: 'Genie', value: 0, icon: Package, color: '#EC4899' }}
          tabs={['today', 'total']}
          onView={() => navigate('/admin/runner')}
          testId="genie-runner-card"
        />
      </div>

      {/* V3Cube Commerce Row: Buy Sell Rent + Store Deliveries + Ride Share */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <BuySellRentCard onView={() => navigate('/admin/marketplace')} />
        <ServiceMiniCard
          title="Livraisons Boutiques"
          subtitle="No. of orders"
          stat1={{ label: 'Total Orders', value: stats.orders || 0, icon: Storefront, color: '#EF4444' }}
          stat2={{ label: 'Active Stores', value: stats.merchants || 0, icon: Storefront, color: '#10B981' }}
          tabs={['today', 'total']}
          onView={() => navigate('/admin/store-orders')}
          testId="store-deliveries-card"
        />
        <ServiceMiniCard
          title="Covoiturage (Ride Share)"
          subtitle="No. of Rides"
          stat1={{ label: 'En cours', value: analytics?.ride_status?.in_progress || 0, icon: Users, color: '#3B82F6' }}
          stat2={{ label: 'Terminées', value: analytics?.ride_status?.completed || 0, icon: CheckCircle, color: '#10B981' }}
          tabs={['today', 'total']}
          onView={() => navigate('/admin/rideshare')}
          testId="ride-share-card"
        />
      </div>

      {/* God's View + Donut + Recent Rides */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* God's View */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-bold text-gray-800 text-sm">God's View</h2>
              <div className="flex gap-1 ml-auto">
                {['rides', 'deliveries', 'jobs'].map(t => (
                  <button key={t} onClick={() => setGodsViewTab(t)}
                    className={`px-3 py-1 rounded text-[10px] font-semibold ${godsViewTab === t ? 'bg-[#3b82f6] text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {t === 'rides' ? 'Rides' : t === 'deliveries' ? 'Deliveries' : 'Jobs'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {driverStatuses.map(s => (
                <div key={s.label} className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${s.color}`}>
                  <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                  <span className="text-[9px] text-gray-600 whitespace-nowrap">{s.label}</span>
                  <span className="text-[10px] font-bold text-gray-800">({s.count})</span>
                </div>
              ))}
            </div>
          </div>
          <div className="h-[220px]">
            <LeafletMap
              center={{ lat: 14.6161, lng: -61.0588 }}
              zoom={11}
              heatPoints={[
                { lat: 14.6161, lng: -61.0588, count: 3 },
                { lat: 14.605, lng: -61.07, count: 2 },
                { lat: 14.625, lng: -61.045, count: 1 },
              ]}
            />
          </div>
        </div>

        {/* Donut Chart - Ride Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={rideDonut} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={2} dataKey="value">
                {rideDonut.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="text-center -mt-4 mb-3">
            <p className="text-gray-500 text-xs">Total</p>
            <p className="text-3xl font-bold text-gray-900">{totalRides}</p>
          </div>
          <div className="flex justify-center gap-4">
            {rideDonut.map(d => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-[10px] text-gray-600">{d.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Rides */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800 text-sm">Recent Rides</h3>
            <Button size="sm" className="bg-green-500 text-white text-[10px] h-7" onClick={() => navigate('/admin/rides')}>View All</Button>
          </div>
          <p className="text-xs text-gray-500 mb-3">{analytics?.ride_status?.in_progress || 0} Rides in progress</p>
          <div className="space-y-3 max-h-[280px] overflow-y-auto">
            {(analytics?.recent_rides || []).map((ride, i) => (
              <div key={ride.id || i} className="border border-gray-100 rounded-xl p-3" data-testid={`recent-ride-${i}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-800">Booking ID</span>
                  <Badge className={ride.status === 'completed' ? 'bg-green-100 text-green-700 text-[10px]' : ride.status === 'cancelled' ? 'bg-red-100 text-red-700 text-[10px]' : 'bg-blue-100 text-blue-700 text-[10px]'}>
                    {ride.status === 'completed' ? 'Completed' : ride.status === 'cancelled' ? 'Cancelled' : ride.status}
                  </Badge>
                </div>
                <p className="font-bold text-gray-900 text-sm">#{ride.id?.slice(-10)}</p>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <UserCircle size={14} className="text-blue-500" />
                    <div><p className="text-gray-400 text-[9px]">User Name</p><p className="text-gray-800 font-medium truncate">{ride.user_name || 'Client'}</p></div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Car size={14} className="text-orange-500" />
                    <div><p className="text-gray-400 text-[9px]">Service Type</p><p className="text-gray-800 font-medium capitalize">{ride.vehicle_type || 'Ride'}</p></div>
                  </div>
                </div>
              </div>
            ))}
            {(!analytics?.recent_rides || analytics.recent_rides.length === 0) && <p className="text-center text-gray-400 text-xs py-6">Aucune course recente</p>}
          </div>
        </div>
      </div>

      {/* Admin Earnings + Scheduled Bookings */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Admin Earnings Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800 text-base">Admin Earnings</h3>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              {['today', 'total'].map(t => (
                <button key={t} onClick={() => setEarningsTab(t)}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold ${earningsTab === t ? 'bg-[#3b82f6] text-white' : 'text-gray-500'}`}>
                  {t === 'today' ? 'Today' : 'Total'}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={earningsData}>
              <defs>
                <linearGradient id="earnGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '11px' }} />
              <Area type="monotone" dataKey="earning" stroke="#3B82F6" strokeWidth={2} fill="url(#earnGrad)" name="Total Earning" />
              <Area type="monotone" dataKey="outstanding" stroke="#F59E0B" strokeWidth={1} fill="none" name="Outstanding" />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <EarningBox icon="💰" label="Total Earning" sublabel="Total earned Amount." value={`${analytics?.earnings?.total || 0}`} color="text-green-600" />
            <EarningBox icon="⏳" label="Outstanding" sublabel="Pending from providers." value={`${analytics?.earnings?.outstanding || 0}`} color="text-amber-600" />
            <EarningBox icon="🏢" label="Org. Outstanding" sublabel="Pending from organization." value={`${analytics?.earnings?.org_outstanding || 0} EUR`} color="text-red-500" />
          </div>
        </div>

        {/* Scheduled Bookings */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800 text-base">Scheduled Bookings</h3>
            <Button size="sm" className="bg-green-500 text-white text-[10px] h-7" onClick={() => navigate('/admin/later-bookings')}>View All</Button>
          </div>
          <div className="space-y-3 max-h-[340px] overflow-y-auto">
            {(analytics?.scheduled_bookings || []).length === 0 ? (
              <p className="text-center text-gray-400 text-xs py-8">Aucune reservation programmee</p>
            ) : (
              (analytics?.scheduled_bookings || []).map((b, i) => (
                <div key={b.id || i} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-[10px] text-gray-400">Booking ID</p>
                      <p className="font-bold text-gray-900">#{b.id?.slice(-10)}</p>
                    </div>
                    <Button size="sm" className="bg-green-100 text-green-700 text-[10px] h-6">Assign</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><p className="text-gray-400 text-[9px]">Service Type</p><p className="text-gray-800 font-medium capitalize">{b.vehicle_type || 'Ride'}</p></div>
                    <div><p className="text-gray-400 text-[9px]">Date</p><p className="text-gray-800 font-medium">{b.scheduled_at ? new Date(b.scheduled_at).toLocaleDateString('fr-FR') : '-'}</p></div>
                  </div>
                  {b.pickup_address && (
                    <div className="flex items-start gap-1.5 mt-2">
                      <MapPin size={12} className="text-red-500 mt-0.5 flex-shrink-0" />
                      <p className="text-[10px] text-gray-500 truncate">{b.pickup_address}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Server Statistics + Notification Alerts + Contact Requests */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Server Statistics */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800 text-base">Server Statistics</h3>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate('/admin/monitoring')}>View</Button>
          </div>
          <p className="text-xs text-gray-500 mb-4">Last Updated: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} AT {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <CheckCircle size={24} className="text-green-500" weight="fill" />
                <span className="text-sm text-gray-700">Working</span>
              </div>
              <span className="text-lg font-bold text-green-600">8</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <XCircle size={24} className="text-red-500" weight="fill" />
                <span className="text-sm text-gray-700">Errors</span>
              </div>
              <span className="text-lg font-bold text-red-600">2</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Warning size={24} className="text-amber-500" weight="fill" />
                <span className="text-sm text-gray-700">Alerts</span>
              </div>
              <span className="text-lg font-bold text-amber-600">0</span>
            </div>
          </div>
          <div className="flex justify-center gap-6 mt-4 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green-500" /><span className="text-[10px] text-gray-500">Working</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><span className="text-[10px] text-gray-500">Errors</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-500" /><span className="text-[10px] text-gray-500">Alerts</span></div>
          </div>
        </div>

        {/* Notification Alerts Panel */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800 text-base">Notification Alerts Panel</h3>
            <Button size="sm" className="bg-green-500 text-white text-[10px] h-7">View All</Button>
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {notifications.map((n, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <Bell size={18} className="text-amber-500" weight="fill" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{n.user}</p>
                  <p className="text-xs text-gray-500 truncate">{n.action}</p>
                </div>
                <span className="text-xs font-bold text-red-500 whitespace-nowrap flex-shrink-0">{n.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Contact Us Form Requests */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-gray-800 text-base">Contact Us Form</h3>
              <p className="text-xs text-gray-500">Requests</p>
            </div>
            <Button size="sm" className="bg-green-500 text-white text-[10px] h-7" onClick={() => navigate('/admin/support')}>View All</Button>
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {contactRequests.map((c, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <Bell size={18} className="text-amber-500" weight="fill" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{c.user}</p>
                  <p className="text-xs text-gray-500 truncate">{c.message}</p>
                </div>
                <span className="text-xs font-bold text-red-500 whitespace-nowrap flex-shrink-0">{c.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const KPICard = ({ icon: Icon, label, value, color, onClick }) => (
  <button onClick={onClick} className="bg-white rounded-xl border border-gray-100 p-4 text-left hover:shadow-md transition-all group" data-testid={`kpi-${label.toLowerCase()}`}>
    <div className="flex items-center justify-between mb-2">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '12' }}>
        <Icon size={20} style={{ color }} weight="duotone" />
      </div>
      <div className="flex items-center gap-0.5 text-xs font-medium text-green-600">
        <TrendUp size={12} /> +12%
      </div>
    </div>
    <p className="text-2xl font-bold text-gray-900">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
  </button>
);

const EarningBox = ({ icon, label, sublabel, value, color }) => (
  <div className="bg-gray-50 rounded-xl p-3">
    <div className="flex items-center gap-2 mb-1">
      <span className="text-lg">{icon}</span>
      <div>
        <p className="text-xs font-bold text-gray-800">{label}</p>
        <p className="text-[9px] text-gray-400">{sublabel}</p>
      </div>
    </div>
    <p className={`text-lg font-bold ${color} text-right`}>{value}</p>
  </div>
);

const ServiceMiniCard = ({ title, subtitle, stat1, stat2, tabs = [], onView, testId }) => {
  const [tab, setTab] = useState(tabs[0] || 'total');
  const Icon1 = stat1.icon, Icon2 = stat2.icon;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4" data-testid={testId}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
          <p className="text-[10px] text-gray-400">{subtitle}</p>
        </div>
        {tabs.length > 0 && (
          <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-2.5 py-1 rounded text-[10px] font-semibold capitalize ${tab === t ? 'bg-[#3b82f6] text-white' : 'text-gray-500'}`}>
                {t === 'today' ? "Aujourd'hui" : 'Total'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[stat1, stat2].map((s, i) => {
          const Ic = i === 0 ? Icon1 : Icon2;
          return (
            <div key={i} className="bg-gray-50 rounded-lg p-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ backgroundColor: s.color + '20' }}>
                <Ic size={16} style={{ color: s.color }} weight="fill" />
              </div>
              <p className="text-xl font-bold text-gray-900 tabular-nums">{s.value}</p>
              <p className="text-[10px] text-gray-500 leading-tight">{s.label}</p>
            </div>
          );
        })}
      </div>
      {onView && (
        <button onClick={onView} className="w-full mt-3 text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center justify-center gap-1" data-testid={`${testId}-view-all`}>
          Voir tout <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
};

const BuySellRentCard = ({ onView }) => {
  const [tab, setTab] = useState('total');
  const cats = [
    { key: 'cars', label: 'Voitures', icon: Car, color: '#3B82F6' },
    { key: 'items', label: 'Objets généraux', icon: Package, color: '#F59E0B' },
    { key: 'realestate', label: 'Immobilier', icon: Storefront, color: '#EC4899' },
  ];
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4" data-testid="buy-sell-rent-card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-gray-800 text-sm">Acheter, Vendre & Louer</h3>
          <p className="text-[10px] text-gray-400">No. of posts</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
          {['today', 'total'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold ${tab === t ? 'bg-[#3b82f6] text-white' : 'text-gray-500'}`}>
              {t === 'today' ? "Aujourd'hui" : 'Total'}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {cats.map(c => {
          const Ic = c.icon;
          return (
            <div key={c.key} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: c.color + '20' }}>
                  <Ic size={14} style={{ color: c.color }} weight="fill" />
                </div>
                <span className="text-xs text-gray-700">{c.label}</span>
              </div>
              <span className="text-sm font-bold text-gray-900">0</span>
            </div>
          );
        })}
      </div>
      <button onClick={onView} className="w-full mt-3 text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center justify-center gap-1" data-testid="buy-sell-rent-view-all">
        Voir tout <ArrowRight size={12} />
      </button>
    </div>
  );
};



export default AdminDashboard;
