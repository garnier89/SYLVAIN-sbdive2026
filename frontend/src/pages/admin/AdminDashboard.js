import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import {
  Users, Car, Storefront, MapPin, TrendUp, ArrowRight,
  Taxi, Package, Wrench, Eye
} from '@phosphor-icons/react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [godsViewTab, setGodsViewTab] = useState('rides');
  const [servicesTab, setServicesTab] = useState('total');

  useEffect(() => { loadDashboard(); }, []);
  const loadDashboard = async () => {
    try { const r = await adminAPI.dashboard(); setStats(r.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return (
    <div className="p-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="bg-white rounded-lg p-6 animate-pulse"><div className="h-4 bg-gray-200 rounded w-1/2 mb-3"/><div className="h-8 bg-gray-200 rounded w-1/3"/></div>)}
      </div>
    </div>
  );

  const driverStatuses = [
    { label: 'Available', count: stats?.active_drivers || 0, color: 'bg-green-100', icon: '🟢' },
    { label: 'Not Available', count: (stats?.total_drivers || 0) - (stats?.active_drivers || 0), color: 'bg-red-100', icon: '🔴' },
    { label: 'Way to Pickup', count: 0, color: 'bg-blue-100', icon: '🔵' },
    { label: 'Arrived / Reached Pickup', count: 0, color: 'bg-orange-100', icon: '🟠' },
    { label: 'Way to Dropoff', count: 0, color: 'bg-purple-100', icon: '🟣' },
  ];

  return (
    <div className="p-5 space-y-5" data-testid="admin-dashboard">
      {/* God's View + KPI Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* God's View */}
        <div className="xl:col-span-2 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-800 text-base">God's View</h2>
              <div className="flex gap-1 ml-4">
                {['rides', 'deliveries', 'jobs'].map(t => (
                  <button key={t} onClick={() => setGodsViewTab(t)}
                    className={`px-4 py-1.5 rounded text-xs font-semibold transition-all ${
                      godsViewTab === t ? 'bg-[#3b82f6] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    data-testid={`gods-view-${t}`}>
                    {t === 'rides' ? 'Rides' : t === 'deliveries' ? 'Deliveries' : 'Jobs'}
                  </button>
                ))}
              </div>
            </div>
            {/* Driver Status Cards */}
            <div className="flex gap-3 mt-3 overflow-x-auto pb-1">
              {driverStatuses.map((s) => (
                <div key={s.label} className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-lg ${s.color} min-w-[80px]`}>
                  <span className="text-lg">{s.icon}</span>
                  <span className="text-[10px] text-gray-600 text-center leading-tight">{s.label}</span>
                  <span className="text-xs font-bold text-gray-800">({s.count})</span>
                </div>
              ))}
            </div>
          </div>
          {/* Map */}
          <div className="h-[300px]">
            <MapContainer center={[48.8566, 2.3522]} zoom={12} className="w-full h-full" zoomControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
            </MapContainer>
          </div>
        </div>

        {/* KPI Cards (Right Side) */}
        <div className="space-y-4">
          {/* Users / Providers / Stores */}
          <div className="grid grid-cols-3 gap-3">
            <KPICard icon={Users} label="Users" value={stats?.total_users || 0} color="text-blue-600" onClick={() => navigate('/admin/users')} />
            <KPICard icon={Car} label="Service Providers" value={stats?.total_drivers || 0} color="text-orange-500" onClick={() => navigate('/admin/drivers')} />
            <KPICard icon={Storefront} label="Stores" value="155" color="text-red-500" onClick={() => navigate('/admin/stores')} />
          </div>

          {/* On Demand Services */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800 text-sm">On Demand Services</h3>
              <div className="flex gap-1">
                {['today', 'total'].map(t => (
                  <button key={t} onClick={() => setServicesTab(t)}
                    className={`px-3 py-1 rounded text-[11px] font-semibold transition-all ${
                      servicesTab === t ? 'bg-[#3b82f6] text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {t === 'today' ? 'Today' : 'Total'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <ServiceRow icon={Taxi} label="Total Trips" value={stats?.today_rides || 0} color="bg-blue-50" onClick={() => navigate('/admin/rides')} />
              <ServiceRow icon={Package} label="Total Parcel Deliveries" value={0} color="bg-orange-50" />
              <ServiceRow icon={Wrench} label="Total On Demand Jobs" value={0} color="bg-yellow-50" />
            </div>
          </div>

          {/* Revenue Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Revenue Today</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{(stats?.today_revenue || 0).toFixed(2)} &euro;</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendUp size={14} className="text-green-500" />
              <span className="text-green-500 text-xs font-medium">+12%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Approvals */}
      {stats?.pending_drivers > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Car size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-amber-800 text-sm">{stats.pending_drivers} chauffeur(s) en attente d'approbation</p>
              <p className="text-amber-600 text-xs">Cliquez pour examiner et approuver</p>
            </div>
          </div>
          <button onClick={() => navigate('/admin/drivers')}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors flex items-center gap-1"
            data-testid="go-drivers-btn">
            View All <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

const KPICard = ({ icon: Icon, label, value, color, onClick }) => (
  <button onClick={onClick} className="bg-white rounded-lg border border-gray-200 p-4 text-center hover:shadow-md transition-all group" data-testid={`kpi-${label.toLowerCase()}`}>
    <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
      <Icon size={24} className={color} weight="duotone" />
    </div>
    <p className={`font-bold text-sm ${color}`}>{label}</p>
    <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
  </button>
);

const ServiceRow = ({ icon: Icon, label, value, color, onClick }) => (
  <div className={`flex items-center gap-3 p-3 rounded-lg ${color} cursor-pointer hover:opacity-80 transition-opacity`} onClick={onClick}>
    <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shadow-sm">
      <Icon size={18} className="text-gray-600" />
    </div>
    <span className="flex-1 text-sm font-medium text-gray-700">{label}</span>
    <span className="text-lg font-bold text-[#3b82f6]">{value}</span>
    <button className="px-2.5 py-1 bg-green-500 text-white text-[10px] font-bold rounded hover:bg-green-600 transition-colors">View All</button>
  </div>
);

export default AdminDashboard;
