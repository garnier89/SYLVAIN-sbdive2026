/**
 * Generic landing page for each panel.
 * Shows quick stats + shortcuts to the most-used pages of the panel.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PANEL_CONFIGS } from './panelConfigs';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { ArrowRight, CheckCircle } from '@phosphor-icons/react';

export default function PanelHome({ panelKey }) {
  const config = PANEL_CONFIGS[panelKey];
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/admin/stats').then(r => setStats(r.data)).catch(() => {});
  }, []);

  if (!config) return null;

  // Pick first 4 items across all sections (excluding the home item)
  const shortcuts = config.sidebar
    .flatMap(s => s.items)
    .filter(it => it.path !== config.home_path)
    .slice(0, 6);

  return (
    <div className="p-8" data-testid={`panel-${panelKey}-home`}>
      <div className="max-w-7xl mx-auto">
        <div
          className="rounded-2xl p-8 mb-8 text-white shadow-xl"
          style={{ background: `linear-gradient(135deg, ${config.brand_color}, ${config.brand_color}DD)` }}
        >
          <div className="flex items-center gap-2 text-sm opacity-80 mb-2">
            <CheckCircle size={16} weight="fill" /> Bienvenue, {user?.name || 'Utilisateur'}
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-2" data-testid="panel-home-title">{config.title}</h1>
          <p className="text-lg opacity-90">Tableau de bord {config.role_label.toLowerCase()}.</p>
        </div>

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Utilisateurs" value={stats.total_users ?? '—'} />
            <StatCard label="Chauffeurs" value={stats.total_drivers ?? '—'} />
            <StatCard label="Courses totales" value={stats.total_rides ?? '—'} />
            <StatCard label="Revenus" value={stats.total_revenue ? `${stats.total_revenue.toFixed(2)} €` : '—'} />
          </div>
        )}

        <h2 className="text-xl font-bold mb-4 text-gray-800">Accès rapide</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shortcuts.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition group flex items-center gap-4"
              data-testid={`shortcut-${item.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white" style={{ background: config.brand_color }}>
                <item.icon size={22} weight="duotone" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{item.label}</p>
              </div>
              <ArrowRight size={18} className="text-gray-400 group-hover:translate-x-1 transition" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

const StatCard = ({ label, value }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5">
    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{label}</p>
    <p className="text-3xl font-black text-gray-800 mt-2">{value}</p>
  </div>
);
