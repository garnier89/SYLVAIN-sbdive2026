import React from 'react';
import { Button } from '../../../components/ui/button';
import { MapPin } from '@phosphor-icons/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { EarningBox } from './DashboardCards';

/** Admin earnings area chart + scheduled bookings list. */
const EarningsScheduledPanel = ({ analytics, earningsTab, setEarningsTab, navigate }) => {
  const earningsData = [
    { time: '6am', earning: 0, outstanding: 0 }, { time: '7am', earning: 2, outstanding: 0 },
    { time: '8am', earning: 5, outstanding: 1 }, { time: '9am', earning: 8, outstanding: 2 },
    { time: '10am', earning: 12, outstanding: 3 }, { time: '11am', earning: 15, outstanding: 2 },
    { time: '12pm', earning: 18, outstanding: 1 }, { time: '1pm', earning: 25, outstanding: 2 },
    { time: '2pm', earning: 35, outstanding: 3 }, { time: '3pm', earning: 42, outstanding: 2 },
    { time: '4pm', earning: 55, outstanding: 4 }, { time: '5pm', earning: analytics?.earnings?.total || 66.8, outstanding: 3 },
  ];

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {/* Admin Earnings Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800 text-base">Admin Earnings</h3>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {['today', 'total'].map((t) => (
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
  );
};

export default EarningsScheduledPanel;
