import React from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Car, UserCircle } from '@phosphor-icons/react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import LeafletMap from '../../../components/LeafletMap';

/** God's View live map + ride-status donut + recent rides list. */
const GodsViewPanel = ({ analytics, godsViewTab, setGodsViewTab, navigate }) => {
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

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      {/* God's View */}
      <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-bold text-gray-800 text-sm">{"God's View"}</h2>
            <div className="flex gap-1 ml-auto">
              {['rides', 'deliveries', 'jobs'].map((t) => (
                <button key={t} onClick={() => setGodsViewTab(t)}
                  className={`px-3 py-1 rounded text-[10px] font-semibold ${godsViewTab === t ? 'bg-[#3b82f6] text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {t === 'rides' ? 'Rides' : t === 'deliveries' ? 'Deliveries' : 'Jobs'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {driverStatuses.map((s) => (
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
              {rideDonut.map((entry) => <Cell key={entry.name || entry.color} fill={entry.color} />)}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="text-center -mt-4 mb-3">
          <p className="text-gray-500 text-xs">Total</p>
          <p className="text-3xl font-bold text-gray-900">{totalRides}</p>
        </div>
        <div className="flex justify-center gap-4">
          {rideDonut.map((d) => (
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
  );
};

export default GodsViewPanel;
