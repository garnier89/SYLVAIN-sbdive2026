import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users, MapPin, Clock, Gavel, CalendarBlank, Percent, Warning } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const KpiCard = ({ icon: Icon, color, label, value, sub, testid }) => (
  <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm" data-testid={testid}>
    <div className="flex items-center gap-2 mb-2">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}1A` }}>
        <Icon size={18} weight="fill" style={{ color }} />
      </div>
      <span className="text-xs font-semibold text-gray-500">{label}</span>
    </div>
    <p className="text-2xl font-black text-gray-900">{value}</p>
    {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

const AdminNoDriverStats = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(7);
  const [alerts, setAlerts] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/reports/no-driver-stats?days=${period}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      setData(await res.json());
    } catch (err) { toast.error('Erreur de chargement du rapport'); }
    finally { setLoading(false); }
  }, [period]);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/zone-alerts`, { credentials: 'include' });
      if (res.ok) { const d = await res.json(); setAlerts(d.alerts || []); }
    } catch { /* non-blocking */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    loadAlerts();
    const id = setInterval(loadAlerts, 15000);
    return () => clearInterval(id);
  }, [loadAlerts]);

  const activateBonus = async (alertId) => {
    try {
      const res = await fetch(`${API}/api/admin/zone-alerts/${alertId}/bonus`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      toast.success(`Prime de ${d.bonus_amount} € activée sur ${d.zone}`);
      loadAlerts();
    } catch { toast.error('Activation de la prime impossible'); }
  };

  const dismissAlert = async (alertId) => {
    try {
      await fetch(`${API}/api/admin/zone-alerts/${alertId}/dismiss`, { method: 'POST', credentials: 'include' });
      loadAlerts();
    } catch { toast.error('Impossible d\'ignorer l\'alerte'); }
  };

  if (loading) return <div className="p-8 text-center text-gray-500" data-testid="nodriver-loading">Chargement du rapport...</div>;
  if (!data) return <div className="p-8 text-center text-gray-500">Aucune donnée</div>;

  return (
    <div className="p-6" data-testid="admin-no-driver-stats">
      {/* Live zone alerts banner */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-2" data-testid="zone-alerts-banner">
          {alerts.map((a) => {
            const bonusActive = a.bonus_active;
            return (
              <div key={a.id} className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3" data-testid={`zone-alert-${a.zone}`}>
                <Warning size={22} weight="fill" className="text-red-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-red-800">
                    Pénurie de chauffeurs · {a.zone} <span className="font-semibold text-red-500">({a.count} courses sans chauffeur)</span>
                  </p>
                  {bonusActive ? (
                    <p className="text-[11px] text-emerald-700 font-semibold">Prime active : +{a.bonus_amount} € (jusqu'à {new Date(a.bonus_active_until).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})</p>
                  ) : (
                    <p className="text-[11px] text-red-500">Seuil dépassé ({a.threshold}) sur {a.window_minutes} min</p>
                  )}
                </div>
                {!bonusActive && (
                  <button onClick={() => activateBonus(a.id)} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold whitespace-nowrap hover:bg-emerald-600" data-testid={`activate-bonus-${a.zone}`}>
                    Activer une prime
                  </button>
                )}
                <button onClick={() => dismissAlert(a.id)} className="px-2 py-1.5 rounded-lg text-gray-400 hover:text-gray-600 text-xs font-semibold" data-testid={`dismiss-alert-${a.zone}`}>
                  Ignorer
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Users size={28} className="text-blue-500" weight="fill" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Courses sans chauffeur</h1>
            <p className="text-xs text-gray-500">Courses passées en enchères ou planifiées après plusieurs relances — par zone et créneau</p>
          </div>
        </div>
        <div className="flex gap-2">
          {[7, 14, 30, 90].map(d => (
            <button key={d} onClick={() => setPeriod(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${period === d ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
              data-testid={`period-${d}`}>
              {d}j
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={Percent} color="#3B82F6" label="Taux sans chauffeur" value={`${data.no_driver_rate}%`} sub={`${data.no_driver_total} / ${data.total_rides} courses`} testid="kpi-rate" />
        <KpiCard icon={Users} color="#0EA5E9" label="Total sans chauffeur" value={data.no_driver_total} sub={`sur ${period} jours`} testid="kpi-total" />
        <KpiCard icon={Gavel} color="#10B981" label="Passées en enchères" value={data.converted_bidding} sub="« Proposer votre tarif »" testid="kpi-bidding" />
        <KpiCard icon={CalendarBlank} color="#F59E0B" label="Planifiées" value={data.scheduled} sub="« Planifier le trajet »" testid="kpi-scheduled" />
      </div>

      {/* By time slot */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm mb-6" data-testid="slots-chart">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={20} className="text-amber-500" weight="fill" />
          <h2 className="font-bold text-gray-800">Par créneau horaire</h2>
        </div>
        {data.slots.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">Aucune donnée sur la période</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.slots}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="slot" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="bidding" name="Enchères" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="scheduled" name="Planifiées" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* By zone */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm" data-testid="zones-table">
        <div className="flex items-center gap-2 mb-4">
          <MapPin size={20} className="text-rose-500" weight="fill" />
          <h2 className="font-bold text-gray-800">Par zone (pénurie de chauffeurs)</h2>
        </div>
        {data.zones.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">Aucune donnée sur la période</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-2 font-semibold">Zone</th>
                  <th className="py-2 font-semibold text-right">Total</th>
                  <th className="py-2 font-semibold text-right">Enchères</th>
                  <th className="py-2 font-semibold text-right">Planifiées</th>
                </tr>
              </thead>
              <tbody>
                {data.zones.map((z) => (
                  <tr key={z.zone} className="border-b border-gray-50" data-testid={`zone-row-${z.zone}`}>
                    <td className="py-2.5 font-semibold text-gray-800">{z.zone}</td>
                    <td className="py-2.5 text-right font-bold text-gray-900">{z.total}</td>
                    <td className="py-2.5 text-right text-emerald-600 font-semibold">{z.bidding}</td>
                    <td className="py-2.5 text-right text-amber-600 font-semibold">{z.scheduled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminNoDriverStats;
