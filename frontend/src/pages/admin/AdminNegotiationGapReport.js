import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendUp, TrendDown, ChartLineUp, HandCoins, MapPin, Car, Percent, ArrowsDownUp } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminNegotiationGapReport = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/reports/negotiation-gap?days=${period}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      setReport(await res.json());
    } catch (err) { toast.error('Erreur de chargement du rapport'); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-8 text-center text-gray-500" data-testid="report-loading">Chargement du rapport...</div>;
  if (!report) return <div className="p-8 text-center text-gray-500">Aucune donnee</div>;

  const avgGap = report.avg_gap_abs || 0;
  const avgGapPct = report.avg_gap_pct || 0;
  const isPositive = avgGap > 0;

  return (
    <div className="p-6" data-testid="admin-negotiation-gap">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ChartLineUp size={28} className="text-indigo-500" weight="fill" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Rapport d'ecart de negociation</h1>
            <p className="text-xs text-gray-500">Ecart entre le prix propose par les passagers et le prix accepte par les chauffeurs</p>
          </div>
        </div>
        <div className="flex gap-2">
          {[7, 14, 30, 90].map(d => (
            <button key={d} onClick={() => setPeriod(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${period === d ? 'bg-indigo-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
              data-testid={`period-${d}`}>
              {d}j
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={ArrowsDownUp} color="#6366F1" label="Courses negociees" value={report.total_rides} sub={`${report.negotiated_count} contre-offres acceptees`} testid="kpi-total" />
        <KpiCard
          icon={isPositive ? TrendUp : TrendDown}
          color={isPositive ? '#EF4444' : '#10B981'}
          label="Ecart moyen"
          value={`${avgGap >= 0 ? '+' : ''}${avgGap.toFixed(2)} EUR`}
          sub={`${avgGapPct >= 0 ? '+' : ''}${avgGapPct.toFixed(1)}% vs offre client`}
          testid="kpi-avg-gap"
        />
        <KpiCard icon={HandCoins} color="#F59E0B" label="Total ecart" value={`${report.total_revenue_gap >= 0 ? '+' : ''}${report.total_revenue_gap.toFixed(2)} EUR`} sub="Ecart de revenus total" testid="kpi-revenue-gap" />
        <KpiCard icon={Percent} color="#10B981" label="Taux acceptation direct" value={`${report.total_rides ? Math.round(report.accepted_at_offer_count / report.total_rides * 100) : 0}%`} sub="Chauffeurs qui acceptent sans negocier" testid="kpi-direct-rate" />
      </div>

      {/* Daily Trend */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ChartLineUp size={16} />Evolution quotidienne (Prix propose vs Prix accepte)</CardTitle></CardHeader>
        <CardContent>
          {report.daily.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Pas encore de donnees pour cette periode</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={report.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="day" stroke="#6B7280" style={{ fontSize: '11px' }} />
                <YAxis stroke="#6B7280" style={{ fontSize: '11px' }} />
                <Tooltip contentStyle={{ background: '#1F2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="avg_proposed" name="Offre client moyenne" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="avg_accepted" name="Prix accepte moyen" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="avg_gap" name="Ecart moyen" stroke="#EF4444" strokeWidth={2} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Zones + Vehicles grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><MapPin size={16} />Ecart par zone</CardTitle></CardHeader>
          <CardContent>
            {report.zones.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Aucune donnee</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={report.zones} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis type="number" stroke="#6B7280" style={{ fontSize: '11px' }} />
                    <YAxis dataKey="zone" type="category" stroke="#6B7280" width={90} style={{ fontSize: '11px' }} />
                    <Tooltip contentStyle={{ background: '#1F2937', border: 'none', borderRadius: '8px', color: '#fff' }} formatter={(v) => `${v} EUR`} />
                    <Bar dataKey="avg_gap" name="Ecart moyen (EUR)" fill="#6366F1" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-1">
                  {report.zones.slice(0, 5).map(z => (
                    <div key={z.zone} className="flex items-center justify-between text-xs px-2 py-1.5 bg-gray-50 rounded-lg" data-testid={`zone-row-${z.zone}`}>
                      <span className="font-semibold text-gray-700">{z.zone}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500">{z.count} courses</span>
                        <Badge className={z.avg_gap >= 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}>
                          {z.avg_gap >= 0 ? '+' : ''}{z.avg_gap.toFixed(2)} EUR ({z.avg_gap_pct >= 0 ? '+' : ''}{z.avg_gap_pct.toFixed(1)}%)
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Car size={16} />Ecart par type de vehicule</CardTitle></CardHeader>
          <CardContent>
            {report.vehicles.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Aucune donnee</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={report.vehicles}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="vehicle" stroke="#6B7280" style={{ fontSize: '11px' }} />
                    <YAxis stroke="#6B7280" style={{ fontSize: '11px' }} />
                    <Tooltip contentStyle={{ background: '#1F2937', border: 'none', borderRadius: '8px', color: '#fff' }} formatter={(v) => `${v} EUR`} />
                    <Bar dataKey="avg_gap" name="Ecart moyen (EUR)" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-1">
                  {report.vehicles.map(v => (
                    <div key={v.vehicle} className="flex items-center justify-between text-xs px-2 py-1.5 bg-gray-50 rounded-lg">
                      <span className="font-semibold text-gray-700 capitalize">{v.vehicle}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500">{v.count} courses</span>
                        <Badge className={v.avg_gap >= 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}>
                          {v.avg_gap >= 0 ? '+' : ''}{v.avg_gap.toFixed(2)} EUR
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Samples Table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Derniers echantillons (max 20)</CardTitle></CardHeader>
        <CardContent>
          {report.samples.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Pas encore de courses negociees sur cette periode</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold text-gray-600">Date</th>
                    <th className="text-left px-3 py-2 font-bold text-gray-600">Zone</th>
                    <th className="text-left px-3 py-2 font-bold text-gray-600">Vehicule</th>
                    <th className="text-right px-3 py-2 font-bold text-gray-600">Offre client</th>
                    <th className="text-right px-3 py-2 font-bold text-gray-600">Prix accepte</th>
                    <th className="text-right px-3 py-2 font-bold text-gray-600">Ecart</th>
                    <th className="text-center px-3 py-2 font-bold text-gray-600">Negocie</th>
                  </tr>
                </thead>
                <tbody>
                  {report.samples.map(s => (
                    <tr key={s.ride_id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`sample-${s.ride_id}`}>
                      <td className="px-3 py-2 text-gray-600">{(s.created_at || '').slice(0, 10)}</td>
                      <td className="px-3 py-2 text-gray-700">{s.zone}</td>
                      <td className="px-3 py-2 text-gray-700 capitalize">{s.vehicle_type}</td>
                      <td className="px-3 py-2 text-right text-gray-800">{s.proposed.toFixed(2)} EUR</td>
                      <td className="px-3 py-2 text-right font-bold text-gray-800">{s.accepted.toFixed(2)} EUR</td>
                      <td className={`px-3 py-2 text-right font-bold ${s.gap_abs >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {s.gap_abs >= 0 ? '+' : ''}{s.gap_abs.toFixed(2)} ({s.gap_pct >= 0 ? '+' : ''}{s.gap_pct.toFixed(1)}%)
                      </td>
                      <td className="px-3 py-2 text-center">
                        {s.negotiated ? <Badge className="bg-indigo-100 text-indigo-700">Oui</Badge> : <Badge className="bg-green-100 text-green-700">Direct</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const KpiCard = ({ icon: Icon, color, label, value, sub, testid }) => (
  <Card data-testid={testid}>
    <CardContent className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '20' }}>
          <Icon size={18} weight="duotone" style={{ color }} />
        </div>
        <span className="text-[10px] font-bold text-gray-500 uppercase">{label}</span>
      </div>
      <p className="text-2xl font-black text-gray-800 mb-1">{value}</p>
      <p className="text-[10px] text-gray-500">{sub}</p>
    </CardContent>
  </Card>
);

export default AdminNegotiationGapReport;
