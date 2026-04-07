import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { CurrencyEur, TrendUp, Car, ArrowRight } from '@phosphor-icons/react';

const AdminRevenue = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('today');

  useEffect(() => { loadRevenue(); }, []);

  const loadRevenue = async () => {
    try { const r = await adminAPI.revenue(); setData(r.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-2 border-[#FF4500]/30 border-t-[#FF4500] rounded-full animate-spin" />
      </div>
    );
  }

  const periods = {
    today: { label: "Aujourd'hui", d: data?.today },
    week: { label: 'Cette semaine', d: data?.week },
    month: { label: 'Ce mois', d: data?.month },
    all_time: { label: 'Total', d: data?.all_time },
  };
  const current = periods[tab]?.d || { total: 0, commission: 0, rides: 0 };

  return (
    <div className="p-5 lg:p-6 space-y-5" data-testid="admin-revenue-page">
      <div>
        <h1 className="text-2xl font-bold text-white">Revenus & Commissions</h1>
        <p className="text-gray-500 text-sm">Suivi financier de la plateforme</p>
      </div>

      {/* Total Card */}
      <div className="bg-gradient-to-br from-[#FF4500] to-[#FF6B35] rounded-2xl p-6">
        <p className="text-white/80 text-sm font-medium">Revenus totaux (toutes periodes)</p>
        <p className="text-4xl font-bold text-white mt-2" data-testid="total-revenue">
          {(data?.all_time?.total || 0).toFixed(2)} &euro;
        </p>
        <div className="flex items-center gap-6 mt-3">
          <div>
            <p className="text-white/60 text-xs">Commissions</p>
            <p className="text-white font-bold">{(data?.all_time?.commission || 0).toFixed(2)} &euro;</p>
          </div>
          <div>
            <p className="text-white/60 text-xs">Courses completees</p>
            <p className="text-white font-bold">{data?.all_time?.rides || 0}</p>
          </div>
        </div>
      </div>

      {/* Period Tabs */}
      <div className="flex gap-2">
        {Object.entries(periods).map(([key, val]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
              tab === key ? 'bg-[#FF4500] text-white' : 'bg-[#161923] text-gray-400 border border-gray-800'}`}
            data-testid={`tab-${key}`}>
            {val.label}
          </button>
        ))}
      </div>

      {/* Period Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#161923] border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{current.total.toFixed(2)} &euro;</p>
          <p className="text-gray-500 text-xs mt-1">Revenus</p>
        </div>
        <div className="bg-[#161923] border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{current.commission.toFixed(2)} &euro;</p>
          <p className="text-gray-500 text-xs mt-1">Commissions</p>
        </div>
        <div className="bg-[#161923] border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{current.rides}</p>
          <p className="text-gray-500 text-xs mt-1">Courses</p>
        </div>
      </div>

      {/* Recent Transactions */}
      <div>
        <h3 className="text-white font-semibold text-sm mb-3">Transactions recentes</h3>
        <div className="space-y-2">
          {(!data?.recent_transactions || data.recent_transactions.length === 0) ? (
            <div className="bg-[#161923] border border-gray-800 rounded-xl p-8 text-center">
              <CurrencyEur size={36} className="text-gray-700 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Aucune transaction</p>
            </div>
          ) : data.recent_transactions.map((t, i) => (
            <div key={i} className="bg-[#161923] border border-gray-800 rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <Car size={16} className="text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{t.pickup_address || 'Course'} &rarr; {t.dropoff_address || ''}</p>
                <p className="text-gray-600 text-[10px]">{t.created_at ? new Date(t.created_at).toLocaleString('fr-FR') : ''}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-white font-bold text-xs">{(t.final_fare || t.estimated_fare || 0).toFixed(2)} &euro;</p>
                <p className="text-emerald-400 text-[10px]">+{((t.final_fare || t.estimated_fare || 0) * (t.commission_percent || 10) / 100).toFixed(2)} &euro;</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminRevenue;
