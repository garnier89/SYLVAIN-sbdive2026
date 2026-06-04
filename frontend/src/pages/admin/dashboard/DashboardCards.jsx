/**
 * DashboardCards — composants de présentation du tableau de bord admin
 * (KPICard, EarningBox, ServiceMiniCard, BuySellRentCard). Extrait d'AdminDashboard.js.
 */
import React, { useState } from 'react';
import { TrendUp, ArrowRight, Car, Package, Storefront } from '@phosphor-icons/react';

export const KPICard = ({ icon: Icon, label, value, color, onClick }) => (
  <button onClick={onClick} className="bg-white rounded-xl border border-gray-100 p-4 text-left hover:shadow-md transition-all group" data-testid={`kpi-${label.toLowerCase()}`}>
    <div className="flex items-center justify-between mb-2">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '12' }}>
        <Icon size={20} style={{ color }} weight="duotone" />
      </div>
      <div className="flex items-center gap-0.5 text-xs font-medium text-green-600">
        <TrendUp size={12} /> +12%
      </div>
    </div>
    <p className="text-2xl font-bold text-gray-900">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
  </button>
);

export const EarningBox = ({ icon, label, sublabel, value, color }) => (
  <div className="bg-gray-50 rounded-xl p-3">
    <div className="flex items-center gap-2 mb-1">
      <span className="text-lg">{icon}</span>
      <div>
        <p className="text-xs font-bold text-gray-800">{label}</p>
        <p className="text-[9px] text-gray-400">{sublabel}</p>
      </div>
    </div>
    <p className={`text-lg font-bold ${color} text-right`}>{value}</p>
  </div>
);

export const ServiceMiniCard = ({ title, subtitle, stat1, stat2, tabs = [], onView, testId }) => {
  const [tab, setTab] = useState(tabs[0] || 'total');
  const Icon1 = stat1.icon, Icon2 = stat2.icon;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4" data-testid={testId}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
          <p className="text-[10px] text-gray-400">{subtitle}</p>
        </div>
        {tabs.length > 0 && (
          <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-2.5 py-1 rounded text-[10px] font-semibold capitalize ${tab === t ? 'bg-[#3b82f6] text-white' : 'text-gray-500'}`}>
                {t === 'today' ? "Aujourd'hui" : 'Total'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[stat1, stat2].map((s, i) => {
          const Ic = i === 0 ? Icon1 : Icon2;
          return (
            <div key={s.label} className="bg-gray-50 rounded-lg p-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ backgroundColor: s.color + '20' }}>
                <Ic size={16} style={{ color: s.color }} weight="fill" />
              </div>
              <p className="text-xl font-bold text-gray-900 tabular-nums">{s.value}</p>
              <p className="text-[10px] text-gray-500 leading-tight">{s.label}</p>
            </div>
          );
        })}
      </div>
      {onView && (
        <button onClick={onView} className="w-full mt-3 text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center justify-center gap-1" data-testid={`${testId}-view-all`}>
          Voir tout <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
};

export const BuySellRentCard = ({ onView }) => {
  const [tab, setTab] = useState('total');
  const cats = [
    { key: 'cars', label: 'Voitures', icon: Car, color: '#3B82F6' },
    { key: 'items', label: 'Objets généraux', icon: Package, color: '#F59E0B' },
    { key: 'realestate', label: 'Immobilier', icon: Storefront, color: '#EC4899' },
  ];
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4" data-testid="buy-sell-rent-card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-gray-800 text-sm">Acheter, Vendre & Louer</h3>
          <p className="text-[10px] text-gray-400">No. of posts</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
          {['today', 'total'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold ${tab === t ? 'bg-[#3b82f6] text-white' : 'text-gray-500'}`}>
              {t === 'today' ? "Aujourd'hui" : 'Total'}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {cats.map(c => {
          const Ic = c.icon;
          return (
            <div key={c.key} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: c.color + '20' }}>
                  <Ic size={14} style={{ color: c.color }} weight="fill" />
                </div>
                <span className="text-xs text-gray-700">{c.label}</span>
              </div>
              <span className="text-sm font-bold text-gray-900">0</span>
            </div>
          );
        })}
      </div>
      <button onClick={onView} className="w-full mt-3 text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center justify-center gap-1" data-testid="buy-sell-rent-view-all">
        Voir tout <ArrowRight size={12} />
      </button>
    </div>
  );
};
