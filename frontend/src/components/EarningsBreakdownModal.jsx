import React, { useEffect, useState } from 'react';
import { X, CurrencyEur, Calendar, TrendUp, Path } from '@phosphor-icons/react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const API = process.env.REACT_APP_BACKEND_URL;

const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const dayLabel = (iso) => {
  try { return WEEKDAYS[new Date(iso + 'T00:00:00').getDay()]; } catch { return iso?.slice(5); }
};

const EarningsBreakdownModal = ({ open, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${API}/api/drivers/my-earnings-breakdown`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const rows = [
    { key: 'today', label: "Aujourd'hui", icon: Calendar, color: '#3B82F6' },
    { key: 'week', label: 'Cette semaine', icon: TrendUp, color: '#10B981' },
    { key: 'month', label: 'Ce mois-ci', icon: CurrencyEur, color: '#F59E0B' },
  ];

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
      data-testid="earnings-breakdown-modal"
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-[#FF4500] to-[#FF6A33] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CurrencyEur size={20} weight="fill" />
            <h3 className="font-bold text-base">Mes revenus</h3>
          </div>
          <button onClick={onClose} className="text-white/90 hover:text-white" data-testid="close-earnings-modal-btn">
            <X size={20} weight="bold" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {loading ? (
            <p className="text-center text-gray-400 text-sm py-8">Chargement...</p>
          ) : !data ? (
            <p className="text-center text-gray-400 text-sm py-8">Impossible de charger les revenus.</p>
          ) : (
            <>
            {rows.map((row) => {
              const r = data[row.key] || { earnings: 0, trips: 0 };
              const Icon = row.icon;
              return (
                <div key={row.key} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50" data-testid={`earnings-row-${row.key}`}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: row.color + '20' }}>
                    <Icon size={18} weight="fill" style={{ color: row.color }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">{row.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                      <Path size={10} /> {r.trips} course{r.trips > 1 ? 's' : ''}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">
                    {r.earnings.toFixed(2)} €
                  </p>
                </div>
              );
            })}
            {Array.isArray(data.daily_7d) && data.daily_7d.length > 0 && (
              <div className="pt-1" data-testid="earnings-7d-chart">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2 flex items-center gap-1.5">
                  <TrendUp size={14} weight="fill" className="text-emerald-500" /> 7 derniers jours
                </p>
                <div style={{ width: '100%', height: 130 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.daily_7d} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                      <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                        formatter={(v) => [`${Number(v).toFixed(2)} €`, 'Gains']}
                        labelFormatter={(d) => dayLabel(d)}
                        contentStyle={{ borderRadius: 10, border: '1px solid #eee', fontSize: 12 }}
                      />
                      <Bar dataKey="earnings" radius={[6, 6, 0, 0]} maxBarSize={28}>
                        {data.daily_7d.map((d, i) => (
                          <Cell key={i} fill={i === data.daily_7d.length - 1 ? '#FF4500' : '#FDBA8C'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 pb-4">
          <p className="text-[10px] text-gray-400 text-center">
            Revenus nets (après commission), calculés sur les courses terminées — semaine du lundi au dimanche.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EarningsBreakdownModal;
