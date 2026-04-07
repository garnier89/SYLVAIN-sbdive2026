import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import {
  Users, Car, CurrencyEur, MapPin, Clock, Headset,
  TrendUp, ArrowRight, CaretUp, Lightning
} from '@phosphor-icons/react';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    try { const r = await adminAPI.dashboard(); setStats(r.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="bg-[#161923] border border-gray-800 rounded-xl p-5 animate-pulse">
              <div className="h-4 bg-gray-800 rounded w-1/2 mb-4" />
              <div className="h-8 bg-gray-800 rounded w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const cards = stats ? [
    { icon: Users, label: 'Utilisateurs', value: stats.total_users, color: 'from-blue-500 to-blue-600', change: '+12%' },
    { icon: Car, label: 'Chauffeurs', value: stats.total_drivers, sub: `${stats.active_drivers} en ligne`, color: 'from-emerald-500 to-emerald-600' },
    { icon: MapPin, label: "Courses aujourd'hui", value: stats.today_rides, color: 'from-amber-500 to-amber-600' },
    { icon: CurrencyEur, label: "Revenus du jour", value: `${stats.today_revenue.toFixed(2)} \u20ac`, color: 'from-[#FF4500] to-[#FF6B35]' },
    { icon: Clock, label: 'Chauffeurs en attente', value: stats.pending_drivers, color: 'from-yellow-500 to-yellow-600', alert: stats.pending_drivers > 0 },
    { icon: Headset, label: 'Tickets ouverts', value: stats.open_tickets, color: 'from-red-500 to-red-600', alert: stats.open_tickets > 0 },
  ] : [];

  return (
    <div className="p-5 lg:p-6 space-y-6" data-testid="admin-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white" data-testid="dashboard-title">Dashboard</h1>
          <p className="text-gray-500 text-sm">Vue d'ensemble de la plateforme SB Drive</p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-full text-xs font-medium">
          <Lightning size={14} weight="fill" /> En ligne
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((card, i) => (
          <div key={i} className={`relative bg-[#161923] border rounded-xl p-5 overflow-hidden transition-all hover:border-gray-700 ${
            card.alert ? 'border-amber-500/30' : 'border-gray-800'}`}
            data-testid={`kpi-${i}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">{card.label}</p>
                <p className="text-3xl font-bold text-white mt-2">{card.value}</p>
                {card.sub && <p className="text-emerald-400 text-xs mt-1 font-medium">{card.sub}</p>}
                {card.change && (
                  <div className="flex items-center gap-1 mt-1 text-emerald-400 text-xs">
                    <CaretUp size={10} weight="bold" /> {card.change}
                  </div>
                )}
              </div>
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center flex-shrink-0`}>
                <card.icon size={22} className="text-white" weight="duotone" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pending Drivers */}
        <div className="bg-[#161923] border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold text-sm">Approbations en attente</h3>
            <button onClick={() => navigate('/admin/drivers')}
              className="text-[#FF4500] text-xs font-medium flex items-center gap-1 hover:underline" data-testid="go-drivers-btn">
              Voir tout <ArrowRight size={12} />
            </button>
          </div>
          {stats?.pending_drivers > 0 ? (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Clock size={20} className="text-amber-500" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">{stats.pending_drivers} chauffeur(s) en attente</p>
                <p className="text-gray-500 text-xs">Demandes a examiner et approuver</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-600 text-sm text-center py-4">Aucune approbation en attente</p>
          )}
        </div>

        {/* Support Tickets */}
        <div className="bg-[#161923] border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold text-sm">Support</h3>
            <button onClick={() => navigate('/admin/support')}
              className="text-[#FF4500] text-xs font-medium flex items-center gap-1 hover:underline" data-testid="go-support-btn">
              Voir tout <ArrowRight size={12} />
            </button>
          </div>
          {stats?.open_tickets > 0 ? (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <Headset size={20} className="text-red-400" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">{stats.open_tickets} ticket(s) ouverts</p>
                <p className="text-gray-500 text-xs">Necessitent une reponse</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-600 text-sm text-center py-4">Aucun ticket ouvert</p>
          )}
        </div>
      </div>

      {/* Platform Stats */}
      <div className="bg-[#161923] border border-gray-800 rounded-xl p-5">
        <h3 className="text-white font-semibold text-sm mb-4">Statistiques rapides</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#0f1117] rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-white">{stats?.total_users || 0}</p>
            <p className="text-gray-500 text-xs mt-1">Clients</p>
          </div>
          <div className="bg-[#0f1117] rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-white">{stats?.total_drivers || 0}</p>
            <p className="text-gray-500 text-xs mt-1">Chauffeurs</p>
          </div>
          <div className="bg-[#0f1117] rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-white">{stats?.today_rides || 0}</p>
            <p className="text-gray-500 text-xs mt-1">Courses / jour</p>
          </div>
          <div className="bg-[#0f1117] rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{stats?.today_revenue?.toFixed(2) || '0.00'} &euro;</p>
            <p className="text-gray-500 text-xs mt-1">Revenu / jour</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
