import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

/**
 * Generic report chart driven by the backend `chart` payload:
 *   { type:'line'|'bar', x:'<key>', title, series:[{key,label,color}], data:[...] }
 */
export const ReportChart = ({ chart }) => {
  if (!chart || !Array.isArray(chart.data) || chart.data.length === 0) return null;
  const { type, x, title, series = [], data } = chart;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4" data-testid="report-chart">
      {title && <p className="text-sm font-semibold text-gray-700 mb-3">{title}</p>}
      <ResponsiveContainer width="100%" height={260}>
        {type === 'line' ? (
          <LineChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey={x} tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label}
                stroke={s.color} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
            ))}
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey={x} tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={data.length > 5 ? -20 : 0} textAnchor={data.length > 5 ? 'end' : 'middle'} height={data.length > 5 ? 50 : 30} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} cursor={{ fill: '#f8fafc' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={60} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default ReportChart;
