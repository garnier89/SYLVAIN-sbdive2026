import React from 'react';
import { CurrencyEur, MapPin } from '@phosphor-icons/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const periodLabel = (period) =>
  period === 'today' ? "Aujourd'hui" : period === 'week' ? '7 jours' : period === 'month' ? '30 jours' : 'Total';

/** Revenue-by-service bar chart + Top zones/cities ranking (real V3Cube data). */
export const DashboardBreakdown = ({ breakdown, period }) => (
  <div className="grid lg:grid-cols-2 gap-5" data-testid="analytics-breakdown">
    <div className="bg-white rounded-xl border border-gray-200 p-4" data-testid="revenue-by-service-card">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-gray-800 text-base">Revenus par service</h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full" data-testid="revenue-period-badge">
            {periodLabel(period)}
          </span>
          <CurrencyEur size={20} className="text-green-500" weight="duotone" />
        </div>
      </div>
      <p className="text-3xl font-black text-gray-900 mb-3" data-testid="total-revenue">
        {(breakdown?.total_revenue ?? 0).toLocaleString('fr-FR')} €
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={breakdown?.revenue_by_service || []} layout="vertical" margin={{ left: 10, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
          <YAxis type="category" dataKey="service" tick={{ fontSize: 11, fill: '#6B7280' }} width={90} />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '11px' }}
            formatter={(value, name, p) => [`${Number(value).toLocaleString('fr-FR')} € (${p.payload.count} cmd)`, 'Revenu']}
          />
          <Bar dataKey="revenue" radius={[0, 4, 4, 0]} name="Revenu">
            {(breakdown?.revenue_by_service || []).map((entry) => <Cell key={entry.service} fill={entry.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>

    <div className="bg-white rounded-xl border border-gray-200 p-4" data-testid="top-zones-card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-gray-800 text-base">Top zones / villes</h3>
          <p className="text-xs text-gray-500">Classement par volume de courses</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full" data-testid="zones-period-badge">
            {periodLabel(period)}
          </span>
          <MapPin size={20} className="text-[#3B82F6]" weight="duotone" />
        </div>
      </div>
      <div className="space-y-2 max-h-[260px] overflow-y-auto">
        {(breakdown?.top_zones || []).length === 0 ? (
          <p className="text-center text-gray-400 text-xs py-8">Aucune donnée de zone</p>
        ) : (
          (breakdown?.top_zones || []).map((z, i) => {
            const max = breakdown.top_zones[0]?.rides || 1;
            return (
              <div key={z.city} className="flex items-center gap-3" data-testid={`top-zone-${i}`}>
                <span className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${i < 3 ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{z.city}</p>
                    <p className="text-xs text-gray-500 whitespace-nowrap ml-2">{z.rides} courses · {Number(z.revenue).toLocaleString('fr-FR')} €</p>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#3B82F6] rounded-full" style={{ width: `${Math.max(6, (z.rides / max) * 100)}%` }} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  </div>
);

export default DashboardBreakdown;
