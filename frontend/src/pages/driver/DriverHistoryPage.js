import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { driverAPI } from '../../services/api';
import { DriverBottomNav } from './DriverProfilePage';
import { Car, MapPin, Clock, CheckCircle, XCircle, ArrowRight, ArrowLeft } from '@phosphor-icons/react';

const ACTIVE_STATUSES = ['accepted', 'arriving', 'in_progress'];

const statusLabels = {
  completed: { label: 'Termin\u00e9e', color: 'text-emerald-400', bg: 'bg-emerald-500/10', Icon: CheckCircle },
  cancelled: { label: 'Annul\u00e9e', color: 'text-red-400', bg: 'bg-red-500/10', Icon: XCircle },
  pending: { label: 'En attente', color: 'text-amber-400', bg: 'bg-amber-500/10', Icon: Clock },
  accepted: { label: 'Accept\u00e9e', color: 'text-blue-400', bg: 'bg-blue-500/10', Icon: Car },
  arriving: { label: 'En route', color: 'text-blue-400', bg: 'bg-blue-500/10', Icon: ArrowRight },
  in_progress: { label: 'En cours', color: 'text-amber-400', bg: 'bg-amber-500/10', Icon: Car },
};

const DriverHistoryPage = () => {
  const navigate = useNavigate();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    try {
      const res = await driverAPI.getRideHistory();
      setRides(res.data.rides || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const filtered = rides.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'in_progress') return ACTIVE_STATUSES.includes(r.status);
    return r.status === filter;
  });

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-12 h-12 border-3 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-950 flex flex-col pb-20" data-testid="driver-history-page">
      <div className="px-5 pt-6 pb-2 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center flex-shrink-0" data-testid="back-btn" aria-label="Retour">
          <ArrowLeft size={18} className="text-white" />
        </button>
        <h1 className="text-2xl font-bold text-white" data-testid="history-title">Mes courses</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-2 px-5 mt-2 overflow-x-auto no-scrollbar pb-2">
        {[{ key: 'all', label: 'Toutes' }, { key: 'completed', label: 'Termin\u00e9es' }, { key: 'cancelled', label: 'Annul\u00e9es' }, { key: 'in_progress', label: 'En cours' }].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              filter === f.key ? 'bg-amber-500 text-white' : 'bg-gray-800 text-gray-400'}`}
            data-testid={`filter-${f.key}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Rides List */}
      <div className="px-5 mt-4 space-y-2 flex-1">
        {filtered.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center mt-4">
            <Car size={48} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">Aucune course</p>
            <p className="text-gray-600 text-sm mt-1">Passez en ligne pour recevoir des courses</p>
          </div>
        ) : (
          filtered.map((ride, i) => {
            const s = statusLabels[ride.status] || statusLabels.pending;
            const isActive = ACTIVE_STATUSES.includes(ride.status);
            return (
              <div key={ride.id || i}
                onClick={isActive ? () => navigate('/chauffeur/home') : undefined}
                className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${isActive ? 'cursor-pointer ring-1 ring-amber-500/40 active:scale-[0.99] transition-transform' : ''}`}
                data-testid={`ride-card-${i}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${s.bg}`}>
                    <s.Icon size={12} weight="fill" className={s.color} />
                    <span className={`text-xs font-bold ${s.color}`}>{s.label}</span>
                  </div>
                  <span className="text-amber-500 font-bold text-sm">
                    {(ride.estimated_fare || 0).toFixed(2)} &euro;
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center mt-0.5 flex-shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    </div>
                    <p className="text-white text-sm truncate">{ride.pickup_address || 'D\u00e9part'}</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center mt-0.5 flex-shrink-0">
                      <MapPin size={10} className="text-red-400" />
                    </div>
                    <p className="text-gray-400 text-sm truncate">{ride.dropoff_address || 'Arriv\u00e9e'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                  {ride.distance_km && <span>{ride.distance_km.toFixed(1)} km</span>}
                  {ride.duration_mins && <span>{ride.duration_mins} min</span>}
                  {ride.created_at && <span className="ml-auto">{new Date(ride.created_at).toLocaleDateString('fr-FR')}</span>}
                </div>
              </div>
            );
          })
        )}
      </div>

      <DriverBottomNav active="history" navigate={navigate} />
    </div>
  );
};

export default DriverHistoryPage;
