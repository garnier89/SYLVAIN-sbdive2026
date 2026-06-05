import React from 'react';
import { Storefront, Package } from '@phosphor-icons/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

/** Store Deliveries + Delivery Genie/Runner monthly bar charts. */
export const DashboardDeliveryCharts = ({ delivery }) => (
  <div className="grid lg:grid-cols-2 gap-5" data-testid="delivery-analytics">
    <div className="bg-white rounded-xl border border-gray-200 p-4" data-testid="store-deliveries-card">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-gray-800 text-base">Store Deliveries</h3>
        <Storefront size={20} className="text-[#3B82F6]" weight="duotone" />
      </div>
      <p className="text-3xl font-black text-gray-900 mb-3" data-testid="store-deliveries-total">{delivery?.store_deliveries?.total ?? 0}</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={delivery?.store_deliveries?.monthly || []}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#9CA3AF' }} interval={1} />
          <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} allowDecimals={false} />
          <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '11px' }} />
          <Bar dataKey="count" name="Livraisons" fill="#3B82F6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>

    <div className="bg-white rounded-xl border border-gray-200 p-4" data-testid="delivery-genie-runner-card">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-gray-800 text-base">Delivery Genie / Runner</h3>
        <Package size={20} className="text-[#F59E0B]" weight="duotone" />
      </div>
      <p className="text-3xl font-black text-gray-900 mb-3" data-testid="delivery-genie-runner-total">{delivery?.delivery_genie_runner?.total ?? 0}</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={delivery?.delivery_genie_runner?.monthly || []}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#9CA3AF' }} interval={1} />
          <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} allowDecimals={false} />
          <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '11px' }} />
          <Legend wrapperStyle={{ fontSize: '10px' }} />
          <Bar dataKey="runner" name="Runner" fill="#3B82F6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="genie" name="Genie" fill="#F59E0B" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

export default DashboardDeliveryCharts;
