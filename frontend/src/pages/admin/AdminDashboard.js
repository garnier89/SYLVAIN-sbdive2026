import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import {
  Users, Car, Storefront, TrendUp, TrendDown, ArrowRight,
  Taxi, Package, Wrench, CurrencyEur, Star, ChartLine,
  CalendarCheck, Clock, MapPin, Trophy, Bell
} from '@phosphor-icons/react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';

const API = process.env.REACT_APP_BACKEND_URL;
const GMAP_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ users: 0, drivers: 0, rides: 0, orders: 0, merchants: 0 });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');
  const { isLoaded: gmapLoaded } = useJsApiLoader({ googleMapsApiKey: GMAP_KEY || '' });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/stats`, { credentials: 'include' });
      if (res.ok) setStats(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Demo chart data
  const revenueData = [
    { day: 'Lun', revenue: 1250, courses: 42 },
    { day: 'Mar', revenue: 1480, courses: 51 },
    { day: 'Mer', revenue: 1120, courses: 38 },
    { day: 'Jeu', revenue: 1680, courses: 56 },
    { day: 'Ven', revenue: 2100, courses: 72 },
    { day: 'Sam', revenue: 2450, courses: 84 },
    { day: 'Dim', revenue: 1890, courses: 65 },
  ];

  const monthlyData = [
    { month: 'Jan', revenue: 28500 }, { month: 'Fev', revenue: 32100 },
    { month: 'Mar', revenue: 35800 }, { month: 'Avr', revenue: 41200 },
  ];

  const serviceBreakdown = [
    { name: 'VTC/Taxi', value: 65, color: '#3B82F6' },
    { name: 'Livraison', value: 20, color: '#10B981' },
    { name: 'Colis', value: 8, color: '#F59E0B' },
    { name: 'Services', value: 7, color: '#8B5CF6' },
  ];

  const topDrivers = [
    { name: 'Jean Dupont', rides: 84, rating: 4.9, earnings: 1250 },
    { name: 'Amadou Diallo', rides: 72, rating: 4.8, earnings: 1080 },
    { name: 'Sophie Martin', rides: 65, rating: 4.9, earnings: 975 },
    { name: 'Mohamed Ben Ali', rides: 58, rating: 4.7, earnings: 870 },
    { name: 'Claire Petit', rides: 51, rating: 4.8, earnings: 765 },
  ];

  const hourlyData = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}h`, courses: Math.floor(Math.random() * 15) + (i >= 7 && i <= 9 ? 12 : i >= 17 && i <= 19 ? 15 : 3),
  }));

  const driverLocations = [
    { lat: 14.6161, lng: -61.0588 }, { lat: 14.6050, lng: -61.0700 },
    { lat: 14.6250, lng: -61.0450 }, { lat: 14.5900, lng: -61.0800 },
  ];

  const totalRevenue = revenueData.reduce((s, d) => s + d.revenue, 0);
  const totalCourses = revenueData.reduce((s, d) => s + d.courses, 0);

  if (loading) return (
    <div className="p-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[1,2,3,4,5].map(i => <div key={i} className="bg-white rounded-xl p-5 animate-pulse border border-gray-100"><div className="h-4 bg-gray-200 rounded w-1/2 mb-3"/><div className="h-8 bg-gray-200 rounded w-1/3"/></div>)}
      </div>
    </div>
  );

  return (
    <div className="p-5 space-y-5 bg-[#f8f9fb]" data-testid="admin-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Vue d'ensemble de la plateforme SB Drive VTC</p>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard icon={Users} label="Utilisateurs" value={stats.users} change="+12%" up color="#3B82F6" onClick={() => navigate('/admin/users')} />
        <KPICard icon={Car} label="Chauffeurs" value={stats.drivers} change="+8%" up color="#10B981" onClick={() => navigate('/admin/drivers')} />
        <KPICard icon={Taxi} label="Courses" value={stats.rides} change="+15%" up color="#F59E0B" onClick={() => navigate('/admin/rides')} />
        <KPICard icon={Package} label="Commandes" value={stats.orders} change="+5%" up color="#8B5CF6" onClick={() => navigate('/admin/parcels')} />
        <KPICard icon={Storefront} label="Marchands" value={stats.merchants} change="+3%" up color="#EC4899" onClick={() => navigate('/admin/stores')} />
      </div>

      {/* Revenue Chart + Service Breakdown */}
      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Revenus & Courses</CardTitle>
              <Badge className="bg-green-100 text-green-700"><TrendUp size={12} className="mr-1" /> +18.5%</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 mb-4">
              <div>
                <p className="text-sm text-gray-500">Revenu total</p>
                <p className="text-2xl font-bold text-gray-900">{totalRevenue.toLocaleString()} EUR</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Courses totales</p>
                <p className="text-2xl font-bold text-[#3b82f6]">{totalCourses}</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                <YAxis tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                <Area type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} fill="url(#colorRevenue)" name="Revenu (EUR)" />
                <Line type="monotone" dataKey="courses" stroke="#10B981" strokeWidth={2} dot={false} name="Courses" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Repartition services</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={serviceBreakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {serviceBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {serviceBreakdown.map(s => (
                <div key={s.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-xs text-gray-600">{s.name}</span>
                  </div>
                  <span className="text-xs font-bold text-gray-800">{s.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hourly Distribution + God's View Map */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Courses par heure (aujourd'hui)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#9CA3AF' }} interval={2} />
                <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                <Bar dataKey="courses" fill="#3B82F6" radius={[3, 3, 0, 0]} name="Courses" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">God's View - Chauffeurs en ligne</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[200px] rounded-xl overflow-hidden">
              {gmapLoaded ? (
                <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }}
                  center={{ lat: 14.6161, lng: -61.0588 }} zoom={12}
                  options={{ disableDefaultUI: true, zoomControl: true }}>
                  {driverLocations.map((loc, i) => (
                    <MarkerF key={i} position={loc} icon={{ url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' }} />
                  ))}
                </GoogleMap>
              ) : (
                <div className="w-full h-full bg-gray-100 flex items-center justify-center rounded-xl">
                  <span className="text-gray-400 text-sm">Chargement carte...</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Revenue + Top Drivers */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Revenus mensuels</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                <YAxis tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} formatter={(v) => [`${v.toLocaleString()} EUR`, 'Revenu']} />
                <Bar dataKey="revenue" fill="#10B981" radius={[6, 6, 0, 0]} name="Revenu" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Top Chauffeurs</CardTitle>
              <button onClick={() => navigate('/admin/drivers')} className="text-xs text-[#3b82f6] hover:underline">Voir tout</button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topDrivers.map((d, i) => (
                <div key={d.name} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                    i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-700' : 'bg-gray-300'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{d.name}</p>
                    <p className="text-xs text-gray-500">{d.rides} courses</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star size={12} weight="fill" className="text-amber-400" />
                    <span className="text-xs font-medium text-gray-700">{d.rating}</span>
                  </div>
                  <span className="text-sm font-bold text-green-600">{d.earnings} EUR</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const KPICard = ({ icon: Icon, label, value, change, up, color, onClick }) => (
  <button onClick={onClick} className="bg-white rounded-xl border border-gray-100 p-4 text-left hover:shadow-md transition-all group" data-testid={`kpi-${label.toLowerCase()}`}>
    <div className="flex items-center justify-between mb-2">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '12' }}>
        <Icon size={20} style={{ color }} weight="duotone" />
      </div>
      <div className={`flex items-center gap-0.5 text-xs font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>
        {up ? <TrendUp size={12} /> : <TrendDown size={12} />} {change}
      </div>
    </div>
    <p className="text-2xl font-bold text-gray-900">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
  </button>
);

export default AdminDashboard;
