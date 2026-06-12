import React, { useEffect, useState, useCallback } from 'react';
import { UsersThree, CurrencyEur, Path, Armchair, Star, SealCheck, ArrowClockwise } from '@phosphor-icons/react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { toast } from 'sonner';
import { carpoolAPI } from '../../services/api';

const money = (n, cur = 'EUR') => `${Number(n || 0).toFixed(2)} ${cur === 'EUR' ? '€' : cur}`;

const PRESETS = [
  { key: 'all', label: 'Tout' },
  { key: '7d', label: '7 jours' },
  { key: '30d', label: '30 jours' },
  { key: '90d', label: '90 jours' },
];

const isoDay = (d) => d.toISOString().slice(0, 10);
const rangeFor = (preset) => {
  if (preset === 'all') return {};
  const days = { '7d': 7, '30d': 30, '90d': 90 }[preset] || 30;
  const to = new Date();
  const from = new Date(Date.now() - days * 86400000);
  return { date_from: isoDay(from), date_to: isoDay(to) };
};

const KpiCard = ({ icon: Icon, label, value, accent, testid }) => (
  <div className="bg-white rounded-2xl border border-gray-100 p-4" data-testid={testid}>
    <div className={`w-9 h-9 rounded-xl ${accent} flex items-center justify-center mb-2`}>
      <Icon size={18} weight="fill" className="text-white" />
    </div>
    <p className="text-2xl font-black text-gray-900 leading-none">{value}</p>
    <p className="text-xs text-gray-500 mt-1">{label}</p>
  </div>
);

const AdminCarpoolRevenue = () => {
  const [preset, setPreset] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((p) => {
    setLoading(true);
    carpoolAPI.adminRevenue(rangeFor(p))
      .then((r) => setData(r.data))
      .catch(() => toast.error('Chargement des revenus impossible'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(preset); }, [preset, load]);

  const cur = data?.currency || 'EUR';
  const k = data?.kpis || {};
  const chartData = (data?.daily || []).map((d) => ({
    date: d.date.slice(5),
    commission: d.commission,
    rides: d.rides,
  }));

  return (
    <div className="p-6 max-w-5xl" data-testid="admin-carpool-revenue">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <CurrencyEur size={22} className="text-emerald-600" weight="fill" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Revenus Covoiturage</h1>
            <p className="text-sm text-gray-500">
              Commissions plateforme {data ? `(${data.commission_percent}%)` : ''} · paiement séquestre SB Pay
            </p>
          </div>
        </div>
        <button onClick={() => load(preset)} data-testid="carpool-revenue-refresh"
          className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
          <ArrowClockwise size={18} />
        </button>
      </div>

      {/* Presets de période */}
      <div className="flex gap-2 mb-5">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => setPreset(p.key)} data-testid={`carpool-revenue-preset-${p.key}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              preset === p.key ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" /></div>
      ) : !data ? (
        <p className="text-gray-400">Aucune donnée.</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard icon={CurrencyEur} label="Commission encaissée" value={money(k.total_commission, cur)} accent="bg-emerald-500" testid="kpi-commission" />
            <KpiCard icon={CurrencyEur} label="Brut transité (séquestre)" value={money(k.total_gross, cur)} accent="bg-sky-500" testid="kpi-gross" />
            <KpiCard icon={UsersThree} label="Reversé aux chauffeurs" value={money(k.total_payout, cur)} accent="bg-violet-500" testid="kpi-payout" />
            <KpiCard icon={Path} label="Trajets terminés" value={k.rides_completed ?? 0} accent="bg-amber-500" testid="kpi-rides" />
            <KpiCard icon={Armchair} label="Places vendues" value={k.seats_sold ?? 0} accent="bg-rose-500" testid="kpi-seats" />
            <KpiCard icon={UsersThree} label="Chauffeurs actifs" value={k.active_drivers ?? 0} accent="bg-teal-500" testid="kpi-drivers" />
            <KpiCard icon={CurrencyEur} label="Commission moy. / trajet" value={money(k.avg_commission_per_ride, cur)} accent="bg-indigo-500" testid="kpi-avg" />
          </div>

          {/* Graphique commissions par jour */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6" data-testid="carpool-revenue-chart">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Commissions par jour</h2>
            {chartData.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">Pas encore de trajet terminé sur cette période.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cpComm" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v, n) => [n === 'commission' ? money(v, cur) : v, n === 'commission' ? 'Commission' : 'Trajets']} />
                  <Area type="monotone" dataKey="commission" stroke="#10b981" strokeWidth={2} fill="url(#cpComm)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top chauffeurs */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5" data-testid="carpool-revenue-top-drivers">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Top chauffeurs par commission générée</h2>
            {(data.top_drivers || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Aucun chauffeur sur cette période.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th className="py-2 pr-2">#</th>
                      <th className="py-2 pr-2">Chauffeur</th>
                      <th className="py-2 pr-2 text-right">Trajets</th>
                      <th className="py-2 pr-2 text-right">Places</th>
                      <th className="py-2 pr-2 text-right">Brut</th>
                      <th className="py-2 text-right">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_drivers.map((d, i) => (
                      <tr key={d.driver_id || i} className="border-b border-gray-50 last:border-b-0" data-testid={`top-driver-${i}`}>
                        <td className="py-2.5 pr-2 text-gray-400 font-bold">{i + 1}</td>
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center text-white text-xs font-bold">
                              {(d.driver_name || '?').charAt(0)}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800 leading-tight">{d.driver_name}</p>
                              {d.ratings_count > 0 && (
                                <span className="flex items-center gap-0.5 text-[11px] text-amber-500 font-bold">
                                  <Star size={10} weight="fill" /> {d.rating}
                                  {d.rating >= 4.7 && d.ratings_count >= 5 && (
                                    <SealCheck size={11} weight="fill" className="text-orange-500 ml-0.5" />
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-2 text-right text-gray-600">{d.rides}</td>
                        <td className="py-2.5 pr-2 text-right text-gray-600">{d.seats}</td>
                        <td className="py-2.5 pr-2 text-right text-gray-600">{money(d.gross, cur)}</td>
                        <td className="py-2.5 text-right font-bold text-emerald-600">{money(d.commission, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AdminCarpoolRevenue;
