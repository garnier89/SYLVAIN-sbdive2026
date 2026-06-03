/**
 * DriverEarningsStatsPage — V3Cube Pack B
 * Period filter (day/week/month) showing total earnings and bar chart of points.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChartBar, Clock, Coins } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const periodOptions = [
  { key: 'day', label: "Aujourd'hui" },
  { key: 'week', label: '7 jours' },
  { key: 'month', label: '30 jours' },
];

const DriverEarningsStatsPage = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState({ total: 0, count: 0, points: [], bucket: 'day' });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/driver-pro/earnings/stats?period=${period}`, { credentials: 'include' });
      if (r.ok) setData(await r.json());
    } catch (e) { console.warn('earnings load failed:', e?.message || e); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const maxValue = Math.max(...(data.points || []).map((p) => p.value), 1);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24" data-testid="earnings-stats-page">
      <div className="bg-gradient-to-br from-emerald-700 to-emerald-900 text-white px-4 pt-12 pb-6 rounded-b-3xl">
        <button onClick={() => navigate(-1)} className="mb-3" data-testid="back-button"><ArrowLeft size={24} /></button>
        <h1 className="text-xl font-bold flex items-center gap-2"><ChartBar size={22} /> Statistiques gains</h1>
        <p className="text-xs text-emerald-100 mt-1">Suivez vos revenus sur la période</p>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Period selector */}
        <div className="flex gap-2 bg-white p-1 rounded-xl shadow-sm" data-testid="period-selector">
          {periodOptions.map((opt) => (
            <button
              key={opt.key}
              data-testid={`period-${opt.key}`}
              onClick={() => setPeriod(opt.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${period === opt.key ? 'bg-emerald-600 text-white' : 'text-gray-500'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="card-total">
            <div className="flex items-center gap-2 text-emerald-700">
              <Coins size={18} />
              <span className="text-[11px] uppercase font-bold">Total</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.total?.toFixed(2)}€</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="card-count">
            <div className="flex items-center gap-2 text-blue-700">
              <Clock size={18} />
              <span className="text-[11px] uppercase font-bold">Courses</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.count}</p>
          </div>
        </div>

        {/* Bar chart */}
        <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="chart-container">
          <h3 className="font-bold text-gray-900 mb-3 text-sm">Évolution</h3>
          {loading && <p className="text-gray-400 text-center py-8 text-sm animate-pulse">Chargement...</p>}
          {!loading && (!data.points || data.points.length === 0) && (
            <p className="text-gray-400 text-center py-8 text-sm">Aucune course terminée sur la période.</p>
          )}
          {!loading && data.points?.length > 0 && (
            <div className="space-y-2">
              {data.points.map((p, idx) => (
                <div key={p.label} className="flex items-center gap-2" data-testid={`point-${idx}`}>
                  <span className="text-[10px] text-gray-500 w-16 font-mono">{p.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all"
                      style={{ width: `${(p.value / maxValue) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-gray-700 w-16 text-right">{p.value.toFixed(2)}€</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DriverEarningsStatsPage;
